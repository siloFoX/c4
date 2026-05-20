import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CHANGEPOINT_WIDTH = 560;
export const DEFAULT_CHART_LINE_CHANGEPOINT_HEIGHT = 320;
export const DEFAULT_CHART_LINE_CHANGEPOINT_PADDING = 40;
export const DEFAULT_CHART_LINE_CHANGEPOINT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CHANGEPOINT_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_CHANGEPOINT_MARKER_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_CHANGEPOINT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CHANGEPOINT_MIN_SEGMENT = 5;
export const DEFAULT_CHART_LINE_CHANGEPOINT_THRESHOLD = 0.5;
export const DEFAULT_CHART_LINE_CHANGEPOINT_SUPPRESSION_WINDOW = 3;
export const DEFAULT_CHART_LINE_CHANGEPOINT_VARIANCE_FLOOR = 1e-9;
export const DEFAULT_CHART_LINE_CHANGEPOINT_MARKER_DASH = '4 3';
export const DEFAULT_CHART_LINE_CHANGEPOINT_SEGMENT_OPACITY = 0.06;
export const DEFAULT_CHART_LINE_CHANGEPOINT_PALETTE = [
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
export const DEFAULT_CHART_LINE_CHANGEPOINT_MARKER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CHANGEPOINT_SEGMENT_COLORS = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#9333ea',
  '#0891b2',
  '#db2777',
];
export const DEFAULT_CHART_LINE_CHANGEPOINT_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CHANGEPOINT_AXIS_COLOR = '#cbd5e1';

export interface ChartLineChangepointPoint {
  x: number;
  y: number;
}

export interface ChartLineChangepointSeries {
  id: string;
  label: string;
  data: readonly ChartLineChangepointPoint[];
  color?: string;
  minSegment?: number;
  threshold?: number;
  suppressionWindow?: number;
}

export interface ChartLineChangepointDetection {
  index: number;
  x: number;
  leftMean: number;
  rightMean: number;
  leftVariance: number;
  rightVariance: number;
  score: number;
  meanShift: number;
}

export interface ChartLineChangepointSegment {
  startIndex: number;
  endIndex: number;
  startX: number;
  endX: number;
  count: number;
  mean: number;
  variance: number;
  stdDev: number;
}

export interface ChartLineChangepointSample {
  index: number;
  x: number;
  y: number;
  segmentIndex: number;
}

export interface ChartLineChangepointAnalysisResult {
  ok: boolean;
  samples: ChartLineChangepointSample[];
  scores: (number | null)[];
  detections: ChartLineChangepointDetection[];
  segments: ChartLineChangepointSegment[];
  minSegment: number;
  threshold: number;
  suppressionWindow: number;
}

export interface ChartLineChangepointLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  segmentIndex: number;
  segmentColor: string;
}

export interface ChartLineChangepointLayoutDetection
  extends ChartLineChangepointDetection {
  px: number;
  topPy: number;
  bottomPy: number;
}

export interface ChartLineChangepointLayoutSegment
  extends ChartLineChangepointSegment {
  px0: number;
  px1: number;
  color: string;
  meanPy: number | null;
}

export interface ChartLineChangepointLayoutSeries {
  id: string;
  label: string;
  color: string;
  minSegment: number;
  threshold: number;
  suppressionWindow: number;
  points: ChartLineChangepointLayoutPoint[];
  path: string;
  detections: ChartLineChangepointLayoutDetection[];
  segments: ChartLineChangepointLayoutSegment[];
  finiteCount: number;
  totalCount: number;
}

export interface ChartLineChangepointLayout {
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
  series: ChartLineChangepointLayoutSeries[];
  totalPoints: number;
  totalDetections: number;
  visibleSeriesCount: number;
}

