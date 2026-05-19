import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_COMPARISON_WIDTH = 560;
export const DEFAULT_CHART_LINE_COMPARISON_HEIGHT = 320;
export const DEFAULT_CHART_LINE_COMPARISON_PADDING = 40;
export const DEFAULT_CHART_LINE_COMPARISON_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_COMPARISON_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_COMPARISON_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_COMPARISON_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_COMPARISON_FILL_OPACITY = 0.2;
export const DEFAULT_CHART_LINE_COMPARISON_PRIMARY_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_COMPARISON_SECONDARY_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_COMPARISON_PRIMARY_ABOVE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_COMPARISON_PRIMARY_BELOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_COMPARISON_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_COMPARISON_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_COMPARISON_PALETTE = [
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

export type ChartLineComparisonTrack = 'primary' | 'secondary';

export interface ChartLineComparisonPoint {
  x: number;
  y: number;
}

export interface ChartLineComparisonSeries {
  id: string;
  label: string;
  data: readonly ChartLineComparisonPoint[];
  color?: string;
}

export interface ChartLineComparisonLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineComparisonLayoutTrack {
  id: string;
  label: string;
  track: ChartLineComparisonTrack;
  color: string;
  points: ChartLineComparisonLayoutPoint[];
  path: string;
  finiteCount: number;
  totalCount: number;
}

export interface ChartLineComparisonRegion {
  index: number;
  startX: number;
  endX: number;
  primaryHigher: boolean;
  path: string;
  fillColor: string;
  area: number;
}

export interface ChartLineComparisonStats {
  primaryHigherCount: number;
  secondaryHigherCount: number;
  equalCount: number;
  maxPrimaryGap: number;
  maxSecondaryGap: number;
  crossingCount: number;
  xUnionCount: number;
}

export interface ComputeLineComparisonLayoutResult {
  primary: ChartLineComparisonLayoutTrack | null;
  secondary: ChartLineComparisonLayoutTrack | null;
  regions: ChartLineComparisonRegion[];
  stats: ChartLineComparisonStats;
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xUnion: number[];
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

function isFinitePoint(p: unknown): p is ChartLineComparisonPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineComparisonPoint).x) &&
    isFiniteNumber((p as ChartLineComparisonPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineComparisonDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_COMPARISON_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_COMPARISON_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_COMPARISON_PALETTE.length
  ]!;
}

export function getLineComparisonFinitePoints(
  points: readonly ChartLineComparisonPoint[],
): ChartLineComparisonPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Builds the sorted unique union of x values across the primary and
 * secondary series. The shading regions are laid between consecutive
 * x values in this union.
 */
export function buildLineComparisonXUnion(
  primary: ChartLineComparisonSeries | undefined | null,
  secondary: ChartLineComparisonSeries | undefined | null,
): number[] {
  const seen = new Set<number>();
  for (const p of getLineComparisonFinitePoints(primary?.data ?? [])) {
    seen.add(p.x);
  }
  for (const p of getLineComparisonFinitePoints(secondary?.data ?? [])) {
    seen.add(p.x);
  }
  return Array.from(seen).sort((a, b) => a - b);
}

/** Returns a `Map<x, y>` of the series's finite samples. */
export function buildLineComparisonYLookup(
  series: ChartLineComparisonSeries | undefined | null,
): Map<number, number> {
  const out = new Map<number, number>();
  if (!series) return out;
  for (const p of getLineComparisonFinitePoints(series.data ?? [])) {
    out.set(p.x, p.y);
  }
  return out;
}

/**
 * Linearly interpolates `y` at `x` given two bracketing pixel-space
 * points (`x1, y1`) and (`x2, y2`). Non-finite inputs return `y1` as
 * a graceful fallback.
 */
export function interpolateLineComparisonY(
  x: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  if (!isFiniteNumber(x) || !isFiniteNumber(x1) || !isFiniteNumber(x2))
    return isFiniteNumber(y1) ? y1 : 0;
  if (x1 === x2) return y1;
  const t = (x - x1) / (x2 - x1);
  return y1 + (y2 - y1) * t;
}

