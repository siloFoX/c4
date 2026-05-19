import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_PERIOD_COMPARE_WIDTH = 560;
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_HEIGHT = 320;
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_PADDING = 40;
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_PRIOR_OPACITY = 0.6;
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_FILL_OPACITY = 0.14;
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_PRIOR_DASH = '4 3';
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_CURRENT_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_PRIOR_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_FLAT_EPSILON = 0;
export const DEFAULT_CHART_LINE_PERIOD_COMPARE_PALETTE = [
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

export type ChartLinePeriodCompareDirection = 'up' | 'down' | 'flat';

export interface ChartLinePeriodComparePoint {
  x: number;
  y: number;
}

export interface ChartLinePeriodCompareSeries {
  id: string;
  label: string;
  data: readonly ChartLinePeriodComparePoint[];
  color?: string;
}

export interface ChartLinePeriodComparePair {
  x: number;
  currentY: number;
  priorY: number;
  delta: number;
  percentChange: number;
  currentIndex: number;
  priorIndex: number;
}

export interface ChartLinePeriodCompareTotals {
  currentTotal: number;
  priorTotal: number;
  totalDelta: number;
  totalPercentChange: number;
  ok: boolean;
  direction: ChartLinePeriodCompareDirection;
  pairCount: number;
  currentCount: number;
  priorCount: number;
}

export interface ChartLinePeriodCompareLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  delta: number | null;
  percentChange: number | null;
  direction: ChartLinePeriodCompareDirection;
}

export interface ChartLinePeriodCompareLayoutSeries {
  id: string;
  label: string;
  role: 'current' | 'prior';
  color: string;
  points: ChartLinePeriodCompareLayoutPoint[];
  path: string;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLinePeriodCompareLayoutResult {
  current: ChartLinePeriodCompareLayoutSeries | null;
  prior: ChartLinePeriodCompareLayoutSeries | null;
  totals: ChartLinePeriodCompareTotals;
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  totalPoints: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLinePeriodComparePoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLinePeriodComparePoint).x) &&
    isFiniteNumber((p as ChartLinePeriodComparePoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLinePeriodCompareDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_PERIOD_COMPARE_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_PERIOD_COMPARE_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_PERIOD_COMPARE_PALETTE.length
  ]!;
}

export function getLinePeriodCompareFinitePoints(
  points: readonly ChartLinePeriodComparePoint[],
): ChartLinePeriodComparePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Pairs the current and prior series by **exact x match**. Returns
 * one entry per shared x value where both periods have a finite
 * sample, sorted ascending by x.
 *
 * `delta = current - prior`; `percentChange = (current - prior) /
 * |prior|` -- with `prior === 0` collapsing to `0` to avoid division
 * by zero.
 *
 * Non-array / empty inputs / no overlap -> `[]`.
 */
export function pairLinePeriodCompareByX(
  current: ChartLinePeriodCompareSeries | undefined | null,
  prior: ChartLinePeriodCompareSeries | undefined | null,
): ChartLinePeriodComparePair[] {
  if (!current || !prior) return [];
  const currentArr = Array.isArray(current.data) ? current.data : [];
  const priorArr = Array.isArray(prior.data) ? prior.data : [];
  if (currentArr.length === 0 || priorArr.length === 0) return [];
  const priorMap = new Map<number, { y: number; index: number }>();
  for (let i = 0; i < priorArr.length; i += 1) {
    const p = priorArr[i]!;
    if (!isFinitePoint(p)) continue;
    if (!priorMap.has(p.x)) priorMap.set(p.x, { y: p.y, index: i });
  }
  if (priorMap.size === 0) return [];
  const out: ChartLinePeriodComparePair[] = [];
  for (let i = 0; i < currentArr.length; i += 1) {
    const p = currentArr[i]!;
    if (!isFinitePoint(p)) continue;
    const hit = priorMap.get(p.x);
    if (!hit) continue;
    const delta = p.y - hit.y;
    const percentChange = hit.y === 0 ? 0 : delta / Math.abs(hit.y);
    out.push({
      x: p.x,
      currentY: p.y,
      priorY: hit.y,
      delta,
      percentChange,
      currentIndex: i,
      priorIndex: hit.index,
    });
  }
  out.sort((p, q) => p.x - q.x);
  return out;
}

