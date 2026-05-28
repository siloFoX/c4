import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_HAMPEL_WIDTH = 560;
export const DEFAULT_CHART_LINE_HAMPEL_HEIGHT = 320;
export const DEFAULT_CHART_LINE_HAMPEL_PADDING = 40;
export const DEFAULT_CHART_LINE_HAMPEL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HAMPEL_RAW_STROKE_WIDTH = 1;
export const DEFAULT_CHART_LINE_HAMPEL_FILTERED_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HAMPEL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HAMPEL_WINDOW = 7;
export const DEFAULT_CHART_LINE_HAMPEL_N_SIGMAS = 3;
// Standard normality-consistency scaling: 1 / (sqrt(2) * erfinv(0.5))
// approximately 1.4826 -- makes MAD an unbiased estimator of sigma for
// Gaussian noise.
export const DEFAULT_CHART_LINE_HAMPEL_MAD_SCALE = 1.4826;
export const DEFAULT_CHART_LINE_HAMPEL_RAW_OPACITY = 0.35;
export const DEFAULT_CHART_LINE_HAMPEL_OUTLIER_OPACITY = 0.95;
export const DEFAULT_CHART_LINE_HAMPEL_PALETTE = [
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
export const DEFAULT_CHART_LINE_HAMPEL_RAW_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_HAMPEL_OUTLIER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HAMPEL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_HAMPEL_AXIS_COLOR = '#cbd5e1';

export interface ChartLineHampelPoint {
  x: number;
  y: number;
}

export interface ChartLineHampelSeries {
  id: string;
  label: string;
  data: readonly ChartLineHampelPoint[];
  color?: string;
  windowLength?: number;
  nSigmas?: number;
  madScale?: number;
}

export interface ChartLineHampelSample {
  index: number;
  x: number;
  raw: number;
  filtered: number;
  windowMedian: number | null;
  windowMad: number | null;
  deviation: number | null;
  score: number | null;
  isOutlier: boolean;
}

export interface ChartLineHampelLayoutPoint extends ChartLineHampelSample {
  px: number;
  rawPy: number;
  filteredPy: number;
  windowMedianPy: number | null;
}

export interface ChartLineHampelLayoutSeries {
  id: string;
  label: string;
  color: string;
  outlierColor: string;
  windowLength: number;
  nSigmas: number;
  madScale: number;
  points: ChartLineHampelLayoutPoint[];
  rawPath: string;
  filteredPath: string;
  outliers: ChartLineHampelLayoutPoint[];
  finiteCount: number;
  totalCount: number;
  outlierCount: number;
  maxScore: number;
  rmseReplacement: number;
}

export interface ChartLineHampelLayout {
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
  series: ChartLineHampelLayoutSeries[];
  totalPoints: number;
  totalOutliers: number;
  visibleSeriesCount: number;
}

export interface ComputeLineHampelLayoutOptions {
  series: readonly ChartLineHampelSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  windowLength?: number;
  nSigmas?: number;
  madScale?: number;
  defaultColors?: readonly string[];
  outlierColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineHampelProps {
  series: readonly ChartLineHampelSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  windowLength?: number;
  nSigmas?: number;
  madScale?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  rawStrokeWidth?: number;
  filteredStrokeWidth?: number;
  dotRadius?: number;
  rawOpacity?: number;
  outlierOpacity?: number;
  rawColor?: string;
  outlierColor?: string;
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
  showOutlierBadge?: boolean;
  showRaw?: boolean;
  showOutlierMarkers?: boolean;
  showReplacementSticks?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatScore?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineHampelLayoutSeries;
    point: ChartLineHampelLayoutPoint;
  }) => void;
  onOutlierClick?: (payload: {
    series: ChartLineHampelLayoutSeries;
    point: ChartLineHampelLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineHampelSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineHampelDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_HAMPEL_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineHampelFinitePoints(
  points: readonly ChartLineHampelPoint[] | null | undefined,
): ChartLineHampelPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineHampelPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineHampelWindow(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_HAMPEL_WINDOW;
  let v = Math.floor(value);
  if (v < 3) v = 3;
  if (v % 2 === 0) v += 1; // window must be odd
  return v;
}

export function normaliseLineHampelNSigmas(value: unknown): number {
  if (!isFiniteNumber(value) || value < 0) {
    return DEFAULT_CHART_LINE_HAMPEL_N_SIGMAS;
  }
  return value;
}

export function normaliseLineHampelMadScale(value: unknown): number {
  if (!isFiniteNumber(value) || value <= 0) {
    return DEFAULT_CHART_LINE_HAMPEL_MAD_SCALE;
  }
  return value;
}

export function computeHampelMedian(
  values: readonly number[] | null | undefined,
): number {
  if (!Array.isArray(values) || values.length === 0) return Number.NaN;
  const finite: number[] = [];
  for (const v of values) {
    if (isFiniteNumber(v)) finite.push(v);
  }
  if (finite.length === 0) return Number.NaN;
  const sorted = [...finite].sort((a, b) => a - b);
  const n = sorted.length;
  if (n % 2 === 1) return sorted[(n - 1) / 2]!;
  return (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

export function computeHampelMad(
  values: readonly number[] | null | undefined,
  centerMedian?: number,
): number {
  if (!Array.isArray(values) || values.length === 0) return Number.NaN;
  const center = isFiniteNumber(centerMedian)
    ? centerMedian
    : computeHampelMedian(values);
  if (!isFiniteNumber(center)) return Number.NaN;
  const absDevs: number[] = [];
  for (const v of values) {
    if (isFiniteNumber(v)) absDevs.push(Math.abs(v - center));
  }
  return computeHampelMedian(absDevs);
}

export interface ApplyLineHampelOptions {
  windowLength?: number;
  nSigmas?: number;
  madScale?: number;
}

export interface ApplyLineHampelResult {
  filtered: number[];
  outlierIndices: number[];
  medians: (number | null)[];
  mads: (number | null)[];
  deviations: (number | null)[];
  scores: (number | null)[];
  windowLength: number;
  nSigmas: number;
  madScale: number;
}

export function applyLineHampel(
  values: readonly number[] | null | undefined,
  options?: ApplyLineHampelOptions,
): ApplyLineHampelResult {
  const W = normaliseLineHampelWindow(options?.windowLength);
  const n = normaliseLineHampelNSigmas(options?.nSigmas);
  const scale = normaliseLineHampelMadScale(options?.madScale);
  if (!Array.isArray(values)) {
    return {
      filtered: [],
      outlierIndices: [],
      medians: [],
      mads: [],
      deviations: [],
      scores: [],
      windowLength: W,
      nSigmas: n,
      madScale: scale,
    };
  }
  const N = values.length;
  const m = (W - 1) / 2;
  const filtered = new Array(N);
  const medians: (number | null)[] = new Array(N).fill(null);
  const mads: (number | null)[] = new Array(N).fill(null);
  const deviations: (number | null)[] = new Array(N).fill(null);
  const scores: (number | null)[] = new Array(N).fill(null);
  const outlierIndices: number[] = [];

  for (let i = 0; i < N; i += 1) {
    const v = values[i];
    if (!isFiniteNumber(v)) {
      filtered[i] = Number.NaN;
      continue;
    }
    // Construct the centered window, clamped to the array bounds (so edge
    // points still get a filter pass instead of being skipped). For
    // edge windows, the effective length is shorter than W.
    const lo = Math.max(0, i - m);
    const hi = Math.min(N - 1, i + m);
    const win: number[] = [];
    for (let j = lo; j <= hi; j += 1) {
      const wv = values[j];
      if (isFiniteNumber(wv)) win.push(wv);
    }
    if (win.length === 0) {
      filtered[i] = v;
      continue;
    }
    const med = computeHampelMedian(win);
    const mad = computeHampelMad(win, med);
    const dev = v - med;
    const threshold = n * scale * mad;
    const score =
      isFiniteNumber(mad) && mad > 0
        ? Math.abs(dev) / (scale * mad)
        : Math.abs(dev) === 0
          ? 0
          : Number.POSITIVE_INFINITY;
    medians[i] = med;
    mads[i] = mad;
    deviations[i] = dev;
    scores[i] = isFiniteNumber(score) ? score : Number.POSITIVE_INFINITY;
    const isOut =
      isFiniteNumber(mad) && mad > 0
        ? Math.abs(dev) > threshold
        : Math.abs(dev) > 0;
    if (isOut) {
      filtered[i] = med;
      outlierIndices.push(i);
    } else {
      filtered[i] = v;
    }
  }

  return {
    filtered,
    outlierIndices,
    medians,
    mads,
    deviations,
    scores,
    windowLength: W,
    nSigmas: n,
    madScale: scale,
  };
}

export interface RunLineHampelOptions extends ApplyLineHampelOptions {}

export function runLineHampel(
  points: readonly ChartLineHampelPoint[] | null | undefined,
  options?: RunLineHampelOptions,
): {
  samples: ChartLineHampelSample[];
  windowLength: number;
  nSigmas: number;
  madScale: number;
  outlierCount: number;
} {
  const finite = getLineHampelFinitePoints(points);
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const ys = sorted.map((p) => p.y);
  const result = applyLineHampel(ys, options);
  const samples: ChartLineHampelSample[] = sorted.map((p, i) => {
    const isOut = result.outlierIndices.includes(i);
    return {
      index: i,
      x: p.x,
      raw: p.y,
      filtered: result.filtered[i] ?? p.y,
      windowMedian: result.medians[i] ?? null,
      windowMad: result.mads[i] ?? null,
      deviation: result.deviations[i] ?? null,
      score: result.scores[i] ?? null,
      isOutlier: isOut,
    };
  });
  return {
    samples,
    windowLength: result.windowLength,
    nSigmas: result.nSigmas,
    madScale: result.madScale,
    outlierCount: result.outlierIndices.length,
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

export function computeLineHampelLayout(
  options: ComputeLineHampelLayoutOptions,
): ChartLineHampelLayout {
  const {
    series = [],
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_HAMPEL_TICK_COUNT,
    windowLength,
    nSigmas,
    madScale,
    defaultColors = DEFAULT_CHART_LINE_HAMPEL_PALETTE,
    outlierColor = DEFAULT_CHART_LINE_HAMPEL_OUTLIER_COLOR,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ChartLineHampelLayout = {
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
    totalOutliers: 0,
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
  let totalOutliers = 0;

  const runBySeries = new Map<
    string,
    ReturnType<typeof runLineHampel>
  >();

  for (const s of visible) {
    const run = runLineHampel(s.data, {
      windowLength: s.windowLength ?? windowLength,
      nSigmas: s.nSigmas ?? nSigmas,
      madScale: s.madScale ?? madScale,
    });
    runBySeries.set(s.id, run);
    totalPoints += run.samples.length;
    totalOutliers += run.outlierCount;
    for (const sample of run.samples) {
      if (sample.x < xLo) xLo = sample.x;
      if (sample.x > xHi) xHi = sample.x;
      if (sample.raw < yLo) yLo = sample.raw;
      if (sample.raw > yHi) yHi = sample.raw;
      if (sample.filtered < yLo) yLo = sample.filtered;
      if (sample.filtered > yHi) yHi = sample.filtered;
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

  const layoutSeries: ChartLineHampelLayoutSeries[] = visible.map((s, idx) => {
    const run = runBySeries.get(s.id)!;
    const color =
      s.color ?? defaultColors[idx % defaultColors.length] ?? DEFAULT_CHART_LINE_HAMPEL_PALETTE[0]!;

    let maxScore = 0;
    let sumSqRep = 0;
    let repCount = 0;

    const points: ChartLineHampelLayoutPoint[] = run.samples.map((sample) => {
      // Track Infinity too -- when MAD=0 (constant baseline) outlier
      // points get score=Infinity, which is the strongest possible signal
      // and should still register as the max.
      if (sample.score !== null && sample.score > maxScore) {
        maxScore = sample.score;
      }
      if (sample.isOutlier) {
        const d = sample.raw - sample.filtered;
        sumSqRep += d * d;
        repCount += 1;
      }
      return {
        ...sample,
        px: projectX(sample.x),
        rawPy: projectY(sample.raw),
        filteredPy: projectY(sample.filtered),
        windowMedianPy:
          sample.windowMedian !== null && isFiniteNumber(sample.windowMedian)
            ? projectY(sample.windowMedian)
            : null,
      };
    });

    const rawPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.rawPy })),
    );
    const filteredPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.filteredPy })),
    );
    const outliers = points.filter((p) => p.isOutlier);
    const rmse = repCount > 0 ? Math.sqrt(sumSqRep / repCount) : 0;

    return {
      id: s.id,
      label: s.label,
      color,
      outlierColor,
      windowLength: run.windowLength,
      nSigmas: run.nSigmas,
      madScale: run.madScale,
      points,
      rawPath,
      filteredPath,
      outliers,
      finiteCount: run.samples.length,
      totalCount: s.data?.length ?? 0,
      outlierCount: run.outlierCount,
      maxScore,
      rmseReplacement: rmse,
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
    totalOutliers,
    visibleSeriesCount: visible.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function defaultFormatScore(n: number): string {
  if (!isFiniteNumber(n)) return '';
  return n.toFixed(2);
}

export function describeLineHampelChart(
  series: readonly ChartLineHampelSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    windowLength?: number;
    nSigmas?: number;
    madScale?: number;
    formatScore?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const fmtScore = options?.formatScore ?? defaultFormatScore;

  let totalOutliers = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const run = runLineHampel(s.data, {
      windowLength: s.windowLength ?? options?.windowLength,
      nSigmas: s.nSigmas ?? options?.nSigmas,
      madScale: s.madScale ?? options?.madScale,
    });
    totalOutliers += run.outlierCount;
    summaries.push(
      `${s.label}: window ${run.windowLength}, ${fmtScore(run.nSigmas)} sigma threshold, ${run.outlierCount} outlier${run.outlierCount === 1 ? '' : 's'}`,
    );
  }
  return `Line chart with Hampel median+MAD outlier filter across ${visible.length} series (${totalOutliers} total outliers). ${summaries.join('; ')}.`;
}

export const ChartLineHampel = forwardRef<HTMLDivElement, ChartLineHampelProps>(
  function ChartLineHampel(
    props: ChartLineHampelProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      series,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      windowLength = DEFAULT_CHART_LINE_HAMPEL_WINDOW,
      nSigmas = DEFAULT_CHART_LINE_HAMPEL_N_SIGMAS,
      madScale = DEFAULT_CHART_LINE_HAMPEL_MAD_SCALE,
      width = DEFAULT_CHART_LINE_HAMPEL_WIDTH,
      height = DEFAULT_CHART_LINE_HAMPEL_HEIGHT,
      padding = DEFAULT_CHART_LINE_HAMPEL_PADDING,
      tickCount = DEFAULT_CHART_LINE_HAMPEL_TICK_COUNT,
      rawStrokeWidth = DEFAULT_CHART_LINE_HAMPEL_RAW_STROKE_WIDTH,
      filteredStrokeWidth = DEFAULT_CHART_LINE_HAMPEL_FILTERED_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_HAMPEL_DOT_RADIUS,
      rawOpacity = DEFAULT_CHART_LINE_HAMPEL_RAW_OPACITY,
      outlierOpacity = DEFAULT_CHART_LINE_HAMPEL_OUTLIER_OPACITY,
      rawColor = DEFAULT_CHART_LINE_HAMPEL_RAW_COLOR,
      outlierColor = DEFAULT_CHART_LINE_HAMPEL_OUTLIER_COLOR,
      gridColor = DEFAULT_CHART_LINE_HAMPEL_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_HAMPEL_AXIS_COLOR,
      xMin,
      xMax,
      yMin,
      yMax,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showLegend = true,
      showTooltip = true,
      showOutlierBadge = true,
      showRaw = true,
      showOutlierMarkers = true,
      showReplacementSticks = false,
      animate = true,
      className,
      ariaLabel = 'Line chart with Hampel median + MAD outlier filter',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      formatScore = defaultFormatScore,
      xLabel,
      yLabel,
      onPointClick,
      onOutlierClick,
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
        computeLineHampelLayout({
          series,
          hiddenSeries: hiddenSet,
          width,
          height,
          padding,
          tickCount,
          windowLength,
          nSigmas,
          madScale,
          outlierColor,
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
        nSigmas,
        madScale,
        outlierColor,
        xMin,
        xMax,
        yMin,
        yMax,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineHampelChart(series, {
          hidden: hiddenSet,
          windowLength,
          nSigmas,
          madScale,
          formatScore,
        }),
      [ariaDescription, series, hiddenSet, windowLength, nSigmas, madScale, formatScore],
    );

    const [hoverPayload, setHoverPayload] = useState<{
      seriesId: string;
      pointIndex: number;
      kind: 'point' | 'outlier';
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
      (s: ChartLineHampelSeries) => {
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
          (acc, s) => acc + getLineHampelFinitePoints(s.data).length,
          0,
        ),
      [series],
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
          data-section="chart-line-hampel"
          data-empty="true"
          data-series-count={series.length}
          data-visible-series-count={0}
          data-total-points={0}
          data-total-outliers={0}
          data-window-length={normaliseLineHampelWindow(windowLength)}
          data-n-sigmas={normaliseLineHampelNSigmas(nSigmas)}
          data-mad-scale={normaliseLineHampelMadScale(madScale)}
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-hampel-aria-desc"
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
        data-section="chart-line-hampel"
        data-empty="false"
        data-series-count={series.length}
        data-visible-series-count={layout.visibleSeriesCount}
        data-total-points={layout.totalPoints}
        data-total-outliers={layout.totalOutliers}
        data-window-length={normaliseLineHampelWindow(windowLength)}
        data-n-sigmas={normaliseLineHampelNSigmas(nSigmas)}
        data-mad-scale={normaliseLineHampelMadScale(madScale)}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-hampel-aria-desc"
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
          data-section="chart-line-hampel-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showOutlierBadge ? (
            <div
              data-section="chart-line-hampel-badge"
              data-outlier-count={layout.totalOutliers}
              data-window-length={normaliseLineHampelWindow(windowLength)}
              data-n-sigmas={normaliseLineHampelNSigmas(nSigmas)}
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                padding: '2px 6px',
                borderRadius: 4,
                background: '#ffffffd9',
                color: outlierColor,
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                gap: 4,
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <span
                data-section="chart-line-hampel-badge-icon"
                aria-hidden="true"
              >
                X
              </span>
              <span data-section="chart-line-hampel-badge-count">
                {layout.totalOutliers}
              </span>
              <span data-section="chart-line-hampel-badge-label">
                outlier{layout.totalOutliers === 1 ? '' : 's'}
              </span>
              <span data-section="chart-line-hampel-badge-config">
                (W={normaliseLineHampelWindow(windowLength)};{' '}
                {formatScore(normaliseLineHampelNSigmas(nSigmas))} sigma)
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-hampel-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-hampel-grid"
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
                      data-section="chart-line-hampel-grid-line"
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
                      data-section="chart-line-hampel-grid-line"
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
                data-section="chart-line-hampel-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-hampel-axis"
                  data-axis="x"
                  x1={layout.panel.x}
                  y1={layout.panel.y + layout.panel.height}
                  x2={layout.panel.x + layout.panel.width}
                  y2={layout.panel.y + layout.panel.height}
                />
                <line
                  data-section="chart-line-hampel-axis"
                  data-axis="y"
                  x1={layout.panel.x}
                  y1={layout.panel.y}
                  x2={layout.panel.x}
                  y2={layout.panel.y + layout.panel.height}
                />
                <g data-section="chart-line-hampel-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => {
                    const px =
                      layout.panel.x +
                      ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                        layout.panel.width;
                    return (
                      <g
                        key={`tx-${i}`}
                        data-section="chart-line-hampel-tick"
                        data-axis="x"
                      >
                        <line
                          x1={px}
                          x2={px}
                          y1={layout.panel.y + layout.panel.height}
                          y2={layout.panel.y + layout.panel.height + 4}
                        />
                        <text
                          data-section="chart-line-hampel-tick-label"
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
                <g data-section="chart-line-hampel-ticks" data-axis="y">
                  {layout.yTicks.map((t, i) => {
                    const py =
                      layout.panel.y +
                      layout.panel.height -
                      ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                        layout.panel.height;
                    return (
                      <g
                        key={`ty-${i}`}
                        data-section="chart-line-hampel-tick"
                        data-axis="y"
                      >
                        <line
                          x1={layout.panel.x - 4}
                          x2={layout.panel.x}
                          y1={py}
                          y2={py}
                        />
                        <text
                          data-section="chart-line-hampel-tick-label"
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
                    data-section="chart-line-hampel-x-label"
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
                    data-section="chart-line-hampel-y-label"
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

            <g data-section="chart-line-hampel-series">
              {layout.series.map((s) => (
                <g
                  key={s.id}
                  data-section="chart-line-hampel-series-group"
                  data-series-id={s.id}
                  data-series-color={s.color}
                  data-series-window-length={s.windowLength}
                  data-series-n-sigmas={s.nSigmas}
                  data-series-mad-scale={s.madScale}
                  data-series-finite-count={s.finiteCount}
                  data-series-outlier-count={s.outlierCount}
                  data-series-max-score={s.maxScore}
                  data-series-rmse-replacement={s.rmseReplacement}
                >
                  {showReplacementSticks
                    ? s.outliers.map((p) => (
                        <line
                          key={`r-${p.index}`}
                          data-section="chart-line-hampel-replacement-stick"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          x1={p.px}
                          x2={p.px}
                          y1={p.rawPy}
                          y2={p.filteredPy}
                          stroke={outlierColor}
                          strokeWidth={1}
                          strokeOpacity={0.6}
                          pointerEvents="none"
                        />
                      ))
                    : null}
                  {showRaw && s.rawPath ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} raw observations`}
                      data-section="chart-line-hampel-raw-path"
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
                  {s.filteredPath ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} Hampel filtered (window ${s.windowLength}, ${s.nSigmas} sigma)`}
                      data-section="chart-line-hampel-filtered-path"
                      data-series-id={s.id}
                      data-kind="filtered"
                      d={s.filteredPath}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={filteredStrokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {showDots
                    ? s.points.map((p) => {
                        const isHover =
                          hoverPayload?.seriesId === s.id &&
                          hoverPayload?.pointIndex === p.index &&
                          hoverPayload?.kind === 'point';
                        return (
                          <circle
                            key={`d-${p.index}`}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)}; raw ${formatValue(p.raw)}; filtered ${formatValue(p.filtered)}${p.isOutlier ? '; OUTLIER replaced with median' : ''}`}
                            data-section="chart-line-hampel-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-raw={p.raw}
                            data-filtered={p.filtered}
                            data-window-median={p.windowMedian ?? ''}
                            data-window-mad={p.windowMad ?? ''}
                            data-deviation={p.deviation ?? ''}
                            data-score={p.score ?? ''}
                            data-outlier={p.isOutlier ? 'true' : 'false'}
                            data-hovered={isHover ? 'true' : 'false'}
                            cx={p.px}
                            cy={p.filteredPy}
                            r={isHover ? dotRadius + 1 : dotRadius}
                            fill={p.isOutlier ? outlierColor : s.color}
                            stroke="#ffffff"
                            strokeWidth={1}
                            onMouseEnter={() => {
                              setHoverPayload({
                                kind: 'point',
                                seriesId: s.id,
                                pointIndex: p.index,
                              });
                              setTooltipPos({ px: p.px, py: p.filteredPy });
                            }}
                            onMouseLeave={clearHover}
                            onFocus={() => {
                              setHoverPayload({
                                kind: 'point',
                                seriesId: s.id,
                                pointIndex: p.index,
                              });
                              setTooltipPos({ px: p.px, py: p.filteredPy });
                            }}
                            onBlur={clearHover}
                            onClick={() =>
                              onPointClick?.({ series: s, point: p })
                            }
                          />
                        );
                      })
                    : null}
                  {showOutlierMarkers
                    ? s.outliers.map((p) => {
                        const isHover =
                          hoverPayload?.seriesId === s.id &&
                          hoverPayload?.pointIndex === p.index &&
                          hoverPayload?.kind === 'outlier';
                        const r = isHover ? dotRadius + 2 : dotRadius + 1;
                        return (
                          <g
                            key={`o-${p.index}`}
                            data-section="chart-line-hampel-outlier-marker"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-raw={p.raw}
                            data-filtered={p.filtered}
                            data-deviation={p.deviation ?? ''}
                            data-score={p.score ?? ''}
                            data-hovered={isHover ? 'true' : 'false'}
                          >
                            <circle
                              role="graphics-symbol"
                              tabIndex={0}
                              aria-label={`${s.label} outlier at index ${p.index + 1} (x ${formatX(p.x)}) raw ${formatValue(p.raw)} median ${formatValue(p.windowMedian ?? 0)} score ${formatScore(p.score ?? 0)}`}
                              data-section="chart-line-hampel-outlier-dot"
                              data-series-id={s.id}
                              data-point-index={p.index}
                              cx={p.px}
                              cy={p.rawPy}
                              r={r}
                              fill="none"
                              stroke={outlierColor}
                              strokeWidth={2}
                              strokeOpacity={outlierOpacity}
                              onMouseEnter={() => {
                                setHoverPayload({
                                  kind: 'outlier',
                                  seriesId: s.id,
                                  pointIndex: p.index,
                                });
                                setTooltipPos({ px: p.px, py: p.rawPy });
                              }}
                              onMouseLeave={clearHover}
                              onFocus={() => {
                                setHoverPayload({
                                  kind: 'outlier',
                                  seriesId: s.id,
                                  pointIndex: p.index,
                                });
                                setTooltipPos({ px: p.px, py: p.rawPy });
                              }}
                              onBlur={clearHover}
                              onClick={() =>
                                onOutlierClick?.({ series: s, point: p })
                              }
                            />
                            <line
                              data-section="chart-line-hampel-outlier-cross"
                              data-axis="diag-1"
                              x1={p.px - r * 0.7}
                              x2={p.px + r * 0.7}
                              y1={p.rawPy - r * 0.7}
                              y2={p.rawPy + r * 0.7}
                              stroke={outlierColor}
                              strokeWidth={1.5}
                              strokeOpacity={outlierOpacity}
                              pointerEvents="none"
                            />
                            <line
                              data-section="chart-line-hampel-outlier-cross"
                              data-axis="diag-2"
                              x1={p.px - r * 0.7}
                              x2={p.px + r * 0.7}
                              y1={p.rawPy + r * 0.7}
                              y2={p.rawPy - r * 0.7}
                              stroke={outlierColor}
                              strokeWidth={1.5}
                              strokeOpacity={outlierOpacity}
                              pointerEvents="none"
                            />
                          </g>
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
                return (
                  <div
                    data-section="chart-line-hampel-tooltip"
                    data-series-id={s.id}
                    data-point-index={p.index}
                    data-outlier={p.isOutlier ? 'true' : 'false'}
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
                      data-section="chart-line-hampel-tooltip-label"
                      style={{
                        color: p.isOutlier ? outlierColor : s.color,
                        fontWeight: 600,
                      }}
                    >
                      {s.label}
                      {p.isOutlier ? ' OUTLIER' : ''}
                    </div>
                    <div data-section="chart-line-hampel-tooltip-x">
                      x: {formatX(p.x)}
                    </div>
                    <div data-section="chart-line-hampel-tooltip-raw">
                      raw: {formatValue(p.raw)}
                    </div>
                    <div
                      data-section="chart-line-hampel-tooltip-filtered"
                      style={{ fontWeight: 600 }}
                    >
                      filtered: {formatValue(p.filtered)}
                    </div>
                    <div data-section="chart-line-hampel-tooltip-median">
                      window median:{' '}
                      {p.windowMedian === null
                        ? 'n/a'
                        : formatValue(p.windowMedian)}
                    </div>
                    <div data-section="chart-line-hampel-tooltip-mad">
                      window MAD:{' '}
                      {p.windowMad === null ? 'n/a' : formatValue(p.windowMad)}
                    </div>
                    <div data-section="chart-line-hampel-tooltip-score">
                      score:{' '}
                      {p.score === null ? 'n/a' : formatScore(p.score)} sigma
                    </div>
                    <div data-section="chart-line-hampel-tooltip-config">
                      W={s.windowLength}, n={formatScore(s.nSigmas)}, c=
                      {formatScore(s.madScale)}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-hampel-legend"
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
                DEFAULT_CHART_LINE_HAMPEL_PALETTE[0]!;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-section="chart-line-hampel-legend-item"
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
                    data-section="chart-line-hampel-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: swatchColor,
                    }}
                  />
                  <span data-section="chart-line-hampel-legend-label">
                    {s.label}
                  </span>
                  {layoutMatch ? (
                    <span
                      data-section="chart-line-hampel-legend-stats"
                      style={{ fontSize: 10, color: '#64748b' }}
                    >
                      ({layoutMatch.outlierCount} outliers;{' '}
                      max {formatScore(layoutMatch.maxScore)} sigma)
                    </span>
                  ) : null}
                </button>
              );
            })}
            <span
              data-section="chart-line-hampel-legend-total-points"
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

ChartLineHampel.displayName = 'ChartLineHampel';
