import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_HILO_WIDTH = 560;
export const DEFAULT_CHART_LINE_HILO_HEIGHT = 360;
export const DEFAULT_CHART_LINE_HILO_PADDING = 40;
export const DEFAULT_CHART_LINE_HILO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HILO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HILO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HILO_PERIOD = 3;
export const DEFAULT_CHART_LINE_HILO_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_HILO_HILO_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_HILO_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HILO_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HILO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_HILO_AXIS_COLOR = '#cbd5e1';

export type ChartLineHiloTrend = 'up' | 'down';

export interface ChartLineHiloPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLineHiloResult {
  smaHigh: (number | null)[];
  smaLow: (number | null)[];
  hilo: (number | null)[];
  trend: (ChartLineHiloTrend | null)[];
}

export interface ChartLineHiloSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  smaHigh: number | null;
  smaLow: number | null;
  hilo: number | null;
  trend: ChartLineHiloTrend | null;
  flip: boolean;
}

export interface ChartLineHiloRun {
  series: ChartLineHiloPoint[];
  period: number;
  smaHigh: (number | null)[];
  smaLow: (number | null)[];
  hilo: (number | null)[];
  trend: (ChartLineHiloTrend | null)[];
  samples: ChartLineHiloSample[];
  hiloFinal: number;
  trendFinal: ChartLineHiloTrend | null;
  upCount: number;
  downCount: number;
  flipCount: number;
  ok: boolean;
}

export interface ChartLineHiloPriceDot {
  index: number;
  x: number;
  close: number;
  hilo: number | null;
  trend: ChartLineHiloTrend | null;
  flip: boolean;
  px: number;
  py: number;
}

export interface ChartLineHiloMarker {
  index: number;
  x: number;
  close: number;
  trend: ChartLineHiloTrend;
  px: number;
  py: number;
}

export interface ChartLineHiloPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineHiloLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineHiloPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  priceDots: ChartLineHiloPriceDot[];
  hiloPath: string;
  markers: ChartLineHiloMarker[];
  period: number;
  hiloFinal: number;
  trendFinal: ChartLineHiloTrend | null;
  upCount: number;
  downCount: number;
  flipCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineHiloLayoutOptions {
  data: readonly ChartLineHiloPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineHiloProps {
  data: readonly ChartLineHiloPoint[];
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
  hiloColor?: string;
  upColor?: string;
  downColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showHilo?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineHiloPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineHiloFinitePoints(
  points: readonly ChartLineHiloPoint[] | null | undefined,
): ChartLineHiloPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineHiloPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close),
  );
}

/**
 * Coerce a Gann HiLo Activator lookback to a positive integer. A
 * non-finite or sub-1 value falls back to `fallback`; a
 * fractional value floors.
 */
export function normalizeLineHiloPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The simple moving average over `period` bars. Bars before the
 * window is full are null.
 */
export function computeLineHiloSma(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineHiloPeriod(period, DEFAULT_CHART_LINE_HILO_PERIOD);
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = i - p + 1; k <= i; k += 1) {
      const v = values[k];
      if (!isFiniteNumber(v)) {
        valid = false;
        break;
      }
      sum += v;
    }
    if (valid) out[i] = sum / p;
  }
  return out;
}

/**
 * The Gann HiLo Activator. The trailing stop follows the moving
 * average of the lows while the trend is up and the moving
 * average of the highs while it is down. The trend flips when the
 * close crosses the stop: a close above the high average turns it
 * up, a close below the low average turns it down. Bars before
 * the moving averages are defined carry a null trend and stop.
 */
export function computeLineHilo(
  bars: readonly ChartLineHiloPoint[] | null | undefined,
  period: number,
): ChartLineHiloResult {
  if (!Array.isArray(bars)) {
    return { smaHigh: [], smaLow: [], hilo: [], trend: [] };
  }
  const highs = bars.map((b) => (isFiniteNumber(b?.high) ? b.high : NaN));
  const lows = bars.map((b) => (isFiniteNumber(b?.low) ? b.low : NaN));
  const smaHigh = computeLineHiloSma(highs, period);
  const smaLow = computeLineHiloSma(lows, period);
  const n = bars.length;
  const hilo: (number | null)[] = new Array(n).fill(null);
  const trend: (ChartLineHiloTrend | null)[] = new Array(n).fill(null);
  let cur: ChartLineHiloTrend | null = null;
  for (let i = 0; i < n; i += 1) {
    const sh = smaHigh[i];
    const sl = smaLow[i];
    const b = bars[i];
    if (
      sh === null ||
      sh === undefined ||
      sl === null ||
      sl === undefined ||
      !b ||
      !isFiniteNumber(b.close)
    ) {
      continue;
    }
    const c = b.close;
    if (cur === null) {
      cur = c > sh ? 'up' : c < sl ? 'down' : 'up';
    } else if (cur === 'down' && c > sh) {
      cur = 'up';
    } else if (cur === 'up' && c < sl) {
      cur = 'down';
    }
    trend[i] = cur;
    hilo[i] = cur === 'up' ? sl : sh;
  }
  return { smaHigh, smaLow, hilo, trend };
}

