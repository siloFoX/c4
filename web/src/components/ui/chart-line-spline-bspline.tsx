import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_WIDTH = 560;
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_HEIGHT = 320;
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_PADDING = 40;
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_RAW_STROKE_WIDTH = 1;
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_SMOOTH_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_SAMPLES_PER_SEGMENT = 16;
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_DEGREE = 3;
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_RAW_OPACITY = 0.35;
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_RESIDUAL_OPACITY = 0.55;
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_PALETTE = [
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
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_RAW_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_RESIDUAL_POS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_RESIDUAL_NEG_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_SPLINE_BSPLINE_CONTROL_COLOR = '#cbd5e1';

export type ChartLineSplineBsplineResidualSign =
  | 'positive'
  | 'negative'
  | 'zero';

export interface ChartLineSplineBsplinePoint {
  x: number;
  y: number;
}

export interface ChartLineSplineBsplineSeries {
  id: string;
  label: string;
  data: readonly ChartLineSplineBsplinePoint[];
  color?: string;
  clamp?: boolean;
  samplesPerSegment?: number;
}

export interface ChartLineSplineBsplineSample {
  index: number;
  x: number;
  raw: number;
  smoothed: number | null;
  residual: number | null;
  residualSign: ChartLineSplineBsplineResidualSign;
}

export interface ChartLineSplineBsplineLayoutPoint
  extends ChartLineSplineBsplineSample {
  px: number;
  rawPy: number;
  smoothedPy: number | null;
}

export interface ChartLineSplineBsplineCurveSample {
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineSplineBsplineLayoutSeries {
  id: string;
  label: string;
  color: string;
  clamp: boolean;
  samplesPerSegment: number;
  controlCount: number;
  segmentCount: number;
  curveSampleCount: number;
  points: ChartLineSplineBsplineLayoutPoint[];
  curveSamples: ChartLineSplineBsplineCurveSample[];
  controlPath: string;
  smoothedPath: string;
  residualSegments: {
    index: number;
    px: number;
    rawPy: number;
    smoothedPy: number;
    residual: number;
    sign: ChartLineSplineBsplineResidualSign;
  }[];
  finiteCount: number;
  totalCount: number;
  smoothedValidCount: number;
  positiveResidualCount: number;
  negativeResidualCount: number;
  zeroResidualCount: number;
  rmseResidual: number;
  maxAbsResidual: number;
  finalSmoothed: number | null;
}

export interface ChartLineSplineBsplineLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: { x: number; y: number; width: number; height: number };
  xTicks: number[];
  yTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  series: ChartLineSplineBsplineLayoutSeries[];
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineSplineBsplineLayoutOptions {
  series: readonly ChartLineSplineBsplineSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  clamp?: boolean;
  samplesPerSegment?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineSplineBsplineProps {
  series: readonly ChartLineSplineBsplineSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  clamp?: boolean;
  samplesPerSegment?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  rawStrokeWidth?: number;
  smoothStrokeWidth?: number;
  dotRadius?: number;
  rawOpacity?: number;
  residualOpacity?: number;
  rawColor?: string;
  residualPosColor?: string;
  residualNegColor?: string;
  controlColor?: string;
  gridColor?: string;
  axisColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showRaw?: boolean;
  showControlPolygon?: boolean;
  showResidualSticks?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineSplineBsplineLayoutSeries;
    point: ChartLineSplineBsplineLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineSplineBsplineSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineSplineBsplineDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_SPLINE_BSPLINE_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineSplineBsplineFinitePoints(
  points: readonly ChartLineSplineBsplinePoint[] | null | undefined,
): ChartLineSplineBsplinePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineSplineBsplinePoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineSplineBsplineSamplesPerSegment(
  value: unknown,
): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_CHART_LINE_SPLINE_BSPLINE_SAMPLES_PER_SEGMENT;
  }
  const v = Math.floor(value);
  if (v < 2) return 2;
  if (v > 256) return 256;
  return v;
}

export function classifyLineSplineBsplineResidualSign(
  residual: number | null,
): ChartLineSplineBsplineResidualSign {
  if (residual === null || !isFiniteNumber(residual)) return 'zero';
  if (residual > 0) return 'positive';
  if (residual < 0) return 'negative';
  return 'zero';
}

/**
 * Pad control points for a clamped cubic B-spline so the curve passes
 * through the first and last raw control points. We duplicate the
 * first point twice at the front and the last point twice at the end,
 * since for cubic B-spline the first segment uses control points
 * (P_-2, P_-1, P_0, P_1) and the curve starts at
 *   B(0) = (P_-2 + 4*P_-1 + P_0) / 6
 * which equals P_0 when P_-2 = P_-1 = P_0.
 */
export function buildLineSplineBsplineClampedControlPoints(
  raw: readonly ChartLineSplineBsplinePoint[],
): ChartLineSplineBsplinePoint[] {
  if (raw.length === 0) return [];
  if (raw.length === 1) return [raw[0]!];
  const first = raw[0]!;
  const last = raw[raw.length - 1]!;
  return [first, first, ...raw, last, last];
}

export interface CubicBSplineBezierControls {
  b0: ChartLineSplineBsplinePoint;
  b1: ChartLineSplineBsplinePoint;
  b2: ChartLineSplineBsplinePoint;
  b3: ChartLineSplineBsplinePoint;
}

/**
 * Convert one cubic B-spline segment (4 consecutive control points) to
 * its Bezier-curve equivalent (so we can use SVG `C` commands).
 *
 *   b0 = (P0 + 4*P1 + P2) / 6
 *   b1 = (4*P1 + 2*P2) / 6 = (2*P1 + P2) / 3
 *   b2 = (2*P1 + 4*P2) / 6 = (P1 + 2*P2) / 3
 *   b3 = (P1 + 4*P2 + P3) / 6
 */
export function convertCubicBSplineSegmentToBezier(
  p0: ChartLineSplineBsplinePoint,
  p1: ChartLineSplineBsplinePoint,
  p2: ChartLineSplineBsplinePoint,
  p3: ChartLineSplineBsplinePoint,
): CubicBSplineBezierControls {
  return {
    b0: {
      x: (p0.x + 4 * p1.x + p2.x) / 6,
      y: (p0.y + 4 * p1.y + p2.y) / 6,
    },
    b1: {
      x: (2 * p1.x + p2.x) / 3,
      y: (2 * p1.y + p2.y) / 3,
    },
    b2: {
      x: (p1.x + 2 * p2.x) / 3,
      y: (p1.y + 2 * p2.y) / 3,
    },
    b3: {
      x: (p1.x + 4 * p2.x + p3.x) / 6,
      y: (p1.y + 4 * p2.y + p3.y) / 6,
    },
  };
}

/**
 * Evaluate one cubic B-spline segment at parameter t in [0, 1].
 *
 *   B(t) = (1/6) * [
 *       (1-t)^3 * P0
 *     + (3t^3 - 6t^2 + 4) * P1
 *     + (-3t^3 + 3t^2 + 3t + 1) * P2
 *     + t^3 * P3
 *   ]
 *
 * This is the canonical uniform cubic B-spline basis.
 */
export function evaluateCubicBSplineSegment(
  p0: ChartLineSplineBsplinePoint,
  p1: ChartLineSplineBsplinePoint,
  p2: ChartLineSplineBsplinePoint,
  p3: ChartLineSplineBsplinePoint,
  t: number,
): ChartLineSplineBsplinePoint {
  const u = isFiniteNumber(t) ? Math.max(0, Math.min(1, t)) : 0;
  const oneMinusU = 1 - u;
  const b0 = oneMinusU * oneMinusU * oneMinusU;
  const b1 = 3 * u * u * u - 6 * u * u + 4;
  const b2 = -3 * u * u * u + 3 * u * u + 3 * u + 1;
  const b3 = u * u * u;
  return {
    x:
      (b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x) / 6,
    y:
      (b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y) / 6,
  };
}

/**
 * Sample the full cubic B-spline curve (using clamped control points
 * if `clamp = true`) at `samplesPerSegment` points per segment. Returns
 * an array of (x, y) along the curve in parameter order.
 */
export function sampleLineSplineBsplineCurve(
  raw: readonly ChartLineSplineBsplinePoint[],
  options?: {
    clamp?: boolean;
    samplesPerSegment?: number;
  },
): ChartLineSplineBsplinePoint[] {
  const clamp = options?.clamp !== false;
  const samplesPerSegment = normaliseLineSplineBsplineSamplesPerSegment(
    options?.samplesPerSegment,
  );
  if (raw.length === 0) return [];
  if (raw.length === 1) return [{ ...raw[0]! }];
  const cps = clamp ? buildLineSplineBsplineClampedControlPoints(raw) : raw;
  // Need at least 4 control points to form one cubic segment.
  if (cps.length < 4) return [];
  const result: ChartLineSplineBsplinePoint[] = [];
  // Segments use 4 consecutive control points; segment i covers cps[i..i+3]
  // and there are cps.length - 3 segments.
  const segmentCount = cps.length - 3;
  for (let i = 0; i < segmentCount; i += 1) {
    const p0 = cps[i]!;
    const p1 = cps[i + 1]!;
    const p2 = cps[i + 2]!;
    const p3 = cps[i + 3]!;
    // First segment includes t = 0; later segments exclude t = 0 to
    // avoid duplicating the junction point.
    const tStart = i === 0 ? 0 : 1;
    for (let s = tStart; s <= samplesPerSegment; s += 1) {
      const t = s / samplesPerSegment;
      result.push(evaluateCubicBSplineSegment(p0, p1, p2, p3, t));
    }
  }
  return result;
}

/**
 * Build the SVG path string for the cubic B-spline curve using Bezier
 * commands (each B-spline segment becomes one cubic Bezier `C` command).
 */
export function buildLineSplineBsplineBezierPath(
  raw: readonly ChartLineSplineBsplinePoint[],
  options?: {
    clamp?: boolean;
    project?: (point: ChartLineSplineBsplinePoint) => {
      px: number;
      py: number;
    };
  },
): string {
  const clamp = options?.clamp !== false;
  if (raw.length === 0) return '';
  if (raw.length === 1) {
    const p = raw[0]!;
    const proj = options?.project
      ? options.project(p)
      : { px: p.x, py: p.y };
    return `M ${proj.px.toFixed(3)} ${proj.py.toFixed(3)}`;
  }
  const cps = clamp ? buildLineSplineBsplineClampedControlPoints(raw) : raw;
  if (cps.length < 4) return '';
  const parts: string[] = [];
  let started = false;
  const segmentCount = cps.length - 3;
  for (let i = 0; i < segmentCount; i += 1) {
    const bez = convertCubicBSplineSegmentToBezier(
      cps[i]!,
      cps[i + 1]!,
      cps[i + 2]!,
      cps[i + 3]!,
    );
    const proj0 = options?.project
      ? options.project(bez.b0)
      : { px: bez.b0.x, py: bez.b0.y };
    const proj1 = options?.project
      ? options.project(bez.b1)
      : { px: bez.b1.x, py: bez.b1.y };
    const proj2 = options?.project
      ? options.project(bez.b2)
      : { px: bez.b2.x, py: bez.b2.y };
    const proj3 = options?.project
      ? options.project(bez.b3)
      : { px: bez.b3.x, py: bez.b3.y };
    if (!started) {
      parts.push(`M ${proj0.px.toFixed(3)} ${proj0.py.toFixed(3)}`);
      started = true;
    }
    parts.push(
      `C ${proj1.px.toFixed(3)} ${proj1.py.toFixed(3)}, ${proj2.px.toFixed(3)} ${proj2.py.toFixed(3)}, ${proj3.px.toFixed(3)} ${proj3.py.toFixed(3)}`,
    );
  }
  return parts.join(' ');
}

/**
 * Interpolate the smoothed y-value at `xQuery` using dense curve
 * samples. Assumes curve samples are roughly monotonic in x within
 * adjacent samples (this is the typical case for time-series data,
 * since the spline is parameterised by t and t-ordering matches
 * x-ordering when the control points are x-ordered).
 *
 * Implementation: walk samples from left to right; find the first
 * pair (s, s+1) whose x-range brackets xQuery and linearly interpolate.
 * Returns null when xQuery is outside the curve's x-range.
 */
export function interpolateLineSplineBsplineSmoothedAt(
  samples: readonly ChartLineSplineBsplinePoint[],
  xQuery: number,
): number | null {
  if (!isFiniteNumber(xQuery) || samples.length === 0) return null;
  if (samples.length === 1) {
    const only = samples[0]!;
    if (Math.abs(only.x - xQuery) < 1e-9) return only.y;
    return null;
  }
  // Track the closest-bracket interpolation we find. For typical
  // monotonic-x data this returns the first/only bracket. For tightly
  // looped non-monotonic data this prefers later brackets (which is
  // arbitrary but stable).
  let lastY: number | null = null;
  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i]!;
    const b = samples[i + 1]!;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    if (xQuery < lo || xQuery > hi) continue;
    if (Math.abs(b.x - a.x) < 1e-12) {
      lastY = (a.y + b.y) / 2;
      continue;
    }
    const t = (xQuery - a.x) / (b.x - a.x);
    lastY = a.y + (b.y - a.y) * t;
  }
  return lastY;
}

