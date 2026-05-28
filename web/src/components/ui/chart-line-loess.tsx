import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_LOESS_WIDTH = 560;
export const DEFAULT_CHART_LINE_LOESS_HEIGHT = 320;
export const DEFAULT_CHART_LINE_LOESS_PADDING = 40;
export const DEFAULT_CHART_LINE_LOESS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_LOESS_RAW_STROKE_WIDTH = 1;
export const DEFAULT_CHART_LINE_LOESS_SMOOTH_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_LOESS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_LOESS_BANDWIDTH = 0.3;
export const DEFAULT_CHART_LINE_LOESS_DEGREE = 2;
export const DEFAULT_CHART_LINE_LOESS_RAW_OPACITY = 0.35;
export const DEFAULT_CHART_LINE_LOESS_RESIDUAL_OPACITY = 0.55;
export const DEFAULT_CHART_LINE_LOESS_PALETTE = [
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
export const DEFAULT_CHART_LINE_LOESS_RAW_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_LOESS_RESIDUAL_POS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_LOESS_RESIDUAL_NEG_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_LOESS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_LOESS_AXIS_COLOR = '#cbd5e1';

export type ChartLineLoessResidualSign = 'positive' | 'negative' | 'zero';

export interface ChartLineLoessPoint {
  x: number;
  y: number;
}

export interface ChartLineLoessSeries {
  id: string;
  label: string;
  data: readonly ChartLineLoessPoint[];
  color?: string;
  bandwidth?: number;
  degree?: number;
}

export interface ChartLineLoessSample {
  index: number;
  x: number;
  raw: number;
  smoothed: number | null;
  residual: number | null;
  residualSign: ChartLineLoessResidualSign;
  neighborhoodSize: number;
  neighborhoodWidth: number;
}

export interface ChartLineLoessLayoutPoint extends ChartLineLoessSample {
  px: number;
  rawPy: number;
  smoothedPy: number | null;
}

export interface ChartLineLoessLayoutSeries {
  id: string;
  label: string;
  color: string;
  bandwidth: number;
  degree: number;
  neighborhoodCount: number;
  points: ChartLineLoessLayoutPoint[];
  rawPath: string;
  smoothedPath: string;
  residualSegments: {
    index: number;
    px: number;
    rawPy: number;
    smoothedPy: number;
    residual: number;
    sign: ChartLineLoessResidualSign;
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

export interface ChartLineLoessLayout {
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
  series: ChartLineLoessLayoutSeries[];
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineLoessLayoutOptions {
  series: readonly ChartLineLoessSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  bandwidth?: number;
  degree?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineLoessProps {
  series: readonly ChartLineLoessSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  bandwidth?: number;
  degree?: number;
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
  showResidualSticks?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatBandwidth?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineLoessLayoutSeries;
    point: ChartLineLoessLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineLoessSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineLoessDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_LOESS_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineLoessFinitePoints(
  points: readonly ChartLineLoessPoint[] | null | undefined,
): ChartLineLoessPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineLoessPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineLoessBandwidth(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_LOESS_BANDWIDTH;
  if (value <= 0) return 0.05;
  if (value > 1) return 1;
  return value;
}

export function normaliseLineLoessDegree(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_LOESS_DEGREE;
  const v = Math.floor(value);
  if (v < 0) return 0;
  if (v > 2) return 2; // LOESS canonically supports 0, 1, 2
  return v;
}

export function computeLineLoessTricubeWeight(
  distance: number,
  dMax: number,
): number {
  if (!isFiniteNumber(distance) || !isFiniteNumber(dMax) || dMax <= 0) {
    return 0;
  }
  if (distance < 0) return 0;
  if (distance >= dMax) return 0;
  const u = distance / dMax;
  const one_minus_u3 = 1 - u * u * u;
  return one_minus_u3 * one_minus_u3 * one_minus_u3;
}

function solveLoessLinearSystem(
  M: number[][],
  b: number[],
): number[] | null {
  // Gauss-Jordan elimination on the augmented matrix
  const n = M.length;
  if (n === 0) return [];
  const A: number[][] = M.map((row, i) => [...row, b[i] ?? 0]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(A[row]![col]!) > Math.abs(A[pivot]![col]!)) pivot = row;
    }
    if (pivot !== col) {
      const tmp = A[col]!;
      A[col] = A[pivot]!;
      A[pivot] = tmp;
    }
    const pivotVal = A[col]![col]!;
    if (Math.abs(pivotVal) < 1e-12) return null;
    for (let c = col; c <= n; c += 1) {
      A[col]![c] = A[col]![c]! / pivotVal;
    }
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = A[row]![col]!;
      if (factor === 0) continue;
      for (let c = col; c <= n; c += 1) {
        A[row]![c] = A[row]![c]! - factor * A[col]![c]!;
      }
    }
  }
  return A.map((row) => row[n]!);
}

export interface FitLineLoessWeightedOptions {
  xs: readonly number[];
  ys: readonly number[];
  weights: readonly number[];
  degree: number;
  centerX: number;
}

export function fitLineLoessWeightedPolynomialAtCenter(
  options: FitLineLoessWeightedOptions,
): number | null {
  const { xs, ys, weights, degree, centerX } = options;
  const N = Math.min(xs.length, ys.length, weights.length);
  if (N === 0) return null;
  const p = Math.max(0, Math.min(2, Math.floor(degree)));
  const size = p + 1;

  // Use centered coordinates u = x - centerX so the polynomial value at
  // centerX is just beta_0.
  let totalWeight = 0;
  for (let i = 0; i < N; i += 1) {
    const w = weights[i];
    if (isFiniteNumber(w) && w > 0) totalWeight += w;
  }
  if (totalWeight <= 0) return null;

  // Build X^T W X (size x size) and X^T W y (size).
  const XtWX: number[][] = new Array(size);
  const XtWy: number[] = new Array(size).fill(0);
  for (let r = 0; r < size; r += 1) XtWX[r] = new Array(size).fill(0);

  for (let i = 0; i < N; i += 1) {
    const x = xs[i];
    const y = ys[i];
    const w = weights[i];
    if (
      !isFiniteNumber(x) ||
      !isFiniteNumber(y) ||
      !isFiniteNumber(w) ||
      w <= 0
    ) continue;
    const u = x - centerX;
    // Compute basis values u^0..u^p
    const basis = new Array(size);
    basis[0] = 1;
    for (let k = 1; k < size; k += 1) basis[k] = basis[k - 1]! * u;
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        XtWX[r]![c] = XtWX[r]![c]! + w * basis[r]! * basis[c]!;
      }
      XtWy[r] = XtWy[r]! + w * y * basis[r]!;
    }
  }

  const beta = solveLoessLinearSystem(XtWX, XtWy);
  if (!beta) return null;
  // Polynomial value at centerX is beta_0 (since u = 0 there).
  return beta[0] ?? null;
}

export function classifyLineLoessResidualSign(
  residual: number | null,
): ChartLineLoessResidualSign {
  if (residual === null || !isFiniteNumber(residual)) return 'zero';
  if (residual > 0) return 'positive';
  if (residual < 0) return 'negative';
  return 'zero';
}

export interface RunLineLoessOptions {
  bandwidth?: number;
  degree?: number;
}

export function runLineLoess(
  points: readonly ChartLineLoessPoint[] | null | undefined,
  options?: RunLineLoessOptions,
): {
  samples: ChartLineLoessSample[];
  bandwidth: number;
  degree: number;
  neighborhoodCount: number;
} {
  const bw = normaliseLineLoessBandwidth(options?.bandwidth);
  const deg = normaliseLineLoessDegree(options?.degree);
  const finite = getLineLoessFinitePoints(points);
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const N = sorted.length;
  const k = Math.max(deg + 1, Math.min(N, Math.ceil(bw * N)));

  if (N === 0) {
    return { samples: [], bandwidth: bw, degree: deg, neighborhoodCount: 0 };
  }

  const xs = sorted.map((p) => p.x);
  const ys = sorted.map((p) => p.y);

  const samples: ChartLineLoessSample[] = sorted.map((p, i) => {
    // Find the k-nearest neighbours of x = p.x by absolute distance.
    // (Because xs is sorted, we can do this with a two-pointer expansion;
    // but for clarity and chart-scale N we just compute distances.)
    const distances = xs.map((xj, j) => ({ index: j, d: Math.abs(xj - p.x) }));
    distances.sort((a, b) => a.d - b.d);
    const knn = distances.slice(0, k);
    const dMax = knn[knn.length - 1]?.d ?? 0;
    const neighbourhoodWidth = dMax;
    const localXs = knn.map((n) => xs[n.index]!);
    const localYs = knn.map((n) => ys[n.index]!);
    const weights = knn.map((n) =>
      dMax > 0
        ? computeLineLoessTricubeWeight(n.d, dMax + 1e-12)
        : 1,
    );
    // Ensure at least the centre point has positive weight even when
    // dMax = 0 (all neighbours at the same x).
    if (dMax === 0) {
      for (let q = 0; q < weights.length; q += 1) weights[q] = 1;
    }
    const fit = fitLineLoessWeightedPolynomialAtCenter({
      xs: localXs,
      ys: localYs,
      weights,
      degree: deg,
      centerX: p.x,
    });
    const smoothed = isFiniteNumber(fit) ? fit : null;
    const residual =
      smoothed !== null ? p.y - smoothed : null;
    return {
      index: i,
      x: p.x,
      raw: p.y,
      smoothed,
      residual,
      residualSign: classifyLineLoessResidualSign(residual),
      neighborhoodSize: k,
      neighborhoodWidth: neighbourhoodWidth,
    };
  });

  return { samples, bandwidth: bw, degree: deg, neighborhoodCount: k };
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

export function computeLineLoessLayout(
  options: ComputeLineLoessLayoutOptions,
): ChartLineLoessLayout {
  const {
    series = [],
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_LOESS_TICK_COUNT,
    bandwidth,
    degree,
    defaultColors = DEFAULT_CHART_LINE_LOESS_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ChartLineLoessLayout = {
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
    ReturnType<typeof runLineLoess>
  >();

  for (const s of visible) {
    const run = runLineLoess(s.data, {
      bandwidth: s.bandwidth ?? bandwidth,
      degree: s.degree ?? degree,
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

  const layoutSeries: ChartLineLoessLayoutSeries[] = visible.map((s, idx) => {
    const run = runBySeries.get(s.id)!;
    const color =
      s.color ?? defaultColors[idx % defaultColors.length] ?? DEFAULT_CHART_LINE_LOESS_PALETTE[0]!;

    let positive = 0;
    let negative = 0;
    let zero = 0;
    let sumSq = 0;
    let maxAbs = 0;
    let smoothedValid = 0;
    let finalSmoothed: number | null = null;

    const points: ChartLineLoessLayoutPoint[] = run.samples.map((sample) => {
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
    });

    const rawPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.rawPy })),
    );
    const smoothedPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.smoothedPy })),
    );
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

    const rmse =
      smoothedValid > 0 ? Math.sqrt(sumSq / smoothedValid) : 0;

    return {
      id: s.id,
      label: s.label,
      color,
      bandwidth: run.bandwidth,
      degree: run.degree,
      neighborhoodCount: run.neighborhoodCount,
      points,
      rawPath,
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
  });

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

function defaultFormatBandwidth(n: number): string {
  if (!isFiniteNumber(n)) return '';
  return n.toFixed(2);
}

export function describeLineLoessChart(
  series: readonly ChartLineLoessSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    bandwidth?: number;
    degree?: number;
    formatBandwidth?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const fmtB = options?.formatBandwidth ?? defaultFormatBandwidth;

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const run = runLineLoess(s.data, {
      bandwidth: s.bandwidth ?? options?.bandwidth,
      degree: s.degree ?? options?.degree,
    });
    totalPoints += run.samples.length;
    summaries.push(
      `${s.label}: LOESS bandwidth ${fmtB(run.bandwidth)} (${run.neighborhoodCount} neighbors), degree ${run.degree}`,
    );
  }
  return `Line chart with LOESS locally weighted regression smoothing across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineLoess = forwardRef<HTMLDivElement, ChartLineLoessProps>(
  function ChartLineLoess(
    props: ChartLineLoessProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      series,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      bandwidth = DEFAULT_CHART_LINE_LOESS_BANDWIDTH,
      degree = DEFAULT_CHART_LINE_LOESS_DEGREE,
      width = DEFAULT_CHART_LINE_LOESS_WIDTH,
      height = DEFAULT_CHART_LINE_LOESS_HEIGHT,
      padding = DEFAULT_CHART_LINE_LOESS_PADDING,
      tickCount = DEFAULT_CHART_LINE_LOESS_TICK_COUNT,
      rawStrokeWidth = DEFAULT_CHART_LINE_LOESS_RAW_STROKE_WIDTH,
      smoothStrokeWidth = DEFAULT_CHART_LINE_LOESS_SMOOTH_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_LOESS_DOT_RADIUS,
      rawOpacity = DEFAULT_CHART_LINE_LOESS_RAW_OPACITY,
      residualOpacity = DEFAULT_CHART_LINE_LOESS_RESIDUAL_OPACITY,
      rawColor = DEFAULT_CHART_LINE_LOESS_RAW_COLOR,
      residualPosColor = DEFAULT_CHART_LINE_LOESS_RESIDUAL_POS_COLOR,
      residualNegColor = DEFAULT_CHART_LINE_LOESS_RESIDUAL_NEG_COLOR,
      gridColor = DEFAULT_CHART_LINE_LOESS_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_LOESS_AXIS_COLOR,
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
      showResidualSticks = false,
      animate = true,
      className,
      ariaLabel = 'Line chart with LOESS locally weighted regression smoothing',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      formatBandwidth = defaultFormatBandwidth,
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
        computeLineLoessLayout({
          series,
          hiddenSeries: hiddenSet,
          width,
          height,
          padding,
          tickCount,
          bandwidth,
          degree,
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
        bandwidth,
        degree,
        xMin,
        xMax,
        yMin,
        yMax,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineLoessChart(series, {
          hidden: hiddenSet,
          bandwidth,
          degree,
          formatBandwidth,
        }),
      [ariaDescription, series, hiddenSet, bandwidth, degree, formatBandwidth],
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
      (s: ChartLineLoessSeries) => {
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
          (acc, s) => acc + getLineLoessFinitePoints(s.data).length,
          0,
        ),
      [series],
    );

    const dominantConfig = useMemo<{
      bandwidth: number;
      degree: number;
      neighborhoodCount: number;
      seriesId: string;
    }>(() => {
      if (layout.series.length === 0) {
        return {
          bandwidth: normaliseLineLoessBandwidth(bandwidth),
          degree: normaliseLineLoessDegree(degree),
          neighborhoodCount: 0,
          seriesId: '',
        };
      }
      const s = layout.series[0]!;
      return {
        bandwidth: s.bandwidth,
        degree: s.degree,
        neighborhoodCount: s.neighborhoodCount,
        seriesId: s.id,
      };
    }, [layout.series, bandwidth, degree]);

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
          data-section="chart-line-loess"
          data-empty="true"
          data-series-count={series.length}
          data-visible-series-count={0}
          data-total-points={0}
          data-bandwidth={normaliseLineLoessBandwidth(bandwidth)}
          data-degree={normaliseLineLoessDegree(degree)}
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-loess-aria-desc"
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
        data-section="chart-line-loess"
        data-empty="false"
        data-series-count={series.length}
        data-visible-series-count={layout.visibleSeriesCount}
        data-total-points={layout.totalPoints}
        data-bandwidth={normaliseLineLoessBandwidth(bandwidth)}
        data-degree={normaliseLineLoessDegree(degree)}
        data-dominant-neighborhood-count={dominantConfig.neighborhoodCount}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-loess-aria-desc"
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
          data-section="chart-line-loess-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-loess-badge"
              data-bandwidth={dominantConfig.bandwidth}
              data-degree={dominantConfig.degree}
              data-neighborhood-count={dominantConfig.neighborhoodCount}
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
                data-section="chart-line-loess-badge-icon"
                aria-hidden="true"
              >
                LO
              </span>
              <span data-section="chart-line-loess-badge-bandwidth">
                α={formatBandwidth(dominantConfig.bandwidth)}
              </span>
              <span data-section="chart-line-loess-badge-degree">
                d={dominantConfig.degree}
              </span>
              <span data-section="chart-line-loess-badge-neighbors">
                k={dominantConfig.neighborhoodCount}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-loess-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-loess-grid"
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
                      data-section="chart-line-loess-grid-line"
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
                      data-section="chart-line-loess-grid-line"
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
                data-section="chart-line-loess-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-loess-axis"
                  data-axis="x"
                  x1={layout.panel.x}
                  y1={layout.panel.y + layout.panel.height}
                  x2={layout.panel.x + layout.panel.width}
                  y2={layout.panel.y + layout.panel.height}
                />
                <line
                  data-section="chart-line-loess-axis"
                  data-axis="y"
                  x1={layout.panel.x}
                  y1={layout.panel.y}
                  x2={layout.panel.x}
                  y2={layout.panel.y + layout.panel.height}
                />
                <g data-section="chart-line-loess-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => {
                    const px =
                      layout.panel.x +
                      ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                        layout.panel.width;
                    return (
                      <g
                        key={`tx-${i}`}
                        data-section="chart-line-loess-tick"
                        data-axis="x"
                      >
                        <line
                          x1={px}
                          x2={px}
                          y1={layout.panel.y + layout.panel.height}
                          y2={layout.panel.y + layout.panel.height + 4}
                        />
                        <text
                          data-section="chart-line-loess-tick-label"
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
                <g data-section="chart-line-loess-ticks" data-axis="y">
                  {layout.yTicks.map((t, i) => {
                    const py =
                      layout.panel.y +
                      layout.panel.height -
                      ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                        layout.panel.height;
                    return (
                      <g
                        key={`ty-${i}`}
                        data-section="chart-line-loess-tick"
                        data-axis="y"
                      >
                        <line
                          x1={layout.panel.x - 4}
                          x2={layout.panel.x}
                          y1={py}
                          y2={py}
                        />
                        <text
                          data-section="chart-line-loess-tick-label"
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
                    data-section="chart-line-loess-x-label"
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
                    data-section="chart-line-loess-y-label"
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

            <g data-section="chart-line-loess-series">
              {layout.series.map((s) => (
                <g
                  key={s.id}
                  data-section="chart-line-loess-series-group"
                  data-series-id={s.id}
                  data-series-color={s.color}
                  data-series-bandwidth={s.bandwidth}
                  data-series-degree={s.degree}
                  data-series-neighborhood-count={s.neighborhoodCount}
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
                            data-section="chart-line-loess-residual-stick"
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
                  {showRaw && s.rawPath ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} raw observations`}
                      data-section="chart-line-loess-raw-path"
                      data-series-id={s.id}
                      data-kind="raw"
                      d={s.rawPath}
                      fill="none"
                      stroke={rawColor}
                      strokeWidth={rawStrokeWidth}
                      strokeOpacity={rawOpacity}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {s.smoothedPath ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} LOESS smoothed (bandwidth ${formatBandwidth(s.bandwidth)}, degree ${s.degree})`}
                      data-section="chart-line-loess-smoothed-path"
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
                            data-section="chart-line-loess-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-raw={p.raw}
                            data-smoothed={p.smoothed ?? ''}
                            data-residual={p.residual ?? ''}
                            data-residual-sign={p.residualSign}
                            data-neighborhood-width={p.neighborhoodWidth}
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
                const s = layout.series.find((x) => x.id === hoverPayload.seriesId);
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
                    data-section="chart-line-loess-tooltip"
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
                      data-section="chart-line-loess-tooltip-label"
                      style={{ color: s.color, fontWeight: 600 }}
                    >
                      {s.label}
                    </div>
                    <div data-section="chart-line-loess-tooltip-x">
                      x: {formatX(p.x)}
                    </div>
                    <div data-section="chart-line-loess-tooltip-raw">
                      raw: {formatValue(p.raw)}
                    </div>
                    <div
                      data-section="chart-line-loess-tooltip-smoothed"
                      style={{ fontWeight: 600 }}
                    >
                      smoothed:{' '}
                      {p.smoothed === null ? 'n/a' : formatValue(p.smoothed)}
                    </div>
                    <div
                      data-section="chart-line-loess-tooltip-residual"
                      style={{ color: tipColor }}
                    >
                      residual:{' '}
                      {p.residual === null
                        ? 'n/a'
                        : (p.residual >= 0 ? '+' : '') + formatValue(p.residual)}
                    </div>
                    <div data-section="chart-line-loess-tooltip-config">
                      α={formatBandwidth(s.bandwidth)}, d={s.degree}, k=
                      {s.neighborhoodCount}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-loess-legend"
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
                DEFAULT_CHART_LINE_LOESS_PALETTE[0]!;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-section="chart-line-loess-legend-item"
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
                    data-section="chart-line-loess-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: swatchColor,
                    }}
                  />
                  <span data-section="chart-line-loess-legend-label">
                    {s.label}
                  </span>
                  {layoutMatch ? (
                    <span
                      data-section="chart-line-loess-legend-stats"
                      style={{ fontSize: 10, color: '#64748b' }}
                    >
                      (α={formatBandwidth(layoutMatch.bandwidth)};{' '}
                      d={layoutMatch.degree};{' '}
                      rmse {formatValue(layoutMatch.rmseResidual)})
                    </span>
                  ) : null}
                </button>
              );
            })}
            <span
              data-section="chart-line-loess-legend-total-points"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {allTotalPoints} total points
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineLoess.displayName = 'ChartLineLoess';
