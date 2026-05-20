import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_SAVGOL_WIDTH = 560;
export const DEFAULT_CHART_LINE_SAVGOL_HEIGHT = 320;
export const DEFAULT_CHART_LINE_SAVGOL_PADDING = 40;
export const DEFAULT_CHART_LINE_SAVGOL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SAVGOL_RAW_STROKE_WIDTH = 1;
export const DEFAULT_CHART_LINE_SAVGOL_SMOOTH_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SAVGOL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SAVGOL_WINDOW = 7;
export const DEFAULT_CHART_LINE_SAVGOL_POLY_ORDER = 2;
export const DEFAULT_CHART_LINE_SAVGOL_RAW_OPACITY = 0.35;
export const DEFAULT_CHART_LINE_SAVGOL_RESIDUAL_OPACITY = 0.55;
export const DEFAULT_CHART_LINE_SAVGOL_PALETTE = [
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
export const DEFAULT_CHART_LINE_SAVGOL_RAW_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SAVGOL_RESIDUAL_POS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SAVGOL_RESIDUAL_NEG_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SAVGOL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SAVGOL_AXIS_COLOR = '#cbd5e1';

export type ChartLineSavgolResidualSign = 'positive' | 'negative' | 'zero';

export interface ChartLineSavgolPoint {
  x: number;
  y: number;
}

export interface ChartLineSavgolSeries {
  id: string;
  label: string;
  data: readonly ChartLineSavgolPoint[];
  color?: string;
  windowLength?: number;
  polyOrder?: number;
}

export interface ChartLineSavgolSample {
  index: number;
  x: number;
  raw: number;
  smoothed: number | null;
  residual: number | null;
  residualSign: ChartLineSavgolResidualSign;
}

export interface ChartLineSavgolLayoutPoint extends ChartLineSavgolSample {
  px: number;
  rawPy: number;
  smoothedPy: number | null;
}

export interface ChartLineSavgolLayoutSeries {
  id: string;
  label: string;
  color: string;
  windowLength: number;
  polyOrder: number;
  coefficients: number[];
  points: ChartLineSavgolLayoutPoint[];
  rawPath: string;
  smoothedPath: string;
  residualSegments: {
    index: number;
    px: number;
    rawPy: number;
    smoothedPy: number;
    residual: number;
    sign: ChartLineSavgolResidualSign;
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

export interface ChartLineSavgolLayout {
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
  series: ChartLineSavgolLayoutSeries[];
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineSavgolLayoutOptions {
  series: readonly ChartLineSavgolSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  windowLength?: number;
  polyOrder?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineSavgolProps {
  series: readonly ChartLineSavgolSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  windowLength?: number;
  polyOrder?: number;
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
  formatCoefficient?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineSavgolLayoutSeries;
    point: ChartLineSavgolLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineSavgolSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineSavgolDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_SAVGOL_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineSavgolFinitePoints(
  points: readonly ChartLineSavgolPoint[] | null | undefined,
): ChartLineSavgolPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineSavgolPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineSavgolWindow(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_SAVGOL_WINDOW;
  let v = Math.floor(value);
  if (v < 3) v = 3;
  if (v % 2 === 0) v += 1; // window must be odd
  return v;
}

export function normaliseLineSavgolPolyOrder(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_SAVGOL_POLY_ORDER;
  if (value < 0) return 0;
  return Math.floor(value);
}

function solveSavgolLinearSystem(
  M: number[][],
  b: number[],
): number[] | null {
  const n = M.length;
  // Augment M with b
  const A: number[][] = M.map((row, i) => [...row, b[i] ?? 0]);
  for (let col = 0; col < n; col += 1) {
    // Pivot: find max absolute in column col, rows [col..n)
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
    // Normalise pivot row
    for (let c = col; c <= n; c += 1) {
      A[col]![c] = A[col]![c]! / pivotVal;
    }
    // Eliminate other rows
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

export function computeSavgolCoefficients(
  windowLength: number,
  polyOrder: number,
): number[] | null {
  if (!isFiniteNumber(windowLength) || !isFiniteNumber(polyOrder)) return null;
  const N = Math.floor(windowLength);
  const p = Math.floor(polyOrder);
  if (N < 3) return null;
  if (N % 2 === 0) return null;
  if (p < 0) return null;
  if (p >= N) return null;
  const m = (N - 1) / 2;
  const size = p + 1;
  // Build symmetric matrix M[j][k] = sum_{i=-m..m} i^(j+k)
  const M: number[][] = new Array(size);
  for (let j = 0; j < size; j += 1) {
    M[j] = new Array(size).fill(0);
    for (let k = 0; k < size; k += 1) {
      let sum = 0;
      for (let i = -m; i <= m; i += 1) {
        sum += Math.pow(i, j + k);
      }
      M[j]![k] = sum;
    }
  }
  // Solve M alpha = e_0 where e_0 = [1, 0, ..., 0]
  const e0 = new Array(size).fill(0);
  e0[0] = 1;
  const alpha = solveSavgolLinearSystem(M, e0);
  if (!alpha) return null;
  // SG kernel c_i = sum_j alpha_j * (i - m)^j
  const coeffs = new Array(N);
  for (let i = 0; i < N; i += 1) {
    let val = 0;
    for (let j = 0; j < size; j += 1) {
      val += alpha[j]! * Math.pow(i - m, j);
    }
    coeffs[i] = val;
  }
  return coeffs;
}

export function classifyLineSavgolResidualSign(
  residual: number | null,
): ChartLineSavgolResidualSign {
  if (residual === null || !isFiniteNumber(residual)) return 'zero';
  if (residual > 0) return 'positive';
  if (residual < 0) return 'negative';
  return 'zero';
}

export function applyLineSavgol(
  values: readonly number[] | null | undefined,
  windowLength: number,
  polyOrder: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const N = values.length;
  const W = normaliseLineSavgolWindow(windowLength);
  const p = normaliseLineSavgolPolyOrder(polyOrder);
  const effectiveP = Math.min(p, W - 1);
  const coeffs = computeSavgolCoefficients(W, effectiveP);
  const out: (number | null)[] = new Array(N).fill(null);
  if (!coeffs || N < W) return out;
  const m = (W - 1) / 2;
  for (let i = m; i < N - m; i += 1) {
    let sum = 0;
    let ok = true;
    for (let k = 0; k < W; k += 1) {
      const v = values[i - m + k];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += coeffs[k]! * v;
    }
    if (ok) out[i] = sum;
  }
  return out;
}

export interface RunLineSavgolOptions {
  windowLength?: number;
  polyOrder?: number;
}

export function runLineSavgol(
  points: readonly ChartLineSavgolPoint[] | null | undefined,
  options?: RunLineSavgolOptions,
): {
  samples: ChartLineSavgolSample[];
  coefficients: number[];
  windowLength: number;
  polyOrder: number;
} {
  const W = normaliseLineSavgolWindow(options?.windowLength);
  const p = normaliseLineSavgolPolyOrder(options?.polyOrder);
  const finite = getLineSavgolFinitePoints(points);
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const ys = sorted.map((s) => s.y);
  const effectiveP = Math.min(p, W - 1);
  const coeffs = computeSavgolCoefficients(W, effectiveP) ?? [];
  const smoothed = applyLineSavgol(ys, W, effectiveP);
  const samples: ChartLineSavgolSample[] = sorted.map((s, i) => {
    const sm = smoothed[i] ?? null;
    let residual: number | null = null;
    if (sm !== null && isFiniteNumber(sm)) {
      residual = s.y - sm;
    }
    return {
      index: i,
      x: s.x,
      raw: s.y,
      smoothed: sm,
      residual,
      residualSign: classifyLineSavgolResidualSign(residual),
    };
  });
  return { samples, coefficients: coeffs, windowLength: W, polyOrder: effectiveP };
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

export function computeLineSavgolLayout(
  options: ComputeLineSavgolLayoutOptions,
): ChartLineSavgolLayout {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_SAVGOL_TICK_COUNT,
    windowLength,
    polyOrder,
    defaultColors = DEFAULT_CHART_LINE_SAVGOL_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ChartLineSavgolLayout = {
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
    ReturnType<typeof runLineSavgol>
  >();

  for (const s of visible) {
    const run = runLineSavgol(s.data, {
      windowLength: s.windowLength ?? windowLength,
      polyOrder: s.polyOrder ?? polyOrder,
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

  const layoutSeries: ChartLineSavgolLayoutSeries[] = visible.map((s, idx) => {
    const run = runBySeries.get(s.id)!;
    const color =
      s.color ?? defaultColors[idx % defaultColors.length] ?? DEFAULT_CHART_LINE_SAVGOL_PALETTE[0]!;

    let positive = 0;
    let negative = 0;
    let zero = 0;
    let sumSq = 0;
    let maxAbs = 0;
    let smoothedValid = 0;
    let finalSmoothed: number | null = null;

    const points: ChartLineSavgolLayoutPoint[] = run.samples.map((sample) => {
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
      windowLength: run.windowLength,
      polyOrder: run.polyOrder,
      coefficients: run.coefficients,
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

function defaultFormatCoefficient(n: number): string {
  if (!isFiniteNumber(n)) return '';
  return n.toFixed(4);
}

export function describeLineSavgolChart(
  series: readonly ChartLineSavgolSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    windowLength?: number;
    polyOrder?: number;
    formatValue?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const run = runLineSavgol(s.data, {
      windowLength: s.windowLength ?? options?.windowLength,
      polyOrder: s.polyOrder ?? options?.polyOrder,
    });
    totalPoints += run.samples.length;
    summaries.push(
      `${s.label}: Savitzky-Golay window ${run.windowLength}, order ${run.polyOrder}`,
    );
  }
  return `Line chart with Savitzky-Golay polynomial smoothing across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineSavgol = forwardRef<HTMLDivElement, ChartLineSavgolProps>(
  function ChartLineSavgol(
    props: ChartLineSavgolProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      series,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      windowLength = DEFAULT_CHART_LINE_SAVGOL_WINDOW,
      polyOrder = DEFAULT_CHART_LINE_SAVGOL_POLY_ORDER,
      width = DEFAULT_CHART_LINE_SAVGOL_WIDTH,
      height = DEFAULT_CHART_LINE_SAVGOL_HEIGHT,
      padding = DEFAULT_CHART_LINE_SAVGOL_PADDING,
      tickCount = DEFAULT_CHART_LINE_SAVGOL_TICK_COUNT,
      rawStrokeWidth = DEFAULT_CHART_LINE_SAVGOL_RAW_STROKE_WIDTH,
      smoothStrokeWidth = DEFAULT_CHART_LINE_SAVGOL_SMOOTH_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_SAVGOL_DOT_RADIUS,
      rawOpacity = DEFAULT_CHART_LINE_SAVGOL_RAW_OPACITY,
      residualOpacity = DEFAULT_CHART_LINE_SAVGOL_RESIDUAL_OPACITY,
      rawColor = DEFAULT_CHART_LINE_SAVGOL_RAW_COLOR,
      residualPosColor = DEFAULT_CHART_LINE_SAVGOL_RESIDUAL_POS_COLOR,
      residualNegColor = DEFAULT_CHART_LINE_SAVGOL_RESIDUAL_NEG_COLOR,
      gridColor = DEFAULT_CHART_LINE_SAVGOL_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_SAVGOL_AXIS_COLOR,
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
      ariaLabel = 'Line chart with Savitzky-Golay polynomial smoothing',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      formatCoefficient = defaultFormatCoefficient,
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
        computeLineSavgolLayout({
          series,
          hiddenSeries: hiddenSet,
          width,
          height,
          padding,
          tickCount,
          windowLength,
          polyOrder,
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
        windowLength,
        polyOrder,
        xMin,
        xMax,
        yMin,
        yMax,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineSavgolChart(series, {
          hidden: hiddenSet,
          windowLength,
          polyOrder,
          formatValue,
        }),
      [ariaDescription, series, hiddenSet, windowLength, polyOrder, formatValue],
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
      (s: ChartLineSavgolSeries) => {
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
          (acc, s) => acc + getLineSavgolFinitePoints(s.data).length,
          0,
        ),
      [series],
    );

    const dominantConfig = useMemo<{
      windowLength: number;
      polyOrder: number;
      coefficientSum: number;
      seriesId: string;
    }>(() => {
      if (layout.series.length === 0) {
        return {
          windowLength: normaliseLineSavgolWindow(windowLength),
          polyOrder: normaliseLineSavgolPolyOrder(polyOrder),
          coefficientSum: 0,
          seriesId: '',
        };
      }
      const s = layout.series[0]!;
      let sum = 0;
      for (const c of s.coefficients) sum += c;
      return {
        windowLength: s.windowLength,
        polyOrder: s.polyOrder,
        coefficientSum: sum,
        seriesId: s.id,
      };
    }, [layout.series, windowLength, polyOrder]);

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
          data-section="chart-line-savgol"
          data-empty="true"
          data-series-count={series.length}
          data-visible-series-count={0}
          data-total-points={0}
          data-window-length={normaliseLineSavgolWindow(windowLength)}
          data-poly-order={normaliseLineSavgolPolyOrder(polyOrder)}
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-savgol-aria-desc"
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
        data-section="chart-line-savgol"
        data-empty="false"
        data-series-count={series.length}
        data-visible-series-count={layout.visibleSeriesCount}
        data-total-points={layout.totalPoints}
        data-window-length={normaliseLineSavgolWindow(windowLength)}
        data-poly-order={normaliseLineSavgolPolyOrder(polyOrder)}
        data-dominant-coefficient-sum={dominantConfig.coefficientSum}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-savgol-aria-desc"
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
          data-section="chart-line-savgol-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-savgol-badge"
              data-window-length={dominantConfig.windowLength}
              data-poly-order={dominantConfig.polyOrder}
              data-coefficient-sum={dominantConfig.coefficientSum}
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
                data-section="chart-line-savgol-badge-icon"
                aria-hidden="true"
              >
                SG
              </span>
              <span data-section="chart-line-savgol-badge-window">
                W={dominantConfig.windowLength}
              </span>
              <span data-section="chart-line-savgol-badge-order">
                p={dominantConfig.polyOrder}
              </span>
              <span data-section="chart-line-savgol-badge-sum">
                sum={formatCoefficient(dominantConfig.coefficientSum)}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-savgol-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-savgol-grid"
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
                      data-section="chart-line-savgol-grid-line"
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
                      data-section="chart-line-savgol-grid-line"
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
                data-section="chart-line-savgol-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-savgol-axis"
                  data-axis="x"
                  x1={layout.panel.x}
                  y1={layout.panel.y + layout.panel.height}
                  x2={layout.panel.x + layout.panel.width}
                  y2={layout.panel.y + layout.panel.height}
                />
                <line
                  data-section="chart-line-savgol-axis"
                  data-axis="y"
                  x1={layout.panel.x}
                  y1={layout.panel.y}
                  x2={layout.panel.x}
                  y2={layout.panel.y + layout.panel.height}
                />
                <g data-section="chart-line-savgol-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => {
                    const px =
                      layout.panel.x +
                      ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                        layout.panel.width;
                    return (
                      <g
                        key={`tx-${i}`}
                        data-section="chart-line-savgol-tick"
                        data-axis="x"
                      >
                        <line
                          x1={px}
                          x2={px}
                          y1={layout.panel.y + layout.panel.height}
                          y2={layout.panel.y + layout.panel.height + 4}
                        />
                        <text
                          data-section="chart-line-savgol-tick-label"
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
                <g data-section="chart-line-savgol-ticks" data-axis="y">
                  {layout.yTicks.map((t, i) => {
                    const py =
                      layout.panel.y +
                      layout.panel.height -
                      ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                        layout.panel.height;
                    return (
                      <g
                        key={`ty-${i}`}
                        data-section="chart-line-savgol-tick"
                        data-axis="y"
                      >
                        <line
                          x1={layout.panel.x - 4}
                          x2={layout.panel.x}
                          y1={py}
                          y2={py}
                        />
                        <text
                          data-section="chart-line-savgol-tick-label"
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
                    data-section="chart-line-savgol-x-label"
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
                    data-section="chart-line-savgol-y-label"
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

            <g data-section="chart-line-savgol-series">
              {layout.series.map((s) => (
                <g
                  key={s.id}
                  data-section="chart-line-savgol-series-group"
                  data-series-id={s.id}
                  data-series-color={s.color}
                  data-series-window-length={s.windowLength}
                  data-series-poly-order={s.polyOrder}
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
                            data-section="chart-line-savgol-residual-stick"
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
                      data-section="chart-line-savgol-raw-path"
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
                      aria-label={`${s.label} Savitzky-Golay smoothed (window ${s.windowLength}, order ${s.polyOrder})`}
                      data-section="chart-line-savgol-smoothed-path"
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
                        const isSmoothValid = p.smoothedPy !== null;
                        return (
                          <circle
                            key={`d-${p.index}`}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)}; raw ${formatValue(p.raw)}; smoothed ${
                              p.smoothed === null
                                ? 'n/a'
                                : formatValue(p.smoothed)
                            }`}
                            data-section="chart-line-savgol-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-raw={p.raw}
                            data-smoothed={p.smoothed ?? ''}
                            data-residual={p.residual ?? ''}
                            data-residual-sign={p.residualSign}
                            data-hovered={isHover ? 'true' : 'false'}
                            cx={p.px}
                            cy={isSmoothValid ? (p.smoothedPy as number) : p.rawPy}
                            r={isHover ? dotRadius + 1 : dotRadius}
                            fill={s.color}
                            stroke="#ffffff"
                            strokeWidth={1}
                            onMouseEnter={() => {
                              setHoverPayload({
                                seriesId: s.id,
                                pointIndex: p.index,
                              });
                              setTooltipPos({
                                px: p.px,
                                py: isSmoothValid
                                  ? (p.smoothedPy as number)
                                  : p.rawPy,
                              });
                            }}
                            onMouseLeave={clearHover}
                            onFocus={() => {
                              setHoverPayload({
                                seriesId: s.id,
                                pointIndex: p.index,
                              });
                              setTooltipPos({
                                px: p.px,
                                py: isSmoothValid
                                  ? (p.smoothedPy as number)
                                  : p.rawPy,
                              });
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
                const p = s.points.find((x) => x.index === hoverPayload.pointIndex);
                if (!p) return null;
                const tipColor =
                  p.residualSign === 'positive'
                    ? residualPosColor
                    : p.residualSign === 'negative'
                      ? residualNegColor
                      : axisColor;
                return (
                  <div
                    data-section="chart-line-savgol-tooltip"
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
                      minWidth: 170,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div
                      data-section="chart-line-savgol-tooltip-label"
                      style={{ color: s.color, fontWeight: 600 }}
                    >
                      {s.label}
                    </div>
                    <div data-section="chart-line-savgol-tooltip-x">
                      x: {formatX(p.x)}
                    </div>
                    <div data-section="chart-line-savgol-tooltip-raw">
                      raw: {formatValue(p.raw)}
                    </div>
                    <div
                      data-section="chart-line-savgol-tooltip-smoothed"
                      style={{ fontWeight: 600 }}
                    >
                      smoothed:{' '}
                      {p.smoothed === null ? 'n/a' : formatValue(p.smoothed)}
                    </div>
                    <div
                      data-section="chart-line-savgol-tooltip-residual"
                      style={{ color: tipColor }}
                    >
                      residual:{' '}
                      {p.residual === null
                        ? 'n/a'
                        : (p.residual >= 0 ? '+' : '') + formatValue(p.residual)}
                    </div>
                    <div data-section="chart-line-savgol-tooltip-config">
                      W={s.windowLength}, p={s.polyOrder}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-savgol-legend"
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
                DEFAULT_CHART_LINE_SAVGOL_PALETTE[0]!;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-section="chart-line-savgol-legend-item"
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
                    data-section="chart-line-savgol-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: swatchColor,
                    }}
                  />
                  <span data-section="chart-line-savgol-legend-label">
                    {s.label}
                  </span>
                  {layoutMatch ? (
                    <span
                      data-section="chart-line-savgol-legend-stats"
                      style={{ fontSize: 10, color: '#64748b' }}
                    >
                      (W={layoutMatch.windowLength}; p={layoutMatch.polyOrder};
                      {' '}rmse {formatValue(layoutMatch.rmseResidual)})
                    </span>
                  ) : null}
                </button>
              );
            })}
            <span
              data-section="chart-line-savgol-legend-total-points"
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

ChartLineSavgol.displayName = 'ChartLineSavgol';
