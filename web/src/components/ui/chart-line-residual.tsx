import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_RESIDUAL_WIDTH = 560;
export const DEFAULT_CHART_LINE_RESIDUAL_HEIGHT = 320;
export const DEFAULT_CHART_LINE_RESIDUAL_PADDING = 40;
export const DEFAULT_CHART_LINE_RESIDUAL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RESIDUAL_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_RESIDUAL_STEM_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_RESIDUAL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RESIDUAL_LINE_OPACITY = 0.8;
export const DEFAULT_CHART_LINE_RESIDUAL_STEM_OPACITY = 0.7;
export const DEFAULT_CHART_LINE_RESIDUAL_ZERO_DASH = '4 3';
export const DEFAULT_CHART_LINE_RESIDUAL_ZERO_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_RESIDUAL_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RESIDUAL_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RESIDUAL_BIAS_EPSILON = 0;
export const DEFAULT_CHART_LINE_RESIDUAL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RESIDUAL_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_RESIDUAL_PALETTE = [
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

export type ChartLineResidualSign = 'positive' | 'negative' | 'zero';
export type ChartLineResidualBias = 'positive' | 'negative' | 'unbiased';

export interface ChartLineResidualPoint {
  x: number;
  observed: number;
  predicted: number;
}

export interface ChartLineResidualSeries {
  id: string;
  label: string;
  data: readonly ChartLineResidualPoint[];
  color?: string;
  positiveColor?: string;
  negativeColor?: string;
}

export interface ChartLineResidualStats {
  finiteCount: number;
  meanResidual: number;
  mae: number;
  rmse: number;
  maxAbs: number;
  maxResidual: number;
  minResidual: number;
  bias: ChartLineResidualBias;
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
}

export interface ChartLineResidualLayoutPoint {
  index: number;
  x: number;
  observed: number;
  predicted: number;
  residual: number;
  px: number;
  py: number;
  stemY1: number;
  stemY2: number;
  sign: ChartLineResidualSign;
}

export interface ChartLineResidualLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  positiveColor: string;
  negativeColor: string;
  points: ChartLineResidualLayoutPoint[];
  path: string;
  stats: ChartLineResidualStats;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineResidualLayoutResult {
  series: ChartLineResidualLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zeroY: number;
  innerWidth: number;
  innerHeight: number;
  totalPoints: number;
  visibleSeriesCount: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineResidualPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineResidualPoint).x) &&
    isFiniteNumber((p as ChartLineResidualPoint).observed) &&
    isFiniteNumber((p as ChartLineResidualPoint).predicted)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineResidualDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_RESIDUAL_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_RESIDUAL_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_RESIDUAL_PALETTE.length
  ]!;
}

export function getLineResidualFinitePoints(
  points: readonly ChartLineResidualPoint[],
): ChartLineResidualPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Returns `observed - predicted`. Non-finite inputs collapse to `0`
 * (signalling "no residual computable").
 */
export function computeResidual(
  observed: number,
  predicted: number,
): number {
  if (!isFiniteNumber(observed) || !isFiniteNumber(predicted)) return 0;
  return observed - predicted;
}

/**
 * Returns the canonical residual sign for a value with optional
 * epsilon equality band. Non-finite -> `'zero'`.
 */
export function classifyLineResidualSign(
  residual: number,
  epsilon: number = 0,
): ChartLineResidualSign {
  if (!isFiniteNumber(residual)) return 'zero';
  const e = isFiniteNumber(epsilon) && epsilon >= 0 ? epsilon : 0;
  if (residual > e) return 'positive';
  if (residual < -e) return 'negative';
  return 'zero';
}

/**
 * Computes residual diagnostic statistics:
 *
 * - `meanResidual = Σ residual / n` (the **bias**: positive means
 *   the model is under-predicting, negative means over-predicting).
 * - `mae = Σ |residual| / n` (mean absolute error).
 * - `rmse = sqrt(Σ residual^2 / n)` (root mean square error).
 * - `maxAbs = max(|residual|)`.
 * - `bias` is `'positive' | 'negative' | 'unbiased'` after the
 *   epsilon equality band.
 *
 * Non-finite samples are dropped. Empty / non-array input -> all
 * zeros and `bias: 'unbiased'`.
 */
