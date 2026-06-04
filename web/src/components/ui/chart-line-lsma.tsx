import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_LSMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_LSMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_LSMA_PADDING = 40;
export const DEFAULT_CHART_LINE_LSMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_LSMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_LSMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_LSMA_PERIOD = 25;
export const DEFAULT_CHART_LINE_LSMA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_LSMA_LSMA_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_LSMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_LSMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineLsmaPosition = 'above' | 'below' | 'on';

export interface ChartLineLsmaPoint {
  x: number;
  value: number;
}

export interface ChartLineLsmaSample {
  index: number;
  x: number;
  value: number;
  lsma: number | null;
  slope: number | null;
  position: ChartLineLsmaPosition;
}

export interface ChartLineLsmaRun {
  series: ChartLineLsmaPoint[];
  period: number;
  lsma: (number | null)[];
  slope: (number | null)[];
  samples: ChartLineLsmaSample[];
  lsmaFinal: number;
  lsmaMin: number;
  lsmaMax: number;
  slopeFinal: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineLsmaPriceDot {
  index: number;
  x: number;
  value: number;
  lsma: number | null;
  slope: number | null;
  position: ChartLineLsmaPosition;
  px: number;
  py: number;
}

export interface ChartLineLsmaMarker {
  index: number;
  x: number;
  lsma: number;
  px: number;
  py: number;
}

export interface ChartLineLsmaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineLsmaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineLsmaPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  lsmaPath: string;
  priceDots: ChartLineLsmaPriceDot[];
  lsmaMarkers: ChartLineLsmaMarker[];
  period: number;
  lsmaFinal: number;
  lsmaMin: number;
  lsmaMax: number;
  slopeFinal: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineLsmaLayoutOptions {
  data: readonly ChartLineLsmaPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineLsmaProps {
  data: readonly ChartLineLsmaPoint[];
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
  lsmaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLsma?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineLsmaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineLsmaFinitePoints(
  points: readonly ChartLineLsmaPoint[] | null | undefined,
): ChartLineLsmaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineLsmaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineLsmaPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Fit an ordinary least-squares straight line `y = a + b*x` across a
 * window of `p` values whose relative x-indices run `0 .. p-1`, then
 * read it at its newest end `x = p - 1`. With `meanX = (p-1)/2` the
 * endpoint simplifies to `meanY + slope*meanX` because
 * `(p-1) - meanX === meanX`. `slope` is the regression slope `b`; for
 * `p === 1` the slope is undefined (Sxx is zero) and defaults to 0,
 * so the endpoint is just the lone value.
 */
function lsmaWindow(
  values: readonly number[],
  start: number,
  p: number,
): { lsma: number; slope: number } {
  let sumY = 0;
  let sumXY = 0;
  for (let k = 0; k < p; k += 1) {
    const y = values[start + k]!;
    sumY += y;
    sumXY += k * y;
  }
  const meanX = (p - 1) / 2;
  const meanY = sumY / p;
  const sxx = (p * (p * p - 1)) / 12;
  const sxy = sumXY - meanX * sumY;
  const slopeRaw = sxx === 0 ? 0 : sxy / sxx;
  const slope = slopeRaw === 0 ? 0 : slopeRaw;
  const lsmaRaw = meanY + slope * meanX;
  const lsma = lsmaRaw === 0 ? 0 : lsmaRaw;
  return { lsma, slope };
}

/**
 * Least Squares Moving Average. Each plotted value is the endpoint of
 * an ordinary least-squares line fitted across the last `period`
 * prices -- the regression line projected forward to the current bar.
 * Because the line is read at its newest end (rather than averaged
 * across the whole window) the LSMA tracks price more closely and
 * turns sooner than a simple moving average of the same length, while
 * the linear fit filters single-bar noise. The LSMA is defined from
 * index `period - 1` onward; earlier indices are null.
 */
export function computeLineLsma(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p) return out;
  for (let i = p - 1; i < n; i += 1) {
    out[i] = lsmaWindow(values, i - p + 1, p).lsma;
  }
  return out;
}

/**
 * The slope of the rolling least-squares regression line behind the
 * LSMA -- the local linear trend per bar. Defined from index
 * `period - 1` onward; earlier indices are null. A `period` of 1 has
 * no slope and reads 0.
 */
export function computeLineLsmaSlope(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p) return out;
  for (let i = p - 1; i < n; i += 1) {
    out[i] = lsmaWindow(values, i - p + 1, p).slope;
  }
  return out;
}

function classifyPosition(
  value: number,
  lsma: number | null,
): ChartLineLsmaPosition {
  if (lsma === null) return 'on';
  if (value > lsma) return 'above';
  if (value < lsma) return 'below';
  return 'on';
}

export function runLineLsma(
  points: readonly ChartLineLsmaPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineLsmaRun {
  const finite = getLineLsmaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineLsmaPeriod(
    options?.period ?? DEFAULT_CHART_LINE_LSMA_PERIOD,
    DEFAULT_CHART_LINE_LSMA_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      lsma: [],
      slope: [],
      samples: [],
      lsmaFinal: NaN,
      lsmaMin: NaN,
      lsmaMax: NaN,
      slopeFinal: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const lsma = computeLineLsma(values, period);
  const slope = computeLineLsmaSlope(values, period);

  const samples: ChartLineLsmaSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    lsma: lsma[i] ?? null,
    slope: slope[i] ?? null,
    position: classifyPosition(p.value, lsma[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let lsmaMin = NaN;
  let lsmaMax = NaN;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.lsma !== null) {
      if (Number.isNaN(lsmaMin) || s.lsma < lsmaMin) lsmaMin = s.lsma;
      if (Number.isNaN(lsmaMax) || s.lsma > lsmaMax) lsmaMax = s.lsma;
    }
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series,
    period,
    lsma,
    slope,
    samples,
    lsmaFinal: lastDefined(lsma),
    lsmaMin,
    lsmaMax,
    slopeFinal: lastDefined(slope),
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

export function computeLineLsmaLayout(
  options: ComputeLineLsmaLayoutOptions,
): ChartLineLsmaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_LSMA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineLsmaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineLsma(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineLsmaLayout = {
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
    lsmaPath: '',
    priceDots: [],
    lsmaMarkers: [],
    period: run.period,
    lsmaFinal: NaN,
    lsmaMin: NaN,
    lsmaMax: NaN,
    slopeFinal: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineLsmaPanel = {
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
    if (s.lsma !== null) {
      if (s.lsma < yLo) yLo = s.lsma;
      if (s.lsma > yHi) yHi = s.lsma;
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

  const priceDots: ChartLineLsmaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    lsma: s.lsma,
    slope: s.slope,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const lsmaMarkers: ChartLineLsmaMarker[] = [];
  const lsmaPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.lsma !== null) {
      const px = projectX(s.x);
      const py = projectY(s.lsma);
      lsmaPts.push({ px, py });
      lsmaMarkers.push({ index: s.index, x: s.x, lsma: s.lsma, px, py });
    }
  }

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
    lsmaPath: buildPath(lsmaPts),
    priceDots,
    lsmaMarkers,
    period: run.period,
    lsmaFinal: run.lsmaFinal,
    lsmaMin: run.lsmaMin,
    lsmaMax: run.lsmaMax,
    slopeFinal: run.slopeFinal,
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

export function describeLineLsmaChart(
  data: readonly ChartLineLsmaPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineLsma(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Least Squares Moving Average (LSMA) overlay (period ${run.period}): each plotted value is the endpoint of an ordinary least-squares straight line fitted across the last ${run.period} prices -- the regression line projected forward to the current bar. Because the line is read at its newest end rather than averaged across the whole window, the LSMA tracks price more closely and turns sooner than a simple moving average of the same length, while the linear fit filters single-bar noise; the line's slope is the local trend. The price runs above the LSMA on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const LSMA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineLsma = forwardRef<HTMLDivElement, ChartLineLsmaProps>(
  function ChartLineLsma(
    props: ChartLineLsmaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_LSMA_WIDTH,
      height = DEFAULT_CHART_LINE_LSMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_LSMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_LSMA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_LSMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_LSMA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_LSMA_PRICE_COLOR,
      lsmaColor = DEFAULT_CHART_LINE_LSMA_LSMA_COLOR,
      gridColor = DEFAULT_CHART_LINE_LSMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_LSMA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showLsma = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Least Squares Moving Average overlay',
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
        computeLineLsmaLayout({
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
        describeLineLsmaChart(data, {
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
          data-section="chart-line-lsma"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-lsma-aria-desc"
            style={LSMA_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const lsmaVisible = showLsma && !hiddenSet.has('lsma');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'lsma', label: 'LSMA', color: lsmaColor },
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
        data-section="chart-line-lsma"
        data-empty="false"
        data-period={layout.period}
        data-lsma-final={layout.lsmaFinal}
        data-slope-final={layout.slopeFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-lsma-aria-desc"
          style={LSMA_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-lsma-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-lsma-badge"
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
                data-section="chart-line-lsma-badge-icon"
                aria-hidden="true"
                style={{ color: lsmaColor }}
              >
                LSMA
              </span>
              <span data-section="chart-line-lsma-badge-period">
                p={layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-lsma-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-lsma-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-lsma-grid-line"
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
                data-section="chart-line-lsma-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-lsma-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-lsma-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-lsma-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-lsma-tick-label"
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
                    data-section="chart-line-lsma-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-lsma-tick-label"
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
                data-section="chart-line-lsma-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-lsma-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-lsma-dot"
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

            {lsmaVisible && layout.lsmaPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Least Squares Moving Average line"
                data-section="chart-line-lsma-lsma-line"
                d={layout.lsmaPath}
                fill="none"
                stroke={lsmaColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {lsmaVisible ? (
              <g data-section="chart-line-lsma-markers">
                {layout.lsmaMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`LSMA at x ${formatX(m.x)}: ${formatValue(m.lsma)}`}
                      data-section="chart-line-lsma-marker"
                      data-point-index={m.index}
                      data-lsma={m.lsma}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={lsmaColor}
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
                    data-section="chart-line-lsma-tooltip"
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
                    <div data-section="chart-line-lsma-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-lsma-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-lsma-tooltip-lsma">
                      lsma: {d.lsma === null ? 'n/a' : formatValue(d.lsma)}
                    </div>
                    <div data-section="chart-line-lsma-tooltip-slope">
                      slope: {d.slope === null ? 'n/a' : formatValue(d.slope)}
                    </div>
                    <div data-section="chart-line-lsma-tooltip-position">
                      position: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-lsma-legend"
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
                  data-section="chart-line-lsma-legend-item"
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
                    data-section="chart-line-lsma-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-lsma-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-lsma-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.aboveCount} above, {layout.belowCount} below
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineLsma.displayName = 'ChartLineLsma';