/** Classifies the period-over-period direction. */
export function classifyLinePeriodCompareDirection(
  percentChange: number,
  epsilon: number = DEFAULT_CHART_LINE_PERIOD_COMPARE_FLAT_EPSILON,
): ChartLinePeriodCompareDirection {
  if (!isFiniteNumber(percentChange)) return 'flat';
  const e =
    isFiniteNumber(epsilon) && epsilon >= 0
      ? epsilon
      : DEFAULT_CHART_LINE_PERIOD_COMPARE_FLAT_EPSILON;
  if (percentChange > e) return 'up';
  if (percentChange < -e) return 'down';
  return 'flat';
}

/**
 * Computes period totals + aggregate period-over-period change.
 * `totalPercentChange = (currentTotal - priorTotal) / |priorTotal|`
 * with `priorTotal === 0` collapsing to `0`. `ok=false` when both
 * series are empty.
 */
export function computeLinePeriodCompareTotals(
  current: ChartLinePeriodCompareSeries | undefined | null,
  prior: ChartLinePeriodCompareSeries | undefined | null,
  flatEpsilon: number = DEFAULT_CHART_LINE_PERIOD_COMPARE_FLAT_EPSILON,
): ChartLinePeriodCompareTotals {
  const currentFinite = getLinePeriodCompareFinitePoints(
    current?.data ?? [],
  );
  const priorFinite = getLinePeriodCompareFinitePoints(prior?.data ?? []);
  const pairs = pairLinePeriodCompareByX(current, prior);
  let currentTotal = 0;
  for (const p of currentFinite) currentTotal += p.y;
  let priorTotal = 0;
  for (const p of priorFinite) priorTotal += p.y;
  const ok = currentFinite.length > 0 || priorFinite.length > 0;
  if (!ok) {
    return {
      currentTotal: 0,
      priorTotal: 0,
      totalDelta: 0,
      totalPercentChange: 0,
      ok: false,
      direction: 'flat',
      pairCount: 0,
      currentCount: 0,
      priorCount: 0,
    };
  }
  const totalDelta = currentTotal - priorTotal;
  const totalPercentChange =
    priorTotal === 0 ? 0 : totalDelta / Math.abs(priorTotal);
  return {
    currentTotal,
    priorTotal,
    totalDelta,
    totalPercentChange,
    ok: true,
    direction: classifyLinePeriodCompareDirection(
      totalPercentChange,
      flatEpsilon,
    ),
    pairCount: pairs.length,
    currentCount: currentFinite.length,
    priorCount: priorFinite.length,
  };
}

export interface ComputeLinePeriodCompareLayoutInput {
  current: ChartLinePeriodCompareSeries | null;
  prior: ChartLinePeriodCompareSeries | null;
  flatEpsilon?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLinePeriodCompareLayout(
  input: ComputeLinePeriodCompareLayoutInput,
): ComputeLinePeriodCompareLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const flatEpsilon =
    isFiniteNumber(input.flatEpsilon) && input.flatEpsilon >= 0
      ? input.flatEpsilon
      : DEFAULT_CHART_LINE_PERIOD_COMPARE_FLAT_EPSILON;
  const empty: ComputeLinePeriodCompareLayoutResult = {
    current: null,
    prior: null,
    totals: {
      currentTotal: 0,
      priorTotal: 0,
      totalDelta: 0,
      totalPercentChange: 0,
      ok: false,
      direction: 'flat',
      pairCount: 0,
      currentCount: 0,
      priorCount: 0,
    },
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    innerWidth,
    innerHeight,
    totalPoints: 0,
  };
  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const currentArr = input.current?.data ?? [];
  const priorArr = input.prior?.data ?? [];
  if (
    (!input.current || currentArr.length === 0) &&
    (!input.prior || priorArr.length === 0)
  ) {
    return empty;
  }

