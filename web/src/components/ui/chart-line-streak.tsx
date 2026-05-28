import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_STREAK_WIDTH = 560;
export const DEFAULT_CHART_LINE_STREAK_HEIGHT = 320;
export const DEFAULT_CHART_LINE_STREAK_PADDING = 40;
export const DEFAULT_CHART_LINE_STREAK_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STREAK_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_STREAK_HIGHLIGHT_WIDTH = 3;
export const DEFAULT_CHART_LINE_STREAK_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STREAK_BASE_OPACITY = 0.4;
export const DEFAULT_CHART_LINE_STREAK_HIGHLIGHT_OPACITY = 1;
export const DEFAULT_CHART_LINE_STREAK_FLAT_EPSILON = 0;
export const DEFAULT_CHART_LINE_STREAK_MIN_LENGTH = 2;
export const DEFAULT_CHART_LINE_STREAK_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STREAK_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STREAK_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_STREAK_BASE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STREAK_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_STREAK_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_STREAK_PALETTE = [
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

export type ChartLineStreakDirection = 'up' | 'down' | 'flat';

export interface ChartLineStreakPoint {
  x: number;
  y: number;
}

export interface ChartLineStreakSeries {
  id: string;
  label: string;
  data: readonly ChartLineStreakPoint[];
  color?: string;
}

export interface ChartLineStreakRun {
  startIndex: number;
  endIndex: number;
  length: number;
  direction: ChartLineStreakDirection;
  startX: number;
  endX: number;
  startY: number;
  endY: number;
  delta: number;
}

export interface ChartLineStreakLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  direction: ChartLineStreakDirection;
  inStreak: boolean;
  streakIndex: number;
}

export interface ChartLineStreakLayoutRun {
  startIndex: number;
  endIndex: number;
  length: number;
  direction: ChartLineStreakDirection;
  color: string;
  path: string;
  startX: number;
  endX: number;
  startY: number;
  endY: number;
  delta: number;
}

export interface ChartLineStreakLayoutSeries {
  id: string;
  label: string;
  color: string;
  points: ChartLineStreakLayoutPoint[];
  path: string;
  runs: ChartLineStreakLayoutRun[];
  finiteCount: number;
  totalCount: number;
  longestRunLength: number;
  longestRunDirection: ChartLineStreakDirection;
  upRunCount: number;
  downRunCount: number;
  flatRunCount: number;
}

