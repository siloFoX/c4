import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CUSUM_WIDTH = 560;
export const DEFAULT_CHART_LINE_CUSUM_HEIGHT = 360;
export const DEFAULT_CHART_LINE_CUSUM_PADDING = 40;
export const DEFAULT_CHART_LINE_CUSUM_GAP = 16;
export const DEFAULT_CHART_LINE_CUSUM_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CUSUM_SUB_HEIGHT_RATIO = 0.4;
export const DEFAULT_CHART_LINE_CUSUM_RAW_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_CUSUM_CUSUM_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_CUSUM_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CUSUM_SLACK = 0.5;
export const DEFAULT_CHART_LINE_CUSUM_THRESHOLD = 5;
export const DEFAULT_CHART_LINE_CUSUM_PALETTE = [
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
export const DEFAULT_CHART_LINE_CUSUM_TARGET_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CUSUM_THRESHOLD_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_CUSUM_TRIGGER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CUSUM_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CUSUM_AXIS_COLOR = '#cbd5e1';

export type ChartLineCusumTriggerSide = 'upper' | 'lower' | 'both' | 'none';

export interface ChartLineCusumPoint {
  x: number;
  y: number;
}

export interface ChartLineCusumSeries {
  id: string;
  label: string;
  data: readonly ChartLineCusumPoint[];
  color?: string;
  target?: number;
  sigma?: number;
}

export interface ChartLineCusumStats {
  mean: number;
  computedSigma: number;
  sigma: number;
  target: number;
  slack: number;
  threshold: number;
  allowance: number;
  decisionInterval: number;
  ok: boolean;
}

export interface ChartLineCusumSample {
  index: number;
  x: number;
  raw: number;
  deviation: number;
  cusumPos: number;
  cusumNeg: number;
  upperTriggered: boolean;
  lowerTriggered: boolean;
  triggered: boolean;
  triggerSide: ChartLineCusumTriggerSide;
}

export interface ChartLineCusumLayoutPoint extends ChartLineCusumSample {
  px: number;
  rawPy: number;
  cusumPosPy: number;
  cusumNegPy: number;
}

export interface ChartLineCusumLayoutTrigger {
  index: number;
  x: number;
  px: number;
  side: ChartLineCusumTriggerSide;
  cusumPos: number;
  cusumNeg: number;
  upperPy: number;
  lowerPy: number;
}

export interface ChartLineCusumLayoutSeries {
  id: string;
  label: string;
  color: string;
  stats: ChartLineCusumStats;
  points: ChartLineCusumLayoutPoint[];
  rawPath: string;
  cusumPosPath: string;
  cusumNegPath: string;
  targetPy: number;
  triggers: ChartLineCusumLayoutTrigger[];
  triggerCount: number;
  upperTriggerCount: number;
  lowerTriggerCount: number;
  maxCusumPos: number;
  maxCusumNeg: number;
  finiteCount: number;
  totalCount: number;
}

export interface ChartLineCusumLayout {
  ok: boolean;
  width: number;
  height: number;
  mainPanel: { x: number; y: number; width: number; height: number };
  subPanel: { x: number; y: number; width: number; height: number };
  xTicks: number[];
  mainYTicks: number[];
  subYTicks: number[];
  xMin: number;
  xMax: number;
  mainYMin: number;
  mainYMax: number;
  subYMin: number;
  subYMax: number;
  series: ChartLineCusumLayoutSeries[];
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineCusumLayoutOptions {
  series: readonly ChartLineCusumSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  subHeightRatio?: number;
  target?: number;
  sigma?: number;
  slack?: number;
  threshold?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
}

export interface ChartLineCusumProps {
  series: readonly ChartLineCusumSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  target?: number;
  sigma?: number;
  slack?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  subHeightRatio?: number;
  rawStrokeWidth?: number;
  cusumStrokeWidth?: number;
  dotRadius?: number;
  targetColor?: string;
  thresholdColor?: string;
  triggerColor?: string;
  gridColor?: string;
  axisColor?: string;
  xMin?: number;
  xMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showTargetLine?: boolean;
  showThresholds?: boolean;
  showTriggers?: boolean;
  showTriggerLines?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatCusum?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  subLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineCusumLayoutSeries;
    point: ChartLineCusumLayoutPoint;
  }) => void;
  onTriggerClick?: (payload: {
    series: ChartLineCusumLayoutSeries;
    trigger: ChartLineCusumLayoutTrigger;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineCusumSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineCusumDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_CUSUM_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineCusumFinitePoints(
  points: readonly ChartLineCusumPoint[] | null | undefined,
): ChartLineCusumPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineCusumPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

/**
 * Clamp the CUSUM slack (reference allowance) to >= 0. Non-finite ->
 * default 0.5. The slack is expressed in sigma units; the actual
 * per-step allowance is `slack * sigma`.
 */
export function normaliseLineCusumSlack(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_CUSUM_SLACK;
  if (value < 0) return 0;
  return value;
}

/**
 * Clamp the CUSUM threshold (decision interval) to >= 0. Non-finite ->
 * default 5. Expressed in sigma units; the actual decision interval is
 * `threshold * sigma`. A threshold of 0 disables triggering.
 */
export function normaliseLineCusumThreshold(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_CUSUM_THRESHOLD;
  if (value < 0) return 0;
  return value;
}

export function normaliseLineCusumSubHeightRatio(value: unknown): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_CHART_LINE_CUSUM_SUB_HEIGHT_RATIO;
  }
  if (value < 0.1) return 0.1;
  if (value > 0.9) return 0.9;
  return value;
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

function populationStd(values: readonly number[], mean: number): number {
  if (values.length === 0) return 0;
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (isFiniteNumber(v)) {
      const d = v - mean;
      sum += d * d;
      count += 1;
    }
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

export interface ComputeLineCusumStatsOptions {
  target?: number;
  sigma?: number;
  slack?: number;
  threshold?: number;
}

/**
 * Compute the reference statistics for a tabular CUSUM chart.
 *
 * - `target` is the expected process mean (defaults to the series
 *   mean).
 * - `sigma` scales the slack and threshold; it defaults to the
 *   population standard deviation of the series but may be overridden.
 * - `allowance = slack * sigma` is the per-step reference value
 *   subtracted from each accumulated deviation.
 * - `decisionInterval = threshold * sigma` is the alarm boundary.
 *
 * `ok` is true when `sigma > 0` (a positive scale is required for the
 * allowance and decision interval to be meaningful).
 */
export function computeLineCusumStats(
  values: readonly number[] | null | undefined,
  options?: ComputeLineCusumStatsOptions,
): ChartLineCusumStats {
  const slack = normaliseLineCusumSlack(options?.slack);
  const threshold = normaliseLineCusumThreshold(options?.threshold);
  const finite = Array.isArray(values)
    ? values.filter((v): v is number => isFiniteNumber(v))
    : [];
  const mean = meanOf(finite);
  const computedSigma = populationStd(finite, mean);
  const sigma =
    isFiniteNumber(options?.sigma) && options!.sigma! > 0
      ? options!.sigma!
      : computedSigma;
  const target = isFiniteNumber(options?.target) ? options!.target! : mean;
  const allowance = slack * sigma;
  const decisionInterval = threshold * sigma;
  return {
    mean,
    computedSigma,
    sigma,
    target,
    slack,
    threshold,
    allowance,
    decisionInterval,
    ok: sigma > 0,
  };
}

export function classifyLineCusumTriggerSide(
  upper: boolean,
  lower: boolean,
): ChartLineCusumTriggerSide {
  if (upper && lower) return 'both';
  if (upper) return 'upper';
  if (lower) return 'lower';
  return 'none';
}

export interface RunLineCusumOptions extends ComputeLineCusumStatsOptions {}

/**
 * Run the two-sided tabular CUSUM drift detector with reset-on-trigger.
 *
 * For each observation `y_t` (sorted by x) the running deviation is
 * `d_t = y_t - target`, and two non-negative cumulative sums are
 * updated:
 *
 *   C+_t = max(0, C+_{t-1} + d_t - allowance)
 *   C-_t = max(0, C-_{t-1} - d_t - allowance)
 *
 * `C+` accumulates persistent upward drift, `C-` persistent downward
 * drift. When either crosses the decision interval an alarm fires and
 * **that sum is reset to 0** so detection of the next shift starts
 * fresh. The recorded `cusumPos` / `cusumNeg` are the values at the
 * moment of crossing (so the triggering spike is visible); the next
 * sample's recursion starts from 0.
 */
export function runLineCusum(
  points: readonly ChartLineCusumPoint[] | null | undefined,
  options?: RunLineCusumOptions,
): {
  samples: ChartLineCusumSample[];
  stats: ChartLineCusumStats;
  triggerCount: number;
  upperTriggerCount: number;
  lowerTriggerCount: number;
  maxCusumPos: number;
  maxCusumNeg: number;
  totalSamples: number;
} {
  const finite = getLineCusumFinitePoints(points);
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const ys = sorted.map((p) => p.y);
  const stats = computeLineCusumStats(ys, options);
  const { target, allowance, decisionInterval } = stats;

  let cPlus = 0;
  let cMinus = 0;
  let triggerCount = 0;
  let upperTriggerCount = 0;
  let lowerTriggerCount = 0;
  let maxCusumPos = 0;
  let maxCusumNeg = 0;

  const samples: ChartLineCusumSample[] = sorted.map((p, i) => {
    const deviation = p.y - target;
    cPlus = Math.max(0, cPlus + deviation - allowance);
    cMinus = Math.max(0, cMinus - deviation - allowance);
    if (cPlus > maxCusumPos) maxCusumPos = cPlus;
    if (cMinus > maxCusumNeg) maxCusumNeg = cMinus;
    const upperTriggered = decisionInterval > 0 && cPlus > decisionInterval;
    const lowerTriggered = decisionInterval > 0 && cMinus > decisionInterval;
    const triggered = upperTriggered || lowerTriggered;
    const triggerSide = classifyLineCusumTriggerSide(
      upperTriggered,
      lowerTriggered,
    );
    if (triggered) triggerCount += 1;
    if (upperTriggered) upperTriggerCount += 1;
    if (lowerTriggered) lowerTriggerCount += 1;
    const sample: ChartLineCusumSample = {
      index: i,
      x: p.x,
      raw: p.y,
      deviation,
      cusumPos: cPlus,
      cusumNeg: cMinus,
      upperTriggered,
      lowerTriggered,
      triggered,
      triggerSide,
    };
    // Reset-on-trigger: the next iteration's recursion starts from 0.
    if (upperTriggered) cPlus = 0;
    if (lowerTriggered) cMinus = 0;
    return sample;
  });

  return {
    samples,
    stats,
    triggerCount,
    upperTriggerCount,
    lowerTriggerCount,
    maxCusumPos,
    maxCusumNeg,
    totalSamples: sorted.length,
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

export function computeLineCusumLayout(
  options: ComputeLineCusumLayoutOptions,
): ChartLineCusumLayout {
  const {
    series = [],
    hiddenSeries,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_CUSUM_GAP,
    tickCount = DEFAULT_CHART_LINE_CUSUM_TICK_COUNT,
    subHeightRatio,
    target,
    sigma,
    slack,
    threshold,
    defaultColors = DEFAULT_CHART_LINE_CUSUM_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = normaliseLineCusumSubHeightRatio(subHeightRatio);
  const usableHeight = Math.max(0, innerHeight - gap);
  const subHeight = usableHeight * ratio;
  const mainHeight = usableHeight - subHeight;

  const empty: ChartLineCusumLayout = {
    ok: false,
    width,
    height,
    mainPanel: { x: padding, y: padding, width: innerWidth, height: mainHeight },
    subPanel: {
      x: padding,
      y: padding + mainHeight + gap,
      width: innerWidth,
      height: subHeight,
    },
    xTicks: [],
    mainYTicks: [],
    subYTicks: [],
    xMin: 0,
    xMax: 0,
    mainYMin: 0,
    mainYMax: 0,
    subYMin: -1,
    subYMax: 1,
    series: [],
    totalPoints: 0,
    visibleSeriesCount: 0,
  };

  if (innerWidth <= 0 || mainHeight <= 0 || subHeight <= 0) return empty;
  if (!Array.isArray(series) || series.length === 0) return empty;

  const hidden = normaliseHidden(hiddenSeries);
  const visible = series.filter((s) => !hidden.has(s.id));
  if (visible.length === 0) return empty;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let cusumExtent = 0;
  let totalPoints = 0;

  const runBySeries = new Map<string, ReturnType<typeof runLineCusum>>();

  for (const s of visible) {
    const run = runLineCusum(s.data, {
      ...(isFiniteNumber(s.target) ? { target: s.target } : isFiniteNumber(target) ? { target } : {}),
      ...(isFiniteNumber(s.sigma) ? { sigma: s.sigma } : isFiniteNumber(sigma) ? { sigma } : {}),
      ...(isFiniteNumber(slack) ? { slack } : {}),
      ...(isFiniteNumber(threshold) ? { threshold } : {}),
    });
    runBySeries.set(s.id, run);
    totalPoints += run.samples.length;
    for (const sample of run.samples) {
      if (sample.x < xLo) xLo = sample.x;
      if (sample.x > xHi) xHi = sample.x;
      if (sample.raw < yLo) yLo = sample.raw;
      if (sample.raw > yHi) yHi = sample.raw;
    }
    if (run.stats.target < yLo) yLo = run.stats.target;
    if (run.stats.target > yHi) yHi = run.stats.target;
    if (run.maxCusumPos > cusumExtent) cusumExtent = run.maxCusumPos;
    if (run.maxCusumNeg > cusumExtent) cusumExtent = run.maxCusumNeg;
    if (run.stats.decisionInterval > cusumExtent) {
      cusumExtent = run.stats.decisionInterval;
    }
  }

  if (totalPoints === 0) return empty;

  if (isFiniteNumber(xMinOverride)) xLo = xMinOverride;
  if (isFiniteNumber(xMaxOverride)) xHi = xMaxOverride;

  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }
  if (cusumExtent <= 0) cusumExtent = 1;
  const subYMax = cusumExtent * 1.15;
  const subYMin = -subYMax;

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;
  const mainPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: mainHeight,
  };
  const subPanel = {
    x: padding,
    y: padding + mainHeight + gap,
    width: innerWidth,
    height: subHeight,
  };

  const projectX = (x: number): number =>
    mainPanel.x + ((x - xLo) / xRange) * mainPanel.width;
  const projectMainY = (y: number): number =>
    mainPanel.y + mainPanel.height - ((y - yLo) / yRange) * mainPanel.height;
  const projectSubY = (v: number): number =>
    subPanel.y +
    subPanel.height -
    ((v - subYMin) / (subYMax - subYMin)) * subPanel.height;

  const layoutSeries: ChartLineCusumLayoutSeries[] = visible.map((s, idx) => {
    const run = runBySeries.get(s.id)!;
    const color =
      s.color ??
      defaultColors[idx % defaultColors.length] ??
      DEFAULT_CHART_LINE_CUSUM_PALETTE[0]!;

    const points: ChartLineCusumLayoutPoint[] = run.samples.map((sample) => ({
      ...sample,
      px: projectX(sample.x),
      rawPy: projectMainY(sample.raw),
      cusumPosPy: projectSubY(sample.cusumPos),
      cusumNegPy: projectSubY(-sample.cusumNeg),
    }));

    const rawPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.rawPy })),
    );
    const cusumPosPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.cusumPosPy })),
    );
    const cusumNegPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.cusumNegPy })),
    );

    const triggers: ChartLineCusumLayoutTrigger[] = points
      .filter((p) => p.triggered)
      .map((p) => ({
        index: p.index,
        x: p.x,
        px: p.px,
        side: p.triggerSide,
        cusumPos: p.cusumPos,
        cusumNeg: p.cusumNeg,
        upperPy: p.cusumPosPy,
        lowerPy: p.cusumNegPy,
      }));

    return {
      id: s.id,
      label: s.label,
      color,
      stats: run.stats,
      points,
      rawPath,
      cusumPosPath,
      cusumNegPath,
      targetPy: projectMainY(run.stats.target),
      triggers,
      triggerCount: run.triggerCount,
      upperTriggerCount: run.upperTriggerCount,
      lowerTriggerCount: run.lowerTriggerCount,
      maxCusumPos: run.maxCusumPos,
      maxCusumNeg: run.maxCusumNeg,
      finiteCount: run.samples.length,
      totalCount: s.data?.length ?? 0,
    };
  });

  return {
    ok: true,
    width,
    height,
    mainPanel,
    subPanel,
    xTicks: computeTicks(xLo, xHi, tickCount),
    mainYTicks: computeTicks(yLo, yHi, tickCount),
    subYTicks: computeTicks(subYMin, subYMax, tickCount),
    xMin: xLo,
    xMax: xHi,
    mainYMin: yLo,
    mainYMax: yHi,
    subYMin,
    subYMax,
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

export function describeLineCusumChart(
  series: readonly ChartLineCusumSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    target?: number;
    sigma?: number;
    slack?: number;
    threshold?: number;
    formatValue?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const fmt = options?.formatValue ?? defaultFormatValue;

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const run = runLineCusum(s.data, {
      ...(isFiniteNumber(s.target) ? { target: s.target } : isFiniteNumber(options?.target) ? { target: options!.target } : {}),
      ...(isFiniteNumber(s.sigma) ? { sigma: s.sigma } : isFiniteNumber(options?.sigma) ? { sigma: options!.sigma } : {}),
      ...(isFiniteNumber(options?.slack) ? { slack: options!.slack } : {}),
      ...(isFiniteNumber(options?.threshold) ? { threshold: options!.threshold } : {}),
    });
    totalPoints += run.samples.length;
    summaries.push(
      `${s.label}: target ${fmt(run.stats.target)}, slack ${fmt(run.stats.slack)} sigma, threshold ${fmt(run.stats.threshold)} sigma, ${run.triggerCount} drift triggers`,
    );
  }
  return `Line chart with CUSUM cumulative-sum drift detector across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineCusum = forwardRef<HTMLDivElement, ChartLineCusumProps>(
  function ChartLineCusum(
    props: ChartLineCusumProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      series,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      target,
      sigma,
      slack = DEFAULT_CHART_LINE_CUSUM_SLACK,
      threshold = DEFAULT_CHART_LINE_CUSUM_THRESHOLD,
      width = DEFAULT_CHART_LINE_CUSUM_WIDTH,
      height = DEFAULT_CHART_LINE_CUSUM_HEIGHT,
      padding = DEFAULT_CHART_LINE_CUSUM_PADDING,
      gap = DEFAULT_CHART_LINE_CUSUM_GAP,
      tickCount = DEFAULT_CHART_LINE_CUSUM_TICK_COUNT,
      subHeightRatio = DEFAULT_CHART_LINE_CUSUM_SUB_HEIGHT_RATIO,
      rawStrokeWidth = DEFAULT_CHART_LINE_CUSUM_RAW_STROKE_WIDTH,
      cusumStrokeWidth = DEFAULT_CHART_LINE_CUSUM_CUSUM_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_CUSUM_DOT_RADIUS,
      targetColor = DEFAULT_CHART_LINE_CUSUM_TARGET_COLOR,
      thresholdColor = DEFAULT_CHART_LINE_CUSUM_THRESHOLD_COLOR,
      triggerColor = DEFAULT_CHART_LINE_CUSUM_TRIGGER_COLOR,
      gridColor = DEFAULT_CHART_LINE_CUSUM_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_CUSUM_AXIS_COLOR,
      xMin,
      xMax,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showLegend = true,
      showTooltip = true,
      showConfigBadge = true,
      showTargetLine = true,
      showThresholds = true,
      showTriggers = true,
      showTriggerLines = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with CUSUM cumulative-sum drift detector',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      formatCusum = defaultFormatValue,
      xLabel,
      yLabel,
      subLabel = 'CUSUM',
      onPointClick,
      onTriggerClick,
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
        computeLineCusumLayout({
          series,
          hiddenSeries: hiddenSet,
          width,
          height,
          padding,
          gap,
          tickCount,
          subHeightRatio,
          slack,
          threshold,
          ...(isFiniteNumber(target) ? { target } : {}),
          ...(isFiniteNumber(sigma) ? { sigma } : {}),
          ...(isFiniteNumber(xMin) ? { xMin } : {}),
          ...(isFiniteNumber(xMax) ? { xMax } : {}),
        }),
      [
        series,
        hiddenSet,
        width,
        height,
        padding,
        gap,
        tickCount,
        subHeightRatio,
        slack,
        threshold,
        target,
        sigma,
        xMin,
        xMax,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineCusumChart(series, {
          hidden: hiddenSet,
          slack,
          threshold,
          ...(isFiniteNumber(target) ? { target } : {}),
          ...(isFiniteNumber(sigma) ? { sigma } : {}),
        }),
      [ariaDescription, series, hiddenSet, slack, threshold, target, sigma],
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
      (s: ChartLineCusumSeries) => {
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
          (acc, s) => acc + getLineCusumFinitePoints(s.data).length,
          0,
        ),
      [series],
    );

    const dominantConfig = useMemo<{
      target: number;
      slack: number;
      threshold: number;
      triggerCount: number;
      seriesId: string;
    }>(() => {
      if (layout.series.length === 0) {
        return {
          target: isFiniteNumber(target) ? target : 0,
          slack: normaliseLineCusumSlack(slack),
          threshold: normaliseLineCusumThreshold(threshold),
          triggerCount: 0,
          seriesId: '',
        };
      }
      const s = layout.series[0]!;
      return {
        target: s.stats.target,
        slack: s.stats.slack,
        threshold: s.stats.threshold,
        triggerCount: s.triggerCount,
        seriesId: s.id,
      };
    }, [layout.series, target, slack, threshold]);

    const totalTriggers = useMemo(
      () => layout.series.reduce((acc, s) => acc + s.triggerCount, 0),
      [layout.series],
    );

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
          data-section="chart-line-cusum"
          data-empty="true"
          data-series-count={series.length}
          data-visible-series-count={0}
          data-total-points={0}
          data-total-triggers={0}
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-cusum-aria-desc"
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
    const subZeroPy =
      layout.subPanel.y +
      layout.subPanel.height -
      ((0 - layout.subYMin) / (layout.subYMax - layout.subYMin)) *
        layout.subPanel.height;

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-cusum"
        data-empty="false"
        data-series-count={series.length}
        data-visible-series-count={layout.visibleSeriesCount}
        data-total-points={layout.totalPoints}
        data-total-triggers={totalTriggers}
        data-target={dominantConfig.target}
        data-slack={dominantConfig.slack}
        data-threshold={dominantConfig.threshold}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-cusum-aria-desc"
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
          data-section="chart-line-cusum-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-cusum-badge"
              data-target={dominantConfig.target}
              data-slack={dominantConfig.slack}
              data-threshold={dominantConfig.threshold}
              data-trigger-count={totalTriggers}
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
                data-section="chart-line-cusum-badge-icon"
                aria-hidden="true"
              >
                CUSUM
              </span>
              <span data-section="chart-line-cusum-badge-target">
                T={formatValue(dominantConfig.target)}
              </span>
              <span data-section="chart-line-cusum-badge-slack">
                k={formatValue(dominantConfig.slack)}
              </span>
              <span data-section="chart-line-cusum-badge-threshold">
                h={formatValue(dominantConfig.threshold)}
              </span>
              <span data-section="chart-line-cusum-badge-triggers">
                drift={totalTriggers}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-cusum-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-cusum-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.mainYTicks.map((t, i) => {
                  const py =
                    layout.mainPanel.y +
                    layout.mainPanel.height -
                    ((t - layout.mainYMin) /
                      (layout.mainYMax - layout.mainYMin)) *
                      layout.mainPanel.height;
                  return (
                    <line
                      key={`mgy-${i}`}
                      data-section="chart-line-cusum-grid-line"
                      data-panel="main"
                      data-axis="y"
                      x1={layout.mainPanel.x}
                      x2={layout.mainPanel.x + layout.mainPanel.width}
                      y1={py}
                      y2={py}
                    />
                  );
                })}
                {layout.subYTicks.map((t, i) => {
                  const py =
                    layout.subPanel.y +
                    layout.subPanel.height -
                    ((t - layout.subYMin) /
                      (layout.subYMax - layout.subYMin)) *
                      layout.subPanel.height;
                  return (
                    <line
                      key={`sgy-${i}`}
                      data-section="chart-line-cusum-grid-line"
                      data-panel="sub"
                      data-axis="y"
                      x1={layout.subPanel.x}
                      x2={layout.subPanel.x + layout.subPanel.width}
                      y1={py}
                      y2={py}
                    />
                  );
                })}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-cusum-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-cusum-axis"
                  data-panel="main"
                  data-axis="x"
                  x1={layout.mainPanel.x}
                  y1={layout.mainPanel.y + layout.mainPanel.height}
                  x2={layout.mainPanel.x + layout.mainPanel.width}
                  y2={layout.mainPanel.y + layout.mainPanel.height}
                />
                <line
                  data-section="chart-line-cusum-axis"
                  data-panel="main"
                  data-axis="y"
                  x1={layout.mainPanel.x}
                  y1={layout.mainPanel.y}
                  x2={layout.mainPanel.x}
                  y2={layout.mainPanel.y + layout.mainPanel.height}
                />
                <line
                  data-section="chart-line-cusum-axis"
                  data-panel="sub"
                  data-axis="x"
                  x1={layout.subPanel.x}
                  y1={layout.subPanel.y + layout.subPanel.height}
                  x2={layout.subPanel.x + layout.subPanel.width}
                  y2={layout.subPanel.y + layout.subPanel.height}
                />
                <line
                  data-section="chart-line-cusum-axis"
                  data-panel="sub"
                  data-axis="y"
                  x1={layout.subPanel.x}
                  y1={layout.subPanel.y}
                  x2={layout.subPanel.x}
                  y2={layout.subPanel.y + layout.subPanel.height}
                />
                <g data-section="chart-line-cusum-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => {
                    const px =
                      layout.mainPanel.x +
                      ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                        layout.mainPanel.width;
                    return (
                      <g
                        key={`tx-${i}`}
                        data-section="chart-line-cusum-tick"
                        data-axis="x"
                      >
                        <line
                          x1={px}
                          x2={px}
                          y1={layout.subPanel.y + layout.subPanel.height}
                          y2={layout.subPanel.y + layout.subPanel.height + 4}
                        />
                        <text
                          data-section="chart-line-cusum-tick-label"
                          data-axis="x"
                          x={px}
                          y={layout.subPanel.y + layout.subPanel.height + 14}
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
                  data-section="chart-line-cusum-ticks"
                  data-panel="main"
                  data-axis="y"
                >
                  {layout.mainYTicks.map((t, i) => {
                    const py =
                      layout.mainPanel.y +
                      layout.mainPanel.height -
                      ((t - layout.mainYMin) /
                        (layout.mainYMax - layout.mainYMin)) *
                        layout.mainPanel.height;
                    return (
                      <g
                        key={`mty-${i}`}
                        data-section="chart-line-cusum-tick"
                        data-panel="main"
                        data-axis="y"
                      >
                        <line
                          x1={layout.mainPanel.x - 4}
                          x2={layout.mainPanel.x}
                          y1={py}
                          y2={py}
                        />
                        <text
                          data-section="chart-line-cusum-tick-label"
                          data-panel="main"
                          data-axis="y"
                          x={layout.mainPanel.x - 6}
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
                  data-section="chart-line-cusum-ticks"
                  data-panel="sub"
                  data-axis="y"
                >
                  {layout.subYTicks.map((t, i) => {
                    const py =
                      layout.subPanel.y +
                      layout.subPanel.height -
                      ((t - layout.subYMin) /
                        (layout.subYMax - layout.subYMin)) *
                        layout.subPanel.height;
                    return (
                      <g
                        key={`sty-${i}`}
                        data-section="chart-line-cusum-tick"
                        data-panel="sub"
                        data-axis="y"
                      >
                        <line
                          x1={layout.subPanel.x - 4}
                          x2={layout.subPanel.x}
                          y1={py}
                          y2={py}
                        />
                        <text
                          data-section="chart-line-cusum-tick-label"
                          data-panel="sub"
                          data-axis="y"
                          x={layout.subPanel.x - 6}
                          y={py + 3}
                          textAnchor="end"
                          fontSize={10}
                          fill={axisColor}
                          stroke="none"
                        >
                          {formatCusum(t)}
                        </text>
                      </g>
                    );
                  })}
                </g>
                {xLabel ? (
                  <text
                    data-section="chart-line-cusum-x-label"
                    x={layout.mainPanel.x + layout.mainPanel.width / 2}
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
                    data-section="chart-line-cusum-y-label"
                    transform={`rotate(-90 12 ${layout.mainPanel.y + layout.mainPanel.height / 2})`}
                    x={12}
                    y={layout.mainPanel.y + layout.mainPanel.height / 2}
                    textAnchor="middle"
                    fontSize={11}
                    fill={axisColor}
                    stroke="none"
                  >
                    {yLabel}
                  </text>
                ) : null}
                {subLabel ? (
                  <text
                    data-section="chart-line-cusum-sub-label"
                    transform={`rotate(-90 12 ${layout.subPanel.y + layout.subPanel.height / 2})`}
                    x={12}
                    y={layout.subPanel.y + layout.subPanel.height / 2}
                    textAnchor="middle"
                    fontSize={11}
                    fill={axisColor}
                    stroke="none"
                  >
                    {subLabel}
                  </text>
                ) : null}
              </g>
            ) : null}

            <line
              data-section="chart-line-cusum-zero-line"
              x1={layout.subPanel.x}
              x2={layout.subPanel.x + layout.subPanel.width}
              y1={subZeroPy}
              y2={subZeroPy}
              stroke={axisColor}
              strokeWidth={1}
            />

            <g data-section="chart-line-cusum-series">
              {layout.series.map((s) => {
                const upperThreshPy =
                  layout.subPanel.y +
                  layout.subPanel.height -
                  ((s.stats.decisionInterval - layout.subYMin) /
                    (layout.subYMax - layout.subYMin)) *
                    layout.subPanel.height;
                const lowerThreshPy =
                  layout.subPanel.y +
                  layout.subPanel.height -
                  ((-s.stats.decisionInterval - layout.subYMin) /
                    (layout.subYMax - layout.subYMin)) *
                    layout.subPanel.height;
                return (
                  <g
                    key={s.id}
                    data-section="chart-line-cusum-series-group"
                    data-series-id={s.id}
                    data-series-color={s.color}
                    data-series-target={s.stats.target}
                    data-series-sigma={s.stats.sigma}
                    data-series-slack={s.stats.slack}
                    data-series-threshold={s.stats.threshold}
                    data-series-allowance={s.stats.allowance}
                    data-series-decision-interval={s.stats.decisionInterval}
                    data-series-trigger-count={s.triggerCount}
                    data-series-upper-trigger-count={s.upperTriggerCount}
                    data-series-lower-trigger-count={s.lowerTriggerCount}
                    data-series-max-cusum-pos={s.maxCusumPos}
                    data-series-max-cusum-neg={s.maxCusumNeg}
                    data-series-finite-count={s.finiteCount}
                  >
                    {showTargetLine ? (
                      <line
                        data-section="chart-line-cusum-target-line"
                        data-series-id={s.id}
                        x1={layout.mainPanel.x}
                        x2={layout.mainPanel.x + layout.mainPanel.width}
                        y1={s.targetPy}
                        y2={s.targetPy}
                        stroke={targetColor}
                        strokeWidth={1}
                        strokeDasharray="6 4"
                        pointerEvents="none"
                      />
                    ) : null}
                    {showThresholds && s.stats.decisionInterval > 0 ? (
                      <g
                        data-section="chart-line-cusum-thresholds"
                        data-series-id={s.id}
                      >
                        <line
                          data-section="chart-line-cusum-threshold-line"
                          data-series-id={s.id}
                          data-side="upper"
                          x1={layout.subPanel.x}
                          x2={layout.subPanel.x + layout.subPanel.width}
                          y1={upperThreshPy}
                          y2={upperThreshPy}
                          stroke={thresholdColor}
                          strokeWidth={1}
                          strokeDasharray="6 4"
                          pointerEvents="none"
                        />
                        <line
                          data-section="chart-line-cusum-threshold-line"
                          data-series-id={s.id}
                          data-side="lower"
                          x1={layout.subPanel.x}
                          x2={layout.subPanel.x + layout.subPanel.width}
                          y1={lowerThreshPy}
                          y2={lowerThreshPy}
                          stroke={thresholdColor}
                          strokeWidth={1}
                          strokeDasharray="6 4"
                          pointerEvents="none"
                        />
                      </g>
                    ) : null}
                    {s.rawPath ? (
                      <path
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={`${s.label} raw observations`}
                        data-section="chart-line-cusum-raw-path"
                        data-series-id={s.id}
                        data-kind="raw"
                        d={s.rawPath}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={rawStrokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : null}
                    {s.cusumPosPath ? (
                      <path
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={`${s.label} CUSUM upper cumulative sum`}
                        data-section="chart-line-cusum-cusum-pos-path"
                        data-series-id={s.id}
                        data-kind="cusum-pos"
                        d={s.cusumPosPath}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={cusumStrokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : null}
                    {s.cusumNegPath ? (
                      <path
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={`${s.label} CUSUM lower cumulative sum`}
                        data-section="chart-line-cusum-cusum-neg-path"
                        data-series-id={s.id}
                        data-kind="cusum-neg"
                        d={s.cusumNegPath}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={cusumStrokeWidth}
                        strokeOpacity={0.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : null}
                    {showTriggerLines
                      ? s.triggers.map((tr) => (
                          <line
                            key={`tl-${tr.index}`}
                            data-section="chart-line-cusum-trigger-line"
                            data-series-id={s.id}
                            data-point-index={tr.index}
                            data-side={tr.side}
                            x1={tr.px}
                            x2={tr.px}
                            y1={layout.mainPanel.y}
                            y2={layout.mainPanel.y + layout.mainPanel.height}
                            stroke={triggerColor}
                            strokeWidth={1}
                            strokeDasharray="3 3"
                            pointerEvents="none"
                          />
                        ))
                      : null}
                    {showTriggers
                      ? s.triggers.map((tr) => {
                          const markers: {
                            key: string;
                            side: 'upper' | 'lower';
                            py: number;
                          }[] = [];
                          if (tr.side === 'upper' || tr.side === 'both') {
                            markers.push({
                              key: `u-${tr.index}`,
                              side: 'upper',
                              py: tr.upperPy,
                            });
                          }
                          if (tr.side === 'lower' || tr.side === 'both') {
                            markers.push({
                              key: `l-${tr.index}`,
                              side: 'lower',
                              py: tr.lowerPy,
                            });
                          }
                          return markers.map((mk) => (
                            <path
                              key={mk.key}
                              role="graphics-symbol"
                              tabIndex={0}
                              aria-label={`${s.label} CUSUM drift trigger at x ${formatX(tr.x)} (${mk.side})`}
                              data-section="chart-line-cusum-trigger-marker"
                              data-series-id={s.id}
                              data-point-index={tr.index}
                              data-side={mk.side}
                              d={`M ${tr.px} ${mk.py - dotRadius - 2} L ${tr.px + dotRadius + 2} ${mk.py} L ${tr.px} ${mk.py + dotRadius + 2} L ${tr.px - dotRadius - 2} ${mk.py} Z`}
                              fill={triggerColor}
                              stroke="#ffffff"
                              strokeWidth={1}
                              onClick={() =>
                                onTriggerClick?.({
                                  series: s,
                                  trigger: tr,
                                })
                              }
                            />
                          ));
                        })
                      : null}
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
                              aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)}; raw ${formatValue(p.raw)}; CUSUM+ ${formatCusum(p.cusumPos)}; CUSUM- ${formatCusum(p.cusumNeg)}`}
                              data-section="chart-line-cusum-dot"
                              data-series-id={s.id}
                              data-point-index={p.index}
                              data-x={p.x}
                              data-raw={p.raw}
                              data-deviation={p.deviation}
                              data-cusum-pos={p.cusumPos}
                              data-cusum-neg={p.cusumNeg}
                              data-triggered={p.triggered ? 'true' : 'false'}
                              data-trigger-side={p.triggerSide}
                              data-hovered={isHover ? 'true' : 'false'}
                              cx={p.px}
                              cy={p.rawPy}
                              r={isHover ? dotRadius + 1 : dotRadius}
                              fill={s.color}
                              stroke="#ffffff"
                              strokeWidth={1}
                              onMouseEnter={() => {
                                setHoverPayload({
                                  seriesId: s.id,
                                  pointIndex: p.index,
                                });
                                setTooltipPos({ px: p.px, py: p.rawPy });
                              }}
                              onMouseLeave={clearHover}
                              onFocus={() => {
                                setHoverPayload({
                                  seriesId: s.id,
                                  pointIndex: p.index,
                                });
                                setTooltipPos({ px: p.px, py: p.rawPy });
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
                );
              })}
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
                    data-section="chart-line-cusum-tooltip"
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
                      data-section="chart-line-cusum-tooltip-label"
                      style={{ color: s.color, fontWeight: 600 }}
                    >
                      {s.label}
                    </div>
                    <div data-section="chart-line-cusum-tooltip-x">
                      x: {formatX(p.x)}
                    </div>
                    <div data-section="chart-line-cusum-tooltip-raw">
                      raw: {formatValue(p.raw)}
                    </div>
                    <div data-section="chart-line-cusum-tooltip-deviation">
                      deviation:{' '}
                      {(p.deviation >= 0 ? '+' : '') +
                        formatValue(p.deviation)}
                    </div>
                    <div
                      data-section="chart-line-cusum-tooltip-cusum-pos"
                      style={{ fontWeight: 600 }}
                    >
                      CUSUM+: {formatCusum(p.cusumPos)}
                    </div>
                    <div data-section="chart-line-cusum-tooltip-cusum-neg">
                      CUSUM-: {formatCusum(p.cusumNeg)}
                    </div>
                    {p.triggered ? (
                      <div
                        data-section="chart-line-cusum-tooltip-trigger"
                        style={{ color: triggerColor, fontWeight: 600 }}
                      >
                        drift trigger ({p.triggerSide})
                      </div>
                    ) : null}
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-cusum-legend"
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
                DEFAULT_CHART_LINE_CUSUM_PALETTE[0]!;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-section="chart-line-cusum-legend-item"
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
                    data-section="chart-line-cusum-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: swatchColor,
                    }}
                  />
                  <span data-section="chart-line-cusum-legend-label">
                    {s.label}
                  </span>
                  {layoutMatch ? (
                    <span
                      data-section="chart-line-cusum-legend-stats"
                      style={{ fontSize: 10, color: '#64748b' }}
                    >
                      (T={formatValue(layoutMatch.stats.target)};{' '}
                      drift {layoutMatch.triggerCount})
                    </span>
                  ) : null}
                </button>
              );
            })}
            <span
              data-section="chart-line-cusum-legend-total-points"
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

ChartLineCusum.displayName = 'ChartLineCusum';
