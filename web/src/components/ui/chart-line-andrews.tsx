import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ANDREWS_WIDTH = 560;
export const DEFAULT_CHART_LINE_ANDREWS_HEIGHT = 320;
export const DEFAULT_CHART_LINE_ANDREWS_PADDING = 40;
export const DEFAULT_CHART_LINE_ANDREWS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ANDREWS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ANDREWS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ANDREWS_PIVOT_RADIUS = 5;
export const DEFAULT_CHART_LINE_ANDREWS_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_ANDREWS_MEDIAN_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ANDREWS_TINE_COLOR = '#a78bfa';
export const DEFAULT_CHART_LINE_ANDREWS_PIVOT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ANDREWS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ANDREWS_AXIS_COLOR = '#cbd5e1';

export type ChartLineAndrewsLineId = 'upper' | 'median' | 'lower';

export type ChartLineAndrewsPosition = 'above' | 'below' | 'on';

export interface ChartLineAndrewsPoint {
  x: number;
  value: number;
}

export interface ChartLineAndrewsPivots {
  p1: ChartLineAndrewsPoint;
  p2: ChartLineAndrewsPoint;
  p3: ChartLineAndrewsPoint;
}

export interface ChartLineAndrewsLine {
  id: ChartLineAndrewsLineId;
  label: string;
  slope: number;
  anchorX: number;
  anchorValue: number;
  intercept: number;
}

export interface ChartLineAndrewsFork {
  slope: number;
  midpoint: ChartLineAndrewsPoint;
  lines: ChartLineAndrewsLine[];
}

export interface ChartLineAndrewsSample {
  index: number;
  x: number;
  value: number;
  position: ChartLineAndrewsPosition;
}

export interface ChartLineAndrewsRun {
  series: ChartLineAndrewsPoint[];
  pivots: ChartLineAndrewsPivots | null;
  fork: ChartLineAndrewsFork | null;
  samples: ChartLineAndrewsSample[];
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineAndrewsPriceDot {
  index: number;
  x: number;
  value: number;
  position: ChartLineAndrewsPosition;
  px: number;
  py: number;
}

export interface ChartLineAndrewsForkLine {
  id: ChartLineAndrewsLineId;
  label: string;
  isMedian: boolean;
  startPx: number;
  startPy: number;
  endPx: number;
  endPy: number;
  startValue: number;
  endValue: number;
}

export interface ChartLineAndrewsPivotMarker {
  id: string;
  label: string;
  x: number;
  value: number;
  px: number;
  py: number;
}

export interface ChartLineAndrewsPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineAndrewsLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineAndrewsPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  priceDots: ChartLineAndrewsPriceDot[];
  forkLines: ChartLineAndrewsForkLine[];
  pivotMarkers: ChartLineAndrewsPivotMarker[];
  slope: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineAndrewsLayoutOptions {
  data: readonly ChartLineAndrewsPoint[];
  pivots?: ChartLineAndrewsPivots;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineAndrewsProps {
  data: readonly ChartLineAndrewsPoint[];
  pivots?: ChartLineAndrewsPivots;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  pivotRadius?: number;
  priceColor?: string;
  medianColor?: string;
  tineColor?: string;
  pivotColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFork?: boolean;
  showPivots?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineAndrewsPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function noNegativeZero(v: number): number {
  return v === 0 ? 0 : v;
}

function isFinitePivot(p: ChartLineAndrewsPoint | null | undefined): boolean {
  return !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value);
}

export function getLineAndrewsFinitePoints(
  points: readonly ChartLineAndrewsPoint[] | null | undefined,
): ChartLineAndrewsPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineAndrewsPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

function makeAndrewsLine(
  id: ChartLineAndrewsLineId,
  label: string,
  slope: number,
  anchorX: number,
  anchorValue: number,
): ChartLineAndrewsLine {
  return {
    id,
    label,
    slope,
    anchorX,
    anchorValue,
    intercept: noNegativeZero(anchorValue - slope * anchorX),
  };
}

/**
 * Build an Andrews Pitchfork from three pivot points. The median
 * line runs from the first pivot through the midpoint of the second
 * and third pivots; two parallel tines pass through the remaining
 * two pivots, all three lines sharing the median's slope. The tine
 * with the larger intercept is the `upper` line, the other the
 * `lower`; the median's intercept is exactly their average. Returns
 * `null` when a pivot coordinate is not finite, or when the midpoint
 * sits directly above the first pivot (a vertical, slope-less
 * median).
 */
export function computeLineAndrewsFork(
  pivots: ChartLineAndrewsPivots | null | undefined,
): ChartLineAndrewsFork | null {
  if (!pivots) return null;
  const { p1, p2, p3 } = pivots;
  if (!isFinitePivot(p1) || !isFinitePivot(p2) || !isFinitePivot(p3)) {
    return null;
  }
  const midpoint: ChartLineAndrewsPoint = {
    x: (p2.x + p3.x) / 2,
    value: (p2.value + p3.value) / 2,
  };
  const denom = midpoint.x - p1.x;
  if (denom === 0) return null;
  const slope = noNegativeZero((midpoint.value - p1.value) / denom);

  const median = makeAndrewsLine('median', 'Median', slope, p1.x, p1.value);
  const int2 = p2.value - slope * p2.x;
  const int3 = p3.value - slope * p3.x;
  const upperAnchor = int2 >= int3 ? p2 : p3;
  const lowerAnchor = int2 >= int3 ? p3 : p2;
  const upper = makeAndrewsLine(
    'upper',
    'Upper',
    slope,
    upperAnchor.x,
    upperAnchor.value,
  );
  const lower = makeAndrewsLine(
    'lower',
    'Lower',
    slope,
    lowerAnchor.x,
    lowerAnchor.value,
  );

  return { slope, midpoint, lines: [upper, median, lower] };
}

function andrewsLineValueAt(line: ChartLineAndrewsLine, x: number): number {
  return line.anchorValue + line.slope * (x - line.anchorX);
}

function classifyPosition(
  value: number,
  lineValue: number,
): ChartLineAndrewsPosition {
  if (value > lineValue) return 'above';
  if (value < lineValue) return 'below';
  return 'on';
}

export function runLineAndrews(
  points: readonly ChartLineAndrewsPoint[] | null | undefined,
  options?: { pivots?: ChartLineAndrewsPivots },
): ChartLineAndrewsRun {
  const finite = getLineAndrewsFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const fork = computeLineAndrewsFork(options?.pivots ?? null);
  const n = series.length;

  if (n < 2 || fork === null) {
    return {
      series,
      pivots: options?.pivots ?? null,
      fork,
      samples: [],
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const median = fork.lines.find((l) => l.id === 'median')!;
  const samples: ChartLineAndrewsSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    position: classifyPosition(p.value, andrewsLineValueAt(median, p.x)),
  }));

  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series,
    pivots: options?.pivots ?? null,
    fork,
    samples,
    aboveCount,
    belowCount,
    ok: true,
  };
}