  // Joint bounds: union of x and y across both series.
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const p of getLinePeriodCompareFinitePoints(currentArr)) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
    any = true;
  }
  for (const p of getLinePeriodCompareFinitePoints(priorArr)) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
    any = true;
  }
  if (!any) {
    xMin = 0;
    xMax = 1;
    yMin = 0;
    yMax = 1;
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

  // Build pair lookup so per-point delta + direction can be attached
  // to current-series points.
  const pairs = pairLinePeriodCompareByX(input.current, input.prior);
  const pairByX = new Map<number, ChartLinePeriodComparePair>();
  for (const p of pairs) pairByX.set(p.x, p);

  function buildSeries(
    s: ChartLinePeriodCompareSeries | null,
    role: 'current' | 'prior',
    fallbackColor: string,
  ): ChartLinePeriodCompareLayoutSeries | null {
    if (!s) return null;
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLinePeriodCompareLayoutPoint[] = [];
    for (let j = 0; j < arr.length; j += 1) {
      const p = arr[j]!;
      if (!isFinitePoint(p)) continue;
      let delta: number | null = null;
      let percentChange: number | null = null;
      let direction: ChartLinePeriodCompareDirection = 'flat';
      if (role === 'current') {
        const pair = pairByX.get(p.x);
        if (pair) {
          delta = pair.delta;
          percentChange = pair.percentChange;
          direction = classifyLinePeriodCompareDirection(
            pair.percentChange,
            flatEpsilon,
          );
        }
      }
      points.push({
        index: j,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPx(p.y),
        delta,
        percentChange,
        direction,
      });
    }
    let path = '';
    if (points.length > 0) {
      path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
      for (let j = 1; j < points.length; j += 1) {
        path += ` L ${fmt(points[j]!.px)} ${fmt(points[j]!.py)}`;
      }
    }
    return {
      id: s.id,
      label: s.label,
      role,
      color: s.color ?? fallbackColor,
      points,
      path,
      finiteCount: points.length,
      totalCount: arr.length,
    };
  }

  const currentLayout = buildSeries(
    input.current,
    'current',
    DEFAULT_CHART_LINE_PERIOD_COMPARE_CURRENT_COLOR,
  );
  const priorLayout = buildSeries(
    input.prior,
    'prior',
    DEFAULT_CHART_LINE_PERIOD_COMPARE_PRIOR_COLOR,
  );

  const totals = computeLinePeriodCompareTotals(
    input.current,
    input.prior,
    flatEpsilon,
  );

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_PERIOD_COMPARE_TICK_COUNT;
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
    current: currentLayout,
    prior: priorLayout,
    totals,
    xTicks,
    yTicks,
    xMin,
    xMax,
    yMin,
    yMax,
    innerWidth,
    innerHeight,
    totalPoints:
      (currentLayout?.finiteCount ?? 0) + (priorLayout?.finiteCount ?? 0),
  };
}

