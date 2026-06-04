import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_HEIKIN_ASHI_WIDTH = 560;
export const DEFAULT_CHART_LINE_HEIKIN_ASHI_HEIGHT = 320;
export const DEFAULT_CHART_LINE_HEIKIN_ASHI_PADDING = 40;
export const DEFAULT_CHART_LINE_HEIKIN_ASHI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HEIKIN_ASHI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HEIKIN_ASHI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HEIKIN_ASHI_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_HEIKIN_ASHI_HA_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_HEIKIN_ASHI_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HEIKIN_ASHI_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HEIKIN_ASHI_DOJI_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_HEIKIN_ASHI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_HEIKIN_ASHI_AXIS_COLOR = '#cbd5e1';

export type ChartLineHeikinAshiTrend = 'bullish' | 'bearish' | 'doji';

export interface ChartLineHeikinAshiPoint {
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLineHeikinAshiBar {
  haOpen: number;
  haHigh: number;
  haLow: number;
  haClose: number;
}

export interface ChartLineHeikinAshiSample {
  index: number;
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
  haOpen: number;
  haHigh: number;
  haLow: number;
  haClose: number;
  trend: ChartLineHeikinAshiTrend;
}

export interface ChartLineHeikinAshiRun {
  series: ChartLineHeikinAshiPoint[];
  bars: ChartLineHeikinAshiBar[];
  samples: ChartLineHeikinAshiSample[];
  haCloseSeries: number[];
  bullishCount: number;
  bearishCount: number;
  dojiCount: number;
  haCloseFinal: number;
  ok: boolean;
}

export interface ChartLineHeikinAshiPriceDot {
  index: number;
  x: number;
  close: number;
  haClose: number;
  trend: ChartLineHeikinAshiTrend;
  px: number;
  py: number;
}

export interface ChartLineHeikinAshiMarker {
  index: number;
  x: number;
  haClose: number;
  trend: ChartLineHeikinAshiTrend;
  px: number;
  py: number;
}

export interface ChartLineHeikinAshiPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineHeikinAshiLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineHeikinAshiPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  haPath: string;
  priceDots: ChartLineHeikinAshiPriceDot[];
  haMarkers: ChartLineHeikinAshiMarker[];
  bullishCount: number;
  bearishCount: number;
  dojiCount: number;
  haCloseFinal: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineHeikinAshiLayoutOptions {
  data: readonly ChartLineHeikinAshiPoint[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineHeikinAshiProps {
  data: readonly ChartLineHeikinAshiPoint[];
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
  haColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  dojiColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showHa?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineHeikinAshiPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function noNegativeZero(v: number): number {
  return v === 0 ? 0 : v;
}

export function getLineHeikinAshiFinitePoints(
  points: readonly ChartLineHeikinAshiPoint[] | null | undefined,
): ChartLineHeikinAshiPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineHeikinAshiPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.open) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close),
  );
}

/**
 * The Heikin-Ashi ("average bar") transform. Each bar's smoothed
 * values are:
 *
 *   haClose = (open + high + low + close) / 4
 *   haOpen  = first bar: (open + close) / 2
 *             later bar: (haOpen[prev] + haClose[prev]) / 2
 *   haHigh  = max(high, haOpen, haClose)
 *   haLow   = min(low,  haOpen, haClose)
 *
 * The recursive haOpen carries the previous bar forward, so a single
 * noisy close is averaged down rather than swinging the line; this
 * is what filters noise out of the raw close.
 */
export function computeLineHeikinAshi(
  bars:
    | readonly { open: number; high: number; low: number; close: number }[]
    | null
    | undefined,
): ChartLineHeikinAshiBar[] {
  if (!Array.isArray(bars)) return [];
  const out: ChartLineHeikinAshiBar[] = [];
  let prevHaOpen = NaN;
  let prevHaClose = NaN;
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i]!;
    const haClose = noNegativeZero((b.open + b.high + b.low + b.close) / 4);
    const haOpen = noNegativeZero(
      i === 0 ? (b.open + b.close) / 2 : (prevHaOpen + prevHaClose) / 2,
    );
    const haHigh = Math.max(b.high, haOpen, haClose);
    const haLow = Math.min(b.low, haOpen, haClose);
    out.push({ haOpen, haHigh, haLow, haClose });
    prevHaOpen = haOpen;
    prevHaClose = haClose;
  }
  return out;
}

function classifyTrend(
  haOpen: number,
  haClose: number,
): ChartLineHeikinAshiTrend {
  if (haClose > haOpen) return 'bullish';
  if (haClose < haOpen) return 'bearish';
  return 'doji';
}

