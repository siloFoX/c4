import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ZLEMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_ZLEMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_ZLEMA_PADDING = 40;
export const DEFAULT_CHART_LINE_ZLEMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ZLEMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ZLEMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ZLEMA_PERIOD = 14;
export const DEFAULT_CHART_LINE_ZLEMA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_ZLEMA_ZLEMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ZLEMA_ABOVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ZLEMA_BELOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ZLEMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ZLEMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineZlemaPosition = 'above' | 'below' | 'on';

export interface ChartLineZlemaPoint {
  x: number;
  value: number;
}

export interface ChartLineZlemaSample {
  index: number;
  x: number;
  value: number;
  zlema: number | null;
  position: ChartLineZlemaPosition;
}

export interface ChartLineZlemaRun {
  series: ChartLineZlemaPoint[];
  period: number;
  lag: number;
  deLagged: (number | null)[];
  zlema: (number | null)[];
  samples: ChartLineZlemaSample[];
  zlemaFinal: number;
  zlemaMin: number;
  zlemaMax: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineZlemaPriceDot {
  index: number;
  x: number;
  value: number;
  zlema: number | null;
  position: ChartLineZlemaPosition;
  px: number;
  py: number;
}

export interface ChartLineZlemaMarker {
  index: number;
  x: number;
  zlema: number;
  px: number;
  py: number;
}

export interface ChartLineZlemaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineZlemaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineZlemaPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  zlemaPath: string;
  priceDots: ChartLineZlemaPriceDot[];
  zlemaMarkers: ChartLineZlemaMarker[];
  period: number;
  lag: number;
  zlemaFinal: number;
  zlemaMin: number;
  zlemaMax: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineZlemaLayoutOptions {
  data: readonly ChartLineZlemaPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineZlemaProps {
  data: readonly ChartLineZlemaPoint[];
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
  zlemaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showZlema?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineZlemaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineZlemaFinitePoints(
  points: readonly ChartLineZlemaPoint[] | null | undefined,
): ChartLineZlemaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineZlemaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineZlemaPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * An exponential moving average over `period` values, tolerating the
 * leading `null` placeholders of the de-lagged series. The seed is
 * the simple mean of the first `period` defined values placed at that
 * value's index; each later defined value folds in at weight
 * `2 / (period + 1)`.
 */
export function computeLineZlemaEma(
  src: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  const idx: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (isDefined(src[i])) idx.push(i);
  }
  if (idx.length < p) return out;
  const mult = 2 / (p + 1);
  let sum = 0;
  for (let k = 0; k < p; k += 1) sum += src[idx[k]!] as number;
  let ema = sum / p;
  out[idx[p - 1]!] = ema;
  for (let k = p; k < idx.length; k += 1) {
    const i = idx[k]!;
    ema = (src[i] as number) * mult + ema * (1 - mult);
    out[i] = ema;
  }
  return out;
}

/**
 * John Ehlers and Ric Way's Zero-Lag Exponential Moving Average. The
 * lag is `floor((period - 1) / 2)`; the de-lagged series adds each
 * bar's own momentum over that lag back into the value
 * (`2 * value[i] - value[i - lag]`), so the price is shifted forward
 * to anticipate the trend. A standard EMA of that de-lagged series
 * keeps pace with the price instead of trailing it.
 */
export function computeLineZlema(
  values: readonly number[] | null | undefined,
  period: number,
): {
  lag: number;
  deLagged: (number | null)[];
  zlema: (number | null)[];
} {
  const p = period < 1 ? 1 : Math.floor(period);
  const lag = Math.floor((p - 1) / 2);
  if (!Array.isArray(values)) return { lag, deLagged: [], zlema: [] };
  const n = values.length;
  const deLagged: (number | null)[] = new Array(n).fill(null);
  for (let i = lag; i < n; i += 1) {
    deLagged[i] = 2 * values[i]! - values[i - lag]!;
  }
  const zlema = computeLineZlemaEma(deLagged, p);
  return { lag, deLagged, zlema };
}

function classifyPosition(
  value: number,
  zlema: number | null,
): ChartLineZlemaPosition {
  if (zlema === null) return 'on';
  if (value > zlema) return 'above';
  if (value < zlema) return 'below';
  return 'on';
}

export function runLineZlema(
  points: readonly ChartLineZlemaPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineZlemaRun {
  const finite = getLineZlemaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineZlemaPeriod(
    options?.period ?? DEFAULT_CHART_LINE_ZLEMA_PERIOD,
    DEFAULT_CHART_LINE_ZLEMA_PERIOD,
  );
  const lag = Math.floor((period - 1) / 2);
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      lag,
      deLagged: [],
      zlema: [],
      samples: [],
      zlemaFinal: NaN,
      zlemaMin: NaN,
      zlemaMax: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { deLagged, zlema } = computeLineZlema(values, period);

  const samples: ChartLineZlemaSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    zlema: zlema[i] ?? null,
    position: classifyPosition(p.value, zlema[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let zlemaMin = NaN;
  let zlemaMax = NaN;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.zlema !== null) {
      if (Number.isNaN(zlemaMin) || s.zlema < zlemaMin) zlemaMin = s.zlema;
      if (Number.isNaN(zlemaMax) || s.zlema > zlemaMax) zlemaMax = s.zlema;
    }
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series,
    period,
    lag,
    deLagged,
    zlema,
    samples,
    zlemaFinal: lastDefined(zlema),
    zlemaMin,
    zlemaMax,
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

export function computeLineZlemaLayout(
  options: ComputeLineZlemaLayoutOptions,
): ChartLineZlemaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_ZLEMA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineZlemaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineZlema(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineZlemaLayout = {
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
    zlemaPath: '',
    priceDots: [],
    zlemaMarkers: [],
    period: run.period,
    lag: run.lag,
    zlemaFinal: NaN,
    zlemaMin: NaN,
    zlemaMax: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineZlemaPanel = {
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
    if (s.zlema !== null) {
      if (s.zlema < yLo) yLo = s.zlema;
      if (s.zlema > yHi) yHi = s.zlema;
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

  const priceDots: ChartLineZlemaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    zlema: s.zlema,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const zlemaMarkers: ChartLineZlemaMarker[] = [];
  const zlemaPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.zlema !== null) {
      const px = projectX(s.x);
      const py = projectY(s.zlema);
      zlemaPts.push({ px, py });
      zlemaMarkers.push({ index: s.index, x: s.x, zlema: s.zlema, px, py });
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
    zlemaPath: buildPath(zlemaPts),
    priceDots,
    zlemaMarkers,
    period: run.period,
    lag: run.lag,
    zlemaFinal: run.zlemaFinal,
    zlemaMin: run.zlemaMin,
    zlemaMax: run.zlemaMax,
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

export function describeLineZlemaChart(
  data: readonly ChartLineZlemaPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineZlema(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Zero-Lag Exponential Moving Average (ZLEMA) overlay (period ${run.period}): the ZLEMA removes lag by feeding a de-lagged series -- the price plus its own recent momentum -- through an exponential moving average, so the average keeps pace with the trend. The price runs above the ZLEMA on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const ZLEMA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineZlema = forwardRef<HTMLDivElement, ChartLineZlemaProps>(
  function ChartLineZlema(
    props: ChartLineZlemaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_ZLEMA_WIDTH,
      height = DEFAULT_CHART_LINE_ZLEMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_ZLEMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_ZLEMA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_ZLEMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_ZLEMA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_ZLEMA_PRICE_COLOR,
      zlemaColor = DEFAULT_CHART_LINE_ZLEMA_ZLEMA_COLOR,
      gridColor = DEFAULT_CHART_LINE_ZLEMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_ZLEMA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showZlema = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Zero-Lag EMA overlay',
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
        computeLineZlemaLayout({
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
        describeLineZlemaChart(data, {
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
          data-section="chart-line-zlema"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-zlema-aria-desc"
            style={ZLEMA_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const zlemaVisible = showZlema && !hiddenSet.has('zlema');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'zlema', label: 'ZLEMA', color: zlemaColor },
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
        data-section="chart-line-zlema"
        data-empty="false"
        data-period={layout.period}
        data-lag={layout.lag}
        data-zlema-final={layout.zlemaFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-zlema-aria-desc"
          style={ZLEMA_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-zlema-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-zlema-badge"
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
                data-section="chart-line-zlema-badge-icon"
                aria-hidden="true"
                style={{ color: zlemaColor }}
              >
                ZLEMA
              </span>
              <span data-section="chart-line-zlema-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-zlema-badge-lag">
                lag={layout.lag}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-zlema-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-zlema-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-zlema-grid-line"
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
                data-section="chart-line-zlema-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-zlema-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-zlema-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-zlema-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-zlema-tick-label"
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
                    data-section="chart-line-zlema-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-zlema-tick-label"
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
                data-section="chart-line-zlema-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-zlema-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-zlema-dot"
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

            {zlemaVisible && layout.zlemaPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Zero-Lag EMA line"
                data-section="chart-line-zlema-zlema-line"
                d={layout.zlemaPath}
                fill="none"
                stroke={zlemaColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {zlemaVisible ? (
              <g data-section="chart-line-zlema-markers">
                {layout.zlemaMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`ZLEMA at x ${formatX(m.x)}: ${formatValue(m.zlema)}`}
                      data-section="chart-line-zlema-marker"
                      data-point-index={m.index}
                      data-zlema={m.zlema}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={zlemaColor}
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
                    data-section="chart-line-zlema-tooltip"
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
                    <div data-section="chart-line-zlema-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-zlema-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-zlema-tooltip-zlema">
                      zlema: {d.zlema === null ? 'n/a' : formatValue(d.zlema)}
                    </div>
                    <div data-section="chart-line-zlema-tooltip-position">
                      position: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-zlema-legend"
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
                  data-section="chart-line-zlema-legend-item"
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
                    data-section="chart-line-zlema-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-zlema-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-zlema-legend-stats"
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

ChartLineZlema.displayName = 'ChartLineZlema';
