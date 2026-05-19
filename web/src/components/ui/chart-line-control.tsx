import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CONTROL_WIDTH = 560;
export const DEFAULT_CHART_LINE_CONTROL_HEIGHT = 320;
export const DEFAULT_CHART_LINE_CONTROL_PADDING = 40;
export const DEFAULT_CHART_LINE_CONTROL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CONTROL_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_CONTROL_LIMIT_STROKE_WIDTH = 1.25;
export const DEFAULT_CHART_LINE_CONTROL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CONTROL_K_SIGMA = 3;
export const DEFAULT_CHART_LINE_CONTROL_LIMIT_OPACITY = 0.85;
export const DEFAULT_CHART_LINE_CONTROL_FILL_OPACITY = 0.08;
export const DEFAULT_CHART_LINE_CONTROL_LIMIT_DASH = '6 4';
export const DEFAULT_CHART_LINE_CONTROL_CENTER_COLOR = '#0f766e';
export const DEFAULT_CHART_LINE_CONTROL_LIMIT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CONTROL_OUT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CONTROL_IN_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CONTROL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CONTROL_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CONTROL_PALETTE = [
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

export type ChartLineControlState = 'in' | 'above' | 'below';

export interface ChartLineControlPoint {
  x: number;
  y: number;
}

export interface ChartLineControlSeries {
  id: string;
  label: string;
  data: readonly ChartLineControlPoint[];
  color?: string;
  kSigma?: number;
  centerLine?: number;
  sigma?: number;
}

export interface ChartLineControlStats {
  mean: number;
  sigma: number;
  ucl: number;
  lcl: number;
  count: number;
  ok: boolean;
  kSigma: number;
}

export interface ChartLineControlLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  state: ChartLineControlState;
  outOfControl: boolean;
  deviation: number;
}

