import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_AUTOCORRELATION_WIDTH = 720;
export const DEFAULT_CHART_LINE_AUTOCORRELATION_HEIGHT = 320;
export const DEFAULT_CHART_LINE_AUTOCORRELATION_PADDING = 40;
export const DEFAULT_CHART_LINE_AUTOCORRELATION_GAP = 20;
export const DEFAULT_CHART_LINE_AUTOCORRELATION_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_AUTOCORRELATION_TIME_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_AUTOCORRELATION_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_AUTOCORRELATION_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_AUTOCORRELATION_LAG_STICK_WIDTH = 2;
export const DEFAULT_CHART_LINE_AUTOCORRELATION_MAX_LAG = 20;
export const DEFAULT_CHART_LINE_AUTOCORRELATION_CONFIDENCE_Z = 1.96;
export const DEFAULT_CHART_LINE_AUTOCORRELATION_PALETTE = [
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
export const DEFAULT_CHART_LINE_AUTOCORRELATION_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_AUTOCORRELATION_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_AUTOCORRELATION_INSIGNIFICANT_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_AUTOCORRELATION_DOMINANT_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_AUTOCORRELATION_CONFIDENCE_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_AUTOCORRELATION_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_AUTOCORRELATION_AXIS_COLOR = '#cbd5e1';

export type ChartLineAutocorrelationSignificance =
  | 'positive-significant'
  | 'negative-significant'
  | 'insignificant';

export interface ChartLineAutocorrelationPoint {
  x: number;
  y: number;
}

export interface ChartLineAutocorrelationSeries {
  id: string;
  label: string;
  data: readonly ChartLineAutocorrelationPoint[];
  color?: string;
  maxLag?: number;
}

export interface ChartLineAutocorrelationLag {
  lag: number;
  value: number;
  significance: ChartLineAutocorrelationSignificance;
}

export interface ChartLineAutocorrelationLayoutTimePoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineAutocorrelationLayoutLag
  extends ChartLineAutocorrelationLag {
  px: number;
  py: number;
  stickX: number;
  stickY1: number;
  stickY2: number;
  isDominant: boolean;
  color: string;
}

export interface ChartLineAutocorrelationLayoutSeries {
  id: string;
  label: string;
  color: string;
  maxLag: number;
  effectiveLag: number;
  confidenceBound: number;
  mean: number;
  totalSamples: number;
  timePoints: ChartLineAutocorrelationLayoutTimePoint[];
  timePath: string;
  lags: ChartLineAutocorrelationLayoutLag[];
  dominantLag: number;
  dominantValue: number;
  dominantAbsValue: number;
  significantCount: number;
  positiveSignificantCount: number;
  negativeSignificantCount: number;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineAutocorrelationLayoutResult {
  series: ChartLineAutocorrelationLayoutSeries[];
  timePanel: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  acfPanel: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  timeXTicks: number[];
  timeYTicks: number[];
  acfXTicks: number[];
  acfYTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  lagMin: number;
  lagMax: number;
  acfMin: number;
  acfMax: number;
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineAutocorrelationLayoutOptions {
  series: readonly ChartLineAutocorrelationSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  timePanelRatio?: number;
  maxLag?: number;
  confidenceZ?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineAutocorrelationProps {
  series: readonly ChartLineAutocorrelationSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  maxLag?: number;
  confidenceZ?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  timePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  lagStickWidth?: number;
  positiveColor?: string;
  negativeColor?: string;
  insignificantColor?: string;
  dominantColor?: string;
  confidenceColor?: string;
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
  showConfidenceBand?: boolean;
  showDominantMarker?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatAcf?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  lagLabel?: string;
  acfLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineAutocorrelationLayoutSeries;
    point: ChartLineAutocorrelationLayoutTimePoint;
  }) => void;
  onLagClick?: (payload: {
    series: ChartLineAutocorrelationLayoutSeries;
    lag: ChartLineAutocorrelationLayoutLag;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineAutocorrelationSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineAutocorrelationDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_AUTOCORRELATION_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineAutocorrelationFinitePoints(
  points: readonly ChartLineAutocorrelationPoint[] | null | undefined,
): ChartLineAutocorrelationPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineAutocorrelationPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineAutocorrelationMaxLag(
  value: unknown,
  totalSamples?: number,
): number {
  let v: number;
  if (!isFiniteNumber(value)) v = DEFAULT_CHART_LINE_AUTOCORRELATION_MAX_LAG;
  else v = Math.floor(value);
  if (v < 0) v = 0;
  if (isFiniteNumber(totalSamples) && totalSamples > 0) {
    // ACF at lag >= N is degenerate; cap at N - 1.
    const cap = Math.max(0, totalSamples - 1);
    if (v > cap) v = cap;
  }
  return v;
}

export function normaliseLineAutocorrelationConfidenceZ(value: unknown): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_CHART_LINE_AUTOCORRELATION_CONFIDENCE_Z;
  }
  if (value < 0) return 0;
  return value;
}

export function normaliseLineAutocorrelationPanelRatio(value: unknown): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_CHART_LINE_AUTOCORRELATION_TIME_PANEL_RATIO;
  }
  if (value <= 0) return 0.1;
  if (value >= 1) return 0.9;
  return value;
}

/**
 * Arithmetic mean of finite values; returns 0 for an empty array.
 */
export function computeLineAutocorrelationMean(
  values: readonly number[] | null | undefined,
): number {
  if (!Array.isArray(values) || values.length === 0) return 0;
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
 * Canonical biased autocorrelation function (R / numpy / statsmodels
 * convention):
 *
 *   ACF(k) = sum_{i=0}^{N-1-k} (y_i - ybar) * (y_{i+k} - ybar)
 *            / sum_{i=0}^{N-1} (y_i - ybar)^2
 *
 * - ACF(0) is always 1 by construction (the numerator equals the
 *   denominator).
 * - For larger lags ACF(k) is between -1 and 1 (under the biased
 *   estimator).
 * - When the denominator is 0 (constant series), the result is 0 for
 *   k > 0 (no variance to correlate with).
 */
export function computeLineAutocorrelationFunction(
  values: readonly number[] | null | undefined,
  maxLag: number,
): number[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  const N = values.length;
  const k = normaliseLineAutocorrelationMaxLag(maxLag, N);
  const mean = computeLineAutocorrelationMean(values);
  const deviations = values.map((v) =>
    isFiniteNumber(v) ? v - mean : 0,
  );
  let denom = 0;
  for (let i = 0; i < N; i += 1) {
    denom += deviations[i]! * deviations[i]!;
  }
  const acf: number[] = new Array(k + 1);
  if (denom <= 0) {
    // Constant series: ACF(0) = 1 by convention (autocorrelation at
    // zero lag is always 1), other lags 0.
    for (let lag = 0; lag <= k; lag += 1) {
      acf[lag] = lag === 0 ? 1 : 0;
    }
    return acf;
  }
  for (let lag = 0; lag <= k; lag += 1) {
    let num = 0;
    for (let i = 0; i + lag < N; i += 1) {
      num += deviations[i]! * deviations[i + lag]!;
    }
    acf[lag] = num / denom;
  }
  return acf;
}

/**
 * 95% confidence bound (default z = 1.96) for the autocorrelation
 * function under a white-noise null hypothesis:
 *
 *   bound = z / sqrt(N)
 *
 * Lags exceeding |ACF(k)| > bound are considered statistically
 * significant.
 */
export function computeLineAutocorrelationConfidenceBound(
  N: number,
  z = DEFAULT_CHART_LINE_AUTOCORRELATION_CONFIDENCE_Z,
): number {
  if (!isFiniteNumber(N) || N <= 0) return 0;
  const zz = normaliseLineAutocorrelationConfidenceZ(z);
  return zz / Math.sqrt(N);
}

export function classifyLineAutocorrelationSignificance(
  value: number | null | undefined,
  bound: number,
): ChartLineAutocorrelationSignificance {
  if (!isFiniteNumber(value) || !isFiniteNumber(bound) || bound <= 0) {
    return 'insignificant';
  }
  if (value > bound) return 'positive-significant';
  if (value < -bound) return 'negative-significant';
  return 'insignificant';
}

/**
 * Find the dominant lag: the lag in [1, maxLag] with the highest
 * |ACF(k)|. Returns { lag: 0, value: 0 } when no lag >= 1 exists.
 */
export function findLineAutocorrelationDominantLag(
  acf: readonly number[] | null | undefined,
): { lag: number; value: number } {
  if (!Array.isArray(acf) || acf.length <= 1) return { lag: 0, value: 0 };
  let bestLag = 0;
  let bestAbs = -1;
  let bestValue = 0;
  for (let lag = 1; lag < acf.length; lag += 1) {
    const v = acf[lag];
    if (!isFiniteNumber(v)) continue;
    const a = Math.abs(v);
    if (a > bestAbs) {
      bestAbs = a;
      bestLag = lag;
      bestValue = v;
    }
  }
  if (bestAbs < 0) return { lag: 0, value: 0 };
  return { lag: bestLag, value: bestValue };
}

export interface RunLineAutocorrelationOptions {
  maxLag?: number;
  confidenceZ?: number;
}

export function runLineAutocorrelation(
  points: readonly ChartLineAutocorrelationPoint[] | null | undefined,
  options?: RunLineAutocorrelationOptions,
): {
  samples: ChartLineAutocorrelationPoint[];
  acf: number[];
  lags: ChartLineAutocorrelationLag[];
  confidenceBound: number;
  dominantLag: number;
  dominantValue: number;
  significantCount: number;
  positiveSignificantCount: number;
  negativeSignificantCount: number;
  maxLag: number;
  effectiveLag: number;
  totalSamples: number;
  mean: number;
} {
  const finite = getLineAutocorrelationFinitePoints(points);
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const N = sorted.length;
  const requestedMaxLag = normaliseLineAutocorrelationMaxLag(
    options?.maxLag,
    N,
  );
  const ys = sorted.map((p) => p.y);
  const acf = computeLineAutocorrelationFunction(ys, requestedMaxLag);
  const effectiveLag = acf.length > 0 ? acf.length - 1 : 0;
  const bound = computeLineAutocorrelationConfidenceBound(
    N,
    normaliseLineAutocorrelationConfidenceZ(options?.confidenceZ),
  );
  const mean = computeLineAutocorrelationMean(ys);
  const lags: ChartLineAutocorrelationLag[] = acf.map((value, lag) => ({
    lag,
    value,
    significance:
      lag === 0
        ? 'insignificant'
        : classifyLineAutocorrelationSignificance(value, bound),
  }));
  const { lag: dominantLag, value: dominantValue } =
    findLineAutocorrelationDominantLag(acf);
  let significantCount = 0;
  let positiveSignificantCount = 0;
  let negativeSignificantCount = 0;
  for (const l of lags) {
    if (l.lag === 0) continue;
    if (l.significance === 'positive-significant') {
      significantCount += 1;
      positiveSignificantCount += 1;
    } else if (l.significance === 'negative-significant') {
      significantCount += 1;
      negativeSignificantCount += 1;
    }
  }
  return {
    samples: sorted,
    acf,
    lags,
    confidenceBound: bound,
    dominantLag,
    dominantValue,
    significantCount,
    positiveSignificantCount,
    negativeSignificantCount,
    maxLag: requestedMaxLag,
    effectiveLag,
    totalSamples: N,
    mean,
  };
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

export function computeLineAutocorrelationLayout(
  options: ComputeLineAutocorrelationLayoutOptions,
): ComputeLineAutocorrelationLayoutResult {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_AUTOCORRELATION_GAP,
    tickCount = DEFAULT_CHART_LINE_AUTOCORRELATION_TICK_COUNT,
    timePanelRatio,
    maxLag,
    confidenceZ,
    defaultColors = DEFAULT_CHART_LINE_AUTOCORRELATION_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = normaliseLineAutocorrelationPanelRatio(timePanelRatio);
  const usableWidth = Math.max(0, innerWidth - gap);
  const timeWidth = Math.max(0, usableWidth * ratio);
  const acfWidth = Math.max(0, usableWidth - timeWidth);

  const empty: ComputeLineAutocorrelationLayoutResult = {
    series: [],
    timePanel: {
      x: padding,
      y: padding,
      width: timeWidth,
      height: innerHeight,
    },
    acfPanel: {
      x: padding + timeWidth + gap,
      y: padding,
      width: acfWidth,
      height: innerHeight,
    },
    timeXTicks: [],
    timeYTicks: [],
    acfXTicks: [],
    acfYTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    lagMin: 0,
    lagMax: 0,
    acfMin: -1,
    acfMax: 1,
    totalPoints: 0,
    visibleSeriesCount: 0,
  };

  if (timeWidth <= 0 || acfWidth <= 0 || innerHeight <= 0) return empty;
  if (!Array.isArray(series) || series.length === 0) return empty;

  const hidden = normaliseHidden(hiddenSeries);
  const visible = series.filter((s) => !hidden.has(s.id));
  if (visible.length === 0) return empty;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let lagHi = 0;
  let totalPoints = 0;

  const runBySeries = new Map<
    string,
    ReturnType<typeof runLineAutocorrelation>
  >();

  for (const s of visible) {
    const run = runLineAutocorrelation(s.data, {
      maxLag: s.maxLag ?? maxLag,
      confidenceZ,
    });
    runBySeries.set(s.id, run);
    totalPoints += run.totalSamples;
    if (run.effectiveLag > lagHi) lagHi = run.effectiveLag;
    for (const p of run.samples) {
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
      if (p.y < yLo) yLo = p.y;
      if (p.y > yHi) yHi = p.y;
    }
  }

  if (totalPoints === 0) return empty;
  if (lagHi <= 0) lagHi = 1;

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
  const lagRange = lagHi; // 0 .. lagHi

  const timeX = padding;
  const timeY = padding;
  const acfX = padding + timeWidth + gap;
  const acfY = padding;
  const acfMin = -1;
  const acfMax = 1;

  const projectTimeX = (x: number): number =>
    timeX + ((x - xLo) / xRange) * timeWidth;
  const projectTimeY = (y: number): number =>
    timeY + innerHeight - ((y - yLo) / yRange) * innerHeight;
  const projectLagX = (lag: number): number => {
    if (lagRange <= 0) return acfX;
    return acfX + (lag / lagRange) * acfWidth;
  };
  const projectAcfY = (v: number): number =>
    acfY + innerHeight - ((v - acfMin) / (acfMax - acfMin)) * innerHeight;

  const layoutSeries: ChartLineAutocorrelationLayoutSeries[] = visible.map(
    (s, idx) => {
      const run = runBySeries.get(s.id)!;
      const color =
        s.color ??
        defaultColors[idx % defaultColors.length] ??
        DEFAULT_CHART_LINE_AUTOCORRELATION_PALETTE[0]!;

      const timePoints: ChartLineAutocorrelationLayoutTimePoint[] =
        run.samples.map((p, i) => ({
          index: i,
          x: p.x,
          y: p.y,
          px: projectTimeX(p.x),
          py: projectTimeY(p.y),
        }));

      const timePath = buildPath(timePoints);

      const acfZeroPy = projectAcfY(0);
      const dominantLag = run.dominantLag;

      const lags: ChartLineAutocorrelationLayoutLag[] = run.lags.map(
        (l) => {
          const px = projectLagX(l.lag);
          const py = projectAcfY(l.value);
          const stickY1 = acfZeroPy;
          const stickY2 = py;
          const isDominant = l.lag === dominantLag && dominantLag > 0;
          let lagColor: string;
          if (isDominant) {
            lagColor = DEFAULT_CHART_LINE_AUTOCORRELATION_DOMINANT_COLOR;
          } else if (l.significance === 'positive-significant') {
            lagColor = DEFAULT_CHART_LINE_AUTOCORRELATION_POSITIVE_COLOR;
          } else if (l.significance === 'negative-significant') {
            lagColor = DEFAULT_CHART_LINE_AUTOCORRELATION_NEGATIVE_COLOR;
          } else {
            lagColor = DEFAULT_CHART_LINE_AUTOCORRELATION_INSIGNIFICANT_COLOR;
          }
          return {
            ...l,
            px,
            py,
            stickX: px,
            stickY1,
            stickY2,
            isDominant,
            color: lagColor,
          };
        },
      );

      return {
        id: s.id,
        label: s.label,
        color,
        maxLag: run.maxLag,
        effectiveLag: run.effectiveLag,
        confidenceBound: run.confidenceBound,
        mean: run.mean,
        totalSamples: run.totalSamples,
        timePoints,
        timePath,
        lags,
        dominantLag: run.dominantLag,
        dominantValue: run.dominantValue,
        dominantAbsValue: Math.abs(run.dominantValue),
        significantCount: run.significantCount,
        positiveSignificantCount: run.positiveSignificantCount,
        negativeSignificantCount: run.negativeSignificantCount,
        finiteCount: run.totalSamples,
        totalCount: s.data?.length ?? 0,
      };
    },
  );

  return {
    series: layoutSeries,
    timePanel: {
      x: timeX,
      y: timeY,
      width: timeWidth,
      height: innerHeight,
    },
    acfPanel: {
      x: acfX,
      y: acfY,
      width: acfWidth,
      height: innerHeight,
    },
    timeXTicks: computeTicks(xLo, xHi, tickCount),
    timeYTicks: computeTicks(yLo, yHi, tickCount),
    acfXTicks: computeTicks(0, lagHi, Math.min(tickCount, lagHi + 1)),
    acfYTicks: [-1, -0.5, 0, 0.5, 1],
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    lagMin: 0,
    lagMax: lagHi,
    acfMin,
    acfMax,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function defaultFormatAcf(n: number): string {
  if (!isFiniteNumber(n)) return '';
  return n.toFixed(3);
}

export function describeLineAutocorrelationChart(
  series: readonly ChartLineAutocorrelationSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    maxLag?: number;
    confidenceZ?: number;
    formatAcf?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const fmt = options?.formatAcf ?? defaultFormatAcf;
  const summaries: string[] = [];
  let totalPoints = 0;
  for (const s of visible) {
    const run = runLineAutocorrelation(s.data, {
      maxLag: s.maxLag ?? options?.maxLag,
      confidenceZ: options?.confidenceZ,
    });
    totalPoints += run.totalSamples;
    summaries.push(
      `${s.label}: ${run.totalSamples} samples, max lag ${run.effectiveLag}, dominant lag ${run.dominantLag} (ACF ${fmt(run.dominantValue)}), ${run.significantCount} significant lags`,
    );
  }
  return `Line chart with autocorrelation function side panel across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineAutocorrelation = forwardRef<
  HTMLDivElement,
  ChartLineAutocorrelationProps
>(function ChartLineAutocorrelation(
  props: ChartLineAutocorrelationProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    maxLag = DEFAULT_CHART_LINE_AUTOCORRELATION_MAX_LAG,
    confidenceZ = DEFAULT_CHART_LINE_AUTOCORRELATION_CONFIDENCE_Z,
    width = DEFAULT_CHART_LINE_AUTOCORRELATION_WIDTH,
    height = DEFAULT_CHART_LINE_AUTOCORRELATION_HEIGHT,
    padding = DEFAULT_CHART_LINE_AUTOCORRELATION_PADDING,
    gap = DEFAULT_CHART_LINE_AUTOCORRELATION_GAP,
    tickCount = DEFAULT_CHART_LINE_AUTOCORRELATION_TICK_COUNT,
    timePanelRatio = DEFAULT_CHART_LINE_AUTOCORRELATION_TIME_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_AUTOCORRELATION_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_AUTOCORRELATION_DOT_RADIUS,
    lagStickWidth = DEFAULT_CHART_LINE_AUTOCORRELATION_LAG_STICK_WIDTH,
    positiveColor = DEFAULT_CHART_LINE_AUTOCORRELATION_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_AUTOCORRELATION_NEGATIVE_COLOR,
    insignificantColor = DEFAULT_CHART_LINE_AUTOCORRELATION_INSIGNIFICANT_COLOR,
    dominantColor = DEFAULT_CHART_LINE_AUTOCORRELATION_DOMINANT_COLOR,
    confidenceColor = DEFAULT_CHART_LINE_AUTOCORRELATION_CONFIDENCE_COLOR,
    gridColor = DEFAULT_CHART_LINE_AUTOCORRELATION_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_AUTOCORRELATION_AXIS_COLOR,
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
    showConfidenceBand = true,
    showDominantMarker = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with autocorrelation function side panel',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    formatAcf = defaultFormatAcf,
    xLabel,
    yLabel,
    lagLabel,
    acfLabel,
    onPointClick,
    onLagClick,
    onSeriesToggle,
    style,
  } = props;

  void positiveColor;
  void negativeColor;
  void insignificantColor;
  void dominantColor;

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
      computeLineAutocorrelationLayout({
        series,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        gap,
        tickCount,
        timePanelRatio,
        maxLag,
        confidenceZ,
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
      gap,
      tickCount,
      timePanelRatio,
      maxLag,
      confidenceZ,
      xMin,
      xMax,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineAutocorrelationChart(series, {
        hidden: hiddenSet,
        maxLag,
        confidenceZ,
        formatAcf,
      }),
    [ariaDescription, series, hiddenSet, maxLag, confidenceZ, formatAcf],
  );

  const [hoverPoint, setHoverPoint] = useState<{
    kind: 'time' | 'lag';
    seriesId: string;
    index: number;
  } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHoverPoint(null);
    setTooltipPos(null);
  }, []);

  const handleToggle = useCallback(
    (s: ChartLineAutocorrelationSeries) => {
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
        (acc, s) => acc + getLineAutocorrelationFinitePoints(s.data).length,
        0,
      ),
    [series],
  );

  const dominantConfig = useMemo<{
    maxLag: number;
    confidenceBound: number;
    dominantLag: number;
    dominantValue: number;
    significantCount: number;
    seriesId: string;
  }>(() => {
    if (layout.series.length === 0) {
      return {
        maxLag: normaliseLineAutocorrelationMaxLag(maxLag),
        confidenceBound: 0,
        dominantLag: 0,
        dominantValue: 0,
        significantCount: 0,
        seriesId: '',
      };
    }
    const s = layout.series[0]!;
    return {
      maxLag: s.effectiveLag,
      confidenceBound: s.confidenceBound,
      dominantLag: s.dominantLag,
      dominantValue: s.dominantValue,
      significantCount: s.significantCount,
      seriesId: s.id,
    };
  }, [layout.series, maxLag]);

  const containerStyle: CSSProperties = {
    width,
    height,
    position: 'relative',
    ...(style ?? {}),
  };

  const isEmpty = layout.series.length === 0;

  if (isEmpty) {
    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={className}
        style={containerStyle}
        data-section="chart-line-autocorrelation"
        data-empty="true"
        data-series-count={series.length}
        data-visible-series-count={0}
        data-total-points={0}
        data-max-lag={normaliseLineAutocorrelationMaxLag(maxLag)}
        data-confidence-z={normaliseLineAutocorrelationConfidenceZ(confidenceZ)}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-autocorrelation-aria-desc"
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
  const acfZeroPy =
    layout.acfPanel.y +
    layout.acfPanel.height -
    ((0 - layout.acfMin) / (layout.acfMax - layout.acfMin)) *
      layout.acfPanel.height;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-autocorrelation"
      data-empty="false"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-max-lag={dominantConfig.maxLag}
      data-confidence-z={normaliseLineAutocorrelationConfidenceZ(confidenceZ)}
      data-confidence-bound={dominantConfig.confidenceBound}
      data-dominant-lag={dominantConfig.dominantLag}
      data-dominant-value={dominantConfig.dominantValue}
      data-significant-count={dominantConfig.significantCount}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-autocorrelation-aria-desc"
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
        data-section="chart-line-autocorrelation-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-autocorrelation-badge"
            data-max-lag={dominantConfig.maxLag}
            data-dominant-lag={dominantConfig.dominantLag}
            data-confidence-bound={dominantConfig.confidenceBound}
            data-significant-count={dominantConfig.significantCount}
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
              data-section="chart-line-autocorrelation-badge-icon"
              aria-hidden="true"
            >
              ACF
            </span>
            <span data-section="chart-line-autocorrelation-badge-max-lag">
              max={dominantConfig.maxLag}
            </span>
            <span data-section="chart-line-autocorrelation-badge-dominant-lag">
              dom k={dominantConfig.dominantLag}
            </span>
            <span data-section="chart-line-autocorrelation-badge-confidence-bound">
              CI={formatAcf(dominantConfig.confidenceBound)}
            </span>
            <span data-section="chart-line-autocorrelation-badge-significant-count">
              sig={dominantConfig.significantCount}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-autocorrelation-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-autocorrelation-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.timeYTicks.map((t, i) => {
                const py =
                  layout.timePanel.y +
                  layout.timePanel.height -
                  ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                    layout.timePanel.height;
                return (
                  <line
                    key={`tgy-${i}`}
                    data-section="chart-line-autocorrelation-grid-line"
                    data-panel="time"
                    data-axis="y"
                    x1={layout.timePanel.x}
                    x2={layout.timePanel.x + layout.timePanel.width}
                    y1={py}
                    y2={py}
                  />
                );
              })}
              {layout.acfYTicks.map((t, i) => {
                const py =
                  layout.acfPanel.y +
                  layout.acfPanel.height -
                  ((t - layout.acfMin) / (layout.acfMax - layout.acfMin)) *
                    layout.acfPanel.height;
                return (
                  <line
                    key={`agy-${i}`}
                    data-section="chart-line-autocorrelation-grid-line"
                    data-panel="acf"
                    data-axis="y"
                    x1={layout.acfPanel.x}
                    x2={layout.acfPanel.x + layout.acfPanel.width}
                    y1={py}
                    y2={py}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-autocorrelation-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-autocorrelation-axis"
                data-panel="time"
                data-axis="x"
                x1={layout.timePanel.x}
                y1={layout.timePanel.y + layout.timePanel.height}
                x2={layout.timePanel.x + layout.timePanel.width}
                y2={layout.timePanel.y + layout.timePanel.height}
              />
              <line
                data-section="chart-line-autocorrelation-axis"
                data-panel="time"
                data-axis="y"
                x1={layout.timePanel.x}
                y1={layout.timePanel.y}
                x2={layout.timePanel.x}
                y2={layout.timePanel.y + layout.timePanel.height}
              />
              <line
                data-section="chart-line-autocorrelation-axis"
                data-panel="acf"
                data-axis="x"
                x1={layout.acfPanel.x}
                y1={acfZeroPy}
                x2={layout.acfPanel.x + layout.acfPanel.width}
                y2={acfZeroPy}
              />
              <line
                data-section="chart-line-autocorrelation-axis"
                data-panel="acf"
                data-axis="y"
                x1={layout.acfPanel.x}
                y1={layout.acfPanel.y}
                x2={layout.acfPanel.x}
                y2={layout.acfPanel.y + layout.acfPanel.height}
              />
              <g
                data-section="chart-line-autocorrelation-ticks"
                data-panel="time"
                data-axis="x"
              >
                {layout.timeXTicks.map((t, i) => {
                  const px =
                    layout.timePanel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.timePanel.width;
                  return (
                    <g
                      key={`ttx-${i}`}
                      data-section="chart-line-autocorrelation-tick"
                      data-panel="time"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.timePanel.y + layout.timePanel.height}
                        y2={layout.timePanel.y + layout.timePanel.height + 4}
                      />
                      <text
                        data-section="chart-line-autocorrelation-tick-label"
                        data-panel="time"
                        data-axis="x"
                        x={px}
                        y={layout.timePanel.y + layout.timePanel.height + 14}
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
                data-section="chart-line-autocorrelation-ticks"
                data-panel="time"
                data-axis="y"
              >
                {layout.timeYTicks.map((t, i) => {
                  const py =
                    layout.timePanel.y +
                    layout.timePanel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.timePanel.height;
                  return (
                    <g
                      key={`tty-${i}`}
                      data-section="chart-line-autocorrelation-tick"
                      data-panel="time"
                      data-axis="y"
                    >
                      <line
                        x1={layout.timePanel.x - 4}
                        x2={layout.timePanel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-autocorrelation-tick-label"
                        data-panel="time"
                        data-axis="y"
                        x={layout.timePanel.x - 6}
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
              <g
                data-section="chart-line-autocorrelation-ticks"
                data-panel="acf"
                data-axis="x"
              >
                {layout.acfXTicks.map((t, i) => {
                  const px =
                    layout.acfPanel.x +
                    (layout.lagMax > 0
                      ? (t / layout.lagMax) * layout.acfPanel.width
                      : 0);
                  return (
                    <g
                      key={`atx-${i}`}
                      data-section="chart-line-autocorrelation-tick"
                      data-panel="acf"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.acfPanel.y + layout.acfPanel.height}
                        y2={layout.acfPanel.y + layout.acfPanel.height + 4}
                      />
                      <text
                        data-section="chart-line-autocorrelation-tick-label"
                        data-panel="acf"
                        data-axis="x"
                        x={px}
                        y={layout.acfPanel.y + layout.acfPanel.height + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {Math.round(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              <g
                data-section="chart-line-autocorrelation-ticks"
                data-panel="acf"
                data-axis="y"
              >
                {layout.acfYTicks.map((t, i) => {
                  const py =
                    layout.acfPanel.y +
                    layout.acfPanel.height -
                    ((t - layout.acfMin) / (layout.acfMax - layout.acfMin)) *
                      layout.acfPanel.height;
                  return (
                    <g
                      key={`aty-${i}`}
                      data-section="chart-line-autocorrelation-tick"
                      data-panel="acf"
                      data-axis="y"
                    >
                      <line
                        x1={layout.acfPanel.x - 4}
                        x2={layout.acfPanel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-autocorrelation-tick-label"
                        data-panel="acf"
                        data-axis="y"
                        x={layout.acfPanel.x - 6}
                        y={py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatAcf(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              {xLabel ? (
                <text
                  data-section="chart-line-autocorrelation-x-label"
                  data-panel="time"
                  x={layout.timePanel.x + layout.timePanel.width / 2}
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
                  data-section="chart-line-autocorrelation-y-label"
                  data-panel="time"
                  transform={`rotate(-90 12 ${layout.timePanel.y + layout.timePanel.height / 2})`}
                  x={12}
                  y={layout.timePanel.y + layout.timePanel.height / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {yLabel}
                </text>
              ) : null}
              {lagLabel ? (
                <text
                  data-section="chart-line-autocorrelation-lag-label"
                  data-panel="acf"
                  x={layout.acfPanel.x + layout.acfPanel.width / 2}
                  y={height - 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {lagLabel}
                </text>
              ) : null}
              {acfLabel ? (
                <text
                  data-section="chart-line-autocorrelation-acf-label"
                  data-panel="acf"
                  transform={`rotate(-90 ${layout.acfPanel.x - 28} ${layout.acfPanel.y + layout.acfPanel.height / 2})`}
                  x={layout.acfPanel.x - 28}
                  y={layout.acfPanel.y + layout.acfPanel.height / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {acfLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          {showConfidenceBand && layout.series.length > 0 ? (() => {
            const bound = layout.series[0]!.confidenceBound;
            if (!isFiniteNumber(bound) || bound <= 0) return null;
            const upperPy =
              layout.acfPanel.y +
              layout.acfPanel.height -
              ((bound - layout.acfMin) / (layout.acfMax - layout.acfMin)) *
                layout.acfPanel.height;
            const lowerPy =
              layout.acfPanel.y +
              layout.acfPanel.height -
              ((-bound - layout.acfMin) / (layout.acfMax - layout.acfMin)) *
                layout.acfPanel.height;
            return (
              <g
                data-section="chart-line-autocorrelation-confidence-band"
                data-bound={bound}
              >
                <rect
                  data-section="chart-line-autocorrelation-confidence-band-fill"
                  x={layout.acfPanel.x}
                  y={upperPy}
                  width={layout.acfPanel.width}
                  height={lowerPy - upperPy}
                  fill={confidenceColor}
                  fillOpacity={0.08}
                  stroke="none"
                />
                <line
                  data-section="chart-line-autocorrelation-confidence-band-line"
                  data-bound-sign="positive"
                  x1={layout.acfPanel.x}
                  x2={layout.acfPanel.x + layout.acfPanel.width}
                  y1={upperPy}
                  y2={upperPy}
                  stroke={confidenceColor}
                  strokeDasharray="4 3"
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-autocorrelation-confidence-band-line"
                  data-bound-sign="negative"
                  x1={layout.acfPanel.x}
                  x2={layout.acfPanel.x + layout.acfPanel.width}
                  y1={lowerPy}
                  y2={lowerPy}
                  stroke={confidenceColor}
                  strokeDasharray="4 3"
                  strokeWidth={1}
                />
              </g>
            );
          })() : null}

          <g data-section="chart-line-autocorrelation-series">
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-autocorrelation-series-group"
                data-series-id={s.id}
                data-series-color={s.color}
                data-series-max-lag={s.maxLag}
                data-series-effective-lag={s.effectiveLag}
                data-series-confidence-bound={s.confidenceBound}
                data-series-dominant-lag={s.dominantLag}
                data-series-dominant-value={s.dominantValue}
                data-series-significant-count={s.significantCount}
                data-series-positive-significant-count={s.positiveSignificantCount}
                data-series-negative-significant-count={s.negativeSignificantCount}
                data-series-total-samples={s.totalSamples}
                data-series-finite-count={s.finiteCount}
                data-series-mean={s.mean}
              >
                {s.timePath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} time series with ${s.totalSamples} samples`}
                    data-section="chart-line-autocorrelation-time-path"
                    data-series-id={s.id}
                    data-kind="time"
                    d={s.timePath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showDots
                  ? s.timePoints.map((p) => {
                      const isHover =
                        hoverPoint?.kind === 'time' &&
                        hoverPoint.seriesId === s.id &&
                        hoverPoint.index === p.index;
                      return (
                        <circle
                          key={`tp-${p.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} sample ${p.index + 1} at x ${formatX(p.x)}, y ${formatValue(p.y)}`}
                          data-section="chart-line-autocorrelation-time-dot"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-x={p.x}
                          data-y={p.y}
                          data-hovered={isHover ? 'true' : 'false'}
                          cx={p.px}
                          cy={p.py}
                          r={isHover ? dotRadius + 1 : dotRadius}
                          fill={s.color}
                          stroke="#ffffff"
                          strokeWidth={1}
                          onMouseEnter={() => {
                            setHoverPoint({
                              kind: 'time',
                              seriesId: s.id,
                              index: p.index,
                            });
                            setTooltipPos({ px: p.px, py: p.py });
                          }}
                          onMouseLeave={clearHover}
                          onFocus={() => {
                            setHoverPoint({
                              kind: 'time',
                              seriesId: s.id,
                              index: p.index,
                            });
                            setTooltipPos({ px: p.px, py: p.py });
                          }}
                          onBlur={clearHover}
                          onClick={() =>
                            onPointClick?.({ series: s, point: p })
                          }
                        />
                      );
                    })
                  : null}
                {s.lags.map((l) => {
                  const isHover =
                    hoverPoint?.kind === 'lag' &&
                    hoverPoint.seriesId === s.id &&
                    hoverPoint.index === l.lag;
                  const r = isHover ? dotRadius + 1 : dotRadius;
                  return (
                    <g
                      key={`lag-${l.lag}`}
                      data-section="chart-line-autocorrelation-lag"
                      data-series-id={s.id}
                      data-lag={l.lag}
                      data-acf={l.value}
                      data-significance={l.significance}
                      data-is-dominant={l.isDominant ? 'true' : 'false'}
                    >
                      <line
                        data-section="chart-line-autocorrelation-lag-stick"
                        data-series-id={s.id}
                        data-lag={l.lag}
                        x1={l.stickX}
                        x2={l.stickX}
                        y1={l.stickY1}
                        y2={l.stickY2}
                        stroke={l.color}
                        strokeWidth={lagStickWidth}
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                      <circle
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={`${s.label} lag ${l.lag} ACF ${formatAcf(l.value)} ${l.significance}${l.isDominant ? ' dominant' : ''}`}
                        data-section="chart-line-autocorrelation-lag-dot"
                        data-series-id={s.id}
                        data-lag={l.lag}
                        data-acf={l.value}
                        data-significance={l.significance}
                        data-is-dominant={l.isDominant ? 'true' : 'false'}
                        data-hovered={isHover ? 'true' : 'false'}
                        cx={l.px}
                        cy={l.py}
                        r={r}
                        fill={l.color}
                        stroke="#ffffff"
                        strokeWidth={1}
                        onMouseEnter={() => {
                          setHoverPoint({
                            kind: 'lag',
                            seriesId: s.id,
                            index: l.lag,
                          });
                          setTooltipPos({ px: l.px, py: l.py });
                        }}
                        onMouseLeave={clearHover}
                        onFocus={() => {
                          setHoverPoint({
                            kind: 'lag',
                            seriesId: s.id,
                            index: l.lag,
                          });
                          setTooltipPos({ px: l.px, py: l.py });
                        }}
                        onBlur={clearHover}
                        onClick={() => onLagClick?.({ series: s, lag: l })}
                      />
                    </g>
                  );
                })}
                {showDominantMarker && s.dominantLag > 0
                  ? (() => {
                      const dom = s.lags.find((l) => l.lag === s.dominantLag);
                      if (!dom) return null;
                      return (
                        <line
                          data-section="chart-line-autocorrelation-dominant-marker"
                          data-series-id={s.id}
                          data-lag={s.dominantLag}
                          x1={dom.px}
                          x2={dom.px}
                          y1={layout.acfPanel.y}
                          y2={layout.acfPanel.y + layout.acfPanel.height}
                          stroke={dom.color}
                          strokeDasharray="2 3"
                          strokeWidth={1}
                          pointerEvents="none"
                        />
                      );
                    })()
                  : null}
              </g>
            ))}
          </g>
        </svg>

        {showTooltip && hoverPoint && tooltipPos
          ? (() => {
              const s = layout.series.find((x) => x.id === hoverPoint.seriesId);
              if (!s) return null;
              if (hoverPoint.kind === 'time') {
                const p = s.timePoints.find(
                  (x) => x.index === hoverPoint.index,
                );
                if (!p) return null;
                return (
                  <div
                    data-section="chart-line-autocorrelation-tooltip"
                    data-tooltip-kind="time"
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
                      data-section="chart-line-autocorrelation-tooltip-label"
                      style={{ color: s.color, fontWeight: 600 }}
                    >
                      {s.label}
                    </div>
                    <div data-section="chart-line-autocorrelation-tooltip-x">
                      x: {formatX(p.x)}
                    </div>
                    <div data-section="chart-line-autocorrelation-tooltip-y">
                      y: {formatValue(p.y)}
                    </div>
                  </div>
                );
              }
              const l = s.lags.find((x) => x.lag === hoverPoint.index);
              if (!l) return null;
              return (
                <div
                  data-section="chart-line-autocorrelation-tooltip"
                  data-tooltip-kind="lag"
                  data-series-id={s.id}
                  data-lag={l.lag}
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
                    data-section="chart-line-autocorrelation-tooltip-label"
                    style={{ color: s.color, fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-autocorrelation-tooltip-lag">
                    lag: {l.lag}
                  </div>
                  <div
                    data-section="chart-line-autocorrelation-tooltip-acf"
                    style={{ fontWeight: 600 }}
                  >
                    ACF: {formatAcf(l.value)}
                  </div>
                  <div
                    data-section="chart-line-autocorrelation-tooltip-significance"
                    style={{ color: l.color }}
                  >
                    {l.significance}
                    {l.isDominant ? ' (dominant)' : ''}
                  </div>
                  <div data-section="chart-line-autocorrelation-tooltip-config">
                    CI={formatAcf(s.confidenceBound)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-autocorrelation-legend"
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
              DEFAULT_CHART_LINE_AUTOCORRELATION_PALETTE[0]!;
            return (
              <button
                key={s.id}
                type="button"
                data-section="chart-line-autocorrelation-legend-item"
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
                  data-section="chart-line-autocorrelation-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: swatchColor,
                  }}
                />
                <span data-section="chart-line-autocorrelation-legend-label">
                  {s.label}
                </span>
                {layoutMatch ? (
                  <span
                    data-section="chart-line-autocorrelation-legend-stats"
                    style={{ fontSize: 10, color: '#64748b' }}
                  >
                    (dom k={layoutMatch.dominantLag};
                    ACF {formatAcf(layoutMatch.dominantValue)};
                    sig {layoutMatch.significantCount})
                  </span>
                ) : null}
              </button>
            );
          })}
          <span
            data-section="chart-line-autocorrelation-legend-total-points"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {allTotalPoints} total points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineAutocorrelation.displayName = 'ChartLineAutocorrelation';