export interface ComputeLineChangepointLayoutOptions {
  series: readonly ChartLineChangepointSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  minSegment?: number;
  threshold?: number;
  suppressionWindow?: number;
  defaultColors?: readonly string[];
  segmentColors?: readonly string[];
  markerColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineChangepointProps {
  series: readonly ChartLineChangepointSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  minSegment?: number;
  threshold?: number;
  suppressionWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  markerStrokeWidth?: number;
  dotRadius?: number;
  markerDashArray?: string;
  segmentOpacity?: number;
  markerColor?: string;
  segmentColors?: readonly string[];
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
  showCountBadge?: boolean;
  showMarkers?: boolean;
  showSegmentShading?: boolean;
  showSegmentMeans?: boolean;
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
    series: ChartLineChangepointLayoutSeries;
    point: ChartLineChangepointLayoutPoint;
  }) => void;
  onMarkerClick?: (payload: {
    series: ChartLineChangepointLayoutSeries;
    detection: ChartLineChangepointLayoutDetection;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineChangepointSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineChangepointDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_CHANGEPOINT_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineChangepointSegmentColor(
  index: number,
  palette: readonly string[] = DEFAULT_CHART_LINE_CHANGEPOINT_SEGMENT_COLORS,
): string {
  if (palette.length === 0) {
    return DEFAULT_CHART_LINE_CHANGEPOINT_SEGMENT_COLORS[0]!;
  }
  if (!isFiniteNumber(index) || index < 0) return palette[0]!;
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineChangepointFinitePoints(
  points: readonly ChartLineChangepointPoint[] | null | undefined,
): ChartLineChangepointPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineChangepointPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineChangepointMinSegment(value: unknown): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_CHART_LINE_CHANGEPOINT_MIN_SEGMENT;
  }
  if (value < 2) return 2;
  return Math.floor(value);
}

export function normaliseLineChangepointThreshold(value: unknown): number {
  if (!isFiniteNumber(value) || value < 0) {
    return DEFAULT_CHART_LINE_CHANGEPOINT_THRESHOLD;
  }
  return value;
}

export function normaliseLineChangepointSuppressionWindow(
  value: unknown,
): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_CHART_LINE_CHANGEPOINT_SUPPRESSION_WINDOW;
  }
  if (value < 1) return 1;
  return Math.floor(value);
}

function computeSegmentStats(
  values: readonly number[],
  start: number,
  end: number,
): { mean: number; variance: number; count: number } {
  let sum = 0;
  let count = 0;
  for (let i = start; i < end; i += 1) {
    const v = values[i];
    if (isFiniteNumber(v)) {
      sum += v;
      count += 1;
    }
  }
  if (count === 0) return { mean: 0, variance: 0, count: 0 };
  const mean = sum / count;
  let sse = 0;
  for (let i = start; i < end; i += 1) {
    const v = values[i];
    if (isFiniteNumber(v)) {
      const d = v - mean;
      sse += d * d;
    }
  }
  return { mean, variance: sse / count, count };
}

export function computeLineChangepointScores(
  values: readonly number[] | null | undefined,
  options?: { minSegment?: number },
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const N = values.length;
  const minSeg = normaliseLineChangepointMinSegment(options?.minSegment);
  const out: (number | null)[] = new Array(N).fill(null);
  if (N < minSeg * 2) return out;
  const floor = DEFAULT_CHART_LINE_CHANGEPOINT_VARIANCE_FLOOR;
  for (let i = minSeg; i <= N - minSeg; i += 1) {
    const left = computeSegmentStats(values, 0, i);
    const right = computeSegmentStats(values, i, N);
    if (left.count === 0 || right.count === 0) continue;
    const varL = Math.max(floor, left.variance);
    const varR = Math.max(floor, right.variance);
    const score = Math.abs(Math.log(varR / varL));
    out[i] = score;
  }
  return out;
}

