import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_FIBONACCI_WIDTH = 560;
export const DEFAULT_CHART_LINE_FIBONACCI_HEIGHT = 320;
export const DEFAULT_CHART_LINE_FIBONACCI_PADDING = 40;
export const DEFAULT_CHART_LINE_FIBONACCI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FIBONACCI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_FIBONACCI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FIBONACCI_SWING_RADIUS = 5;
export const DEFAULT_CHART_LINE_FIBONACCI_RATIOS = [
  0, 0.236, 0.382, 0.5, 0.618, 0.786, 1,
];
export const DEFAULT_CHART_LINE_FIBONACCI_SERIES_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_FIBONACCI_LEVEL_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_FIBONACCI_ANCHOR_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_FIBONACCI_HIGH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_FIBONACCI_LOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_FIBONACCI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_FIBONACCI_AXIS_COLOR = '#cbd5e1';

export type ChartLineFibonacciTrend = 'up' | 'down' | 'flat';

export interface ChartLineFibonacciPoint {
  x: number;
  value: number;
}

export interface ChartLineFibonacciSwing {
  index: number;
  x: number;
  value: number;
}

export interface ChartLineFibonacciLevel {
  ratio: number;
  value: number;
}

export interface ChartLineFibonacciRun {
  series: ChartLineFibonacciPoint[];
  swingHigh: ChartLineFibonacciSwing | null;
  swingLow: ChartLineFibonacciSwing | null;
  trend: ChartLineFibonacciTrend;
  range: number;
  levels: ChartLineFibonacciLevel[];
  valueMin: number;
  valueMax: number;
  ok: boolean;
}

export interface ChartLineFibonacciLayoutPoint {
  index: number;
  x: number;
  value: number;
  px: number;
  py: number;
}

export interface ChartLineFibonacciLayoutLevel extends ChartLineFibonacciLevel {
  index: number;
  py: number;
}

export interface ChartLineFibonacciLayoutSwing extends ChartLineFibonacciSwing {
  px: number;
  py: number;
}

export interface ChartLineFibonacciLayout {
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
  linePath: string;
  dots: ChartLineFibonacciLayoutPoint[];
  levels: ChartLineFibonacciLayoutLevel[];
  swingHigh: ChartLineFibonacciLayoutSwing | null;
  swingLow: ChartLineFibonacciLayoutSwing | null;
  anchorPath: string;
  trend: ChartLineFibonacciTrend;
  range: number;
  totalPoints: number;
}

