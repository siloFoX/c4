import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_SUPERSMOOTHER_WIDTH = 560;
export const DEFAULT_CHART_LINE_SUPERSMOOTHER_HEIGHT = 320;
export const DEFAULT_CHART_LINE_SUPERSMOOTHER_PADDING = 40;
export const DEFAULT_CHART_LINE_SUPERSMOOTHER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SUPERSMOOTHER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SUPERSMOOTHER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SUPERSMOOTHER_PERIOD = 10;
export const DEFAULT_CHART_LINE_SUPERSMOOTHER_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_SUPERSMOOTHER_SMOOTHER_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SUPERSMOOTHER_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SUPERSMOOTHER_AXIS_COLOR = '#cbd5e1';

export type ChartLineSuperSmootherPosition = 'above' | 'below' | 'on';

export interface ChartLineSuperSmootherPoint {
  x: number;
  value: number;
}

export interface ChartLineSuperSmootherCoefficients {
  a1: number;
  b1: number;
  c1: number;
  c2: number;
  c3: number;
}

export interface ChartLineSuperSmootherSample {
  index: number;
  x: number;
  value: number;
  smoother: number;
  position: ChartLineSuperSmootherPosition;
}

export interface ChartLineSuperSmootherRun {
  series: ChartLineSuperSmootherPoint[];
  period: number;
  smoother: number[];
  samples: ChartLineSuperSmootherSample[];
  smootherFinal: number;
  smootherMin: number;
  smootherMax: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineSuperSmootherPriceDot {
  index: number;
  x: number;
  value: number;
  smoother: number;
  position: ChartLineSuperSmootherPosition;
  px: number;
  py: number;
}

export interface ChartLineSuperSmootherMarker {
  index: number;
  x: number;
  smoother: number;
  px: number;
  py: number;
}

export interface ChartLineSuperSmootherPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineSuperSmootherLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineSuperSmootherPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  smootherPath: string;
  priceDots: ChartLineSuperSmootherPriceDot[];
  smootherMarkers: ChartLineSuperSmootherMarker[];
  period: number;
  smootherFinal: number;
  smootherMin: number;
  smootherMax: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineSuperSmootherLayoutOptions {
  data: readonly ChartLineSuperSmootherPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineSuperSmootherProps {
  data: readonly ChartLineSuperSmootherPoint[];
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
  smootherColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSmoother?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineSuperSmootherPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineSuperSmootherFinitePoints(
  points: readonly ChartLineSuperSmootherPoint[] | null | undefined,
): ChartLineSuperSmootherPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineSuperSmootherPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineSuperSmootherPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The coefficients of John Ehlers' Super Smoother, a two-pole
 * low-pass filter. With `arg = 1.414 * PI / period`:
 *
 *   a1 = exp(-arg)
 *   b1 = 2 * a1 * cos(arg)
 *   c2 = b1
 *   c3 = -(a1 * a1)
 *   c1 = 1 - c2 - c3
 *
 * `c1 + c2 + c3 = 1`, so the filter has unit gain at zero
 * frequency and passes a flat series straight through.
 */
export function computeLineSuperSmootherCoefficients(
  period: number,
): ChartLineSuperSmootherCoefficients {
  const p = normalizeLineSuperSmootherPeriod(
    period,
    DEFAULT_CHART_LINE_SUPERSMOOTHER_PERIOD,
  );
  const arg = (1.414 * Math.PI) / p;
  const a1 = Math.exp(-arg);
  const b1 = 2 * a1 * Math.cos(arg);
  const c2 = b1;
  const c3 = -(a1 * a1);
  const c1 = 1 - c2 - c3;
  return { a1, b1, c1, c2, c3 };
}

/**
 * The Ehlers Super Smoother filter. It blends the two most recent
 * prices and feeds back the two most recent filter values:
 *
 *   SS[i] = c1 * (price[i] + price[i-1]) / 2 + c2 * SS[i-1] + c3 * SS[i-2]
 *
 * The two-pole feedback rejects noise sharply while adding very
 * little lag. The first two bars seed straight from the price
 * (SS[0] = price[0], SS[1] = price[1]); there is no null warm-up.
 */
export function computeLineSuperSmoother(
  values: readonly number[] | null | undefined,
  period: number,
): number[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  if (n === 0) return [];
  const out: number[] = new Array(n);
  out[0] = values[0]!;
  if (n === 1) return out;
  out[1] = values[1]!;
  const { c1, c2, c3 } = computeLineSuperSmootherCoefficients(period);
  for (let i = 2; i < n; i += 1) {
    out[i] =
      (c1 * (values[i]! + values[i - 1]!)) / 2 +
      c2 * out[i - 1]! +
      c3 * out[i - 2]!;
  }
  return out;
}

function classifyPosition(
  value: number,
  smoother: number,
): ChartLineSuperSmootherPosition {
  if (value > smoother) return 'above';
  if (value < smoother) return 'below';
  return 'on';
}

export function runLineSuperSmoother(
  points: readonly ChartLineSuperSmootherPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineSuperSmootherRun {
  const finite = getLineSuperSmootherFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineSuperSmootherPeriod(
    options?.period ?? DEFAULT_CHART_LINE_SUPERSMOOTHER_PERIOD,
    DEFAULT_CHART_LINE_SUPERSMOOTHER_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      smoother: [],
      samples: [],
      smootherFinal: NaN,
      smootherMin: NaN,
      smootherMax: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const smoother = computeLineSuperSmoother(
    series.map((p) => p.value),
    period,
  );

  const samples: ChartLineSuperSmootherSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    smoother: smoother[i]!,
    position: classifyPosition(p.value, smoother[i]!),
  }));

  let smootherMin = Number.POSITIVE_INFINITY;
  let smootherMax = Number.NEGATIVE_INFINITY;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.smoother < smootherMin) smootherMin = s.smoother;
    if (s.smoother > smootherMax) smootherMax = s.smoother;
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series,
    period,
    smoother,
    samples,
    smootherFinal: smoother[smoother.length - 1]!,
    smootherMin,
    smootherMax,
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

export function computeLineSuperSmootherLayout(
  options: ComputeLineSuperSmootherLayoutOptions,
): ChartLineSuperSmootherLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_SUPERSMOOTHER_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineSuperSmootherPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineSuperSmoother(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineSuperSmootherLayout = {
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
    smootherPath: '',
    priceDots: [],
    smootherMarkers: [],
    period: run.period,
    smootherFinal: NaN,
    smootherMin: NaN,
    smootherMax: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineSuperSmootherPanel = {
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
    if (s.value < yLo) yLo = s.value;
    if (s.value > yHi) yHi = s.value;
    if (s.smoother < yLo) yLo = s.smoother;
    if (s.smoother > yHi) yHi = s.smoother;
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

  const priceDots: ChartLineSuperSmootherPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    smoother: s.smoother,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const smootherMarkers: ChartLineSuperSmootherMarker[] = run.samples.map(
    (s) => ({
      index: s.index,
      x: s.x,
      smoother: s.smoother,
      px: projectX(s.x),
      py: projectY(s.smoother),
    }),
  );

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
    smootherPath: buildPath(
      smootherMarkers.map((m) => ({ px: m.px, py: m.py })),
    ),
    priceDots,
    smootherMarkers,
    period: run.period,
    smootherFinal: run.smootherFinal,
    smootherMin: run.smootherMin,
    smootherMax: run.smootherMax,
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

export function describeLineSuperSmootherChart(
  data: readonly ChartLineSuperSmootherPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineSuperSmoother(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with an Ehlers Super Smoother overlay (period ${run.period}): the Super Smoother is John Ehlers' two-pole low-pass filter. It blends the two most recent prices and feeds back the two most recent filter values as SS = c1 * (price + price prev) / 2 + c2 * SS prev + c3 * SS prev2, where the coefficients come from a1 = exp(-1.414 * PI / N) and b1 = 2 * a1 * cos(1.414 * PI / N). The two-pole feedback rejects noise sharply while adding very little lag. The price runs above the Super Smoother on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const SUPERSMOOTHER_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineSuperSmoother = forwardRef<
  HTMLDivElement,
  ChartLineSuperSmootherProps
>(function ChartLineSuperSmoother(
  props: ChartLineSuperSmootherProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_SUPERSMOOTHER_WIDTH,
    height = DEFAULT_CHART_LINE_SUPERSMOOTHER_HEIGHT,
    padding = DEFAULT_CHART_LINE_SUPERSMOOTHER_PADDING,
    tickCount = DEFAULT_CHART_LINE_SUPERSMOOTHER_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SUPERSMOOTHER_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SUPERSMOOTHER_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SUPERSMOOTHER_PRICE_COLOR,
    smootherColor = DEFAULT_CHART_LINE_SUPERSMOOTHER_SMOOTHER_COLOR,
    gridColor = DEFAULT_CHART_LINE_SUPERSMOOTHER_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_SUPERSMOOTHER_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSmoother = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with an Ehlers Super Smoother overlay',
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
      computeLineSuperSmootherLayout({
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
      describeLineSuperSmootherChart(data, {
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
        data-section="chart-line-supersmoother"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-supersmoother-aria-desc"
          style={SUPERSMOOTHER_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const cp = layout.panel;
  const priceVisible = !hiddenSet.has('price');
  const smootherVisible = showSmoother && !hiddenSet.has('smoother');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'smoother', label: 'Super Smoother', color: smootherColor },
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
      data-section="chart-line-supersmoother"
      data-empty="false"
      data-period={layout.period}
      data-smoother-final={layout.smootherFinal}
      data-above-count={layout.aboveCount}
      data-below-count={layout.belowCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-supersmoother-aria-desc"
        style={SUPERSMOOTHER_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-supersmoother-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-supersmoother-badge"
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
              data-section="chart-line-supersmoother-badge-icon"
              aria-hidden="true"
              style={{ color: smootherColor }}
            >
              SMOOTHER
            </span>
            <span data-section="chart-line-supersmoother-badge-period">
              p={layout.period}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-supersmoother-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-supersmoother-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => (
                <line
                  key={`gy-${i}`}
                  data-section="chart-line-supersmoother-grid-line"
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
              data-section="chart-line-supersmoother-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-supersmoother-axis"
                data-axis="x"
                x1={cp.x}
                y1={cp.y + cp.height}
                x2={cp.x + cp.width}
                y2={cp.y + cp.height}
              />
              <line
                data-section="chart-line-supersmoother-axis"
                data-axis="y"
                x1={cp.x}
                y1={cp.y}
                x2={cp.x}
                y2={cp.y + cp.height}
              />
              {layout.yTicks.map((t, i) => (
                <g
                  key={`yt-${i}`}
                  data-section="chart-line-supersmoother-tick"
                  data-axis="y"
                >
                  <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                  <text
                    data-section="chart-line-supersmoother-tick-label"
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
                  data-section="chart-line-supersmoother-tick"
                  data-axis="x"
                >
                  <line
                    x1={t.px}
                    x2={t.px}
                    y1={cp.y + cp.height}
                    y2={cp.y + cp.height + 4}
                  />
                  <text
                    data-section="chart-line-supersmoother-tick-label"
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

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-supersmoother-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-supersmoother-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-supersmoother-dot"
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

          {smootherVisible && layout.smootherPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Ehlers Super Smoother line"
              data-section="chart-line-supersmoother-smoother-line"
              d={layout.smootherPath}
              fill="none"
              stroke={smootherColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {smootherVisible ? (
            <g data-section="chart-line-supersmoother-markers">
              {layout.smootherMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Super Smoother at x ${formatX(m.x)}: ${formatValue(m.smoother)}`}
                    data-section="chart-line-supersmoother-marker"
                    data-point-index={m.index}
                    data-smoother={m.smoother}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={smootherColor}
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
                  data-section="chart-line-supersmoother-tooltip"
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
                  <div data-section="chart-line-supersmoother-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-supersmoother-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-supersmoother-tooltip-smoother">
                    smoother: {formatValue(d.smoother)}
                  </div>
                  <div data-section="chart-line-supersmoother-tooltip-position">
                    position: {d.position}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-supersmoother-legend"
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
                data-section="chart-line-supersmoother-legend-item"
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
                  data-section="chart-line-supersmoother-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-supersmoother-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-supersmoother-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.aboveCount} above, {layout.belowCount} below
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineSuperSmoother.displayName = 'ChartLineSuperSmoother';