export function computeLineResidualStats(
  points: readonly ChartLineResidualPoint[] | undefined | null,
  biasEpsilon: number = 0,
): ChartLineResidualStats {
  const empty: ChartLineResidualStats = {
    finiteCount: 0,
    meanResidual: 0,
    mae: 0,
    rmse: 0,
    maxAbs: 0,
    maxResidual: 0,
    minResidual: 0,
    bias: 'unbiased',
    positiveCount: 0,
    negativeCount: 0,
    zeroCount: 0,
  };
  if (!Array.isArray(points)) return empty;
  const finite = points.filter(isFinitePoint);
  const n = finite.length;
  if (n === 0) return empty;
  let sum = 0;
  let absSum = 0;
  let sqSum = 0;
  let maxAbs = 0;
  let maxR = Number.NEGATIVE_INFINITY;
  let minR = Number.POSITIVE_INFINITY;
  let positiveCount = 0;
  let negativeCount = 0;
  let zeroCount = 0;
  const eps =
    isFiniteNumber(biasEpsilon) && biasEpsilon >= 0 ? biasEpsilon : 0;
  for (const p of finite) {
    const r = p.observed - p.predicted;
    sum += r;
    absSum += Math.abs(r);
    sqSum += r * r;
    if (Math.abs(r) > maxAbs) maxAbs = Math.abs(r);
    if (r > maxR) maxR = r;
    if (r < minR) minR = r;
    if (r > eps) positiveCount += 1;
    else if (r < -eps) negativeCount += 1;
    else zeroCount += 1;
  }
  const mean = sum / n;
  const mae = absSum / n;
  const rmse = Math.sqrt(sqSum / n);
  let bias: ChartLineResidualBias = 'unbiased';
  if (mean > eps) bias = 'positive';
  else if (mean < -eps) bias = 'negative';
  return {
    finiteCount: n,
    meanResidual: mean,
    mae,
    rmse,
    maxAbs,
    maxResidual: maxR === Number.NEGATIVE_INFINITY ? 0 : maxR,
    minResidual: minR === Number.POSITIVE_INFINITY ? 0 : minR,
    bias,
    positiveCount,
    negativeCount,
    zeroCount,
  };
}

export interface ComputeLineResidualLayoutInput {
  series: readonly ChartLineResidualSeries[];
  hiddenSeries?: ReadonlySet<string> | null;
  biasEpsilon?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineResidualLayout(
  input: ComputeLineResidualLayoutInput,
): ComputeLineResidualLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const empty: ComputeLineResidualLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: -0.5,
    yMax: 0.5,
    zeroY: 0,
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

  // Bounds across residuals, always including y=0.
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = 0;
  let yMax = 0;
  let any = false;
  for (const s of visible) {
    for (const p of getLineResidualFinitePoints(s.data ?? [])) {
      const r = p.observed - p.predicted;
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (r < yMin) yMin = r;
      if (r > yMax) yMax = r;
      any = true;
    }
  }
  if (!any) {
    xMin = 0;
    xMax = 1;
    yMin = -0.5;
    yMax = 0.5;
  }
  if (xMin === Number.POSITIVE_INFINITY) {
    xMin = 0;
    xMax = 1;
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
  const zeroY = yToPx(0);
  const biasEpsilon =
    isFiniteNumber(input.biasEpsilon) && input.biasEpsilon >= 0
      ? input.biasEpsilon
      : DEFAULT_CHART_LINE_RESIDUAL_BIAS_EPSILON;

  const layoutSeries: ChartLineResidualLayoutSeries[] = [];
  let totalPoints = 0;
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const arr = Array.isArray(s.data) ? s.data : [];
    const color = s.color ?? getLineResidualDefaultColor(i);
    const positiveColor =
      s.positiveColor ?? DEFAULT_CHART_LINE_RESIDUAL_POSITIVE_COLOR;
    const negativeColor =
      s.negativeColor ?? DEFAULT_CHART_LINE_RESIDUAL_NEGATIVE_COLOR;
    const points: ChartLineResidualLayoutPoint[] = [];
    for (let j = 0; j < arr.length; j += 1) {
      const p = arr[j]!;
      if (!isFinitePoint(p)) continue;
      const residual = p.observed - p.predicted;
      const sign = classifyLineResidualSign(residual, biasEpsilon);
      const px = xToPx(p.x);
      const py = yToPx(residual);
      // Stems go from the residual point to zeroY.
      const stemY1 = py;
      const stemY2 = zeroY;
      points.push({
        index: j,
        x: p.x,
        observed: p.observed,
        predicted: p.predicted,
        residual,
        px,
        py,
        stemY1,
        stemY2,
        sign,
      });
    }
    let path = '';
    if (points.length > 0) {
      path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
      for (let j = 1; j < points.length; j += 1) {
        path += ` L ${fmt(points[j]!.px)} ${fmt(points[j]!.py)}`;
      }
    }
    const stats = computeLineResidualStats(arr, biasEpsilon);
    totalPoints += points.length;
    layoutSeries.push({
      id: s.id,
      label: s.label,
      index: i,
      color,
      positiveColor,
      negativeColor,
      points,
      path,
      stats,
      finiteCount: points.length,
      totalCount: arr.length,
    });
  }

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_RESIDUAL_TICK_COUNT;
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
    zeroY,
    innerWidth,
    innerHeight,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

export function describeLineResidualChart(
  series: readonly ChartLineResidualSeries[] | undefined | null,
  hidden?: ReadonlySet<string>,
  formatValue?: (n: number) => string,
  biasEpsilon: number = DEFAULT_CHART_LINE_RESIDUAL_BIAS_EPSILON,
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
    const stats = computeLineResidualStats(s.data ?? [], biasEpsilon);
    if (stats.finiteCount === 0) continue;
    any = true;
    totalPoints += stats.finiteCount;
    parts.push(
      `${s.label}: mean residual ${fmtV(stats.meanResidual)} (${stats.bias} bias), MAE ${fmtV(stats.mae)}, RMSE ${fmtV(stats.rmse)}, max |r| ${fmtV(stats.maxAbs)} (${stats.positiveCount}+ / ${stats.negativeCount}-)`,
    );
  }
  if (!any) return 'No data';
  return `Residual plot across ${visible.length} series (${totalPoints} points). ${parts.join('; ')}.`;
}