/**
 * Returns the x value at which two line segments cross. Given two
 * segments `primary: (x1, p1) -> (x2, p2)` and `secondary: (x1, s1)
 * -> (x2, s2)`, the crossing x lies at
 *
 *     x* = x1 + (x2 - x1) * |p1 - s1| / (|p1 - s1| + |p2 - s2|)
 *
 * which assumes the segments cross (i.e. `sign(p1 - s1) !== sign(p2 -
 * s2)`). Returns `null` when no crossing exists, when the segment is
 * degenerate, or when inputs are non-finite.
 */
export function findLineComparisonCrossing(
  x1: number,
  p1: number,
  s1: number,
  x2: number,
  p2: number,
  s2: number,
): number | null {
  if (
    !isFiniteNumber(x1) ||
    !isFiniteNumber(p1) ||
    !isFiniteNumber(s1) ||
    !isFiniteNumber(x2) ||
    !isFiniteNumber(p2) ||
    !isFiniteNumber(s2)
  ) {
    return null;
  }
  if (x1 === x2) return null;
  const d1 = p1 - s1;
  const d2 = p2 - s2;
  if (d1 === 0 || d2 === 0) return null;
  if (Math.sign(d1) === Math.sign(d2)) return null;
  const a1 = Math.abs(d1);
  const a2 = Math.abs(d2);
  if (a1 + a2 === 0) return null;
  return x1 + (x2 - x1) * (a1 / (a1 + a2));
}

export interface ComputeLineComparisonLayoutInput {
  primary?: ChartLineComparisonSeries | null;
  secondary?: ChartLineComparisonSeries | null;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  primaryAboveColor?: string;
  primaryBelowColor?: string;
}