export interface ComputeLineFibonacciLayoutOptions {
  data: readonly ChartLineFibonacciPoint[];
  ratios?: readonly number[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineFibonacciProps {
  data: readonly ChartLineFibonacciPoint[];
  ratios?: readonly number[];
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  swingRadius?: number;
  seriesColor?: string;
  levelColor?: string;
  anchorColor?: string;
  highColor?: string;
  lowColor?: string;
  gridColor?: string;
  axisColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLevels?: boolean;
  showLevelLabels?: boolean;
  showAnchor?: boolean;
  showSwings?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showFooter?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onLevelClick?: (payload: { level: ChartLineFibonacciLayoutLevel }) => void;
  onSampleClick?: (payload: { point: ChartLineFibonacciLayoutPoint }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineFibonacciFinitePoints(
  points: readonly ChartLineFibonacciPoint[] | null | undefined,
): ChartLineFibonacciPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineFibonacciPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a ratio set to a clean, ascending, de-duplicated list of
 * finite values in [0, 1]. Non-finite entries are dropped and
 * out-of-range entries are clamped; an empty result falls back to
 * the standard Fibonacci ratios.
 */
export function normalizeLineFibonacciRatios(
  ratios: readonly number[] | null | undefined,
): number[] {
  if (!Array.isArray(ratios)) {
    return [...DEFAULT_CHART_LINE_FIBONACCI_RATIOS];
  }
  const cleaned: number[] = [];
  const seen = new Set<number>();
  for (const r of ratios) {
    if (!isFiniteNumber(r)) continue;
    const c = r < 0 ? 0 : r > 1 ? 1 : r;
    if (!seen.has(c)) {
      seen.add(c);
      cleaned.push(c);
    }
  }
  if (cleaned.length === 0) {
    return [...DEFAULT_CHART_LINE_FIBONACCI_RATIOS];
  }
  cleaned.sort((a, b) => a - b);
  return cleaned;
}

/**
 * Detect the swing high (max value) and swing low (min value) of a
 * series and compute the Fibonacci retracement levels between them.
 *
 * The trend is `up` when the high occurs at or after the low, `down`
 * otherwise. The level at ratio `r` is measured from the swing END
 * (the later extreme) back toward the swing START: `value =
 * end - r * (end - start)`. So `r = 0` sits on the most recent
 * extreme and `r = 1` on the older one -- the standard retracement
 * grid. A series whose values are all equal has no range and is not
 * `ok`.
 */
export function runLineFibonacci(
  points: readonly ChartLineFibonacciPoint[] | null | undefined,
  ratios?: readonly number[],
): ChartLineFibonacciRun {
  const finite = getLineFibonacciFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const rs = normalizeLineFibonacciRatios(ratios);
  const n = series.length;

  if (n < 2) {
    return {
      series,
      swingHigh: null,
      swingLow: null,
      trend: 'flat',
      range: 0,
      levels: [],
      valueMin: n === 1 ? series[0]!.value : NaN,
      valueMax: n === 1 ? series[0]!.value : NaN,
      ok: false,
    };
  }

  let hiIdx = 0;
  let loIdx = 0;
  for (let i = 1; i < n; i += 1) {
    if (series[i]!.value > series[hiIdx]!.value) hiIdx = i;
    if (series[i]!.value < series[loIdx]!.value) loIdx = i;
  }
  const H = series[hiIdx]!.value;
  const L = series[loIdx]!.value;
  const swingHigh: ChartLineFibonacciSwing = {
    index: hiIdx,
    x: series[hiIdx]!.x,
    value: H,
  };
  const swingLow: ChartLineFibonacciSwing = {
    index: loIdx,
    x: series[loIdx]!.x,
    value: L,
  };

  if (H === L) {
    return {
      series,
      swingHigh,
      swingLow,
      trend: 'flat',
      range: 0,
      levels: [],
      valueMin: L,
      valueMax: H,
      ok: false,
    };
  }

  const trend: ChartLineFibonacciTrend =
    swingHigh.x >= swingLow.x ? 'up' : 'down';
  const swingEnd = trend === 'up' ? swingHigh : swingLow;
  const swingStart = trend === 'up' ? swingLow : swingHigh;
  const span = swingEnd.value - swingStart.value;
  const levels: ChartLineFibonacciLevel[] = rs.map((ratio) => ({
    ratio,
    value: swingEnd.value - ratio * span,
  }));

  return {
    series = [],
    swingHigh,
    swingLow,
    trend,
    range: H - L,
    levels,
    valueMin: L,
    valueMax: H,
    ok: true,
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

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineFibonacciLayout(
  options: ComputeLineFibonacciLayoutOptions,
): ChartLineFibonacciLayout {
  const {
    data,
    ratios,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_FIBONACCI_TICK_COUNT,
    xMin: xMinOverride,
    xMax: xMaxOverride,
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
  const run = runLineFibonacci(data, ratios);
  const empty: ChartLineFibonacciLayout = {
    ok: false,
    width,
    height,
    panel,
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    innerWidth,
    innerHeight,
    linePath: '',
    dots: [],
    levels: [],
    swingHigh: null,
    swingLow: null,
    anchorPath: '',
    trend: run.trend,
    range: run.range,
    totalPoints: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok || !run.swingHigh || !run.swingLow) return empty;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  for (const p of run.series) {
    if (p.x < xLo) xLo = p.x;
    if (p.x > xHi) xHi = p.x;
  }
  let yLo = run.valueMin;
  let yHi = run.valueMax;

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
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const dots: ChartLineFibonacciLayoutPoint[] = run.series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    px: projectX(p.x),
    py: projectY(p.value),
  }));

  const levels: ChartLineFibonacciLayoutLevel[] = run.levels.map(
    (lvl, i) => ({
      ...lvl,
      index: i,
      py: projectY(lvl.value),
    }),
  );

  const swingHigh: ChartLineFibonacciLayoutSwing = {
    ...run.swingHigh,
    px: projectX(run.swingHigh.x),
    py: projectY(run.swingHigh.value),
  };
  const swingLow: ChartLineFibonacciLayoutSwing = {
    ...run.swingLow,
    px: projectX(run.swingLow.x),
    py: projectY(run.swingLow.value),
  };

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
    linePath: buildPath(dots.map((d) => ({ px: d.px, py: d.py }))),
    dots,
    levels,
    swingHigh,
    swingLow,
    anchorPath: buildPath([
      { px: swingLow.px, py: swingLow.py },
      { px: swingHigh.px, py: swingHigh.py },
    ]),
    trend: run.trend,
    range: run.range,
    totalPoints: run.series.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function formatRatioPercent(ratio: number): string {
  if (!isFiniteNumber(ratio)) return '';
  const p = ratio * 100;
  return `${Number.isInteger(p) ? String(p) : p.toFixed(1)}%`;
}

export function describeLineFibonacciChart(
  data: readonly ChartLineFibonacciPoint[] | null | undefined,
  options?: { ratios?: readonly number[]; formatValue?: (n: number) => string },
): string {
  const run = runLineFibonacci(data, options?.ratios);
  if (!run.ok || !run.swingHigh || !run.swingLow) return 'No data';
  const fmt = options?.formatValue ?? defaultFormatValue;
  return `Line chart with Fibonacci retracement levels on ${run.trend === 'up' ? 'an' : 'a'} ${run.trend} swing from ${fmt(run.swingLow.value)} to ${fmt(run.swingHigh.value)}: ${run.levels.length} levels across a range of ${fmt(run.range)}.`;
}

export const ChartLineFibonacci = forwardRef<
  HTMLDivElement,
  ChartLineFibonacciProps
>(function ChartLineFibonacci(
  props: ChartLineFibonacciProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    ratios,
    width = DEFAULT_CHART_LINE_FIBONACCI_WIDTH,
    height = DEFAULT_CHART_LINE_FIBONACCI_HEIGHT,
    padding = DEFAULT_CHART_LINE_FIBONACCI_PADDING,
    tickCount = DEFAULT_CHART_LINE_FIBONACCI_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_FIBONACCI_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_FIBONACCI_DOT_RADIUS,
    swingRadius = DEFAULT_CHART_LINE_FIBONACCI_SWING_RADIUS,
    seriesColor = DEFAULT_CHART_LINE_FIBONACCI_SERIES_COLOR,
    levelColor = DEFAULT_CHART_LINE_FIBONACCI_LEVEL_COLOR,
    anchorColor = DEFAULT_CHART_LINE_FIBONACCI_ANCHOR_COLOR,
    highColor = DEFAULT_CHART_LINE_FIBONACCI_HIGH_COLOR,
    lowColor = DEFAULT_CHART_LINE_FIBONACCI_LOW_COLOR,
    gridColor = DEFAULT_CHART_LINE_FIBONACCI_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_FIBONACCI_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showLevels = true,
    showLevelLabels = true,
    showAnchor = true,
    showSwings = true,
    showTooltip = true,
    showConfigBadge = true,
    showFooter = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with Fibonacci retracement levels',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    xLabel,
    yLabel,
    onLevelClick,
    onSampleClick,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const layout = useMemo(
    () =>
      computeLineFibonacciLayout({
        data,
        ...(Array.isArray(ratios) ? { ratios } : {}),
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(yMin) ? { yMin } : {}),
        ...(isFiniteNumber(yMax) ? { yMax } : {}),
      }),
    [data, ratios, width, height, padding, tickCount, xMin, xMax, yMin, yMax],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineFibonacciChart(data, {
        formatValue,
        ...(Array.isArray(ratios) ? { ratios } : {}),
      }),
    [ariaDescription, data, ratios, formatValue],
  );

  const [hover, setHover] = useState<
    | { kind: 'level'; index: number }
    | { kind: 'point'; index: number }
    | null
  >(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHover(null);
    setTooltipPos(null);
  }, []);

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
        data-section="chart-line-fibonacci"
        data-empty="true"
        data-trend={layout.trend}
        data-level-count={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-fibonacci-aria-desc"
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
  const panelRight = layout.panel.x + layout.panel.width;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-fibonacci"
      data-empty="false"
      data-trend={layout.trend}
      data-level-count={layout.levels.length}
      data-range={layout.range}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-fibonacci-aria-desc"
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
        data-section="chart-line-fibonacci-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge && layout.swingHigh && layout.swingLow ? (
          <div
            data-section="chart-line-fibonacci-badge"
            data-trend={layout.trend}
            data-level-count={layout.levels.length}
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
              data-section="chart-line-fibonacci-badge-icon"
              aria-hidden="true"
              style={{ color: levelColor }}
            >
              FIB
            </span>
            <span data-section="chart-line-fibonacci-badge-trend">
              {layout.trend}
            </span>
            <span data-section="chart-line-fibonacci-badge-high">
              H={formatValue(layout.swingHigh.value)}
            </span>
            <span data-section="chart-line-fibonacci-badge-low">
              L={formatValue(layout.swingLow.value)}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-fibonacci-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-fibonacci-grid"
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
                    data-section="chart-line-fibonacci-grid-line"
                    data-axis="y"
                    x1={layout.panel.x}
                    x2={panelRight}
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
                    data-section="chart-line-fibonacci-grid-line"
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
              data-section="chart-line-fibonacci-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-fibonacci-axis"
                data-axis="x"
                x1={layout.panel.x}
                y1={layout.panel.y + layout.panel.height}
                x2={panelRight}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-fibonacci-axis"
                data-axis="y"
                x1={layout.panel.x}
                y1={layout.panel.y}
                x2={layout.panel.x}
                y2={layout.panel.y + layout.panel.height}
              />
              <g data-section="chart-line-fibonacci-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-fibonacci-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.panel.y + layout.panel.height}
                        y2={layout.panel.y + layout.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-fibonacci-tick-label"
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
              <g data-section="chart-line-fibonacci-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-fibonacci-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-fibonacci-tick-label"
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
                  data-section="chart-line-fibonacci-x-label"
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
                  data-section="chart-line-fibonacci-y-label"
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

          {showLevels ? (
            <g data-section="chart-line-fibonacci-levels">
              {layout.levels.map((lvl) => (
                <g
                  key={`lvl-${lvl.index}`}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Fibonacci ${formatRatioPercent(lvl.ratio)} level at ${formatValue(lvl.value)}`}
                  data-section="chart-line-fibonacci-level"
                  data-level-index={lvl.index}
                  data-ratio={lvl.ratio}
                  data-value={lvl.value}
                  onMouseEnter={() => {
                    setHover({ kind: 'level', index: lvl.index });
                    setTooltipPos({ px: panelRight, py: lvl.py });
                  }}
                  onMouseLeave={clearHover}
                  onFocus={() => {
                    setHover({ kind: 'level', index: lvl.index });
                    setTooltipPos({ px: panelRight, py: lvl.py });
                  }}
                  onBlur={clearHover}
                  onClick={() => onLevelClick?.({ level: lvl })}
                >
                  <line
                    data-section="chart-line-fibonacci-level-line"
                    data-level-index={lvl.index}
                    x1={layout.panel.x}
                    x2={panelRight}
                    y1={lvl.py}
                    y2={lvl.py}
                    stroke={levelColor}
                    strokeWidth={1}
                    strokeDasharray="4 3"
                  />
                  {showLevelLabels ? (
                    <text
                      data-section="chart-line-fibonacci-level-label"
                      data-level-index={lvl.index}
                      x={panelRight - 4}
                      y={lvl.py - 3}
                      textAnchor="end"
                      fontSize={9}
                      fontWeight={600}
                      fill={levelColor}
                      stroke="none"
                    >
                      {formatRatioPercent(lvl.ratio)} {formatValue(lvl.value)}
                    </text>
                  ) : null}
                </g>
              ))}
            </g>
          ) : null}

          {showAnchor && layout.anchorPath ? (
            <path
              data-section="chart-line-fibonacci-anchor"
              d={layout.anchorPath}
              fill="none"
              stroke={anchorColor}
              strokeWidth={1.5}
              strokeDasharray="2 3"
            />
          ) : null}

          <path
            role="graphics-symbol"
            tabIndex={0}
            aria-label="Series line"
            data-section="chart-line-fibonacci-line-path"
            d={layout.linePath}
            fill="none"
            stroke={seriesColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {showDots ? (
            <g data-section="chart-line-fibonacci-dots">
              {layout.dots.map((d) => {
                const isHover =
                  hover?.kind === 'point' && hover.index === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Sample ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-fibonacci-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-value={d.value}
                    cx={d.px}
                    cy={d.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={seriesColor}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHover({ kind: 'point', index: d.index });
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHover({ kind: 'point', index: d.index });
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => onSampleClick?.({ point: d })}
                  />
                );
              })}
            </g>
          ) : null}

          {showSwings && layout.swingHigh && layout.swingLow ? (
            <g data-section="chart-line-fibonacci-swings">
              <circle
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Swing high at value ${formatValue(layout.swingHigh.value)}`}
                data-section="chart-line-fibonacci-swing"
                data-kind="high"
                data-value={layout.swingHigh.value}
                cx={layout.swingHigh.px}
                cy={layout.swingHigh.py}
                r={swingRadius}
                fill={highColor}
                stroke="#ffffff"
                strokeWidth={1.5}
              />
              <circle
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Swing low at value ${formatValue(layout.swingLow.value)}`}
                data-section="chart-line-fibonacci-swing"
                data-kind="low"
                data-value={layout.swingLow.value}
                cx={layout.swingLow.px}
                cy={layout.swingLow.py}
                r={swingRadius}
                fill={lowColor}
                stroke="#ffffff"
                strokeWidth={1.5}
              />
            </g>
          ) : null}
        </svg>

        {showTooltip && hover && tooltipPos
          ? (() => {
              if (hover.kind === 'level') {
                const lvl = layout.levels.find(
                  (x) => x.index === hover.index,
                );
                if (!lvl) return null;
                return (
                  <div
                    data-section="chart-line-fibonacci-tooltip"
                    data-tooltip-kind="level"
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
                      minWidth: 130,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div
                      data-section="chart-line-fibonacci-tooltip-ratio"
                      style={{ color: levelColor, fontWeight: 600 }}
                    >
                      {formatRatioPercent(lvl.ratio)} retracement
                    </div>
                    <div data-section="chart-line-fibonacci-tooltip-value">
                      value: {formatValue(lvl.value)}
                    </div>
                  </div>
                );
              }
              const d = layout.dots.find((x) => x.index === hover.index);
              if (!d) return null;
              return (
                <div
                  data-section="chart-line-fibonacci-tooltip"
                  data-tooltip-kind="point"
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
                    minWidth: 120,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div data-section="chart-line-fibonacci-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-fibonacci-tooltip-point-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showFooter ? (
        <div
          data-section="chart-line-fibonacci-footer"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            fontSize: 10,
            color: '#64748b',
          }}
        >
          <span data-section="chart-line-fibonacci-footer-stats">
            {layout.trend} swing, range {formatValue(layout.range)}
          </span>
          <span data-section="chart-line-fibonacci-footer-levels">
            {layout.levels.length} retracement levels
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineFibonacci.displayName = 'ChartLineFibonacci';
