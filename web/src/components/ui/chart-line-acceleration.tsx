import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ACCELERATION_WIDTH = 560;
export const DEFAULT_CHART_LINE_ACCELERATION_HEIGHT = 320;
export const DEFAULT_CHART_LINE_ACCELERATION_PADDING = 40;
export const DEFAULT_CHART_LINE_ACCELERATION_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ACCELERATION_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_ACCELERATION_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ACCELERATION_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_ACCELERATION_FILL_OPACITY = 0.18;
export const DEFAULT_CHART_LINE_ACCELERATION_ZERO_DASH = '4 3';
export const DEFAULT_CHART_LINE_ACCELERATION_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ACCELERATION_POSITIVE_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_ACCELERATION_NEGATIVE_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_ACCELERATION_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ACCELERATION_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ACCELERATION_PALETTE = [
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

export type ChartLineAccelerationMode = 'center' | 'left' | 'right';
export const DEFAULT_CHART_LINE_ACCELERATION_MODE: ChartLineAccelerationMode =
  'center';
export const ALL_CHART_LINE_ACCELERATION_MODES: readonly ChartLineAccelerationMode[] =
  ['center', 'left', 'right'];

export interface ChartLineAccelerationPoint {
  x: number;
  y: number;
}

export interface ChartLineAccelerationSeries {
  id: string;
  label: string;
  data: readonly ChartLineAccelerationPoint[];
  color?: string;
  mode?: ChartLineAccelerationMode;
}

export interface ChartLineAccelerationSample {
  index: number;
  x: number;
  acceleration: number;
  leftIndex: number;
  leftX: number;
  leftY: number;
  midIndex: number;
  midX: number;
  midY: number;
  rightIndex: number;
  rightX: number;
  rightY: number;
  velocityLeft: number;
  velocityRight: number;
}

export interface ChartLineAccelerationStats {
  finiteCount: number;
  maxAcceleration: number;
  minAcceleration: number;
  averageAcceleration: number;
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  totalAbsoluteArea: number;
}

export interface ChartLineAccelerationLayoutSample {
  index: number;
  x: number;
  acceleration: number;
  px: number;
  py: number;
  isPositive: boolean;
  isNegative: boolean;
  leftIndex: number;
  midIndex: number;
  rightIndex: number;
}

export interface ChartLineAccelerationLayoutRegion {
  index: number;
  startX: number;
  endX: number;
  startAcceleration: number;
  endAcceleration: number;
  isPositive: boolean;
  path: string;
  fillColor: string;
  area: number;
}

export interface ChartLineAccelerationLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  mode: ChartLineAccelerationMode;
  samples: ChartLineAccelerationLayoutSample[];
  regions: ChartLineAccelerationLayoutRegion[];
  path: string;
  stats: ChartLineAccelerationStats;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineAccelerationLayoutResult {
  series: ChartLineAccelerationLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zeroY: number;
  innerWidth: number;
  innerHeight: number;
  totalSamples: number;
  visibleSeriesCount: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineAccelerationPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineAccelerationPoint).x) &&
    isFiniteNumber((p as ChartLineAccelerationPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineAccelerationDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_ACCELERATION_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_ACCELERATION_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_ACCELERATION_PALETTE.length
  ]!;
}

export function getLineAccelerationFinitePoints(
  points: readonly ChartLineAccelerationPoint[],
): ChartLineAccelerationPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Computes the per-triple discrete second derivative ("acceleration")
 * of a sample series sorted by x ascending.
 *
 * For three consecutive finite samples `(x_a, y_a)`, `(x_b, y_b)`,
 * `(x_c, y_c)` we compute:
 *
 *     v_left  = (y_b - y_a) / (x_b - x_a)
 *     v_right = (y_c - y_b) / (x_c - x_b)
 *     a       = (v_right - v_left) / ((x_c - x_a) / 2)
 *
 * which equals the standard non-uniform finite-difference second
 * derivative anchored at the middle index. The output `x` is anchored
 * according to `mode`:
 *
 * - `'center'` (default): `x = x_b`.
 * - `'left'`: `x = x_a`.
 * - `'right'`: `x = x_c`.
 *
 * Returns `(n - 2)` samples for `n` finite inputs. Drops triples where
 * any of the segment dx values is zero. Non-finite samples are
 * dropped before walking. Non-array input -> `[]`. Less than three
 * finite samples -> `[]`.
 *
 * The output's `index` field is the position in the OUTPUT array.
 * `leftIndex` / `midIndex` / `rightIndex` reference the ORIGINAL
 * input array.
 */