function buildPath(points: readonly { px: number; py: number }[]): string {
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

export function computeLineAndrewsLayout(
  options: ComputeLineAndrewsLayoutOptions,
): ChartLineAndrewsLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_ANDREWS_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineAndrewsPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineAndrews(data, {
    ...(options.pivots ? { pivots: options.pivots } : {}),
  });
  const empty: ChartLineAndrewsLayout = {
    ok: false,
    width,
    height,
    panel: emptyPanel,
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    pricePath: '',
    priceDots: [],
    forkLines: [],
    pivotMarkers: [],
    slope: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok || run.fork === null || run.pivots === null) return empty;

  const panel: ChartLineAndrewsPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };

  const pivotList: { id: string; label: string; point: ChartLineAndrewsPoint }[] =
    [
      { id: 'p1', label: 'P1', point: run.pivots.p1 },
      { id: 'p2', label: 'P2', point: run.pivots.p2 },
      { id: 'p3', label: 'P3', point: run.pivots.p3 },
    ];

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < yLo) yLo = s.value;
    if (s.value > yHi) yHi = s.value;
  }
  for (const pv of pivotList) {
    if (pv.point.x < xLo) xLo = pv.point.x;
    if (pv.point.x > xHi) xHi = pv.point.x;
    if (pv.point.value < yLo) yLo = pv.point.value;
    if (pv.point.value > yHi) yHi = pv.point.value;
  }
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

  const priceDots: ChartLineAndrewsPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const forkLines: ChartLineAndrewsForkLine[] = run.fork.lines.map((line) => {
    const startValue = andrewsLineValueAt(line, xLo);
    const endValue = andrewsLineValueAt(line, xHi);
    return {
      id: line.id,
      label: line.label,
      isMedian: line.id === 'median',
      startPx: projectX(xLo),
      startPy: projectY(startValue),
      endPx: projectX(xHi),
      endPy: projectY(endValue),
      startValue,
      endValue,
    };
  });

  const pivotMarkers: ChartLineAndrewsPivotMarker[] = pivotList.map((pv) => ({
    id: pv.id,
    label: pv.label,
    x: pv.point.x,
    value: pv.point.value,
    px: projectX(pv.point.x),
    py: projectY(pv.point.value),
  }));

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    yTicks: computeTicks(yLo, yHi, tickCount).map((v) => ({
      value: v,
      py: projectY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    forkLines,
    pivotMarkers,
    slope: run.fork.slope,
    aboveCount: run.aboveCount,
    belowCount: run.belowCount,
    totalPoints: run.samples.length,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineAndrewsChart(
  data: readonly ChartLineAndrewsPoint[] | null | undefined,
  options?: { pivots?: ChartLineAndrewsPivots },
): string {
  const run = runLineAndrews(data, options);
  if (!run.ok || run.fork === null) return 'No data';
  return `Line chart with an Andrews Pitchfork drawn from three pivot points. The median line runs from the first pivot through the midpoint of the second and third pivots; an upper and a lower parallel tine pass through the remaining two pivots, all three lines sharing the slope ${defaultFormatValue(run.fork.slope)}. The price runs above the median line on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} bars.`;
}

const ANDREWS_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

function pivotDiamond(px: number, py: number, r: number): string {
  return `${px},${py - r} ${px + r},${py} ${px},${py + r} ${px - r},${py}`;
}

export const ChartLineAndrews = forwardRef<
  HTMLDivElement,
  ChartLineAndrewsProps
>(function ChartLineAndrews(
  props: ChartLineAndrewsProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    pivots,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_ANDREWS_WIDTH,
    height = DEFAULT_CHART_LINE_ANDREWS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ANDREWS_PADDING,
    tickCount = DEFAULT_CHART_LINE_ANDREWS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ANDREWS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ANDREWS_DOT_RADIUS,
    pivotRadius = DEFAULT_CHART_LINE_ANDREWS_PIVOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ANDREWS_PRICE_COLOR,
    medianColor = DEFAULT_CHART_LINE_ANDREWS_MEDIAN_COLOR,
    tineColor = DEFAULT_CHART_LINE_ANDREWS_TINE_COLOR,
    pivotColor = DEFAULT_CHART_LINE_ANDREWS_PIVOT_COLOR,
    gridColor = DEFAULT_CHART_LINE_ANDREWS_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ANDREWS_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showFork = true,
    showPivots = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with an Andrews Pitchfork',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    onPointClick,
    onSeriesToggle,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;
  const clipId = `${reactId}-clip`;

  const isControlled = controlledHidden !== undefined;
  const [uncontrolled, setUncontrolled] = useState<Set<string>>(() =>
    normaliseHidden(defaultHiddenSeries),
  );
  const hiddenSet = isControlled
    ? normaliseHidden(controlledHidden)
    : uncontrolled;

  const layout = useMemo(
    () =>
      computeLineAndrewsLayout({
        data,
        width,
        height,
        padding,
        tickCount,
        ...(pivots ? { pivots } : {}),
      }),
    [data, pivots, width, height, padding, tickCount],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineAndrewsChart(data, {
        ...(pivots ? { pivots } : {}),
      }),
    [ariaDescription, data, pivots],
  );

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHoverIndex(null);
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
        data-section="chart-line-andrews"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-andrews-aria-desc"
          style={ANDREWS_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const cp = layout.panel;
  const priceVisible = !hiddenSet.has('price');
  const forkVisible = showFork && !hiddenSet.has('fork');
  const pivotsVisible = showPivots && !hiddenSet.has('pivots');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'fork', label: 'Pitchfork', color: medianColor },
    { id: 'pivots', label: 'Pivots', color: pivotColor },
  ];

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={
        [className, animateClass].filter(Boolean).join(' ') || undefined
      }
      style={containerStyle}
      data-section="chart-line-andrews"
      data-empty="false"
      data-slope={layout.slope}
      data-above-count={layout.aboveCount}
      data-below-count={layout.belowCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-andrews-aria-desc"
        style={ANDREWS_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-andrews-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-andrews-badge"
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
              data-section="chart-line-andrews-badge-icon"
              aria-hidden="true"
              style={{ color: medianColor }}
            >
              ANDREWS
            </span>
            <span data-section="chart-line-andrews-badge-slope">
              m={formatValue(layout.slope)}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-andrews-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={cp.x} y={cp.y} width={cp.width} height={cp.height} />
            </clipPath>
          </defs>

          {showGrid ? (
            <g
              data-section="chart-line-andrews-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => (
                <line
                  key={`gy-${i}`}
                  data-section="chart-line-andrews-grid-line"
                  x1={cp.x}
                  x2={cp.x + cp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-andrews-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-andrews-axis"
                data-axis="x"
                x1={cp.x}
                y1={cp.y + cp.height}
                x2={cp.x + cp.width}
                y2={cp.y + cp.height}
              />
              <line
                data-section="chart-line-andrews-axis"
                data-axis="y"
                x1={cp.x}
                y1={cp.y}
                x2={cp.x}
                y2={cp.y + cp.height}
              />
              {layout.yTicks.map((t, i) => (
                <g
                  key={`yt-${i}`}
                  data-section="chart-line-andrews-tick"
                  data-axis="y"
                >
                  <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                  <text
                    data-section="chart-line-andrews-tick-label"
                    data-axis="y"
                    x={cp.x - 6}
                    y={t.py + 3}
                    textAnchor="end"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatValue(t.value)}
                  </text>
                </g>
              ))}
              {layout.xTicks.map((t, i) => (
                <g
                  key={`xt-${i}`}
                  data-section="chart-line-andrews-tick"
                  data-axis="x"
                >
                  <line
                    x1={t.px}
                    x2={t.px}
                    y1={cp.y + cp.height}
                    y2={cp.y + cp.height + 4}
                  />
                  <text
                    data-section="chart-line-andrews-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={cp.y + cp.height + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatX(t.value)}
                  </text>
                </g>
              ))}
            </g>
          ) : null}

          {forkVisible ? (
            <g
              data-section="chart-line-andrews-fork"
              clipPath={`url(#${clipId})`}
            >
              {layout.forkLines.map((l) => (
                <line
                  key={`fork-${l.id}`}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Andrews ${l.label} line`}
                  data-section="chart-line-andrews-fork-line"
                  data-line-id={l.id}
                  data-median={l.isMedian ? 'true' : 'false'}
                  x1={l.startPx}
                  y1={l.startPy}
                  x2={l.endPx}
                  y2={l.endPy}
                  stroke={l.isMedian ? medianColor : tineColor}
                  strokeWidth={l.isMedian ? 2 : 1.25}
                  strokeDasharray={l.isMedian ? undefined : '5 3'}
                  strokeLinecap="round"
                />
              ))}
            </g>
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-andrews-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-andrews-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-andrews-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-value={d.value}
                    cx={d.px}
                    cy={d.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={priceColor}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverIndex(d.index);
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(d.index);
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => onPointClick?.({ point: d })}
                  />
                );
              })}
            </g>
          ) : null}

          {pivotsVisible ? (
            <g data-section="chart-line-andrews-pivots">
              {layout.pivotMarkers.map((pm) => (
                <g
                  key={`pivot-${pm.id}`}
                  data-section="chart-line-andrews-pivot"
                  data-pivot-id={pm.id}
                >
                  <polygon
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Andrews ${pm.label} pivot at x ${formatX(pm.x)}, value ${formatValue(pm.value)}`}
                    data-section="chart-line-andrews-pivot-marker"
                    points={pivotDiamond(pm.px, pm.py, pivotRadius)}
                    fill={pivotColor}
                    stroke="#ffffff"
                    strokeWidth={1.25}
                  />
                  <text
                    data-section="chart-line-andrews-pivot-label"
                    x={pm.px + pivotRadius + 3}
                    y={pm.py + 3}
                    fontSize={10}
                    fontWeight={600}
                    fill={pivotColor}
                    stroke="none"
                  >
                    {pm.label}
                  </text>
                </g>
              ))}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoverIndex !== null && tooltipPos
          ? (() => {
              const d = layout.priceDots.find((x) => x.index === hoverIndex);
              if (!d) return null;
              return (
                <div
                  data-section="chart-line-andrews-tooltip"
                  data-point-index={d.index}
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
                  <div data-section="chart-line-andrews-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-andrews-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-andrews-tooltip-position">
                    vs median: {d.position}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-andrews-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          {legendItems.map((item) => {
            const isHidden = hiddenSet.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-section="chart-line-andrews-legend-item"
                data-series-id={item.id}
                data-hidden={isHidden ? 'true' : 'false'}
                onClick={() => handleToggle(item.id)}
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
                  data-section="chart-line-andrews-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-andrews-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-andrews-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.aboveCount} above median, {layout.belowCount} below
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineAndrews.displayName = 'ChartLineAndrews';
