import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_TRIMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_TRIMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_TRIMA_PADDING = 40;
export const DEFAULT_CHART_LINE_TRIMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TRIMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TRIMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TRIMA_PERIOD = 20;
export const DEFAULT_CHART_LINE_TRIMA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_TRIMA_TRIMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TRIMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TRIMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineTrimaPosition = 'above' | 'below' | 'on';

export interface ChartLineTrimaPoint {
  x: number;
  value: number;
}

export interface ChartLineTrimaSample {
  index: number;
  x: number;
  value: number;
  inner: number | null;
  trima: number | null;
  position: ChartLineTrimaPosition;
}

export interface ChartLineTrimaRun {
  series: ChartLineTrimaPoint[];
  period: number;
  firstPeriod: number;
  secondPeriod: number;
  inner: (number | null)[];
  trima: (number | null)[];
  samples: ChartLineTrimaSample[];
  trimaFinal: number;
  trimaMin: number;
  trimaMax: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineTrimaPriceDot {
  index: number;
  x: number;
  value: number;
  inner: number | null;
  trima: number | null;
  position: ChartLineTrimaPosition;
  px: number;
  py: number;
}

export interface ChartLineTrimaMarker {
  index: number;
  x: number;
  trima: number;
  px: number;
  py: number;
}

export interface ChartLineTrimaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineTrimaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineTrimaPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  trimaPath: string;
  priceDots: ChartLineTrimaPriceDot[];
  trimaMarkers: ChartLineTrimaMarker[];
  period: number;
  firstPeriod: number;
  secondPeriod: number;
  trimaFinal: number;
  trimaMin: number;
  trimaMax: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineTrimaLayoutOptions {
  data: readonly ChartLineTrimaPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineTrimaProps {
  data: readonly ChartLineTrimaPoint[];
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
  trimaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTrima?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineTrimaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineTrimaFinitePoints(
  points: readonly ChartLineTrimaPoint[] | null | undefined,
): ChartLineTrimaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineTrimaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineTrimaPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The two simple-moving-average sub-periods whose composition makes
 * a Triangular Moving Average of `period`. For an odd period both
 * sub-averages span `(period + 1) / 2`; for an even period the first
 * spans `period / 2 + 1` and the second `period / 2`. Either way the
 * two sub-periods sum to `period + 1`, so the combined warm-up is
 * `period - 1` -- the same as a plain simple moving average.
 */
export function lineTrimaSubPeriods(period: number): {
  first: number;
  second: number;
} {
  const p = period < 1 ? 1 : Math.floor(period);
  if (p % 2 === 1) {
    const half = (p + 1) / 2;
    return { first: half, second: half };
  }
  return { first: p / 2 + 1, second: p / 2 };
}

/**
 * A simple moving average over `period` values, tolerating the
 * leading `null` placeholders of a derived series. Each output is
 * the mean of the trailing window; a window that contains any
 * `null` reads `null`.
 */
export function computeLineTrimaSma(
  src: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let sum = 0;
    let ok = true;
    for (let j = i - p + 1; j <= i; j += 1) {
      const v = src[j];
      if (!isDefined(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (ok) out[i] = sum / p;
  }
  return out;
}

/**
 * The Triangular Moving Average -- a doubly-smoothed average. The
 * price is run through a simple moving average, and that average is
 * run through a second simple moving average. Composing the two
 * box-car averages makes the effective weights form a triangle
 * peaking in the middle of the window, so the TRIMA emphasises the
 * centre of the window and produces an exceptionally smooth line.
 * It is defined from index `period - 1` onward.
 */
export function computeLineTrima(
  values: readonly number[] | null | undefined,
  period: number,
): { inner: (number | null)[]; trima: (number | null)[] } {
  if (!Array.isArray(values)) return { inner: [], trima: [] };
  const { first, second } = lineTrimaSubPeriods(period);
  const inner = computeLineTrimaSma(values, first);
  const trima = computeLineTrimaSma(inner, second);
  return { inner, trima };
}

function classifyPosition(
  value: number,
  trima: number | null,
): ChartLineTrimaPosition {
  if (trima === null) return 'on';
  if (value > trima) return 'above';
  if (value < trima) return 'below';
  return 'on';
}

export function runLineTrima(
  points: readonly ChartLineTrimaPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineTrimaRun {
  const finite = getLineTrimaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineTrimaPeriod(
    options?.period ?? DEFAULT_CHART_LINE_TRIMA_PERIOD,
    DEFAULT_CHART_LINE_TRIMA_PERIOD,
  );
  const { first: firstPeriod, second: secondPeriod } =
    lineTrimaSubPeriods(period);
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      firstPeriod,
      secondPeriod,
      inner: [],
      trima: [],
      samples: [],
      trimaFinal: NaN,
      trimaMin: NaN,
      trimaMax: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { inner, trima } = computeLineTrima(values, period);

  const samples: ChartLineTrimaSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    inner: inner[i] ?? null,
    trima: trima[i] ?? null,
    position: classifyPosition(p.value, trima[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let trimaMin = NaN;
  let trimaMax = NaN;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.trima !== null) {
      if (Number.isNaN(trimaMin) || s.trima < trimaMin) trimaMin = s.trima;
      if (Number.isNaN(trimaMax) || s.trima > trimaMax) trimaMax = s.trima;
    }
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series,
    period,
    firstPeriod,
    secondPeriod,
    inner,
    trima,
    samples,
    trimaFinal: lastDefined(trima),
    trimaMin,
    trimaMax,
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

export function computeLineTrimaLayout(
  options: ComputeLineTrimaLayoutOptions,
): ChartLineTrimaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_TRIMA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineTrimaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineTrima(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineTrimaLayout = {
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
    trimaPath: '',
    priceDots: [],
    trimaMarkers: [],
    period: run.period,
    firstPeriod: run.firstPeriod,
    secondPeriod: run.secondPeriod,
    trimaFinal: NaN,
    trimaMin: NaN,
    trimaMax: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineTrimaPanel = {
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
    if (s.trima !== null) {
      if (s.trima < yLo) yLo = s.trima;
      if (s.trima > yHi) yHi = s.trima;
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

  const priceDots: ChartLineTrimaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    inner: s.inner,
    trima: s.trima,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const trimaMarkers: ChartLineTrimaMarker[] = [];
  const trimaPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.trima !== null) {
      const px = projectX(s.x);
      const py = projectY(s.trima);
      trimaPts.push({ px, py });
      trimaMarkers.push({ index: s.index, x: s.x, trima: s.trima, px, py });
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
    trimaPath: buildPath(trimaPts),
    priceDots,
    trimaMarkers,
    period: run.period,
    firstPeriod: run.firstPeriod,
    secondPeriod: run.secondPeriod,
    trimaFinal: run.trimaFinal,
    trimaMin: run.trimaMin,
    trimaMax: run.trimaMax,
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

export function describeLineTrimaChart(
  data: readonly ChartLineTrimaPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineTrima(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Triangular Moving Average (TRIMA) overlay (period ${run.period}): the TRIMA is a doubly-smoothed average -- a simple moving average run over another simple moving average -- so the effective weights form a triangle peaking in the middle of the window, giving an exceptionally smooth line that emphasises the centre of the window over its edges. The price runs above the TRIMA on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const TRIMA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineTrima = forwardRef<HTMLDivElement, ChartLineTrimaProps>(
  function ChartLineTrima(
    props: ChartLineTrimaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_TRIMA_WIDTH,
      height = DEFAULT_CHART_LINE_TRIMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_TRIMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_TRIMA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_TRIMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_TRIMA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_TRIMA_PRICE_COLOR,
      trimaColor = DEFAULT_CHART_LINE_TRIMA_TRIMA_COLOR,
      gridColor = DEFAULT_CHART_LINE_TRIMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_TRIMA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showTrima = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Triangular Moving Average overlay',
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
        computeLineTrimaLayout({
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
        describeLineTrimaChart(data, {
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
          data-section="chart-line-trima"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-trima-aria-desc"
            style={TRIMA_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const trimaVisible = showTrima && !hiddenSet.has('trima');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'trima', label: 'TRIMA', color: trimaColor },
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
        data-section="chart-line-trima"
        data-empty="false"
        data-period={layout.period}
        data-first-period={layout.firstPeriod}
        data-second-period={layout.secondPeriod}
        data-trima-final={layout.trimaFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-trima-aria-desc"
          style={TRIMA_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-trima-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-trima-badge"
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
                data-section="chart-line-trima-badge-icon"
                aria-hidden="true"
                style={{ color: trimaColor }}
              >
                TRIMA
              </span>
              <span data-section="chart-line-trima-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-trima-badge-sma">
                sma={layout.firstPeriod}/{layout.secondPeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-trima-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-trima-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-trima-grid-line"
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
                data-section="chart-line-trima-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-trima-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-trima-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-trima-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-trima-tick-label"
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
                    data-section="chart-line-trima-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-trima-tick-label"
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
                data-section="chart-line-trima-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-trima-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-trima-dot"
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

            {trimaVisible && layout.trimaPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Triangular Moving Average line"
                data-section="chart-line-trima-trima-line"
                d={layout.trimaPath}
                fill="none"
                stroke={trimaColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {trimaVisible ? (
              <g data-section="chart-line-trima-markers">
                {layout.trimaMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`TRIMA at x ${formatX(m.x)}: ${formatValue(m.trima)}`}
                      data-section="chart-line-trima-marker"
                      data-point-index={m.index}
                      data-trima={m.trima}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={trimaColor}
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
                    data-section="chart-line-trima-tooltip"
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
                    <div data-section="chart-line-trima-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-trima-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-trima-tooltip-trima">
                      trima: {d.trima === null ? 'n/a' : formatValue(d.trima)}
                    </div>
                    <div data-section="chart-line-trima-tooltip-position">
                      position: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-trima-legend"
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
                  data-section="chart-line-trima-legend-item"
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
                    data-section="chart-line-trima-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-trima-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-trima-legend-stats"
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

ChartLineTrima.displayName = 'ChartLineTrima';
