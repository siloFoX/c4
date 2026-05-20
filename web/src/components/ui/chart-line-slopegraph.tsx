import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_SLOPEGRAPH_WIDTH = 560;
export const DEFAULT_CHART_LINE_SLOPEGRAPH_HEIGHT = 320;
export const DEFAULT_CHART_LINE_SLOPEGRAPH_PADDING = 48;
export const DEFAULT_CHART_LINE_SLOPEGRAPH_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SLOPEGRAPH_STROKE_WIDTH = 2.5;
export const DEFAULT_CHART_LINE_SLOPEGRAPH_TRAJECTORY_STROKE_WIDTH = 1.25;
export const DEFAULT_CHART_LINE_SLOPEGRAPH_DOT_RADIUS = 4;
export const DEFAULT_CHART_LINE_SLOPEGRAPH_TRAJECTORY_OPACITY = 0.35;
export const DEFAULT_CHART_LINE_SLOPEGRAPH_PALETTE = [
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
export const DEFAULT_CHART_LINE_SLOPEGRAPH_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SLOPEGRAPH_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SLOPEGRAPH_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_SLOPEGRAPH_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SLOPEGRAPH_AXIS_COLOR = '#cbd5e1';

export type ChartLineSlopegraphDirection = 'up' | 'down' | 'flat';
export type ChartLineSlopegraphColorMode = 'series' | 'direction';

export interface ChartLineSlopegraphPoint {
  x: number;
  value: number;
}

export interface ChartLineSlopegraphSeries {
  id: string;
  label: string;
  data: readonly ChartLineSlopegraphPoint[];
  color?: string;
}

export interface ChartLineSlopegraphRunSeries {
  id: string;
  label: string;
  startValue: number;
  endValue: number;
  delta: number;
  pctChange: number;
  direction: ChartLineSlopegraphDirection;
  complete: boolean;
  pointCount: number;
}

export interface ChartLineSlopegraphRun {
  startX: number;
  endX: number;
  series: ChartLineSlopegraphRunSeries[];
  risingCount: number;
  fallingCount: number;
  flatCount: number;
  completeCount: number;
  ok: boolean;
}

export interface ChartLineSlopegraphEndpoint {
  x: number;
  value: number;
  px: number;
  py: number;
}

export interface ChartLineSlopegraphLayoutSeries {
  id: string;
  label: string;
  color: string;
  visible: boolean;
  complete: boolean;
  startValue: number;
  endValue: number;
  delta: number;
  pctChange: number;
  direction: ChartLineSlopegraphDirection;
  startNode: ChartLineSlopegraphEndpoint | null;
  endNode: ChartLineSlopegraphEndpoint | null;
  slopePath: string;
  trajectoryPath: string;
  pointCount: number;
}

export interface ChartLineSlopegraphLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: { x: number; y: number; width: number; height: number };
  leftColX: number;
  rightColX: number;
  yTicks: number[];
  startX: number;
  endX: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  series: ChartLineSlopegraphLayoutSeries[];
  seriesCount: number;
  visibleSeriesCount: number;
  completeCount: number;
  risingCount: number;
  fallingCount: number;
  flatCount: number;
}

export interface ComputeLineSlopegraphLayoutOptions {
  series: readonly ChartLineSlopegraphSeries[];
  startX?: number;
  endX?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  defaultColors?: readonly string[];
  yMin?: number;
  yMax?: number;
}