export function detectLineChangepoints(
  points: readonly ChartLineChangepointPoint[] | null | undefined,
  options?: {
    minSegment?: number;
    threshold?: number;
    suppressionWindow?: number;
  },
): ChartLineChangepointAnalysisResult {
  const minSeg = normaliseLineChangepointMinSegment(options?.minSegment);
  const threshold = normaliseLineChangepointThreshold(options?.threshold);
  const supW = normaliseLineChangepointSuppressionWindow(
    options?.suppressionWindow,
  );

  const finite = getLineChangepointFinitePoints(points);
  if (finite.length === 0) {
    return {
      ok: false,
      samples: [],
      scores: [],
      detections: [],
      segments: [],
      minSegment: minSeg,
      threshold,
      suppressionWindow: supW,
    };
  }
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const N = sorted.length;
  const ys = sorted.map((p) => p.y);

  const scores = computeLineChangepointScores(ys, { minSegment: minSeg });

  // Candidate change points: indices where score >= threshold.
  const candidates: { index: number; score: number }[] = [];
  for (let i = 0; i < N; i += 1) {
    const s = scores[i];
    if (s !== null && s !== undefined && s >= threshold) {
      candidates.push({ index: i, score: s });
    }
  }
  // Non-maximum suppression: walk candidates sorted by descending score,
  // keep one only if no already-kept detection is within supW indices.
  const sortedCandidates = [...candidates].sort((a, b) => b.score - a.score);
  const keptIndices = new Set<number>();
  const keptSorted: { index: number; score: number }[] = [];
  for (const c of sortedCandidates) {
    let conflict = false;
    for (const k of keptIndices) {
      if (Math.abs(c.index - k) <= supW) {
        conflict = true;
        break;
      }
    }
    if (!conflict) {
      keptIndices.add(c.index);
      keptSorted.push(c);
    }
  }
  // Re-sort kept detections by ascending index for downstream segment
  // construction.
  keptSorted.sort((a, b) => a.index - b.index);

  const detections: ChartLineChangepointDetection[] = keptSorted.map(
    ({ index, score }) => {
      const left = computeSegmentStats(ys, 0, index);
      const right = computeSegmentStats(ys, index, N);
      return {
        index,
        x: sorted[index]!.x,
        leftMean: left.mean,
        rightMean: right.mean,
        leftVariance: left.variance,
        rightVariance: right.variance,
        score,
        meanShift: right.mean - left.mean,
      };
    },
  );

  // Build segments between consecutive change points. The change point
  // index marks the FIRST sample of the new segment.
  const cutPoints = [0, ...detections.map((d) => d.index), N];
  const segments: ChartLineChangepointSegment[] = [];
  const segmentForIndex = new Array(N).fill(0);
  for (let s = 0; s + 1 < cutPoints.length; s += 1) {
    const startIdx = cutPoints[s]!;
    const endIdx = cutPoints[s + 1]!;
    if (endIdx <= startIdx) continue;
    const stats = computeSegmentStats(ys, startIdx, endIdx);
    const sd = Math.sqrt(Math.max(0, stats.variance));
    segments.push({
      startIndex: startIdx,
      endIndex: endIdx - 1,
      startX: sorted[startIdx]!.x,
      endX: sorted[endIdx - 1]!.x,
      count: stats.count,
      mean: stats.mean,
      variance: stats.variance,
      stdDev: sd,
    });
    for (let i = startIdx; i < endIdx; i += 1) {
      segmentForIndex[i] = segments.length - 1;
    }
  }

  const samples: ChartLineChangepointSample[] = sorted.map((p, i) => ({
    index: i,
    x: p.x,
    y: p.y,
    segmentIndex: segmentForIndex[i] ?? 0,
  }));

  return {
    ok: true,
    samples,
    scores,
    detections,
    segments,
    minSegment: minSeg,
    threshold,
    suppressionWindow: supW,
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

export function computeLineChangepointLayout(
  options: ComputeLineChangepointLayoutOptions,
): ChartLineChangepointLayout {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_CHANGEPOINT_TICK_COUNT,
    minSegment,
    threshold,
    suppressionWindow,
    defaultColors = DEFAULT_CHART_LINE_CHANGEPOINT_PALETTE,
    segmentColors = DEFAULT_CHART_LINE_CHANGEPOINT_SEGMENT_COLORS,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ChartLineChangepointLayout = {
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
    totalDetections: 0,
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
  let totalDetections = 0;

  const analysisBySeries = new Map<string, ChartLineChangepointAnalysisResult>();
  for (const s of visible) {
    const analysis = detectLineChangepoints(s.data, {
      minSegment: s.minSegment ?? minSegment,
      threshold: s.threshold ?? threshold,
      suppressionWindow: s.suppressionWindow ?? suppressionWindow,
    });
    analysisBySeries.set(s.id, analysis);
    totalPoints += analysis.samples.length;
    totalDetections += analysis.detections.length;
    for (const p of analysis.samples) {
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
      if (p.y < yLo) yLo = p.y;
      if (p.y > yHi) yHi = p.y;
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

  const layoutSeries: ChartLineChangepointLayoutSeries[] = visible.map(
    (s, idx) => {
      const analysis =
        analysisBySeries.get(s.id) ??
        detectLineChangepoints([], {
          minSegment,
          threshold,
          suppressionWindow,
        });
      const color =
        s.color ?? defaultColors[idx % defaultColors.length] ?? DEFAULT_CHART_LINE_CHANGEPOINT_PALETTE[0]!;

      const segments: ChartLineChangepointLayoutSegment[] = analysis.segments.map(
        (seg, i) => ({
          ...seg,
          px0: projectX(seg.startX),
          px1: projectX(seg.endX),
          color: getLineChangepointSegmentColor(i, segmentColors),
          meanPy: isFiniteNumber(seg.mean) ? projectY(seg.mean) : null,
        }),
      );

      const points: ChartLineChangepointLayoutPoint[] = analysis.samples.map(
        (p) => ({
          index: p.index,
          x: p.x,
          y: p.y,
          px: projectX(p.x),
          py: projectY(p.y),
          segmentIndex: p.segmentIndex,
          segmentColor: getLineChangepointSegmentColor(
            p.segmentIndex,
            segmentColors,
          ),
        }),
      );

      const path = buildPath(points);

      const detections: ChartLineChangepointLayoutDetection[] = analysis.detections.map(
        (d) => ({
          ...d,
          px: projectX(d.x),
          topPy: panel.y,
          bottomPy: panel.y + panel.height,
        }),
      );

      return {
        id: s.id,
        label: s.label,
        color,
        minSegment: analysis.minSegment,
        threshold: analysis.threshold,
        suppressionWindow: analysis.suppressionWindow,
        points,
        path,
        detections,
        segments,
        finiteCount: analysis.samples.length,
        totalCount: s.data?.length ?? 0,
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
    totalDetections,
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
  return n.toFixed(3);
}

export function describeLineChangepointChart(
  series: readonly ChartLineChangepointSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    minSegment?: number;
    threshold?: number;
    suppressionWindow?: number;
    formatScore?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const fmtS = options?.formatScore ?? defaultFormatScore;

  let totalDetections = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const analysis = detectLineChangepoints(s.data, {
      minSegment: s.minSegment ?? options?.minSegment,
      threshold: s.threshold ?? options?.threshold,
      suppressionWindow: s.suppressionWindow ?? options?.suppressionWindow,
    });
    totalDetections += analysis.detections.length;
    summaries.push(
      `${s.label}: ${analysis.detections.length} changepoint${analysis.detections.length === 1 ? '' : 's'} (threshold ${fmtS(analysis.threshold)})`,
    );
  }
  return `Line chart with variance-shift changepoint markers across ${visible.length} series (${totalDetections} total detections). ${summaries.join('; ')}.`;
}

export const ChartLineChangepoint = forwardRef<
  HTMLDivElement,
  ChartLineChangepointProps
>(function ChartLineChangepoint(
  props: ChartLineChangepointProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    minSegment = DEFAULT_CHART_LINE_CHANGEPOINT_MIN_SEGMENT,
    threshold = DEFAULT_CHART_LINE_CHANGEPOINT_THRESHOLD,
    suppressionWindow = DEFAULT_CHART_LINE_CHANGEPOINT_SUPPRESSION_WINDOW,
    width = DEFAULT_CHART_LINE_CHANGEPOINT_WIDTH,
    height = DEFAULT_CHART_LINE_CHANGEPOINT_HEIGHT,
    padding = DEFAULT_CHART_LINE_CHANGEPOINT_PADDING,
    tickCount = DEFAULT_CHART_LINE_CHANGEPOINT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CHANGEPOINT_STROKE_WIDTH,
    markerStrokeWidth = DEFAULT_CHART_LINE_CHANGEPOINT_MARKER_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CHANGEPOINT_DOT_RADIUS,
    markerDashArray = DEFAULT_CHART_LINE_CHANGEPOINT_MARKER_DASH,
    segmentOpacity = DEFAULT_CHART_LINE_CHANGEPOINT_SEGMENT_OPACITY,
    markerColor = DEFAULT_CHART_LINE_CHANGEPOINT_MARKER_COLOR,
    segmentColors = DEFAULT_CHART_LINE_CHANGEPOINT_SEGMENT_COLORS,
    gridColor = DEFAULT_CHART_LINE_CHANGEPOINT_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CHANGEPOINT_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showLegend = true,
    showTooltip = true,
    showCountBadge = true,
    showMarkers = true,
    showSegmentShading = true,
    showSegmentMeans = false,
    animate = true,
    className,
    ariaLabel = 'Line chart with variance-shift changepoint markers',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    formatScore = defaultFormatScore,
    xLabel,
    yLabel,
    onPointClick,
    onMarkerClick,
    onSeriesToggle,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const isControlledHidden = controlledHidden !== undefined;
  const [uncontrolledHidden, setUncontrolledHidden] = useState<Set<string>>(
    () => normaliseHidden(defaultHiddenSeries),
  );
  const hiddenSet = isControlledHidden
    ? normaliseHidden(controlledHidden)
    : uncontrolledHidden;

  const layout = useMemo(
    () =>
      computeLineChangepointLayout({
        series,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        tickCount,
        minSegment,
        threshold,
        suppressionWindow,
        segmentColors,
        markerColor,
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
      minSegment,
      threshold,
      suppressionWindow,
      segmentColors,
      markerColor,
      xMin,
      xMax,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineChangepointChart(series, {
        hidden: hiddenSet,
        minSegment,
        threshold,
        suppressionWindow,
        formatScore,
      }),
    [
      ariaDescription,
      series,
      hiddenSet,
      minSegment,
      threshold,
      suppressionWindow,
      formatScore,
    ],
  );

  const [hoverPayload, setHoverPayload] = useState<
    | { kind: 'point'; seriesId: string; pointIndex: number }
    | { kind: 'marker'; seriesId: string; index: number }
    | null
  >(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHoverPayload(null);
    setTooltipPos(null);
  }, []);

  const handleToggle = useCallback(
    (s: ChartLineChangepointSeries) => {
      const next = new Set(hiddenSet);
      const willHide = !next.has(s.id);
      if (willHide) next.add(s.id);
      else next.delete(s.id);
      if (!isControlledHidden) setUncontrolledHidden(next);
      onHiddenSeriesChange?.(next);
      onSeriesToggle?.({ series: s, hidden: willHide });
    },
    [hiddenSet, isControlledHidden, onHiddenSeriesChange, onSeriesToggle],
  );

  const allTotalPoints = useMemo(
    () =>
      series.reduce(
        (acc, s) => acc + getLineChangepointFinitePoints(s.data).length,
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
        data-section="chart-line-changepoint"
        data-empty="true"
        data-series-count={series.length}
        data-visible-series-count={0}
        data-total-points={0}
        data-total-detections={0}
        data-min-segment={normaliseLineChangepointMinSegment(minSegment)}
        data-threshold={normaliseLineChangepointThreshold(threshold)}
        data-suppression-window={normaliseLineChangepointSuppressionWindow(suppressionWindow)}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-changepoint-aria-desc"
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
      data-section="chart-line-changepoint"
      data-empty="false"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-total-detections={layout.totalDetections}
      data-min-segment={normaliseLineChangepointMinSegment(minSegment)}
      data-threshold={normaliseLineChangepointThreshold(threshold)}
      data-suppression-window={normaliseLineChangepointSuppressionWindow(suppressionWindow)}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-changepoint-aria-desc"
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
        data-section="chart-line-changepoint-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showCountBadge ? (
          <div
            data-section="chart-line-changepoint-badge"
            data-detection-count={layout.totalDetections}
            data-threshold={normaliseLineChangepointThreshold(threshold)}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: markerColor,
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-changepoint-badge-icon"
              aria-hidden="true"
            >
              ⌇
            </span>
            <span data-section="chart-line-changepoint-badge-count">
              {layout.totalDetections}
            </span>
            <span data-section="chart-line-changepoint-badge-label">
              changepoint{layout.totalDetections === 1 ? '' : 's'}
            </span>
            <span data-section="chart-line-changepoint-badge-threshold">
              thr {formatScore(normaliseLineChangepointThreshold(threshold))}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-changepoint-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-changepoint-grid"
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
                    data-section="chart-line-changepoint-grid-line"
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
                    data-section="chart-line-changepoint-grid-line"
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
              data-section="chart-line-changepoint-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-changepoint-axis"
                data-axis="x"
                x1={layout.panel.x}
                y1={layout.panel.y + layout.panel.height}
                x2={layout.panel.x + layout.panel.width}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-changepoint-axis"
                data-axis="y"
                x1={layout.panel.x}
                y1={layout.panel.y}
                x2={layout.panel.x}
                y2={layout.panel.y + layout.panel.height}
              />
              <g data-section="chart-line-changepoint-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-changepoint-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.panel.y + layout.panel.height}
                        y2={layout.panel.y + layout.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-changepoint-tick-label"
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
              <g data-section="chart-line-changepoint-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-changepoint-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-changepoint-tick-label"
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
                  data-section="chart-line-changepoint-x-label"
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
                  data-section="chart-line-changepoint-y-label"
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

          <g data-section="chart-line-changepoint-series">
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-changepoint-series-group"
                data-series-id={s.id}
                data-series-color={s.color}
                data-series-min-segment={s.minSegment}
                data-series-threshold={s.threshold}
                data-series-suppression-window={s.suppressionWindow}
                data-series-finite-count={s.finiteCount}
                data-series-detection-count={s.detections.length}
                data-series-segment-count={s.segments.length}
              >
                {showSegmentShading
                  ? s.segments.map((seg, i) => (
                      <rect
                        key={`sg-${i}`}
                        data-section="chart-line-changepoint-segment"
                        data-series-id={s.id}
                        data-segment-index={i}
                        data-start-index={seg.startIndex}
                        data-end-index={seg.endIndex}
                        data-mean={seg.mean}
                        data-variance={seg.variance}
                        data-std={seg.stdDev}
                        data-count={seg.count}
                        x={seg.px0}
                        y={layout.panel.y}
                        width={Math.max(0, seg.px1 - seg.px0)}
                        height={layout.panel.height}
                        fill={seg.color}
                        fillOpacity={segmentOpacity}
                        stroke="none"
                        pointerEvents="none"
                      />
                    ))
                  : null}
                {showSegmentMeans
                  ? s.segments.map((seg, i) =>
                      seg.meanPy !== null ? (
                        <line
                          key={`sm-${i}`}
                          data-section="chart-line-changepoint-segment-mean"
                          data-series-id={s.id}
                          data-segment-index={i}
                          x1={seg.px0}
                          x2={seg.px1}
                          y1={seg.meanPy}
                          y2={seg.meanPy}
                          stroke={seg.color}
                          strokeWidth={1.5}
                          strokeDasharray="2 2"
                          strokeOpacity={0.8}
                          pointerEvents="none"
                        />
                      ) : null,
                    )
                  : null}
                {s.path ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} series with ${s.detections.length} changepoint${s.detections.length === 1 ? '' : 's'}`}
                    data-section="chart-line-changepoint-path"
                    data-series-id={s.id}
                    data-kind="signal"
                    d={s.path}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showMarkers
                  ? s.detections.map((d) => {
                      const isHover =
                        hoverPayload?.kind === 'marker' &&
                        hoverPayload.seriesId === s.id &&
                        hoverPayload.index === d.index;
                      return (
                        <line
                          key={`m-${d.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} changepoint at index ${d.index + 1} (x ${formatX(d.x)}) score ${formatScore(d.score)} mean shift ${formatValue(d.meanShift)}`}
                          data-section="chart-line-changepoint-marker"
                          data-series-id={s.id}
                          data-index={d.index}
                          data-score={d.score}
                          data-left-mean={d.leftMean}
                          data-right-mean={d.rightMean}
                          data-left-variance={d.leftVariance}
                          data-right-variance={d.rightVariance}
                          data-mean-shift={d.meanShift}
                          data-hovered={isHover ? 'true' : 'false'}
                          x1={d.px}
                          x2={d.px}
                          y1={d.topPy}
                          y2={d.bottomPy}
                          stroke={markerColor}
                          strokeWidth={
                            isHover ? markerStrokeWidth + 0.5 : markerStrokeWidth
                          }
                          strokeDasharray={markerDashArray}
                          strokeOpacity={0.95}
                          onMouseEnter={() => {
                            setHoverPayload({
                              kind: 'marker',
                              seriesId: s.id,
                              index: d.index,
                            });
                            setTooltipPos({
                              px: d.px,
                              py: (d.topPy + d.bottomPy) / 2,
                            });
                          }}
                          onMouseLeave={clearHover}
                          onFocus={() => {
                            setHoverPayload({
                              kind: 'marker',
                              seriesId: s.id,
                              index: d.index,
                            });
                            setTooltipPos({
                              px: d.px,
                              py: (d.topPy + d.bottomPy) / 2,
                            });
                          }}
                          onBlur={clearHover}
                          onClick={() =>
                            onMarkerClick?.({ series: s, detection: d })
                          }
                        />
                      );
                    })
                  : null}
                {showDots
                  ? s.points.map((p) => {
                      const isHover =
                        hoverPayload?.kind === 'point' &&
                        hoverPayload.seriesId === s.id &&
                        hoverPayload.pointIndex === p.index;
                      return (
                        <circle
                          key={`d-${p.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)} y ${formatValue(p.y)} segment ${p.segmentIndex + 1}`}
                          data-section="chart-line-changepoint-dot"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-x={p.x}
                          data-y={p.y}
                          data-segment-index={p.segmentIndex}
                          data-hovered={isHover ? 'true' : 'false'}
                          cx={p.px}
                          cy={p.py}
                          r={isHover ? dotRadius + 1 : dotRadius}
                          fill={p.segmentColor}
                          stroke="#ffffff"
                          strokeWidth={1}
                          onMouseEnter={() => {
                            setHoverPayload({
                              kind: 'point',
                              seriesId: s.id,
                              pointIndex: p.index,
                            });
                            setTooltipPos({ px: p.px, py: p.py });
                          }}
                          onMouseLeave={clearHover}
                          onFocus={() => {
                            setHoverPayload({
                              kind: 'point',
                              seriesId: s.id,
                              pointIndex: p.index,
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
              </g>
            ))}
          </g>
        </svg>

        {showTooltip && hoverPayload && tooltipPos
          ? (() => {
              const s = layout.series.find((x) => x.id === hoverPayload.seriesId);
              if (!s) return null;
              if (hoverPayload.kind === 'marker') {
                const d = s.detections.find(
                  (x) => x.index === hoverPayload.index,
                );
                if (!d) return null;
                return (
                  <div
                    data-section="chart-line-changepoint-tooltip"
                    data-kind="marker"
                    data-series-id={s.id}
                    data-index={d.index}
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
                      data-section="chart-line-changepoint-tooltip-label"
                      style={{ color: markerColor, fontWeight: 600 }}
                    >
                      {s.label} changepoint
                    </div>
                    <div data-section="chart-line-changepoint-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-changepoint-tooltip-score"
                      style={{ fontWeight: 600 }}
                    >
                      score: {formatScore(d.score)}
                    </div>
                    <div data-section="chart-line-changepoint-tooltip-mean-shift">
                      mean shift: {formatValue(d.meanShift)} ({formatValue(d.leftMean)} {'->'} {formatValue(d.rightMean)})
                    </div>
                    <div data-section="chart-line-changepoint-tooltip-variance">
                      var: {formatValue(d.leftVariance)} {'->'} {formatValue(d.rightVariance)}
                    </div>
                  </div>
                );
              }
              const p = s.points.find(
                (x) => x.index === hoverPayload.pointIndex,
              );
              if (!p) return null;
              const seg = s.segments[p.segmentIndex];
              return (
                <div
                  data-section="chart-line-changepoint-tooltip"
                  data-kind="point"
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
                    minWidth: 150,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-changepoint-tooltip-label"
                    style={{ color: s.color, fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-changepoint-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div
                    data-section="chart-line-changepoint-tooltip-y"
                    style={{ fontWeight: 600 }}
                  >
                    y: {formatValue(p.y)}
                  </div>
                  <div
                    data-section="chart-line-changepoint-tooltip-segment"
                    style={{ color: p.segmentColor }}
                  >
                    segment {p.segmentIndex + 1}
                    {seg
                      ? ` (mean ${formatValue(seg.mean)}, sigma ${formatValue(seg.stdDev)})`
                      : ''}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-changepoint-legend"
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
              DEFAULT_CHART_LINE_CHANGEPOINT_PALETTE[0]!;
            return (
              <button
                key={s.id}
                type="button"
                data-section="chart-line-changepoint-legend-item"
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
                  data-section="chart-line-changepoint-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: swatchColor,
                  }}
                />
                <span data-section="chart-line-changepoint-legend-label">
                  {s.label}
                </span>
                {layoutMatch ? (
                  <span
                    data-section="chart-line-changepoint-legend-stats"
                    style={{ fontSize: 10, color: '#64748b' }}
                  >
                    ({layoutMatch.detections.length} cp;
                    {' '}{layoutMatch.segments.length} seg)
                  </span>
                ) : null}
              </button>
            );
          })}
          <span
            data-section="chart-line-changepoint-legend-total-points"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {allTotalPoints} total points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineChangepoint.displayName = 'ChartLineChangepoint';