export interface ChartLineResidualPointClick {
  series: ChartLineResidualLayoutSeries;
  point: ChartLineResidualLayoutPoint;
}

export interface ChartLineResidualProps {
  series: readonly ChartLineResidualSeries[];
  biasEpsilon?: number;
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
  stemStrokeWidth?: number;
  dotRadius?: number;
  lineOpacity?: number;
  stemOpacity?: number;
  zeroDashArray?: string;
  zeroColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showZeroLine?: boolean;
  showLine?: boolean;
  showStems?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatResidual?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineResidualPointClick) => void;
  style?: CSSProperties;
}

export const ChartLineResidual = forwardRef(function ChartLineResidual(
  {
    series,
    biasEpsilon = DEFAULT_CHART_LINE_RESIDUAL_BIAS_EPSILON,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_RESIDUAL_WIDTH,
    height = DEFAULT_CHART_LINE_RESIDUAL_HEIGHT,
    padding = DEFAULT_CHART_LINE_RESIDUAL_PADDING,
    tickCount = DEFAULT_CHART_LINE_RESIDUAL_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_RESIDUAL_STROKE_WIDTH,
    stemStrokeWidth = DEFAULT_CHART_LINE_RESIDUAL_STEM_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_RESIDUAL_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_RESIDUAL_LINE_OPACITY,
    stemOpacity = DEFAULT_CHART_LINE_RESIDUAL_STEM_OPACITY,
    zeroDashArray = DEFAULT_CHART_LINE_RESIDUAL_ZERO_DASH,
    zeroColor = DEFAULT_CHART_LINE_RESIDUAL_ZERO_COLOR,
    positiveColor = DEFAULT_CHART_LINE_RESIDUAL_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_RESIDUAL_NEGATIVE_COLOR,
    gridColor = DEFAULT_CHART_LINE_RESIDUAL_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_RESIDUAL_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showZeroLine = true,
    showLine = true,
    showStems = true,
    animate = true,
    className,
    ariaLabel = 'Residual plot',
    ariaDescription,
    formatValue,
    formatX,
    formatResidual,
    xLabel,
    yLabel,
    onPointClick,
    style,
  }: ChartLineResidualProps,
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
  const fmtResidual = useCallback(
    (n: number) =>
      formatResidual
        ? formatResidual(n)
        : `${n >= 0 ? '+' : ''}${n.toFixed(3)}`,
    [formatResidual],
  );

  const [internalHidden, setInternalHidden] = useState<ReadonlySet<string>>(
    defaultHiddenSeries ?? new Set<string>(),
  );
  const hidden: ReadonlySet<string> =
    hiddenSeries !== undefined ? hiddenSeries : internalHidden;

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineResidualLayout({
        series,
        hiddenSeries: hidden,
        biasEpsilon,
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
      hidden,
      biasEpsilon,
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
    describeLineResidualChart(series, hidden, fmtValue, biasEpsilon);

  const toggleSeries = useCallback(
    (s: ChartLineResidualSeries) => {
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
      data-section="chart-line-residual"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-residual-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-residual-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-residual-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-residual-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-residual-grid-line"
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
                  data-section="chart-line-residual-grid-line"
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
            <g data-section="chart-line-residual-axes">
              <line
                data-section="chart-line-residual-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-residual-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-residual-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-residual-tick"
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
                        data-section="chart-line-residual-tick-label"
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
                <g data-section="chart-line-residual-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-residual-tick"
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
                        data-section="chart-line-residual-tick-label"
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
                  data-section="chart-line-residual-x-label"
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
                  data-section="chart-line-residual-y-label"
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

          {/* Zero baseline */}
          {showZeroLine ? (
            <line
              data-section="chart-line-residual-zero-line"
              data-zero-y={layout.zeroY}
              role="graphics-symbol"
              aria-label="Zero residual reference (model is perfect)"
              x1={padding}
              y1={layout.zeroY}
              x2={padding + layout.innerWidth}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeDasharray={zeroDashArray}
              strokeWidth={1.5}
            />
          ) : null}

          {/* Per-series stems + line + dots */}
          <g data-section="chart-line-residual-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              const dimStem =
                isAnyHovered && !isSeriesHovered ? 0.2 : stemOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-residual-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-mean-residual={s.stats.meanResidual}
                  data-series-mae={s.stats.mae}
                  data-series-rmse={s.stats.rmse}
                  data-series-max-abs={s.stats.maxAbs}
                  data-series-bias={s.stats.bias}
                  data-series-positive-count={s.stats.positiveCount}
                  data-series-negative-count={s.stats.negativeCount}
                  data-series-zero-count={s.stats.zeroCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  {showStems
                    ? s.points.map((p) => {
                        const key = `stem-${s.id}-${p.index}`;
                        const stroke =
                          p.sign === 'positive'
                            ? s.positiveColor
                            : p.sign === 'negative'
                              ? s.negativeColor
                              : s.color;
                        return (
                          <line
                            key={key}
                            data-section="chart-line-residual-stem"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-sign={p.sign}
                            x1={p.px}
                            y1={p.stemY1}
                            x2={p.px}
                            y2={p.stemY2}
                            stroke={stroke}
                            strokeOpacity={dimStem}
                            strokeWidth={stemStrokeWidth}
                          />
                        );
                      })
                    : null}
                  {showLine && s.path ? (
                    <path
                      data-section="chart-line-residual-path"
                      data-series-id={s.id}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label}: residual line with ${s.finiteCount} points`}
                      d={s.path}
                      fill="none"
                      stroke={s.color}
                      strokeOpacity={dim}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {showDots
                    ? s.points.map((p) => {
                        const key = `${s.id}::${p.index}`;
                        const isHovered = hoveredKey === key;
                        const opacity =
                          isAnyHovered && !isHovered ? 0.3 : 1;
                        const fill =
                          p.sign === 'positive'
                            ? s.positiveColor
                            : p.sign === 'negative'
                              ? s.negativeColor
                              : s.color;
                        const aria = `${s.label}: x=${fmtX(p.x)}, observed=${fmtValue(p.observed)}, predicted=${fmtValue(p.predicted)}, residual=${fmtResidual(p.residual)}`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-residual-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-observed={p.observed}
                            data-predicted={p.predicted}
                            data-residual={p.residual}
                            data-sign={p.sign}
                            data-hovered={isHovered ? 'true' : 'false'}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={aria}
                            cx={p.px}
                            cy={p.py}
                            r={isHovered ? dotRadius + 1 : dotRadius}
                            fill={fill}
                            fillOpacity={opacity}
                            stroke={fill}
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
          const ty = Math.min(Math.max(p.py - 84, 0), height - 116);
          const signColor =
            p.sign === 'positive'
              ? s.positiveColor
              : p.sign === 'negative'
                ? s.negativeColor
                : 'inherit';
          return (
            <div
              data-section="chart-line-residual-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              data-sign={p.sign}
              className="pointer-events-none absolute z-10 min-w-[220px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-residual-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-residual-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-residual-tooltip-observed"
                className="text-slate-500"
              >
                observed: {fmtValue(p.observed)}
              </div>
              <div
                data-section="chart-line-residual-tooltip-predicted"
                className="text-slate-500"
              >
                predicted: {fmtValue(p.predicted)}
              </div>
              <div
                data-section="chart-line-residual-tooltip-residual"
                style={{ color: signColor, fontWeight: 600 }}
              >
                residual: {fmtResidual(p.residual)}
                {p.sign === 'positive' ? ' (under-predicted)' : null}
                {p.sign === 'negative' ? ' (over-predicted)' : null}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-residual-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            const visEntry = layout.series.find((ls) => ls.id === s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-residual-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-residual-legend-button"
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
                    data-section="chart-line-residual-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineResidualDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-residual-legend-label">
                    {s.label}
                  </span>
                  {visEntry ? (
                    <span
                      data-section="chart-line-residual-legend-stats"
                      className="text-slate-500"
                    >
                      (RMSE {fmtValue(visEntry.stats.rmse)};{' '}
                      {visEntry.stats.bias} bias)
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

ChartLineResidual.displayName = 'ChartLineResidual';
