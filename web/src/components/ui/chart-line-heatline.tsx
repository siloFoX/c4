import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_HEATLINE_WIDTH = 560;
export const DEFAULT_CHART_LINE_HEATLINE_HEIGHT = 320;
export const DEFAULT_CHART_LINE_HEATLINE_PADDING = 40;
export const DEFAULT_CHART_LINE_HEATLINE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HEATLINE_STROKE_WIDTH = 3;
export const DEFAULT_CHART_LINE_HEATLINE_DOT_RADIUS = 3.5;
export const DEFAULT_CHART_LINE_HEATLINE_SCALE = [
  '#1e40af',
  '#0891b2',
  '#16a34a',
  '#f59e0b',
  '#dc2626',
];
export const DEFAULT_CHART_LINE_HEATLINE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_HEATLINE_AXIS_COLOR = '#cbd5e1';

export interface ChartLineHeatlinePoint {
  x: number;
  value: number;
}

export interface ChartLineHeatlineSamplePoint {
  index: number;
  x: number;
  value: number;
  t: number;
  color: string;
}

export interface ChartLineHeatlineSegment {
  index: number;
  startIndex: number;
  endIndex: number;
  value: number;
  t: number;
  color: string;
}

export interface ChartLineHeatlineRun {
  points: ChartLineHeatlineSamplePoint[];
  segments: ChartLineHeatlineSegment[];
  valueMin: number;
  valueMax: number;
  domainMin: number;
  domainMax: number;
  totalSamples: number;
  ok: boolean;
}

export interface ChartLineHeatlineLayoutPoint
  extends ChartLineHeatlineSamplePoint {
  px: number;
  py: number;
}

export interface ChartLineHeatlineLayoutSegment
  extends ChartLineHeatlineSegment {
  px0: number;
  py0: number;
  px1: number;
  py1: number;
  path: string;
}

export interface ChartLineHeatlineLayout {
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
  points: ChartLineHeatlineLayoutPoint[];
  segments: ChartLineHeatlineLayoutSegment[];
  valueMin: number;
  valueMax: number;
  domainMin: number;
  domainMax: number;
  totalSamples: number;
}

