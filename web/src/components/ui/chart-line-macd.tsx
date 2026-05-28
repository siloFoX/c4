import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_MACD_WIDTH = 560;
export const DEFAULT_CHART_LINE_MACD_HEIGHT = 360;
export const DEFAULT_CHART_LINE_MACD_PADDING = 40;
export const DEFAULT_CHART_LINE_MACD_GAP = 26;
export const DEFAULT_CHART_LINE_MACD_PRICE_PANEL_RATIO = 0.58;
export const DEFAULT_CHART_LINE_MACD_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MACD_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MACD_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MACD_FAST_PERIOD = 12;
export const DEFAULT_CHART_LINE_MACD_SLOW_PERIOD = 26;
export const DEFAULT_CHART_LINE_MACD_SIGNAL_PERIOD = 9;
export const DEFAULT_CHART_LINE_MACD_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_MACD_MACD_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MACD_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_MACD_HIST_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MACD_HIST_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MACD_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MACD_AXIS_COLOR = '#cbd5e1';

export interface ChartLineMacdPoint {
  x: number;
  value: number;
}

export interface ChartLineMacdSample {
  index: number;
  x: number;
  price: number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface ChartLineMacdRun {
  series: ChartLineMacdPoint[];
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  macd: number[];
  signal: number[];
  histogram: number[];
  samples: ChartLineMacdSample[];
  ok: boolean;
}

export interface ChartLineMacdPriceDot {
  index: number;
  x: number;
  price: number;
  macd: number;
  signal: number;
  histogram: number;
  px: number;
  py: number;
}

export interface ChartLineMacdHistogramBar {
  index: number;
  x: number;
  histogram: number;
  positive: boolean;
  bx: number;
  by: number;
  bw: number;
  bh: number;
}

export interface ChartLineMacdPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineMacdLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineMacdPanel;
  macdPanel: ChartLineMacdPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  macdYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  macdYMin: number;
  macdYMax: number;
  pricePath: string;
  priceDots: ChartLineMacdPriceDot[];
  macdPath: string;
  signalPath: string;
  histogramBars: ChartLineMacdHistogramBar[];
  zeroLineY: number;
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineMacdLayoutOptions {
  data: readonly ChartLineMacdPoint[];
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineMacdProps {
  data: readonly ChartLineMacdPoint[];
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  macdColor?: string;
  signalColor?: string;
  histUpColor?: string;
  histDownColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMacd?: boolean;
  showSignal?: boolean;
  showHistogram?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineMacdPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineMacdFinitePoints(
  points: readonly ChartLineMacdPoint[] | null | undefined,
): ChartLineMacdPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineMacdPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineMacdPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Exponential moving average. The smoothing factor is
 * `alpha = 2 / (period + 1)`; the series is seeded with its first
 * value, so the EMA is defined at every index.
 */
export function computeLineMacdEMA(
  values: readonly number[] | null | undefined,
  period: number,
): number[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  const p = period < 1 ? 1 : Math.floor(period);
  const alpha = 2 / (p + 1);
  const out: number[] = [];
  let ema = values[0]!;
  out.push(ema);
  for (let i = 1; i < values.length; i += 1) {
    ema = alpha * values[i]! + (1 - alpha) * ema;
    out.push(ema);
  }
  return out;
}

/**
 * Moving Average Convergence Divergence. The MACD line is the
 * difference of a fast and a slow EMA of the price; the signal line
 * is an EMA of the MACD line; the histogram is `macd - signal` (the
 * convergence/divergence of the two lines). All three are defined at
 * every index because the EMAs are seeded with the first value.
 */
export function runLineMacd(
  points: readonly ChartLineMacdPoint[] | null | undefined,
  options?: {
    fastPeriod?: number;
    slowPeriod?: number;
    signalPeriod?: number;
  },
): ChartLineMacdRun {
  const finite = getLineMacdFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const fastPeriod = normalizeLineMacdPeriod(
    options?.fastPeriod ?? DEFAULT_CHART_LINE_MACD_FAST_PERIOD,
    DEFAULT_CHART_LINE_MACD_FAST_PERIOD,
  );
  const slowPeriod = normalizeLineMacdPeriod(
    options?.slowPeriod ?? DEFAULT_CHART_LINE_MACD_SLOW_PERIOD,
    DEFAULT_CHART_LINE_MACD_SLOW_PERIOD,
  );
  const signalPeriod = normalizeLineMacdPeriod(
    options?.signalPeriod ?? DEFAULT_CHART_LINE_MACD_SIGNAL_PERIOD,
    DEFAULT_CHART_LINE_MACD_SIGNAL_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      fastPeriod,
      slowPeriod,
      signalPeriod,
      macd: [],
      signal: [],
      histogram: [],
      samples: [],
      ok: false,
    };
  }

  const prices = series.map((p) => p.value);
  const emaFast = computeLineMacdEMA(prices, fastPeriod);
  const emaSlow = computeLineMacdEMA(prices, slowPeriod);
  const macd = emaFast.map((f, i) => f - emaSlow[i]!);
  const signal = computeLineMacdEMA(macd, signalPeriod);
  const histogram = macd.map((m, i) => m - signal[i]!);

  const samples: ChartLineMacdSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    price: p.value,
    macd: macd[i]!,
    signal: signal[i]!,
    histogram: histogram[i]!,
  }));

  return {
    series = [],
    fastPeriod,
    slowPeriod,
    signalPeriod,
    macd,
    signal,
    histogram,
    samples,
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

export function computeLineMacdLayout(
  options: ComputeLineMacdLayoutOptions,
): ChartLineMacdLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_MACD_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_MACD_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_MACD_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineMacdPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineMacd(data, {
    ...(isFiniteNumber(options.fastPeriod)
      ? { fastPeriod: options.fastPeriod }
      : {}),
    ...(isFiniteNumber(options.slowPeriod)
      ? { slowPeriod: options.slowPeriod }
      : {}),
    ...(isFiniteNumber(options.signalPeriod)
      ? { signalPeriod: options.signalPeriod }
      : {}),
  });
  const empty: ChartLineMacdLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    macdPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    macdYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    macdYMin: 0,
    macdYMax: 0,
    pricePath: '',
    priceDots: [],
    macdPath: '',
    signalPath: '',
    histogramBars: [],
    zeroLineY: 0,
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    signalPeriod: run.signalPeriod,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const macdH = usableHeight - priceH;
  if (priceH <= 0 || macdH <= 0) return empty;

  const pricePanel: ChartLineMacdPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const macdPanel: ChartLineMacdPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: macdH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let mAbs = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.price < pyLo) pyLo = s.price;
    if (s.price > pyHi) pyHi = s.price;
    mAbs = Math.max(mAbs, Math.abs(s.macd), Math.abs(s.signal), Math.abs(s.histogram));
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }
  if (mAbs === 0) mAbs = 0.5;
  const macdYMin = -mAbs;
  const macdYMax = mAbs;

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectMacdY = (v: number): number =>
    macdPanel.y +
    macdPanel.height -
    ((v - macdYMin) / (macdYMax - macdYMin)) * macdPanel.height;

  const priceDots: ChartLineMacdPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    price: s.price,
    macd: s.macd,
    signal: s.signal,
    histogram: s.histogram,
    px: projectX(s.x),
    py: projectPriceY(s.price),
  }));

  const zeroLineY = projectMacdY(0);
  const barWidth = (macdPanel.width / Math.max(1, run.samples.length)) * 0.6;
  const histogramBars: ChartLineMacdHistogramBar[] = run.samples.map((s) => {
    const valuePy = projectMacdY(s.histogram);
    const positive = s.histogram >= 0;
    const by = Math.min(zeroLineY, valuePy);
    return {
      index: s.index,
      x: s.x,
      histogram: s.histogram,
      positive,
      bx: projectX(s.x) - barWidth / 2,
      by,
      bw: barWidth,
      bh: Math.abs(zeroLineY - valuePy),
    };
  });

  return {
    ok: true,
    width,
    height,
    pricePanel,
    macdPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    macdYTicks: computeTicks(macdYMin, macdYMax, tickCount).map((v) => ({
      value: v,
      py: projectMacdY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    macdYMin,
    macdYMax,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    macdPath: buildPath(
      run.samples.map((s) => ({
        px: projectX(s.x),
        py: projectMacdY(s.macd),
      })),
    ),
    signalPath: buildPath(
      run.samples.map((s) => ({
        px: projectX(s.x),
        py: projectMacdY(s.signal),
      })),
    ),
    histogramBars,
    zeroLineY,
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    signalPeriod: run.signalPeriod,
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

export function describeLineMacdChart(
  data: readonly ChartLineMacdPoint[] | null | undefined,
  options?: {
    fastPeriod?: number;
    slowPeriod?: number;
    signalPeriod?: number;
  },
): string {
  const run = runLineMacd(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a MACD panel (${run.fastPeriod}/${run.slowPeriod}/${run.signalPeriod}): the MACD line, signal line and convergence histogram across ${run.samples.length} periods.`;
}

const MACD_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineMacd = forwardRef<HTMLDivElement, ChartLineMacdProps>(
  function ChartLineMacd(
    props: ChartLineMacdProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      fastPeriod,
      slowPeriod,
      signalPeriod,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_MACD_WIDTH,
      height = DEFAULT_CHART_LINE_MACD_HEIGHT,
      padding = DEFAULT_CHART_LINE_MACD_PADDING,
      gap = DEFAULT_CHART_LINE_MACD_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_MACD_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_MACD_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_MACD_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_MACD_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_MACD_PRICE_COLOR,
      macdColor = DEFAULT_CHART_LINE_MACD_MACD_COLOR,
      signalColor = DEFAULT_CHART_LINE_MACD_SIGNAL_COLOR,
      histUpColor = DEFAULT_CHART_LINE_MACD_HIST_UP_COLOR,
      histDownColor = DEFAULT_CHART_LINE_MACD_HIST_DOWN_COLOR,
      gridColor = DEFAULT_CHART_LINE_MACD_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_MACD_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showMacd = true,
      showSignal = true,
      showHistogram = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a MACD panel',
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
        computeLineMacdLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
          ...(isFiniteNumber(fastPeriod) ? { fastPeriod } : {}),
          ...(isFiniteNumber(slowPeriod) ? { slowPeriod } : {}),
          ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
        }),
      [
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        fastPeriod,
        slowPeriod,
        signalPeriod,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineMacdChart(data, {
          ...(isFiniteNumber(fastPeriod) ? { fastPeriod } : {}),
          ...(isFiniteNumber(slowPeriod) ? { slowPeriod } : {}),
          ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
        }),
      [ariaDescription, data, fastPeriod, slowPeriod, signalPeriod],
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
          data-section="chart-line-macd"
          data-empty="true"
          data-total-points={0}
          data-animate={animate ? 'true' : 'false'}
        >
          <span id={descId} data-section="chart-line-macd-aria-desc" style={MACD_SR_STYLE}>
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const mp = layout.macdPanel;
    const priceVisible = !hiddenSet.has('price');
    const macdVisible = showMacd && !hiddenSet.has('macd');
    const signalVisible = showSignal && !hiddenSet.has('signal');
    const histogramVisible = showHistogram && !hiddenSet.has('histogram');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'macd', label: 'MACD', color: macdColor },
      { id: 'signal', label: 'Signal', color: signalColor },
      { id: 'histogram', label: 'Histogram', color: histUpColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-macd"
        data-empty="false"
        data-fast-period={layout.fastPeriod}
        data-slow-period={layout.slowPeriod}
        data-signal-period={layout.signalPeriod}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-macd-aria-desc" style={MACD_SR_STYLE}>
          {summary}
        </span>

        <div
          data-section="chart-line-macd-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-macd-badge"
              data-fast-period={layout.fastPeriod}
              data-slow-period={layout.slowPeriod}
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
                data-section="chart-line-macd-badge-icon"
                aria-hidden="true"
                style={{ color: macdColor }}
              >
                MACD
              </span>
              <span data-section="chart-line-macd-badge-periods">
                {layout.fastPeriod}/{layout.slowPeriod}/
                {layout.signalPeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-macd-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-macd-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-macd-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.macdYTicks.map((t, i) => (
                  <line
                    key={`mgy-${i}`}
                    data-section="chart-line-macd-grid-line"
                    data-panel="macd"
                    x1={mp.x}
                    x2={mp.x + mp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-macd-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: mp, name: 'macd', yt: layout.macdYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-macd-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-macd-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-macd-axis"
                      data-panel={cfg.name}
                      data-axis="y"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y}
                      x2={cfg.panel.x}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    {cfg.yt.map((t, i) => (
                      <g
                        key={`yt-${cfg.name}-${i}`}
                        data-section="chart-line-macd-tick"
                        data-panel={cfg.name}
                        data-axis="y"
                      >
                        <line
                          x1={cfg.panel.x - 4}
                          x2={cfg.panel.x}
                          y1={t.py}
                          y2={t.py}
                        />
                        <text
                          data-section="chart-line-macd-tick-label"
                          data-panel={cfg.name}
                          data-axis="y"
                          x={cfg.panel.x - 6}
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
                  </g>
                ))}
                <g data-section="chart-line-macd-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-macd-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={mp.y + mp.height}
                        y2={mp.y + mp.height + 4}
                      />
                      <text
                        data-section="chart-line-macd-tick-label"
                        data-axis="x"
                        x={t.px}
                        y={mp.y + mp.height + 14}
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
              </g>
            ) : null}

            <g data-section="chart-line-macd-panel-labels">
              <text
                data-section="chart-line-macd-panel-label"
                data-panel="price"
                x={pp.x + pp.width / 2}
                y={pp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Price
              </text>
              <text
                data-section="chart-line-macd-panel-label"
                data-panel="macd"
                x={mp.x + mp.width / 2}
                y={mp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                MACD
              </text>
            </g>

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-macd-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-macd-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, price ${formatValue(d.price)}`}
                      data-section="chart-line-macd-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-price={d.price}
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

            <line
              data-section="chart-line-macd-zero-line"
              x1={mp.x}
              x2={mp.x + mp.width}
              y1={layout.zeroLineY}
              y2={layout.zeroLineY}
              stroke={axisColor}
              strokeWidth={1}
              strokeDasharray="3 3"
            />

            {histogramVisible ? (
              <g data-section="chart-line-macd-histogram">
                {layout.histogramBars.map((b) => (
                  <rect
                    key={`hb-${b.index}`}
                    data-section="chart-line-macd-histogram-bar"
                    data-point-index={b.index}
                    data-histogram={b.histogram}
                    data-positive={b.positive ? 'true' : 'false'}
                    x={b.bx}
                    y={b.by}
                    width={b.bw}
                    height={b.bh}
                    fill={b.positive ? histUpColor : histDownColor}
                    fillOpacity={0.55}
                    onMouseEnter={() => {
                      setHoverIndex(b.index);
                      setTooltipPos({ px: b.bx + b.bw / 2, py: b.by });
                    }}
                    onMouseLeave={clearHover}
                  />
                ))}
              </g>
            ) : null}

            {macdVisible && layout.macdPath ? (
              <path
                data-section="chart-line-macd-macd-line"
                d={layout.macdPath}
                fill="none"
                stroke={macdColor}
                strokeWidth={1.75}
              />
            ) : null}

            {signalVisible && layout.signalPath ? (
              <path
                data-section="chart-line-macd-signal-line"
                d={layout.signalPath}
                fill="none"
                stroke={signalColor}
                strokeWidth={1.5}
                strokeDasharray="5 3"
              />
            ) : null}
          </svg>

          {showTooltip && hoverIndex !== null && tooltipPos
            ? (() => {
                const d = layout.priceDots.find(
                  (x) => x.index === hoverIndex,
                );
                if (!d) return null;
                return (
                  <div
                    data-section="chart-line-macd-tooltip"
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
                      minWidth: 160,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div data-section="chart-line-macd-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-macd-tooltip-price"
                      style={{ fontWeight: 600 }}
                    >
                      price: {formatValue(d.price)}
                    </div>
                    <div data-section="chart-line-macd-tooltip-macd">
                      macd: {formatValue(d.macd)}
                    </div>
                    <div data-section="chart-line-macd-tooltip-signal">
                      signal: {formatValue(d.signal)}
                    </div>
                    <div data-section="chart-line-macd-tooltip-histogram">
                      histogram: {formatValue(d.histogram)}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-macd-legend"
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
                  data-section="chart-line-macd-legend-item"
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
                    data-section="chart-line-macd-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-macd-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-macd-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              MACD {layout.fastPeriod}/{layout.slowPeriod}/
              {layout.signalPeriod}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineMacd.displayName = 'ChartLineMacd';
