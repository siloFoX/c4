import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_JMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_JMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_JMA_PADDING = 40;
export const DEFAULT_CHART_LINE_JMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_JMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_JMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_JMA_LENGTH = 7;
export const DEFAULT_CHART_LINE_JMA_PHASE = 0;
export const DEFAULT_CHART_LINE_JMA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_JMA_JMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_JMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_JMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineJmaPosition = 'above' | 'below' | 'on';

export interface ChartLineJmaPoint {
  x: number;
  value: number;
}

export interface ChartLineJmaSample {
  index: number;
  x: number;
  value: number;
  jma: number;
  position: ChartLineJmaPosition;
}

export interface ChartLineJmaRun {
  series: ChartLineJmaPoint[];
  length: number;
  phase: number;
  jma: number[];
  samples: ChartLineJmaSample[];
  jmaFinal: number;
  jmaMin: number;
  jmaMax: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineJmaPriceDot {
  index: number;
  x: number;
  value: number;
  jma: number;
  position: ChartLineJmaPosition;
  px: number;
  py: number;
}

export interface ChartLineJmaMarker {
  index: number;
  x: number;
  jma: number;
  px: number;
  py: number;
}

export interface ChartLineJmaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineJmaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineJmaPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  jmaPath: string;
  priceDots: ChartLineJmaPriceDot[];
  jmaMarkers: ChartLineJmaMarker[];
  length: number;
  phase: number;
  jmaFinal: number;
  jmaMin: number;
  jmaMax: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineJmaLayoutOptions {
  data: readonly ChartLineJmaPoint[];
  length?: number;
  phase?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineJmaProps {
  data: readonly ChartLineJmaPoint[];
  length?: number;
  phase?: number;
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
  jmaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showJma?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineJmaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineJmaFinitePoints(
  points: readonly ChartLineJmaPoint[] | null | undefined,
): ChartLineJmaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineJmaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a length to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineJmaLength(
  length: number,
  fallback: number,
): number {
  if (!isFiniteNumber(length)) return fallback;
  const p = Math.floor(length);
  return p < 1 ? fallback : p;
}

/**
 * Coerce the phase to the range [-100, 100]. A non-finite value
 * falls back to `fallback`; an out-of-range value is clamped.
 */
export function normalizeLineJmaPhase(
  phase: number,
  fallback: number,
): number {
  if (!isFiniteNumber(phase)) return fallback;
  if (phase < -100) return -100;
  if (phase > 100) return 100;
  return phase;
}

/**
 * A Jurik-style Moving Average. The price is run through a
 * three-stage adaptive filter that delivers low lag with low noise.
 * `beta = 0.45*(length-1) / (0.45*(length-1)+2)` sets the smoothing,
 * `alpha = beta^2`, and the phase (clamped to [-100, 100], folded
 * into `phaseRatio = phase/100 + 1.5`) trades a touch of overshoot
 * for even less lag. The three filter stages are
 * `e0 = (1-alpha)*price + alpha*e0'`,
 * `e1 = (price-e0)*(1-beta) + beta*e1'` and
 * `e2 = (e0 + phaseRatio*e1 - jma')*(1-alpha)^2 + alpha^2*e2'`, and
 * the JMA is `e2 + jma'`. It is seeded at the first bar with that
 * bar's price (so a flat series stays flat and there is no warm-up)
 * and is recursive from the second bar onward.
 */
export function computeLineJma(
  values: readonly number[] | null | undefined,
  length: number,
  phase: number,
): number[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  if (n === 0) return [];
  const len = length < 1 ? 1 : Math.floor(length);
  const ph = !isFiniteNumber(phase)
    ? 0
    : Math.min(100, Math.max(-100, phase));
  const beta = (0.45 * (len - 1)) / (0.45 * (len - 1) + 2);
  const alpha = beta * beta;
  const phaseRatio = ph / 100 + 1.5;
  const out: number[] = new Array(n);
  let e0 = values[0]!;
  let e1 = 0;
  let e2 = 0;
  let jma = values[0]!;
  out[0] = jma;
  for (let i = 1; i < n; i += 1) {
    const price = values[i]!;
    e0 = (1 - alpha) * price + alpha * e0;
    e1 = (price - e0) * (1 - beta) + beta * e1;
    e2 =
      (e0 + phaseRatio * e1 - jma) * ((1 - alpha) * (1 - alpha)) +
      alpha * alpha * e2;
    jma = e2 + jma;
    out[i] = jma;
  }
  return out;
}

function classifyPosition(
  value: number,
  jma: number,
): ChartLineJmaPosition {
  if (value > jma) return 'above';
  if (value < jma) return 'below';
  return 'on';
}

export function runLineJma(
  points: readonly ChartLineJmaPoint[] | null | undefined,
  options?: { length?: number; phase?: number },
): ChartLineJmaRun {
  const finite = getLineJmaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const length = normalizeLineJmaLength(
    options?.length ?? DEFAULT_CHART_LINE_JMA_LENGTH,
    DEFAULT_CHART_LINE_JMA_LENGTH,
  );
  const phase = normalizeLineJmaPhase(
    options?.phase ?? DEFAULT_CHART_LINE_JMA_PHASE,
    DEFAULT_CHART_LINE_JMA_PHASE,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      length,
      phase,
      jma: [],
      samples: [],
      jmaFinal: NaN,
      jmaMin: NaN,
      jmaMax: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const jma = computeLineJma(values, length, phase);

  const samples: ChartLineJmaSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    jma: jma[i]!,
    position: classifyPosition(p.value, jma[i]!),
  }));

  let jmaMin = NaN;
  let jmaMax = NaN;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (Number.isNaN(jmaMin) || s.jma < jmaMin) jmaMin = s.jma;
    if (Number.isNaN(jmaMax) || s.jma > jmaMax) jmaMax = s.jma;
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series = [],
    length,
    phase,
    jma,
    samples,
    jmaFinal: jma[n - 1]!,
    jmaMin,
    jmaMax,
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

export function computeLineJmaLayout(
  options: ComputeLineJmaLayoutOptions,
): ChartLineJmaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_JMA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineJmaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineJma(data, {
    ...(isFiniteNumber(options.length) ? { length: options.length } : {}),
    ...(isFiniteNumber(options.phase) ? { phase: options.phase } : {}),
  });
  const empty: ChartLineJmaLayout = {
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
    jmaPath: '',
    priceDots: [],
    jmaMarkers: [],
    length: run.length,
    phase: run.phase,
    jmaFinal: NaN,
    jmaMin: NaN,
    jmaMax: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineJmaPanel = {
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
    if (s.jma < yLo) yLo = s.jma;
    if (s.jma > yHi) yHi = s.jma;
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

  const priceDots: ChartLineJmaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    jma: s.jma,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const jmaMarkers: ChartLineJmaMarker[] = [];
  const jmaPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    const py = projectY(s.jma);
    jmaPts.push({ px, py });
    jmaMarkers.push({ index: s.index, x: s.x, jma: s.jma, px, py });
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
    jmaPath: buildPath(jmaPts),
    priceDots,
    jmaMarkers,
    length: run.length,
    phase: run.phase,
    jmaFinal: run.jmaFinal,
    jmaMin: run.jmaMin,
    jmaMax: run.jmaMax,
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

export function describeLineJmaChart(
  data: readonly ChartLineJmaPoint[] | null | undefined,
  options?: { length?: number; phase?: number },
): string {
  const run = runLineJma(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Jurik-style Moving Average (JMA) overlay (length ${run.length}, phase ${run.phase}): the JMA is a low-lag, low-noise adaptive filter that smooths the price through a three-stage cascade. It keeps far closer to the price than a plain moving average while staying smooth, and the phase parameter trades a touch of overshoot for even less lag. The price runs above the JMA on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const JMA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineJma = forwardRef<HTMLDivElement, ChartLineJmaProps>(
  function ChartLineJma(
    props: ChartLineJmaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      length,
      phase,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_JMA_WIDTH,
      height = DEFAULT_CHART_LINE_JMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_JMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_JMA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_JMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_JMA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_JMA_PRICE_COLOR,
      jmaColor = DEFAULT_CHART_LINE_JMA_JMA_COLOR,
      gridColor = DEFAULT_CHART_LINE_JMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_JMA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showJma = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Jurik-style Moving Average overlay',
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
        computeLineJmaLayout({
          data,
          width,
          height,
          padding,
          tickCount,
          ...(isFiniteNumber(length) ? { length } : {}),
          ...(isFiniteNumber(phase) ? { phase } : {}),
        }),
      [data, width, height, padding, tickCount, length, phase],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineJmaChart(data, {
          ...(isFiniteNumber(length) ? { length } : {}),
          ...(isFiniteNumber(phase) ? { phase } : {}),
        }),
      [ariaDescription, data, length, phase],
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
          data-section="chart-line-jma"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-jma-aria-desc"
            style={JMA_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const jmaVisible = showJma && !hiddenSet.has('jma');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'jma', label: 'JMA', color: jmaColor },
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
        data-section="chart-line-jma"
        data-empty="false"
        data-length={layout.length}
        data-phase={layout.phase}
        data-jma-final={layout.jmaFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-jma-aria-desc"
          style={JMA_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-jma-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-jma-badge"
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
                data-section="chart-line-jma-badge-icon"
                aria-hidden="true"
                style={{ color: jmaColor }}
              >
                JMA
              </span>
              <span data-section="chart-line-jma-badge-length">
                L={layout.length}
              </span>
              <span data-section="chart-line-jma-badge-phase">
                ph={layout.phase}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-jma-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-jma-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-jma-grid-line"
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
                data-section="chart-line-jma-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-jma-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-jma-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-jma-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-jma-tick-label"
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
                    data-section="chart-line-jma-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-jma-tick-label"
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
                data-section="chart-line-jma-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-jma-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-jma-dot"
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

            {jmaVisible && layout.jmaPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Jurik-style Moving Average line"
                data-section="chart-line-jma-jma-line"
                d={layout.jmaPath}
                fill="none"
                stroke={jmaColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {jmaVisible ? (
              <g data-section="chart-line-jma-markers">
                {layout.jmaMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`JMA at x ${formatX(m.x)}: ${formatValue(m.jma)}`}
                      data-section="chart-line-jma-marker"
                      data-point-index={m.index}
                      data-jma={m.jma}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={jmaColor}
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
                    data-section="chart-line-jma-tooltip"
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
                    <div data-section="chart-line-jma-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-jma-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-jma-tooltip-jma">
                      jma: {formatValue(d.jma)}
                    </div>
                    <div data-section="chart-line-jma-tooltip-position">
                      position: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-jma-legend"
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
                  data-section="chart-line-jma-legend-item"
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
                    data-section="chart-line-jma-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-jma-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-jma-legend-stats"
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

ChartLineJma.displayName = 'ChartLineJma';
