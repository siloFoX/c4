import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';
import {
  DEFAULT_CHART_LINE_KALMAN_MEASUREMENT_NOISE,
  DEFAULT_CHART_LINE_KALMAN_PALETTE,
  DEFAULT_CHART_LINE_KALMAN_PROCESS_NOISE,
  getLineKalmanDefaultColor,
  getLineKalmanFinitePoints,
  normaliseLineKalmanKSigma,
  normaliseLineKalmanNoise,
  runLineKalmanFilter,
  type ChartLineKalmanPoint,
} from './chart-line-kalman';

export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_WIDTH = 560;
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_HEIGHT = 320;
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PADDING = 40;
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_OBS_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_FILTER_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_SMOOTHED_STROKE_WIDTH = 2.25;
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_BAND_OPACITY = 0.18;
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_OBS_OPACITY = 0.5;
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PROCESS_NOISE =
  DEFAULT_CHART_LINE_KALMAN_PROCESS_NOISE;
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_MEASUREMENT_NOISE =
  DEFAULT_CHART_LINE_KALMAN_MEASUREMENT_NOISE;
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_INITIAL_VARIANCE = 1;
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_K_SIGMA = 2;
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PALETTE =
  DEFAULT_CHART_LINE_KALMAN_PALETTE;
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_OBS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_FILTER_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_KALMAN_SMOOTHER_AXIS_COLOR = '#cbd5e1';

export type ChartLineKalmanSmootherPoint = ChartLineKalmanPoint;

export interface ChartLineKalmanSmootherSeries {
  id: string;
  label: string;
  data: readonly ChartLineKalmanSmootherPoint[];
  color?: string;
  processNoise?: number;
  measurementNoise?: number;
  initialEstimate?: number;
  initialVariance?: number;
  kSigma?: number;
}

export interface ChartLineKalmanSmootherSample {
  index: number;
  x: number;
  observation: number;
  filterEstimate: number;
  filterVariance: number;
  smoothedEstimate: number;
  smoothedVariance: number;
  smootherGain: number;
  filterUpper: number;
  filterLower: number;
  smoothedUpper: number;
  smoothedLower: number;
}

export interface ChartLineKalmanSmootherLayoutPoint
  extends ChartLineKalmanSmootherSample {
  px: number;
  obsPy: number;
  filterPy: number;
  smoothedPy: number;
  filterUpperPy: number;
  filterLowerPy: number;
  smoothedUpperPy: number;
  smoothedLowerPy: number;
}

export interface ChartLineKalmanSmootherLayoutSeries {
  id: string;
  label: string;
  color: string;
  processNoise: number;
  measurementNoise: number;
  initialVariance: number;
  kSigma: number;
  points: ChartLineKalmanSmootherLayoutPoint[];
  obsPath: string;
  filterPath: string;
  smoothedPath: string;
  bandPath: string;
  filterUpperPath: string;
  filterLowerPath: string;
  finiteCount: number;
  totalCount: number;
  meanFilterVariance: number;
  meanSmoothedVariance: number;
  varianceReductionPct: number;
  finalSmoothedEstimate: number;
}

