import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ZSCORE_WIDTH = 560;
export const DEFAULT_CHART_LINE_ZSCORE_HEIGHT = 360;
export const DEFAULT_CHART_LINE_ZSCORE_PADDING = 40;
export const DEFAULT_CHART_LINE_ZSCORE_GAP = 16;
export const DEFAULT_CHART_LINE_ZSCORE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ZSCORE_SUB_HEIGHT_RATIO = 0.4;
export const DEFAULT_CHART_LINE_ZSCORE_RAW_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_ZSCORE_ZSCORE_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_ZSCORE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ZSCORE_WINDOW = 20;
export const DEFAULT_CHART_LINE_ZSCORE_REFERENCE_LEVEL = 2;
export const DEFAULT_CHART_LINE_ZSCORE_PALETTE = [
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
export const DEFAULT_CHART_LINE_ZSCORE_REFERENCE_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_ZSCORE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ZSCORE_AXIS_COLOR = '#cbd5e1';

export type ChartLineZscoreBand = 'within' | 'beyond';

export interface ChartLineZscorePoint {
  x: number;
  y: number;
}

export interface ChartLineZscoreSeries {
  id: string;
  label: string;
  data: readonly ChartLineZscorePoint[];
  color?: string;
  window?: number;
}

export interface ChartLineZscoreStat {
  mean: number;
  std: number;
  z: number;
  windowSize: number;
}

export interface ChartLineZscoreSample {
  index: number;
  x: number;
  raw: number;
  mean: number;
  std: number;
  z: number;
  windowSize: number;
  band: ChartLineZscoreBand;
}

export interface ChartLineZscoreLayoutPoint extends ChartLineZscoreSample {
  px: number;
  rawPy: number;
  zPy: number;
}

export interface ChartLineZscoreLayoutSeries {
  id: string;
  label: string;
  color: string;
  window: number;
  referenceLevel: number;
  points: ChartLineZscoreLayoutPoint[];
  rawPath: string;
  zscorePath: string;
  finiteCount: number;
  totalCount: number;
  beyondCount: number;
  maxAbsZ: number;
  finalZ: number;
}

export interface ChartLineZscoreLayout {
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
  series: ChartLineZscoreLayoutSeries[];
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineZscoreLayoutOptions {
  series: readonly ChartLineZscoreSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  subHeightRatio?: number;
  window?: number;
  referenceLevel?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
}

export interface ChartLineZscoreProps {
  series: readonly ChartLineZscoreSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  window?: number;
  referenceLevel?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  subHeightRatio?: number;
  rawStrokeWidth?: number;
  zscoreStrokeWidth?: number;
  dotRadius?: number;
  referenceColor?: string;
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
  showRaw?: boolean;
  showZscore?: boolean;
  showZeroLine?: boolean;
  showReferenceLines?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatZscore?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  subLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineZscoreLayoutSeries;
    point: ChartLineZscoreLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineZscoreSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineZscoreDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_ZSCORE_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineZscoreFinitePoints(
  points: readonly ChartLineZscorePoint[] | null | undefined,
): ChartLineZscorePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineZscorePoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

/**
 * Clamp the rolling window length to an integer >= 2. Non-finite ->
 * default 20.
 */
export function normaliseLineZscoreWindow(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_ZSCORE_WINDOW;
  const v = Math.floor(value);
  if (v < 2) return 2;
  return v;
}

/**
 * Clamp the reference level (the +/- guide-line magnitude) to >= 0.
 * Non-finite -> default 2.
 */
export function normaliseLineZscoreReferenceLevel(value: unknown): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_CHART_LINE_ZSCORE_REFERENCE_LEVEL;
  }
  if (value < 0) return 0;
  return value;
}

export function normaliseLineZscoreSubHeightRatio(value: unknown): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_CHART_LINE_ZSCORE_SUB_HEIGHT_RATIO;
  }
  if (value < 0.1) return 0.1;
  if (value > 0.9) return 0.9;
  return value;
}

export function classifyLineZscoreBand(
  z: number,
  referenceLevel: number,
): ChartLineZscoreBand {
  if (!isFiniteNumber(z) || !isFiniteNumber(referenceLevel)) {
    return 'within';
  }
  return Math.abs(z) > referenceLevel ? 'beyond' : 'within';
}