export interface ChartLineControlLayoutSeries {
  id: string;
  label: string;
  color: string;
  stats: ChartLineControlStats;
  points: ChartLineControlLayoutPoint[];
  path: string;
  centerPy: number;
  uclPy: number;
  lclPy: number;
  outOfControlCount: number;
  aboveCount: number;
  belowCount: number;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineControlLayoutResult {
  series: ChartLineControlLayoutSeries[];
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

export interface ComputeLineControlLayoutOptions {
  series: readonly ChartLineControlSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  kSigma?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineControlProps {
  series: readonly ChartLineControlSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  kSigma?: number;
  strokeWidth?: number;
  limitStrokeWidth?: number;
  dotRadius?: number;
  limitOpacity?: number;
  fillOpacity?: number;
  limitDashArray?: string;
  centerColor?: string;
  limitColor?: string;
  outColor?: string;
  inColor?: string;
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
  showControlBadge?: boolean;
  showInControlFill?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatSigma?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineControlLayoutSeries;
    point: ChartLineControlLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineControlSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineControlDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_CONTROL_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineControlFinitePoints(
  points: readonly ChartLineControlPoint[] | null | undefined,
): ChartLineControlPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineControlPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineControlKSigma(value: unknown): number {
  if (!isFiniteNumber(value) || value <= 0) {
    return DEFAULT_CHART_LINE_CONTROL_K_SIGMA;
  }
  return value;
}

export function computeLineControlStats(
  points: readonly ChartLineControlPoint[] | null | undefined,
  options?: {
    kSigma?: number;
    centerLine?: number;
    sigma?: number;
  },
): ChartLineControlStats {
  const k = normaliseLineControlKSigma(options?.kSigma);
  const finite = getLineControlFinitePoints(points);

  if (finite.length === 0) {
    return {
      mean: 0,
      sigma: 0,
      ucl: 0,
      lcl: 0,
      count: 0,
      ok: false,
      kSigma: k,
    };
  }

  // mean
  let sum = 0;
  for (const p of finite) sum += p.y;
  const dataMean = sum / finite.length;

  // sigma (population standard deviation: divide by N).
  let varSum = 0;
  for (const p of finite) {
    const d = p.y - dataMean;
    varSum += d * d;
  }
  const dataSigma = Math.sqrt(varSum / finite.length);

  const mean = isFiniteNumber(options?.centerLine) ? options!.centerLine! : dataMean;
  const sigma =
    isFiniteNumber(options?.sigma) && options!.sigma! >= 0
      ? options!.sigma!
      : dataSigma;

  return {
    mean,
    sigma,
    ucl: mean + k * sigma,
    lcl: mean - k * sigma,
    count: finite.length,
    ok: true,
    kSigma: k,
  };
}

export function classifyLineControlState(
  value: number,
  stats: ChartLineControlStats,
): ChartLineControlState {
  if (!stats.ok || !isFiniteNumber(value)) return 'in';
  if (value > stats.ucl) return 'above';
  if (value < stats.lcl) return 'below';
  return 'in';
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

export function computeLineControlLayout(
  options: ComputeLineControlLayoutOptions,
): ComputeLineControlLayoutResult {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_CONTROL_TICK_COUNT,
    kSigma,
    defaultColors = DEFAULT_CHART_LINE_CONTROL_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ComputeLineControlLayoutResult = {
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

  const chartK = normaliseLineControlKSigma(kSigma);

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let totalPoints = 0;

  const sortedBySeries = new Map<string, ChartLineControlPoint[]>();
  const statsBySeries = new Map<string, ChartLineControlStats>();

  for (const s of visible) {
    const finite = getLineControlFinitePoints(s.data).slice().sort((a, b) => a.x - b.x);
    sortedBySeries.set(s.id, finite);
    totalPoints += finite.length;
    const seriesK = isFiniteNumber(s.kSigma) && s.kSigma! > 0 ? s.kSigma! : chartK;
    const stats = computeLineControlStats(finite, {
      kSigma: seriesK,
      ...(isFiniteNumber(s.centerLine) ? { centerLine: s.centerLine! } : {}),
      ...(isFiniteNumber(s.sigma) && s.sigma! >= 0 ? { sigma: s.sigma! } : {}),
    });
    statsBySeries.set(s.id, stats);
    for (const p of finite) {
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
      if (p.y < yLo) yLo = p.y;
      if (p.y > yHi) yHi = p.y;
    }
    if (stats.ok) {
      if (stats.ucl > yHi) yHi = stats.ucl;
      if (stats.lcl < yLo) yLo = stats.lcl;
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

  const projectX = (x: number): number =>
    padding + ((x - xLo) / xRange) * innerWidth;
  const projectY = (y: number): number =>
    padding + innerHeight - ((y - yLo) / yRange) * innerHeight;

  const layoutSeries: ChartLineControlLayoutSeries[] = visible.map((s, idx) => {
    const finite = sortedBySeries.get(s.id) ?? [];
    const stats =
      statsBySeries.get(s.id) ??
      computeLineControlStats([], { kSigma: chartK });
    const color =
      s.color ?? defaultColors[idx % defaultColors.length] ?? DEFAULT_CHART_LINE_CONTROL_PALETTE[0]!;

    let aboveCount = 0;
    let belowCount = 0;
    let outCount = 0;

    const layoutPoints: ChartLineControlLayoutPoint[] = finite.map((p, i) => {
      const state = classifyLineControlState(p.y, stats);
      const isOut = state !== 'in';
      if (state === 'above') {
        aboveCount += 1;
        outCount += 1;
      } else if (state === 'below') {
        belowCount += 1;
        outCount += 1;
      }
      const deviation =
        stats.sigma > 0 && stats.ok ? (p.y - stats.mean) / stats.sigma : 0;
      return {
        index: i,
        x: p.x,
        y: p.y,
        px: projectX(p.x),
        py: projectY(p.y),
        state,
        outOfControl: isOut,
        deviation,
      };
    });

    const path = buildPath(layoutPoints);
    const centerPy = projectY(stats.mean);
    const uclPy = projectY(stats.ucl);
    const lclPy = projectY(stats.lcl);

    return {
      id: s.id,
      label: s.label,
      color,
      stats,
      points: layoutPoints,
      path,
      centerPy,
      uclPy,
      lclPy,
      outOfControlCount: outCount,
      aboveCount,
      belowCount,
      finiteCount: finite.length,
      totalCount: s.data?.length ?? 0,
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

export function describeLineControlChart(
  series: readonly ChartLineControlSeries[] | null | undefined,
  hidden?: ReadonlySet<string> | readonly string[],
  kSigma?: number,
  formatValue: (n: number) => string = defaultFormatValue,
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const chartK = normaliseLineControlKSigma(kSigma);

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const finite = getLineControlFinitePoints(s.data);
    totalPoints += finite.length;
    const seriesK =
      isFiniteNumber(s.kSigma) && s.kSigma! > 0 ? s.kSigma! : chartK;
    const stats = computeLineControlStats(finite, {
      kSigma: seriesK,
      ...(isFiniteNumber(s.centerLine) ? { centerLine: s.centerLine! } : {}),
      ...(isFiniteNumber(s.sigma) && s.sigma! >= 0 ? { sigma: s.sigma! } : {}),
    });
    let outCount = 0;
    for (const p of finite) {
      const st = classifyLineControlState(p.y, stats);
      if (st !== 'in') outCount += 1;
    }
    summaries.push(
      `${s.label}: CL ${formatValue(stats.mean)} sigma ${formatValue(stats.sigma)} UCL ${formatValue(stats.ucl)} LCL ${formatValue(stats.lcl)} out ${outCount}`,
    );
  }
  if (totalPoints === 0) return 'No data';

  return `Control chart with +-${chartK} sigma limits across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineControl = forwardRef<
  HTMLDivElement,
  ChartLineControlProps
>(function ChartLineControl(
  props: ChartLineControlProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_CONTROL_WIDTH,
    height = DEFAULT_CHART_LINE_CONTROL_HEIGHT,
    padding = DEFAULT_CHART_LINE_CONTROL_PADDING,
    tickCount = DEFAULT_CHART_LINE_CONTROL_TICK_COUNT,
    kSigma = DEFAULT_CHART_LINE_CONTROL_K_SIGMA,
    strokeWidth = DEFAULT_CHART_LINE_CONTROL_STROKE_WIDTH,
    limitStrokeWidth = DEFAULT_CHART_LINE_CONTROL_LIMIT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CONTROL_DOT_RADIUS,
    limitOpacity = DEFAULT_CHART_LINE_CONTROL_LIMIT_OPACITY,
    fillOpacity = DEFAULT_CHART_LINE_CONTROL_FILL_OPACITY,
    limitDashArray = DEFAULT_CHART_LINE_CONTROL_LIMIT_DASH,
    centerColor = DEFAULT_CHART_LINE_CONTROL_CENTER_COLOR,
    limitColor = DEFAULT_CHART_LINE_CONTROL_LIMIT_COLOR,
    outColor = DEFAULT_CHART_LINE_CONTROL_OUT_COLOR,
    inColor = DEFAULT_CHART_LINE_CONTROL_IN_COLOR,
    gridColor = DEFAULT_CHART_LINE_CONTROL_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CONTROL_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showControlBadge = true,
    showInControlFill = true,
    animate = true,
    className,
    ariaLabel = 'Statistical process control chart with +-sigma limits',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    formatSigma = defaultFormatValue,
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
      computeLineControlLayout({
        series,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        tickCount,
        kSigma,
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
      kSigma,
      xMin,
      xMax,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineControlChart(series, hiddenSet, kSigma, formatValue),
    [ariaDescription, series, hiddenSet, kSigma, formatValue],
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
    (s: ChartLineControlSeries) => {
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
        (acc, s) => acc + getLineControlFinitePoints(s.data).length,
        0,
      ),
    [series],
  );

  const totalOutOfControl = useMemo(
    () => layout.series.reduce((acc, s) => acc + s.outOfControlCount, 0),
    [layout.series],
  );

  const badgeColor = totalOutOfControl > 0 ? outColor : centerColor;

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
        data-section="chart-line-control"
        data-empty="true"
        data-series-count={series.length}
        data-visible-series-count={0}
        data-total-points={0}
        data-k-sigma={normaliseLineControlKSigma(kSigma)}
        data-out-of-control-count={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-control-aria-desc"
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
      data-section="chart-line-control"
      data-empty="false"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-k-sigma={normaliseLineControlKSigma(kSigma)}
      data-out-of-control-count={totalOutOfControl}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-control-aria-desc"
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
        data-section="chart-line-control-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showControlBadge ? (
          <div
            data-section="chart-line-control-badge"
            data-out-of-control-count={totalOutOfControl}
            data-state={totalOutOfControl > 0 ? 'alert' : 'ok'}
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
              data-section="chart-line-control-badge-icon"
              aria-hidden="true"
            >
              {totalOutOfControl > 0 ? '!' : '✓'}
            </span>
            <span data-section="chart-line-control-badge-count">
              {totalOutOfControl}
            </span>
            <span data-section="chart-line-control-badge-label">
              {totalOutOfControl === 1 ? 'out of control' : 'out of control'}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-control-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-control-grid"
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
                    data-section="chart-line-control-grid-line"
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
                    data-section="chart-line-control-grid-line"
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
              data-section="chart-line-control-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-control-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
              />
              <line
                data-section="chart-line-control-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
              />
              <g data-section="chart-line-control-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    padding +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.innerWidth;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-control-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={padding + layout.innerHeight}
                        y2={padding + layout.innerHeight + 4}
                      />
                      <text
                        data-section="chart-line-control-tick-label"
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
              <g data-section="chart-line-control-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    padding +
                    layout.innerHeight -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.innerHeight;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-control-tick"
                      data-axis="y"
                    >
                      <line x1={padding - 4} x2={padding} y1={py} y2={py} />
                      <text
                        data-section="chart-line-control-tick-label"
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
                  data-section="chart-line-control-x-label"
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
                  data-section="chart-line-control-y-label"
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

          <g data-section="chart-line-control-series">
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-control-series-group"
                data-series-id={s.id}
                data-series-color={s.color}
                data-series-mean={s.stats.mean}
                data-series-sigma={s.stats.sigma}
                data-series-ucl={s.stats.ucl}
                data-series-lcl={s.stats.lcl}
                data-series-k-sigma={s.stats.kSigma}
                data-series-out-of-control-count={s.outOfControlCount}
                data-series-above-count={s.aboveCount}
                data-series-below-count={s.belowCount}
                data-series-finite-count={s.finiteCount}
              >
                {showInControlFill && s.stats.ok ? (
                  <rect
                    data-section="chart-line-control-in-control-fill"
                    data-series-id={s.id}
                    x={padding}
                    y={s.uclPy}
                    width={layout.innerWidth}
                    height={Math.max(0, s.lclPy - s.uclPy)}
                    fill={s.color}
                    fillOpacity={fillOpacity}
                    stroke="none"
                    pointerEvents="none"
                  />
                ) : null}
                {s.stats.ok ? (
                  <line
                    role="graphics-symbol"
                    aria-label={`${s.label} center line at ${formatValue(s.stats.mean)}`}
                    data-section="chart-line-control-center-line"
                    data-series-id={s.id}
                    data-kind="cl"
                    data-value={s.stats.mean}
                    x1={padding}
                    x2={padding + layout.innerWidth}
                    y1={s.centerPy}
                    y2={s.centerPy}
                    stroke={centerColor}
                    strokeWidth={limitStrokeWidth}
                    strokeOpacity={limitOpacity}
                  />
                ) : null}
                {s.stats.ok ? (
                  <line
                    role="graphics-symbol"
                    aria-label={`${s.label} upper control limit at ${formatValue(s.stats.ucl)} (+${formatSigma(s.stats.kSigma)} sigma)`}
                    data-section="chart-line-control-limit"
                    data-series-id={s.id}
                    data-kind="ucl"
                    data-value={s.stats.ucl}
                    x1={padding}
                    x2={padding + layout.innerWidth}
                    y1={s.uclPy}
                    y2={s.uclPy}
                    stroke={limitColor}
                    strokeWidth={limitStrokeWidth}
                    strokeOpacity={limitOpacity}
                    strokeDasharray={limitDashArray}
                  />
                ) : null}
                {s.stats.ok ? (
                  <line
                    role="graphics-symbol"
                    aria-label={`${s.label} lower control limit at ${formatValue(s.stats.lcl)} (-${formatSigma(s.stats.kSigma)} sigma)`}
                    data-section="chart-line-control-limit"
                    data-series-id={s.id}
                    data-kind="lcl"
                    data-value={s.stats.lcl}
                    x1={padding}
                    x2={padding + layout.innerWidth}
                    y1={s.lclPy}
                    y2={s.lclPy}
                    stroke={limitColor}
                    strokeWidth={limitStrokeWidth}
                    strokeOpacity={limitOpacity}
                    strokeDasharray={limitDashArray}
                  />
                ) : null}
                {s.path ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} process series`}
                    data-section="chart-line-control-path"
                    data-series-id={s.id}
                    d={s.path}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showDots
                  ? s.points.map((p) => {
                      const isHover =
                        hoverPayload?.seriesId === s.id &&
                        hoverPayload?.pointIndex === p.index;
                      const dotColor = p.outOfControl ? outColor : inColor;
                      return (
                        <circle
                          key={`d-${p.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)} y ${formatValue(p.y)}${
                            p.outOfControl
                              ? `; out of control (${p.state})`
                              : '; in control'
                          }`}
                          data-section="chart-line-control-dot"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-x={p.x}
                          data-y={p.y}
                          data-state={p.state}
                          data-out-of-control={p.outOfControl ? 'true' : 'false'}
                          data-deviation={p.deviation}
                          data-hovered={isHover ? 'true' : 'false'}
                          cx={p.px}
                          cy={p.py}
                          r={p.outOfControl ? dotRadius + 1 : dotRadius}
                          fill={dotColor}
                          stroke="#ffffff"
                          strokeWidth={1}
                          onMouseEnter={() => {
                            setHoverPayload({
                              seriesId: s.id,
                              pointIndex: p.index,
                            });
                            setTooltipPos({ px: p.px, py: p.py });
                          }}
                          onMouseLeave={clearHover}
                          onFocus={() => {
                            setHoverPayload({
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
              const p = s.points[hoverPayload.pointIndex];
              if (!p) return null;
              const tipStateColor = p.outOfControl ? outColor : inColor;
              return (
                <div
                  data-section="chart-line-control-tooltip"
                  data-series-id={s.id}
                  data-point-index={p.index}
                  data-state={p.state}
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
                    minWidth: 140,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-control-tooltip-label"
                    style={{ color: s.color, fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-control-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div
                    data-section="chart-line-control-tooltip-y"
                    style={{ fontWeight: 600 }}
                  >
                    y: {formatValue(p.y)}
                  </div>
                  <div data-section="chart-line-control-tooltip-cl">
                    CL: {formatValue(s.stats.mean)}
                  </div>
                  <div
                    data-section="chart-line-control-tooltip-state"
                    style={{ color: tipStateColor }}
                  >
                    {p.outOfControl
                      ? `out of control (${p.state})`
                      : 'in control'}
                    {' '}({formatSigma(p.deviation)} sigma)
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-control-legend"
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
              DEFAULT_CHART_LINE_CONTROL_PALETTE[0]!;
            return (
              <button
                key={s.id}
                type="button"
                data-section="chart-line-control-legend-item"
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
                  data-section="chart-line-control-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: swatchColor,
                  }}
                />
                <span data-section="chart-line-control-legend-label">
                  {s.label}
                </span>
                {layoutMatch ? (
                  <span
                    data-section="chart-line-control-legend-stats"
                    style={{ fontSize: 10, color: '#64748b' }}
                  >
                    (CL {formatValue(layoutMatch.stats.mean)}; out{' '}
                    {layoutMatch.outOfControlCount})
                  </span>
                ) : null}
              </button>
            );
          })}
          <span
            data-section="chart-line-control-legend-total-points"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {allTotalPoints} total points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineControl.displayName = 'ChartLineControl';
