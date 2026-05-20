import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_EWMSD_WIDTH = 560;
export const DEFAULT_CHART_LINE_EWMSD_HEIGHT = 320;
export const DEFAULT_CHART_LINE_EWMSD_PADDING = 40;
export const DEFAULT_CHART_LINE_EWMSD_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_EWMSD_RAW_STROKE_WIDTH = 1;
export const DEFAULT_CHART_LINE_EWMSD_MEAN_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_EWMSD_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_EWMSD_ALPHA = 0.3;
export const DEFAULT_CHART_LINE_EWMSD_BAND_MULTIPLIER = 2;
export const DEFAULT_CHART_LINE_EWMSD_RAW_OPACITY = 0.4;
export const DEFAULT_CHART_LINE_EWMSD_BAND_OPACITY = 0.15;
export const DEFAULT_CHART_LINE_EWMSD_PALETTE = [
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
export const DEFAULT_CHART_LINE_EWMSD_RAW_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_EWMSD_EXCEEDANCE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_EWMSD_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_EWMSD_AXIS_COLOR = '#cbd5e1';

export type ChartLineEwmsdExceedance = 'above' | 'below' | 'within';

export interface ChartLineEwmsdPoint {
  x: number;
  y: number;
}

export interface ChartLineEwmsdSeries {
  id: string;
  label: string;
  data: readonly ChartLineEwmsdPoint[];
  color?: string;
  alpha?: number;
  bandMultiplier?: number;
}

export interface ChartLineEwmsdStat {
  mean: number;
  variance: number;
  std: number;
}

export interface ChartLineEwmsdSample {
  index: number;
  x: number;
  raw: number;
  mean: number;
  variance: number;
  std: number;
  upper: number;
  lower: number;
  exceedance: ChartLineEwmsdExceedance;
}

export interface ChartLineEwmsdLayoutPoint extends ChartLineEwmsdSample {
  px: number;
  rawPy: number;
  meanPy: number;
  upperPy: number;
  lowerPy: number;
}

export interface ChartLineEwmsdLayoutSeries {
  id: string;
  label: string;
  color: string;
  alpha: number;
  bandMultiplier: number;
  points: ChartLineEwmsdLayoutPoint[];
  rawPath: string;
  meanPath: string;
  bandFillPath: string;
  upperPath: string;
  lowerPath: string;
  exceedances: ChartLineEwmsdLayoutPoint[];
  finiteCount: number;
  totalCount: number;
  exceedanceCount: number;
  aboveCount: number;
  belowCount: number;
  finalMean: number;
  finalStd: number;
  maxStd: number;
}

export interface ChartLineEwmsdLayout {
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
  series: ChartLineEwmsdLayoutSeries[];
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineEwmsdLayoutOptions {
  series: readonly ChartLineEwmsdSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  alpha?: number;
  bandMultiplier?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineEwmsdProps {
  series: readonly ChartLineEwmsdSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  alpha?: number;
  bandMultiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  rawStrokeWidth?: number;
  meanStrokeWidth?: number;
  dotRadius?: number;
  rawOpacity?: number;
  bandOpacity?: number;
  rawColor?: string;
  exceedanceColor?: string;
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
  showMean?: boolean;
  showBand?: boolean;
  showExceedances?: boolean;
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
    series: ChartLineEwmsdLayoutSeries;
    point: ChartLineEwmsdLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineEwmsdSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineEwmsdDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_EWMSD_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineEwmsdFinitePoints(
  points: readonly ChartLineEwmsdPoint[] | null | undefined,
): ChartLineEwmsdPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineEwmsdPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

/**
 * Clamp the EWMA smoothing factor to (0, 1]. Non-finite -> default
 * 0.3. Values at or below 0 are raised to a small positive floor (a
 * zero factor would freeze the mean), values above 1 are clamped to 1.
 */
export function normaliseLineEwmsdAlpha(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_EWMSD_ALPHA;
  if (value < 0.01) return 0.01;
  if (value > 1) return 1;
  return value;
}

/**
 * Clamp the band-width multiplier `k` to >= 0. Non-finite -> default 2.
 */
export function normaliseLineEwmsdBandMultiplier(value: unknown): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_CHART_LINE_EWMSD_BAND_MULTIPLIER;
  }
  if (value < 0) return 0;
  return value;
}

export function classifyLineEwmsdExceedance(
  value: number,
  lower: number,
  upper: number,
): ChartLineEwmsdExceedance {
  if (
    !isFiniteNumber(value) ||
    !isFiniteNumber(lower) ||
    !isFiniteNumber(upper)
  ) {
    return 'within';
  }
  if (value > upper) return 'above';
  if (value < lower) return 'below';
  return 'within';
}

/**
 * Incremental exponentially-weighted mean and variance.
 *
 * For each new value `y_t` (Finch's incremental EWM recursion):
 *
 *   delta_t = y_t - mean_{t-1}
 *   mean_t  = mean_{t-1} + alpha * delta_t
 *   var_t   = (1 - alpha) * (var_{t-1} + alpha * delta_t^2)
 *
 * The mean recursion is exactly the standard EWMA
 * `mean_t = alpha * y_t + (1 - alpha) * mean_{t-1}`. The variance is
 * the exponentially-weighted variance: every past squared deviation
 * contributes with a geometrically decaying weight, so the EWM
 * standard deviation `sqrt(var_t)` tracks *recent* volatility rather
 * than the volatility of a fixed window.
 *
 * Seed: `mean_0 = y_0`, `var_0 = 0` (a single point has no spread).
 * Non-finite values are dropped; the output array matches the
 * finite-only length.
 */
export function computeLineEwmsd(
  values: readonly number[] | null | undefined,
  alpha: number,
): ChartLineEwmsdStat[] {
  if (!Array.isArray(values)) return [];
  const finite = values.filter((v): v is number => isFiniteNumber(v));
  if (finite.length === 0) return [];
  const a = normaliseLineEwmsdAlpha(alpha);
  const out: ChartLineEwmsdStat[] = [];
  let mean = finite[0]!;
  let variance = 0;
  for (let i = 0; i < finite.length; i += 1) {
    const value = finite[i]!;
    if (i === 0) {
      mean = value;
      variance = 0;
    } else {
      const delta = value - mean;
      mean = mean + a * delta;
      variance = (1 - a) * (variance + a * delta * delta);
    }
    const std = Math.sqrt(Math.max(0, variance));
    out.push({ mean, variance, std });
  }
  return out;
}

export interface RunLineEwmsdOptions {
  alpha?: number;
  bandMultiplier?: number;
}

export function runLineEwmsd(
  points: readonly ChartLineEwmsdPoint[] | null | undefined,
  options?: RunLineEwmsdOptions,
): {
  samples: ChartLineEwmsdSample[];
  alpha: number;
  bandMultiplier: number;
  exceedanceCount: number;
  aboveCount: number;
  belowCount: number;
  finalMean: number;
  finalStd: number;
  maxStd: number;
  totalSamples: number;
} {
  const alpha = normaliseLineEwmsdAlpha(options?.alpha);
  const bandMultiplier = normaliseLineEwmsdBandMultiplier(
    options?.bandMultiplier,
  );
  const finite = getLineEwmsdFinitePoints(points);
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const ys = sorted.map((p) => p.y);
  const stats = computeLineEwmsd(ys, alpha);

  let exceedanceCount = 0;
  let aboveCount = 0;
  let belowCount = 0;
  let maxStd = 0;

  const samples: ChartLineEwmsdSample[] = sorted.map((p, i) => {
    const stat = stats[i] ?? { mean: p.y, variance: 0, std: 0 };
    const upper = stat.mean + bandMultiplier * stat.std;
    const lower = stat.mean - bandMultiplier * stat.std;
    const exceedance = classifyLineEwmsdExceedance(p.y, lower, upper);
    if (stat.std > maxStd) maxStd = stat.std;
    if (exceedance === 'above') {
      exceedanceCount += 1;
      aboveCount += 1;
    } else if (exceedance === 'below') {
      exceedanceCount += 1;
      belowCount += 1;
    }
    return {
      index: i,
      x: p.x,
      raw: p.y,
      mean: stat.mean,
      variance: stat.variance,
      std: stat.std,
      upper,
      lower,
      exceedance,
    };
  });

  const last = samples[samples.length - 1];

  return {
    samples,
    alpha,
    bandMultiplier,
    exceedanceCount,
    aboveCount,
    belowCount,
    finalMean: last ? last.mean : 0,
    finalStd: last ? last.std : 0,
    maxStd,
    totalSamples: sorted.length,
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

export function computeLineEwmsdLayout(
  options: ComputeLineEwmsdLayoutOptions,
): ChartLineEwmsdLayout {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_EWMSD_TICK_COUNT,
    alpha,
    bandMultiplier,
    defaultColors = DEFAULT_CHART_LINE_EWMSD_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ChartLineEwmsdLayout = {
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

  const runBySeries = new Map<string, ReturnType<typeof runLineEwmsd>>();

  for (const s of visible) {
    const run = runLineEwmsd(s.data, {
      alpha: s.alpha ?? alpha,
      bandMultiplier: s.bandMultiplier ?? bandMultiplier,
    });
    runBySeries.set(s.id, run);
    totalPoints += run.samples.length;
    for (const sample of run.samples) {
      if (sample.x < xLo) xLo = sample.x;
      if (sample.x > xHi) xHi = sample.x;
      if (sample.raw < yLo) yLo = sample.raw;
      if (sample.raw > yHi) yHi = sample.raw;
      if (sample.upper > yHi) yHi = sample.upper;
      if (sample.lower < yLo) yLo = sample.lower;
      if (sample.mean < yLo) yLo = sample.mean;
      if (sample.mean > yHi) yHi = sample.mean;
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

  const layoutSeries: ChartLineEwmsdLayoutSeries[] = visible.map((s, idx) => {
    const run = runBySeries.get(s.id)!;
    const color =
      s.color ??
      defaultColors[idx % defaultColors.length] ??
      DEFAULT_CHART_LINE_EWMSD_PALETTE[0]!;

    const points: ChartLineEwmsdLayoutPoint[] = run.samples.map((sample) => ({
      ...sample,
      px: projectX(sample.x),
      rawPy: projectY(sample.raw),
      meanPy: projectY(sample.mean),
      upperPy: projectY(sample.upper),
      lowerPy: projectY(sample.lower),
    }));

    const rawPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.rawPy })),
    );
    const meanPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.meanPy })),
    );
    const upperPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.upperPy })),
    );
    const lowerPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.lowerPy })),
    );
    const bandFillPath = buildBandFillPath(
      points.map((p) => ({
        px: p.px,
        upperPy: p.upperPy,
        lowerPy: p.lowerPy,
      })),
    );
    const exceedances = points.filter((p) => p.exceedance !== 'within');

    return {
      id: s.id,
      label: s.label,
      color,
      alpha: run.alpha,
      bandMultiplier: run.bandMultiplier,
      points,
      rawPath,
      meanPath,
      bandFillPath,
      upperPath,
      lowerPath,
      exceedances,
      finiteCount: run.samples.length,
      totalCount: s.data?.length ?? 0,
      exceedanceCount: run.exceedanceCount,
      aboveCount: run.aboveCount,
      belowCount: run.belowCount,
      finalMean: run.finalMean,
      finalStd: run.finalStd,
      maxStd: run.maxStd,
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
  return n.toFixed(2);
}