/**
 * Compute the **rolling z-score** for each index.
 *
 * For index `t` the window is the trailing slice
 * `values[max(0, t - W + 1) .. t]` -- it expands from a single point
 * until it reaches the full window length `W`. Over that window:
 *
 *   mean = average of the window
 *   std  = population standard deviation of the window (divide by n)
 *   z_t  = (values[t] - mean) / std
 *
 * When `std = 0` (a constant window, including the single-point window
 * at index 0) the z-score is defined as 0 -- the value sits exactly on
 * the window mean, zero standard deviations away -- so the z-score is
 * a continuous signal with no gaps.
 *
 * Non-finite values are dropped; the output array matches the
 * finite-only length.
 */
export function computeRollingZScores(
  values: readonly number[] | null | undefined,
  window: number,
): ChartLineZscoreStat[] {
  if (!Array.isArray(values)) return [];
  const finite = values.filter((v): v is number => isFiniteNumber(v));
  const N = finite.length;
  if (N === 0) return [];
  const W = normaliseLineZscoreWindow(window);
  const out: ChartLineZscoreStat[] = [];
  for (let t = 0; t < N; t += 1) {
    const start = Math.max(0, t - W + 1);
    const n = t - start + 1;
    let sum = 0;
    for (let i = start; i <= t; i += 1) sum += finite[i]!;
    const mean = sum / n;
    let sq = 0;
    for (let i = start; i <= t; i += 1) {
      const d = finite[i]! - mean;
      sq += d * d;
    }
    const variance = sq / n;
    const std = Math.sqrt(Math.max(0, variance));
    const z = std > 0 ? (finite[t]! - mean) / std : 0;
    out.push({ mean, std, z, windowSize: n });
  }
  return out;
}

export interface RunLineZscoreOptions {
  window?: number;
  referenceLevel?: number;
}

