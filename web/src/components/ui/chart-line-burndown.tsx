import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_BURNDOWN_WIDTH = 560;
export const DEFAULT_CHART_LINE_BURNDOWN_HEIGHT = 320;
export const DEFAULT_CHART_LINE_BURNDOWN_PADDING = 40;
export const DEFAULT_CHART_LINE_BURNDOWN_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_BURNDOWN_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_BURNDOWN_IDEAL_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_BURNDOWN_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_BURNDOWN_AHEAD_OPACITY = 0.18;
export const DEFAULT_CHART_LINE_BURNDOWN_BEHIND_OPACITY = 0.22;
export const DEFAULT_CHART_LINE_BURNDOWN_IDEAL_DASH = '6 4';
export const DEFAULT_CHART_LINE_BURNDOWN_AHEAD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_BURNDOWN_BEHIND_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_BURNDOWN_ON_TRACK_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_BURNDOWN_ACTUAL_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_BURNDOWN_IDEAL_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_BURNDOWN_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_BURNDOWN_AXIS_COLOR = '#cbd5e1';

export type ChartLineBurndownStatus = 'ahead' | 'behind' | 'on-track';

export interface ChartLineBurndownPoint {
  x: number;
  y: number;
}

export interface ChartLineBurndownLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  idealY: number;
  idealPy: number;
  delta: number;
  status: ChartLineBurndownStatus;
}

export interface ChartLineBurndownLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerWidth: number;
  innerHeight: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xTicks: number[];
  yTicks: number[];
  actualPoints: ChartLineBurndownLayoutPoint[];
  actualPath: string;
  idealStartPx: number;
  idealStartPy: number;
  idealEndPx: number;
  idealEndPy: number;
  idealPath: string;
  aheadFillPath: string;
  behindFillPath: string;
  startTotal: number;
  startX: number;
  endX: number;
  currentRemaining: number;
  currentDelta: number;
  currentStatus: ChartLineBurndownStatus;
  aheadCount: number;
  behindCount: number;
  onTrackCount: number;
  finiteCount: number;
  totalCount: number;
  daysRemaining: number;
}