export interface ChartLineKalmanSmootherLayout {
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
  series: ChartLineKalmanSmootherLayoutSeries[];
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineKalmanSmootherLayoutOptions {
  series: readonly ChartLineKalmanSmootherSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  processNoise?: number;
  measurementNoise?: number;
  initialVariance?: number;
  kSigma?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineKalmanSmootherProps {
  series: readonly ChartLineKalmanSmootherSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  processNoise?: number;
  measurementNoise?: number;
  initialVariance?: number;
  kSigma?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  obsStrokeWidth?: number;
  filterStrokeWidth?: number;
  smoothedStrokeWidth?: number;
  dotRadius?: number;
  bandOpacity?: number;
  obsOpacity?: number;
  obsColor?: string;
  filterColor?: string;
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
  showObservations?: boolean;
  showFilter?: boolean;
  showSmoothed?: boolean;
  showBand?: boolean;
  showFilterBand?: boolean;
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
    series: ChartLineKalmanSmootherLayoutSeries;
    point: ChartLineKalmanSmootherLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineKalmanSmootherSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineKalmanSmootherDefaultColor(index: number): string {
  return getLineKalmanDefaultColor(index);
}

export function getLineKalmanSmootherFinitePoints(
  points: readonly ChartLineKalmanSmootherPoint[] | null | undefined,
): ChartLineKalmanSmootherPoint[] {
  return getLineKalmanFinitePoints(points);
}

export interface RunRtsSmootherOptions {
  processNoise?: number;
  measurementNoise?: number;
  initialEstimate?: number;
  initialVariance?: number;
  kSigma?: number;
}

/**
 * Run a 1D **Rauch-Tung-Striebel (RTS) smoother**.
 *
 * The smoother is the standard companion to the Kalman *filter*. The
 * forward filter (`runLineKalmanFilter`) is **causal** -- at step k it
 * estimates the state from observations `z_1 .. z_k` only. The RTS
 * smoother adds a **backward pass** that refines every estimate using
 * **all** observations `z_1 .. z_N`, so each smoothed estimate is
 * `x_k | z_1..z_N` rather than `x_k | z_1..z_k`.
 *
 * Backward recursion for the random-walk model (run from `k = N-2`
 * down to 0; the last point's smoothed estimate equals the filter
 * estimate):
 *
 *   C_k        = P_filt_k / P_pred_{k+1}
 *   x_smooth_k = x_filt_k + C_k * (x_smooth_{k+1} - x_pred_{k+1})
 *   P_smooth_k = P_filt_k + C_k^2 * (P_smooth_{k+1} - P_pred_{k+1})
 *
 * where `x_pred_{k+1}` / `P_pred_{k+1}` are the one-step predictions
 * the forward filter recorded going into step k+1.
 *
 * Key property: `P_smooth_k <= P_filt_k` for every k -- the smoother
 * is at least as confident as the filter everywhere (strictly tighter
 * except at the final point), so the smoothed uncertainty band is
 * narrower than the filter band.
 *
 * Empty / null input -> `[]`.
 */
export function runRtsSmoother(
  points: readonly ChartLineKalmanSmootherPoint[] | null | undefined,
  options?: RunRtsSmootherOptions,
): ChartLineKalmanSmootherSample[] {
  const forward = runLineKalmanFilter(points, options);
  const N = forward.length;
  if (N === 0) return [];
  const kSigma = normaliseLineKalmanKSigma(options?.kSigma);

  const smoothEst = new Array<number>(N);
  const smoothVar = new Array<number>(N);
  const smootherGain = new Array<number>(N).fill(0);

  smoothEst[N - 1] = forward[N - 1]!.estimate;
  smoothVar[N - 1] = forward[N - 1]!.variance;

  for (let k = N - 2; k >= 0; k -= 1) {
    const xFilt = forward[k]!.estimate;
    const pFilt = forward[k]!.variance;
    // The one-step prediction the filter recorded going into k+1.
    const xPredNext = forward[k + 1]!.predicted;
    const pPredNext = forward[k + 1]!.predictedVariance;
    const c = pPredNext > 0 ? pFilt / pPredNext : 0;
    smootherGain[k] = c;
    smoothEst[k] = xFilt + c * (smoothEst[k + 1]! - xPredNext);
    const pSmooth = pFilt + c * c * (smoothVar[k + 1]! - pPredNext);
    smoothVar[k] = Math.max(0, pSmooth);
  }

  return forward.map((f, i) => {
    const sVar = smoothVar[i]!;
    const sSd = Math.sqrt(Math.max(0, sVar));
    return {
      index: i,
      x: f.x,
      observation: f.observation,
      filterEstimate: f.estimate,
      filterVariance: f.variance,
      smoothedEstimate: smoothEst[i]!,
      smoothedVariance: sVar,
      smootherGain: smootherGain[i]!,
      filterUpper: f.upper,
      filterLower: f.lower,
      smoothedUpper: smoothEst[i]! + kSigma * sSd,
      smoothedLower: smoothEst[i]! - kSigma * sSd,
    };
  });
}

function buildPath(
  points: readonly { px: number; py: number }[],
): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const cmd = i === 0 ? 'M' : 'L';
    parts.push(`${cmd} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  return parts.join(' ');
}

function buildBandFillPath(
  points: readonly { px: number; upperPy: number; lowerPy: number }[],
): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const cmd = i === 0 ? 'M' : 'L';
    parts.push(`${cmd} ${p.px.toFixed(3)} ${p.upperPy.toFixed(3)}`);
  }
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const p = points[i]!;
    parts.push(`L ${p.px.toFixed(3)} ${p.lowerPy.toFixed(3)}`);
  }
  parts.push('Z');
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

export function computeLineKalmanSmootherLayout(
  options: ComputeLineKalmanSmootherLayoutOptions,
): ChartLineKalmanSmootherLayout {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_TICK_COUNT,
    processNoise,
    measurementNoise,
    initialVariance,
    kSigma,
    defaultColors = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ChartLineKalmanSmootherLayout = {
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

  const runBySeries = new Map<string, ChartLineKalmanSmootherSample[]>();
  const configBySeries = new Map<
    string,
    {
      processNoise: number;
      measurementNoise: number;
      initialVariance: number;
      kSigma: number;
    }
  >();

  for (const s of visible) {
    const q = normaliseLineKalmanNoise(
      s.processNoise ?? processNoise,
      DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PROCESS_NOISE,
    );
    const r = normaliseLineKalmanNoise(
      s.measurementNoise ?? measurementNoise,
      DEFAULT_CHART_LINE_KALMAN_SMOOTHER_MEASUREMENT_NOISE,
    );
    const p0 = normaliseLineKalmanNoise(
      s.initialVariance ?? initialVariance,
      DEFAULT_CHART_LINE_KALMAN_SMOOTHER_INITIAL_VARIANCE,
    );
    const k = normaliseLineKalmanKSigma(s.kSigma ?? kSigma);
    configBySeries.set(s.id, {
      processNoise: q,
      measurementNoise: r,
      initialVariance: p0,
      kSigma: k,
    });
    const samples = runRtsSmoother(s.data, {
      processNoise: q,
      measurementNoise: r,
      initialVariance: p0,
      kSigma: k,
      ...(isFiniteNumber(s.initialEstimate)
        ? { initialEstimate: s.initialEstimate }
        : {}),
    });
    runBySeries.set(s.id, samples);
    totalPoints += samples.length;
    for (const sample of samples) {
      if (sample.x < xLo) xLo = sample.x;
      if (sample.x > xHi) xHi = sample.x;
      const vals = [
        sample.observation,
        sample.filterUpper,
        sample.filterLower,
        sample.smoothedUpper,
        sample.smoothedLower,
      ];
      for (const v of vals) {
        if (v < yLo) yLo = v;
        if (v > yHi) yHi = v;
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

  const layoutSeries: ChartLineKalmanSmootherLayoutSeries[] = visible.map(
    (s, idx) => {
      const samples = runBySeries.get(s.id)!;
      const cfg = configBySeries.get(s.id)!;
      const color =
        s.color ??
        defaultColors[idx % defaultColors.length] ??
        DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PALETTE[0]!;

      const points: ChartLineKalmanSmootherLayoutPoint[] = samples.map(
        (sample) => ({
          ...sample,
          px: projectX(sample.x),
          obsPy: projectY(sample.observation),
          filterPy: projectY(sample.filterEstimate),
          smoothedPy: projectY(sample.smoothedEstimate),
          filterUpperPy: projectY(sample.filterUpper),
          filterLowerPy: projectY(sample.filterLower),
          smoothedUpperPy: projectY(sample.smoothedUpper),
          smoothedLowerPy: projectY(sample.smoothedLower),
        }),
      );

      let sumFilterVar = 0;
      let sumSmoothedVar = 0;
      for (const sample of samples) {
        sumFilterVar += sample.filterVariance;
        sumSmoothedVar += sample.smoothedVariance;
      }
      const meanFilterVariance =
        samples.length > 0 ? sumFilterVar / samples.length : 0;
      const meanSmoothedVariance =
        samples.length > 0 ? sumSmoothedVar / samples.length : 0;
      const varianceReductionPct =
        meanFilterVariance > 0
          ? (1 - meanSmoothedVariance / meanFilterVariance) * 100
          : 0;

      return {
        id: s.id,
        label: s.label,
        color,
        processNoise: cfg.processNoise,
        measurementNoise: cfg.measurementNoise,
        initialVariance: cfg.initialVariance,
        kSigma: cfg.kSigma,
        points,
        obsPath: buildPath(points.map((p) => ({ px: p.px, py: p.obsPy }))),
        filterPath: buildPath(
          points.map((p) => ({ px: p.px, py: p.filterPy })),
        ),
        smoothedPath: buildPath(
          points.map((p) => ({ px: p.px, py: p.smoothedPy })),
        ),
        bandPath: buildBandFillPath(
          points.map((p) => ({
            px: p.px,
            upperPy: p.smoothedUpperPy,
            lowerPy: p.smoothedLowerPy,
          })),
        ),
        filterUpperPath: buildPath(
          points.map((p) => ({ px: p.px, py: p.filterUpperPy })),
        ),
        filterLowerPath: buildPath(
          points.map((p) => ({ px: p.px, py: p.filterLowerPy })),
        ),
        finiteCount: samples.length,
        totalCount: s.data?.length ?? 0,
        meanFilterVariance,
        meanSmoothedVariance,
        varianceReductionPct,
        finalSmoothedEstimate:
          samples.length > 0
            ? samples[samples.length - 1]!.smoothedEstimate
            : 0,
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

function defaultFormatCoefficient(n: number): string {
  if (!isFiniteNumber(n)) return '';
  return n.toFixed(2);
}

export function describeLineKalmanSmootherChart(
  series: readonly ChartLineKalmanSmootherSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    processNoise?: number;
    measurementNoise?: number;
    initialVariance?: number;
    kSigma?: number;
    formatCoefficient?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const fmt = options?.formatCoefficient ?? defaultFormatCoefficient;

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const q = normaliseLineKalmanNoise(
      s.processNoise ?? options?.processNoise,
      DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PROCESS_NOISE,
    );
    const r = normaliseLineKalmanNoise(
      s.measurementNoise ?? options?.measurementNoise,
      DEFAULT_CHART_LINE_KALMAN_SMOOTHER_MEASUREMENT_NOISE,
    );
    const samples = runRtsSmoother(s.data, {
      processNoise: q,
      measurementNoise: r,
      ...(isFiniteNumber(s.initialVariance ?? options?.initialVariance)
        ? {
            initialVariance: (s.initialVariance ??
              options?.initialVariance) as number,
          }
        : {}),
      ...(isFiniteNumber(s.kSigma ?? options?.kSigma)
        ? { kSigma: (s.kSigma ?? options?.kSigma) as number }
        : {}),
      ...(isFiniteNumber(s.initialEstimate)
        ? { initialEstimate: s.initialEstimate }
        : {}),
    });
    totalPoints += samples.length;
    let sumF = 0;
    let sumS = 0;
    for (const sample of samples) {
      sumF += sample.filterVariance;
      sumS += sample.smoothedVariance;
    }
    const reduction =
      sumF > 0 ? Math.round((1 - sumS / sumF) * 100) : 0;
    summaries.push(
      `${s.label}: Q ${fmt(q)}, R ${fmt(r)}, smoother cuts mean uncertainty by ${reduction}%`,
    );
  }
  return `Line chart with a 1D Rauch-Tung-Striebel smoother: a backward pass over the forward Kalman filter that refines every estimate using all observations, with a shaded uncertainty band, across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineKalmanSmoother = forwardRef<
  HTMLDivElement,
  ChartLineKalmanSmootherProps
>(function ChartLineKalmanSmoother(
  props: ChartLineKalmanSmootherProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    processNoise = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PROCESS_NOISE,
    measurementNoise = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_MEASUREMENT_NOISE,
    initialVariance = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_INITIAL_VARIANCE,
    kSigma = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_K_SIGMA,
    width = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_WIDTH,
    height = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_HEIGHT,
    padding = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PADDING,
    tickCount = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_TICK_COUNT,
    obsStrokeWidth = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_OBS_STROKE_WIDTH,
    filterStrokeWidth = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_FILTER_STROKE_WIDTH,
    smoothedStrokeWidth = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_SMOOTHED_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_DOT_RADIUS,
    bandOpacity = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_BAND_OPACITY,
    obsOpacity = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_OBS_OPACITY,
    obsColor = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_OBS_COLOR,
    filterColor = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_FILTER_COLOR,
    gridColor = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_AXIS_COLOR,
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
    showObservations = true,
    showFilter = true,
    showSmoothed = true,
    showBand = true,
    showFilterBand = false,
    animate = true,
    className,
    ariaLabel = 'Line chart with a 1D Rauch-Tung-Striebel Kalman smoother and uncertainty band',
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
      computeLineKalmanSmootherLayout({
        series,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        tickCount,
        processNoise,
        measurementNoise,
        initialVariance,
        kSigma,
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
      processNoise,
      measurementNoise,
      initialVariance,
      kSigma,
      xMin,
      xMax,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineKalmanSmootherChart(series, {
        hidden: hiddenSet,
        processNoise,
        measurementNoise,
        initialVariance,
        kSigma,
        formatCoefficient,
      }),
    [
      ariaDescription,
      series,
      hiddenSet,
      processNoise,
      measurementNoise,
      initialVariance,
      kSigma,
      formatCoefficient,
    ],
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
    (s: ChartLineKalmanSmootherSeries) => {
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
        (acc, s) => acc + getLineKalmanSmootherFinitePoints(s.data).length,
        0,
      ),
    [series],
  );

  const dominantConfig = useMemo<{
    processNoise: number;
    measurementNoise: number;
    varianceReductionPct: number;
    seriesId: string;
  }>(() => {
    if (layout.series.length === 0) {
      return {
        processNoise: normaliseLineKalmanNoise(
          processNoise,
          DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PROCESS_NOISE,
        ),
        measurementNoise: normaliseLineKalmanNoise(
          measurementNoise,
          DEFAULT_CHART_LINE_KALMAN_SMOOTHER_MEASUREMENT_NOISE,
        ),
        varianceReductionPct: 0,
        seriesId: '',
      };
    }
    const s = layout.series[0]!;
    return {
      processNoise: s.processNoise,
      measurementNoise: s.measurementNoise,
      varianceReductionPct: s.varianceReductionPct,
      seriesId: s.id,
    };
  }, [layout.series, processNoise, measurementNoise]);

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
        data-section="chart-line-kalman-smoother"
        data-empty="true"
        data-series-count={series.length}
        data-visible-series-count={0}
        data-total-points={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-kalman-smoother-aria-desc"
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
      data-section="chart-line-kalman-smoother"
      data-empty="false"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-process-noise={dominantConfig.processNoise}
      data-measurement-noise={dominantConfig.measurementNoise}
      data-variance-reduction={dominantConfig.varianceReductionPct}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-kalman-smoother-aria-desc"
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
        data-section="chart-line-kalman-smoother-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-kalman-smoother-badge"
            data-process-noise={dominantConfig.processNoise}
            data-measurement-noise={dominantConfig.measurementNoise}
            data-variance-reduction={dominantConfig.varianceReductionPct}
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
              data-section="chart-line-kalman-smoother-badge-icon"
              aria-hidden="true"
            >
              RTS
            </span>
            <span data-section="chart-line-kalman-smoother-badge-process">
              Q={formatCoefficient(dominantConfig.processNoise)}
            </span>
            <span data-section="chart-line-kalman-smoother-badge-measurement">
              R={formatCoefficient(dominantConfig.measurementNoise)}
            </span>
            <span data-section="chart-line-kalman-smoother-badge-reduction">
              -{Math.round(dominantConfig.varianceReductionPct)}% var
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-kalman-smoother-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-kalman-smoother-grid"
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
                    data-section="chart-line-kalman-smoother-grid-line"
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
                    data-section="chart-line-kalman-smoother-grid-line"
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
              data-section="chart-line-kalman-smoother-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-kalman-smoother-axis"
                data-axis="x"
                x1={layout.panel.x}
                y1={layout.panel.y + layout.panel.height}
                x2={layout.panel.x + layout.panel.width}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-kalman-smoother-axis"
                data-axis="y"
                x1={layout.panel.x}
                y1={layout.panel.y}
                x2={layout.panel.x}
                y2={layout.panel.y + layout.panel.height}
              />
              <g
                data-section="chart-line-kalman-smoother-ticks"
                data-axis="x"
              >
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-kalman-smoother-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.panel.y + layout.panel.height}
                        y2={layout.panel.y + layout.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-kalman-smoother-tick-label"
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
              <g
                data-section="chart-line-kalman-smoother-ticks"
                data-axis="y"
              >
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-kalman-smoother-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-kalman-smoother-tick-label"
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
                  data-section="chart-line-kalman-smoother-x-label"
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
                  data-section="chart-line-kalman-smoother-y-label"
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

          <g data-section="chart-line-kalman-smoother-series">
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-kalman-smoother-series-group"
                data-series-id={s.id}
                data-series-color={s.color}
                data-series-process-noise={s.processNoise}
                data-series-measurement-noise={s.measurementNoise}
                data-series-k-sigma={s.kSigma}
                data-series-mean-filter-variance={s.meanFilterVariance}
                data-series-mean-smoothed-variance={s.meanSmoothedVariance}
                data-series-variance-reduction={s.varianceReductionPct}
                data-series-final-smoothed-estimate={s.finalSmoothedEstimate}
                data-series-finite-count={s.finiteCount}
              >
                {showBand && s.bandPath ? (
                  <path
                    data-section="chart-line-kalman-smoother-band"
                    data-series-id={s.id}
                    data-kind="smoothed"
                    d={s.bandPath}
                    fill={s.color}
                    fillOpacity={bandOpacity}
                    stroke="none"
                    pointerEvents="none"
                  />
                ) : null}
                {showFilterBand && s.filterUpperPath ? (
                  <g
                    data-section="chart-line-kalman-smoother-filter-band"
                    data-series-id={s.id}
                  >
                    <path
                      data-section="chart-line-kalman-smoother-filter-band-upper"
                      data-series-id={s.id}
                      d={s.filterUpperPath}
                      fill="none"
                      stroke={filterColor}
                      strokeWidth={1}
                      strokeOpacity={0.5}
                      strokeDasharray="3 3"
                      pointerEvents="none"
                    />
                    <path
                      data-section="chart-line-kalman-smoother-filter-band-lower"
                      data-series-id={s.id}
                      d={s.filterLowerPath}
                      fill="none"
                      stroke={filterColor}
                      strokeWidth={1}
                      strokeOpacity={0.5}
                      strokeDasharray="3 3"
                      pointerEvents="none"
                    />
                  </g>
                ) : null}
                {showObservations && s.obsPath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} raw observations`}
                    data-section="chart-line-kalman-smoother-obs-path"
                    data-series-id={s.id}
                    data-kind="observation"
                    d={s.obsPath}
                    fill="none"
                    stroke={obsColor}
                    strokeWidth={obsStrokeWidth}
                    strokeOpacity={obsOpacity}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showFilter && s.filterPath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} forward Kalman filter estimate (causal)`}
                    data-section="chart-line-kalman-smoother-filter-path"
                    data-series-id={s.id}
                    data-kind="filter"
                    d={s.filterPath}
                    fill="none"
                    stroke={filterColor}
                    strokeWidth={filterStrokeWidth}
                    strokeDasharray="5 3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showSmoothed && s.smoothedPath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} RTS smoothed estimate (uses all observations)`}
                    data-section="chart-line-kalman-smoother-smoothed-path"
                    data-series-id={s.id}
                    data-kind="smoothed"
                    d={s.smoothedPath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={smoothedStrokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showDots
                  ? s.points.map((p) => {
                      const isHover =
                        hoverPayload?.seriesId === s.id &&
                        hoverPayload?.pointIndex === p.index;
                      return (
                        <circle
                          key={`d-${p.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)}; observation ${formatValue(p.observation)}; smoothed estimate ${formatValue(p.smoothedEstimate)}`}
                          data-section="chart-line-kalman-smoother-dot"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-x={p.x}
                          data-observation={p.observation}
                          data-filter-estimate={p.filterEstimate}
                          data-smoothed-estimate={p.smoothedEstimate}
                          data-filter-variance={p.filterVariance}
                          data-smoothed-variance={p.smoothedVariance}
                          data-smoother-gain={p.smootherGain}
                          data-hovered={isHover ? 'true' : 'false'}
                          cx={p.px}
                          cy={p.smoothedPy}
                          r={isHover ? dotRadius + 1 : dotRadius}
                          fill={s.color}
                          stroke="#ffffff"
                          strokeWidth={1}
                          onMouseEnter={() => {
                            setHoverPayload({
                              seriesId: s.id,
                              pointIndex: p.index,
                            });
                            setTooltipPos({ px: p.px, py: p.smoothedPy });
                          }}
                          onMouseLeave={clearHover}
                          onFocus={() => {
                            setHoverPayload({
                              seriesId: s.id,
                              pointIndex: p.index,
                            });
                            setTooltipPos({ px: p.px, py: p.smoothedPy });
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
              return (
                <div
                  data-section="chart-line-kalman-smoother-tooltip"
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
                    minWidth: 200,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-kalman-smoother-tooltip-label"
                    style={{ color: s.color, fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-kalman-smoother-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div data-section="chart-line-kalman-smoother-tooltip-observation">
                    observation: {formatValue(p.observation)}
                  </div>
                  <div data-section="chart-line-kalman-smoother-tooltip-filter">
                    filter est: {formatValue(p.filterEstimate)}
                  </div>
                  <div
                    data-section="chart-line-kalman-smoother-tooltip-smoothed"
                    style={{ fontWeight: 600 }}
                  >
                    smoothed est: {formatValue(p.smoothedEstimate)}
                  </div>
                  <div data-section="chart-line-kalman-smoother-tooltip-filter-variance">
                    filter var: {formatValue(p.filterVariance)}
                  </div>
                  <div data-section="chart-line-kalman-smoother-tooltip-smoothed-variance">
                    smoothed var: {formatValue(p.smoothedVariance)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-kalman-smoother-legend"
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
              DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PALETTE[0]!;
            return (
              <button
                key={s.id}
                type="button"
                data-section="chart-line-kalman-smoother-legend-item"
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
                  data-section="chart-line-kalman-smoother-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: swatchColor,
                  }}
                />
                <span data-section="chart-line-kalman-smoother-legend-label">
                  {s.label}
                </span>
                {layoutMatch ? (
                  <span
                    data-section="chart-line-kalman-smoother-legend-stats"
                    style={{ fontSize: 10, color: '#64748b' }}
                  >
                    (Q={formatCoefficient(layoutMatch.processNoise)};{' '}
                    -{Math.round(layoutMatch.varianceReductionPct)}% var)
                  </span>
                ) : null}
              </button>
            );
          })}
          <span
            data-section="chart-line-kalman-smoother-legend-total-points"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {allTotalPoints} total points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineKalmanSmoother.displayName = 'ChartLineKalmanSmoother';