export function computeLineComparisonLayout(
  input: ComputeLineComparisonLayoutInput,
): ComputeLineComparisonLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeLineComparisonLayoutResult = {
    primary: null,
    secondary: null,
    regions: [],
    stats: {
      primaryHigherCount: 0,
      secondaryHigherCount: 0,
      equalCount: 0,
      maxPrimaryGap: 0,
      maxSecondaryGap: 0,
      crossingCount: 0,
      xUnionCount: 0,
    },
    xTicks: [],
    yTicks: [],
    xUnion: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!input.primary && !input.secondary) return empty;

  // Bounds across both series.
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  const collectBounds = (s: ChartLineComparisonSeries | undefined | null) => {
    if (!s) return;
    for (const p of getLineComparisonFinitePoints(s.data ?? [])) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      any = true;
    }
  };
  collectBounds(input.primary);
  collectBounds(input.secondary);
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

  const primaryAbove =
    input.primaryAboveColor ??
    DEFAULT_CHART_LINE_COMPARISON_PRIMARY_ABOVE_COLOR;
  const primaryBelow =
    input.primaryBelowColor ??
    DEFAULT_CHART_LINE_COMPARISON_PRIMARY_BELOW_COLOR;

  function buildTrack(
    s: ChartLineComparisonSeries | undefined | null,
    track: ChartLineComparisonTrack,
    fallback: string,
  ): ChartLineComparisonLayoutTrack | null {
    if (!s) return null;
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineComparisonLayoutPoint[] = [];
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
    let path = '';
    if (points.length > 0) {
      path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
      for (let i = 1; i < points.length; i += 1) {
        path += ` L ${fmt(points[i]!.px)} ${fmt(points[i]!.py)}`;
      }
    }
    return {
      id: s.id,
      label: s.label,
      track,
      color: s.color ?? fallback,
      points,
      path,
      finiteCount: points.length,
      totalCount: arr.length,
    };
  }

  const primary = buildTrack(
    input.primary,
    'primary',
    DEFAULT_CHART_LINE_COMPARISON_PRIMARY_COLOR,
  );
  const secondary = buildTrack(
    input.secondary,
    'secondary',
    DEFAULT_CHART_LINE_COMPARISON_SECONDARY_COLOR,
  );

  // Regions require BOTH series to compare against.
  const xUnion = buildLineComparisonXUnion(input.primary, input.secondary);
  const pLookup = buildLineComparisonYLookup(input.primary);
  const sLookup = buildLineComparisonYLookup(input.secondary);

  let primaryHigherCount = 0;
  let secondaryHigherCount = 0;
  let equalCount = 0;
  let maxPrimaryGap = 0;
  let maxSecondaryGap = 0;
  for (const x of xUnion) {
    const p = pLookup.get(x);
    const s = sLookup.get(x);
    if (!isFiniteNumber(p) || !isFiniteNumber(s)) continue;
    const d = p - s;
    if (d > 0) {
      primaryHigherCount += 1;
      if (d > maxPrimaryGap) maxPrimaryGap = d;
    } else if (d < 0) {
      secondaryHigherCount += 1;
      if (-d > maxSecondaryGap) maxSecondaryGap = -d;
    } else {
      equalCount += 1;
    }
  }

  const regions: ChartLineComparisonRegion[] = [];
  let crossingCount = 0;
  for (let i = 0; i < xUnion.length - 1; i += 1) {
    const x1 = xUnion[i]!;
    const x2 = xUnion[i + 1]!;
    const p1 = pLookup.get(x1);
    const p2 = pLookup.get(x2);
    const s1 = sLookup.get(x1);
    const s2 = sLookup.get(x2);
    if (
      !isFiniteNumber(p1) ||
      !isFiniteNumber(p2) ||
      !isFiniteNumber(s1) ||
      !isFiniteNumber(s2)
    ) {
      continue;
    }
    const crossing = findLineComparisonCrossing(x1, p1, s1, x2, p2, s2);
    const emit = (
      startX: number,
      startP: number,
      startS: number,
      endX: number,
      endP: number,
      endS: number,
      primaryHigher: boolean,
    ): void => {
      const fillColor = primaryHigher ? primaryAbove : primaryBelow;
      const px1 = xToPx(startX);
      const px2 = xToPx(endX);
      const py1p = yToPx(startP);
      const py1s = yToPx(startS);
      const py2p = yToPx(endP);
      const py2s = yToPx(endS);
      // Polygon: primary top going right, secondary bottom going left.
      const path =
        `M ${fmt(px1)} ${fmt(py1p)} L ${fmt(px2)} ${fmt(py2p)} ` +
        `L ${fmt(px2)} ${fmt(py2s)} L ${fmt(px1)} ${fmt(py1s)} Z`;
      const meanGap = (Math.abs(startP - startS) + Math.abs(endP - endS)) / 2;
      const area = meanGap * Math.abs(endX - startX);
      regions.push({
        index: regions.length,
        startX,
        endX,
        primaryHigher,
        path,
        fillColor,
        area,
      });
    };
    if (crossing !== null) {
      crossingCount += 1;
      const yAtCrossPrimary = interpolateLineComparisonY(
        crossing,
        x1,
        p1,
        x2,
        p2,
      );
      const yAtCrossSecondary = interpolateLineComparisonY(
        crossing,
        x1,
        s1,
        x2,
        s2,
      );
      const firstPrimaryHigher = p1 - s1 > 0;
      emit(
        x1,
        p1,
        s1,
        crossing,
        yAtCrossPrimary,
        yAtCrossSecondary,
        firstPrimaryHigher,
      );
      emit(
        crossing,
        yAtCrossPrimary,
        yAtCrossSecondary,
        x2,
        p2,
        s2,
        !firstPrimaryHigher,
      );
    } else {
      const primaryHigher = p1 - s1 > 0 || p2 - s2 > 0;
      emit(x1, p1, s1, x2, p2, s2, primaryHigher);
    }
  }

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_COMPARISON_TICK_COUNT;
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
    primary,
    secondary,
    regions,
    stats: {
      primaryHigherCount,
      secondaryHigherCount,
      equalCount,
      maxPrimaryGap,
      maxSecondaryGap,
      crossingCount,
      xUnionCount: xUnion.length,
    },
    xTicks,
    yTicks,
    xUnion,
    xMin,
    xMax,
    yMin,
    yMax,
    innerWidth,
    innerHeight,
  };
}