export function computeAcceleration(
  points: readonly ChartLineAccelerationPoint[] | undefined | null,
  mode: ChartLineAccelerationMode = DEFAULT_CHART_LINE_ACCELERATION_MODE,
): ChartLineAccelerationSample[] {
  if (!Array.isArray(points)) return [];
  const indexed: { p: ChartLineAccelerationPoint; original: number }[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    if (!isFinitePoint(p)) continue;
    indexed.push({ p, original: i });
  }
  indexed.sort((a, b) => a.p.x - b.p.x);
  if (indexed.length < 3) return [];
  const out: ChartLineAccelerationSample[] = [];
  for (let i = 1; i < indexed.length - 1; i += 1) {
    const a = indexed[i - 1]!;
    const b = indexed[i]!;
    const c = indexed[i + 1]!;
    const dxLeft = b.p.x - a.p.x;
    const dxRight = c.p.x - b.p.x;
    const dxTotal = c.p.x - a.p.x;
    if (dxLeft === 0 || dxRight === 0 || dxTotal === 0) continue;
    const vLeft = (b.p.y - a.p.y) / dxLeft;
    const vRight = (c.p.y - b.p.y) / dxRight;
    const accel = (vRight - vLeft) / (dxTotal / 2);
    let anchor: number;
    if (mode === 'left') anchor = a.p.x;
    else if (mode === 'right') anchor = c.p.x;
    else anchor = b.p.x;
    out.push({
      index: out.length,
      x: anchor,
      acceleration: accel,
      leftIndex: a.original,
      leftX: a.p.x,
      leftY: a.p.y,
      midIndex: b.original,
      midX: b.p.x,
      midY: b.p.y,
      rightIndex: c.original,
      rightX: c.p.x,
      rightY: c.p.y,
      velocityLeft: vLeft,
      velocityRight: vRight,
    });
  }
  return out;
}

/**
 * Returns the x value at which a line segment between two
 * acceleration samples crosses the y=0 baseline. Uses the
 * absolute-value proportion `x1 + (x2 - x1) * |a1| / (|a1| + |a2|)`.
 *
 * Returns `null` when the segment is degenerate, both endpoints are
 * on the same side, either endpoint sits on zero, or inputs are
 * non-finite.
 */
export function findLineAccelerationZeroCrossing(
  x1: number,
  a1: number,
  x2: number,
  a2: number,
): number | null {
  if (
    !isFiniteNumber(x1) ||
    !isFiniteNumber(a1) ||
    !isFiniteNumber(x2) ||
    !isFiniteNumber(a2)
  ) {
    return null;
  }
  if (x1 === x2) return null;
  if (a1 === 0 || a2 === 0) return null;
  if (Math.sign(a1) === Math.sign(a2)) return null;
  const aa = Math.abs(a1);
  const bb = Math.abs(a2);
  if (aa + bb === 0) return null;
  return x1 + (x2 - x1) * (aa / (aa + bb));
}

export function computeLineAccelerationStats(
  samples: readonly ChartLineAccelerationSample[],
): ChartLineAccelerationStats {
  if (!Array.isArray(samples) || samples.length === 0) {
    return {
      finiteCount: 0,
      maxAcceleration: 0,
      minAcceleration: 0,
      averageAcceleration: 0,
      positiveCount: 0,
      negativeCount: 0,
      zeroCount: 0,
      totalAbsoluteArea: 0,
    };
  }
  let maxA = Number.NEGATIVE_INFINITY;
  let minA = Number.POSITIVE_INFINITY;
  let sum = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let zeroCount = 0;
  let totalAbsoluteArea = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i]!;
    if (s.acceleration > maxA) maxA = s.acceleration;
    if (s.acceleration < minA) minA = s.acceleration;
    sum += s.acceleration;
    if (s.acceleration > 0) positiveCount += 1;
    else if (s.acceleration < 0) negativeCount += 1;
    else zeroCount += 1;
    if (i > 0) {
      const prev = samples[i - 1]!;
      const a = Math.abs(prev.acceleration);
      const b = Math.abs(s.acceleration);
      const dx = Math.abs(s.x - prev.x);
      totalAbsoluteArea += ((a + b) / 2) * dx;
    }
  }
  return {
    finiteCount: samples.length,
    maxAcceleration: maxA === Number.NEGATIVE_INFINITY ? 0 : maxA,
    minAcceleration: minA === Number.POSITIVE_INFINITY ? 0 : minA,
    averageAcceleration: sum / samples.length,
    positiveCount,
    negativeCount,
    zeroCount,
    totalAbsoluteArea,
  };
}