export interface RunLineBSplineOptions {
  clamp?: boolean;
  samplesPerSegment?: number;
}

export function runLineBSpline(
  points: readonly ChartLineSplineBsplinePoint[] | null | undefined,
  options?: RunLineBSplineOptions,
): {
  samples: ChartLineSplineBsplineSample[];
  curveSamples: ChartLineSplineBsplinePoint[];
  controlCount: number;
  segmentCount: number;
  samplesPerSegment: number;
  clamp: boolean;
} {
  const clamp = options?.clamp !== false;
  const samplesPerSegment = normaliseLineSplineBsplineSamplesPerSegment(
    options?.samplesPerSegment,
  );
  const finite = getLineSplineBsplineFinitePoints(points);
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const N = sorted.length;
  const cps = clamp ? buildLineSplineBsplineClampedControlPoints(sorted) : sorted;
  const segmentCount = cps.length >= 4 ? cps.length - 3 : 0;
  const curveSamples = sampleLineSplineBsplineCurve(sorted, {
    clamp,
    samplesPerSegment,
  });

  const samples: ChartLineSplineBsplineSample[] = sorted.map((p, i) => {
    const smoothed = interpolateLineSplineBsplineSmoothedAt(
      curveSamples,
      p.x,
    );
    const residual = smoothed === null ? null : p.y - smoothed;
    return {
      index: i,
      x: p.x,
      raw: p.y,
      smoothed,
      residual,
      residualSign: classifyLineSplineBsplineResidualSign(residual),
    };
  });

  return {
    samples,
    curveSamples,
    controlCount: N,
    segmentCount,
    samplesPerSegment,
    clamp,
  };
}

