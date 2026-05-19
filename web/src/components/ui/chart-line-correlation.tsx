import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CORRELATION_WIDTH = 560;
export const DEFAULT_CHART_LINE_CORRELATION_HEIGHT = 320;
export const DEFAULT_CHART_LINE_CORRELATION_PADDING = 48;
export const DEFAULT_CHART_LINE_CORRELATION_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CORRELATION_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_CORRELATION_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CORRELATION_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_CORRELATION_PRIMARY_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CORRELATION_SECONDARY_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CORRELATION_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CORRELATION_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CORRELATION_NEUTRAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_CORRELATION_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CORRELATION_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CORRELATION_STRONG_THRESHOLD = 0.7;
export const DEFAULT_CHART_LINE_CORRELATION_MODERATE_THRESHOLD = 0.4;
export const DEFAULT_CHART_LINE_CORRELATION_WEAK_THRESHOLD = 0.2;
export const DEFAULT_CHART_LINE_CORRELATION_PALETTE = [
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

export type ChartLineCorrelationStrength =
  | 'strong'
  | 'moderate'
  | 'weak'
  | 'none';

export type ChartLineCorrelationDirection =
  | 'positive'
  | 'negative'
  | 'neutral';

export interface ChartLineCorrelationPoint {
  x: number;
  y: number;
}

export interface ChartLineCorrelationSeries {
  id: string;
  label: string;
  data: readonly ChartLineCorrelationPoint[];
  color?: string;
}

export interface ChartLineCorrelationPair {
  x: number;
  ya: number;
  yb: number;
  indexA: number;
  indexB: number;
}

export interface ChartLineCorrelationResult {
  r: number;
  ok: boolean;
  pairCount: number;
  strength: ChartLineCorrelationStrength;
  direction: ChartLineCorrelationDirection;
  meanA: number;
  meanB: number;
}

export interface ChartLineCorrelationLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineCorrelationLayoutSeries {
  id: string;
  label: string;
  axis: 'left' | 'right';
  color: string;
  points: ChartLineCorrelationLayoutPoint[];
  path: string;
  finiteCount: number;
  totalCount: number;
  yMin: number;
  yMax: number;
}

export interface ComputeLineCorrelationLayoutResult {
  primary: ChartLineCorrelationLayoutSeries | null;
  secondary: ChartLineCorrelationLayoutSeries | null;
  correlation: ChartLineCorrelationResult;
  xTicks: { value: number; position: number }[];
  yLeftTicks: { value: number; position: number }[];
  yRightTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  innerWidth: number;
  innerHeight: number;
  totalPoints: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineCorrelationPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineCorrelationPoint).x) &&
    isFiniteNumber((p as ChartLineCorrelationPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineCorrelationDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_CORRELATION_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_CORRELATION_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_CORRELATION_PALETTE.length
  ]!;
}

export function getLineCorrelationFinitePoints(
  points: readonly ChartLineCorrelationPoint[],
): ChartLineCorrelationPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Pairs two series by **exact x match**. Returns one entry per shared
 * x value where both series have a finite sample. `indexA` /
 * `indexB` reference positions in the ORIGINAL input arrays so
 * callers can map back to their data.
 *
 * Non-array inputs / empty series / no overlap -> `[]`.
 */
export function pairLineCorrelationByX(
  a: ChartLineCorrelationSeries | undefined | null,
  b: ChartLineCorrelationSeries | undefined | null,
): ChartLineCorrelationPair[] {
  if (!a || !b) return [];
  const arrA = Array.isArray(a.data) ? a.data : [];
  const arrB = Array.isArray(b.data) ? b.data : [];
  if (arrA.length === 0 || arrB.length === 0) return [];
  const mapA = new Map<number, { y: number; index: number }>();
  for (let i = 0; i < arrA.length; i += 1) {
    const p = arrA[i]!;
    if (!isFinitePoint(p)) continue;
    if (!mapA.has(p.x)) mapA.set(p.x, { y: p.y, index: i });
  }
  if (mapA.size === 0) return [];
  const out: ChartLineCorrelationPair[] = [];
  for (let i = 0; i < arrB.length; i += 1) {
    const p = arrB[i]!;
    if (!isFinitePoint(p)) continue;
    const hit = mapA.get(p.x);
    if (!hit) continue;
    out.push({
      x: p.x,
      ya: hit.y,
      yb: p.y,
      indexA: hit.index,
      indexB: i,
    });
  }
  out.sort((p, q) => p.x - q.x);
  return out;
}