export function describeLineEwmsdChart(
  series: readonly ChartLineEwmsdSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    alpha?: number;
    bandMultiplier?: number;
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
    const run = runLineEwmsd(s.data, {
      alpha: s.alpha ?? options?.alpha,
      bandMultiplier: s.bandMultiplier ?? options?.bandMultiplier,
    });
    totalPoints += run.samples.length;
    summaries.push(
      `${s.label}: EWMA alpha ${fmt(run.alpha)}, ${fmt(run.bandMultiplier)} sigma band, EWM std ${fmt(run.finalStd)}, ${run.exceedanceCount} band exceedances`,
    );
  }
  return `Line chart with EWMA mean and exponentially-weighted standard deviation band across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineEwmsd = forwardRef<HTMLDivElement, ChartLineEwmsdProps>(
  function ChartLineEwmsd(
    props: ChartLineEwmsdProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      series,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      alpha = DEFAULT_CHART_LINE_EWMSD_ALPHA,
      bandMultiplier = DEFAULT_CHART_LINE_EWMSD_BAND_MULTIPLIER,
      width = DEFAULT_CHART_LINE_EWMSD_WIDTH,
      height = DEFAULT_CHART_LINE_EWMSD_HEIGHT,
      padding = DEFAULT_CHART_LINE_EWMSD_PADDING,
      tickCount = DEFAULT_CHART_LINE_EWMSD_TICK_COUNT,
      rawStrokeWidth = DEFAULT_CHART_LINE_EWMSD_RAW_STROKE_WIDTH,
      meanStrokeWidth = DEFAULT_CHART_LINE_EWMSD_MEAN_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_EWMSD_DOT_RADIUS,
      rawOpacity = DEFAULT_CHART_LINE_EWMSD_RAW_OPACITY,
      bandOpacity = DEFAULT_CHART_LINE_EWMSD_BAND_OPACITY,
      rawColor = DEFAULT_CHART_LINE_EWMSD_RAW_COLOR,
      exceedanceColor = DEFAULT_CHART_LINE_EWMSD_EXCEEDANCE_COLOR,
      gridColor = DEFAULT_CHART_LINE_EWMSD_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_EWMSD_AXIS_COLOR,
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
      showMean = true,
      showBand = true,
      showExceedances = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with EWMA mean and exponentially-weighted standard deviation band',
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
        computeLineEwmsdLayout({
          series,
          hiddenSeries: hiddenSet,
          width,
          height,
          padding,
          tickCount,
          alpha,
          bandMultiplier,
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
        bandMultiplier,
        xMin,
        xMax,
        yMin,
        yMax,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineEwmsdChart(series, {
          hidden: hiddenSet,
          alpha,
          bandMultiplier,
          formatCoefficient,
        }),
      [
        ariaDescription,
        series,
        hiddenSet,
        alpha,
        bandMultiplier,
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
      (s: ChartLineEwmsdSeries) => {
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
          (acc, s) => acc + getLineEwmsdFinitePoints(s.data).length,
          0,
        ),
      [series],
    );

    const totalExceedances = useMemo(
      () => layout.series.reduce((acc, s) => acc + s.exceedanceCount, 0),
      [layout.series],
    );

    const dominantConfig = useMemo<{
      alpha: number;
      bandMultiplier: number;
      finalStd: number;
      seriesId: string;
    }>(() => {
      if (layout.series.length === 0) {
        return {
          alpha: normaliseLineEwmsdAlpha(alpha),
          bandMultiplier: normaliseLineEwmsdBandMultiplier(bandMultiplier),
          finalStd: 0,
          seriesId: '',
        };
      }
      const s = layout.series[0]!;
      return {
        alpha: s.alpha,
        bandMultiplier: s.bandMultiplier,
        finalStd: s.finalStd,
        seriesId: s.id,
      };
    }, [layout.series, alpha, bandMultiplier]);

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
          data-section="chart-line-ewmsd"
          data-empty="true"
          data-series-count={series.length}
          data-visible-series-count={0}
          data-total-points={0}
          data-total-exceedances={0}
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-ewmsd-aria-desc"
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
        data-section="chart-line-ewmsd"
        data-empty="false"
        data-series-count={series.length}
        data-visible-series-count={layout.visibleSeriesCount}
        data-total-points={layout.totalPoints}
        data-total-exceedances={totalExceedances}
        data-alpha={dominantConfig.alpha}
        data-band-multiplier={dominantConfig.bandMultiplier}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-ewmsd-aria-desc"
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
          data-section="chart-line-ewmsd-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-ewmsd-badge"
              data-alpha={dominantConfig.alpha}
              data-band-multiplier={dominantConfig.bandMultiplier}
              data-final-std={dominantConfig.finalStd}
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
                data-section="chart-line-ewmsd-badge-icon"
                aria-hidden="true"
              >
                EWMSD
              </span>
              <span data-section="chart-line-ewmsd-badge-alpha">
                a={formatCoefficient(dominantConfig.alpha)}
              </span>
              <span data-section="chart-line-ewmsd-badge-multiplier">
                k={formatCoefficient(dominantConfig.bandMultiplier)}
              </span>
              <span data-section="chart-line-ewmsd-badge-std">
                sd={formatCoefficient(dominantConfig.finalStd)}
              </span>
              <span data-section="chart-line-ewmsd-badge-exceedances">
                exc={totalExceedances}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-ewmsd-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-ewmsd-grid"
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
                      data-section="chart-line-ewmsd-grid-line"
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
                      data-section="chart-line-ewmsd-grid-line"
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
                data-section="chart-line-ewmsd-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-ewmsd-axis"
                  data-axis="x"
                  x1={layout.panel.x}
                  y1={layout.panel.y + layout.panel.height}
                  x2={layout.panel.x + layout.panel.width}
                  y2={layout.panel.y + layout.panel.height}
                />
                <line
                  data-section="chart-line-ewmsd-axis"
                  data-axis="y"
                  x1={layout.panel.x}
                  y1={layout.panel.y}
                  x2={layout.panel.x}
                  y2={layout.panel.y + layout.panel.height}
                />
                <g data-section="chart-line-ewmsd-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => {
                    const px =
                      layout.panel.x +
                      ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                        layout.panel.width;
                    return (
                      <g
                        key={`tx-${i}`}
                        data-section="chart-line-ewmsd-tick"
                        data-axis="x"
                      >
                        <line
                          x1={px}
                          x2={px}
                          y1={layout.panel.y + layout.panel.height}
                          y2={layout.panel.y + layout.panel.height + 4}
                        />
                        <text
                          data-section="chart-line-ewmsd-tick-label"
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
                <g data-section="chart-line-ewmsd-ticks" data-axis="y">
                  {layout.yTicks.map((t, i) => {
                    const py =
                      layout.panel.y +
                      layout.panel.height -
                      ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                        layout.panel.height;
                    return (
                      <g
                        key={`ty-${i}`}
                        data-section="chart-line-ewmsd-tick"
                        data-axis="y"
                      >
                        <line
                          x1={layout.panel.x - 4}
                          x2={layout.panel.x}
                          y1={py}
                          y2={py}
                        />
                        <text
                          data-section="chart-line-ewmsd-tick-label"
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
                    data-section="chart-line-ewmsd-x-label"
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
                    data-section="chart-line-ewmsd-y-label"
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

            <g data-section="chart-line-ewmsd-series">
              {layout.series.map((s) => (
                <g
                  key={s.id}
                  data-section="chart-line-ewmsd-series-group"
                  data-series-id={s.id}
                  data-series-color={s.color}
                  data-series-alpha={s.alpha}
                  data-series-band-multiplier={s.bandMultiplier}
                  data-series-final-mean={s.finalMean}
                  data-series-final-std={s.finalStd}
                  data-series-max-std={s.maxStd}
                  data-series-exceedance-count={s.exceedanceCount}
                  data-series-above-count={s.aboveCount}
                  data-series-below-count={s.belowCount}
                  data-series-finite-count={s.finiteCount}
                >
                  {showBand && s.bandFillPath ? (
                    <g
                      data-section="chart-line-ewmsd-band"
                      data-series-id={s.id}
                    >
                      <path
                        data-section="chart-line-ewmsd-band-fill"
                        data-series-id={s.id}
                        d={s.bandFillPath}
                        fill={s.color}
                        fillOpacity={bandOpacity}
                        stroke="none"
                        pointerEvents="none"
                      />
                      <path
                        data-section="chart-line-ewmsd-band-upper-path"
                        data-series-id={s.id}
                        data-kind="upper"
                        d={s.upperPath}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={1}
                        strokeOpacity={0.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pointerEvents="none"
                      />
                      <path
                        data-section="chart-line-ewmsd-band-lower-path"
                        data-series-id={s.id}
                        data-kind="lower"
                        d={s.lowerPath}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={1}
                        strokeOpacity={0.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pointerEvents="none"
                      />
                    </g>
                  ) : null}
                  {showRaw && s.rawPath ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} raw observations`}
                      data-section="chart-line-ewmsd-raw-path"
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
                  {showMean && s.meanPath ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} EWMA mean (alpha ${formatCoefficient(s.alpha)})`}
                      data-section="chart-line-ewmsd-mean-path"
                      data-series-id={s.id}
                      data-kind="mean"
                      d={s.meanPath}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={meanStrokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {showExceedances
                    ? s.exceedances.map((p) => (
                        <path
                          key={`e-${p.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} band exceedance at x ${formatX(p.x)} (${p.exceedance})`}
                          data-section="chart-line-ewmsd-exceedance-marker"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-exceedance={p.exceedance}
                          d={`M ${p.px} ${p.rawPy - dotRadius - 2} L ${p.px + dotRadius + 2} ${p.rawPy} L ${p.px} ${p.rawPy + dotRadius + 2} L ${p.px - dotRadius - 2} ${p.rawPy} Z`}
                          fill={exceedanceColor}
                          stroke="#ffffff"
                          strokeWidth={1}
                        />
                      ))
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
                            aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)}; raw ${formatValue(p.raw)}; EWMA mean ${formatValue(p.mean)}; EWM std ${formatValue(p.std)}`}
                            data-section="chart-line-ewmsd-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-raw={p.raw}
                            data-mean={p.mean}
                            data-std={p.std}
                            data-upper={p.upper}
                            data-lower={p.lower}
                            data-exceedance={p.exceedance}
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
                    data-section="chart-line-ewmsd-tooltip"
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
                      data-section="chart-line-ewmsd-tooltip-label"
                      style={{ color: s.color, fontWeight: 600 }}
                    >
                      {s.label}
                    </div>
                    <div data-section="chart-line-ewmsd-tooltip-x">
                      x: {formatX(p.x)}
                    </div>
                    <div data-section="chart-line-ewmsd-tooltip-raw">
                      raw: {formatValue(p.raw)}
                    </div>
                    <div
                      data-section="chart-line-ewmsd-tooltip-mean"
                      style={{ fontWeight: 600 }}
                    >
                      EWMA mean: {formatValue(p.mean)}
                    </div>
                    <div data-section="chart-line-ewmsd-tooltip-std">
                      EWM std: {formatValue(p.std)}
                    </div>
                    <div data-section="chart-line-ewmsd-tooltip-band">
                      band: [{formatValue(p.lower)}, {formatValue(p.upper)}]
                    </div>
                    {p.exceedance !== 'within' ? (
                      <div
                        data-section="chart-line-ewmsd-tooltip-exceedance"
                        style={{ color: exceedanceColor, fontWeight: 600 }}
                      >
                        band exceedance ({p.exceedance})
                      </div>
                    ) : null}
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-ewmsd-legend"
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
                DEFAULT_CHART_LINE_EWMSD_PALETTE[0]!;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-section="chart-line-ewmsd-legend-item"
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
                    data-section="chart-line-ewmsd-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: swatchColor,
                    }}
                  />
                  <span data-section="chart-line-ewmsd-legend-label">
                    {s.label}
                  </span>
                  {layoutMatch ? (
                    <span
                      data-section="chart-line-ewmsd-legend-stats"
                      style={{ fontSize: 10, color: '#64748b' }}
                    >
                      (a={formatCoefficient(layoutMatch.alpha)};{' '}
                      exc {layoutMatch.exceedanceCount})
                    </span>
                  ) : null}
                </button>
              );
            })}
            <span
              data-section="chart-line-ewmsd-legend-total-points"
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

ChartLineEwmsd.displayName = 'ChartLineEwmsd';
