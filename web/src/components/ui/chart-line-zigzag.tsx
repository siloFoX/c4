import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ZIGZAG_WIDTH = 560;
export const DEFAULT_CHART_LINE_ZIGZAG_HEIGHT = 320;
export const DEFAULT_CHART_LINE_ZIGZAG_PADDING = 40;
export const DEFAULT_CHART_LINE_ZIGZAG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ZIGZAG_STROKE_WIDTH = 2.5;
export const DEFAULT_CHART_LINE_ZIGZAG_RAW_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_ZIGZAG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ZIGZAG_PIVOT_RADIUS = 4.5;
export const DEFAULT_CHART_LINE_ZIGZAG_RAW_OPACITY = 0.4;
export const DEFAULT_CHART_LINE_ZIGZAG_THRESHOLD_PERCENT = 5;
export const DEFAULT_CHART_LINE_ZIGZAG_SERIES_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ZIGZAG_ZIGZAG_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ZIGZAG_PEAK_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ZIGZAG_TROUGH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ZIGZAG_ENDPOINT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_ZIGZAG_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ZIGZAG_AXIS_COLOR = '#cbd5e1';

export type ChartLineZigzagPivotKind = 'start' | 'peak' | 'trough' | 'end';

export interface ChartLineZigzagPoint {
  x: number;
  value: number;
}

export interface ChartLineZigzagPivot {
  index: number;
  x: number;
  value: number;
  kind: ChartLineZigzagPivotKind;
  moveFromPrev: number;
}

export interface ChartLineZigzagRun {
  series: ChartLineZigzagPoint[];
  pivots: ChartLineZigzagPivot[];
  pivotCount: number;
  thresholdPercent: number;
  ok: boolean;
}

export interface ChartLineZigzagLayoutPoint {
  index: number;
  x: number;
  value: number;
  px: number;
  py: number;
}

export interface ChartLineZigzagLayoutPivot extends ChartLineZigzagPivot {
  px: number;
  py: number;
}

export interface ChartLineZigzagLayout {
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
  rawPath: string;
  zigzagPath: string;
  rawDots: ChartLineZigzagLayoutPoint[];
  pivots: ChartLineZigzagLayoutPivot[];
  pivotCount: number;
  thresholdPercent: number;
  totalPoints: number;
}