/**
 * Pearson correlation coefficient `r` between paired (ya, yb)
 * observations. Returns `NaN` when fewer than 2 pairs, or either
 * series has zero variance (constant signal -> no meaningful
 * correlation).
 *
 *     r = Σ (ya - mean_a)(yb - mean_b) /
 *         sqrt( Σ (ya - mean_a)^2 * Σ (yb - mean_b)^2 )
 *
 * Output is clamped to `[-1, 1]` to defend against floating-point
 * overshoot.
 */
export function computePearsonCorrelation(
  pairs: readonly ChartLineCorrelationPair[],
): { r: number; ok: boolean; meanA: number; meanB: number } {
  const n = pairs.length;
  if (n < 2) return { r: Number.NaN, ok: false, meanA: 0, meanB: 0 };
  let sumA = 0;
  let sumB = 0;
  for (const p of pairs) {
    sumA += p.ya;
    sumB += p.yb;
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of pairs) {
    const da = p.ya - meanA;
    const db = p.yb - meanB;
    sxy += da * db;
    sxx += da * da;
    syy += db * db;
  }
  if (sxx === 0 || syy === 0) {
    return { r: Number.NaN, ok: false, meanA, meanB };
  }
  let r = sxy / Math.sqrt(sxx * syy);
  if (r > 1) r = 1;
  if (r < -1) r = -1;
  return { r, ok: true, meanA, meanB };
}

/**
 * Classifies `|r|` into a qualitative strength bucket using the
 * canonical thresholds:
 *
 * - `'strong'`:   `|r| >= strongThreshold` (default 0.7)
 * - `'moderate'`: `|r| >= moderateThreshold` (default 0.4)
 * - `'weak'`:     `|r| >= weakThreshold` (default 0.2)
 * - `'none'`:     otherwise
 *
 * Non-finite `r` -> `'none'`. Non-finite thresholds collapse to
 * defaults.
 */
export function classifyLineCorrelationStrength(
  r: number,
  strongThreshold: number = DEFAULT_CHART_LINE_CORRELATION_STRONG_THRESHOLD,
  moderateThreshold: number = DEFAULT_CHART_LINE_CORRELATION_MODERATE_THRESHOLD,
  weakThreshold: number = DEFAULT_CHART_LINE_CORRELATION_WEAK_THRESHOLD,
): ChartLineCorrelationStrength {
  if (!isFiniteNumber(r)) return 'none';
  const strong = isFiniteNumber(strongThreshold)
    ? strongThreshold
    : DEFAULT_CHART_LINE_CORRELATION_STRONG_THRESHOLD;
  const moderate = isFiniteNumber(moderateThreshold)
    ? moderateThreshold
    : DEFAULT_CHART_LINE_CORRELATION_MODERATE_THRESHOLD;
  const weak = isFiniteNumber(weakThreshold)
    ? weakThreshold
    : DEFAULT_CHART_LINE_CORRELATION_WEAK_THRESHOLD;
  const abs = Math.abs(r);
  if (abs >= strong) return 'strong';
  if (abs >= moderate) return 'moderate';
  if (abs >= weak) return 'weak';
  return 'none';
}

/** Classifies the direction of an r value. Non-finite -> 'neutral'. */
export function classifyLineCorrelationDirection(
  r: number,
): ChartLineCorrelationDirection {
  if (!isFiniteNumber(r)) return 'neutral';
  if (r > 0) return 'positive';
  if (r < 0) return 'negative';
  return 'neutral';
}

export function computeLineCorrelation(
  primary: ChartLineCorrelationSeries | undefined | null,
  secondary: ChartLineCorrelationSeries | undefined | null,
  strongThreshold?: number,
  moderateThreshold?: number,
  weakThreshold?: number,
): ChartLineCorrelationResult {
  const pairs = pairLineCorrelationByX(primary, secondary);
  const { r, ok, meanA, meanB } = computePearsonCorrelation(pairs);
  return {
    r: ok ? r : Number.NaN,
    ok,
    pairCount: pairs.length,
    strength: classifyLineCorrelationStrength(
      r,
      strongThreshold,
      moderateThreshold,
      weakThreshold,
    ),
    direction: classifyLineCorrelationDirection(r),
    meanA,
    meanB,
  };
}