export interface ComputeBurndownLayoutOptions {
  data: readonly ChartLineBurndownPoint[];
  width: number;
  height: number;
  padding: number;
  startTotal?: number;
  startX?: number;
  endX?: number;
  tickCount?: number;
  flatEpsilon?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineBurndownProps {
  data: readonly ChartLineBurndownPoint[];
  startTotal?: number;
  startX?: number;
  endX?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  flatEpsilon?: number;
  strokeWidth?: number;
  idealStrokeWidth?: number;
  dotRadius?: number;
  aheadOpacity?: number;
  behindOpacity?: number;
  idealDashArray?: string;
  aheadColor?: string;
  behindColor?: string;
  onTrackColor?: string;
  actualColor?: string;
  idealColor?: string;
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
  showStatusBadge?: boolean;
  showAheadFill?: boolean;
  showBehindFill?: boolean;
  showIdeal?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatDelta?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  actualLabel?: string;
  idealLabel?: string;
  onPointClick?: (payload: {
    point: ChartLineBurndownLayoutPoint;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getBurndownFinitePoints(
  points: readonly ChartLineBurndownPoint[] | null | undefined,
): ChartLineBurndownPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineBurndownPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function computeBurndownIdealY(
  x: number,
  startX: number,
  endX: number,
  startTotal: number,
): number {
  if (!isFiniteNumber(x) || !isFiniteNumber(startX) || !isFiniteNumber(endX)) {
    return Number.NaN;
  }
  if (!isFiniteNumber(startTotal)) return Number.NaN;
  if (endX === startX) return x <= startX ? startTotal : 0;
  if (x <= startX) return startTotal;
  if (x >= endX) return 0;
  const t = (x - startX) / (endX - startX);
  return startTotal * (1 - t);
}

export function classifyBurndownStatus(
  delta: number,
  flatEpsilon = 0,
): ChartLineBurndownStatus {
  if (!isFiniteNumber(delta)) return 'on-track';
  const eps = isFiniteNumber(flatEpsilon) && flatEpsilon >= 0 ? flatEpsilon : 0;
  if (delta > eps) return 'behind';
  if (delta < -eps) return 'ahead';
  return 'on-track';
}

function buildPath(points: readonly { px: number; py: number }[]): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const cmd = i === 0 ? 'M' : 'L';
    parts.push(`${cmd} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  return parts.join(' ');
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

function emptyLayout(
  width: number,
  height: number,
  padding: number,
): ChartLineBurndownLayout {
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  return {
    ok: false,
    width,
    height,
    padding,
    innerWidth,
    innerHeight,
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    xTicks: [],
    yTicks: [],
    actualPoints: [],
    actualPath: '',
    idealStartPx: 0,
    idealStartPy: 0,
    idealEndPx: 0,
    idealEndPy: 0,
    idealPath: '',
    aheadFillPath: '',
    behindFillPath: '',
    startTotal: 0,
    startX: 0,
    endX: 0,
    currentRemaining: 0,
    currentDelta: 0,
    currentStatus: 'on-track',
    aheadCount: 0,
    behindCount: 0,
    onTrackCount: 0,
    finiteCount: 0,
    totalCount: 0,
    daysRemaining: 0,
  };
}

export function computeBurndownLayout(
  options: ComputeBurndownLayoutOptions,
): ChartLineBurndownLayout {
  const {
    data,
    width,
    height,
    padding,
    startTotal: startTotalOpt,
    startX: startXOpt,
    endX: endXOpt,
    tickCount = DEFAULT_CHART_LINE_BURNDOWN_TICK_COUNT,
    flatEpsilon = 0,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const empty = emptyLayout(width, height, padding);
  if (empty.innerWidth <= 0 || empty.innerHeight <= 0) return empty;

  const finite = getBurndownFinitePoints(data);
  const totalCount = Array.isArray(data) ? data.length : 0;
  if (finite.length === 0) return empty;

  const sorted = [...finite].sort((a, b) => a.x - b.x);

  const startX = isFiniteNumber(startXOpt) ? startXOpt : sorted[0]!.x;
  const endX = isFiniteNumber(endXOpt) ? endXOpt : sorted[sorted.length - 1]!.x;
  const startTotal = isFiniteNumber(startTotalOpt)
    ? startTotalOpt
    : sorted[0]!.y;

  let xLo = startX;
  let xHi = endX;
  if (sorted[0]!.x < xLo) xLo = sorted[0]!.x;
  if (sorted[sorted.length - 1]!.x > xHi) xHi = sorted[sorted.length - 1]!.x;

  let yLo = 0;
  let yHi = startTotal;
  for (const p of sorted) {
    if (p.y < yLo) yLo = p.y;
    if (p.y > yHi) yHi = p.y;
  }

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
  const innerWidth = empty.innerWidth;
  const innerHeight = empty.innerHeight;

  const projectX = (x: number): number =>
    padding + ((x - xLo) / xRange) * innerWidth;
  const projectY = (y: number): number =>
    padding + innerHeight - ((y - yLo) / yRange) * innerHeight;

  let aheadCount = 0;
  let behindCount = 0;
  let onTrackCount = 0;

  const actualPoints: ChartLineBurndownLayoutPoint[] = sorted.map((p, i) => {
    const idealY = computeBurndownIdealY(p.x, startX, endX, startTotal);
    const delta = isFiniteNumber(idealY) ? p.y - idealY : 0;
    const status = classifyBurndownStatus(delta, flatEpsilon);
    if (status === 'ahead') aheadCount += 1;
    else if (status === 'behind') behindCount += 1;
    else onTrackCount += 1;
    return {
      index: i,
      x: p.x,
      y: p.y,
      px: projectX(p.x),
      py: projectY(p.y),
      idealY: isFiniteNumber(idealY) ? idealY : 0,
      idealPy: isFiniteNumber(idealY) ? projectY(idealY) : projectY(startTotal),
      delta,
      status,
    };
  });

  const actualPath = buildPath(actualPoints);
  const idealStartPx = projectX(startX);
  const idealStartPy = projectY(startTotal);
  const idealEndPx = projectX(endX);
  const idealEndPy = projectY(0);
  const idealPath = `M ${idealStartPx.toFixed(3)} ${idealStartPy.toFixed(3)} L ${idealEndPx.toFixed(3)} ${idealEndPy.toFixed(3)}`;

  const buildShading = (target: 'ahead' | 'behind'): string => {
    const segments: { actual: { px: number; py: number }[]; ideal: { px: number; py: number }[] }[] = [];
    let cur: { actual: { px: number; py: number }[]; ideal: { px: number; py: number }[] } | null = null;
    for (const p of actualPoints) {
      const inRegion = p.status === target;
      if (inRegion) {
        if (!cur) cur = { actual: [], ideal: [] };
        cur.actual.push({ px: p.px, py: p.py });
        cur.ideal.push({ px: p.px, py: p.idealPy });
      } else if (cur) {
        segments.push(cur);
        cur = null;
      }
    }
    if (cur) segments.push(cur);

    return segments
      .map((seg) => {
        if (seg.actual.length === 0) return '';
        const forward = seg.actual
          .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.px.toFixed(3)} ${pt.py.toFixed(3)}`)
          .join(' ');
        const back = [...seg.ideal]
          .reverse()
          .map((pt) => `L ${pt.px.toFixed(3)} ${pt.py.toFixed(3)}`)
          .join(' ');
        return `${forward} ${back} Z`;
      })
      .filter(Boolean)
      .join(' ');
  };