export interface ComputeLineAccelerationLayoutInput {
  series: readonly ChartLineAccelerationSeries[];
  mode?: ChartLineAccelerationMode;
  hiddenSeries?: ReadonlySet<string> | null;
  showSignFill?: boolean;
  positiveColor?: string;
  negativeColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineAccelerationLayout(
  input: ComputeLineAccelerationLayoutInput,
): ComputeLineAccelerationLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const empty: ComputeLineAccelerationLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    zeroY: 0,
    innerWidth,
    innerHeight,
    totalSamples: 0,
    visibleSeriesCount: 0,
  };
  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const seriesArr = Array.isArray(input.series) ? input.series : [];
  if (seriesArr.length === 0) return empty;
  const hidden = input.hiddenSeries ?? null;
  const visible = seriesArr.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return empty;
  const defaultMode = input.mode ?? DEFAULT_CHART_LINE_ACCELERATION_MODE;
  const positiveColor =
    input.positiveColor ?? DEFAULT_CHART_LINE_ACCELERATION_POSITIVE_COLOR;
  const negativeColor =
    input.negativeColor ?? DEFAULT_CHART_LINE_ACCELERATION_NEGATIVE_COLOR;

  const intermediates: {
    s: ChartLineAccelerationSeries;
    originalIndex: number;
    mode: ChartLineAccelerationMode;
    samples: ChartLineAccelerationSample[];
  }[] = [];
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const mode = s.mode ?? defaultMode;
    const samples = computeAcceleration(s.data ?? [], mode);
    intermediates.push({ s, originalIndex: i, mode, samples });
    for (const sample of samples) {
      if (sample.x < xMin) xMin = sample.x;
      if (sample.x > xMax) xMax = sample.x;
      if (sample.acceleration < yMin) yMin = sample.acceleration;
      if (sample.acceleration > yMax) yMax = sample.acceleration;
      any = true;
    }
  }
  // Always include y=0 so the sign reference is visible.
  if (0 < yMin) yMin = 0;
  if (0 > yMax) yMax = 0;
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
  const wantFill = input.showSignFill !== false;

  const layoutSeries: ChartLineAccelerationLayoutSeries[] = [];
  let totalSamples = 0;
  for (const it of intermediates) {
    const samples: ChartLineAccelerationLayoutSample[] = it.samples.map(
      (s) => ({
        index: s.index,
        x: s.x,
        acceleration: s.acceleration,
        px: xToPx(s.x),
        py: yToPx(s.acceleration),
        isPositive: s.acceleration > 0,
        isNegative: s.acceleration < 0,
        leftIndex: s.leftIndex,
        midIndex: s.midIndex,
        rightIndex: s.rightIndex,
      }),
    );
    let path = '';
    if (samples.length > 0) {
      path = `M ${fmt(samples[0]!.px)} ${fmt(samples[0]!.py)}`;
      for (let j = 1; j < samples.length; j += 1) {
        path += ` L ${fmt(samples[j]!.px)} ${fmt(samples[j]!.py)}`;
      }
    }
    const regions: ChartLineAccelerationLayoutRegion[] = [];
    if (wantFill) {
      for (let j = 0; j < it.samples.length - 1; j += 1) {
        const a = it.samples[j]!;
        const b = it.samples[j + 1]!;
        const crossing = findLineAccelerationZeroCrossing(
          a.x,
          a.acceleration,
          b.x,
          b.acceleration,
        );
        const emit = (
          startX: number,
          startA: number,
          endX: number,
          endA: number,
          isPositive: boolean,
        ): void => {
          if (startX === endX) return;
          const px1 = xToPx(startX);
          const px2 = xToPx(endX);
          const py1 = yToPx(startA);
          const py2 = yToPx(endA);
          const fillColor = isPositive ? positiveColor : negativeColor;
          const regionPath =
            `M ${fmt(px1)} ${fmt(py1)} L ${fmt(px2)} ${fmt(py2)} ` +
            `L ${fmt(px2)} ${fmt(zeroY)} L ${fmt(px1)} ${fmt(zeroY)} Z`;
          const dxAbs = Math.abs(endX - startX);
          const area =
            (Math.abs(startA) + Math.abs(endA)) / 2 * dxAbs;
          regions.push({
            index: regions.length,
            startX,
            endX,
            startAcceleration: startA,
            endAcceleration: endA,
            isPositive,
            path: regionPath,
            fillColor,
            area,
          });
        };
        if (crossing === null) {
          if (a.acceleration === 0 && b.acceleration === 0) continue;
          const isPositive = a.acceleration > 0 || b.acceleration > 0;
          emit(a.x, a.acceleration, b.x, b.acceleration, isPositive);
        } else {
          const firstPositive = a.acceleration > 0;
          emit(a.x, a.acceleration, crossing, 0, firstPositive);
          emit(crossing, 0, b.x, b.acceleration, !firstPositive);
        }
      }
    }
    const stats = computeLineAccelerationStats(it.samples);
    totalSamples += samples.length;
    layoutSeries.push({
      id: it.s.id,
      label: it.s.label,
      index: it.originalIndex,
      color: it.s.color ?? getLineAccelerationDefaultColor(it.originalIndex),
      mode: it.mode,
      samples,
      regions,
      path,
      stats,
      finiteCount: samples.length,
      totalCount: Array.isArray(it.s.data) ? it.s.data.length : 0,
    });
  }

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_ACCELERATION_TICK_COUNT;
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
    totalSamples,
    visibleSeriesCount: visible.length,
  };
}