function buildPath(
  points: readonly { px: number; py: number | null }[],
): string {
  const parts: string[] = [];
  let openSegment = false;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    if (p.py === null || !isFiniteNumber(p.py)) {
      openSegment = false;
      continue;
    }
    const cmd = !openSegment ? 'M' : 'L';
    parts.push(`${cmd} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
    openSegment = true;
  }
  return parts.join(' ');
}

function normaliseHidden(
  hidden: ReadonlySet<string> | readonly string[] | null | undefined,
): Set<string> {
  if (!hidden) return new Set();
  if (hidden instanceof Set) return new Set(hidden);
  if (Array.isArray(hidden)) return new Set(hidden);
  return new Set();
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineSplineBsplineLayout(
  options: ComputeLineSplineBsplineLayoutOptions,
): ChartLineSplineBsplineLayout {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_SPLINE_BSPLINE_TICK_COUNT,
    clamp,
    samplesPerSegment,
    defaultColors = DEFAULT_CHART_LINE_SPLINE_BSPLINE_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ChartLineSplineBsplineLayout = {
    ok: false,
    width,
    height,
    panel: { x: padding, y: padding, width: innerWidth, height: innerHeight },
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    innerWidth,
    innerHeight,
    series: [],
    totalPoints: 0,
    visibleSeriesCount: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!Array.isArray(series) || series.length === 0) return empty;

  const hidden = normaliseHidden(hiddenSeries);
  const visible = series.filter((s) => !hidden.has(s.id));
  if (visible.length === 0) return empty;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let totalPoints = 0;

  const runBySeries = new Map<
    string,
    ReturnType<typeof runLineBSpline>
  >();

  for (const s of visible) {
    const run = runLineBSpline(s.data, {
      clamp: s.clamp ?? clamp,
      samplesPerSegment: s.samplesPerSegment ?? samplesPerSegment,
    });
    runBySeries.set(s.id, run);
    totalPoints += run.samples.length;
    for (const sample of run.samples) {
      if (sample.x < xLo) xLo = sample.x;
      if (sample.x > xHi) xHi = sample.x;
      if (sample.raw < yLo) yLo = sample.raw;
      if (sample.raw > yHi) yHi = sample.raw;
      if (sample.smoothed !== null) {
        if (sample.smoothed < yLo) yLo = sample.smoothed;
        if (sample.smoothed > yHi) yHi = sample.smoothed;
      }
    }
    for (const c of run.curveSamples) {
      if (c.x < xLo) xLo = c.x;
      if (c.x > xHi) xHi = c.x;
      if (c.y < yLo) yLo = c.y;
      if (c.y > yHi) yHi = c.y;
    }
  }

  if (totalPoints === 0) return empty;

  if (isFiniteNumber(xMinOverride)) xLo = xMinOverride;
  if (isFiniteNumber(xMaxOverride)) xHi = xMaxOverride;
  if (isFiniteNumber(yMinOverride)) yLo = yMinOverride;
  if (isFiniteNumber(yMaxOverride)) yHi = yMaxOverride;

  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;
  const panel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };
  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (y: number): number =>
    panel.y + panel.height - ((y - yLo) / yRange) * panel.height;

  const layoutSeries: ChartLineSplineBsplineLayoutSeries[] = visible.map(
    (s, idx) => {
      const run = runBySeries.get(s.id)!;
      const color =
        s.color ??
        defaultColors[idx % defaultColors.length] ??
        DEFAULT_CHART_LINE_SPLINE_BSPLINE_PALETTE[0]!;

      let positive = 0;
      let negative = 0;
      let zero = 0;
      let sumSq = 0;
      let maxAbs = 0;
      let smoothedValid = 0;
      let finalSmoothed: number | null = null;

      const points: ChartLineSplineBsplineLayoutPoint[] = run.samples.map(
        (sample) => {
          const rawPy = projectY(sample.raw);
          const smoothedPy =
            sample.smoothed !== null ? projectY(sample.smoothed) : null;
          if (sample.smoothed !== null && isFiniteNumber(sample.smoothed)) {
            smoothedValid += 1;
            finalSmoothed = sample.smoothed;
          }
          if (sample.residualSign === 'positive') positive += 1;
          else if (sample.residualSign === 'negative') negative += 1;
          else zero += 1;
          if (sample.residual !== null && isFiniteNumber(sample.residual)) {
            sumSq += sample.residual * sample.residual;
            const a = Math.abs(sample.residual);
            if (a > maxAbs) maxAbs = a;
          }
          return {
            ...sample,
            px: projectX(sample.x),
            rawPy,
            smoothedPy,
          };
        },
      );

      const finite = getLineSplineBsplineFinitePoints(s.data)
        .slice()
        .sort((a, b) => a.x - b.x);
      const controlPath = buildPath(
        finite.map((p) => ({ px: projectX(p.x), py: projectY(p.y) })),
      );
      const smoothedPath = buildLineSplineBsplineBezierPath(finite, {
        clamp: run.clamp,
        project: (pt) => ({ px: projectX(pt.x), py: projectY(pt.y) }),
      });

      const residualSegments = points
        .filter((p) => p.smoothedPy !== null && p.residual !== null)
        .map((p) => ({
          index: p.index,
          px: p.px,
          rawPy: p.rawPy,
          smoothedPy: p.smoothedPy!,
          residual: p.residual!,
          sign: p.residualSign,
        }));

      const curveSamples: ChartLineSplineBsplineCurveSample[] =
        run.curveSamples.map((c) => ({
          x: c.x,
          y: c.y,
          px: projectX(c.x),
          py: projectY(c.y),
        }));

      const rmse = smoothedValid > 0 ? Math.sqrt(sumSq / smoothedValid) : 0;

      return {
        id: s.id,
        label: s.label,
        color,
        clamp: run.clamp,
        samplesPerSegment: run.samplesPerSegment,
        controlCount: run.controlCount,
        segmentCount: run.segmentCount,
        curveSampleCount: run.curveSamples.length,
        points,
        curveSamples,
        controlPath,
        smoothedPath,
        residualSegments,
        finiteCount: run.samples.length,
        totalCount: s.data?.length ?? 0,
        smoothedValidCount: smoothedValid,
        positiveResidualCount: positive,
        negativeResidualCount: negative,
        zeroResidualCount: zero,
        rmseResidual: rmse,
        maxAbsResidual: maxAbs,
        finalSmoothed,
      };
    },
  );

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount),
    yTicks: computeTicks(yLo, yHi, tickCount),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    innerWidth,
    innerHeight,
    series: layoutSeries,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineSplineBsplineChart(
  series: readonly ChartLineSplineBsplineSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    clamp?: boolean;
    samplesPerSegment?: number;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const run = runLineBSpline(s.data, {
      clamp: s.clamp ?? options?.clamp,
      samplesPerSegment: s.samplesPerSegment ?? options?.samplesPerSegment,
    });
    totalPoints += run.samples.length;
    const clampLabel = run.clamp ? 'clamped' : 'open';
    summaries.push(
      `${s.label}: cubic B-spline ${clampLabel} with ${run.controlCount} control points and ${run.segmentCount} segments`,
    );
  }
  return `Line chart with cubic B-spline interpolation overlay across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineSplineBspline = forwardRef<
  HTMLDivElement,
  ChartLineSplineBsplineProps
>(function ChartLineSplineBspline(
  props: ChartLineSplineBsplineProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    clamp = true,
    samplesPerSegment = DEFAULT_CHART_LINE_SPLINE_BSPLINE_SAMPLES_PER_SEGMENT,
    width = DEFAULT_CHART_LINE_SPLINE_BSPLINE_WIDTH,
    height = DEFAULT_CHART_LINE_SPLINE_BSPLINE_HEIGHT,
    padding = DEFAULT_CHART_LINE_SPLINE_BSPLINE_PADDING,
    tickCount = DEFAULT_CHART_LINE_SPLINE_BSPLINE_TICK_COUNT,
    rawStrokeWidth = DEFAULT_CHART_LINE_SPLINE_BSPLINE_RAW_STROKE_WIDTH,
    smoothStrokeWidth = DEFAULT_CHART_LINE_SPLINE_BSPLINE_SMOOTH_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SPLINE_BSPLINE_DOT_RADIUS,
    rawOpacity = DEFAULT_CHART_LINE_SPLINE_BSPLINE_RAW_OPACITY,
    residualOpacity = DEFAULT_CHART_LINE_SPLINE_BSPLINE_RESIDUAL_OPACITY,
    rawColor = DEFAULT_CHART_LINE_SPLINE_BSPLINE_RAW_COLOR,
    residualPosColor = DEFAULT_CHART_LINE_SPLINE_BSPLINE_RESIDUAL_POS_COLOR,
    residualNegColor = DEFAULT_CHART_LINE_SPLINE_BSPLINE_RESIDUAL_NEG_COLOR,
    controlColor = DEFAULT_CHART_LINE_SPLINE_BSPLINE_CONTROL_COLOR,
    gridColor = DEFAULT_CHART_LINE_SPLINE_BSPLINE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_SPLINE_BSPLINE_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showLegend = true,
    showTooltip = true,
    showConfigBadge = true,
    showRaw = true,
    showControlPolygon = false,
    showResidualSticks = false,
    animate = true,
    className,
    ariaLabel = 'Line chart with cubic B-spline interpolation overlay',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const isControlled = controlledHidden !== undefined;
  const [uncontrolled, setUncontrolled] = useState<Set<string>>(() =>
    normaliseHidden(defaultHiddenSeries),
  );
  const hiddenSet = isControlled
    ? normaliseHidden(controlledHidden)
    : uncontrolled;

  const layout = useMemo(
    () =>
      computeLineSplineBsplineLayout({
        series,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        tickCount,
        clamp,
        samplesPerSegment,
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(yMin) ? { yMin } : {}),
        ...(isFiniteNumber(yMax) ? { yMax } : {}),
      }),
    [
      series,
      hiddenSet,
      width,
      height,
      padding,
      tickCount,
      clamp,
      samplesPerSegment,
      xMin,
      xMax,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineSplineBsplineChart(series, {
        hidden: hiddenSet,
        clamp,
        samplesPerSegment,
      }),
    [ariaDescription, series, hiddenSet, clamp, samplesPerSegment],
  );

  const [hoverPayload, setHoverPayload] = useState<{
    seriesId: string;
    pointIndex: number;
  } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHoverPayload(null);
    setTooltipPos(null);
  }, []);

  const handleToggle = useCallback(
    (s: ChartLineSplineBsplineSeries) => {
      const next = new Set(hiddenSet);
      const willHide = !next.has(s.id);
      if (willHide) next.add(s.id);
      else next.delete(s.id);
      if (!isControlled) setUncontrolled(next);
      onHiddenSeriesChange?.(next);
      onSeriesToggle?.({ series: s, hidden: willHide });
    },
    [hiddenSet, isControlled, onHiddenSeriesChange, onSeriesToggle],
  );

  const allTotalPoints = useMemo(
    () =>
      series.reduce(
        (acc, s) => acc + getLineSplineBsplineFinitePoints(s.data).length,
        0,
      ),
    [series],
  );

  const dominantConfig = useMemo<{
    clamp: boolean;
    samplesPerSegment: number;
    controlCount: number;
    segmentCount: number;
    seriesId: string;
  }>(() => {
    if (layout.series.length === 0) {
      return {
        clamp,
        samplesPerSegment: normaliseLineSplineBsplineSamplesPerSegment(
          samplesPerSegment,
        ),
        controlCount: 0,
        segmentCount: 0,
        seriesId: '',
      };
    }
    const s = layout.series[0]!;
    return {
      clamp: s.clamp,
      samplesPerSegment: s.samplesPerSegment,
      controlCount: s.controlCount,
      segmentCount: s.segmentCount,
      seriesId: s.id,
    };
  }, [layout.series, clamp, samplesPerSegment]);

  const containerStyle: CSSProperties = {
    width,
    height,
    position: 'relative',
    ...(style ?? {}),
  };

  if (!layout.ok) {
    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={className}
        style={containerStyle}
        data-section="chart-line-spline-bspline"
        data-empty="true"
        data-series-count={series.length}
        data-visible-series-count={0}
        data-total-points={0}
        data-clamp={clamp ? 'true' : 'false'}
        data-samples-per-segment={normaliseLineSplineBsplineSamplesPerSegment(
          samplesPerSegment,
        )}
        data-degree={DEFAULT_CHART_LINE_SPLINE_BSPLINE_DEGREE}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-spline-bspline-aria-desc"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            clipPath: 'inset(50%)',
            whiteSpace: 'nowrap',
          }}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-spline-bspline"
      data-empty="false"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-clamp={dominantConfig.clamp ? 'true' : 'false'}
      data-samples-per-segment={dominantConfig.samplesPerSegment}
      data-degree={DEFAULT_CHART_LINE_SPLINE_BSPLINE_DEGREE}
      data-dominant-control-count={dominantConfig.controlCount}
      data-dominant-segment-count={dominantConfig.segmentCount}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-spline-bspline-aria-desc"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          clipPath: 'inset(50%)',
          whiteSpace: 'nowrap',
        }}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-spline-bspline-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-spline-bspline-badge"
            data-clamp={dominantConfig.clamp ? 'true' : 'false'}
            data-samples-per-segment={dominantConfig.samplesPerSegment}
            data-control-count={dominantConfig.controlCount}
            data-segment-count={dominantConfig.segmentCount}
            data-series-id={dominantConfig.seriesId}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: layout.series[0]?.color ?? '#0f172a',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-spline-bspline-badge-icon"
              aria-hidden="true"
            >
              BS
            </span>
            <span data-section="chart-line-spline-bspline-badge-degree">
              d={DEFAULT_CHART_LINE_SPLINE_BSPLINE_DEGREE}
            </span>
            <span data-section="chart-line-spline-bspline-badge-clamp">
              {dominantConfig.clamp ? 'clamped' : 'open'}
            </span>
            <span data-section="chart-line-spline-bspline-badge-segments">
              seg={dominantConfig.segmentCount}
            </span>
            <span data-section="chart-line-spline-bspline-badge-control">
              cp={dominantConfig.controlCount}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-spline-bspline-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-spline-bspline-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => {
                const py =
                  layout.panel.y +
                  layout.panel.height -
                  ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                    layout.panel.height;
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-spline-bspline-grid-line"
                    data-axis="y"
                    x1={layout.panel.x}
                    x2={layout.panel.x + layout.panel.width}
                    y1={py}
                    y2={py}
                  />
                );
              })}
              {layout.xTicks.map((t, i) => {
                const px =
                  layout.panel.x +
                  ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                    layout.panel.width;
                return (
                  <line
                    key={`gx-${i}`}
                    data-section="chart-line-spline-bspline-grid-line"
                    data-axis="x"
                    x1={px}
                    x2={px}
                    y1={layout.panel.y}
                    y2={layout.panel.y + layout.panel.height}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-spline-bspline-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-spline-bspline-axis"
                data-axis="x"
                x1={layout.panel.x}
                y1={layout.panel.y + layout.panel.height}
                x2={layout.panel.x + layout.panel.width}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-spline-bspline-axis"
                data-axis="y"
                x1={layout.panel.x}
                y1={layout.panel.y}
                x2={layout.panel.x}
                y2={layout.panel.y + layout.panel.height}
              />
              <g data-section="chart-line-spline-bspline-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-spline-bspline-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.panel.y + layout.panel.height}
                        y2={layout.panel.y + layout.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-spline-bspline-tick-label"
                        data-axis="x"
                        x={px}
                        y={layout.panel.y + layout.panel.height + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatX(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              <g data-section="chart-line-spline-bspline-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-spline-bspline-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-spline-bspline-tick-label"
                        data-axis="y"
                        x={layout.panel.x - 6}
                        y={py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatValue(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              {xLabel ? (
                <text
                  data-section="chart-line-spline-bspline-x-label"
                  x={layout.panel.x + layout.panel.width / 2}
                  y={height - 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {xLabel}
                </text>
              ) : null}
              {yLabel ? (
                <text
                  data-section="chart-line-spline-bspline-y-label"
                  transform={`rotate(-90 12 ${layout.panel.y + layout.panel.height / 2})`}
                  x={12}
                  y={layout.panel.y + layout.panel.height / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {yLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          <g data-section="chart-line-spline-bspline-series">
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-spline-bspline-series-group"
                data-series-id={s.id}
                data-series-color={s.color}
                data-series-clamp={s.clamp ? 'true' : 'false'}
                data-series-samples-per-segment={s.samplesPerSegment}
                data-series-control-count={s.controlCount}
                data-series-segment-count={s.segmentCount}
                data-series-curve-sample-count={s.curveSampleCount}
                data-series-smoothed-valid-count={s.smoothedValidCount}
                data-series-rmse={s.rmseResidual}
                data-series-max-abs-residual={s.maxAbsResidual}
                data-series-positive-residual-count={s.positiveResidualCount}
                data-series-negative-residual-count={s.negativeResidualCount}
                data-series-zero-residual-count={s.zeroResidualCount}
                data-series-finite-count={s.finiteCount}
                data-series-final-smoothed={s.finalSmoothed ?? ''}
              >
                {showResidualSticks
                  ? s.residualSegments.map((seg) => {
                      const stickColor =
                        seg.sign === 'positive'
                          ? residualPosColor
                          : seg.sign === 'negative'
                            ? residualNegColor
                            : axisColor;
                      return (
                        <line
                          key={`r-${seg.index}`}
                          data-section="chart-line-spline-bspline-residual-stick"
                          data-series-id={s.id}
                          data-point-index={seg.index}
                          data-sign={seg.sign}
                          x1={seg.px}
                          x2={seg.px}
                          y1={seg.rawPy}
                          y2={seg.smoothedPy}
                          stroke={stickColor}
                          strokeWidth={1}
                          strokeOpacity={residualOpacity}
                          pointerEvents="none"
                        />
                      );
                    })
                  : null}
                {showRaw && s.controlPath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} raw observations`}
                    data-section="chart-line-spline-bspline-raw-path"
                    data-series-id={s.id}
                    data-kind="raw"
                    d={s.controlPath}
                    fill="none"
                    stroke={rawColor}
                    strokeWidth={rawStrokeWidth}
                    strokeOpacity={rawOpacity}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showControlPolygon && s.controlPath ? (
                  <path
                    data-section="chart-line-spline-bspline-control-polygon"
                    data-series-id={s.id}
                    data-kind="control"
                    d={s.controlPath}
                    fill="none"
                    stroke={controlColor}
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    strokeOpacity={rawOpacity}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                ) : null}
                {s.smoothedPath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} cubic B-spline curve ${s.clamp ? 'clamped' : 'open'} with ${s.segmentCount} segments`}
                    data-section="chart-line-spline-bspline-smoothed-path"
                    data-series-id={s.id}
                    data-kind="smoothed"
                    d={s.smoothedPath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={smoothStrokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showDots
                  ? s.points.map((p) => {
                      const isHover =
                        hoverPayload?.seriesId === s.id &&
                        hoverPayload?.pointIndex === p.index;
                      const cy =
                        p.smoothedPy !== null ? p.smoothedPy : p.rawPy;
                      return (
                        <circle
                          key={`d-${p.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)}; raw ${formatValue(p.raw)}; smoothed ${p.smoothed === null ? 'n/a' : formatValue(p.smoothed)}`}
                          data-section="chart-line-spline-bspline-dot"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-x={p.x}
                          data-raw={p.raw}
                          data-smoothed={p.smoothed ?? ''}
                          data-residual={p.residual ?? ''}
                          data-residual-sign={p.residualSign}
                          data-hovered={isHover ? 'true' : 'false'}
                          cx={p.px}
                          cy={cy}
                          r={isHover ? dotRadius + 1 : dotRadius}
                          fill={s.color}
                          stroke="#ffffff"
                          strokeWidth={1}
                          onMouseEnter={() => {
                            setHoverPayload({
                              seriesId: s.id,
                              pointIndex: p.index,
                            });
                            setTooltipPos({ px: p.px, py: cy });
                          }}
                          onMouseLeave={clearHover}
                          onFocus={() => {
                            setHoverPayload({
                              seriesId: s.id,
                              pointIndex: p.index,
                            });
                            setTooltipPos({ px: p.px, py: cy });
                          }}
                          onBlur={clearHover}
                          onClick={() =>
                            onPointClick?.({ series: s, point: p })
                          }
                        />
                      );
                    })
                  : null}
              </g>
            ))}
          </g>
        </svg>

        {showTooltip && hoverPayload && tooltipPos
          ? (() => {
              const s = layout.series.find(
                (x) => x.id === hoverPayload.seriesId,
              );
              if (!s) return null;
              const p = s.points.find(
                (x) => x.index === hoverPayload.pointIndex,
              );
              if (!p) return null;
              const tipColor =
                p.residualSign === 'positive'
                  ? residualPosColor
                  : p.residualSign === 'negative'
                    ? residualNegColor
                    : axisColor;
              return (
                <div
                  data-section="chart-line-spline-bspline-tooltip"
                  data-series-id={s.id}
                  data-point-index={p.index}
                  style={{
                    position: 'absolute',
                    left: tooltipPos.px + 8,
                    top: tooltipPos.py + 8,
                    background: '#0f172a',
                    color: '#f8fafc',
                    padding: '6px 8px',
                    fontSize: 11,
                    borderRadius: 4,
                    pointerEvents: 'none',
                    minWidth: 180,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-spline-bspline-tooltip-label"
                    style={{ color: s.color, fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-spline-bspline-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div data-section="chart-line-spline-bspline-tooltip-raw">
                    raw: {formatValue(p.raw)}
                  </div>
                  <div
                    data-section="chart-line-spline-bspline-tooltip-smoothed"
                    style={{ fontWeight: 600 }}
                  >
                    smoothed:{' '}
                    {p.smoothed === null ? 'n/a' : formatValue(p.smoothed)}
                  </div>
                  <div
                    data-section="chart-line-spline-bspline-tooltip-residual"
                    style={{ color: tipColor }}
                  >
                    residual:{' '}
                    {p.residual === null
                      ? 'n/a'
                      : (p.residual >= 0 ? '+' : '') + formatValue(p.residual)}
                  </div>
                  <div data-section="chart-line-spline-bspline-tooltip-config">
                    d={DEFAULT_CHART_LINE_SPLINE_BSPLINE_DEGREE},{' '}
                    {s.clamp ? 'clamped' : 'open'}, seg={s.segmentCount},
                    cp={s.controlCount}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-spline-bspline-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          {series.map((s) => {
            const isHidden = hiddenSet.has(s.id);
            const layoutMatch = layout.series.find((x) => x.id === s.id);
            const swatchColor =
              s.color ??
              layoutMatch?.color ??
              DEFAULT_CHART_LINE_SPLINE_BSPLINE_PALETTE[0]!;
            return (
              <button
                key={s.id}
                type="button"
                data-section="chart-line-spline-bspline-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
                onClick={() => handleToggle(s)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  opacity: isHidden ? 0.5 : 1,
                }}
              >
                <span
                  data-section="chart-line-spline-bspline-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: swatchColor,
                  }}
                />
                <span data-section="chart-line-spline-bspline-legend-label">
                  {s.label}
                </span>
                {layoutMatch ? (
                  <span
                    data-section="chart-line-spline-bspline-legend-stats"
                    style={{ fontSize: 10, color: '#64748b' }}
                  >
                    ({layoutMatch.clamp ? 'clamped' : 'open'}; seg=
                    {layoutMatch.segmentCount}; rmse{' '}
                    {formatValue(layoutMatch.rmseResidual)})
                  </span>
                ) : null}
              </button>
            );
          })}
          <span
            data-section="chart-line-spline-bspline-legend-total-points"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {allTotalPoints} total points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineSplineBspline.displayName = 'ChartLineSplineBspline';