  const aheadFillPath = buildShading('ahead');
  const behindFillPath = buildShading('behind');

  const last = actualPoints[actualPoints.length - 1]!;
  const currentRemaining = last.y;
  const currentDelta = last.delta;
  const currentStatus = last.status;
  const daysRemaining = endX > last.x ? endX - last.x : 0;

  return {
    ok: true,
    width,
    height,
    padding,
    innerWidth,
    innerHeight,
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    xTicks: computeTicks(xLo, xHi, tickCount),
    yTicks: computeTicks(yLo, yHi, tickCount),
    actualPoints,
    actualPath,
    idealStartPx,
    idealStartPy,
    idealEndPx,
    idealEndPy,
    idealPath,
    aheadFillPath,
    behindFillPath,
    startTotal,
    startX,
    endX,
    currentRemaining,
    currentDelta,
    currentStatus,
    aheadCount,
    behindCount,
    onTrackCount,
    finiteCount: sorted.length,
    totalCount,
    daysRemaining,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeBurndownChart(
  data: readonly ChartLineBurndownPoint[] | null | undefined,
  options?: {
    startTotal?: number;
    startX?: number;
    endX?: number;
    formatValue?: (n: number) => string;
    formatDelta?: (n: number) => string;
  },
): string {
  const fmt = options?.formatValue ?? defaultFormatValue;
  const fmtDelta = options?.formatDelta ?? defaultFormatValue;
  const finite = getBurndownFinitePoints(data);
  if (finite.length === 0) return 'No data';
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const startX = isFiniteNumber(options?.startX) ? options!.startX! : sorted[0]!.x;
  const endX = isFiniteNumber(options?.endX) ? options!.endX! : sorted[sorted.length - 1]!.x;
  const startTotal = isFiniteNumber(options?.startTotal)
    ? options!.startTotal!
    : sorted[0]!.y;
  const last = sorted[sorted.length - 1]!;
  const idealY = computeBurndownIdealY(last.x, startX, endX, startTotal);
  const delta = isFiniteNumber(idealY) ? last.y - idealY : 0;
  const status = classifyBurndownStatus(delta);
  return `Burndown chart: scope ${fmt(startTotal)}; current remaining ${fmt(last.y)}; ${status} by ${fmtDelta(Math.abs(delta))}.`;
}

export const ChartLineBurndown = forwardRef<
  HTMLDivElement,
  ChartLineBurndownProps
>(function ChartLineBurndown(
  props: ChartLineBurndownProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    startTotal,
    startX,
    endX,
    width = DEFAULT_CHART_LINE_BURNDOWN_WIDTH,
    height = DEFAULT_CHART_LINE_BURNDOWN_HEIGHT,
    padding = DEFAULT_CHART_LINE_BURNDOWN_PADDING,
    tickCount = DEFAULT_CHART_LINE_BURNDOWN_TICK_COUNT,
    flatEpsilon = 0,
    strokeWidth = DEFAULT_CHART_LINE_BURNDOWN_STROKE_WIDTH,
    idealStrokeWidth = DEFAULT_CHART_LINE_BURNDOWN_IDEAL_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_BURNDOWN_DOT_RADIUS,
    aheadOpacity = DEFAULT_CHART_LINE_BURNDOWN_AHEAD_OPACITY,
    behindOpacity = DEFAULT_CHART_LINE_BURNDOWN_BEHIND_OPACITY,
    idealDashArray = DEFAULT_CHART_LINE_BURNDOWN_IDEAL_DASH,
    aheadColor = DEFAULT_CHART_LINE_BURNDOWN_AHEAD_COLOR,
    behindColor = DEFAULT_CHART_LINE_BURNDOWN_BEHIND_COLOR,
    onTrackColor = DEFAULT_CHART_LINE_BURNDOWN_ON_TRACK_COLOR,
    actualColor = DEFAULT_CHART_LINE_BURNDOWN_ACTUAL_COLOR,
    idealColor = DEFAULT_CHART_LINE_BURNDOWN_IDEAL_COLOR,
    gridColor = DEFAULT_CHART_LINE_BURNDOWN_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_BURNDOWN_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showStatusBadge = true,
    showAheadFill = true,
    showBehindFill = true,
    showIdeal = true,
    animate = true,
    className,
    ariaLabel = 'Burndown chart with ideal vs actual trajectory',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    formatDelta = defaultFormatValue,
    xLabel,
    yLabel = 'Remaining work',
    actualLabel = 'Actual',
    idealLabel = 'Ideal',
    onPointClick,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const layout = useMemo(
    () =>
      computeBurndownLayout({
        data,
        width,
        height,
        padding,
        tickCount,
        flatEpsilon,
        ...(isFiniteNumber(startTotal) ? { startTotal } : {}),
        ...(isFiniteNumber(startX) ? { startX } : {}),
        ...(isFiniteNumber(endX) ? { endX } : {}),
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(yMin) ? { yMin } : {}),
        ...(isFiniteNumber(yMax) ? { yMax } : {}),
      }),
    [
      data,
      width,
      height,
      padding,
      tickCount,
      flatEpsilon,
      startTotal,
      startX,
      endX,
      xMin,
      xMax,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeBurndownChart(data, {
        ...(isFiniteNumber(startTotal) ? { startTotal } : {}),
        ...(isFiniteNumber(startX) ? { startX } : {}),
        ...(isFiniteNumber(endX) ? { endX } : {}),
        formatValue,
        formatDelta,
      }),
    [ariaDescription, data, startTotal, startX, endX, formatValue, formatDelta],
  );

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const clearHover = useCallback(() => setHoverIndex(null), []);

  const statusColor =
    layout.currentStatus === 'ahead'
      ? aheadColor
      : layout.currentStatus === 'behind'
        ? behindColor
        : onTrackColor;

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
        data-section="chart-line-burndown"
        data-empty="true"
        data-total-points={0}
        data-status="on-track"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-burndown-aria-desc"
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
      data-section="chart-line-burndown"
      data-empty="false"
      data-total-points={layout.finiteCount}
      data-start-total={layout.startTotal}
      data-current-remaining={layout.currentRemaining}
      data-current-delta={layout.currentDelta}
      data-status={layout.currentStatus}
      data-ahead-count={layout.aheadCount}
      data-behind-count={layout.behindCount}
      data-on-track-count={layout.onTrackCount}
      data-days-remaining={layout.daysRemaining}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-burndown-aria-desc"
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
        data-section="chart-line-burndown-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showStatusBadge ? (
          <div
            data-section="chart-line-burndown-badge"
            data-status={layout.currentStatus}
            data-delta={layout.currentDelta}
            data-remaining={layout.currentRemaining}
            data-days-remaining={layout.daysRemaining}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: statusColor,
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-burndown-badge-icon"
              aria-hidden="true"
            >
              {layout.currentStatus === 'ahead'
                ? '▼'
                : layout.currentStatus === 'behind'
                  ? '▲'
                  : '◆'}
            </span>
            <span data-section="chart-line-burndown-badge-status">
              {layout.currentStatus}
            </span>
            <span data-section="chart-line-burndown-badge-delta">
              {layout.currentDelta >= 0
                ? `+${formatDelta(layout.currentDelta)}`
                : formatDelta(layout.currentDelta)}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-burndown-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-burndown-grid"
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
                    data-section="chart-line-burndown-grid-line"
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
                    data-section="chart-line-burndown-grid-line"
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
              data-section="chart-line-burndown-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-burndown-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
              />
              <line
                data-section="chart-line-burndown-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
              />
              <g data-section="chart-line-burndown-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    padding +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.innerWidth;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-burndown-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={padding + layout.innerHeight}
                        y2={padding + layout.innerHeight + 4}
                      />
                      <text
                        data-section="chart-line-burndown-tick-label"
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
              <g data-section="chart-line-burndown-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    padding +
                    layout.innerHeight -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.innerHeight;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-burndown-tick"
                      data-axis="y"
                    >
                      <line x1={padding - 4} x2={padding} y1={py} y2={py} />
                      <text
                        data-section="chart-line-burndown-tick-label"
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
                  data-section="chart-line-burndown-x-label"
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
                  data-section="chart-line-burndown-y-label"
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

          {showAheadFill && layout.aheadFillPath ? (
            <path
              data-section="chart-line-burndown-fill"
              data-status="ahead"
              d={layout.aheadFillPath}
              fill={aheadColor}
              fillOpacity={aheadOpacity}
              stroke="none"
              pointerEvents="none"
            />
          ) : null}
          {showBehindFill && layout.behindFillPath ? (
            <path
              data-section="chart-line-burndown-fill"
              data-status="behind"
              d={layout.behindFillPath}
              fill={behindColor}
              fillOpacity={behindOpacity}
              stroke="none"
              pointerEvents="none"
            />
          ) : null}

          {showIdeal ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`${idealLabel} burndown line from ${formatValue(layout.startTotal)} to 0`}
              data-section="chart-line-burndown-ideal"
              data-kind="ideal"
              d={layout.idealPath}
              fill="none"
              stroke={idealColor}
              strokeWidth={idealStrokeWidth}
              strokeDasharray={idealDashArray}
              strokeLinecap="round"
            />
          ) : null}

          {layout.actualPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`${actualLabel} burndown trajectory`}
              data-section="chart-line-burndown-actual"
              data-kind="actual"
              d={layout.actualPath}
              fill="none"
              stroke={actualColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {showDots
            ? layout.actualPoints.map((p) => {
                const isHover = hoverIndex === p.index;
                const dotColor =
                  p.status === 'ahead'
                    ? aheadColor
                    : p.status === 'behind'
                      ? behindColor
                      : actualColor;
                return (
                  <circle
                    key={`d-${p.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Day ${formatX(p.x)} remaining ${formatValue(p.y)} ideal ${formatValue(p.idealY)} ${p.status} by ${formatDelta(Math.abs(p.delta))}`}
                    data-section="chart-line-burndown-dot"
                    data-point-index={p.index}
                    data-x={p.x}
                    data-y={p.y}
                    data-ideal-y={p.idealY}
                    data-delta={p.delta}
                    data-status={p.status}
                    data-hovered={isHover ? 'true' : 'false'}
                    cx={p.px}
                    cy={p.py}
                    r={isHover ? dotRadius + 1 : dotRadius}
                    fill={dotColor}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => setHoverIndex(p.index)}
                    onMouseLeave={clearHover}
                    onFocus={() => setHoverIndex(p.index)}
                    onBlur={clearHover}
                    onClick={() => onPointClick?.({ point: p })}
                  />
                );
              })
            : null}
        </svg>

        {showTooltip && hoverIndex !== null && layout.actualPoints[hoverIndex]
          ? (() => {
              const p = layout.actualPoints[hoverIndex]!;
              const tipStatusColor =
                p.status === 'ahead'
                  ? aheadColor
                  : p.status === 'behind'
                    ? behindColor
                    : onTrackColor;
              return (
                <div
                  data-section="chart-line-burndown-tooltip"
                  data-point-index={p.index}
                  data-status={p.status}
                  style={{
                    position: 'absolute',
                    left: p.px + 8,
                    top: p.py + 8,
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
                    data-section="chart-line-burndown-tooltip-label"
                    style={{ color: actualColor, fontWeight: 600 }}
                  >
                    {actualLabel}
                  </div>
                  <div data-section="chart-line-burndown-tooltip-x">
                    {formatX(p.x)}
                  </div>
                  <div
                    data-section="chart-line-burndown-tooltip-actual"
                    style={{ fontWeight: 600 }}
                  >
                    remaining: {formatValue(p.y)}
                  </div>
                  <div data-section="chart-line-burndown-tooltip-ideal">
                    ideal: {formatValue(p.idealY)}
                  </div>
                  <div
                    data-section="chart-line-burndown-tooltip-status"
                    style={{ color: tipStatusColor }}
                  >
                    {p.status}{' '}
                    {p.delta >= 0
                      ? `(+${formatDelta(p.delta)})`
                      : `(${formatDelta(p.delta)})`}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-burndown-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
            fontSize: 11,
          }}
        >
          <span
            data-section="chart-line-burndown-legend-item"
            data-kind="actual"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span
              data-section="chart-line-burndown-legend-swatch"
              data-kind="actual"
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 2,
                background: actualColor,
              }}
            />
            <span data-section="chart-line-burndown-legend-label">
              {actualLabel}
            </span>
          </span>
          <span
            data-section="chart-line-burndown-legend-item"
            data-kind="ideal"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span
              data-section="chart-line-burndown-legend-swatch"
              data-kind="ideal"
              style={{
                display: 'inline-block',
                width: 14,
                height: 2,
                background: idealColor,
                borderTop: `2px dashed ${idealColor}`,
              }}
            />
            <span data-section="chart-line-burndown-legend-label">
              {idealLabel}
            </span>
          </span>
          <span
            data-section="chart-line-burndown-legend-item"
            data-kind="status"
            style={{ color: statusColor }}
          >
            {layout.currentStatus} by {formatDelta(Math.abs(layout.currentDelta))}
          </span>
          <span
            data-section="chart-line-burndown-legend-total-points"
            style={{ color: '#64748b' }}
          >
            {layout.finiteCount} sample{layout.finiteCount === 1 ? '' : 's'}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineBurndown.displayName = 'ChartLineBurndown';