export function describeLineComparisonChart(
  primary: ChartLineComparisonSeries | undefined | null,
  secondary: ChartLineComparisonSeries | undefined | null,
  formatValue?: (n: number) => string,
): string {
  if (!primary && !secondary) return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  const xUnion = buildLineComparisonXUnion(primary, secondary);
  const pLookup = buildLineComparisonYLookup(primary);
  const sLookup = buildLineComparisonYLookup(secondary);
  let primaryHigher = 0;
  let secondaryHigher = 0;
  let equal = 0;
  let maxPrimaryGap = 0;
  let maxSecondaryGap = 0;
  let any = false;
  for (const x of xUnion) {
    const p = pLookup.get(x);
    const s = sLookup.get(x);
    if (!isFiniteNumber(p) || !isFiniteNumber(s)) continue;
    any = true;
    const d = p - s;
    if (d > 0) {
      primaryHigher += 1;
      if (d > maxPrimaryGap) maxPrimaryGap = d;
    } else if (d < 0) {
      secondaryHigher += 1;
      if (-d > maxSecondaryGap) maxSecondaryGap = -d;
    } else {
      equal += 1;
    }
  }
  if (!any) return 'No data';
  const pLabel = primary?.label ?? 'primary';
  const sLabel = secondary?.label ?? 'secondary';
  return `Comparison line chart between ${pLabel} and ${sLabel} across ${xUnion.length} x samples: ${primaryHigher} where ${pLabel} higher, ${secondaryHigher} where ${sLabel} higher, ${equal} equal. Peak ${pLabel} gap ${fmtV(maxPrimaryGap)}, peak ${sLabel} gap ${fmtV(maxSecondaryGap)}.`;
}

export interface ChartLineComparisonPointClick {
  track: ChartLineComparisonLayoutTrack;
  point: ChartLineComparisonLayoutPoint;
}

export interface ChartLineComparisonRegionClick {
  region: ChartLineComparisonRegion;
}

export interface ChartLineComparisonProps {
  primary: ChartLineComparisonSeries | null;
  secondary: ChartLineComparisonSeries | null;
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
  fillOpacity?: number;
  primaryAboveColor?: string;
  primaryBelowColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showRegions?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineComparisonPointClick) => void;
  onRegionClick?: (info: ChartLineComparisonRegionClick) => void;
  style?: CSSProperties;
}