export interface ComputeLineCorrelationLayoutInput {
  primary: ChartLineCorrelationSeries | null;
  secondary: ChartLineCorrelationSeries | null;
  xMin?: number;
  xMax?: number;
  primaryYMin?: number;
  primaryYMax?: number;
  secondaryYMin?: number;
  secondaryYMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  strongThreshold?: number;
  moderateThreshold?: number;
  weakThreshold?: number;
}

export function computeLineCorrelationLayout(
  input: ComputeLineCorrelationLayoutInput,
): ComputeLineCorrelationLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const empty: ComputeLineCorrelationLayoutResult = {
    primary: null,
    secondary: null,
    correlation: {
      r: Number.NaN,
      ok: false,
      pairCount: 0,
      strength: 'none',
      direction: 'neutral',
      meanA: 0,
      meanB: 0,
    },
    xTicks: [],
    yLeftTicks: [],
    yRightTicks: [],
    xMin: 0,
    xMax: 1,
    innerWidth,
    innerHeight,
    totalPoints: 0,
  };
  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const primaryArr = input.primary?.data ?? [];
  const secondaryArr = input.secondary?.data ?? [];
  if (
    (!input.primary || primaryArr.length === 0) &&
    (!input.secondary || secondaryArr.length === 0)
  ) {
    return empty;
  }

  // X bounds: union of both series.
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  // Y bounds per axis.
  let aMin = Number.POSITIVE_INFINITY;
  let aMax = Number.NEGATIVE_INFINITY;
  let bMin = Number.POSITIVE_INFINITY;
  let bMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const p of getLineCorrelationFinitePoints(primaryArr)) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < aMin) aMin = p.y;
    if (p.y > aMax) aMax = p.y;
    any = true;
  }
  for (const p of getLineCorrelationFinitePoints(secondaryArr)) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < bMin) bMin = p.y;
    if (p.y > bMax) bMax = p.y;
    any = true;
  }
  if (!any) {
    xMin = 0;
    xMax = 1;
    aMin = 0;
    aMax = 1;
    bMin = 0;
    bMax = 1;
  }
  if (aMin === Number.POSITIVE_INFINITY) {
    aMin = 0;
    aMax = 1;
  }
  if (bMin === Number.POSITIVE_INFINITY) {
    bMin = 0;
    bMax = 1;
  }
  if (isFiniteNumber(input.xMin)) xMin = input.xMin;
  if (isFiniteNumber(input.xMax)) xMax = input.xMax;
  if (isFiniteNumber(input.primaryYMin)) aMin = input.primaryYMin;
  if (isFiniteNumber(input.primaryYMax)) aMax = input.primaryYMax;
  if (isFiniteNumber(input.secondaryYMin)) bMin = input.secondaryYMin;
  if (isFiniteNumber(input.secondaryYMax)) bMax = input.secondaryYMax;
  if (xMax < xMin) [xMin, xMax] = [xMax, xMin];
  if (aMax < aMin) [aMin, aMax] = [aMax, aMin];
  if (bMax < bMin) [bMin, bMax] = [bMax, bMin];
  if (xMin === xMax) {
    xMin -= 0.5;
    xMax += 0.5;
  }
  if (aMin === aMax) {
    aMin -= 0.5;
    aMax += 0.5;
  }
  if (bMin === bMax) {
    bMin -= 0.5;
    bMax += 0.5;
  }
  const xRange = xMax - xMin;
  const aRange = aMax - aMin;
  const bRange = bMax - bMin;
  const xToPx = (x: number): number =>
    padding + ((x - xMin) / xRange) * innerWidth;
  const aToPx = (y: number): number =>
    padding + innerHeight - ((y - aMin) / aRange) * innerHeight;
  const bToPx = (y: number): number =>
    padding + innerHeight - ((y - bMin) / bRange) * innerHeight;

  function buildSeries(
    s: ChartLineCorrelationSeries | null,
    axis: 'left' | 'right',
    fallbackColor: string,
    yToPx: (y: number) => number,
    yMin: number,
    yMax: number,
  ): ChartLineCorrelationLayoutSeries | null {
    if (!s) return null;
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineCorrelationLayoutPoint[] = [];
    for (let j = 0; j < arr.length; j += 1) {
      const p = arr[j]!;
      if (!isFinitePoint(p)) continue;
      points.push({
        index: j,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPx(p.y),
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
      axis,
      color: s.color ?? fallbackColor,
      points,
      path,
      finiteCount: points.length,
      totalCount: arr.length,
      yMin,
      yMax,
    };
  }

  const primaryLayout = buildSeries(
    input.primary,
    'left',
    DEFAULT_CHART_LINE_CORRELATION_PRIMARY_COLOR,
    aToPx,
    aMin,
    aMax,
  );
  const secondaryLayout = buildSeries(
    input.secondary,
    'right',
    DEFAULT_CHART_LINE_CORRELATION_SECONDARY_COLOR,
    bToPx,
    bMin,
    bMax,
  );

  const correlation = computeLineCorrelation(
    input.primary,
    input.secondary,
    input.strongThreshold,
    input.moderateThreshold,
    input.weakThreshold,
  );

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_CORRELATION_TICK_COUNT;
  const stepCount = Math.max(2, Math.floor(tickCount));
  const xTicks: { value: number; position: number }[] = [];
  for (let i = 0; i < stepCount; i += 1) {
    const value = xMin + (xRange * i) / (stepCount - 1);
    xTicks.push({
      value,
      position: padding + ((value - xMin) / xRange) * innerWidth,
    });
  }
  const yLeftTicks: { value: number; position: number }[] = [];
  for (let i = 0; i < stepCount; i += 1) {
    const value = aMin + (aRange * i) / (stepCount - 1);
    yLeftTicks.push({
      value,
      position:
        padding + innerHeight - ((value - aMin) / aRange) * innerHeight,
    });
  }
  const yRightTicks: { value: number; position: number }[] = [];
  for (let i = 0; i < stepCount; i += 1) {
    const value = bMin + (bRange * i) / (stepCount - 1);
    yRightTicks.push({
      value,
      position:
        padding + innerHeight - ((value - bMin) / bRange) * innerHeight,
    });
  }

  return {
    primary: primaryLayout,
    secondary: secondaryLayout,
    correlation,
    xTicks,
    yLeftTicks,
    yRightTicks,
    xMin,
    xMax,
    innerWidth,
    innerHeight,
    totalPoints:
      (primaryLayout?.finiteCount ?? 0) +
      (secondaryLayout?.finiteCount ?? 0),
  };
}

export function describeLineCorrelationChart(
  primary: ChartLineCorrelationSeries | undefined | null,
  secondary: ChartLineCorrelationSeries | undefined | null,
  formatValue?: (n: number) => string,
): string {
  if (!primary && !secondary) return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  const correlation = computeLineCorrelation(primary, secondary);
  const pieces: string[] = [];
  if (primary) {
    const n = getLineCorrelationFinitePoints(primary.data ?? []).length;
    pieces.push(`${primary.label} (left axis, ${n} points)`);
  }
  if (secondary) {
    const n = getLineCorrelationFinitePoints(secondary.data ?? []).length;
    pieces.push(`${secondary.label} (right axis, ${n} points)`);
  }
  if (pieces.length === 0) return 'No data';
  if (!correlation.ok) {
    return `Dual-axis correlation chart: ${pieces.join(' and ')}. No correlation computable (need at least 2 paired finite samples with non-zero variance).`;
  }
  return `Dual-axis correlation chart: ${pieces.join(' and ')}. Pearson r = ${fmtV(correlation.r)} (${correlation.strength} ${correlation.direction}) across ${correlation.pairCount} paired samples.`;
}

export interface ChartLineCorrelationPointClick {
  series: ChartLineCorrelationLayoutSeries;
  point: ChartLineCorrelationLayoutPoint;
}

export interface ChartLineCorrelationProps {
  primary: ChartLineCorrelationSeries | null;
  secondary: ChartLineCorrelationSeries | null;
  xMin?: number;
  xMax?: number;
  primaryYMin?: number;
  primaryYMax?: number;
  secondaryYMin?: number;
  secondaryYMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  lineOpacity?: number;
  gridColor?: string;
  axisColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  neutralColor?: string;
  strongThreshold?: number;
  moderateThreshold?: number;
  weakThreshold?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showCorrelationBadge?: boolean;
  showRightAxis?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatR?: (n: number) => string;
  xLabel?: string;
  primaryYLabel?: string;
  secondaryYLabel?: string;
  onPointClick?: (info: ChartLineCorrelationPointClick) => void;
  style?: CSSProperties;
}

export const ChartLineCorrelation = forwardRef(function ChartLineCorrelation(
  {
    primary,
    secondary,
    xMin,
    xMax,
    primaryYMin,
    primaryYMax,
    secondaryYMin,
    secondaryYMax,
    width = DEFAULT_CHART_LINE_CORRELATION_WIDTH,
    height = DEFAULT_CHART_LINE_CORRELATION_HEIGHT,
    padding = DEFAULT_CHART_LINE_CORRELATION_PADDING,
    tickCount = DEFAULT_CHART_LINE_CORRELATION_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CORRELATION_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CORRELATION_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_CORRELATION_LINE_OPACITY,
    gridColor = DEFAULT_CHART_LINE_CORRELATION_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CORRELATION_AXIS_COLOR,
    positiveColor = DEFAULT_CHART_LINE_CORRELATION_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_CORRELATION_NEGATIVE_COLOR,
    neutralColor = DEFAULT_CHART_LINE_CORRELATION_NEUTRAL_COLOR,
    strongThreshold = DEFAULT_CHART_LINE_CORRELATION_STRONG_THRESHOLD,
    moderateThreshold = DEFAULT_CHART_LINE_CORRELATION_MODERATE_THRESHOLD,
    weakThreshold = DEFAULT_CHART_LINE_CORRELATION_WEAK_THRESHOLD,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showCorrelationBadge = true,
    showRightAxis = true,
    animate = true,
    className,
    ariaLabel = 'Dual-axis correlation line chart',
    ariaDescription,
    formatValue,
    formatX,
    formatR,
    xLabel,
    primaryYLabel,
    secondaryYLabel,
    onPointClick,
    style,
  }: ChartLineCorrelationProps,
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
  const fmtR = useCallback(
    (n: number) =>
      formatR
        ? formatR(n)
        : `${n >= 0 ? '+' : ''}${n.toFixed(3)}`,
    [formatR],
  );

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineCorrelationLayout({
        primary,
        secondary,
        ...(xMin !== undefined ? { xMin } : {}),
        ...(xMax !== undefined ? { xMax } : {}),
        ...(primaryYMin !== undefined ? { primaryYMin } : {}),
        ...(primaryYMax !== undefined ? { primaryYMax } : {}),
        ...(secondaryYMin !== undefined ? { secondaryYMin } : {}),
        ...(secondaryYMax !== undefined ? { secondaryYMax } : {}),
        width,
        height,
        padding,
        tickCount,
        strongThreshold,
        moderateThreshold,
        weakThreshold,
      }),
    [
      primary,
      secondary,
      xMin,
      xMax,
      primaryYMin,
      primaryYMax,
      secondaryYMin,
      secondaryYMax,
      width,
      height,
      padding,
      tickCount,
      strongThreshold,
      moderateThreshold,
      weakThreshold,
    ],
  );

  const description =
    ariaDescription ?? describeLineCorrelationChart(primary, secondary, fmtValue);

  const badgeColor = layout.correlation.ok
    ? layout.correlation.direction === 'positive'
      ? positiveColor
      : layout.correlation.direction === 'negative'
        ? negativeColor
        : neutralColor
    : neutralColor;

  const rootClass = [
    'relative inline-block w-full max-w-full text-xs text-slate-700',
    animate ? 'motion-safe:animate-fade-in' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const renderSeries = (s: ChartLineCorrelationLayoutSeries) => {
    const isAnyHovered = hoveredKey !== null;
    const isSeriesHovered =
      isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
    const dim = isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
    return (
      <g
        key={s.id}
        data-section="chart-line-correlation-series-group"
        data-series-id={s.id}
        data-series-axis={s.axis}
        data-series-color={s.color}
        data-series-point-count={s.points.length}
        data-series-finite-count={s.finiteCount}
        data-series-y-min={s.yMin}
        data-series-y-max={s.yMax}
        data-hovered={isSeriesHovered ? 'true' : 'false'}
        style={{ color: s.color }}
      >
        {s.path ? (
          <path
            data-section="chart-line-correlation-path"
            data-series-id={s.id}
            data-series-axis={s.axis}
            role="graphics-symbol"
            tabIndex={0}
            aria-label={`${s.label}: line on ${s.axis} axis with ${s.finiteCount} points`}
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
              const opacity = isAnyHovered && !isHovered ? 0.3 : 1;
              const aria = `${s.label} (${s.axis} axis): x=${fmtX(p.x)}, y=${fmtValue(p.y)}`;
              return (
                <circle
                  key={key}
                  data-section="chart-line-correlation-dot"
                  data-series-id={s.id}
                  data-series-axis={s.axis}
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
      data-section="chart-line-correlation"
      data-total-points={layout.totalPoints}
      data-r={
        layout.correlation.ok ? String(layout.correlation.r) : ''
      }
      data-pair-count={layout.correlation.pairCount}
      data-strength={layout.correlation.strength}
      data-direction={layout.correlation.direction}
      data-correlation-ok={layout.correlation.ok ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-correlation-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-correlation-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-correlation-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-correlation-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-correlation-grid-line"
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
              {layout.yLeftTicks.map((t) => (
                <line
                  key={`grid-y-${t.value}`}
                  data-section="chart-line-correlation-grid-line"
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
            <g data-section="chart-line-correlation-axes">
              <line
                data-section="chart-line-correlation-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-correlation-axis"
                data-axis="y-left"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={
                  layout.primary
                    ? layout.primary.color
                    : axisColor
                }
                strokeWidth={1}
              />
              {showRightAxis ? (
                <line
                  data-section="chart-line-correlation-axis"
                  data-axis="y-right"
                  x1={padding + layout.innerWidth}
                  y1={padding}
                  x2={padding + layout.innerWidth}
                  y2={padding + layout.innerHeight}
                  stroke={
                    layout.secondary
                      ? layout.secondary.color
                      : axisColor
                  }
                  strokeWidth={1}
                />
              ) : null}
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-correlation-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-correlation-tick"
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
                        data-section="chart-line-correlation-tick-label"
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
              {layout.yLeftTicks.length > 0 ? (
                <g
                  data-section="chart-line-correlation-ticks"
                  data-axis="y-left"
                >
                  {layout.yLeftTicks.map((t) => (
                    <g
                      key={`tick-yl-${t.value}`}
                      data-section="chart-line-correlation-tick"
                      data-axis="y-left"
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
                        data-section="chart-line-correlation-tick-label"
                        data-axis="y-left"
                        data-tick-value={t.value}
                        x={padding - 6}
                        y={t.position + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={
                          layout.primary
                            ? layout.primary.color
                            : 'currentColor'
                        }
                      >
                        {fmtValue(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              ) : null}
              {showRightAxis && layout.yRightTicks.length > 0 ? (
                <g
                  data-section="chart-line-correlation-ticks"
                  data-axis="y-right"
                >
                  {layout.yRightTicks.map((t) => (
                    <g
                      key={`tick-yr-${t.value}`}
                      data-section="chart-line-correlation-tick"
                      data-axis="y-right"
                    >
                      <line
                        x1={padding + layout.innerWidth}
                        y1={t.position}
                        x2={padding + layout.innerWidth + 4}
                        y2={t.position}
                        stroke={axisColor}
                        strokeWidth={1}
                      />
                      <text
                        data-section="chart-line-correlation-tick-label"
                        data-axis="y-right"
                        data-tick-value={t.value}
                        x={padding + layout.innerWidth + 6}
                        y={t.position + 3}
                        textAnchor="start"
                        fontSize={10}
                        fill={
                          layout.secondary
                            ? layout.secondary.color
                            : 'currentColor'
                        }
                      >
                        {fmtValue(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              ) : null}
              {xLabel ? (
                <text
                  data-section="chart-line-correlation-x-label"
                  x={padding + layout.innerWidth / 2}
                  y={padding + layout.innerHeight + 30}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                >
                  {xLabel}
                </text>
              ) : null}
              {primaryYLabel ? (
                <text
                  data-section="chart-line-correlation-y-label"
                  data-axis="y-left"
                  x={padding - 32}
                  y={padding + layout.innerHeight / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill={
                    layout.primary ? layout.primary.color : 'currentColor'
                  }
                  transform={`rotate(-90 ${padding - 32} ${padding + layout.innerHeight / 2})`}
                >
                  {primaryYLabel}
                </text>
              ) : null}
              {secondaryYLabel && showRightAxis ? (
                <text
                  data-section="chart-line-correlation-y-label"
                  data-axis="y-right"
                  x={padding + layout.innerWidth + 32}
                  y={padding + layout.innerHeight / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill={
                    layout.secondary
                      ? layout.secondary.color
                      : 'currentColor'
                  }
                  transform={`rotate(90 ${padding + layout.innerWidth + 32} ${padding + layout.innerHeight / 2})`}
                >
                  {secondaryYLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          <g data-section="chart-line-correlation-series">
            {layout.primary ? renderSeries(layout.primary) : null}
            {layout.secondary ? renderSeries(layout.secondary) : null}
          </g>
        </svg>

        {showCorrelationBadge && layout.totalPoints > 0 ? (
          <div
            data-section="chart-line-correlation-badge"
            data-r={layout.correlation.ok ? String(layout.correlation.r) : ''}
            data-strength={layout.correlation.strength}
            data-direction={layout.correlation.direction}
            data-pair-count={layout.correlation.pairCount}
            data-correlation-ok={layout.correlation.ok ? 'true' : 'false'}
            className="pointer-events-none absolute rounded border bg-white px-2 py-1 text-xs shadow"
            style={{
              left: padding + 6,
              top: padding + 6,
              borderColor: badgeColor,
              color: badgeColor,
            }}
          >
            <div data-section="chart-line-correlation-badge-r" className="font-medium">
              r = {layout.correlation.ok ? fmtR(layout.correlation.r) : 'n/a'}
            </div>
            <div
              data-section="chart-line-correlation-badge-strength"
              className="text-[10px]"
            >
              {layout.correlation.ok
                ? `${layout.correlation.strength} ${layout.correlation.direction}`
                : 'no correlation'}
              {' '}
              ({layout.correlation.pairCount} pairs)
            </div>
          </div>
        ) : null}

        {showTooltip && hoveredKey ? (() => {
          const sep = hoveredKey.indexOf('::');
          if (sep < 0) return null;
          const sid = hoveredKey.slice(0, sep);
          const idx = Number(hoveredKey.slice(sep + 2));
          const s =
            layout.primary && layout.primary.id === sid
              ? layout.primary
              : layout.secondary && layout.secondary.id === sid
                ? layout.secondary
                : null;
          if (!s) return null;
          const p = s.points.find((x) => x.index === idx);
          if (!p) return null;
          const tx = Math.min(Math.max(p.px + 8, 0), width - 220);
          const ty = Math.min(Math.max(p.py - 56, 0), height - 80);
          return (
            <div
              data-section="chart-line-correlation-tooltip"
              data-series-id={s.id}
              data-series-axis={s.axis}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 min-w-[200px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-correlation-tooltip-label"
                className="font-medium"
                style={{ color: s.color }}
              >
                {s.label}{' '}
                <span className="text-slate-500">({s.axis} axis)</span>
              </div>
              <div
                data-section="chart-line-correlation-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-correlation-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && (layout.primary || layout.secondary) ? (
        <ul
          data-section="chart-line-correlation-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {layout.primary ? (
            <li
              data-section="chart-line-correlation-legend-item"
              data-series-id={layout.primary.id}
              data-series-axis="left"
            >
              <span className="flex items-center gap-1">
                <span
                  data-section="chart-line-correlation-legend-swatch"
                  className="inline-block h-2 w-3"
                  style={{ backgroundColor: layout.primary.color }}
                />
                <span data-section="chart-line-correlation-legend-label">
                  {layout.primary.label}
                </span>
                <span
                  data-section="chart-line-correlation-legend-axis"
                  className="text-slate-500"
                >
                  (left)
                </span>
              </span>
            </li>
          ) : null}
          {layout.secondary ? (
            <li
              data-section="chart-line-correlation-legend-item"
              data-series-id={layout.secondary.id}
              data-series-axis="right"
            >
              <span className="flex items-center gap-1">
                <span
                  data-section="chart-line-correlation-legend-swatch"
                  className="inline-block h-2 w-3"
                  style={{ backgroundColor: layout.secondary.color }}
                />
                <span data-section="chart-line-correlation-legend-label">
                  {layout.secondary.label}
                </span>
                <span
                  data-section="chart-line-correlation-legend-axis"
                  className="text-slate-500"
                >
                  (right)
                </span>
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
});

ChartLineCorrelation.displayName = 'ChartLineCorrelation';