export function describeLineAccelerationChart(
  series: readonly ChartLineAccelerationSeries[] | undefined | null,
  mode?: ChartLineAccelerationMode,
  hidden?: ReadonlySet<string>,
  formatValue?: (n: number) => string,
): string {
  if (!series || !Array.isArray(series) || series.length === 0)
    return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  const visible = series.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return 'No data';
  const defaultMode = mode ?? DEFAULT_CHART_LINE_ACCELERATION_MODE;
  let any = false;
  let totalSamples = 0;
  const parts: string[] = [];
  for (const s of visible) {
    const samples = computeAcceleration(
      s.data ?? [],
      s.mode ?? defaultMode,
    );
    if (samples.length === 0) continue;
    any = true;
    totalSamples += samples.length;
    const stats = computeLineAccelerationStats(samples);
    parts.push(
      `${s.label}: avg ${fmtV(stats.averageAcceleration)}, max ${fmtV(stats.maxAcceleration)}, min ${fmtV(stats.minAcceleration)} (${stats.positiveCount} accel, ${stats.negativeCount} decel)`,
    );
  }
  if (!any) return 'No data';
  return `Acceleration (second-derivative) line chart across ${visible.length} series (${totalSamples} samples). ${parts.join('; ')}.`;
}

export interface ChartLineAccelerationSampleClick {
  series: ChartLineAccelerationLayoutSeries;
  sample: ChartLineAccelerationLayoutSample;
}

export interface ChartLineAccelerationRegionClick {
  series: ChartLineAccelerationLayoutSeries;
  region: ChartLineAccelerationLayoutRegion;
}

export interface ChartLineAccelerationProps {
  series: readonly ChartLineAccelerationSeries[];
  mode?: ChartLineAccelerationMode;
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
  dotRadius?: number;
  lineOpacity?: number;
  fillOpacity?: number;
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
  showSignFill?: boolean;
  showZeroLine?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatAcceleration?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onSampleClick?: (info: ChartLineAccelerationSampleClick) => void;
  onRegionClick?: (info: ChartLineAccelerationRegionClick) => void;
  style?: CSSProperties;
}