export const ChartLineComparison = forwardRef(function ChartLineComparison(
  {
    primary,
    secondary,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_COMPARISON_WIDTH,
    height = DEFAULT_CHART_LINE_COMPARISON_HEIGHT,
    padding = DEFAULT_CHART_LINE_COMPARISON_PADDING,
    tickCount = DEFAULT_CHART_LINE_COMPARISON_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_COMPARISON_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_COMPARISON_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_COMPARISON_LINE_OPACITY,
    fillOpacity = DEFAULT_CHART_LINE_COMPARISON_FILL_OPACITY,
    primaryAboveColor = DEFAULT_CHART_LINE_COMPARISON_PRIMARY_ABOVE_COLOR,
    primaryBelowColor = DEFAULT_CHART_LINE_COMPARISON_PRIMARY_BELOW_COLOR,
    gridColor = DEFAULT_CHART_LINE_COMPARISON_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_COMPARISON_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showRegions = true,
    animate = true,
    className,
    ariaLabel = 'Comparison line chart',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    onRegionClick,
    style,
  }: ChartLineComparisonProps,
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

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineComparisonLayout({
        primary,
        secondary,
        ...(xMin !== undefined ? { xMin } : {}),
        ...(xMax !== undefined ? { xMax } : {}),
        ...(yMin !== undefined ? { yMin } : {}),
        ...(yMax !== undefined ? { yMax } : {}),
        width,
        height,
        padding,
        tickCount,
        primaryAboveColor,
        primaryBelowColor,
      }),
    [
      primary,
      secondary,
      xMin,
      xMax,
      yMin,
      yMax,
      width,
      height,
      padding,
      tickCount,
      primaryAboveColor,
      primaryBelowColor,
    ],
  );

  const description =
    ariaDescription ??
    describeLineComparisonChart(primary, secondary, fmtValue);

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
      data-section="chart-line-comparison"
      data-x-union-count={layout.stats.xUnionCount}
      data-region-count={layout.regions.length}
      data-crossing-count={layout.stats.crossingCount}
      data-primary-higher-count={layout.stats.primaryHigherCount}
      data-secondary-higher-count={layout.stats.secondaryHigherCount}
      data-equal-count={layout.stats.equalCount}
      data-max-primary-gap={layout.stats.maxPrimaryGap}
      data-max-secondary-gap={layout.stats.maxSecondaryGap}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-comparison-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-comparison-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-comparison-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-comparison-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-comparison-grid-line"
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
                  data-section="chart-line-comparison-grid-line"
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
            <g data-section="chart-line-comparison-axes">
              <line
                data-section="chart-line-comparison-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-comparison-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-comparison-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-comparison-tick"
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
                        data-section="chart-line-comparison-tick-label"
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
                <g data-section="chart-line-comparison-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-comparison-tick"
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
                        data-section="chart-line-comparison-tick-label"
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
                  data-section="chart-line-comparison-x-label"
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
                  data-section="chart-line-comparison-y-label"
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

          {showRegions && layout.regions.length > 0 ? (
            <g data-section="chart-line-comparison-regions">
              {layout.regions.map((r) => (
                <path
                  key={`region-${r.index}`}
                  data-section="chart-line-comparison-region"
                  data-region-index={r.index}
                  data-region-start={r.startX}
                  data-region-end={r.endX}
                  data-region-primary-higher={r.primaryHigher ? 'true' : 'false'}
                  data-region-fill-color={r.fillColor}
                  data-region-area={r.area}
                  d={r.path}
                  fill={r.fillColor}
                  fillOpacity={fillOpacity}
                  stroke="none"
                  onClick={() => {
                    if (onRegionClick) onRegionClick({ region: r });
                  }}
                />
              ))}
            </g>
          ) : null}

          <g data-section="chart-line-comparison-tracks">
            {[layout.primary, layout.secondary]
              .filter(
                (t): t is ChartLineComparisonLayoutTrack => t !== null,
              )
              .map((t) => {
                const isAnyHovered = hoveredKey !== null;
                const isTrackHovered =
                  isAnyHovered && hoveredKey!.startsWith(`${t.track}::`);
                const dim =
                  isAnyHovered && !isTrackHovered ? 0.3 : lineOpacity;
                return (
                  <g
                    key={t.track}
                    data-section="chart-line-comparison-track-group"
                    data-track={t.track}
                    data-series-id={t.id}
                    data-series-color={t.color}
                    data-series-point-count={t.points.length}
                    data-series-finite-count={t.finiteCount}
                    data-hovered={isTrackHovered ? 'true' : 'false'}
                    style={{ color: t.color }}
                  >
                    <path
                      data-section="chart-line-comparison-path"
                      data-track={t.track}
                      data-series-id={t.id}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${t.label} (${t.track} track): line with ${t.finiteCount} points`}
                      d={t.path}
                      fill="none"
                      stroke={t.color}
                      strokeOpacity={dim}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {showDots
                      ? t.points.map((p) => {
                          const key = `${t.track}::${p.index}`;
                          const isHovered = hoveredKey === key;
                          const dotOpacity =
                            isAnyHovered && !isHovered ? 0.3 : 1;
                          const aria = `${t.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)}`;
                          return (
                            <circle
                              key={key}
                              data-section="chart-line-comparison-dot"
                              data-track={t.track}
                              data-series-id={t.id}
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
                              fill={t.color}
                              fillOpacity={dotOpacity}
                              stroke={t.color}
                              strokeWidth={1}
                              onMouseEnter={() => setHoveredKey(key)}
                              onMouseLeave={() => setHoveredKey(null)}
                              onFocus={() => setHoveredKey(key)}
                              onBlur={() => setHoveredKey(null)}
                              onClick={() => {
                                if (onPointClick) {
                                  onPointClick({ track: t, point: p });
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
          const trackName = hoveredKey.slice(0, sep) as ChartLineComparisonTrack;
          const idx = Number(hoveredKey.slice(sep + 2));
          const t =
            trackName === 'primary' ? layout.primary : layout.secondary;
          if (!t) return null;
          const p = t.points.find((x) => x.index === idx);
          if (!p) return null;
          const other =
            trackName === 'primary' ? layout.secondary : layout.primary;
          let otherY: number | null = null;
          if (other) {
            const match = other.points.find((x) => x.x === p.x);
            otherY = match ? match.y : null;
          }
          const delta = otherY !== null ? p.y - otherY : null;
          const tx = Math.min(Math.max(p.px + 8, 0), width - 200);
          const ty = Math.min(Math.max(p.py - 48, 0), height - 64);
          return (
            <div
              data-section="chart-line-comparison-tooltip"
              data-track={trackName}
              data-series-id={t.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 min-w-[180px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-comparison-tooltip-label"
                className="font-medium"
              >
                {t.label}
              </div>
              <div
                data-section="chart-line-comparison-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-comparison-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
              {delta !== null ? (
                <div
                  data-section="chart-line-comparison-tooltip-delta"
                  className="text-slate-500"
                >
                  vs {other?.label}: {delta > 0 ? '+' : ''}
                  {fmtValue(delta)}
                </div>
              ) : null}
            </div>
          );
        })() : null}
      </div>

      {showLegend && (layout.primary || layout.secondary) ? (
        <ul
          data-section="chart-line-comparison-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {layout.primary ? (
            <li
              data-section="chart-line-comparison-legend-item"
              data-track="primary"
              data-series-id={layout.primary.id}
            >
              <span className="flex items-center gap-1">
                <span
                  data-section="chart-line-comparison-legend-swatch"
                  className="inline-block h-2 w-3"
                  style={{ backgroundColor: layout.primary.color }}
                />
                <span data-section="chart-line-comparison-legend-label">
                  {layout.primary.label}
                </span>
              </span>
            </li>
          ) : null}
          {layout.secondary ? (
            <li
              data-section="chart-line-comparison-legend-item"
              data-track="secondary"
              data-series-id={layout.secondary.id}
            >
              <span className="flex items-center gap-1">
                <span
                  data-section="chart-line-comparison-legend-swatch"
                  className="inline-block h-2 w-3"
                  style={{ backgroundColor: layout.secondary.color }}
                />
                <span data-section="chart-line-comparison-legend-label">
                  {layout.secondary.label}
                </span>
              </span>
            </li>
          ) : null}
          {showRegions && layout.primary && layout.secondary ? (
            <>
              <li
                data-section="chart-line-comparison-legend-region"
                data-region-direction="primary-higher"
              >
                <span className="flex items-center gap-1">
                  <span
                    data-section="chart-line-comparison-legend-region-swatch"
                    className="inline-block h-3 w-4"
                    style={{
                      backgroundColor: primaryAboveColor,
                      opacity: fillOpacity,
                    }}
                  />
                  <span data-section="chart-line-comparison-legend-region-label">
                    {layout.primary.label} higher
                  </span>
                </span>
              </li>
              <li
                data-section="chart-line-comparison-legend-region"
                data-region-direction="secondary-higher"
              >
                <span className="flex items-center gap-1">
                  <span
                    data-section="chart-line-comparison-legend-region-swatch"
                    className="inline-block h-3 w-4"
                    style={{
                      backgroundColor: primaryBelowColor,
                      opacity: fillOpacity,
                    }}
                  />
                  <span data-section="chart-line-comparison-legend-region-label">
                    {layout.secondary.label} higher
                  </span>
                </span>
              </li>
            </>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
});

ChartLineComparison.displayName = 'ChartLineComparison';