export function describeLinePeriodCompareChart(
  current: ChartLinePeriodCompareSeries | undefined | null,
  prior: ChartLinePeriodCompareSeries | undefined | null,
  formatValue?: (n: number) => string,
  formatPercent?: (n: number) => string,
): string {
  if (!current && !prior) return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  const fmtP =
    formatPercent ??
    ((n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`);
  const totals = computeLinePeriodCompareTotals(current, prior);
  const pieces: string[] = [];
  if (current) {
    pieces.push(
      `${current.label} (current, ${totals.currentCount} points, total ${fmtV(totals.currentTotal)})`,
    );
  }
  if (prior) {
    pieces.push(
      `${prior.label} (prior, ${totals.priorCount} points, total ${fmtV(totals.priorTotal)})`,
    );
  }
  if (pieces.length === 0) return 'No data';
  if (!totals.ok) return 'No data';
  return `Period-over-period comparison chart: ${pieces.join(' and ')}. Total change ${fmtP(totals.totalPercentChange)} (${totals.direction}) across ${totals.pairCount} paired samples.`;
}

export interface ChartLinePeriodComparePointClick {
  series: ChartLinePeriodCompareLayoutSeries;
  point: ChartLinePeriodCompareLayoutPoint;
}

export interface ChartLinePeriodCompareProps {
  current: ChartLinePeriodCompareSeries | null;
  prior: ChartLinePeriodCompareSeries | null;
  flatEpsilon?: number;
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
  priorOpacity?: number;
  priorDashArray?: string;
  gridColor?: string;
  axisColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showChangeBadge?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatPercent?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLinePeriodComparePointClick) => void;
  style?: CSSProperties;
}

export const ChartLinePeriodCompare = forwardRef(function ChartLinePeriodCompare(
  {
    current,
    prior,
    flatEpsilon = DEFAULT_CHART_LINE_PERIOD_COMPARE_FLAT_EPSILON,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_PERIOD_COMPARE_WIDTH,
    height = DEFAULT_CHART_LINE_PERIOD_COMPARE_HEIGHT,
    padding = DEFAULT_CHART_LINE_PERIOD_COMPARE_PADDING,
    tickCount = DEFAULT_CHART_LINE_PERIOD_COMPARE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_PERIOD_COMPARE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_PERIOD_COMPARE_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_PERIOD_COMPARE_LINE_OPACITY,
    priorOpacity = DEFAULT_CHART_LINE_PERIOD_COMPARE_PRIOR_OPACITY,
    priorDashArray = DEFAULT_CHART_LINE_PERIOD_COMPARE_PRIOR_DASH,
    gridColor = DEFAULT_CHART_LINE_PERIOD_COMPARE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_PERIOD_COMPARE_AXIS_COLOR,
    upColor = DEFAULT_CHART_LINE_PERIOD_COMPARE_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_PERIOD_COMPARE_DOWN_COLOR,
    flatColor = DEFAULT_CHART_LINE_PERIOD_COMPARE_FLAT_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showChangeBadge = true,
    animate = true,
    className,
    ariaLabel = 'Period-over-period comparison line chart',
    ariaDescription,
    formatValue,
    formatX,
    formatPercent,
    xLabel,
    yLabel,
    onPointClick,
    style,
  }: ChartLinePeriodCompareProps,
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
  const fmtPct = useCallback(
    (n: number) =>
      formatPercent
        ? formatPercent(n)
        : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`,
    [formatPercent],
  );

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLinePeriodCompareLayout({
        current,
        prior,
        flatEpsilon,
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
      current,
      prior,
      flatEpsilon,
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
    describeLinePeriodCompareChart(current, prior, fmtValue, formatPercent);

  const badgeColor = layout.totals.ok
    ? layout.totals.direction === 'up'
      ? upColor
      : layout.totals.direction === 'down'
        ? downColor
        : flatColor
    : flatColor;

  const rootClass = [
    'relative inline-block w-full max-w-full text-xs text-slate-700',
    animate ? 'motion-safe:animate-fade-in' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const renderSeries = (s: ChartLinePeriodCompareLayoutSeries) => {
    const isAnyHovered = hoveredKey !== null;
    const isSeriesHovered =
      isAnyHovered && hoveredKey!.startsWith(`${s.role}::`);
    const baseOpacity = s.role === 'prior' ? priorOpacity : lineOpacity;
    const dim = isAnyHovered && !isSeriesHovered ? 0.3 : baseOpacity;
    const dashAttr = s.role === 'prior' ? priorDashArray : undefined;
    return (
      <g
        key={s.role}
        data-section="chart-line-period-compare-series-group"
        data-series-id={s.id}
        data-series-role={s.role}
        data-series-color={s.color}
        data-series-point-count={s.points.length}
        data-series-finite-count={s.finiteCount}
        data-hovered={isSeriesHovered ? 'true' : 'false'}
        style={{ color: s.color }}
      >
        {s.path ? (
          <path
            data-section="chart-line-period-compare-path"
            data-series-id={s.id}
            data-series-role={s.role}
            role="graphics-symbol"
            tabIndex={0}
            aria-label={`${s.label}: ${s.role} period line with ${s.finiteCount} points`}
            d={s.path}
            fill="none"
            stroke={s.color}
            strokeOpacity={dim}
            strokeWidth={strokeWidth}
            strokeDasharray={dashAttr}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {showDots
          ? s.points.map((p) => {
              const key = `${s.role}::${p.index}`;
              const isHovered = hoveredKey === key;
              const opacity =
                isAnyHovered && !isHovered ? 0.3 : 1;
              const aria = `${s.label} (${s.role} period): x=${fmtX(p.x)}, y=${fmtValue(p.y)}${
                p.delta !== null
                  ? `, vs prior ${fmtPct(p.percentChange ?? 0)}`
                  : ''
              }`;
              return (
                <circle
                  key={key}
                  data-section="chart-line-period-compare-dot"
                  data-series-id={s.id}
                  data-series-role={s.role}
                  data-point-index={p.index}
                  data-x={p.x}
                  data-y={p.y}
                  data-delta={p.delta === null ? '' : String(p.delta)}
                  data-percent-change={
                    p.percentChange === null
                      ? ''
                      : String(p.percentChange)
                  }
                  data-direction={p.direction}
                  data-hovered={isHovered ? 'true' : 'false'}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={aria}
                  cx={p.px}
                  cy={p.py}
                  r={isHovered ? dotRadius + 1 : dotRadius}
                  fill={s.color}
                  fillOpacity={opacity}
                  stroke={s.color}
                  strokeWidth={1}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  onFocus={() => setHoveredKey(key)}
                  onBlur={() => setHoveredKey(null)}
                  onClick={() => {
                    if (onPointClick) onPointClick({ series: s, point: p });
                  }}
                />
              );
            })
          : null}
      </g>
    );
  };

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={ariaDescId}
      data-section="chart-line-period-compare"
      data-total-points={layout.totalPoints}
      data-pair-count={layout.totals.pairCount}
      data-current-total={layout.totals.currentTotal}
      data-prior-total={layout.totals.priorTotal}
      data-total-delta={layout.totals.totalDelta}
      data-total-percent-change={layout.totals.totalPercentChange}
      data-direction={layout.totals.direction}
      data-totals-ok={layout.totals.ok ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-period-compare-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-period-compare-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-period-compare-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-period-compare-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-period-compare-grid-line"
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
                  data-section="chart-line-period-compare-grid-line"
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
            <g data-section="chart-line-period-compare-axes">
              <line
                data-section="chart-line-period-compare-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-period-compare-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g
                  data-section="chart-line-period-compare-ticks"
                  data-axis="x"
                >
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-period-compare-tick"
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
                        data-section="chart-line-period-compare-tick-label"
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
                <g
                  data-section="chart-line-period-compare-ticks"
                  data-axis="y"
                >
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-period-compare-tick"
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
                        data-section="chart-line-period-compare-tick-label"
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
                  data-section="chart-line-period-compare-x-label"
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
                  data-section="chart-line-period-compare-y-label"
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

          <g data-section="chart-line-period-compare-series">
            {layout.prior ? renderSeries(layout.prior) : null}
            {layout.current ? renderSeries(layout.current) : null}
          </g>
        </svg>

        {showChangeBadge && layout.totals.ok ? (
          <div
            data-section="chart-line-period-compare-badge"
            data-direction={layout.totals.direction}
            data-total-percent-change={layout.totals.totalPercentChange}
            data-total-delta={layout.totals.totalDelta}
            data-pair-count={layout.totals.pairCount}
            className="pointer-events-none absolute rounded border bg-white px-2 py-1 text-xs shadow"
            style={{
              left: padding + 6,
              top: padding + 6,
              borderColor: badgeColor,
              color: badgeColor,
            }}
          >
            <div
              data-section="chart-line-period-compare-badge-percent"
              className="font-medium"
            >
              {fmtPct(layout.totals.totalPercentChange)}
            </div>
            <div
              data-section="chart-line-period-compare-badge-totals"
              className="text-[10px]"
            >
              {fmtValue(layout.totals.currentTotal)} vs{' '}
              {fmtValue(layout.totals.priorTotal)} ({layout.totals.pairCount}{' '}
              pairs)
            </div>
          </div>
        ) : null}

        {showTooltip && hoveredKey ? (() => {
          const sep = hoveredKey.indexOf('::');
          if (sep < 0) return null;
          const roleName = hoveredKey.slice(0, sep) as 'current' | 'prior';
          const idx = Number(hoveredKey.slice(sep + 2));
          const s =
            roleName === 'current'
              ? layout.current
              : roleName === 'prior'
                ? layout.prior
                : null;
          if (!s) return null;
          const p = s.points.find((x) => x.index === idx);
          if (!p) return null;
          const tx = Math.min(Math.max(p.px + 8, 0), width - 220);
          const ty = Math.min(Math.max(p.py - 64, 0), height - 92);
          const directionColor =
            p.direction === 'up'
              ? upColor
              : p.direction === 'down'
                ? downColor
                : flatColor;
          return (
            <div
              data-section="chart-line-period-compare-tooltip"
              data-series-id={s.id}
              data-series-role={s.role}
              data-point-index={p.index}
              data-direction={p.direction}
              className="pointer-events-none absolute z-10 min-w-[200px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-period-compare-tooltip-label"
                className="font-medium"
                style={{ color: s.color }}
              >
                {s.label}{' '}
                <span className="text-slate-500">({s.role})</span>
              </div>
              <div
                data-section="chart-line-period-compare-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-period-compare-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
              {p.delta !== null && p.percentChange !== null ? (
                <div
                  data-section="chart-line-period-compare-tooltip-delta"
                  style={{ color: directionColor }}
                >
                  vs prior: {p.delta >= 0 ? '+' : ''}
                  {fmtValue(p.delta)} ({fmtPct(p.percentChange)})
                </div>
              ) : null}
            </div>
          );
        })() : null}
      </div>

      {showLegend && (layout.current || layout.prior) ? (
        <ul
          data-section="chart-line-period-compare-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {layout.current ? (
            <li
              data-section="chart-line-period-compare-legend-item"
              data-series-id={layout.current.id}
              data-series-role="current"
            >
              <span className="flex items-center gap-1">
                <span
                  data-section="chart-line-period-compare-legend-swatch"
                  className="inline-block h-2 w-3"
                  style={{ backgroundColor: layout.current.color }}
                />
                <span data-section="chart-line-period-compare-legend-label">
                  {layout.current.label}
                </span>
                <span
                  data-section="chart-line-period-compare-legend-role"
                  className="text-slate-500"
                >
                  (current)
                </span>
              </span>
            </li>
          ) : null}
          {layout.prior ? (
            <li
              data-section="chart-line-period-compare-legend-item"
              data-series-id={layout.prior.id}
              data-series-role="prior"
            >
              <span className="flex items-center gap-1">
                <span
                  data-section="chart-line-period-compare-legend-swatch"
                  className="inline-block h-2 w-3"
                  style={{
                    backgroundColor: layout.prior.color,
                    opacity: priorOpacity,
                  }}
                />
                <span data-section="chart-line-period-compare-legend-label">
                  {layout.prior.label}
                </span>
                <span
                  data-section="chart-line-period-compare-legend-role"
                  className="text-slate-500"
                >
                  (prior)
                </span>
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
});

ChartLinePeriodCompare.displayName = 'ChartLinePeriodCompare';