export interface ComputeLineZigzagLayoutOptions {
  data: readonly ChartLineZigzagPoint[];
  thresholdPercent?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineZigzagProps {
  data: readonly ChartLineZigzagPoint[];
  thresholdPercent?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  rawStrokeWidth?: number;
  dotRadius?: number;
  pivotRadius?: number;
  rawOpacity?: number;
  seriesColor?: string;
  zigzagColor?: string;
  peakColor?: string;
  troughColor?: string;
  endpointColor?: string;
  gridColor?: string;
  axisColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showRawLine?: boolean;
  showRawDots?: boolean;
  showZigzag?: boolean;
  showPivots?: boolean;
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
  onPivotClick?: (payload: { pivot: ChartLineZigzagLayoutPivot }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineZigzagFinitePoints(
  points: readonly ChartLineZigzagPoint[] | null | undefined,
): ChartLineZigzagPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineZigzagPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a reversal threshold to a non-negative percent. A
 * non-finite or negative value falls back to the 5% default; 0 is
 * allowed (every move then counts as a reversal).
 */
export function normalizeLineZigzagThreshold(
  thresholdPercent: number,
): number {
  return isFiniteNumber(thresholdPercent) && thresholdPercent >= 0
    ? thresholdPercent
    : DEFAULT_CHART_LINE_ZIGZAG_THRESHOLD_PERCENT;
}

/**
 * Run the ZigZag filter. The first point is always the starting
 * pivot. Scanning forward, a running high and a running low are
 * tracked since the last confirmed pivot; when price retraces from
 * the running extreme by at least the percent threshold, that
 * extreme is confirmed as a pivot (a `peak` off a high, a `trough`
 * off a low) and the trend reverses. The final point is appended as
 * an `end` pivot unless it is already the last confirmed pivot. The
 * ZigZag line therefore connects only the significant pivots,
 * filtering out every sub-threshold wiggle.
 */
export function runLineZigzag(
  points: readonly ChartLineZigzagPoint[] | null | undefined,
  thresholdPercent: number = DEFAULT_CHART_LINE_ZIGZAG_THRESHOLD_PERCENT,
): ChartLineZigzagRun {
  const finite = getLineZigzagFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const pct = normalizeLineZigzagThreshold(thresholdPercent);
  const th = pct / 100;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      pivots:
        n === 1
          ? [
              {
                index: 0,
                x: series[0]!.x,
                value: series[0]!.value,
                kind: 'start',
                moveFromPrev: 0,
              },
            ]
          : [],
      pivotCount: n === 1 ? 1 : 0,
      thresholdPercent: pct,
      ok: false,
    };
  }

  const reversalDown = (extVal: number, v: number): number =>
    extVal === 0 ? (v < 0 ? Infinity : 0) : (extVal - v) / Math.abs(extVal);
  const reversalUp = (extVal: number, v: number): number =>
    extVal === 0 ? (v > 0 ? Infinity : 0) : (v - extVal) / Math.abs(extVal);

  const pivotRefs: { index: number; kind: ChartLineZigzagPivotKind }[] = [
    { index: 0, kind: 'start' },
  ];
  let trend = 0;
  let maxIdx = 0;
  let minIdx = 0;
  let lastPivotIdx = 0;

  for (let i = 1; i < n; i += 1) {
    const v = series[i]!.value;
    if (v > series[maxIdx]!.value) maxIdx = i;
    if (v < series[minIdx]!.value) minIdx = i;

    if (trend >= 0) {
      const drop = reversalDown(series[maxIdx]!.value, v);
      if (drop >= th && maxIdx !== lastPivotIdx) {
        pivotRefs.push({ index: maxIdx, kind: 'peak' });
        lastPivotIdx = maxIdx;
        trend = -1;
        i = maxIdx;
        maxIdx = lastPivotIdx;
        minIdx = lastPivotIdx;
        continue;
      }
    }
    if (trend <= 0) {
      const rise = reversalUp(series[minIdx]!.value, v);
      if (rise >= th && minIdx !== lastPivotIdx) {
        pivotRefs.push({ index: minIdx, kind: 'trough' });
        lastPivotIdx = minIdx;
        trend = 1;
        i = minIdx;
        maxIdx = lastPivotIdx;
        minIdx = lastPivotIdx;
        continue;
      }
    }
  }

  if (lastPivotIdx !== n - 1) {
    pivotRefs.push({ index: n - 1, kind: 'end' });
  }

  const pivots: ChartLineZigzagPivot[] = pivotRefs.map((ref, j) => {
    const value = series[ref.index]!.value;
    let moveFromPrev = 0;
    if (j > 0) {
      const prevValue = series[pivotRefs[j - 1]!.index]!.value;
      if (prevValue === 0) {
        moveFromPrev =
          value === 0 ? 0 : value > 0 ? Infinity : Number.NEGATIVE_INFINITY;
      } else {
        moveFromPrev = ((value - prevValue) / Math.abs(prevValue)) * 100;
      }
    }
    return {
      index: ref.index,
      x: series[ref.index]!.x,
      value,
      kind: ref.kind,
      moveFromPrev,
    };
  });

  return {
    series = [],
    pivots,
    pivotCount: pivots.length,
    thresholdPercent: pct,
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

export function computeLineZigzagLayout(
  options: ComputeLineZigzagLayoutOptions,
): ChartLineZigzagLayout {
  const {
    data,
    thresholdPercent,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_ZIGZAG_TICK_COUNT,
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
  const run = runLineZigzag(
    data,
    thresholdPercent ?? DEFAULT_CHART_LINE_ZIGZAG_THRESHOLD_PERCENT,
  );
  const empty: ChartLineZigzagLayout = {
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
    rawPath: '',
    zigzagPath: '',
    rawDots: [],
    pivots: [],
    pivotCount: 0,
    thresholdPercent: run.thresholdPercent,
    totalPoints: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok || run.series.length < 2) return empty;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const p of run.series) {
    if (p.x < xLo) xLo = p.x;
    if (p.x > xHi) xHi = p.x;
    if (p.value < yLo) yLo = p.value;
    if (p.value > yHi) yHi = p.value;
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
  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const rawDots: ChartLineZigzagLayoutPoint[] = run.series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    px: projectX(p.x),
    py: projectY(p.value),
  }));

  const pivots: ChartLineZigzagLayoutPivot[] = run.pivots.map((p) => ({
    ...p,
    px: projectX(p.x),
    py: projectY(p.value),
  }));

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
    rawPath: buildPath(rawDots.map((d) => ({ px: d.px, py: d.py }))),
    zigzagPath: buildPath(pivots.map((p) => ({ px: p.px, py: p.py }))),
    rawDots,
    pivots,
    pivotCount: run.pivotCount,
    thresholdPercent: run.thresholdPercent,
    totalPoints: run.series.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function formatMove(n: number): string {
  if (!isFiniteNumber(n)) return 'n/a';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

export function describeLineZigzagChart(
  data: readonly ChartLineZigzagPoint[] | null | undefined,
  options?: { thresholdPercent?: number },
): string {
  const run = runLineZigzag(
    data,
    options?.thresholdPercent ?? DEFAULT_CHART_LINE_ZIGZAG_THRESHOLD_PERCENT,
  );
  if (!run.ok) return 'No data';
  return `Line chart with a ZigZag overlay at a ${run.thresholdPercent}% reversal threshold: ${run.pivotCount} significant pivots across ${run.series.length} points.`;
}

export const ChartLineZigzag = forwardRef<
  HTMLDivElement,
  ChartLineZigzagProps
>(function ChartLineZigzag(
  props: ChartLineZigzagProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    thresholdPercent = DEFAULT_CHART_LINE_ZIGZAG_THRESHOLD_PERCENT,
    width = DEFAULT_CHART_LINE_ZIGZAG_WIDTH,
    height = DEFAULT_CHART_LINE_ZIGZAG_HEIGHT,
    padding = DEFAULT_CHART_LINE_ZIGZAG_PADDING,
    tickCount = DEFAULT_CHART_LINE_ZIGZAG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ZIGZAG_STROKE_WIDTH,
    rawStrokeWidth = DEFAULT_CHART_LINE_ZIGZAG_RAW_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ZIGZAG_DOT_RADIUS,
    pivotRadius = DEFAULT_CHART_LINE_ZIGZAG_PIVOT_RADIUS,
    rawOpacity = DEFAULT_CHART_LINE_ZIGZAG_RAW_OPACITY,
    seriesColor = DEFAULT_CHART_LINE_ZIGZAG_SERIES_COLOR,
    zigzagColor = DEFAULT_CHART_LINE_ZIGZAG_ZIGZAG_COLOR,
    peakColor = DEFAULT_CHART_LINE_ZIGZAG_PEAK_COLOR,
    troughColor = DEFAULT_CHART_LINE_ZIGZAG_TROUGH_COLOR,
    endpointColor = DEFAULT_CHART_LINE_ZIGZAG_ENDPOINT_COLOR,
    gridColor = DEFAULT_CHART_LINE_ZIGZAG_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ZIGZAG_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showRawLine = true,
    showRawDots = false,
    showZigzag = true,
    showPivots = true,
    showTooltip = true,
    showConfigBadge = true,
    showFooter = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a ZigZag pivot overlay',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    xLabel,
    yLabel,
    onPivotClick,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const layout = useMemo(
    () =>
      computeLineZigzagLayout({
        data,
        thresholdPercent,
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(yMin) ? { yMin } : {}),
        ...(isFiniteNumber(yMax) ? { yMax } : {}),
      }),
    [
      data,
      thresholdPercent,
      width,
      height,
      padding,
      tickCount,
      xMin,
      xMax,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineZigzagChart(data, { thresholdPercent }),
    [ariaDescription, data, thresholdPercent],
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

  const pivotColor = useCallback(
    (kind: ChartLineZigzagPivotKind): string => {
      if (kind === 'peak') return peakColor;
      if (kind === 'trough') return troughColor;
      return endpointColor;
    },
    [peakColor, troughColor, endpointColor],
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
        data-section="chart-line-zigzag"
        data-empty="true"
        data-pivot-count={0}
        data-threshold-percent={layout.thresholdPercent}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-zigzag-aria-desc"
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
      data-section="chart-line-zigzag"
      data-empty="false"
      data-pivot-count={layout.pivotCount}
      data-threshold-percent={layout.thresholdPercent}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-zigzag-aria-desc"
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
        data-section="chart-line-zigzag-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-zigzag-badge"
            data-threshold-percent={layout.thresholdPercent}
            data-pivot-count={layout.pivotCount}
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
              data-section="chart-line-zigzag-badge-icon"
              aria-hidden="true"
              style={{ color: zigzagColor }}
            >
              ZZ
            </span>
            <span data-section="chart-line-zigzag-badge-threshold">
              thr={layout.thresholdPercent}%
            </span>
            <span data-section="chart-line-zigzag-badge-pivots">
              pivots={layout.pivotCount}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-zigzag-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-zigzag-grid"
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
                    data-section="chart-line-zigzag-grid-line"
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
                    data-section="chart-line-zigzag-grid-line"
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
              data-section="chart-line-zigzag-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-zigzag-axis"
                data-axis="x"
                x1={layout.panel.x}
                y1={layout.panel.y + layout.panel.height}
                x2={layout.panel.x + layout.panel.width}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-zigzag-axis"
                data-axis="y"
                x1={layout.panel.x}
                y1={layout.panel.y}
                x2={layout.panel.x}
                y2={layout.panel.y + layout.panel.height}
              />
              <g data-section="chart-line-zigzag-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-zigzag-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.panel.y + layout.panel.height}
                        y2={layout.panel.y + layout.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-zigzag-tick-label"
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
              <g data-section="chart-line-zigzag-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-zigzag-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-zigzag-tick-label"
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
                  data-section="chart-line-zigzag-x-label"
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
                  data-section="chart-line-zigzag-y-label"
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

          {showRawLine && layout.rawPath ? (
            <path
              data-section="chart-line-zigzag-raw-path"
              data-kind="raw"
              d={layout.rawPath}
              fill="none"
              stroke={seriesColor}
              strokeWidth={rawStrokeWidth}
              strokeOpacity={rawOpacity}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {showRawDots ? (
            <g data-section="chart-line-zigzag-raw-dots">
              {layout.rawDots.map((d) => (
                <circle
                  key={`rd-${d.index}`}
                  data-section="chart-line-zigzag-raw-dot"
                  data-point-index={d.index}
                  cx={d.px}
                  cy={d.py}
                  r={dotRadius}
                  fill={seriesColor}
                  fillOpacity={rawOpacity}
                />
              ))}
            </g>
          ) : null}

          {showZigzag && layout.zigzagPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="ZigZag pivot overlay"
              data-section="chart-line-zigzag-zigzag-path"
              data-kind="zigzag"
              d={layout.zigzagPath}
              fill="none"
              stroke={zigzagColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {showPivots ? (
            <g data-section="chart-line-zigzag-pivots">
              {layout.pivots.map((p) => {
                const isHover = hoverIndex === p.index;
                const color = pivotColor(p.kind);
                return (
                  <circle
                    key={`pv-${p.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${p.kind} pivot at x ${formatX(p.x)}, value ${formatValue(p.value)}`}
                    data-section="chart-line-zigzag-pivot"
                    data-pivot-index={p.index}
                    data-kind={p.kind}
                    data-x={p.x}
                    data-value={p.value}
                    data-move={p.moveFromPrev}
                    cx={p.px}
                    cy={p.py}
                    r={isHover ? pivotRadius + 1.5 : pivotRadius}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    onMouseEnter={() => {
                      setHoverIndex(p.index);
                      setTooltipPos({ px: p.px, py: p.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(p.index);
                      setTooltipPos({ px: p.px, py: p.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => onPivotClick?.({ pivot: p })}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoverIndex !== null && tooltipPos
          ? (() => {
              const p = layout.pivots.find((x) => x.index === hoverIndex);
              if (!p) return null;
              return (
                <div
                  data-section="chart-line-zigzag-tooltip"
                  data-pivot-index={p.index}
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
                    data-section="chart-line-zigzag-tooltip-kind"
                    style={{ color: pivotColor(p.kind), fontWeight: 600 }}
                  >
                    {p.kind} pivot
                  </div>
                  <div data-section="chart-line-zigzag-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div
                    data-section="chart-line-zigzag-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(p.value)}
                  </div>
                  <div data-section="chart-line-zigzag-tooltip-move">
                    move: {formatMove(p.moveFromPrev)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showFooter ? (
        <div
          data-section="chart-line-zigzag-footer"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            fontSize: 10,
            color: '#64748b',
          }}
        >
          <span data-section="chart-line-zigzag-footer-stats">
            threshold={layout.thresholdPercent}% pivots={layout.pivotCount}
          </span>
          <span data-section="chart-line-zigzag-footer-points">
            {layout.totalPoints} raw points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineZigzag.displayName = 'ChartLineZigzag';