export function runLineHeikinAshi(
  points: readonly ChartLineHeikinAshiPoint[] | null | undefined,
): ChartLineHeikinAshiRun {
  const finite = getLineHeikinAshiFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const n = series.length;

  if (n < 2) {
    return {
      series,
      bars: [],
      samples: [],
      haCloseSeries: [],
      bullishCount: 0,
      bearishCount: 0,
      dojiCount: 0,
      haCloseFinal: NaN,
      ok: false,
    };
  }

  const bars = computeLineHeikinAshi(series);
  const samples: ChartLineHeikinAshiSample[] = series.map((p, i) => {
    const b = bars[i]!;
    return {
      index: i,
      x: p.x,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      haOpen: b.haOpen,
      haHigh: b.haHigh,
      haLow: b.haLow,
      haClose: b.haClose,
      trend: classifyTrend(b.haOpen, b.haClose),
    };
  });

  let bullishCount = 0;
  let bearishCount = 0;
  let dojiCount = 0;
  for (const s of samples) {
    if (s.trend === 'bullish') bullishCount += 1;
    else if (s.trend === 'bearish') bearishCount += 1;
    else dojiCount += 1;
  }

  const haCloseSeries = bars.map((b) => b.haClose);

  return {
    series,
    bars,
    samples,
    haCloseSeries,
    bullishCount,
    bearishCount,
    dojiCount,
    haCloseFinal: haCloseSeries[haCloseSeries.length - 1]!,
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

export function computeLineHeikinAshiLayout(
  options: ComputeLineHeikinAshiLayoutOptions,
): ChartLineHeikinAshiLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_HEIKIN_ASHI_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineHeikinAshiPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineHeikinAshi(data);
  const empty: ChartLineHeikinAshiLayout = {
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
    haPath: '',
    priceDots: [],
    haMarkers: [],
    bullishCount: 0,
    bearishCount: 0,
    dojiCount: 0,
    haCloseFinal: NaN,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineHeikinAshiPanel = {
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
    if (s.haClose < yLo) yLo = s.haClose;
    if (s.haClose > yHi) yHi = s.haClose;
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

  const priceDots: ChartLineHeikinAshiPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    close: s.close,
    haClose: s.haClose,
    trend: s.trend,
    px: projectX(s.x),
    py: projectY(s.close),
  }));

  const haMarkers: ChartLineHeikinAshiMarker[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    haClose: s.haClose,
    trend: s.trend,
    px: projectX(s.x),
    py: projectY(s.haClose),
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
    haPath: buildPath(haMarkers.map((m) => ({ px: m.px, py: m.py }))),
    priceDots,
    haMarkers,
    bullishCount: run.bullishCount,
    bearishCount: run.bearishCount,
    dojiCount: run.dojiCount,
    haCloseFinal: run.haCloseFinal,
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

export function describeLineHeikinAshiChart(
  data: readonly ChartLineHeikinAshiPoint[] | null | undefined,
): string {
  const run = runLineHeikinAshi(data);
  if (!run.ok) return 'No data';
  return `Line chart overlaying a Heikin-Ashi smoothed close series. Each Heikin-Ashi close is the average of the bar's open, high, low and close, and each Heikin-Ashi open carries forward as the mean of the previous Heikin-Ashi open and close -- this recursive averaging filters single-bar noise out of the raw close line. A bar is bullish when its Heikin-Ashi close sits above its Heikin-Ashi open and bearish when below. The series carries ${run.bullishCount} bullish, ${run.bearishCount} bearish and ${run.dojiCount} doji bars across ${run.samples.length} bars.`;
}

const HEIKIN_ASHI_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineHeikinAshi = forwardRef<
  HTMLDivElement,
  ChartLineHeikinAshiProps
>(function ChartLineHeikinAshi(
  props: ChartLineHeikinAshiProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_HEIKIN_ASHI_WIDTH,
    height = DEFAULT_CHART_LINE_HEIKIN_ASHI_HEIGHT,
    padding = DEFAULT_CHART_LINE_HEIKIN_ASHI_PADDING,
    tickCount = DEFAULT_CHART_LINE_HEIKIN_ASHI_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_HEIKIN_ASHI_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_HEIKIN_ASHI_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_HEIKIN_ASHI_PRICE_COLOR,
    haColor = DEFAULT_CHART_LINE_HEIKIN_ASHI_HA_COLOR,
    bullishColor = DEFAULT_CHART_LINE_HEIKIN_ASHI_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_HEIKIN_ASHI_BEARISH_COLOR,
    dojiColor = DEFAULT_CHART_LINE_HEIKIN_ASHI_DOJI_COLOR,
    gridColor = DEFAULT_CHART_LINE_HEIKIN_ASHI_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_HEIKIN_ASHI_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showHa = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a Heikin-Ashi smoothed close overlay',
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
      computeLineHeikinAshiLayout({
        data,
        width,
        height,
        padding,
        tickCount,
      }),
    [data, width, height, padding, tickCount],
  );

  const summary = useMemo(
    () => ariaDescription ?? describeLineHeikinAshiChart(data),
    [ariaDescription, data],
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
        data-section="chart-line-heikin-ashi"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-heikin-ashi-aria-desc"
          style={HEIKIN_ASHI_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const cp = layout.panel;
  const priceVisible = !hiddenSet.has('close');
  const haVisible = showHa && !hiddenSet.has('ha');

  const trendColor = (trend: ChartLineHeikinAshiTrend): string =>
    trend === 'bullish'
      ? bullishColor
      : trend === 'bearish'
        ? bearishColor
        : dojiColor;

  const lastTrend =
    layout.haMarkers.length > 0
      ? layout.haMarkers[layout.haMarkers.length - 1]!.trend
      : 'doji';

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'close', label: 'Close', color: priceColor },
    { id: 'ha', label: 'HA Close', color: haColor },
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
      data-section="chart-line-heikin-ashi"
      data-empty="false"
      data-bullish-count={layout.bullishCount}
      data-bearish-count={layout.bearishCount}
      data-doji-count={layout.dojiCount}
      data-ha-close-final={layout.haCloseFinal}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-heikin-ashi-aria-desc"
        style={HEIKIN_ASHI_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-heikin-ashi-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-heikin-ashi-badge"
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
              data-section="chart-line-heikin-ashi-badge-icon"
              aria-hidden="true"
              style={{ color: haColor }}
            >
              HEIKIN-ASHI
            </span>
            <span
              data-section="chart-line-heikin-ashi-badge-trend"
              style={{ color: trendColor(lastTrend) }}
            >
              {lastTrend}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-heikin-ashi-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-heikin-ashi-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => (
                <line
                  key={`gy-${i}`}
                  data-section="chart-line-heikin-ashi-grid-line"
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
              data-section="chart-line-heikin-ashi-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-heikin-ashi-axis"
                data-axis="x"
                x1={cp.x}
                y1={cp.y + cp.height}
                x2={cp.x + cp.width}
                y2={cp.y + cp.height}
              />
              <line
                data-section="chart-line-heikin-ashi-axis"
                data-axis="y"
                x1={cp.x}
                y1={cp.y}
                x2={cp.x}
                y2={cp.y + cp.height}
              />
              {layout.yTicks.map((t, i) => (
                <g
                  key={`yt-${i}`}
                  data-section="chart-line-heikin-ashi-tick"
                  data-axis="y"
                >
                  <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                  <text
                    data-section="chart-line-heikin-ashi-tick-label"
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
                  data-section="chart-line-heikin-ashi-tick"
                  data-axis="x"
                >
                  <line
                    x1={t.px}
                    x2={t.px}
                    y1={cp.y + cp.height}
                    y2={cp.y + cp.height + 4}
                  />
                  <text
                    data-section="chart-line-heikin-ashi-tick-label"
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
              aria-label="Raw close line"
              data-section="chart-line-heikin-ashi-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-heikin-ashi-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                    data-section="chart-line-heikin-ashi-dot"
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

          {haVisible && layout.haPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Heikin-Ashi smoothed close line"
              data-section="chart-line-heikin-ashi-ha-line"
              d={layout.haPath}
              fill="none"
              stroke={haColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {haVisible ? (
            <g data-section="chart-line-heikin-ashi-markers">
              {layout.haMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Heikin-Ashi close at x ${formatX(m.x)}: ${formatValue(m.haClose)}, ${m.trend}`}
                    data-section="chart-line-heikin-ashi-marker"
                    data-point-index={m.index}
                    data-ha-close={m.haClose}
                    data-trend={m.trend}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={trendColor(m.trend)}
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
                  data-section="chart-line-heikin-ashi-tooltip"
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
                  <div data-section="chart-line-heikin-ashi-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-heikin-ashi-tooltip-close"
                    style={{ fontWeight: 600 }}
                  >
                    close: {formatValue(d.close)}
                  </div>
                  <div data-section="chart-line-heikin-ashi-tooltip-ha-close">
                    ha close: {formatValue(d.haClose)}
                  </div>
                  <div data-section="chart-line-heikin-ashi-tooltip-trend">
                    trend: {d.trend}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-heikin-ashi-legend"
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
                data-section="chart-line-heikin-ashi-legend-item"
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
                  data-section="chart-line-heikin-ashi-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-heikin-ashi-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-heikin-ashi-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.bullishCount} bull, {layout.bearishCount} bear,{' '}
            {layout.dojiCount} doji
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineHeikinAshi.displayName = 'ChartLineHeikinAshi';