export interface ChartLineSlopegraphProps {
  series: readonly ChartLineSlopegraphSeries[];
  startX?: number;
  endX?: number;
  colorMode?: ChartLineSlopegraphColorMode;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  trajectoryStrokeWidth?: number;
  dotRadius?: number;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  gridColor?: string;
  axisColor?: string;
  yMin?: number;
  yMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showEndpointDots?: boolean;
  showEndpointValues?: boolean;
  showTrajectory?: boolean;
  showColumnGuides?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  yLabel?: string;
  onSeriesClick?: (payload: {
    series: ChartLineSlopegraphLayoutSeries;
  }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineSlopegraphDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_SLOPEGRAPH_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineSlopegraphFinitePoints(
  points: readonly ChartLineSlopegraphPoint[] | null | undefined,
): ChartLineSlopegraphPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineSlopegraphPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

export function getLineSlopegraphDirection(
  startValue: number,
  endValue: number,
): ChartLineSlopegraphDirection {
  if (!isFiniteNumber(startValue) || !isFiniteNumber(endValue)) {
    return 'flat';
  }
  if (endValue > startValue) return 'up';
  if (endValue < startValue) return 'down';
  return 'flat';
}

/**
 * Resolve the two time endpoints. When `startX` / `endX` are both
 * supplied they are used verbatim; otherwise they default to the
 * minimum and maximum x present across every series' finite points.
 */
export function resolveLineSlopegraphEndpoints(
  series: readonly ChartLineSlopegraphSeries[] | null | undefined,
  startX?: number,
  endX?: number,
): { startX: number; endX: number } {
  if (isFiniteNumber(startX) && isFiniteNumber(endX)) {
    return { startX, endX };
  }
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  const list = Array.isArray(series) ? series : [];
  for (const s of list) {
    for (const p of getLineSlopegraphFinitePoints(s?.data)) {
      if (p.x < lo) lo = p.x;
      if (p.x > hi) hi = p.x;
    }
  }
  return {
    startX: isFiniteNumber(startX)
      ? startX
      : Number.isFinite(lo)
        ? lo
        : NaN,
    endX: isFiniteNumber(endX) ? endX : Number.isFinite(hi) ? hi : NaN,
  };
}

/**
 * Reduce a set of time series to a two-endpoint slopegraph. For
 * every series the value at `startX` and at `endX` is looked up by
 * EXACT x match; a series present at both endpoints is `complete`
 * and gets a slope. `pctChange` is `(end - start) / |start|`; it is
 * NaN when the start value is 0 (an undefined percentage).
 */
export function runLineSlopegraph(
  series: readonly ChartLineSlopegraphSeries[] | null | undefined,
  startX?: number,
  endX?: number,
): ChartLineSlopegraphRun {
  const list = Array.isArray(series) ? series : [];
  const endpoints = resolveLineSlopegraphEndpoints(list, startX, endX);

  let risingCount = 0;
  let fallingCount = 0;
  let flatCount = 0;
  let completeCount = 0;

  const seriesOut: ChartLineSlopegraphRunSeries[] = list.map((s) => {
    const finite = getLineSlopegraphFinitePoints(s?.data);
    const byX = new Map<number, number>();
    for (const p of finite) byX.set(p.x, p.value);
    const startValue = byX.get(endpoints.startX);
    const endValue = byX.get(endpoints.endX);
    const complete =
      startValue !== undefined && endValue !== undefined;
    let delta = NaN;
    let pctChange = NaN;
    let direction: ChartLineSlopegraphDirection = 'flat';
    if (complete) {
      delta = endValue! - startValue!;
      direction = getLineSlopegraphDirection(startValue!, endValue!);
      pctChange =
        startValue === 0 ? NaN : delta / Math.abs(startValue!);
      completeCount += 1;
      if (direction === 'up') risingCount += 1;
      else if (direction === 'down') fallingCount += 1;
      else flatCount += 1;
    }
    return {
      id: s.id,
      label: s.label,
      startValue: startValue ?? NaN,
      endValue: endValue ?? NaN,
      delta,
      pctChange,
      direction,
      complete,
      pointCount: finite.length,
    };
  });

  const ok =
    list.length > 0 &&
    isFiniteNumber(endpoints.startX) &&
    isFiniteNumber(endpoints.endX) &&
    endpoints.startX !== endpoints.endX;

  return {
    startX: endpoints.startX,
    endX: endpoints.endX,
    series: seriesOut,
    risingCount,
    fallingCount,
    flatCount,
    completeCount,
    ok,
  };
}

function buildPath(
  points: readonly { px: number; py: number }[],
): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
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

export function computeLineSlopegraphLayout(
  options: ComputeLineSlopegraphLayoutOptions,
): ChartLineSlopegraphLayout {
  const {
    series,
    startX,
    endX,
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_SLOPEGRAPH_TICK_COUNT,
    defaultColors = DEFAULT_CHART_LINE_SLOPEGRAPH_PALETTE,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const panel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };
  const empty: ChartLineSlopegraphLayout = {
    ok: false,
    width,
    height,
    panel,
    leftColX: padding,
    rightColX: padding + innerWidth,
    yTicks: [],
    startX: NaN,
    endX: NaN,
    yMin: 0,
    yMax: 0,
    innerWidth,
    innerHeight,
    series: [],
    seriesCount: 0,
    visibleSeriesCount: 0,
    completeCount: 0,
    risingCount: 0,
    fallingCount: 0,
    flatCount: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;

  const run = runLineSlopegraph(series, startX, endX);
  if (!run.ok) return empty;

  const list = Array.isArray(series) ? series : [];
  const hidden = normaliseHidden(hiddenSeries);
  const visibleList = list.filter((s) => !hidden.has(s.id));
  if (visibleList.length === 0) return empty;

  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const s of visibleList) {
    for (const p of getLineSlopegraphFinitePoints(s.data)) {
      if (p.value < yLo) yLo = p.value;
      if (p.value > yHi) yHi = p.value;
    }
  }
  if (!Number.isFinite(yLo) || !Number.isFinite(yHi)) return empty;

  if (isFiniteNumber(yMinOverride)) yLo = yMinOverride;
  if (isFiniteNumber(yMaxOverride)) yHi = yMaxOverride;
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  const leftColX = panel.x;
  const rightColX = panel.x + panel.width;
  const xSpan = run.endX - run.startX;
  const yRange = yHi - yLo;
  const projectX = (x: number): number =>
    leftColX + ((x - run.startX) / xSpan) * (rightColX - leftColX);
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const runById = new Map(run.series.map((s) => [s.id, s]));

  const layoutSeries: ChartLineSlopegraphLayoutSeries[] = list.map(
    (s, idx) => {
      const r = runById.get(s.id)!;
      const color =
        s.color ??
        defaultColors[idx % defaultColors.length] ??
        DEFAULT_CHART_LINE_SLOPEGRAPH_PALETTE[0]!;
      const visible = !hidden.has(s.id);

      const finite = getLineSlopegraphFinitePoints(s.data);
      const sorted = [...finite].sort((a, b) => a.x - b.x);
      const trajectoryPath = buildPath(
        sorted.map((p) => ({
          px: projectX(p.x),
          py: projectY(p.value),
        })),
      );

      let startNode: ChartLineSlopegraphEndpoint | null = null;
      let endNode: ChartLineSlopegraphEndpoint | null = null;
      let slopePath = '';
      if (r.complete) {
        startNode = {
          x: run.startX,
          value: r.startValue,
          px: leftColX,
          py: projectY(r.startValue),
        };
        endNode = {
          x: run.endX,
          value: r.endValue,
          px: rightColX,
          py: projectY(r.endValue),
        };
        slopePath = `M ${startNode.px.toFixed(3)} ${startNode.py.toFixed(3)} L ${endNode.px.toFixed(3)} ${endNode.py.toFixed(3)}`;
      }

      return {
        id: s.id,
        label: s.label,
        color,
        visible,
        complete: r.complete,
        startValue: r.startValue,
        endValue: r.endValue,
        delta: r.delta,
        pctChange: r.pctChange,
        direction: r.direction,
        startNode,
        endNode,
        slopePath,
        trajectoryPath,
        pointCount: r.pointCount,
      };
    },
  );

  let risingCount = 0;
  let fallingCount = 0;
  let flatCount = 0;
  let completeCount = 0;
  for (const s of layoutSeries) {
    if (!s.visible || !s.complete) continue;
    completeCount += 1;
    if (s.direction === 'up') risingCount += 1;
    else if (s.direction === 'down') fallingCount += 1;
    else flatCount += 1;
  }

  return {
    ok: true,
    width,
    height,
    panel,
    leftColX,
    rightColX,
    yTicks: computeTicks(yLo, yHi, tickCount),
    startX: run.startX,
    endX: run.endX,
    yMin: yLo,
    yMax: yHi,
    innerWidth,
    innerHeight,
    series: layoutSeries,
    seriesCount: list.length,
    visibleSeriesCount: visibleList.length,
    completeCount,
    risingCount,
    fallingCount,
    flatCount,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineSlopegraphChart(
  series: readonly ChartLineSlopegraphSeries[] | null | undefined,
  options?: {
    startX?: number;
    endX?: number;
    hidden?: ReadonlySet<string> | readonly string[];
    formatX?: (n: number) => string;
  },
): string {
  const run = runLineSlopegraph(series, options?.startX, options?.endX);
  if (!run.ok) return 'No data';
  const hidden = normaliseHidden(options?.hidden);
  const visible = run.series.filter((s) => !hidden.has(s.id));
  if (visible.length === 0) return 'No data';
  const fmtX = options?.formatX ?? defaultFormatValue;
  let rising = 0;
  let falling = 0;
  let flat = 0;
  for (const s of visible) {
    if (!s.complete) continue;
    if (s.direction === 'up') rising += 1;
    else if (s.direction === 'down') falling += 1;
    else flat += 1;
  }
  return `Slopegraph connecting x ${fmtX(run.startX)} to x ${fmtX(run.endX)} across ${visible.length} series: ${rising} rising, ${falling} falling, ${flat} flat.`;
}

export const ChartLineSlopegraph = forwardRef<
  HTMLDivElement,
  ChartLineSlopegraphProps
>(function ChartLineSlopegraph(
  props: ChartLineSlopegraphProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series,
    startX,
    endX,
    colorMode = 'series',
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_SLOPEGRAPH_WIDTH,
    height = DEFAULT_CHART_LINE_SLOPEGRAPH_HEIGHT,
    padding = DEFAULT_CHART_LINE_SLOPEGRAPH_PADDING,
    tickCount = DEFAULT_CHART_LINE_SLOPEGRAPH_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SLOPEGRAPH_STROKE_WIDTH,
    trajectoryStrokeWidth = DEFAULT_CHART_LINE_SLOPEGRAPH_TRAJECTORY_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SLOPEGRAPH_DOT_RADIUS,
    upColor = DEFAULT_CHART_LINE_SLOPEGRAPH_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_SLOPEGRAPH_DOWN_COLOR,
    flatColor = DEFAULT_CHART_LINE_SLOPEGRAPH_FLAT_COLOR,
    gridColor = DEFAULT_CHART_LINE_SLOPEGRAPH_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_SLOPEGRAPH_AXIS_COLOR,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showEndpointDots = true,
    showEndpointValues = true,
    showTrajectory = true,
    showColumnGuides = true,
    showLegend = true,
    showTooltip = true,
    showConfigBadge = true,
    animate = true,
    className,
    ariaLabel = 'Slopegraph connecting two time endpoints across series',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    yLabel,
    onSeriesClick,
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
      computeLineSlopegraphLayout({
        series,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(startX) ? { startX } : {}),
        ...(isFiniteNumber(endX) ? { endX } : {}),
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
      startX,
      endX,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineSlopegraphChart(series, {
        hidden: hiddenSet,
        formatX,
        ...(isFiniteNumber(startX) ? { startX } : {}),
        ...(isFiniteNumber(endX) ? { endX } : {}),
      }),
    [ariaDescription, series, hiddenSet, formatX, startX, endX],
  );

  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHoverId(null);
    setTooltipPos(null);
  }, []);

  const handleToggle = useCallback(
    (seriesId: string) => {
      const next = new Set(hiddenSet);
      const willHide = !next.has(seriesId);
      if (willHide) next.add(seriesId);
      else next.delete(seriesId);
      if (!isControlled) setUncontrolled(next);
      onHiddenSeriesChange?.(next);
      onSeriesToggle?.({ seriesId, hidden: willHide });
    },
    [hiddenSet, isControlled, onHiddenSeriesChange, onSeriesToggle],
  );

  const resolveColor = useCallback(
    (s: ChartLineSlopegraphLayoutSeries): string => {
      if (colorMode === 'direction') {
        if (s.direction === 'up') return upColor;
        if (s.direction === 'down') return downColor;
        return flatColor;
      }
      return s.color;
    },
    [colorMode, upColor, downColor, flatColor],
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
        data-section="chart-line-slopegraph"
        data-empty="true"
        data-series-count={0}
        data-visible-series-count={0}
        data-complete-count={0}
        data-rising-count={0}
        data-falling-count={0}
        data-flat-count={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-slopegraph-aria-desc"
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
  const baselineY = layout.panel.y + layout.panel.height;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-slopegraph"
      data-empty="false"
      data-series-count={layout.seriesCount}
      data-visible-series-count={layout.visibleSeriesCount}
      data-complete-count={layout.completeCount}
      data-rising-count={layout.risingCount}
      data-falling-count={layout.fallingCount}
      data-flat-count={layout.flatCount}
      data-start-x={layout.startX}
      data-end-x={layout.endX}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-slopegraph-aria-desc"
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
        data-section="chart-line-slopegraph-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-slopegraph-badge"
            data-rising-count={layout.risingCount}
            data-falling-count={layout.fallingCount}
            data-flat-count={layout.flatCount}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: '#0f172a',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-slopegraph-badge-icon"
              aria-hidden="true"
            >
              SLOPE
            </span>
            <span
              data-section="chart-line-slopegraph-badge-up"
              style={{ color: upColor }}
            >
              up={layout.risingCount}
            </span>
            <span
              data-section="chart-line-slopegraph-badge-down"
              style={{ color: downColor }}
            >
              down={layout.fallingCount}
            </span>
            <span
              data-section="chart-line-slopegraph-badge-flat"
              style={{ color: flatColor }}
            >
              flat={layout.flatCount}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-slopegraph-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-slopegraph-grid"
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
                    data-section="chart-line-slopegraph-grid-line"
                    x1={layout.panel.x}
                    x2={layout.panel.x + layout.panel.width}
                    y1={py}
                    y2={py}
                  />
                );
              })}
            </g>
          ) : null}

          {showColumnGuides ? (
            <g data-section="chart-line-slopegraph-column-guides">
              <line
                data-section="chart-line-slopegraph-column-guide"
                data-edge="start"
                x1={layout.leftColX}
                x2={layout.leftColX}
                y1={layout.panel.y}
                y2={baselineY}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-slopegraph-column-guide"
                data-edge="end"
                x1={layout.rightColX}
                x2={layout.rightColX}
                y1={layout.panel.y}
                y2={baselineY}
                stroke={axisColor}
                strokeWidth={1}
              />
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-slopegraph-axes">
              <g
                data-section="chart-line-slopegraph-ticks"
                data-axis="y"
                stroke={axisColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-slopegraph-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-slopegraph-tick-label"
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
              <text
                data-section="chart-line-slopegraph-column-label"
                data-edge="start"
                x={layout.leftColX}
                y={baselineY + 16}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                {formatX(layout.startX)}
              </text>
              <text
                data-section="chart-line-slopegraph-column-label"
                data-edge="end"
                x={layout.rightColX}
                y={baselineY + 16}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                {formatX(layout.endX)}
              </text>
              {yLabel ? (
                <text
                  data-section="chart-line-slopegraph-y-label"
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

          <g data-section="chart-line-slopegraph-series">
            {layout.series.map((s) => {
              if (!s.visible) return null;
              const color = resolveColor(s);
              const isHover = hoverId === s.id;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-slopegraph-series-group"
                  data-series-id={s.id}
                  data-series-color={color}
                  data-direction={s.direction}
                  data-complete={s.complete ? 'true' : 'false'}
                  data-delta={s.delta}
                >
                  {showTrajectory && s.trajectoryPath ? (
                    <path
                      data-section="chart-line-slopegraph-trajectory"
                      data-series-id={s.id}
                      d={s.trajectoryPath}
                      fill="none"
                      stroke={color}
                      strokeWidth={trajectoryStrokeWidth}
                      strokeOpacity={
                        DEFAULT_CHART_LINE_SLOPEGRAPH_TRAJECTORY_OPACITY
                      }
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {s.complete && s.slopePath ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label}: ${formatValue(s.startValue)} to ${formatValue(s.endValue)}, ${s.direction}`}
                      data-section="chart-line-slopegraph-slope-line"
                      data-series-id={s.id}
                      data-direction={s.direction}
                      d={s.slopePath}
                      fill="none"
                      stroke={color}
                      strokeWidth={isHover ? strokeWidth + 1 : strokeWidth}
                      strokeLinecap="round"
                      onMouseEnter={() => {
                        setHoverId(s.id);
                        if (s.startNode && s.endNode) {
                          setTooltipPos({
                            px: (s.startNode.px + s.endNode.px) / 2,
                            py: (s.startNode.py + s.endNode.py) / 2,
                          });
                        }
                      }}
                      onMouseLeave={clearHover}
                      onClick={() => onSeriesClick?.({ series: s })}
                    />
                  ) : null}
                  {showEndpointDots && s.complete && s.startNode
                    ? (() => {
                        const sn = s.startNode;
                        const en = s.endNode!;
                        return (
                          <g
                            data-section="chart-line-slopegraph-endpoints"
                            data-series-id={s.id}
                          >
                            <circle
                              role="graphics-symbol"
                              tabIndex={0}
                              aria-label={`${s.label} start: ${formatValue(sn.value)}`}
                              data-section="chart-line-slopegraph-endpoint"
                              data-series-id={s.id}
                              data-edge="start"
                              data-value={sn.value}
                              cx={sn.px}
                              cy={sn.py}
                              r={isHover ? dotRadius + 1 : dotRadius}
                              fill={color}
                              stroke="#ffffff"
                              strokeWidth={1.5}
                              onMouseEnter={() => {
                                setHoverId(s.id);
                                setTooltipPos({ px: sn.px, py: sn.py });
                              }}
                              onMouseLeave={clearHover}
                              onFocus={() => {
                                setHoverId(s.id);
                                setTooltipPos({ px: sn.px, py: sn.py });
                              }}
                              onBlur={clearHover}
                              onClick={() => onSeriesClick?.({ series: s })}
                            />
                            <circle
                              role="graphics-symbol"
                              tabIndex={0}
                              aria-label={`${s.label} end: ${formatValue(en.value)}`}
                              data-section="chart-line-slopegraph-endpoint"
                              data-series-id={s.id}
                              data-edge="end"
                              data-value={en.value}
                              cx={en.px}
                              cy={en.py}
                              r={isHover ? dotRadius + 1 : dotRadius}
                              fill={color}
                              stroke="#ffffff"
                              strokeWidth={1.5}
                              onMouseEnter={() => {
                                setHoverId(s.id);
                                setTooltipPos({ px: en.px, py: en.py });
                              }}
                              onMouseLeave={clearHover}
                              onFocus={() => {
                                setHoverId(s.id);
                                setTooltipPos({ px: en.px, py: en.py });
                              }}
                              onBlur={clearHover}
                              onClick={() => onSeriesClick?.({ series: s })}
                            />
                          </g>
                        );
                      })()
                    : null}
                  {showEndpointValues && s.complete && s.startNode ? (
                    <g
                      data-section="chart-line-slopegraph-endpoint-values"
                      data-series-id={s.id}
                    >
                      <text
                        data-section="chart-line-slopegraph-endpoint-value"
                        data-series-id={s.id}
                        data-edge="start"
                        x={s.startNode.px - dotRadius - 4}
                        y={s.startNode.py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fontWeight={600}
                        fill={color}
                        stroke="none"
                      >
                        {formatValue(s.startValue)}
                      </text>
                      <text
                        data-section="chart-line-slopegraph-endpoint-value"
                        data-series-id={s.id}
                        data-edge="end"
                        x={s.endNode!.px + dotRadius + 4}
                        y={s.endNode!.py + 3}
                        textAnchor="start"
                        fontSize={10}
                        fontWeight={600}
                        fill={color}
                        stroke="none"
                      >
                        {formatValue(s.endValue)}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>

        {showTooltip && hoverId && tooltipPos
          ? (() => {
              const s = layout.series.find((x) => x.id === hoverId);
              if (!s) return null;
              return (
                <div
                  data-section="chart-line-slopegraph-tooltip"
                  data-series-id={s.id}
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
                    data-section="chart-line-slopegraph-tooltip-label"
                    style={{ color: resolveColor(s), fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-slopegraph-tooltip-start">
                    start: {formatValue(s.startValue)}
                  </div>
                  <div data-section="chart-line-slopegraph-tooltip-end">
                    end: {formatValue(s.endValue)}
                  </div>
                  <div
                    data-section="chart-line-slopegraph-tooltip-delta"
                    style={{ fontWeight: 600 }}
                  >
                    delta: {s.delta >= 0 ? '+' : ''}
                    {formatValue(s.delta)} ({s.direction})
                  </div>
                  {isFiniteNumber(s.pctChange) ? (
                    <div data-section="chart-line-slopegraph-tooltip-pct">
                      change: {s.pctChange >= 0 ? '+' : ''}
                      {(s.pctChange * 100).toFixed(1)}%
                    </div>
                  ) : null}
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-slopegraph-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          {layout.series.map((s) => {
            const isHidden = hiddenSet.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                data-section="chart-line-slopegraph-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
                onClick={() => handleToggle(s.id)}
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
                  data-section="chart-line-slopegraph-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: s.color,
                  }}
                />
                <span data-section="chart-line-slopegraph-legend-label">
                  {s.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-slopegraph-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.risingCount} up / {layout.fallingCount} down /{' '}
            {layout.flatCount} flat
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineSlopegraph.displayName = 'ChartLineSlopegraph';