export interface ComputeLineStreakLayoutResult {
  series: ChartLineStreakLayoutSeries[];
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

export interface ComputeLineStreakLayoutOptions {
  series: readonly ChartLineStreakSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  minLength?: number;
  flatEpsilon?: number;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineStreakProps {
  series: readonly ChartLineStreakSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  minLength?: number;
  flatEpsilon?: number;
  strokeWidth?: number;
  highlightWidth?: number;
  dotRadius?: number;
  baseOpacity?: number;
  highlightOpacity?: number;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  baseColor?: string;
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
  showRunBadge?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineStreakLayoutSeries;
    point: ChartLineStreakLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineStreakSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineStreakDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_STREAK_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineStreakFinitePoints(
  points: readonly ChartLineStreakPoint[] | null | undefined,
): ChartLineStreakPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineStreakPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineStreakMinLength(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_STREAK_MIN_LENGTH;
  if (value < 2) return 2;
  return Math.floor(value);
}

export function normaliseLineStreakFlatEpsilon(value: unknown): number {
  if (!isFiniteNumber(value) || value < 0) {
    return DEFAULT_CHART_LINE_STREAK_FLAT_EPSILON;
  }
  return value;
}

export function classifyLineStreakStep(
  delta: number,
  epsilon: number = DEFAULT_CHART_LINE_STREAK_FLAT_EPSILON,
): ChartLineStreakDirection {
  if (!isFiniteNumber(delta)) return 'flat';
  const eps = normaliseLineStreakFlatEpsilon(epsilon);
  if (delta > eps) return 'up';
  if (delta < -eps) return 'down';
  return 'flat';
}

export function computeLineStreaks(
  points: readonly ChartLineStreakPoint[] | null | undefined,
  options?: { minLength?: number; flatEpsilon?: number },
): ChartLineStreakRun[] {
  const finite = getLineStreakFinitePoints(points);
  if (finite.length < 2) return [];
  const minLength = normaliseLineStreakMinLength(options?.minLength);
  const epsilon = normaliseLineStreakFlatEpsilon(options?.flatEpsilon);
  const sorted = [...finite].sort((a, b) => a.x - b.x);

  const runs: ChartLineStreakRun[] = [];
  let runStart = 0;
  let runDirection: ChartLineStreakDirection = classifyLineStreakStep(
    sorted[1]!.y - sorted[0]!.y,
    epsilon,
  );

  for (let i = 1; i < sorted.length; i += 1) {
    const stepDir = classifyLineStreakStep(
      sorted[i]!.y - sorted[i - 1]!.y,
      epsilon,
    );
    if (i === 1) {
      runDirection = stepDir;
      continue;
    }
    if (stepDir !== runDirection) {
      const endIndex = i - 1;
      const length = endIndex - runStart + 1;
      if (length >= minLength) {
        runs.push({
          startIndex: runStart,
          endIndex,
          length,
          direction: runDirection,
          startX: sorted[runStart]!.x,
          endX: sorted[endIndex]!.x,
          startY: sorted[runStart]!.y,
          endY: sorted[endIndex]!.y,
          delta: sorted[endIndex]!.y - sorted[runStart]!.y,
        });
      }
      runStart = endIndex;
      runDirection = stepDir;
    }
  }

  const finalEndIndex = sorted.length - 1;
  const finalLength = finalEndIndex - runStart + 1;
  if (finalLength >= minLength) {
    runs.push({
      startIndex: runStart,
      endIndex: finalEndIndex,
      length: finalLength,
      direction: runDirection,
      startX: sorted[runStart]!.x,
      endX: sorted[finalEndIndex]!.x,
      startY: sorted[runStart]!.y,
      endY: sorted[finalEndIndex]!.y,
      delta: sorted[finalEndIndex]!.y - sorted[runStart]!.y,
    });
  }

  return runs;
}

export function computeLineStreakLongest(
  runs: readonly ChartLineStreakRun[] | null | undefined,
): { length: number; direction: ChartLineStreakDirection } {
  if (!Array.isArray(runs) || runs.length === 0) {
    return { length: 0, direction: 'flat' };
  }
  let best: ChartLineStreakRun = runs[0]!;
  for (let i = 1; i < runs.length; i += 1) {
    const r = runs[i]!;
    if (r.length > best.length) {
      best = r;
    }
  }
  return { length: best.length, direction: best.direction };
}

function buildLineStreakPath(
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
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) {
    return [];
  }
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) {
    ticks.push(min + step * i);
  }
  return ticks;
}

export function computeLineStreakLayout(
  options: ComputeLineStreakLayoutOptions,
): ComputeLineStreakLayoutResult {
  const {
    series = [],
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_STREAK_TICK_COUNT,
    minLength,
    flatEpsilon,
    upColor = DEFAULT_CHART_LINE_STREAK_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_STREAK_DOWN_COLOR,
    flatColor = DEFAULT_CHART_LINE_STREAK_FLAT_COLOR,
    defaultColors = DEFAULT_CHART_LINE_STREAK_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ComputeLineStreakLayoutResult = {
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

  const minLen = normaliseLineStreakMinLength(minLength);
  const eps = normaliseLineStreakFlatEpsilon(flatEpsilon);

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let totalPoints = 0;

  const finiteBySeries = new Map<string, ChartLineStreakPoint[]>();
  for (const s of visible) {
    const finite = getLineStreakFinitePoints(s.data).slice().sort((a, b) => a.x - b.x);
    finiteBySeries.set(s.id, finite);
    totalPoints += finite.length;
    for (const p of finite) {
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

  const project = (x: number, y: number): { px: number; py: number } => ({
    px: padding + ((x - xLo) / xRange) * innerWidth,
    py: padding + innerHeight - ((y - yLo) / yRange) * innerHeight,
  });

  const layoutSeries: ChartLineStreakLayoutSeries[] = visible.map((s, idx) => {
    const finite = finiteBySeries.get(s.id) ?? [];
    const color =
      s.color ?? defaultColors[idx % defaultColors.length] ?? DEFAULT_CHART_LINE_STREAK_PALETTE[0]!;

    const projected = finite.map((p) => ({ ...p, ...project(p.x, p.y) }));

    const runs = computeLineStreaks(finite, {
      minLength: minLen,
      flatEpsilon: eps,
    });

    const pointDirections = new Map<number, ChartLineStreakDirection>();
    const pointStreakIndex = new Map<number, number>();
    runs.forEach((run, runIdx) => {
      for (let i = run.startIndex; i <= run.endIndex; i += 1) {
        pointDirections.set(i, run.direction);
        pointStreakIndex.set(i, runIdx);
      }
    });

    const layoutPoints: ChartLineStreakLayoutPoint[] = projected.map(
      (p, i) => ({
        index: i,
        x: p.x,
        y: p.y,
        px: p.px,
        py: p.py,
        direction: pointDirections.get(i) ?? 'flat',
        inStreak: pointDirections.has(i),
        streakIndex: pointStreakIndex.get(i) ?? -1,
      }),
    );

    const path = buildLineStreakPath(layoutPoints);

    const layoutRuns: ChartLineStreakLayoutRun[] = runs.map((run) => {
      const runPoints = layoutPoints.slice(run.startIndex, run.endIndex + 1);
      const runPath = buildLineStreakPath(runPoints);
      const runColor =
        run.direction === 'up'
          ? upColor
          : run.direction === 'down'
            ? downColor
            : flatColor;
      return {
        startIndex: run.startIndex,
        endIndex: run.endIndex,
        length: run.length,
        direction: run.direction,
        color: runColor,
        path: runPath,
        startX: run.startX,
        endX: run.endX,
        startY: run.startY,
        endY: run.endY,
        delta: run.delta,
      };
    });

    const longest = computeLineStreakLongest(runs);

    let upCount = 0;
    let downCount = 0;
    let flatCount = 0;
    for (const run of runs) {
      if (run.direction === 'up') upCount += 1;
      else if (run.direction === 'down') downCount += 1;
      else flatCount += 1;
    }

    return {
      id: s.id,
      label: s.label,
      color,
      points: layoutPoints,
      path,
      runs: layoutRuns,
      finiteCount: finite.length,
      totalCount: s.data?.length ?? 0,
      longestRunLength: longest.length,
      longestRunDirection: longest.direction,
      upRunCount: upCount,
      downRunCount: downCount,
      flatRunCount: flatCount,
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

function defaultFormatX(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineStreakChart(
  series: readonly ChartLineStreakSeries[] | null | undefined,
  hidden?: ReadonlySet<string> | readonly string[],
  minLength?: number,
  flatEpsilon?: number,
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const minLen = normaliseLineStreakMinLength(minLength);

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const finite = getLineStreakFinitePoints(s.data);
    totalPoints += finite.length;
    const runs = computeLineStreaks(finite, {
      minLength: minLen,
      flatEpsilon,
    });
    const longest = computeLineStreakLongest(runs);
    summaries.push(
      `${s.label}: longest ${longest.direction} streak ${longest.length}`,
    );
  }
  if (totalPoints === 0) return 'No data';

  return `Line chart with streak highlights across ${visible.length} series (${totalPoints} points; minLength ${minLen}). ${summaries.join('; ')}.`;
}

export const ChartLineStreak = forwardRef<HTMLDivElement, ChartLineStreakProps>(
  function ChartLineStreak(
    props: ChartLineStreakProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      series,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_STREAK_WIDTH,
      height = DEFAULT_CHART_LINE_STREAK_HEIGHT,
      padding = DEFAULT_CHART_LINE_STREAK_PADDING,
      tickCount = DEFAULT_CHART_LINE_STREAK_TICK_COUNT,
      minLength = DEFAULT_CHART_LINE_STREAK_MIN_LENGTH,
      flatEpsilon = DEFAULT_CHART_LINE_STREAK_FLAT_EPSILON,
      strokeWidth = DEFAULT_CHART_LINE_STREAK_STROKE_WIDTH,
      highlightWidth = DEFAULT_CHART_LINE_STREAK_HIGHLIGHT_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_STREAK_DOT_RADIUS,
      baseOpacity = DEFAULT_CHART_LINE_STREAK_BASE_OPACITY,
      highlightOpacity = DEFAULT_CHART_LINE_STREAK_HIGHLIGHT_OPACITY,
      upColor = DEFAULT_CHART_LINE_STREAK_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_STREAK_DOWN_COLOR,
      flatColor = DEFAULT_CHART_LINE_STREAK_FLAT_COLOR,
      baseColor = DEFAULT_CHART_LINE_STREAK_BASE_COLOR,
      gridColor = DEFAULT_CHART_LINE_STREAK_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_STREAK_AXIS_COLOR,
      xMin,
      xMax,
      yMin,
      yMax,
      showAxis = true,
      showGrid = true,
      showDots = true,
      showLegend = true,
      showTooltip = true,
      showRunBadge = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with consecutive-direction streak highlights',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatX,
      xLabel,
      yLabel,
      onPointClick,
      onSeriesToggle,
      style,
    } = props;

    const reactId = useId();
    const descId = `${reactId}-desc`;

    const isControlled = controlledHidden !== undefined;
    const [uncontrolled, setUncontrolled] = useState<Set<string>>(
      () => normaliseHidden(defaultHiddenSeries),
    );
    const hiddenSet = isControlled
      ? normaliseHidden(controlledHidden)
      : uncontrolled;

    const layout = useMemo(
      () =>
        computeLineStreakLayout({
          series,
          hiddenSeries: hiddenSet,
          width,
          height,
          padding,
          tickCount,
          minLength,
          flatEpsilon,
          upColor,
          downColor,
          flatColor,
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
        minLength,
        flatEpsilon,
        upColor,
        downColor,
        flatColor,
        xMin,
        xMax,
        yMin,
        yMax,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineStreakChart(series, hiddenSet, minLength, flatEpsilon),
      [ariaDescription, series, hiddenSet, minLength, flatEpsilon],
    );

    const [hoverKey, setHoverKey] = useState<string | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{
      px: number;
      py: number;
    } | null>(null);
    const [hoverPayload, setHoverPayload] = useState<{
      seriesId: string;
      pointIndex: number;
    } | null>(null);

    const clearHover = useCallback(() => {
      setHoverKey(null);
      setTooltipPos(null);
      setHoverPayload(null);
    }, []);

    const handleToggle = useCallback(
      (s: ChartLineStreakSeries) => {
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
          (acc, s) => acc + getLineStreakFinitePoints(s.data).length,
          0,
        ),
      [series],
    );

    const longestAcrossSeries = useMemo(() => {
      let best: { length: number; direction: ChartLineStreakDirection; seriesId: string } = {
        length: 0,
        direction: 'flat',
        seriesId: '',
      };
      for (const s of layout.series) {
        if (s.longestRunLength > best.length) {
          best = {
            length: s.longestRunLength,
            direction: s.longestRunDirection,
            seriesId: s.id,
          };
        }
      }
      return best;
    }, [layout.series]);

    const badgeColor =
      longestAcrossSeries.direction === 'up'
        ? upColor
        : longestAcrossSeries.direction === 'down'
          ? downColor
          : flatColor;

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
          data-section="chart-line-streak"
          data-empty="true"
          data-series-count={series.length}
          data-visible-series-count={0}
          data-total-points={0}
          data-min-length={normaliseLineStreakMinLength(minLength)}
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-streak-aria-desc"
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
        data-section="chart-line-streak"
        data-empty="false"
        data-series-count={series.length}
        data-visible-series-count={layout.visibleSeriesCount}
        data-total-points={layout.totalPoints}
        data-min-length={normaliseLineStreakMinLength(minLength)}
        data-longest-length={longestAcrossSeries.length}
        data-longest-direction={longestAcrossSeries.direction}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-streak-aria-desc"
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
          data-section="chart-line-streak-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showRunBadge && longestAcrossSeries.length > 0 ? (
            <div
              data-section="chart-line-streak-badge"
              data-direction={longestAcrossSeries.direction}
              data-length={longestAcrossSeries.length}
              data-series-id={longestAcrossSeries.seriesId}
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
                data-section="chart-line-streak-badge-direction"
                aria-hidden="true"
              >
                {longestAcrossSeries.direction === 'up'
                  ? '↑'
                  : longestAcrossSeries.direction === 'down'
                    ? '↓'
                    : '→'}
              </span>
              <span data-section="chart-line-streak-badge-length">
                {longestAcrossSeries.length}
              </span>
              <span data-section="chart-line-streak-badge-label">
                {longestAcrossSeries.direction} streak
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-streak-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-streak-grid"
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
                      data-section="chart-line-streak-grid-line"
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
                      data-section="chart-line-streak-grid-line"
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
                data-section="chart-line-streak-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-streak-axis"
                  data-axis="x"
                  x1={padding}
                  y1={padding + layout.innerHeight}
                  x2={padding + layout.innerWidth}
                  y2={padding + layout.innerHeight}
                />
                <line
                  data-section="chart-line-streak-axis"
                  data-axis="y"
                  x1={padding}
                  y1={padding}
                  x2={padding}
                  y2={padding + layout.innerHeight}
                />
                <g data-section="chart-line-streak-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => {
                    const px =
                      padding +
                      ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                        layout.innerWidth;
                    return (
                      <g
                        key={`tx-${i}`}
                        data-section="chart-line-streak-tick"
                        data-axis="x"
                      >
                        <line
                          x1={px}
                          x2={px}
                          y1={padding + layout.innerHeight}
                          y2={padding + layout.innerHeight + 4}
                        />
                        <text
                          data-section="chart-line-streak-tick-label"
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
                <g data-section="chart-line-streak-ticks" data-axis="y">
                  {layout.yTicks.map((t, i) => {
                    const py =
                      padding +
                      layout.innerHeight -
                      ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                        layout.innerHeight;
                    return (
                      <g
                        key={`ty-${i}`}
                        data-section="chart-line-streak-tick"
                        data-axis="y"
                      >
                        <line
                          x1={padding - 4}
                          x2={padding}
                          y1={py}
                          y2={py}
                        />
                        <text
                          data-section="chart-line-streak-tick-label"
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
                    data-section="chart-line-streak-x-label"
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
                    data-section="chart-line-streak-y-label"
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

            <g data-section="chart-line-streak-series">
              {layout.series.map((s) => (
                <g
                  key={s.id}
                  data-section="chart-line-streak-series-group"
                  data-series-id={s.id}
                  data-series-color={s.color}
                  data-series-finite-count={s.finiteCount}
                  data-series-run-count={s.runs.length}
                  data-series-longest-length={s.longestRunLength}
                  data-series-longest-direction={s.longestRunDirection}
                  data-series-up-run-count={s.upRunCount}
                  data-series-down-run-count={s.downRunCount}
                  data-series-flat-run-count={s.flatRunCount}
                >
                  {s.path ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} series base line`}
                      data-section="chart-line-streak-path"
                      data-series-id={s.id}
                      data-kind="base"
                      d={s.path}
                      fill="none"
                      stroke={baseColor}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={baseOpacity}
                    />
                  ) : null}
                  {s.runs.map((run, runIdx) => (
                    <path
                      key={`run-${runIdx}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} ${run.direction} streak length ${run.length}`}
                      data-section="chart-line-streak-run"
                      data-series-id={s.id}
                      data-run-index={runIdx}
                      data-direction={run.direction}
                      data-length={run.length}
                      data-start-index={run.startIndex}
                      data-end-index={run.endIndex}
                      data-delta={run.delta}
                      d={run.path}
                      fill="none"
                      stroke={run.color}
                      strokeWidth={highlightWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={highlightOpacity}
                    />
                  ))}
                  {showDots
                    ? s.points.map((p) => {
                        const isHover =
                          hoverPayload?.seriesId === s.id &&
                          hoverPayload?.pointIndex === p.index;
                        const dotColor = p.inStreak
                          ? p.direction === 'up'
                            ? upColor
                            : p.direction === 'down'
                              ? downColor
                              : flatColor
                          : baseColor;
                        return (
                          <circle
                            key={`d-${p.index}`}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)} y ${formatValue(p.y)}${
                              p.inStreak ? ` in ${p.direction} streak` : ''
                            }`}
                            data-section="chart-line-streak-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-direction={p.direction}
                            data-in-streak={p.inStreak ? 'true' : 'false'}
                            data-streak-index={p.streakIndex}
                            data-hovered={isHover ? 'true' : 'false'}
                            cx={p.px}
                            cy={p.py}
                            r={isHover ? dotRadius + 1 : dotRadius}
                            fill={dotColor}
                            stroke="#ffffff"
                            strokeWidth={1}
                            onMouseEnter={() => {
                              setHoverKey(`${s.id}-${p.index}`);
                              setTooltipPos({ px: p.px, py: p.py });
                              setHoverPayload({
                                seriesId: s.id,
                                pointIndex: p.index,
                              });
                            }}
                            onMouseLeave={clearHover}
                            onFocus={() => {
                              setHoverKey(`${s.id}-${p.index}`);
                              setTooltipPos({ px: p.px, py: p.py });
                              setHoverPayload({
                                seriesId: s.id,
                                pointIndex: p.index,
                              });
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

          {showTooltip && hoverKey && tooltipPos && hoverPayload ? (() => {
            const s = layout.series.find((x) => x.id === hoverPayload.seriesId);
            if (!s) return null;
            const p = s.points[hoverPayload.pointIndex];
            if (!p) return null;
            const tipDirColor =
              p.direction === 'up'
                ? upColor
                : p.direction === 'down'
                  ? downColor
                  : flatColor;
            return (
              <div
                data-section="chart-line-streak-tooltip"
                data-series-id={s.id}
                data-point-index={p.index}
                data-direction={p.direction}
                data-in-streak={p.inStreak ? 'true' : 'false'}
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
                  minWidth: 110,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                }}
              >
                <div
                  data-section="chart-line-streak-tooltip-label"
                  style={{ color: s.color, fontWeight: 600 }}
                >
                  {s.label}
                </div>
                <div data-section="chart-line-streak-tooltip-x">
                  x: {formatX(p.x)}
                </div>
                <div
                  data-section="chart-line-streak-tooltip-y"
                  style={{ fontWeight: 600 }}
                >
                  y: {formatValue(p.y)}
                </div>
                {p.inStreak ? (
                  <div
                    data-section="chart-line-streak-tooltip-streak"
                    style={{ color: tipDirColor }}
                  >
                    {p.direction} streak
                  </div>
                ) : null}
              </div>
            );
          })() : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-streak-legend"
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
                DEFAULT_CHART_LINE_STREAK_PALETTE[0]!;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-section="chart-line-streak-legend-item"
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
                    data-section="chart-line-streak-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: swatchColor,
                    }}
                  />
                  <span data-section="chart-line-streak-legend-label">
                    {s.label}
                  </span>
                  {layoutMatch ? (
                    <span
                      data-section="chart-line-streak-legend-runs"
                      style={{ fontSize: 10, color: '#64748b' }}
                    >
                      ({layoutMatch.runs.length} runs)
                    </span>
                  ) : null}
                </button>
              );
            })}
            <span
              data-section="chart-line-streak-legend-total-points"
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

ChartLineStreak.displayName = 'ChartLineStreak';
