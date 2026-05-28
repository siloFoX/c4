import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ARIMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_ARIMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_ARIMA_PADDING = 40;
export const DEFAULT_CHART_LINE_ARIMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ARIMA_RAW_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_ARIMA_PREDICT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ARIMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ARIMA_RAW_OPACITY = 0.4;
export const DEFAULT_CHART_LINE_ARIMA_RESIDUAL_OPACITY = 0.55;
export const DEFAULT_CHART_LINE_ARIMA_PALETTE = [
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
export const DEFAULT_CHART_LINE_ARIMA_RAW_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ARIMA_FORECAST_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ARIMA_RESIDUAL_POS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ARIMA_RESIDUAL_NEG_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ARIMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ARIMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineArimaResidualSign = 'positive' | 'negative' | 'zero';

export interface ChartLineArimaPoint {
  x: number;
  y: number;
}

export interface ChartLineArimaSeries {
  id: string;
  label: string;
  data: readonly ChartLineArimaPoint[];
  color?: string;
}

export interface ChartLineArimaFit {
  phi: number;
  intercept: number;
  mean: number;
  stationary: boolean;
}

export interface ChartLineArimaSample {
  index: number;
  x: number;
  raw: number;
  predicted: number | null;
  residual: number | null;
  residualSign: ChartLineArimaResidualSign;
}

export interface ChartLineArimaForecast {
  x: number;
  value: number;
}

export interface ChartLineArimaLayoutPoint extends ChartLineArimaSample {
  px: number;
  rawPy: number;
  predictedPy: number | null;
}

export interface ChartLineArimaLayoutSeries {
  id: string;
  label: string;
  color: string;
  phi: number;
  intercept: number;
  mean: number;
  stationary: boolean;
  points: ChartLineArimaLayoutPoint[];
  rawPath: string;
  predictedPath: string;
  residualSegments: {
    index: number;
    px: number;
    rawPy: number;
    predictedPy: number;
    residual: number;
    sign: ChartLineArimaResidualSign;
  }[];
  forecast: ChartLineArimaForecast | null;
  forecastPx: number | null;
  forecastPy: number | null;
  finiteCount: number;
  totalCount: number;
  predictedValidCount: number;
  positiveResidualCount: number;
  negativeResidualCount: number;
  zeroResidualCount: number;
  rmseResidual: number;
  maxAbsResidual: number;
}

export interface ChartLineArimaLayout {
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
  series: ChartLineArimaLayoutSeries[];
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineArimaLayoutOptions {
  series: readonly ChartLineArimaSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  extendForForecast?: boolean;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineArimaProps {
  series: readonly ChartLineArimaSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  rawStrokeWidth?: number;
  predictStrokeWidth?: number;
  dotRadius?: number;
  rawOpacity?: number;
  residualOpacity?: number;
  rawColor?: string;
  forecastColor?: string;
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
  showForecast?: boolean;
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
    series: ChartLineArimaLayoutSeries;
    point: ChartLineArimaLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineArimaSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineArimaDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_ARIMA_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineArimaFinitePoints(
  points: readonly ChartLineArimaPoint[] | null | undefined,
): ChartLineArimaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineArimaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function classifyLineArimaResidualSign(
  residual: number | null,
): ChartLineArimaResidualSign {
  if (residual === null || !isFiniteNumber(residual)) return 'zero';
  if (residual > 0) return 'positive';
  if (residual < 0) return 'negative';
  return 'zero';
}

function meanOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (isFiniteNumber(v)) {
      sum += v;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Fit a stationary AR(1) model -- ARIMA(1, 0, 0) -- to a value series
 * by conditional ordinary least squares.
 *
 * The AR(1) model is:
 *
 *   y_t = c + phi * y_{t-1} + epsilon_t
 *
 * The conditional least-squares estimate regresses y_t on y_{t-1}
 * over the pairs (y_{t-1}, y_t) for t = 1 .. N-1:
 *
 *   phi = sum (x_i - xbar)(y_i - ybar) / sum (x_i - xbar)^2
 *   c   = ybar - phi * xbar
 *
 * where x_i are the lagged values y_0 .. y_{N-2} and y_i are the
 * response values y_1 .. y_{N-1}.
 *
 * - For N < 2 the model degrades to phi = 0, c = mean (a constant
 *   prediction at the series mean).
 * - When the lagged values have zero variance (a constant series),
 *   phi = 0 and c = mean.
 * - `stationary` reports whether |phi| < 1 (the AR(1) stationarity
 *   condition). A non-stationary fit still produces predictions, but
 *   forecasts will diverge.
 */
export function fitLineArimaAR1(
  values: readonly number[] | null | undefined,
): ChartLineArimaFit {
  if (!Array.isArray(values) || values.length === 0) {
    return { phi: 0, intercept: 0, mean: 0, stationary: true };
  }
  const finite = values.filter((v): v is number => isFiniteNumber(v));
  const mean = meanOf(finite);
  if (finite.length < 2) {
    return { phi: 0, intercept: mean, mean, stationary: true };
  }
  const N = finite.length;
  const predictor = finite.slice(0, N - 1);
  const response = finite.slice(1);
  const xbar = meanOf(predictor);
  const ybar = meanOf(response);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < predictor.length; i += 1) {
    const dx = predictor[i]! - xbar;
    const dy = response[i]! - ybar;
    sxx += dx * dx;
    sxy += dx * dy;
  }
  const phi = sxx > 0 ? sxy / sxx : 0;
  const intercept = ybar - phi * xbar;
  return {
    phi,
    intercept,
    mean,
    stationary: Math.abs(phi) < 1,
  };
}

/**
 * One-step-ahead AR(1) predictions: yhat_t = c + phi * y_{t-1}.
 * Index 0 has no prior value, so its prediction is null.
 */
export function predictLineArimaOneStep(
  values: readonly number[] | null | undefined,
  fit: { phi: number; intercept: number },
): (number | null)[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: (number | null)[] = new Array(values.length);
  out[0] = null;
  for (let t = 1; t < values.length; t += 1) {
    const prev = values[t - 1];
    out[t] = isFiniteNumber(prev)
      ? fit.intercept + fit.phi * prev
      : null;
  }
  return out;
}

/**
 * One-step-ahead forecast beyond the last observation:
 *   yhat_N = c + phi * y_{N-1}
 * Returns null for an empty series.
 */
export function forecastLineArimaNext(
  values: readonly number[] | null | undefined,
  fit: { phi: number; intercept: number },
): number | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  const last = values[values.length - 1];
  if (!isFiniteNumber(last)) return null;
  return fit.intercept + fit.phi * last;
}

export function runLineArima(
  points: readonly ChartLineArimaPoint[] | null | undefined,
): {
  samples: ChartLineArimaSample[];
  phi: number;
  intercept: number;
  mean: number;
  stationary: boolean;
  rmse: number;
  maxAbsResidual: number;
  predictedValidCount: number;
  positiveResidualCount: number;
  negativeResidualCount: number;
  zeroResidualCount: number;
  forecast: ChartLineArimaForecast | null;
} {
  const finite = getLineArimaFinitePoints(points);
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const N = sorted.length;
  const ys = sorted.map((p) => p.y);
  const fit = fitLineArimaAR1(ys);
  const predictions = predictLineArimaOneStep(ys, fit);

  let sumSq = 0;
  let maxAbs = 0;
  let predictedValid = 0;
  let positive = 0;
  let negative = 0;
  let zero = 0;

  const samples: ChartLineArimaSample[] = sorted.map((p, i) => {
    const predicted = predictions[i] ?? null;
    const residual =
      predicted !== null && isFiniteNumber(predicted)
        ? p.y - predicted
        : null;
    const residualSign = classifyLineArimaResidualSign(residual);
    if (predicted !== null && isFiniteNumber(predicted)) {
      predictedValid += 1;
    }
    if (residual !== null && isFiniteNumber(residual)) {
      sumSq += residual * residual;
      const a = Math.abs(residual);
      if (a > maxAbs) maxAbs = a;
    }
    if (residualSign === 'positive') positive += 1;
    else if (residualSign === 'negative') negative += 1;
    else zero += 1;
    return {
      index: i,
      x: p.x,
      raw: p.y,
      predicted,
      residual,
      residualSign,
    };
  });

  const rmse = predictedValid > 0 ? Math.sqrt(sumSq / predictedValid) : 0;

  let forecast: ChartLineArimaForecast | null = null;
  const forecastValue = forecastLineArimaNext(ys, fit);
  if (forecastValue !== null && N >= 1) {
    const lastX = sorted[N - 1]!.x;
    const step =
      N >= 2 ? (sorted[N - 1]!.x - sorted[0]!.x) / (N - 1) : 1;
    forecast = {
      x: lastX + (step > 0 ? step : 1),
      value: forecastValue,
    };
  }

  return {
    samples,
    phi: fit.phi,
    intercept: fit.intercept,
    mean: fit.mean,
    stationary: fit.stationary,
    rmse,
    maxAbsResidual: maxAbs,
    predictedValidCount: predictedValid,
    positiveResidualCount: positive,
    negativeResidualCount: negative,
    zeroResidualCount: zero,
    forecast,
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

export function computeLineArimaLayout(
  options: ComputeLineArimaLayoutOptions,
): ChartLineArimaLayout {
  const {
    series = [],
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_ARIMA_TICK_COUNT,
    extendForForecast = true,
    defaultColors = DEFAULT_CHART_LINE_ARIMA_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ChartLineArimaLayout = {
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

  const runBySeries = new Map<string, ReturnType<typeof runLineArima>>();

  for (const s of visible) {
    const run = runLineArima(s.data);
    runBySeries.set(s.id, run);
    totalPoints += run.samples.length;
    for (const sample of run.samples) {
      if (sample.x < xLo) xLo = sample.x;
      if (sample.x > xHi) xHi = sample.x;
      if (sample.raw < yLo) yLo = sample.raw;
      if (sample.raw > yHi) yHi = sample.raw;
      if (sample.predicted !== null) {
        if (sample.predicted < yLo) yLo = sample.predicted;
        if (sample.predicted > yHi) yHi = sample.predicted;
      }
    }
    if (extendForForecast && run.forecast) {
      if (run.forecast.x > xHi) xHi = run.forecast.x;
      if (run.forecast.value < yLo) yLo = run.forecast.value;
      if (run.forecast.value > yHi) yHi = run.forecast.value;
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

  const layoutSeries: ChartLineArimaLayoutSeries[] = visible.map((s, idx) => {
    const run = runBySeries.get(s.id)!;
    const color =
      s.color ??
      defaultColors[idx % defaultColors.length] ??
      DEFAULT_CHART_LINE_ARIMA_PALETTE[0]!;

    const points: ChartLineArimaLayoutPoint[] = run.samples.map((sample) => {
      const rawPy = projectY(sample.raw);
      const predictedPy =
        sample.predicted !== null ? projectY(sample.predicted) : null;
      return {
        ...sample,
        px: projectX(sample.x),
        rawPy,
        predictedPy,
      };
    });

    const rawPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.rawPy })),
    );
    const predictedPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.predictedPy })),
    );
    const residualSegments = points
      .filter((p) => p.predictedPy !== null && p.residual !== null)
      .map((p) => ({
        index: p.index,
        px: p.px,
        rawPy: p.rawPy,
        predictedPy: p.predictedPy!,
        residual: p.residual!,
        sign: p.residualSign,
      }));

    const forecastPx =
      run.forecast !== null ? projectX(run.forecast.x) : null;
    const forecastPy =
      run.forecast !== null ? projectY(run.forecast.value) : null;

    return {
      id: s.id,
      label: s.label,
      color,
      phi: run.phi,
      intercept: run.intercept,
      mean: run.mean,
      stationary: run.stationary,
      points,
      rawPath,
      predictedPath,
      residualSegments,
      forecast: run.forecast,
      forecastPx,
      forecastPy,
      finiteCount: run.samples.length,
      totalCount: s.data?.length ?? 0,
      predictedValidCount: run.predictedValidCount,
      positiveResidualCount: run.positiveResidualCount,
      negativeResidualCount: run.negativeResidualCount,
      zeroResidualCount: run.zeroResidualCount,
      rmseResidual: run.rmse,
      maxAbsResidual: run.maxAbsResidual,
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
  return n.toFixed(3);
}

export function describeLineArimaChart(
  series: readonly ChartLineArimaSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
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
    const run = runLineArima(s.data);
    totalPoints += run.samples.length;
    summaries.push(
      `${s.label}: AR(1) phi ${fmt(run.phi)}, intercept ${fmt(run.intercept)}, ${run.stationary ? 'stationary' : 'non-stationary'}, RMSE ${fmt(run.rmse)}`,
    );
  }
  return `Line chart with ARIMA(1,0,0) AR(1) one-step prediction overlay across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineArima = forwardRef<HTMLDivElement, ChartLineArimaProps>(
  function ChartLineArima(
    props: ChartLineArimaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      series,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_ARIMA_WIDTH,
      height = DEFAULT_CHART_LINE_ARIMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_ARIMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_ARIMA_TICK_COUNT,
      rawStrokeWidth = DEFAULT_CHART_LINE_ARIMA_RAW_STROKE_WIDTH,
      predictStrokeWidth = DEFAULT_CHART_LINE_ARIMA_PREDICT_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_ARIMA_DOT_RADIUS,
      rawOpacity = DEFAULT_CHART_LINE_ARIMA_RAW_OPACITY,
      residualOpacity = DEFAULT_CHART_LINE_ARIMA_RESIDUAL_OPACITY,
      rawColor = DEFAULT_CHART_LINE_ARIMA_RAW_COLOR,
      forecastColor = DEFAULT_CHART_LINE_ARIMA_FORECAST_COLOR,
      residualPosColor = DEFAULT_CHART_LINE_ARIMA_RESIDUAL_POS_COLOR,
      residualNegColor = DEFAULT_CHART_LINE_ARIMA_RESIDUAL_NEG_COLOR,
      gridColor = DEFAULT_CHART_LINE_ARIMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_ARIMA_AXIS_COLOR,
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
      showForecast = true,
      showResidualSticks = false,
      animate = true,
      className,
      ariaLabel = 'Line chart with ARIMA(1,0,0) AR(1) one-step prediction overlay',
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
        computeLineArimaLayout({
          series,
          hiddenSeries: hiddenSet,
          width,
          height,
          padding,
          tickCount,
          extendForForecast: showForecast,
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
        showForecast,
        xMin,
        xMax,
        yMin,
        yMax,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineArimaChart(series, {
          hidden: hiddenSet,
          formatCoefficient,
        }),
      [ariaDescription, series, hiddenSet, formatCoefficient],
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
      (s: ChartLineArimaSeries) => {
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
          (acc, s) => acc + getLineArimaFinitePoints(s.data).length,
          0,
        ),
      [series],
    );

    const dominantConfig = useMemo<{
      phi: number;
      intercept: number;
      rmse: number;
      stationary: boolean;
      seriesId: string;
    }>(() => {
      if (layout.series.length === 0) {
        return {
          phi: 0,
          intercept: 0,
          rmse: 0,
          stationary: true,
          seriesId: '',
        };
      }
      const s = layout.series[0]!;
      return {
        phi: s.phi,
        intercept: s.intercept,
        rmse: s.rmseResidual,
        stationary: s.stationary,
        seriesId: s.id,
      };
    }, [layout.series]);

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
          data-section="chart-line-arima"
          data-empty="true"
          data-series-count={series.length}
          data-visible-series-count={0}
          data-total-points={0}
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-arima-aria-desc"
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
        data-section="chart-line-arima"
        data-empty="false"
        data-series-count={series.length}
        data-visible-series-count={layout.visibleSeriesCount}
        data-total-points={layout.totalPoints}
        data-phi={dominantConfig.phi}
        data-intercept={dominantConfig.intercept}
        data-rmse={dominantConfig.rmse}
        data-stationary={dominantConfig.stationary ? 'true' : 'false'}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-arima-aria-desc"
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
          data-section="chart-line-arima-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-arima-badge"
              data-phi={dominantConfig.phi}
              data-intercept={dominantConfig.intercept}
              data-rmse={dominantConfig.rmse}
              data-stationary={dominantConfig.stationary ? 'true' : 'false'}
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
                data-section="chart-line-arima-badge-icon"
                aria-hidden="true"
              >
                AR1
              </span>
              <span data-section="chart-line-arima-badge-phi">
                phi={formatCoefficient(dominantConfig.phi)}
              </span>
              <span data-section="chart-line-arima-badge-intercept">
                c={formatCoefficient(dominantConfig.intercept)}
              </span>
              <span data-section="chart-line-arima-badge-rmse">
                rmse={formatCoefficient(dominantConfig.rmse)}
              </span>
              <span data-section="chart-line-arima-badge-stationary">
                {dominantConfig.stationary ? 'stationary' : 'non-stationary'}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-arima-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-arima-grid"
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
                      data-section="chart-line-arima-grid-line"
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
                      data-section="chart-line-arima-grid-line"
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
                data-section="chart-line-arima-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-arima-axis"
                  data-axis="x"
                  x1={layout.panel.x}
                  y1={layout.panel.y + layout.panel.height}
                  x2={layout.panel.x + layout.panel.width}
                  y2={layout.panel.y + layout.panel.height}
                />
                <line
                  data-section="chart-line-arima-axis"
                  data-axis="y"
                  x1={layout.panel.x}
                  y1={layout.panel.y}
                  x2={layout.panel.x}
                  y2={layout.panel.y + layout.panel.height}
                />
                <g data-section="chart-line-arima-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => {
                    const px =
                      layout.panel.x +
                      ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                        layout.panel.width;
                    return (
                      <g
                        key={`tx-${i}`}
                        data-section="chart-line-arima-tick"
                        data-axis="x"
                      >
                        <line
                          x1={px}
                          x2={px}
                          y1={layout.panel.y + layout.panel.height}
                          y2={layout.panel.y + layout.panel.height + 4}
                        />
                        <text
                          data-section="chart-line-arima-tick-label"
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
                <g data-section="chart-line-arima-ticks" data-axis="y">
                  {layout.yTicks.map((t, i) => {
                    const py =
                      layout.panel.y +
                      layout.panel.height -
                      ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                        layout.panel.height;
                    return (
                      <g
                        key={`ty-${i}`}
                        data-section="chart-line-arima-tick"
                        data-axis="y"
                      >
                        <line
                          x1={layout.panel.x - 4}
                          x2={layout.panel.x}
                          y1={py}
                          y2={py}
                        />
                        <text
                          data-section="chart-line-arima-tick-label"
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
                    data-section="chart-line-arima-x-label"
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
                    data-section="chart-line-arima-y-label"
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

            <g data-section="chart-line-arima-series">
              {layout.series.map((s) => (
                <g
                  key={s.id}
                  data-section="chart-line-arima-series-group"
                  data-series-id={s.id}
                  data-series-color={s.color}
                  data-series-phi={s.phi}
                  data-series-intercept={s.intercept}
                  data-series-mean={s.mean}
                  data-series-stationary={s.stationary ? 'true' : 'false'}
                  data-series-rmse={s.rmseResidual}
                  data-series-max-abs-residual={s.maxAbsResidual}
                  data-series-predicted-valid-count={s.predictedValidCount}
                  data-series-positive-residual-count={s.positiveResidualCount}
                  data-series-negative-residual-count={s.negativeResidualCount}
                  data-series-zero-residual-count={s.zeroResidualCount}
                  data-series-finite-count={s.finiteCount}
                  data-series-forecast={s.forecast ? s.forecast.value : ''}
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
                            data-section="chart-line-arima-residual-stick"
                            data-series-id={s.id}
                            data-point-index={seg.index}
                            data-sign={seg.sign}
                            x1={seg.px}
                            x2={seg.px}
                            y1={seg.rawPy}
                            y2={seg.predictedPy}
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
                      data-section="chart-line-arima-raw-path"
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
                  {s.predictedPath ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} AR(1) one-step prediction (phi ${formatCoefficient(s.phi)}, intercept ${formatCoefficient(s.intercept)})`}
                      data-section="chart-line-arima-predicted-path"
                      data-series-id={s.id}
                      data-kind="predicted"
                      d={s.predictedPath}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={predictStrokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {showForecast &&
                  s.forecast !== null &&
                  s.forecastPx !== null &&
                  s.forecastPy !== null &&
                  s.points.length > 0 ? (
                    <g
                      data-section="chart-line-arima-forecast"
                      data-series-id={s.id}
                      data-forecast-x={s.forecast.x}
                      data-forecast-value={s.forecast.value}
                    >
                      <line
                        data-section="chart-line-arima-forecast-segment"
                        data-series-id={s.id}
                        x1={s.points[s.points.length - 1]!.px}
                        y1={s.points[s.points.length - 1]!.rawPy}
                        x2={s.forecastPx}
                        y2={s.forecastPy}
                        stroke={forecastColor}
                        strokeWidth={predictStrokeWidth}
                        strokeDasharray="5 3"
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                      <circle
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={`${s.label} forecast value ${formatValue(s.forecast.value)} at x ${formatX(s.forecast.x)}`}
                        data-section="chart-line-arima-forecast-dot"
                        data-series-id={s.id}
                        data-forecast-x={s.forecast.x}
                        data-forecast-value={s.forecast.value}
                        cx={s.forecastPx}
                        cy={s.forecastPy}
                        r={dotRadius + 1}
                        fill={forecastColor}
                        stroke="#ffffff"
                        strokeWidth={1}
                      />
                    </g>
                  ) : null}
                  {showDots
                    ? s.points.map((p) => {
                        const isHover =
                          hoverPayload?.seriesId === s.id &&
                          hoverPayload?.pointIndex === p.index;
                        const cy =
                          p.predictedPy !== null ? p.predictedPy : p.rawPy;
                        return (
                          <circle
                            key={`d-${p.index}`}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)}; raw ${formatValue(p.raw)}; predicted ${p.predicted === null ? 'n/a' : formatValue(p.predicted)}`}
                            data-section="chart-line-arima-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-raw={p.raw}
                            data-predicted={p.predicted ?? ''}
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
                    data-section="chart-line-arima-tooltip"
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
                      data-section="chart-line-arima-tooltip-label"
                      style={{ color: s.color, fontWeight: 600 }}
                    >
                      {s.label}
                    </div>
                    <div data-section="chart-line-arima-tooltip-x">
                      x: {formatX(p.x)}
                    </div>
                    <div data-section="chart-line-arima-tooltip-raw">
                      raw: {formatValue(p.raw)}
                    </div>
                    <div
                      data-section="chart-line-arima-tooltip-predicted"
                      style={{ fontWeight: 600 }}
                    >
                      predicted:{' '}
                      {p.predicted === null
                        ? 'n/a'
                        : formatValue(p.predicted)}
                    </div>
                    <div
                      data-section="chart-line-arima-tooltip-residual"
                      style={{ color: tipColor }}
                    >
                      residual:{' '}
                      {p.residual === null
                        ? 'n/a'
                        : (p.residual >= 0 ? '+' : '') +
                          formatValue(p.residual)}
                    </div>
                    <div data-section="chart-line-arima-tooltip-config">
                      phi={formatCoefficient(s.phi)}, c=
                      {formatCoefficient(s.intercept)}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-arima-legend"
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
                DEFAULT_CHART_LINE_ARIMA_PALETTE[0]!;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-section="chart-line-arima-legend-item"
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
                    data-section="chart-line-arima-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: swatchColor,
                    }}
                  />
                  <span data-section="chart-line-arima-legend-label">
                    {s.label}
                  </span>
                  {layoutMatch ? (
                    <span
                      data-section="chart-line-arima-legend-stats"
                      style={{ fontSize: 10, color: '#64748b' }}
                    >
                      (phi={formatCoefficient(layoutMatch.phi)};{' '}
                      rmse {formatCoefficient(layoutMatch.rmseResidual)})
                    </span>
                  ) : null}
                </button>
              );
            })}
            <span
              data-section="chart-line-arima-legend-total-points"
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

ChartLineArima.displayName = 'ChartLineArima';
