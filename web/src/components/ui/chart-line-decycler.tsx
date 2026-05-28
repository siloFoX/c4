import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_DECYCLER_WIDTH = 560;
export const DEFAULT_CHART_LINE_DECYCLER_HEIGHT = 320;
export const DEFAULT_CHART_LINE_DECYCLER_PADDING = 40;
export const DEFAULT_CHART_LINE_DECYCLER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DECYCLER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DECYCLER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DECYCLER_PERIOD = 30;
export const DEFAULT_CHART_LINE_DECYCLER_PRICE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DECYCLER_DECYCLER_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_DECYCLER_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DECYCLER_AXIS_COLOR = '#cbd5e1';

export type ChartLineDecyclerTrend = 'rising' | 'falling' | 'flat';

export interface ChartLineDecyclerPoint {
  x: number;
  value: number;
}

export interface ChartLineDecyclerSample {
  index: number;
  x: number;
  value: number;
  highpass: number;
  decycler: number;
  trend: ChartLineDecyclerTrend;
}

export interface ChartLineDecyclerRun {
  series: ChartLineDecyclerPoint[];
  period: number;
  alpha: number;
  highpass: number[];
  decycler: number[];
  samples: ChartLineDecyclerSample[];
  decyclerFinal: number;
  risingCount: number;
  fallingCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineDecyclerDot {
  index: number;
  x: number;
  value: number;
  highpass: number;
  decycler: number;
  trend: ChartLineDecyclerTrend;
  px: number;
  py: number;
}

export interface ChartLineDecyclerMarker {
  index: number;
  x: number;
  decycler: number;
  trend: ChartLineDecyclerTrend;
  px: number;
  py: number;
}

export interface ChartLineDecyclerLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: { x: number; y: number; width: number; height: number };
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  decyclerPath: string;
  priceDots: ChartLineDecyclerDot[];
  decyclerMarkers: ChartLineDecyclerMarker[];
  period: number;
  alpha: number;
  decyclerFinal: number;
  risingCount: number;
  fallingCount: number;
  flatCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineDecyclerLayoutOptions {
  data: readonly ChartLineDecyclerPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineDecyclerProps {
  data: readonly ChartLineDecyclerPoint[];
  period?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  decyclerColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showDecycler?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineDecyclerDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineDecyclerFinitePoints(
  points: readonly ChartLineDecyclerPoint[] | null | undefined,
): ChartLineDecyclerPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineDecyclerPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce an Ehlers Decycler period to an integer of at least 2. A
 * non-finite or sub-2 value falls back to `fallback`; a fractional
 * value floors.
 */
export function normalizeLineDecyclerPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

/**
 * The Ehlers one-pole highpass filter coefficient for a cutoff
 * `period`:
 *
 *   alpha = (cos(w) + sin(w) - 1) / cos(w),  w = 2*pi / period
 *
 * The result is clamped to the stable range [0, 1]; the lone
 * degenerate integer period (4, where cos(w) is zero) returns 1.
 */
export function computeLineDecyclerAlpha(period: number): number {
  const p = normalizeLineDecyclerPeriod(period, DEFAULT_CHART_LINE_DECYCLER_PERIOD);
  const w = (2 * Math.PI) / p;
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  if (Math.abs(cosW) < 1e-12) return 1;
  const a = (cosW + sinW - 1) / cosW;
  if (!isFiniteNumber(a)) return 1;
  if (a < 0) return 0;
  if (a > 1) return 1;
  return a;
}

/**
 * The Ehlers one-pole highpass of a series -- the fast cycle
 * component:
 *
 *   HP[i] = (1 - alpha/2) * (v[i] - v[i-1]) + (1 - alpha) * HP[i-1]
 *
 * seeded with HP[0] = 0.
 */
export function computeLineDecyclerHighpass(
  values: readonly number[] | null | undefined,
  period: number,
): number[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const out: number[] = new Array(n).fill(0);
  if (n === 0) return out;
  const alpha = computeLineDecyclerAlpha(period);
  const g = 1 - alpha / 2;
  const d = 1 - alpha;
  for (let i = 1; i < n; i += 1) {
    const cur = values[i];
    const prev = values[i - 1];
    const prevHp = out[i - 1] ?? 0;
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) {
      out[i] = d * prevHp;
      continue;
    }
    out[i] = g * (cur - prev) + d * prevHp;
  }
  return out;
}

/**
 * The Ehlers Decycler -- the price with its highpass cycle
 * component removed: `decycler[i] = v[i] - HP[i]`. What remains is
 * a smooth trend line.
 */
export function computeLineDecycler(
  values: readonly number[] | null | undefined,
  period: number,
): number[] {
  if (!Array.isArray(values)) return [];
  const hp = computeLineDecyclerHighpass(values, period);
  return values.map((v, i) =>
    isFiniteNumber(v) ? v - (hp[i] ?? 0) : v,
  );
}

function classifyTrend(slope: number): ChartLineDecyclerTrend {
  if (slope > 0) return 'rising';
  if (slope < 0) return 'falling';
  return 'flat';
}

export function runLineDecycler(
  points: readonly ChartLineDecyclerPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineDecyclerRun {
  const finite = getLineDecyclerFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineDecyclerPeriod(
    options?.period ?? DEFAULT_CHART_LINE_DECYCLER_PERIOD,
    DEFAULT_CHART_LINE_DECYCLER_PERIOD,
  );
  const alpha = computeLineDecyclerAlpha(period);
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      alpha,
      highpass: [],
      decycler: [],
      samples: [],
      decyclerFinal: NaN,
      risingCount: 0,
      fallingCount: 0,
      flatCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const highpass = computeLineDecyclerHighpass(closes, period);
  const decycler = closes.map((v, i) => v - (highpass[i] ?? 0));

  const samples: ChartLineDecyclerSample[] = series.map((p, i) => {
    const dec = decycler[i] ?? p.value;
    const prev = i > 0 ? (decycler[i - 1] ?? dec) : dec;
    return {
      index: i,
      x: p.x,
      value: p.value,
      highpass: highpass[i] ?? 0,
      decycler: dec,
      trend: classifyTrend(i > 0 ? dec - prev : 0),
    };
  });

  let risingCount = 0;
  let fallingCount = 0;
  let flatCount = 0;
  for (const s of samples) {
    if (s.trend === 'rising') risingCount += 1;
    else if (s.trend === 'falling') fallingCount += 1;
    else flatCount += 1;
  }

  return {
    series = [],
    period,
    alpha,
    highpass,
    decycler,
    samples,
    decyclerFinal: decycler[n - 1] ?? NaN,
    risingCount,
    fallingCount,
    flatCount,
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

export function computeLineDecyclerLayout(
  options: ComputeLineDecyclerLayoutOptions,
): ChartLineDecyclerLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_DECYCLER_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineDecycler(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });

  const empty: ChartLineDecyclerLayout = {
    ok: false,
    width,
    height,
    panel: { x: padding, y: padding, width: 0, height: 0 },
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    pricePath: '',
    decyclerPath: '',
    priceDots: [],
    decyclerMarkers: [],
    period: run.period,
    alpha: run.alpha,
    decyclerFinal: NaN,
    risingCount: 0,
    fallingCount: 0,
    flatCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    for (const v of [s.value, s.decycler]) {
      if (v < yLo) yLo = v;
      if (v > yHi) yHi = v;
    }
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

  const priceDots: ChartLineDecyclerDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    highpass: s.highpass,
    decycler: s.decycler,
    trend: s.trend,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const decyclerMarkers: ChartLineDecyclerMarker[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    decycler: s.decycler,
    trend: s.trend,
    px: projectX(s.x),
    py: projectY(s.decycler),
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
    decyclerPath: buildPath(
      decyclerMarkers.map((m) => ({ px: m.px, py: m.py })),
    ),
    priceDots,
    decyclerMarkers,
    period: run.period,
    alpha: run.alpha,
    decyclerFinal: run.decyclerFinal,
    risingCount: run.risingCount,
    fallingCount: run.fallingCount,
    flatCount: run.flatCount,
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

export function describeLineDecyclerChart(
  data: readonly ChartLineDecyclerPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineDecycler(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with an Ehlers Decycler overlay (period ${run.period}): the Decycler removes the dominant short cycle from the price by computing a one-pole highpass filter -- the fast oscillation -- and subtracting it, leaving a smooth trend line. Since price is the sum of a trend and a cycle, subtracting the highpass cycle leaves the trend. The Decycler closes at ${defaultFormatValue(run.decyclerFinal)} and is rising on ${run.risingCount} bars, falling on ${run.fallingCount} across ${run.samples.length} bars.`;
}

const DECYCLER_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineDecycler = forwardRef<
  HTMLDivElement,
  ChartLineDecyclerProps
>(function ChartLineDecycler(
  props: ChartLineDecyclerProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_DECYCLER_WIDTH,
    height = DEFAULT_CHART_LINE_DECYCLER_HEIGHT,
    padding = DEFAULT_CHART_LINE_DECYCLER_PADDING,
    tickCount = DEFAULT_CHART_LINE_DECYCLER_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DECYCLER_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DECYCLER_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DECYCLER_PRICE_COLOR,
    decyclerColor = DEFAULT_CHART_LINE_DECYCLER_DECYCLER_COLOR,
    gridColor = DEFAULT_CHART_LINE_DECYCLER_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_DECYCLER_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showDecycler = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with an Ehlers Decycler overlay',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
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
      computeLineDecyclerLayout({
        data,
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(period) ? { period } : {}),
      }),
    [data, width, height, padding, tickCount, period],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineDecyclerChart(data, {
        ...(isFiniteNumber(period) ? { period } : {}),
      }),
    [ariaDescription, data, period],
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
        data-section="chart-line-decycler"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-decycler-aria-desc"
          style={DECYCLER_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const panel = layout.panel;
  const priceVisible = !hiddenSet.has('price');
  const decyclerVisible = showDecycler && !hiddenSet.has('decycler');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'decycler', label: 'Decycler', color: decyclerColor },
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
      data-section="chart-line-decycler"
      data-empty="false"
      data-period={layout.period}
      data-alpha={layout.alpha}
      data-decycler-final={layout.decyclerFinal}
      data-rising-count={layout.risingCount}
      data-falling-count={layout.fallingCount}
      data-flat-count={layout.flatCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-decycler-aria-desc"
        style={DECYCLER_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-decycler-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-decycler-badge"
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
              data-section="chart-line-decycler-badge-icon"
              aria-hidden="true"
              style={{ color: decyclerColor }}
            >
              DECYCLER
            </span>
            <span data-section="chart-line-decycler-badge-config">
              {layout.period}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-decycler-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-decycler-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => (
                <line
                  key={`g-${i}`}
                  data-section="chart-line-decycler-grid-line"
                  x1={panel.x}
                  x2={panel.x + panel.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-decycler-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-decycler-axis"
                data-axis="y"
                x1={panel.x}
                y1={panel.y}
                x2={panel.x}
                y2={panel.y + panel.height}
              />
              <line
                data-section="chart-line-decycler-axis"
                data-axis="x"
                x1={panel.x}
                y1={panel.y + panel.height}
                x2={panel.x + panel.width}
                y2={panel.y + panel.height}
              />
              {layout.yTicks.map((t, i) => (
                <text
                  key={`yt-${i}`}
                  data-section="chart-line-decycler-tick-label"
                  data-axis="y"
                  x={panel.x - 6}
                  y={t.py + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill={axisColor}
                  stroke="none"
                >
                  {formatValue(t.value)}
                </text>
              ))}
              {layout.xTicks.map((t, i) => (
                <text
                  key={`xt-${i}`}
                  data-section="chart-line-decycler-tick-label"
                  data-axis="x"
                  x={t.px}
                  y={panel.y + panel.height + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill={axisColor}
                  stroke="none"
                >
                  {formatX(t.value)}
                </text>
              ))}
            </g>
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-decycler-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-decycler-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-decycler-dot"
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

          {decyclerVisible && layout.decyclerPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Decycler line"
              data-section="chart-line-decycler-decycler-line"
              d={layout.decyclerPath}
              fill="none"
              stroke={decyclerColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {decyclerVisible ? (
            <g data-section="chart-line-decycler-markers">
              {layout.decyclerMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Decycler at x ${formatX(m.x)}: ${formatValue(m.decycler)}, ${m.trend}`}
                    data-section="chart-line-decycler-marker"
                    data-point-index={m.index}
                    data-decycler={m.decycler}
                    data-trend={m.trend}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={decyclerColor}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverIndex(m.index);
                      setTooltipPos({ px: m.px, py: m.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(m.index);
                      setTooltipPos({ px: m.px, py: m.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => {
                      const d = layout.priceDots.find(
                        (x) => x.index === m.index,
                      );
                      if (d) onPointClick?.({ point: d });
                    }}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoverIndex !== null && tooltipPos
          ? (() => {
              const d = layout.priceDots.find((x) => x.index === hoverIndex);
              if (!d) return null;
              return (
                <div
                  data-section="chart-line-decycler-tooltip"
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
                    minWidth: 140,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div data-section="chart-line-decycler-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-decycler-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-decycler-tooltip-decycler">
                    decycler: {formatValue(d.decycler)}
                  </div>
                  <div data-section="chart-line-decycler-tooltip-trend">
                    trend: {d.trend}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-decycler-legend"
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
                data-section="chart-line-decycler-legend-item"
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
                  data-section="chart-line-decycler-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-decycler-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-decycler-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.risingCount} rising, {layout.fallingCount} falling
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineDecycler.displayName = 'ChartLineDecycler';