export interface ComputeLineHeatlineLayoutOptions {
  data: readonly ChartLineHeatlinePoint[];
  colorScale?: readonly string[];
  domainMin?: number;
  domainMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineHeatlineProps {
  data: readonly ChartLineHeatlinePoint[];
  colorScale?: readonly string[];
  domainMin?: number;
  domainMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  gridColor?: string;
  axisColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showScale?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    point: ChartLineHeatlineLayoutPoint;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function getLineHeatlineFinitePoints(
  points: readonly ChartLineHeatlinePoint[] | null | undefined,
): ChartLineHeatlinePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineHeatlinePoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Parse a 6-digit `#rrggbb` hex colour into its RGB channels.
 * Returns null for any other shape.
 */
export function parseHexColor(
  hex: unknown,
): { r: number; g: number; b: number } | null {
  if (typeof hex !== 'string') return null;
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1]!, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function channelToHex(n: number): string {
  const c = Math.round(n < 0 ? 0 : n > 255 ? 255 : n);
  return c.toString(16).padStart(2, '0');
}

/**
 * Sample a multi-stop colour scale at normalized position `t` in
 * [0, 1]. The stops are spread evenly across [0, 1]; `t` selects a
 * pair of surrounding stops and the RGB channels are linearly
 * interpolated between them. `t` is clamped to [0, 1]; a non-finite
 * `t` falls back to 0.
 */
export function interpolateLineHeatlineColor(
  scale: readonly string[] | null | undefined,
  t: number,
): string {
  if (!Array.isArray(scale) || scale.length === 0) return '#000000';
  if (scale.length === 1) return scale[0]!;
  const tt = isFiniteNumber(t) ? clamp01(t) : 0;
  const pos = tt * (scale.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  const c0 = parseHexColor(scale[lo]);
  const c1 = parseHexColor(scale[hi]);
  if (!c0 || !c1) return scale[lo] ?? '#000000';
  return `#${channelToHex(c0.r + frac * (c1.r - c0.r))}${channelToHex(
    c0.g + frac * (c1.g - c0.g),
  )}${channelToHex(c0.b + frac * (c1.b - c0.b))}`;
}

/**
 * Normalize `value` to [0, 1] within `[min, max]`. When `min` equals
 * `max` the whole series collapses to the scale midpoint (0.5).
 */
export function normalizeLineHeatlineValue(
  value: number,
  min: number,
  max: number,
): number {
  if (!isFiniteNumber(value) || !isFiniteNumber(min) || !isFiniteNumber(max)) {
    return 0.5;
  }
  if (min === max) return 0.5;
  return clamp01((value - min) / (max - min));
}

export function runLineHeatline(
  points: readonly ChartLineHeatlinePoint[] | null | undefined,
  options?: {
    colorScale?: readonly string[];
    domainMin?: number;
    domainMax?: number;
  },
): ChartLineHeatlineRun {
  const scale =
    Array.isArray(options?.colorScale) && options!.colorScale!.length > 0
      ? options!.colorScale!
      : DEFAULT_CHART_LINE_HEATLINE_SCALE;
  const finite = getLineHeatlineFinitePoints(points);
  const sorted = [...finite].sort((a, b) => a.x - b.x);

  if (sorted.length === 0) {
    return {
      points: [],
      segments: [],
      valueMin: NaN,
      valueMax: NaN,
      domainMin: NaN,
      domainMax: NaN,
      totalSamples: 0,
      ok: false,
    };
  }

  let valueMin = Number.POSITIVE_INFINITY;
  let valueMax = Number.NEGATIVE_INFINITY;
  for (const p of sorted) {
    if (p.value < valueMin) valueMin = p.value;
    if (p.value > valueMax) valueMax = p.value;
  }

  let domainMin = isFiniteNumber(options?.domainMin)
    ? options!.domainMin!
    : valueMin;
  let domainMax = isFiniteNumber(options?.domainMax)
    ? options!.domainMax!
    : valueMax;
  if (domainMin > domainMax) {
    const swap = domainMin;
    domainMin = domainMax;
    domainMax = swap;
  }

  const pointsOut: ChartLineHeatlineSamplePoint[] = sorted.map((p, i) => {
    const t = normalizeLineHeatlineValue(p.value, domainMin, domainMax);
    return {
      index: i,
      x: p.x,
      value: p.value,
      t,
      color: interpolateLineHeatlineColor(scale, t),
    };
  });

  const segments: ChartLineHeatlineSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const midValue = (sorted[i]!.value + sorted[i + 1]!.value) / 2;
    const t = normalizeLineHeatlineValue(midValue, domainMin, domainMax);
    segments.push({
      index: i,
      startIndex: i,
      endIndex: i + 1,
      value: midValue,
      t,
      color: interpolateLineHeatlineColor(scale, t),
    });
  }

  return {
    points: pointsOut,
    segments,
    valueMin,
    valueMax,
    domainMin,
    domainMax,
    totalSamples: sorted.length,
    ok: true,
  };
}

function normaliseScale(
  scale: readonly string[] | null | undefined,
): string[] {
  if (Array.isArray(scale) && scale.length > 0) return [...scale];
  return [...DEFAULT_CHART_LINE_HEATLINE_SCALE];
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineHeatlineLayout(
  options: ComputeLineHeatlineLayoutOptions,
): ChartLineHeatlineLayout {
  const {
    data,
    colorScale,
    domainMin,
    domainMax,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_HEATLINE_TICK_COUNT,
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
  const run = runLineHeatline(data, {
    ...(Array.isArray(colorScale) ? { colorScale } : {}),
    ...(isFiniteNumber(domainMin) ? { domainMin } : {}),
    ...(isFiniteNumber(domainMax) ? { domainMax } : {}),
  });
  const empty: ChartLineHeatlineLayout = {
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
    points: [],
    segments: [],
    valueMin: NaN,
    valueMax: NaN,
    domainMin: run.domainMin,
    domainMax: run.domainMax,
    totalSamples: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok || run.points.length === 0) return empty;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const p of run.points) {
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

  const layoutPoints: ChartLineHeatlineLayoutPoint[] = run.points.map(
    (p) => ({
      ...p,
      px: projectX(p.x),
      py: projectY(p.value),
    }),
  );

  const layoutSegments: ChartLineHeatlineLayoutSegment[] =
    run.segments.map((seg) => {
      const a = layoutPoints[seg.startIndex]!;
      const b = layoutPoints[seg.endIndex]!;
      return {
        ...seg,
        px0: a.px,
        py0: a.py,
        px1: b.px,
        py1: b.py,
        path: `M ${a.px.toFixed(3)} ${a.py.toFixed(3)} L ${b.px.toFixed(3)} ${b.py.toFixed(3)}`,
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
    points: layoutPoints,
    segments: layoutSegments,
    valueMin: run.valueMin,
    valueMax: run.valueMax,
    domainMin: run.domainMin,
    domainMax: run.domainMax,
    totalSamples: run.totalSamples,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineHeatlineChart(
  data: readonly ChartLineHeatlinePoint[] | null | undefined,
  options?: {
    colorScale?: readonly string[];
    domainMin?: number;
    domainMax?: number;
    formatValue?: (n: number) => string;
  },
): string {
  const run = runLineHeatline(data, {
    ...(Array.isArray(options?.colorScale)
      ? { colorScale: options!.colorScale! }
      : {}),
    ...(isFiniteNumber(options?.domainMin)
      ? { domainMin: options!.domainMin! }
      : {}),
    ...(isFiniteNumber(options?.domainMax)
      ? { domainMax: options!.domainMax! }
      : {}),
  });
  if (!run.ok || run.totalSamples === 0) return 'No data';
  const fmt = options?.formatValue ?? defaultFormatValue;
  return `Line chart with a value-graded heatline stroke across ${run.totalSamples} points: values ${fmt(run.valueMin)} to ${fmt(run.valueMax)}, colour domain [${fmt(run.domainMin)}, ${fmt(run.domainMax)}].`;
}

export const ChartLineHeatline = forwardRef<
  HTMLDivElement,
  ChartLineHeatlineProps
>(function ChartLineHeatline(
  props: ChartLineHeatlineProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    colorScale,
    domainMin,
    domainMax,
    width = DEFAULT_CHART_LINE_HEATLINE_WIDTH,
    height = DEFAULT_CHART_LINE_HEATLINE_HEIGHT,
    padding = DEFAULT_CHART_LINE_HEATLINE_PADDING,
    tickCount = DEFAULT_CHART_LINE_HEATLINE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_HEATLINE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_HEATLINE_DOT_RADIUS,
    gridColor = DEFAULT_CHART_LINE_HEATLINE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_HEATLINE_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showScale = true,
    showTooltip = true,
    showConfigBadge = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a value-graded heatline stroke',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    xLabel,
    yLabel,
    onPointClick,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;
  const scale = useMemo(() => normaliseScale(colorScale), [colorScale]);

  const layout = useMemo(
    () =>
      computeLineHeatlineLayout({
        data,
        colorScale: scale,
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(domainMin) ? { domainMin } : {}),
        ...(isFiniteNumber(domainMax) ? { domainMax } : {}),
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(yMin) ? { yMin } : {}),
        ...(isFiniteNumber(yMax) ? { yMax } : {}),
      }),
    [
      data,
      scale,
      domainMin,
      domainMax,
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
      describeLineHeatlineChart(data, {
        colorScale: scale,
        formatValue,
        ...(isFiniteNumber(domainMin) ? { domainMin } : {}),
        ...(isFiniteNumber(domainMax) ? { domainMax } : {}),
      }),
    [ariaDescription, data, scale, formatValue, domainMin, domainMax],
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
        data-section="chart-line-heatline"
        data-empty="true"
        data-total-samples={0}
        data-segment-count={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-heatline-aria-desc"
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
      data-section="chart-line-heatline"
      data-empty="false"
      data-total-samples={layout.totalSamples}
      data-segment-count={layout.segments.length}
      data-value-min={layout.valueMin}
      data-value-max={layout.valueMax}
      data-domain-min={layout.domainMin}
      data-domain-max={layout.domainMax}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-heatline-aria-desc"
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
        data-section="chart-line-heatline-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-heatline-badge"
            data-domain-min={layout.domainMin}
            data-domain-max={layout.domainMax}
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
              data-section="chart-line-heatline-badge-icon"
              aria-hidden="true"
            >
              HEAT
            </span>
            <span data-section="chart-line-heatline-badge-lo">
              lo={formatValue(layout.domainMin)}
            </span>
            <span data-section="chart-line-heatline-badge-hi">
              hi={formatValue(layout.domainMax)}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-heatline-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-heatline-grid"
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
                    data-section="chart-line-heatline-grid-line"
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
                    data-section="chart-line-heatline-grid-line"
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
              data-section="chart-line-heatline-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-heatline-axis"
                data-axis="x"
                x1={layout.panel.x}
                y1={layout.panel.y + layout.panel.height}
                x2={layout.panel.x + layout.panel.width}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-heatline-axis"
                data-axis="y"
                x1={layout.panel.x}
                y1={layout.panel.y}
                x2={layout.panel.x}
                y2={layout.panel.y + layout.panel.height}
              />
              <g data-section="chart-line-heatline-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-heatline-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.panel.y + layout.panel.height}
                        y2={layout.panel.y + layout.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-heatline-tick-label"
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
              <g data-section="chart-line-heatline-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-heatline-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-heatline-tick-label"
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
                  data-section="chart-line-heatline-x-label"
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
                  data-section="chart-line-heatline-y-label"
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

          <g data-section="chart-line-heatline-segments">
            {layout.segments.map((seg) => (
              <path
                key={`seg-${seg.index}`}
                data-section="chart-line-heatline-segment"
                data-segment-index={seg.index}
                data-value={seg.value}
                data-t={seg.t}
                d={seg.path}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            ))}
          </g>

          {showDots ? (
            <g data-section="chart-line-heatline-dots">
              {layout.points.map((p) => {
                const isHover = hoverIndex === p.index;
                return (
                  <circle
                    key={`d-${p.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Point ${p.index + 1} at x ${formatX(p.x)}, value ${formatValue(p.value)}`}
                    data-section="chart-line-heatline-dot"
                    data-point-index={p.index}
                    data-x={p.x}
                    data-value={p.value}
                    data-t={p.t}
                    cx={p.px}
                    cy={p.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={p.color}
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
                    onClick={() => onPointClick?.({ point: p })}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoverIndex !== null && tooltipPos
          ? (() => {
              const p = layout.points.find((x) => x.index === hoverIndex);
              if (!p) return null;
              return (
                <div
                  data-section="chart-line-heatline-tooltip"
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
                    minWidth: 140,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-heatline-tooltip-swatch"
                    style={{
                      display: 'inline-block',
                      width: 9,
                      height: 9,
                      borderRadius: 2,
                      background: p.color,
                      marginRight: 5,
                    }}
                  />
                  <span data-section="chart-line-heatline-tooltip-x">
                    x: {formatX(p.x)}
                  </span>
                  <div
                    data-section="chart-line-heatline-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(p.value)}
                  </div>
                  <div data-section="chart-line-heatline-tooltip-level">
                    level: {Math.round(p.t * 100)}%
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showScale ? (
        <div
          data-section="chart-line-heatline-scale"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
          }}
        >
          <span
            data-section="chart-line-heatline-scale-min"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {formatValue(layout.domainMin)}
          </span>
          <div
            data-section="chart-line-heatline-scale-bar"
            style={{ display: 'flex', flex: '0 0 auto' }}
          >
            {scale.map((stop, i) => (
              <span
                key={`sw-${i}`}
                data-section="chart-line-heatline-scale-swatch"
                data-stop-index={i}
                style={{
                  display: 'inline-block',
                  width: 22,
                  height: 10,
                  background: stop,
                }}
              />
            ))}
          </div>
          <span
            data-section="chart-line-heatline-scale-max"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {formatValue(layout.domainMax)}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineHeatline.displayName = 'ChartLineHeatline';
