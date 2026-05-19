import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_KALMAN_WIDTH = 560;
export const DEFAULT_CHART_LINE_KALMAN_HEIGHT = 320;
export const DEFAULT_CHART_LINE_KALMAN_PADDING = 40;
export const DEFAULT_CHART_LINE_KALMAN_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KALMAN_OBS_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_KALMAN_EST_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KALMAN_BAND_STROKE_WIDTH = 1;
export const DEFAULT_CHART_LINE_KALMAN_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KALMAN_PROCESS_NOISE = 0.01;
export const DEFAULT_CHART_LINE_KALMAN_MEASUREMENT_NOISE = 1;
export const DEFAULT_CHART_LINE_KALMAN_INITIAL_VARIANCE = 1;
export const DEFAULT_CHART_LINE_KALMAN_K_SIGMA = 2;
export const DEFAULT_CHART_LINE_KALMAN_BAND_OPACITY = 0.18;
export const DEFAULT_CHART_LINE_KALMAN_OBS_OPACITY = 0.55;
export const DEFAULT_CHART_LINE_KALMAN_PALETTE = [
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
export const DEFAULT_CHART_LINE_KALMAN_OBS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KALMAN_BAND_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KALMAN_GAIN_HIGH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_KALMAN_GAIN_LOW_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KALMAN_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_KALMAN_AXIS_COLOR = '#cbd5e1';

export interface ChartLineKalmanPoint {
  x: number;
  y: number;
}

export interface ChartLineKalmanSeries {
  id: string;
  label: string;
  data: readonly ChartLineKalmanPoint[];
  color?: string;
  processNoise?: number;
  measurementNoise?: number;
  initialEstimate?: number;
  initialVariance?: number;
  kSigma?: number;
}

export interface ChartLineKalmanSample {
  index: number;
  x: number;
  observation: number;
  predicted: number;
  predictedVariance: number;
  estimate: number;
  variance: number;
  gain: number;
  innovation: number;
  upper: number;
  lower: number;
}

export interface ChartLineKalmanLayoutPoint extends ChartLineKalmanSample {
  px: number;
  obsPy: number;
  estPy: number;
  upperPy: number;
  lowerPy: number;
}

export interface ChartLineKalmanLayoutSeries {
  id: string;
  label: string;
  color: string;
  processNoise: number;
  measurementNoise: number;
  initialVariance: number;
  initialEstimate: number;
  kSigma: number;
  points: ChartLineKalmanLayoutPoint[];
  obsPath: string;
  estPath: string;
  bandPath: string;
  finiteCount: number;
  totalCount: number;
  meanGain: number;
  maxGain: number;
  minGain: number;
  finalVariance: number;
  finalEstimate: number;
  finalGain: number;
  rmseObservation: number;
}

export interface ComputeLineKalmanLayoutResult {
  series: ChartLineKalmanLayoutSeries[];
  xTicks: number[];
  yTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineKalmanLayoutOptions {
  series: readonly ChartLineKalmanSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  processNoise?: number;
  measurementNoise?: number;
  initialVariance?: number;
  initialEstimate?: number;
  kSigma?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineKalmanProps {
  series: readonly ChartLineKalmanSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  processNoise?: number;
  measurementNoise?: number;
  initialVariance?: number;
  initialEstimate?: number;
  kSigma?: number;
  obsStrokeWidth?: number;
  estStrokeWidth?: number;
  bandStrokeWidth?: number;
  dotRadius?: number;
  bandOpacity?: number;
  obsOpacity?: number;
  obsColor?: string;
  bandColor?: string;
  gainHighColor?: string;
  gainLowColor?: string;
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
  showGainBadge?: boolean;
  showBand?: boolean;
  showObservations?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatGain?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineKalmanLayoutSeries;
    point: ChartLineKalmanLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineKalmanSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineKalmanDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_KALMAN_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineKalmanFinitePoints(
  points: readonly ChartLineKalmanPoint[] | null | undefined,
): ChartLineKalmanPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineKalmanPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineKalmanNoise(
  value: unknown,
  fallback: number,
): number {
  if (!isFiniteNumber(value) || value < 0) return fallback;
  return value;
}

export function normaliseLineKalmanKSigma(value: unknown): number {
  if (!isFiniteNumber(value) || value <= 0) {
    return DEFAULT_CHART_LINE_KALMAN_K_SIGMA;
  }
  return value;
}

export interface RunLineKalmanOptions {
  processNoise?: number;
  measurementNoise?: number;
  initialEstimate?: number;
  initialVariance?: number;
  kSigma?: number;
}

export function runLineKalmanFilter(
  points: readonly ChartLineKalmanPoint[] | null | undefined,
  options?: RunLineKalmanOptions,
): ChartLineKalmanSample[] {
  const finite = getLineKalmanFinitePoints(points);
  if (finite.length === 0) return [];
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const Q = normaliseLineKalmanNoise(
    options?.processNoise,
    DEFAULT_CHART_LINE_KALMAN_PROCESS_NOISE,
  );
  const R = normaliseLineKalmanNoise(
    options?.measurementNoise,
    DEFAULT_CHART_LINE_KALMAN_MEASUREMENT_NOISE,
  );
  const P0 = normaliseLineKalmanNoise(
    options?.initialVariance,
    DEFAULT_CHART_LINE_KALMAN_INITIAL_VARIANCE,
  );
  const k = normaliseLineKalmanKSigma(options?.kSigma);
  const initEst = isFiniteNumber(options?.initialEstimate)
    ? options!.initialEstimate!
    : sorted[0]!.y;

  const out: ChartLineKalmanSample[] = [];
  let prevEst = initEst;
  let prevVar = P0;
  for (let i = 0; i < sorted.length; i += 1) {
    const obs = sorted[i]!.y;
    // Predict (random-walk model: x_pred = x_prev; P_pred = P_prev + Q)
    const xPred = prevEst;
    const pPred = prevVar + Q;
    // Update
    const denom = pPred + R;
    const gain = denom > 0 ? pPred / denom : 0;
    const innovation = obs - xPred;
    const est = xPred + gain * innovation;
    const variance = (1 - gain) * pPred;
    const sd = Math.sqrt(Math.max(0, variance));
    out.push({
      index: i,
      x: sorted[i]!.x,
      observation: obs,
      predicted: xPred,
      predictedVariance: pPred,
      estimate: est,
      variance,
      gain,
      innovation,
      upper: est + k * sd,
      lower: est - k * sd,
    });
    prevEst = est;
    prevVar = variance;
  }
  return out;
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

function buildBandPolygon(
  upper: readonly { px: number; py: number }[],
  lower: readonly { px: number; py: number }[],
): string {
  if (upper.length === 0 || lower.length === 0) return '';
  const forward = upper
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.px.toFixed(3)} ${pt.py.toFixed(3)}`)
    .join(' ');
  const back = [...lower]
    .reverse()
    .map((pt) => `L ${pt.px.toFixed(3)} ${pt.py.toFixed(3)}`)
    .join(' ');
  return `${forward} ${back} Z`;
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

function interpolateColor(low: string, high: string, t: number): string {
  const clamp = Math.max(0, Math.min(1, t));
  const a = hexToRgb(low);
  const b = hexToRgb(high);
  if (!a || !b) return low;
  const r = Math.round(a.r + (b.r - a.r) * clamp);
  const g = Math.round(a.g + (b.g - a.g) * clamp);
  const bl = Math.round(a.b + (b.b - a.b) * clamp);
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const v = parseInt(m[1]!, 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

export function computeLineKalmanLayout(
  options: ComputeLineKalmanLayoutOptions,
): ComputeLineKalmanLayoutResult {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_KALMAN_TICK_COUNT,
    processNoise,
    measurementNoise,
    initialVariance,
    initialEstimate,
    kSigma,
    defaultColors = DEFAULT_CHART_LINE_KALMAN_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ComputeLineKalmanLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    innerWidth,
    innerHeight,
    totalPoints: 0,
    visibleSeriesCount: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!Array.isArray(series) || series.length === 0) return empty;

  const hidden = normaliseHidden(hiddenSeries);
  const visible = series.filter((s) => !hidden.has(s.id));
  if (visible.length === 0) return empty;

  const chartQ = normaliseLineKalmanNoise(
    processNoise,
    DEFAULT_CHART_LINE_KALMAN_PROCESS_NOISE,
  );
  const chartR = normaliseLineKalmanNoise(
    measurementNoise,
    DEFAULT_CHART_LINE_KALMAN_MEASUREMENT_NOISE,
  );
  const chartP0 = normaliseLineKalmanNoise(
    initialVariance,
    DEFAULT_CHART_LINE_KALMAN_INITIAL_VARIANCE,
  );
  const chartK = normaliseLineKalmanKSigma(kSigma);

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let totalPoints = 0;

  const samplesBySeries = new Map<string, ChartLineKalmanSample[]>();
  const paramsBySeries = new Map<
    string,
    {
      processNoise: number;
      measurementNoise: number;
      initialVariance: number;
      initialEstimate: number;
      kSigma: number;
    }
  >();

  for (const s of visible) {
    const finite = getLineKalmanFinitePoints(s.data);
    const sQ = normaliseLineKalmanNoise(s.processNoise ?? chartQ, chartQ);
    const sR = normaliseLineKalmanNoise(s.measurementNoise ?? chartR, chartR);
    const sP0 = normaliseLineKalmanNoise(s.initialVariance ?? chartP0, chartP0);
    const sK = normaliseLineKalmanKSigma(s.kSigma ?? chartK);
    const sInit = isFiniteNumber(s.initialEstimate)
      ? s.initialEstimate!
      : isFiniteNumber(initialEstimate)
        ? initialEstimate!
        : finite[0]?.y ?? 0;
    paramsBySeries.set(s.id, {
      processNoise: sQ,
      measurementNoise: sR,
      initialVariance: sP0,
      initialEstimate: sInit,
      kSigma: sK,
    });
    const samples = runLineKalmanFilter(s.data, {
      processNoise: sQ,
      measurementNoise: sR,
      initialEstimate: sInit,
      initialVariance: sP0,
      kSigma: sK,
    });
    samplesBySeries.set(s.id, samples);
    totalPoints += samples.length;
    for (const p of samples) {
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
      if (p.observation < yLo) yLo = p.observation;
      if (p.observation > yHi) yHi = p.observation;
      if (p.upper > yHi) yHi = p.upper;
      if (p.lower < yLo) yLo = p.lower;
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

  const projectX = (x: number): number =>
    padding + ((x - xLo) / xRange) * innerWidth;
  const projectY = (y: number): number =>
    padding + innerHeight - ((y - yLo) / yRange) * innerHeight;

  const layoutSeries: ChartLineKalmanLayoutSeries[] = visible.map((s, idx) => {
    const samples = samplesBySeries.get(s.id) ?? [];
    const params = paramsBySeries.get(s.id) ?? {
      processNoise: chartQ,
      measurementNoise: chartR,
      initialVariance: chartP0,
      initialEstimate: 0,
      kSigma: chartK,
    };
    const color =
      s.color ?? defaultColors[idx % defaultColors.length] ?? DEFAULT_CHART_LINE_KALMAN_PALETTE[0]!;

    const layoutPoints: ChartLineKalmanLayoutPoint[] = samples.map((p) => ({
      ...p,
      px: projectX(p.x),
      obsPy: projectY(p.observation),
      estPy: projectY(p.estimate),
      upperPy: projectY(p.upper),
      lowerPy: projectY(p.lower),
    }));

    const obsPath = buildPath(
      layoutPoints.map((p) => ({ px: p.px, py: p.obsPy })),
    );
    const estPath = buildPath(
      layoutPoints.map((p) => ({ px: p.px, py: p.estPy })),
    );
    const bandPath = buildBandPolygon(
      layoutPoints.map((p) => ({ px: p.px, py: p.upperPy })),
      layoutPoints.map((p) => ({ px: p.px, py: p.lowerPy })),
    );

    let sumGain = 0;
    let maxGain = -1;
    let minGain = 2;
    let sumSq = 0;
    for (const p of samples) {
      sumGain += p.gain;
      if (p.gain > maxGain) maxGain = p.gain;
      if (p.gain < minGain) minGain = p.gain;
      sumSq += (p.observation - p.estimate) ** 2;
    }
    const meanGain = samples.length > 0 ? sumGain / samples.length : 0;
    const rmse = samples.length > 0 ? Math.sqrt(sumSq / samples.length) : 0;

    const last = samples[samples.length - 1];

    return {
      id: s.id,
      label: s.label,
      color,
      processNoise: params.processNoise,
      measurementNoise: params.measurementNoise,
      initialVariance: params.initialVariance,
      initialEstimate: params.initialEstimate,
      kSigma: params.kSigma,
      points: layoutPoints,
      obsPath,
      estPath,
      bandPath,
      finiteCount: samples.length,
      totalCount: s.data?.length ?? 0,
      meanGain,
      maxGain: maxGain === -1 ? 0 : maxGain,
      minGain: minGain === 2 ? 0 : minGain,
      finalVariance: last?.variance ?? 0,
      finalEstimate: last?.estimate ?? 0,
      finalGain: last?.gain ?? 0,
      rmseObservation: rmse,
    };
  });

  return {
    series: layoutSeries,
    xTicks: computeTicks(xLo, xHi, tickCount),
    yTicks: computeTicks(yLo, yHi, tickCount),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    innerWidth,
    innerHeight,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function defaultFormatGain(n: number): string {
  if (!isFiniteNumber(n)) return '';
  return n.toFixed(3);
}

export function describeLineKalmanChart(
  series: readonly ChartLineKalmanSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    processNoise?: number;
    measurementNoise?: number;
    initialVariance?: number;
    initialEstimate?: number;
    kSigma?: number;
    formatValue?: (n: number) => string;
    formatGain?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const chartQ = normaliseLineKalmanNoise(
    options?.processNoise,
    DEFAULT_CHART_LINE_KALMAN_PROCESS_NOISE,
  );
  const chartR = normaliseLineKalmanNoise(
    options?.measurementNoise,
    DEFAULT_CHART_LINE_KALMAN_MEASUREMENT_NOISE,
  );
  const chartP0 = normaliseLineKalmanNoise(
    options?.initialVariance,
    DEFAULT_CHART_LINE_KALMAN_INITIAL_VARIANCE,
  );
  const chartK = normaliseLineKalmanKSigma(options?.kSigma);
  const fmt = options?.formatValue ?? defaultFormatValue;
  const fmtGain = options?.formatGain ?? defaultFormatGain;

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const sQ = normaliseLineKalmanNoise(s.processNoise ?? chartQ, chartQ);
    const sR = normaliseLineKalmanNoise(s.measurementNoise ?? chartR, chartR);
    const sP0 = normaliseLineKalmanNoise(s.initialVariance ?? chartP0, chartP0);
    const sK = normaliseLineKalmanKSigma(s.kSigma ?? chartK);
    const samples = runLineKalmanFilter(s.data, {
      processNoise: sQ,
      measurementNoise: sR,
      initialEstimate: isFiniteNumber(s.initialEstimate)
        ? s.initialEstimate!
        : isFiniteNumber(options?.initialEstimate)
          ? options!.initialEstimate!
          : undefined,
      initialVariance: sP0,
      kSigma: sK,
    });
    totalPoints += samples.length;
    const last = samples[samples.length - 1];
    summaries.push(
      `${s.label}: Q ${fmt(sQ)} R ${fmt(sR)}; final estimate ${last ? fmt(last.estimate) : 'n/a'}; gain ${last ? fmtGain(last.gain) : 'n/a'}`,
    );
  }
  if (totalPoints === 0) return 'No data';

  return `Line chart with Kalman filter smoothing across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineKalman = forwardRef<
  HTMLDivElement,
  ChartLineKalmanProps
>(function ChartLineKalman(
  props: ChartLineKalmanProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_KALMAN_WIDTH,
    height = DEFAULT_CHART_LINE_KALMAN_HEIGHT,
    padding = DEFAULT_CHART_LINE_KALMAN_PADDING,
    tickCount = DEFAULT_CHART_LINE_KALMAN_TICK_COUNT,
    processNoise = DEFAULT_CHART_LINE_KALMAN_PROCESS_NOISE,
    measurementNoise = DEFAULT_CHART_LINE_KALMAN_MEASUREMENT_NOISE,
    initialVariance = DEFAULT_CHART_LINE_KALMAN_INITIAL_VARIANCE,
    initialEstimate,
    kSigma = DEFAULT_CHART_LINE_KALMAN_K_SIGMA,
    obsStrokeWidth = DEFAULT_CHART_LINE_KALMAN_OBS_STROKE_WIDTH,
    estStrokeWidth = DEFAULT_CHART_LINE_KALMAN_EST_STROKE_WIDTH,
    bandStrokeWidth = DEFAULT_CHART_LINE_KALMAN_BAND_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_KALMAN_DOT_RADIUS,
    bandOpacity = DEFAULT_CHART_LINE_KALMAN_BAND_OPACITY,
    obsOpacity = DEFAULT_CHART_LINE_KALMAN_OBS_OPACITY,
    obsColor = DEFAULT_CHART_LINE_KALMAN_OBS_COLOR,
    bandColor = DEFAULT_CHART_LINE_KALMAN_BAND_COLOR,
    gainHighColor = DEFAULT_CHART_LINE_KALMAN_GAIN_HIGH_COLOR,
    gainLowColor = DEFAULT_CHART_LINE_KALMAN_GAIN_LOW_COLOR,
    gridColor = DEFAULT_CHART_LINE_KALMAN_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_KALMAN_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showGainBadge = true,
    showBand = true,
    showObservations = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with Kalman filter smoothing',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    formatGain = defaultFormatGain,
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
      computeLineKalmanLayout({
        series,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        tickCount,
        processNoise,
        measurementNoise,
        initialVariance,
        ...(isFiniteNumber(initialEstimate) ? { initialEstimate } : {}),
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
      initialEstimate,
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
      describeLineKalmanChart(series, {
        hidden: hiddenSet,
        processNoise,
        measurementNoise,
        initialVariance,
        ...(isFiniteNumber(initialEstimate) ? { initialEstimate } : {}),
        kSigma,
        formatValue,
        formatGain,
      }),
    [
      ariaDescription,
      series,
      hiddenSet,
      processNoise,
      measurementNoise,
      initialVariance,
      initialEstimate,
      kSigma,
      formatValue,
      formatGain,
    ],
  );

  const [hoverPayload, setHoverPayload] = useState<{
    seriesId: string;
    pointIndex: number;
  } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ px: number; py: number } | null>(
    null,
  );

  const clearHover = useCallback(() => {
    setHoverPayload(null);
    setTooltipPos(null);
  }, []);

  const handleToggle = useCallback(
    (s: ChartLineKalmanSeries) => {
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
        (acc, s) => acc + getLineKalmanFinitePoints(s.data).length,
        0,
      ),
    [series],
  );

  const dominantGain = useMemo<{
    gain: number;
    seriesId: string;
  }>(() => {
    let best: { gain: number; seriesId: string } = { gain: 0, seriesId: '' };
    for (const s of layout.series) {
      if (Math.abs(s.finalGain) > Math.abs(best.gain)) {
        best = { gain: s.finalGain, seriesId: s.id };
      }
    }
    return best;
  }, [layout.series]);

  const badgeColor = interpolateColor(gainLowColor, gainHighColor, dominantGain.gain);

  const containerStyle: CSSProperties = {
    width,
    height,
    position: 'relative',
    ...(style ?? {}),
  };

  if (layout.series.length === 0) {
    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={className}
        style={containerStyle}
        data-section="chart-line-kalman"
        data-empty="true"
        data-series-count={series.length}
        data-visible-series-count={0}
        data-total-points={0}
        data-process-noise={processNoise}
        data-measurement-noise={measurementNoise}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-kalman-aria-desc"
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
      data-section="chart-line-kalman"
      data-empty="false"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-process-noise={processNoise}
      data-measurement-noise={measurementNoise}
      data-initial-variance={initialVariance}
      data-k-sigma={kSigma}
      data-dominant-gain={dominantGain.gain}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-kalman-aria-desc"
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
        data-section="chart-line-kalman-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showGainBadge && layout.series.length > 0 ? (
          <div
            data-section="chart-line-kalman-badge"
            data-series-id={dominantGain.seriesId}
            data-gain={dominantGain.gain}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: badgeColor,
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-kalman-badge-icon"
              aria-hidden="true"
            >
              K
            </span>
            <span data-section="chart-line-kalman-badge-value">
              {formatGain(dominantGain.gain)}
            </span>
            <span data-section="chart-line-kalman-badge-label">
              final Kalman gain
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-kalman-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-kalman-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => {
                const py =
                  padding +
                  layout.innerHeight -
                  ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                    layout.innerHeight;
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-kalman-grid-line"
                    data-axis="y"
                    x1={padding}
                    x2={padding + layout.innerWidth}
                    y1={py}
                    y2={py}
                  />
                );
              })}
              {layout.xTicks.map((t, i) => {
                const px =
                  padding +
                  ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                    layout.innerWidth;
                return (
                  <line
                    key={`gx-${i}`}
                    data-section="chart-line-kalman-grid-line"
                    data-axis="x"
                    x1={px}
                    x2={px}
                    y1={padding}
                    y2={padding + layout.innerHeight}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-kalman-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-kalman-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
              />
              <line
                data-section="chart-line-kalman-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
              />
              <g data-section="chart-line-kalman-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    padding +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.innerWidth;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-kalman-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={padding + layout.innerHeight}
                        y2={padding + layout.innerHeight + 4}
                      />
                      <text
                        data-section="chart-line-kalman-tick-label"
                        data-axis="x"
                        x={px}
                        y={padding + layout.innerHeight + 14}
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
              <g data-section="chart-line-kalman-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    padding +
                    layout.innerHeight -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.innerHeight;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-kalman-tick"
                      data-axis="y"
                    >
                      <line x1={padding - 4} x2={padding} y1={py} y2={py} />
                      <text
                        data-section="chart-line-kalman-tick-label"
                        data-axis="y"
                        x={padding - 6}
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
                  data-section="chart-line-kalman-x-label"
                  x={padding + layout.innerWidth / 2}
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
                  data-section="chart-line-kalman-y-label"
                  transform={`rotate(-90 12 ${padding + layout.innerHeight / 2})`}
                  x={12}
                  y={padding + layout.innerHeight / 2}
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

          <g data-section="chart-line-kalman-series">
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-kalman-series-group"
                data-series-id={s.id}
                data-series-color={s.color}
                data-series-process-noise={s.processNoise}
                data-series-measurement-noise={s.measurementNoise}
                data-series-initial-variance={s.initialVariance}
                data-series-k-sigma={s.kSigma}
                data-series-finite-count={s.finiteCount}
                data-series-mean-gain={s.meanGain}
                data-series-max-gain={s.maxGain}
                data-series-min-gain={s.minGain}
                data-series-final-gain={s.finalGain}
                data-series-final-estimate={s.finalEstimate}
                data-series-final-variance={s.finalVariance}
                data-series-rmse={s.rmseObservation}
              >
                {showBand && s.bandPath ? (
                  <path
                    data-section="chart-line-kalman-band"
                    data-series-id={s.id}
                    d={s.bandPath}
                    fill={bandColor}
                    fillOpacity={bandOpacity}
                    stroke={bandColor}
                    strokeWidth={bandStrokeWidth}
                    strokeOpacity={0.5}
                    pointerEvents="none"
                  />
                ) : null}
                {showObservations && s.obsPath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} raw observations`}
                    data-section="chart-line-kalman-obs-path"
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
                {s.estPath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} Kalman filter estimate`}
                    data-section="chart-line-kalman-est-path"
                    data-series-id={s.id}
                    data-kind="estimate"
                    d={s.estPath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={estStrokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showDots
                  ? s.points.map((p) => {
                      const isHover =
                        hoverPayload?.seriesId === s.id &&
                        hoverPayload?.pointIndex === p.index;
                      const dotColor = interpolateColor(
                        gainLowColor,
                        gainHighColor,
                        p.gain,
                      );
                      return (
                        <circle
                          key={`d-${p.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)}; observation ${formatValue(p.observation)}; estimate ${formatValue(p.estimate)}; gain ${formatGain(p.gain)}`}
                          data-section="chart-line-kalman-dot"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-x={p.x}
                          data-observation={p.observation}
                          data-estimate={p.estimate}
                          data-variance={p.variance}
                          data-gain={p.gain}
                          data-innovation={p.innovation}
                          data-hovered={isHover ? 'true' : 'false'}
                          cx={p.px}
                          cy={p.estPy}
                          r={isHover ? dotRadius + 1 : dotRadius}
                          fill={dotColor}
                          stroke="#ffffff"
                          strokeWidth={1}
                          onMouseEnter={() => {
                            setHoverPayload({
                              seriesId: s.id,
                              pointIndex: p.index,
                            });
                            setTooltipPos({ px: p.px, py: p.estPy });
                          }}
                          onMouseLeave={clearHover}
                          onFocus={() => {
                            setHoverPayload({
                              seriesId: s.id,
                              pointIndex: p.index,
                            });
                            setTooltipPos({ px: p.px, py: p.estPy });
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
              const p = s.points[hoverPayload.pointIndex];
              if (!p) return null;
              const gainColor = interpolateColor(
                gainLowColor,
                gainHighColor,
                p.gain,
              );
              return (
                <div
                  data-section="chart-line-kalman-tooltip"
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
                    minWidth: 160,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-kalman-tooltip-label"
                    style={{ color: s.color, fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-kalman-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div data-section="chart-line-kalman-tooltip-observation">
                    obs: {formatValue(p.observation)}
                  </div>
                  <div
                    data-section="chart-line-kalman-tooltip-estimate"
                    style={{ fontWeight: 600 }}
                  >
                    est: {formatValue(p.estimate)}
                  </div>
                  <div data-section="chart-line-kalman-tooltip-variance">
                    var: {formatValue(p.variance)}
                  </div>
                  <div
                    data-section="chart-line-kalman-tooltip-gain"
                    style={{ color: gainColor }}
                  >
                    gain: {formatGain(p.gain)}
                  </div>
                  <div data-section="chart-line-kalman-tooltip-innovation">
                    innov: {formatValue(p.innovation)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-kalman-legend"
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
              DEFAULT_CHART_LINE_KALMAN_PALETTE[0]!;
            return (
              <button
                key={s.id}
                type="button"
                data-section="chart-line-kalman-legend-item"
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
                  data-section="chart-line-kalman-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: swatchColor,
                  }}
                />
                <span data-section="chart-line-kalman-legend-label">
                  {s.label}
                </span>
                {layoutMatch ? (
                  <span
                    data-section="chart-line-kalman-legend-stats"
                    style={{ fontSize: 10, color: '#64748b' }}
                  >
                    (Q {formatValue(layoutMatch.processNoise)}, R{' '}
                    {formatValue(layoutMatch.measurementNoise)};
                    {' '}gain {formatGain(layoutMatch.meanGain)})
                  </span>
                ) : null}
              </button>
            );
          })}
          <span
            data-section="chart-line-kalman-legend-total-points"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {allTotalPoints} total points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineKalman.displayName = 'ChartLineKalman';