export const ChartLineAcceleration = forwardRef(function ChartLineAcceleration(
  {
    series = [],
    mode = DEFAULT_CHART_LINE_ACCELERATION_MODE,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_ACCELERATION_WIDTH,
    height = DEFAULT_CHART_LINE_ACCELERATION_HEIGHT,
    padding = DEFAULT_CHART_LINE_ACCELERATION_PADDING,
    tickCount = DEFAULT_CHART_LINE_ACCELERATION_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ACCELERATION_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ACCELERATION_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_ACCELERATION_LINE_OPACITY,
    fillOpacity = DEFAULT_CHART_LINE_ACCELERATION_FILL_OPACITY,
    zeroDashArray = DEFAULT_CHART_LINE_ACCELERATION_ZERO_DASH,
    zeroColor = DEFAULT_CHART_LINE_ACCELERATION_ZERO_COLOR,
    positiveColor = DEFAULT_CHART_LINE_ACCELERATION_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_ACCELERATION_NEGATIVE_COLOR,
    gridColor = DEFAULT_CHART_LINE_ACCELERATION_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ACCELERATION_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showSignFill = true,
    showZeroLine = true,
    animate = true,
    className,
    ariaLabel = 'Acceleration (second-derivative) line chart',
    ariaDescription,
    formatValue,
    formatX,
    formatAcceleration,
    xLabel,
    yLabel,
    onSampleClick,
    onRegionClick,
    style,
  }: ChartLineAccelerationProps,
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
  const fmtAccel = useCallback(
    (n: number) =>
      formatAcceleration
        ? formatAcceleration(n)
        : `${n >= 0 ? '+' : ''}${formatValue ? formatValue(n) : n.toFixed(3)}`,
    [formatAcceleration, formatValue],
  );

  const [internalHidden, setInternalHidden] = useState<ReadonlySet<string>>(
    defaultHiddenSeries ?? new Set<string>(),
  );
  const hidden: ReadonlySet<string> =
    hiddenSeries !== undefined ? hiddenSeries : internalHidden;

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineAccelerationLayout({
        series,
        mode,
        hiddenSeries: hidden,
        showSignFill,
        positiveColor,
        negativeColor,
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
      mode,
      hidden,
      showSignFill,
      positiveColor,
      negativeColor,
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
    describeLineAccelerationChart(series, mode, hidden, fmtValue);

  const toggleSeries = useCallback(
    (s: ChartLineAccelerationSeries) => {
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
      data-section="chart-line-acceleration"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-samples={layout.totalSamples}
      data-mode={mode}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-acceleration-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-acceleration-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-acceleration-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-acceleration-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-acceleration-grid-line"
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
                  data-section="chart-line-acceleration-grid-line"
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

          {showSignFill ? (
            <g data-section="chart-line-acceleration-regions">
              {layout.series.flatMap((s) =>
                s.regions.map((r) => (
                  <path
                    key={`region-${s.id}-${r.index}`}
                    data-section="chart-line-acceleration-region"
                    data-series-id={s.id}
                    data-region-index={r.index}
                    data-region-is-positive={r.isPositive ? 'true' : 'false'}
                    data-region-start-x={r.startX}
                    data-region-end-x={r.endX}
                    data-region-fill-color={r.fillColor}
                    data-region-area={r.area}
                    d={r.path}
                    fill={r.fillColor}
                    fillOpacity={fillOpacity}
                    stroke="none"
                    onClick={() => {
                      if (onRegionClick)
                        onRegionClick({ series: s, region: r });
                    }}
                  />
                )),
              )}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-acceleration-axes">
              <line
                data-section="chart-line-acceleration-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-acceleration-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-acceleration-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-acceleration-tick"
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
                        data-section="chart-line-acceleration-tick-label"
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
                <g data-section="chart-line-acceleration-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-acceleration-tick"
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
                        data-section="chart-line-acceleration-tick-label"
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
                  data-section="chart-line-acceleration-x-label"
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
                  data-section="chart-line-acceleration-y-label"
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

          {showZeroLine ? (
            <line
              data-section="chart-line-acceleration-zero-line"
              data-zero-y={layout.zeroY}
              role="graphics-symbol"
              aria-label="Zero-acceleration reference line"
              x1={padding}
              y1={layout.zeroY}
              x2={padding + layout.innerWidth}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeDasharray={zeroDashArray}
              strokeWidth={1}
            />
          ) : null}

          <g data-section="chart-line-acceleration-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-acceleration-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-mode={s.mode}
                  data-series-sample-count={s.samples.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-max-acceleration={s.stats.maxAcceleration}
                  data-series-min-acceleration={s.stats.minAcceleration}
                  data-series-average-acceleration={
                    s.stats.averageAcceleration
                  }
                  data-series-positive-count={s.stats.positiveCount}
                  data-series-negative-count={s.stats.negativeCount}
                  data-series-zero-count={s.stats.zeroCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  {s.path ? (
                    <path
                      data-section="chart-line-acceleration-path"
                      data-series-id={s.id}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label}: acceleration line with ${s.finiteCount} samples`}
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
                    ? s.samples.map((sample) => {
                        const key = `${s.id}::${sample.index}`;
                        const isHovered = hoveredKey === key;
                        const opacity =
                          isAnyHovered && !isHovered ? 0.3 : 1;
                        const fill = sample.isPositive
                          ? positiveColor
                          : sample.isNegative
                            ? negativeColor
                            : s.color;
                        const sign = sample.isPositive
                          ? 'positive'
                          : sample.isNegative
                            ? 'negative'
                            : 'zero';
                        const aria = `${s.label}: x=${fmtX(sample.x)}, acceleration=${fmtAccel(sample.acceleration)}${sample.isPositive ? ' (concave up)' : ''}${sample.isNegative ? ' (concave down)' : ''}`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-acceleration-dot"
                            data-series-id={s.id}
                            data-sample-index={sample.index}
                            data-x={sample.x}
                            data-acceleration={sample.acceleration}
                            data-left-index={sample.leftIndex}
                            data-mid-index={sample.midIndex}
                            data-right-index={sample.rightIndex}
                            data-acceleration-sign={sign}
                            data-hovered={isHovered ? 'true' : 'false'}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={aria}
                            cx={sample.px}
                            cy={sample.py}
                            r={isHovered ? dotRadius + 1 : dotRadius}
                            fill={fill}
                            fillOpacity={opacity}
                            stroke={s.color}
                            strokeWidth={1}
                            onMouseEnter={() => setHoveredKey(key)}
                            onMouseLeave={() => setHoveredKey(null)}
                            onFocus={() => setHoveredKey(key)}
                            onBlur={() => setHoveredKey(null)}
                            onClick={() => {
                              if (onSampleClick) {
                                onSampleClick({ series: s, sample });
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
          const sample = s.samples.find((x) => x.index === idx);
          if (!sample) return null;
          const tx = Math.min(Math.max(sample.px + 8, 0), width - 220);
          const ty = Math.min(Math.max(sample.py - 64, 0), height - 96);
          const sign = sample.isPositive
            ? 'positive'
            : sample.isNegative
              ? 'negative'
              : 'zero';
          const signColor = sample.isPositive
            ? positiveColor
            : sample.isNegative
              ? negativeColor
              : 'inherit';
          return (
            <div
              data-section="chart-line-acceleration-tooltip"
              data-series-id={s.id}
              data-sample-index={sample.index}
              data-acceleration-sign={sign}
              className="pointer-events-none absolute z-10 min-w-[220px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-acceleration-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-acceleration-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(sample.x)}
              </div>
              <div
                data-section="chart-line-acceleration-tooltip-acceleration"
                style={{ color: signColor, fontWeight: 600 }}
              >
                acceleration: {fmtAccel(sample.acceleration)}
                {sample.isPositive ? ' (concave up)' : ''}
                {sample.isNegative ? ' (concave down)' : ''}
              </div>
              <div
                data-section="chart-line-acceleration-tooltip-mode"
                className="text-slate-500"
              >
                mode: {s.mode} (from #{sample.leftIndex} - #{sample.midIndex} - #
                {sample.rightIndex})
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-acceleration-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            const visEntry = layout.series.find((ls) => ls.id === s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-acceleration-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-acceleration-legend-button"
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
                    data-section="chart-line-acceleration-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineAccelerationDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-acceleration-legend-label">
                    {s.label}
                  </span>
                  {visEntry ? (
                    <span
                      data-section="chart-line-acceleration-legend-stats"
                      className="text-slate-500"
                    >
                      ({visEntry.stats.positiveCount}+/
                      {visEntry.stats.negativeCount}-)
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

ChartLineAcceleration.displayName = 'ChartLineAcceleration';