export function runLineHilo(
  points: readonly ChartLineHiloPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineHiloRun {
  const finite = getLineHiloFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineHiloPeriod(
    options?.period ?? DEFAULT_CHART_LINE_HILO_PERIOD,
    DEFAULT_CHART_LINE_HILO_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      smaHigh: [],
      smaLow: [],
      hilo: [],
      trend: [],
      samples: [],
      hiloFinal: NaN,
      trendFinal: null,
      upCount: 0,
      downCount: 0,
      flipCount: 0,
      ok: false,
    };
  }

  const { smaHigh, smaLow, hilo, trend } = computeLineHilo(series, period);

  const samples: ChartLineHiloSample[] = series.map((p, i) => {
    const t = trend[i] ?? null;
    const prev = i > 0 ? (trend[i - 1] ?? null) : null;
    const flip = t !== null && prev !== null && t !== prev;
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      smaHigh: smaHigh[i] ?? null,
      smaLow: smaLow[i] ?? null,
      hilo: hilo[i] ?? null,
      trend: t,
      flip,
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flipCount = 0;
  let hiloFinal = NaN;
  let trendFinal: ChartLineHiloTrend | null = null;
  for (const s of samples) {
    if (s.trend === 'up') upCount += 1;
    else if (s.trend === 'down') downCount += 1;
    if (s.flip) flipCount += 1;
    if (s.hilo !== null) hiloFinal = s.hilo;
    if (s.trend !== null) trendFinal = s.trend;
  }

  return {
    series,
    period,
    smaHigh,
    smaLow,
    hilo,
    trend,
    samples,
    hiloFinal,
    trendFinal,
    upCount,
    downCount,
    flipCount,
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

export function computeLineHiloLayout(
  options: ComputeLineHiloLayoutOptions,
): ChartLineHiloLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_HILO_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineHilo(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });

  const emptyPanel: ChartLineHiloPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineHiloLayout = {
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
    hiloPath: '',
    markers: [],
    period: run.period,
    hiloFinal: NaN,
    trendFinal: null,
    upCount: 0,
    downCount: 0,
    flipCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineHiloPanel = {
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
    if (s.close < yLo) yLo = s.close;
    if (s.close > yHi) yHi = s.close;
    if (s.hilo !== null) {
      if (s.hilo < yLo) yLo = s.hilo;
      if (s.hilo > yHi) yHi = s.hilo;
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

  const priceDots: ChartLineHiloPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    close: s.close,
    hilo: s.hilo,
    trend: s.trend,
    flip: s.flip,
    px: projectX(s.x),
    py: projectY(s.close),
  }));

  const hiloPts: { px: number; py: number }[] = [];
  const markers: ChartLineHiloMarker[] = [];
  for (const s of run.samples) {
    if (s.hilo !== null) {
      hiloPts.push({ px: projectX(s.x), py: projectY(s.hilo) });
    }
    if (s.flip && s.trend !== null) {
      markers.push({
        index: s.index,
        x: s.x,
        close: s.close,
        trend: s.trend,
        px: projectX(s.x),
        py: projectY(s.close),
      });
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
    priceDots,
    hiloPath: buildPath(hiloPts),
    markers,
    period: run.period,
    hiloFinal: run.hiloFinal,
    trendFinal: run.trendFinal,
    upCount: run.upCount,
    downCount: run.downCount,
    flipCount: run.flipCount,
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

export function describeLineHiloChart(
  data: readonly ChartLineHiloPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineHilo(data, options);
  if (!run.ok) return 'No data';
  return `Single-panel line chart with the Gann HiLo Activator (period ${run.period}): the price line is overlaid with the HiLo Activator trailing stop. In an uptrend the stop follows the ${run.period}-bar moving average of the lows below the price; in a downtrend it follows the ${run.period}-bar moving average of the highs above the price. The stop flips when the close crosses it -- a close above the high average turns the trend up, a close below the low average turns it down. The trend is up on ${run.upCount} bars, down on ${run.downCount}, flipping ${run.flipCount} times across ${run.samples.length} bars.`;
}

const HILO_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineHilo = forwardRef<HTMLDivElement, ChartLineHiloProps>(
  function ChartLineHilo(
    props: ChartLineHiloProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_HILO_WIDTH,
      height = DEFAULT_CHART_LINE_HILO_HEIGHT,
      padding = DEFAULT_CHART_LINE_HILO_PADDING,
      tickCount = DEFAULT_CHART_LINE_HILO_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_HILO_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_HILO_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_HILO_PRICE_COLOR,
      hiloColor = DEFAULT_CHART_LINE_HILO_HILO_COLOR,
      upColor = DEFAULT_CHART_LINE_HILO_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_HILO_DOWN_COLOR,
      gridColor = DEFAULT_CHART_LINE_HILO_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_HILO_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showHilo = true,
      showMarkers = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Gann HiLo Activator overlay',
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
        computeLineHiloLayout({
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
        describeLineHiloChart(data, {
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
          data-section="chart-line-hilo"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-hilo-aria-desc"
            style={HILO_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const panel = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const hiloVisible = showHilo && !hiddenSet.has('hilo');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'hilo', label: 'HiLo Activator', color: hiloColor },
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
        data-section="chart-line-hilo"
        data-empty="false"
        data-period={layout.period}
        data-hilo-final={layout.hiloFinal}
        data-trend-final={layout.trendFinal ?? 'none'}
        data-up-count={layout.upCount}
        data-down-count={layout.downCount}
        data-flip-count={layout.flipCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-hilo-aria-desc"
          style={HILO_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-hilo-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-hilo-badge"
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
                data-section="chart-line-hilo-badge-icon"
                aria-hidden="true"
                style={{ color: hiloColor }}
              >
                HiLo
              </span>
              <span data-section="chart-line-hilo-badge-config">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-hilo-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-hilo-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-hilo-grid-line"
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
                data-section="chart-line-hilo-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-hilo-axis"
                  data-axis="y"
                  x1={panel.x}
                  y1={panel.y}
                  x2={panel.x}
                  y2={panel.y + panel.height}
                />
                <line
                  data-section="chart-line-hilo-axis"
                  data-axis="x"
                  x1={panel.x}
                  y1={panel.y + panel.height}
                  x2={panel.x + panel.width}
                  y2={panel.y + panel.height}
                />
                {layout.yTicks.map((t, i) => (
                  <text
                    key={`yt-${i}`}
                    data-section="chart-line-hilo-tick-label"
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
                    data-section="chart-line-hilo-tick-label"
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

            {hiloVisible && layout.hiloPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Gann HiLo Activator line"
                data-section="chart-line-hilo-hilo-line"
                d={layout.hiloPath}
                fill="none"
                stroke={hiloColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-hilo-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-hilo-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                      data-section="chart-line-hilo-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-close={d.close}
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

            {hiloVisible && showMarkers ? (
              <g data-section="chart-line-hilo-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${m.index + 1} at x ${formatX(m.x)}: trend flipped ${m.trend}`}
                      data-section="chart-line-hilo-marker"
                      data-point-index={m.index}
                      data-trend={m.trend}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 2 : dotRadius + 0.5}
                      fill={m.trend === 'up' ? upColor : downColor}
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
                    data-section="chart-line-hilo-tooltip"
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
                    <div data-section="chart-line-hilo-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-hilo-tooltip-close"
                      style={{ fontWeight: 600 }}
                    >
                      close: {formatValue(d.close)}
                    </div>
                    <div data-section="chart-line-hilo-tooltip-hilo">
                      hilo: {fmtNullable(d.hilo)}
                    </div>
                    <div data-section="chart-line-hilo-tooltip-trend">
                      trend: {d.trend ?? 'n/a'}
                      {d.flip ? ' (flip)' : ''}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-hilo-legend"
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
                  data-section="chart-line-hilo-legend-item"
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
                    data-section="chart-line-hilo-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-hilo-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-hilo-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.upCount} up, {layout.downCount} down,{' '}
              {layout.flipCount} flips
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineHilo.displayName = 'ChartLineHilo';
