import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_HOLTWINTERS_WIDTH = 560;
export const DEFAULT_CHART_LINE_HOLTWINTERS_HEIGHT = 320;
export const DEFAULT_CHART_LINE_HOLTWINTERS_PADDING = 40;
export const DEFAULT_CHART_LINE_HOLTWINTERS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HOLTWINTERS_RAW_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_HOLTWINTERS_FITTED_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HOLTWINTERS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HOLTWINTERS_RAW_OPACITY = 0.4;
export const DEFAULT_CHART_LINE_HOLTWINTERS_RESIDUAL_OPACITY = 0.55;
export const DEFAULT_CHART_LINE_HOLTWINTERS_ALPHA = 0.5;
export const DEFAULT_CHART_LINE_HOLTWINTERS_BETA = 0.3;
export const DEFAULT_CHART_LINE_HOLTWINTERS_GAMMA = 0.3;
export const DEFAULT_CHART_LINE_HOLTWINTERS_SEASON_LENGTH = 4;
export const DEFAULT_CHART_LINE_HOLTWINTERS_FORECAST_HORIZON = 4;
export const DEFAULT_CHART_LINE_HOLTWINTERS_PALETTE = [
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
export const DEFAULT_CHART_LINE_HOLTWINTERS_RAW_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_HOLTWINTERS_FORECAST_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_HOLTWINTERS_RESIDUAL_POS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HOLTWINTERS_RESIDUAL_NEG_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HOLTWINTERS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_HOLTWINTERS_AXIS_COLOR = '#cbd5e1';

export type ChartLineHoltWintersResidualSign =
  | 'positive'
  | 'negative'
  | 'zero';

export interface ChartLineHoltWintersPoint {
  x: number;
  y: number;
}

export interface ChartLineHoltWintersSeries {
  id: string;
  label: string;
  data: readonly ChartLineHoltWintersPoint[];
  color?: string;
  alpha?: number;
  beta?: number;
  gamma?: number;
  seasonLength?: number;
}

export interface ChartLineHoltWintersFit {
  ok: boolean;
  fitted: (number | null)[];
  initialLevel: number;
  initialTrend: number;
  initialSeasonals: number[];
  level: number;
  trend: number;
  seasonals: number[];
  alpha: number;
  beta: number;
  gamma: number;
  seasonLength: number;
}

export interface ChartLineHoltWintersSample {
  index: number;
  x: number;
  raw: number;
  fitted: number | null;
  residual: number | null;
  residualSign: ChartLineHoltWintersResidualSign;
}

export interface ChartLineHoltWintersForecastPoint {
  horizon: number;
  x: number;
  value: number;
}

export interface ChartLineHoltWintersLayoutPoint
  extends ChartLineHoltWintersSample {
  px: number;
  rawPy: number;
  fittedPy: number | null;
}

export interface ChartLineHoltWintersLayoutForecastPoint
  extends ChartLineHoltWintersForecastPoint {
  px: number;
  py: number;
}

export interface ChartLineHoltWintersLayoutSeries {
  id: string;
  label: string;
  color: string;
  alpha: number;
  beta: number;
  gamma: number;
  seasonLength: number;
  ok: boolean;
  level: number;
  trend: number;
  points: ChartLineHoltWintersLayoutPoint[];
  rawPath: string;
  fittedPath: string;
  residualSegments: {
    index: number;
    px: number;
    rawPy: number;
    fittedPy: number;
    residual: number;
    sign: ChartLineHoltWintersResidualSign;
  }[];
  forecastPoints: ChartLineHoltWintersLayoutForecastPoint[];
  forecastPath: string;
  finiteCount: number;
  totalCount: number;
  fittedValidCount: number;
  positiveResidualCount: number;
  negativeResidualCount: number;
  zeroResidualCount: number;
  rmseResidual: number;
  maxAbsResidual: number;
}

export interface ChartLineHoltWintersLayout {
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
  series: ChartLineHoltWintersLayoutSeries[];
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineHoltWintersLayoutOptions {
  series: readonly ChartLineHoltWintersSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  alpha?: number;
  beta?: number;
  gamma?: number;
  seasonLength?: number;
  forecastHorizon?: number;
  extendForForecast?: boolean;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineHoltWintersProps {
  series: readonly ChartLineHoltWintersSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  alpha?: number;
  beta?: number;
  gamma?: number;
  seasonLength?: number;
  forecastHorizon?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  rawStrokeWidth?: number;
  fittedStrokeWidth?: number;
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
    series: ChartLineHoltWintersLayoutSeries;
    point: ChartLineHoltWintersLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineHoltWintersSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineHoltWintersDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_HOLTWINTERS_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineHoltWintersFinitePoints(
  points: readonly ChartLineHoltWintersPoint[] | null | undefined,
): ChartLineHoltWintersPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineHoltWintersPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

/**
 * Clamp a smoothing factor to [0, 1]. Non-finite values fall back to
 * `fallback`. All three Holt-Winters factors (alpha = level,
 * beta = trend, gamma = seasonal) live on this interval.
 */
export function normaliseLineHoltWintersSmoothingFactor(
  value: unknown,
  fallback: number,
): number {
  if (!isFiniteNumber(value)) return fallback;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Clamp the season length to an integer >= 2. Non-finite -> default 4.
 */
export function normaliseLineHoltWintersSeasonLength(value: unknown): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_CHART_LINE_HOLTWINTERS_SEASON_LENGTH;
  }
  const v = Math.floor(value);
  if (v < 2) return 2;
  return v;
}

/**
 * Clamp the forecast horizon to an integer >= 0. Non-finite -> default.
 */
export function normaliseLineHoltWintersForecastHorizon(
  value: unknown,
): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_CHART_LINE_HOLTWINTERS_FORECAST_HORIZON;
  }
  const v = Math.floor(value);
  if (v < 0) return 0;
  if (v > 366) return 366;
  return v;
}

export function classifyLineHoltWintersResidualSign(
  residual: number | null,
): ChartLineHoltWintersResidualSign {
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

export interface FitLineHoltWintersOptions {
  alpha?: number;
  beta?: number;
  gamma?: number;
  seasonLength?: number;
}

/**
 * Fit an **additive Holt-Winters triple-exponential smoothing** model.
 *
 * Holt-Winters extends simple exponential smoothing with separate
 * recursions for level, trend, and seasonality. For a season length
 * `m` the three components update as:
 *
 *   level_t    = alpha * (y_t - season_{t-m})
 *                + (1 - alpha) * (level_{t-1} + trend_{t-1})
 *   trend_t    = beta * (level_t - level_{t-1})
 *                + (1 - beta) * trend_{t-1}
 *   season_t   = gamma * (y_t - level_t)
 *                + (1 - gamma) * season_{t-m}
 *
 * and the in-sample one-step fitted value is:
 *
 *   yhat_t = level_{t-1} + trend_{t-1} + season_{t-m}
 *
 * Initialisation (standard textbook scheme):
 * - `initialLevel` = mean of the first season `y_0 .. y_{m-1}`.
 * - `initialTrend` = mean per-step slope between the first two
 *   seasons (0 when fewer than two full seasons are available).
 * - `initialSeasonals[i]` = `y_i - initialLevel` for the first season.
 *
 * The recursion runs for `t = m .. N-1`, so the first `m` fitted
 * values are null. `ok` is false when there are fewer than `m + 1`
 * finite values (not enough data for a single fitted point).
 */
export function fitLineHoltWinters(
  values: readonly number[] | null | undefined,
  options?: FitLineHoltWintersOptions,
): ChartLineHoltWintersFit {
  const alpha = normaliseLineHoltWintersSmoothingFactor(
    options?.alpha,
    DEFAULT_CHART_LINE_HOLTWINTERS_ALPHA,
  );
  const beta = normaliseLineHoltWintersSmoothingFactor(
    options?.beta,
    DEFAULT_CHART_LINE_HOLTWINTERS_BETA,
  );
  const gamma = normaliseLineHoltWintersSmoothingFactor(
    options?.gamma,
    DEFAULT_CHART_LINE_HOLTWINTERS_GAMMA,
  );
  const m = normaliseLineHoltWintersSeasonLength(options?.seasonLength);

  const vals = Array.isArray(values)
    ? values.filter((v): v is number => isFiniteNumber(v))
    : [];
  const N = vals.length;
  const baseMean = N > 0 ? meanOf(vals) : 0;

  if (N < m + 1) {
    return {
      ok: false,
      fitted: vals.map(() => null),
      initialLevel: baseMean,
      initialTrend: 0,
      initialSeasonals: [],
      level: baseMean,
      trend: 0,
      seasonals: [],
      alpha,
      beta,
      gamma,
      seasonLength: m,
    };
  }

  const firstSeason = vals.slice(0, m);
  const initialLevel = meanOf(firstSeason);

  let initialTrend = 0;
  if (N >= 2 * m) {
    let sum = 0;
    for (let i = 0; i < m; i += 1) {
      sum += (vals[m + i]! - vals[i]!) / m;
    }
    initialTrend = sum / m;
  }

  const initialSeasonals: number[] = [];
  for (let i = 0; i < m; i += 1) {
    initialSeasonals.push(vals[i]! - initialLevel);
  }

  const seasonals = [...initialSeasonals];
  let level = initialLevel;
  let trend = initialTrend;
  const fitted: (number | null)[] = new Array(N).fill(null);

  for (let t = m; t < N; t += 1) {
    const pos = t % m;
    const seasonal = seasonals[pos]!;
    fitted[t] = level + trend + seasonal;
    const value = vals[t]!;
    const newLevel =
      alpha * (value - seasonal) + (1 - alpha) * (level + trend);
    const newTrend = beta * (newLevel - level) + (1 - beta) * trend;
    const newSeasonal =
      gamma * (value - newLevel) + (1 - gamma) * seasonal;
    level = newLevel;
    trend = newTrend;
    seasonals[pos] = newSeasonal;
  }

  return {
    ok: true,
    fitted,
    initialLevel,
    initialTrend,
    initialSeasonals,
    level,
    trend,
    seasonals,
    alpha,
    beta,
    gamma,
    seasonLength: m,
  };
}

/**
 * Holt-Winters multi-step forecast beyond the fitted data:
 *
 *   yhat_{N-1+h} = level + h * trend + season_{(N-1+h) mod m}
 *
 * Returns an array of `horizon` forecast values. Empty when the fit
 * failed or `horizon <= 0`.
 */
export function forecastLineHoltWinters(
  fit: ChartLineHoltWintersFit,
  horizon: number,
): number[] {
  if (!fit.ok) return [];
  const h = normaliseLineHoltWintersForecastHorizon(horizon);
  if (h <= 0) return [];
  const m = fit.seasonLength;
  const N = fit.fitted.length;
  if (m <= 0 || fit.seasonals.length !== m) return [];
  const out: number[] = [];
  for (let step = 1; step <= h; step += 1) {
    const idx = N - 1 + step;
    const pos = ((idx % m) + m) % m;
    out.push(fit.level + step * fit.trend + fit.seasonals[pos]!);
  }
  return out;
}

export interface RunLineHoltWintersOptions extends FitLineHoltWintersOptions {
  forecastHorizon?: number;
}

export function runLineHoltWinters(
  points: readonly ChartLineHoltWintersPoint[] | null | undefined,
  options?: RunLineHoltWintersOptions,
): {
  samples: ChartLineHoltWintersSample[];
  fit: ChartLineHoltWintersFit;
  ok: boolean;
  level: number;
  trend: number;
  alpha: number;
  beta: number;
  gamma: number;
  seasonLength: number;
  rmse: number;
  maxAbsResidual: number;
  fittedValidCount: number;
  positiveResidualCount: number;
  negativeResidualCount: number;
  zeroResidualCount: number;
  forecast: ChartLineHoltWintersForecastPoint[];
} {
  const finite = getLineHoltWintersFinitePoints(points);
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const N = sorted.length;
  const ys = sorted.map((p) => p.y);
  const fit = fitLineHoltWinters(ys, options);
  const horizon = normaliseLineHoltWintersForecastHorizon(
    options?.forecastHorizon,
  );

  let sumSq = 0;
  let maxAbs = 0;
  let fittedValid = 0;
  let positive = 0;
  let negative = 0;
  let zero = 0;

  const samples: ChartLineHoltWintersSample[] = sorted.map((p, i) => {
    const fitted = fit.fitted[i] ?? null;
    const residual =
      fitted !== null && isFiniteNumber(fitted) ? p.y - fitted : null;
    const residualSign = classifyLineHoltWintersResidualSign(residual);
    if (fitted !== null && isFiniteNumber(fitted)) fittedValid += 1;
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
      fitted,
      residual,
      residualSign,
    };
  });

  const rmse = fittedValid > 0 ? Math.sqrt(sumSq / fittedValid) : 0;

  const forecastValues = forecastLineHoltWinters(fit, horizon);
  const lastX = N >= 1 ? sorted[N - 1]!.x : 0;
  const step =
    N >= 2 ? (sorted[N - 1]!.x - sorted[0]!.x) / (N - 1) : 1;
  const safeStep = step > 0 ? step : 1;
  const forecast: ChartLineHoltWintersForecastPoint[] = forecastValues.map(
    (value, i) => ({
      horizon: i + 1,
      x: lastX + (i + 1) * safeStep,
      value,
    }),
  );

  return {
    samples,
    fit,
    ok: fit.ok,
    level: fit.level,
    trend: fit.trend,
    alpha: fit.alpha,
    beta: fit.beta,
    gamma: fit.gamma,
    seasonLength: fit.seasonLength,
    rmse,
    maxAbsResidual: maxAbs,
    fittedValidCount: fittedValid,
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

export function computeLineHoltWintersLayout(
  options: ComputeLineHoltWintersLayoutOptions,
): ChartLineHoltWintersLayout {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_HOLTWINTERS_TICK_COUNT,
    alpha,
    beta,
    gamma,
    seasonLength,
    forecastHorizon,
    extendForForecast = true,
    defaultColors = DEFAULT_CHART_LINE_HOLTWINTERS_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ChartLineHoltWintersLayout = {
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
    ReturnType<typeof runLineHoltWinters>
  >();

  for (const s of visible) {
    const run = runLineHoltWinters(s.data, {
      alpha: s.alpha ?? alpha,
      beta: s.beta ?? beta,
      gamma: s.gamma ?? gamma,
      seasonLength: s.seasonLength ?? seasonLength,
      ...(isFiniteNumber(forecastHorizon) ? { forecastHorizon } : {}),
    });
    runBySeries.set(s.id, run);
    totalPoints += run.samples.length;
    for (const sample of run.samples) {
      if (sample.x < xLo) xLo = sample.x;
      if (sample.x > xHi) xHi = sample.x;
      if (sample.raw < yLo) yLo = sample.raw;
      if (sample.raw > yHi) yHi = sample.raw;
      if (sample.fitted !== null) {
        if (sample.fitted < yLo) yLo = sample.fitted;
        if (sample.fitted > yHi) yHi = sample.fitted;
      }
    }
    if (extendForForecast) {
      for (const f of run.forecast) {
        if (f.x > xHi) xHi = f.x;
        if (f.value < yLo) yLo = f.value;
        if (f.value > yHi) yHi = f.value;
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

  const layoutSeries: ChartLineHoltWintersLayoutSeries[] = visible.map(
    (s, idx) => {
      const run = runBySeries.get(s.id)!;
      const color =
        s.color ??
        defaultColors[idx % defaultColors.length] ??
        DEFAULT_CHART_LINE_HOLTWINTERS_PALETTE[0]!;

      const points: ChartLineHoltWintersLayoutPoint[] = run.samples.map(
        (sample) => {
          const rawPy = projectY(sample.raw);
          const fittedPy =
            sample.fitted !== null ? projectY(sample.fitted) : null;
          return {
            ...sample,
            px: projectX(sample.x),
            rawPy,
            fittedPy,
          };
        },
      );

      const rawPath = buildPath(
        points.map((p) => ({ px: p.px, py: p.rawPy })),
      );
      const fittedPath = buildPath(
        points.map((p) => ({ px: p.px, py: p.fittedPy })),
      );
      const residualSegments = points
        .filter((p) => p.fittedPy !== null && p.residual !== null)
        .map((p) => ({
          index: p.index,
          px: p.px,
          rawPy: p.rawPy,
          fittedPy: p.fittedPy!,
          residual: p.residual!,
          sign: p.residualSign,
        }));

      const forecastPoints: ChartLineHoltWintersLayoutForecastPoint[] =
        run.forecast.map((f) => ({
          ...f,
          px: projectX(f.x),
          py: projectY(f.value),
        }));

      let forecastPath = '';
      if (forecastPoints.length > 0 && points.length > 0) {
        const lastRaw = points[points.length - 1]!;
        forecastPath = buildPath([
          { px: lastRaw.px, py: lastRaw.rawPy },
          ...forecastPoints.map((f) => ({ px: f.px, py: f.py })),
        ]);
      }

      return {
        id: s.id,
        label: s.label,
        color,
        alpha: run.alpha,
        beta: run.beta,
        gamma: run.gamma,
        seasonLength: run.seasonLength,
        ok: run.ok,
        level: run.level,
        trend: run.trend,
        points,
        rawPath,
        fittedPath,
        residualSegments,
        forecastPoints,
        forecastPath,
        finiteCount: run.samples.length,
        totalCount: s.data?.length ?? 0,
        fittedValidCount: run.fittedValidCount,
        positiveResidualCount: run.positiveResidualCount,
        negativeResidualCount: run.negativeResidualCount,
        zeroResidualCount: run.zeroResidualCount,
        rmseResidual: run.rmse,
        maxAbsResidual: run.maxAbsResidual,
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

export function describeLineHoltWintersChart(
  series: readonly ChartLineHoltWintersSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    alpha?: number;
    beta?: number;
    gamma?: number;
    seasonLength?: number;
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
    const run = runLineHoltWinters(s.data, {
      alpha: s.alpha ?? options?.alpha,
      beta: s.beta ?? options?.beta,
      gamma: s.gamma ?? options?.gamma,
      seasonLength: s.seasonLength ?? options?.seasonLength,
    });
    totalPoints += run.samples.length;
    summaries.push(
      `${s.label}: alpha ${fmt(run.alpha)}, beta ${fmt(run.beta)}, gamma ${fmt(run.gamma)}, season ${run.seasonLength}, RMSE ${fmt(run.rmse)}`,
    );
  }
  return `Line chart with Holt-Winters triple-exponential smoothing overlay across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineHoltWinters = forwardRef<
  HTMLDivElement,
  ChartLineHoltWintersProps
>(function ChartLineHoltWinters(
  props: ChartLineHoltWintersProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    alpha = DEFAULT_CHART_LINE_HOLTWINTERS_ALPHA,
    beta = DEFAULT_CHART_LINE_HOLTWINTERS_BETA,
    gamma = DEFAULT_CHART_LINE_HOLTWINTERS_GAMMA,
    seasonLength = DEFAULT_CHART_LINE_HOLTWINTERS_SEASON_LENGTH,
    forecastHorizon = DEFAULT_CHART_LINE_HOLTWINTERS_FORECAST_HORIZON,
    width = DEFAULT_CHART_LINE_HOLTWINTERS_WIDTH,
    height = DEFAULT_CHART_LINE_HOLTWINTERS_HEIGHT,
    padding = DEFAULT_CHART_LINE_HOLTWINTERS_PADDING,
    tickCount = DEFAULT_CHART_LINE_HOLTWINTERS_TICK_COUNT,
    rawStrokeWidth = DEFAULT_CHART_LINE_HOLTWINTERS_RAW_STROKE_WIDTH,
    fittedStrokeWidth = DEFAULT_CHART_LINE_HOLTWINTERS_FITTED_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_HOLTWINTERS_DOT_RADIUS,
    rawOpacity = DEFAULT_CHART_LINE_HOLTWINTERS_RAW_OPACITY,
    residualOpacity = DEFAULT_CHART_LINE_HOLTWINTERS_RESIDUAL_OPACITY,
    rawColor = DEFAULT_CHART_LINE_HOLTWINTERS_RAW_COLOR,
    forecastColor = DEFAULT_CHART_LINE_HOLTWINTERS_FORECAST_COLOR,
    residualPosColor = DEFAULT_CHART_LINE_HOLTWINTERS_RESIDUAL_POS_COLOR,
    residualNegColor = DEFAULT_CHART_LINE_HOLTWINTERS_RESIDUAL_NEG_COLOR,
    gridColor = DEFAULT_CHART_LINE_HOLTWINTERS_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_HOLTWINTERS_AXIS_COLOR,
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
    ariaLabel = 'Line chart with Holt-Winters triple-exponential smoothing overlay',
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
      computeLineHoltWintersLayout({
        series,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        tickCount,
        alpha,
        beta,
        gamma,
        seasonLength,
        forecastHorizon: showForecast ? forecastHorizon : 0,
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
      alpha,
      beta,
      gamma,
      seasonLength,
      forecastHorizon,
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
      describeLineHoltWintersChart(series, {
        hidden: hiddenSet,
        alpha,
        beta,
        gamma,
        seasonLength,
        formatCoefficient,
      }),
    [
      ariaDescription,
      series,
      hiddenSet,
      alpha,
      beta,
      gamma,
      seasonLength,
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
    (s: ChartLineHoltWintersSeries) => {
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
        (acc, s) => acc + getLineHoltWintersFinitePoints(s.data).length,
        0,
      ),
    [series],
  );

  const dominantConfig = useMemo<{
    alpha: number;
    beta: number;
    gamma: number;
    seasonLength: number;
    rmse: number;
    ok: boolean;
    seriesId: string;
  }>(() => {
    if (layout.series.length === 0) {
      return {
        alpha: normaliseLineHoltWintersSmoothingFactor(
          alpha,
          DEFAULT_CHART_LINE_HOLTWINTERS_ALPHA,
        ),
        beta: normaliseLineHoltWintersSmoothingFactor(
          beta,
          DEFAULT_CHART_LINE_HOLTWINTERS_BETA,
        ),
        gamma: normaliseLineHoltWintersSmoothingFactor(
          gamma,
          DEFAULT_CHART_LINE_HOLTWINTERS_GAMMA,
        ),
        seasonLength: normaliseLineHoltWintersSeasonLength(seasonLength),
        rmse: 0,
        ok: false,
        seriesId: '',
      };
    }
    const s = layout.series[0]!;
    return {
      alpha: s.alpha,
      beta: s.beta,
      gamma: s.gamma,
      seasonLength: s.seasonLength,
      rmse: s.rmseResidual,
      ok: s.ok,
      seriesId: s.id,
    };
  }, [layout.series, alpha, beta, gamma, seasonLength]);

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
        data-section="chart-line-holtwinters"
        data-empty="true"
        data-series-count={series.length}
        data-visible-series-count={0}
        data-total-points={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-holtwinters-aria-desc"
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
      data-section="chart-line-holtwinters"
      data-empty="false"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-alpha={dominantConfig.alpha}
      data-beta={dominantConfig.beta}
      data-gamma={dominantConfig.gamma}
      data-season-length={dominantConfig.seasonLength}
      data-rmse={dominantConfig.rmse}
      data-fit-ok={dominantConfig.ok ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-holtwinters-aria-desc"
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
        data-section="chart-line-holtwinters-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-holtwinters-badge"
            data-alpha={dominantConfig.alpha}
            data-beta={dominantConfig.beta}
            data-gamma={dominantConfig.gamma}
            data-season-length={dominantConfig.seasonLength}
            data-rmse={dominantConfig.rmse}
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
              data-section="chart-line-holtwinters-badge-icon"
              aria-hidden="true"
            >
              HW
            </span>
            <span data-section="chart-line-holtwinters-badge-alpha">
              a={formatCoefficient(dominantConfig.alpha)}
            </span>
            <span data-section="chart-line-holtwinters-badge-beta">
              b={formatCoefficient(dominantConfig.beta)}
            </span>
            <span data-section="chart-line-holtwinters-badge-gamma">
              g={formatCoefficient(dominantConfig.gamma)}
            </span>
            <span data-section="chart-line-holtwinters-badge-season">
              m={dominantConfig.seasonLength}
            </span>
            <span data-section="chart-line-holtwinters-badge-rmse">
              rmse={formatCoefficient(dominantConfig.rmse)}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-holtwinters-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-holtwinters-grid"
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
                    data-section="chart-line-holtwinters-grid-line"
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
                    data-section="chart-line-holtwinters-grid-line"
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
              data-section="chart-line-holtwinters-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-holtwinters-axis"
                data-axis="x"
                x1={layout.panel.x}
                y1={layout.panel.y + layout.panel.height}
                x2={layout.panel.x + layout.panel.width}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-holtwinters-axis"
                data-axis="y"
                x1={layout.panel.x}
                y1={layout.panel.y}
                x2={layout.panel.x}
                y2={layout.panel.y + layout.panel.height}
              />
              <g data-section="chart-line-holtwinters-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-holtwinters-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.panel.y + layout.panel.height}
                        y2={layout.panel.y + layout.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-holtwinters-tick-label"
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
              <g data-section="chart-line-holtwinters-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-holtwinters-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-holtwinters-tick-label"
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
                  data-section="chart-line-holtwinters-x-label"
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
                  data-section="chart-line-holtwinters-y-label"
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

          <g data-section="chart-line-holtwinters-series">
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-holtwinters-series-group"
                data-series-id={s.id}
                data-series-color={s.color}
                data-series-alpha={s.alpha}
                data-series-beta={s.beta}
                data-series-gamma={s.gamma}
                data-series-season-length={s.seasonLength}
                data-series-fit-ok={s.ok ? 'true' : 'false'}
                data-series-level={s.level}
                data-series-trend={s.trend}
                data-series-rmse={s.rmseResidual}
                data-series-max-abs-residual={s.maxAbsResidual}
                data-series-fitted-valid-count={s.fittedValidCount}
                data-series-positive-residual-count={s.positiveResidualCount}
                data-series-negative-residual-count={s.negativeResidualCount}
                data-series-zero-residual-count={s.zeroResidualCount}
                data-series-finite-count={s.finiteCount}
                data-series-forecast-count={s.forecastPoints.length}
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
                          data-section="chart-line-holtwinters-residual-stick"
                          data-series-id={s.id}
                          data-point-index={seg.index}
                          data-sign={seg.sign}
                          x1={seg.px}
                          x2={seg.px}
                          y1={seg.rawPy}
                          y2={seg.fittedPy}
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
                    data-section="chart-line-holtwinters-raw-path"
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
                {s.fittedPath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} Holt-Winters fitted (alpha ${formatCoefficient(s.alpha)}, beta ${formatCoefficient(s.beta)}, gamma ${formatCoefficient(s.gamma)}, season ${s.seasonLength})`}
                    data-section="chart-line-holtwinters-fitted-path"
                    data-series-id={s.id}
                    data-kind="fitted"
                    d={s.fittedPath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={fittedStrokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showForecast && s.forecastPoints.length > 0 ? (
                  <g
                    data-section="chart-line-holtwinters-forecast"
                    data-series-id={s.id}
                    data-forecast-count={s.forecastPoints.length}
                  >
                    {s.forecastPath ? (
                      <path
                        data-section="chart-line-holtwinters-forecast-path"
                        data-series-id={s.id}
                        d={s.forecastPath}
                        fill="none"
                        stroke={forecastColor}
                        strokeWidth={fittedStrokeWidth}
                        strokeDasharray="5 3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pointerEvents="none"
                      />
                    ) : null}
                    {s.forecastPoints.map((f) => (
                      <circle
                        key={`f-${f.horizon}`}
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={`${s.label} forecast horizon ${f.horizon}: ${formatValue(f.value)} at x ${formatX(f.x)}`}
                        data-section="chart-line-holtwinters-forecast-dot"
                        data-series-id={s.id}
                        data-horizon={f.horizon}
                        data-forecast-x={f.x}
                        data-forecast-value={f.value}
                        cx={f.px}
                        cy={f.py}
                        r={dotRadius}
                        fill={forecastColor}
                        stroke="#ffffff"
                        strokeWidth={1}
                      />
                    ))}
                  </g>
                ) : null}
                {showDots
                  ? s.points.map((p) => {
                      const isHover =
                        hoverPayload?.seriesId === s.id &&
                        hoverPayload?.pointIndex === p.index;
                      const cy =
                        p.fittedPy !== null ? p.fittedPy : p.rawPy;
                      return (
                        <circle
                          key={`d-${p.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)}; raw ${formatValue(p.raw)}; fitted ${p.fitted === null ? 'n/a' : formatValue(p.fitted)}`}
                          data-section="chart-line-holtwinters-dot"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-x={p.x}
                          data-raw={p.raw}
                          data-fitted={p.fitted ?? ''}
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
                  data-section="chart-line-holtwinters-tooltip"
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
                    minWidth: 190,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-holtwinters-tooltip-label"
                    style={{ color: s.color, fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-holtwinters-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div data-section="chart-line-holtwinters-tooltip-raw">
                    raw: {formatValue(p.raw)}
                  </div>
                  <div
                    data-section="chart-line-holtwinters-tooltip-fitted"
                    style={{ fontWeight: 600 }}
                  >
                    fitted:{' '}
                    {p.fitted === null ? 'n/a' : formatValue(p.fitted)}
                  </div>
                  <div
                    data-section="chart-line-holtwinters-tooltip-residual"
                    style={{ color: tipColor }}
                  >
                    residual:{' '}
                    {p.residual === null
                      ? 'n/a'
                      : (p.residual >= 0 ? '+' : '') +
                        formatValue(p.residual)}
                  </div>
                  <div data-section="chart-line-holtwinters-tooltip-config">
                    a={formatCoefficient(s.alpha)}, b=
                    {formatCoefficient(s.beta)}, g=
                    {formatCoefficient(s.gamma)}, m={s.seasonLength}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-holtwinters-legend"
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
              DEFAULT_CHART_LINE_HOLTWINTERS_PALETTE[0]!;
            return (
              <button
                key={s.id}
                type="button"
                data-section="chart-line-holtwinters-legend-item"
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
                  data-section="chart-line-holtwinters-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: swatchColor,
                  }}
                />
                <span data-section="chart-line-holtwinters-legend-label">
                  {s.label}
                </span>
                {layoutMatch ? (
                  <span
                    data-section="chart-line-holtwinters-legend-stats"
                    style={{ fontSize: 10, color: '#64748b' }}
                  >
                    (m={layoutMatch.seasonLength};{' '}
                    rmse {formatCoefficient(layoutMatch.rmseResidual)})
                  </span>
                ) : null}
              </button>
            );
          })}
          <span
            data-section="chart-line-holtwinters-legend-total-points"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {allTotalPoints} total points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineHoltWinters.displayName = 'ChartLineHoltWinters';