export function runLineZscore(
  points: readonly ChartLineZscorePoint[] | null | undefined,
  options?: RunLineZscoreOptions,
): {
  samples: ChartLineZscoreSample[];
  window: number;
  referenceLevel: number;
  beyondCount: number;
  maxAbsZ: number;
  finalZ: number;
  totalSamples: number;
} {
  const window = normaliseLineZscoreWindow(options?.window);
  const referenceLevel = normaliseLineZscoreReferenceLevel(
    options?.referenceLevel,
  );
  const finite = getLineZscoreFinitePoints(points);
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const ys = sorted.map((p) => p.y);
  const stats = computeRollingZScores(ys, window);

  let beyondCount = 0;
  let maxAbsZ = 0;

  const samples: ChartLineZscoreSample[] = sorted.map((p, i) => {
    const stat = stats[i] ?? { mean: p.y, std: 0, z: 0, windowSize: 1 };
    const band = classifyLineZscoreBand(stat.z, referenceLevel);
    const absZ = Math.abs(stat.z);
    if (absZ > maxAbsZ) maxAbsZ = absZ;
    if (band === 'beyond') beyondCount += 1;
    return {
      index: i,
      x: p.x,
      raw: p.y,
      mean: stat.mean,
      std: stat.std,
      z: stat.z,
      windowSize: stat.windowSize,
      band,
    };
  });

  const last = samples[samples.length - 1];

  return {
    samples,
    window,
    referenceLevel,
    beyondCount,
    maxAbsZ,
    finalZ: last ? last.z : 0,
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

export function computeLineZscoreLayout(
  options: ComputeLineZscoreLayoutOptions,
): ChartLineZscoreLayout {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_ZSCORE_GAP,
    tickCount = DEFAULT_CHART_LINE_ZSCORE_TICK_COUNT,
    subHeightRatio,
    window,
    referenceLevel,
    defaultColors = DEFAULT_CHART_LINE_ZSCORE_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = normaliseLineZscoreSubHeightRatio(subHeightRatio);
  const usableHeight = Math.max(0, innerHeight - gap);
  const subHeight = usableHeight * ratio;
  const mainHeight = usableHeight - subHeight;
  const refLevel = normaliseLineZscoreReferenceLevel(referenceLevel);

  const empty: ChartLineZscoreLayout = {
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
  let zExtent = refLevel;
  let totalPoints = 0;

  const runBySeries = new Map<string, ReturnType<typeof runLineZscore>>();

  for (const s of visible) {
    const run = runLineZscore(s.data, {
      window: s.window ?? window,
      referenceLevel: refLevel,
    });
    runBySeries.set(s.id, run);
    totalPoints += run.samples.length;
    for (const sample of run.samples) {
      if (sample.x < xLo) xLo = sample.x;
      if (sample.x > xHi) xHi = sample.x;
      if (sample.raw < yLo) yLo = sample.raw;
      if (sample.raw > yHi) yHi = sample.raw;
    }
    if (run.maxAbsZ > zExtent) zExtent = run.maxAbsZ;
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
  if (zExtent <= 0) zExtent = 1;
  const subYMax = zExtent * 1.15;
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

  const layoutSeries: ChartLineZscoreLayoutSeries[] = visible.map((s, idx) => {
    const run = runBySeries.get(s.id)!;
    const color =
      s.color ??
      defaultColors[idx % defaultColors.length] ??
      DEFAULT_CHART_LINE_ZSCORE_PALETTE[0]!;

    const points: ChartLineZscoreLayoutPoint[] = run.samples.map((sample) => ({
      ...sample,
      px: projectX(sample.x),
      rawPy: projectMainY(sample.raw),
      zPy: projectSubY(sample.z),
    }));

    const rawPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.rawPy })),
    );
    const zscorePath = buildPath(
      points.map((p) => ({ px: p.px, py: p.zPy })),
    );

    return {
      id: s.id,
      label: s.label,
      color,
      window: run.window,
      referenceLevel: run.referenceLevel,
      points,
      rawPath,
      zscorePath,
      finiteCount: run.samples.length,
      totalCount: s.data?.length ?? 0,
      beyondCount: run.beyondCount,
      maxAbsZ: run.maxAbsZ,
      finalZ: run.finalZ,
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

function defaultFormatZscore(n: number): string {
  if (!isFiniteNumber(n)) return '';
  return n.toFixed(2);
}

export function describeLineZscoreChart(
  series: readonly ChartLineZscoreSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    window?: number;
    referenceLevel?: number;
    formatZscore?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const fmt = options?.formatZscore ?? defaultFormatZscore;

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const run = runLineZscore(s.data, {
      window: s.window ?? options?.window,
      referenceLevel: options?.referenceLevel,
    });
    totalPoints += run.samples.length;
    summaries.push(
      `${s.label}: window ${run.window}, max absolute z ${fmt(run.maxAbsZ)}, ${run.beyondCount} points beyond ${fmt(run.referenceLevel)} sigma`,
    );
  }
  return `Line chart with a rolling z-score panel across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineZscore = forwardRef<
  HTMLDivElement,
  ChartLineZscoreProps
>(function ChartLineZscore(
  props: ChartLineZscoreProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    window = DEFAULT_CHART_LINE_ZSCORE_WINDOW,
    referenceLevel = DEFAULT_CHART_LINE_ZSCORE_REFERENCE_LEVEL,
    width = DEFAULT_CHART_LINE_ZSCORE_WIDTH,
    height = DEFAULT_CHART_LINE_ZSCORE_HEIGHT,
    padding = DEFAULT_CHART_LINE_ZSCORE_PADDING,
    gap = DEFAULT_CHART_LINE_ZSCORE_GAP,
    tickCount = DEFAULT_CHART_LINE_ZSCORE_TICK_COUNT,
    subHeightRatio = DEFAULT_CHART_LINE_ZSCORE_SUB_HEIGHT_RATIO,
    rawStrokeWidth = DEFAULT_CHART_LINE_ZSCORE_RAW_STROKE_WIDTH,
    zscoreStrokeWidth = DEFAULT_CHART_LINE_ZSCORE_ZSCORE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ZSCORE_DOT_RADIUS,
    referenceColor = DEFAULT_CHART_LINE_ZSCORE_REFERENCE_COLOR,
    gridColor = DEFAULT_CHART_LINE_ZSCORE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ZSCORE_AXIS_COLOR,
    xMin,
    xMax,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showLegend = true,
    showTooltip = true,
    showConfigBadge = true,
    showRaw = true,
    showZscore = true,
    showZeroLine = true,
    showReferenceLines = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a rolling z-score panel',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    formatZscore = defaultFormatZscore,
    xLabel,
    yLabel,
    subLabel = 'z-score',
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
      computeLineZscoreLayout({
        series,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        gap,
        tickCount,
        subHeightRatio,
        window,
        referenceLevel,
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
      window,
      referenceLevel,
      xMin,
      xMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineZscoreChart(series, {
        hidden: hiddenSet,
        window,
        referenceLevel,
        formatZscore,
      }),
    [ariaDescription, series, hiddenSet, window, referenceLevel, formatZscore],
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
    (s: ChartLineZscoreSeries) => {
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
        (acc, s) => acc + getLineZscoreFinitePoints(s.data).length,
        0,
      ),
    [series],
  );

  const dominantConfig = useMemo<{
    window: number;
    referenceLevel: number;
    maxAbsZ: number;
    seriesId: string;
  }>(() => {
    if (layout.series.length === 0) {
      return {
        window: normaliseLineZscoreWindow(window),
        referenceLevel: normaliseLineZscoreReferenceLevel(referenceLevel),
        maxAbsZ: 0,
        seriesId: '',
      };
    }
    const s = layout.series[0]!;
    return {
      window: s.window,
      referenceLevel: s.referenceLevel,
      maxAbsZ: s.maxAbsZ,
      seriesId: s.id,
    };
  }, [layout.series, window, referenceLevel]);

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
        data-section="chart-line-zscore"
        data-empty="true"
        data-series-count={series.length}
        data-visible-series-count={0}
        data-total-points={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-zscore-aria-desc"
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
  const refLevel = dominantConfig.referenceLevel;
  const refUpperPy =
    layout.subPanel.y +
    layout.subPanel.height -
    ((refLevel - layout.subYMin) / (layout.subYMax - layout.subYMin)) *
      layout.subPanel.height;
  const refLowerPy =
    layout.subPanel.y +
    layout.subPanel.height -
    ((-refLevel - layout.subYMin) / (layout.subYMax - layout.subYMin)) *
      layout.subPanel.height;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-zscore"
      data-empty="false"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-window={dominantConfig.window}
      data-reference-level={dominantConfig.referenceLevel}
      data-max-abs-z={dominantConfig.maxAbsZ}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-zscore-aria-desc"
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
        data-section="chart-line-zscore-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-zscore-badge"
            data-window={dominantConfig.window}
            data-reference-level={dominantConfig.referenceLevel}
            data-max-abs-z={dominantConfig.maxAbsZ}
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
              data-section="chart-line-zscore-badge-icon"
              aria-hidden="true"
            >
              ZS
            </span>
            <span data-section="chart-line-zscore-badge-window">
              W={dominantConfig.window}
            </span>
            <span data-section="chart-line-zscore-badge-reference">
              ref={formatZscore(dominantConfig.referenceLevel)}
            </span>
            <span data-section="chart-line-zscore-badge-max-z">
              maxZ={formatZscore(dominantConfig.maxAbsZ)}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-zscore-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-zscore-grid"
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
                    data-section="chart-line-zscore-grid-line"
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
                  ((t - layout.subYMin) / (layout.subYMax - layout.subYMin)) *
                    layout.subPanel.height;
                return (
                  <line
                    key={`sgy-${i}`}
                    data-section="chart-line-zscore-grid-line"
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
              data-section="chart-line-zscore-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-zscore-axis"
                data-panel="main"
                data-axis="x"
                x1={layout.mainPanel.x}
                y1={layout.mainPanel.y + layout.mainPanel.height}
                x2={layout.mainPanel.x + layout.mainPanel.width}
                y2={layout.mainPanel.y + layout.mainPanel.height}
              />
              <line
                data-section="chart-line-zscore-axis"
                data-panel="main"
                data-axis="y"
                x1={layout.mainPanel.x}
                y1={layout.mainPanel.y}
                x2={layout.mainPanel.x}
                y2={layout.mainPanel.y + layout.mainPanel.height}
              />
              <line
                data-section="chart-line-zscore-axis"
                data-panel="sub"
                data-axis="x"
                x1={layout.subPanel.x}
                y1={layout.subPanel.y + layout.subPanel.height}
                x2={layout.subPanel.x + layout.subPanel.width}
                y2={layout.subPanel.y + layout.subPanel.height}
              />
              <line
                data-section="chart-line-zscore-axis"
                data-panel="sub"
                data-axis="y"
                x1={layout.subPanel.x}
                y1={layout.subPanel.y}
                x2={layout.subPanel.x}
                y2={layout.subPanel.y + layout.subPanel.height}
              />
              <g data-section="chart-line-zscore-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.mainPanel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.mainPanel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-zscore-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.subPanel.y + layout.subPanel.height}
                        y2={layout.subPanel.y + layout.subPanel.height + 4}
                      />
                      <text
                        data-section="chart-line-zscore-tick-label"
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
                data-section="chart-line-zscore-ticks"
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
                      data-section="chart-line-zscore-tick"
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
                        data-section="chart-line-zscore-tick-label"
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
                data-section="chart-line-zscore-ticks"
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
                      data-section="chart-line-zscore-tick"
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
                        data-section="chart-line-zscore-tick-label"
                        data-panel="sub"
                        data-axis="y"
                        x={layout.subPanel.x - 6}
                        y={py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatZscore(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              {xLabel ? (
                <text
                  data-section="chart-line-zscore-x-label"
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
                  data-section="chart-line-zscore-y-label"
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
                  data-section="chart-line-zscore-sub-label"
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

          {showZeroLine ? (
            <line
              data-section="chart-line-zscore-zero-line"
              x1={layout.subPanel.x}
              x2={layout.subPanel.x + layout.subPanel.width}
              y1={subZeroPy}
              y2={subZeroPy}
              stroke={axisColor}
              strokeWidth={1}
            />
          ) : null}

          {showReferenceLines && refLevel > 0 ? (
            <g data-section="chart-line-zscore-reference-lines">
              <line
                data-section="chart-line-zscore-reference-line"
                data-side="upper"
                x1={layout.subPanel.x}
                x2={layout.subPanel.x + layout.subPanel.width}
                y1={refUpperPy}
                y2={refUpperPy}
                stroke={referenceColor}
                strokeWidth={1}
                strokeDasharray="6 4"
                pointerEvents="none"
              />
              <line
                data-section="chart-line-zscore-reference-line"
                data-side="lower"
                x1={layout.subPanel.x}
                x2={layout.subPanel.x + layout.subPanel.width}
                y1={refLowerPy}
                y2={refLowerPy}
                stroke={referenceColor}
                strokeWidth={1}
                strokeDasharray="6 4"
                pointerEvents="none"
              />
            </g>
          ) : null}

          <g data-section="chart-line-zscore-series">
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-zscore-series-group"
                data-series-id={s.id}
                data-series-color={s.color}
                data-series-window={s.window}
                data-series-reference-level={s.referenceLevel}
                data-series-max-abs-z={s.maxAbsZ}
                data-series-final-z={s.finalZ}
                data-series-beyond-count={s.beyondCount}
                data-series-finite-count={s.finiteCount}
              >
                {showRaw && s.rawPath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} raw observations`}
                    data-section="chart-line-zscore-raw-path"
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
                {showZscore && s.zscorePath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} rolling z-score (window ${s.window})`}
                    data-section="chart-line-zscore-zscore-path"
                    data-series-id={s.id}
                    data-kind="zscore"
                    d={s.zscorePath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={zscoreStrokeWidth}
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
                          aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)}; raw ${formatValue(p.raw)}; z-score ${formatZscore(p.z)}`}
                          data-section="chart-line-zscore-dot"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-x={p.x}
                          data-raw={p.raw}
                          data-mean={p.mean}
                          data-std={p.std}
                          data-zscore={p.z}
                          data-window-size={p.windowSize}
                          data-band={p.band}
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
                  data-section="chart-line-zscore-tooltip"
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
                    data-section="chart-line-zscore-tooltip-label"
                    style={{ color: s.color, fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-zscore-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div data-section="chart-line-zscore-tooltip-raw">
                    raw: {formatValue(p.raw)}
                  </div>
                  <div data-section="chart-line-zscore-tooltip-mean">
                    window mean: {formatValue(p.mean)}
                  </div>
                  <div data-section="chart-line-zscore-tooltip-std">
                    window std: {formatValue(p.std)}
                  </div>
                  <div
                    data-section="chart-line-zscore-tooltip-zscore"
                    style={{ fontWeight: 600 }}
                  >
                    z-score: {formatZscore(p.z)}
                  </div>
                  <div
                    data-section="chart-line-zscore-tooltip-band"
                    style={{
                      color:
                        p.band === 'beyond' ? referenceColor : '#94a3b8',
                    }}
                  >
                    {p.band === 'beyond'
                      ? `beyond ${formatZscore(s.referenceLevel)} sigma`
                      : `within ${formatZscore(s.referenceLevel)} sigma`}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-zscore-legend"
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
              DEFAULT_CHART_LINE_ZSCORE_PALETTE[0]!;
            return (
              <button
                key={s.id}
                type="button"
                data-section="chart-line-zscore-legend-item"
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
                  data-section="chart-line-zscore-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: swatchColor,
                  }}
                />
                <span data-section="chart-line-zscore-legend-label">
                  {s.label}
                </span>
                {layoutMatch ? (
                  <span
                    data-section="chart-line-zscore-legend-stats"
                    style={{ fontSize: 10, color: '#64748b' }}
                  >
                    (W={layoutMatch.window};{' '}
                    maxZ {formatZscore(layoutMatch.maxAbsZ)})
                  </span>
                ) : null}
              </button>
            );
          })}
          <span
            data-section="chart-line-zscore-legend-total-points"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {allTotalPoints} total points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineZscore.displayName = 'ChartLineZscore';
