import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_VWMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_VWMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_VWMA_PADDING = 40;
export const DEFAULT_CHART_LINE_VWMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VWMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VWMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VWMA_PERIOD = 20;
export const DEFAULT_CHART_LINE_VWMA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_VWMA_VWMA_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VWMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VWMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineVwmaPosition = 'above' | 'below' | 'on';

export interface ChartLineVwmaPoint {
  x: number;
  value: number;
  volume: number;
}

export interface ChartLineVwmaSample {
  index: number;
  x: number;
  value: number;
  volume: number;
  vwma: number | null;
  position: ChartLineVwmaPosition;
}

export interface ChartLineVwmaRun {
  series: ChartLineVwmaPoint[];
  period: number;
  vwma: (number | null)[];
  samples: ChartLineVwmaSample[];
  vwmaFinal: number;
  vwmaMin: number;
  vwmaMax: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineVwmaPriceDot {
  index: number;
  x: number;
  value: number;
  volume: number;
  vwma: number | null;
  position: ChartLineVwmaPosition;
  px: number;
  py: number;
}

export interface ChartLineVwmaMarker {
  index: number;
  x: number;
  vwma: number;
  px: number;
  py: number;
}

export interface ChartLineVwmaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineVwmaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineVwmaPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  vwmaPath: string;
  priceDots: ChartLineVwmaPriceDot[];
  vwmaMarkers: ChartLineVwmaMarker[];
  period: number;
  vwmaFinal: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineVwmaLayoutOptions {
  data: readonly ChartLineVwmaPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineVwmaProps {
  data: readonly ChartLineVwmaPoint[];
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
  vwmaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showVwma?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineVwmaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineVwmaFinitePoints(
  points: readonly ChartLineVwmaPoint[] | null | undefined,
): ChartLineVwmaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineVwmaPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.value) &&
      isFiniteNumber(p.volume) &&
      p.volume >= 0,
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineVwmaPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The Volume Weighted Moving Average. For each bar the trailing
 * window of `period` bars is averaged with each price weighted by
 * its bar volume:
 *
 *   VWMA[i] = SUM(price[j] * volume[j]) / SUM(volume[j])
 *
 * over the window. A high-volume bar pulls the average toward its
 * price more strongly than a low-volume bar. A window whose total
 * volume is zero has an undefined average and is null, as are bars
 * before the window is full.
 */
export function computeLineVwma(
  values: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values) || !Array.isArray(volumes)) return [];
  const n = values.length;
  const p = normalizeLineVwmaPeriod(period, DEFAULT_CHART_LINE_VWMA_PERIOD);
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p) return out;
  for (let i = p - 1; i < n; i += 1) {
    let num = 0;
    let den = 0;
    for (let k = 0; k < p; k += 1) {
      const price = values[i - k];
      const vol = volumes[i - k];
      if (isFiniteNumber(price) && isFiniteNumber(vol) && vol >= 0) {
        num += price * vol;
        den += vol;
      }
    }
    out[i] = den > 0 ? num / den : null;
  }
  return out;
}

function classifyPosition(
  value: number,
  vwma: number | null,
): ChartLineVwmaPosition {
  if (vwma === null) return 'on';
  if (value > vwma) return 'above';
  if (value < vwma) return 'below';
  return 'on';
}

export function runLineVwma(
  points: readonly ChartLineVwmaPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineVwmaRun {
  const finite = getLineVwmaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineVwmaPeriod(
    options?.period ?? DEFAULT_CHART_LINE_VWMA_PERIOD,
    DEFAULT_CHART_LINE_VWMA_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      vwma: [],
      samples: [],
      vwmaFinal: NaN,
      vwmaMin: NaN,
      vwmaMax: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const volumes = series.map((p) => p.volume);
  const vwma = computeLineVwma(values, volumes, period);

  const samples: ChartLineVwmaSample[] = series.map((p, i) => {
    const v = vwma[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      volume: p.volume,
      vwma: v,
      position: classifyPosition(p.value, v),
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let vMin = Number.POSITIVE_INFINITY;
  let vMax = Number.NEGATIVE_INFINITY;
  let vFinal = NaN;
  for (const s of samples) {
    if (s.position === 'above') aboveCount += 1;
    else if (s.position === 'below') belowCount += 1;
    if (s.vwma !== null) {
      if (s.vwma < vMin) vMin = s.vwma;
      if (s.vwma > vMax) vMax = s.vwma;
      vFinal = s.vwma;
    }
  }

  return {
    series = [],
    period,
    vwma,
    samples,
    vwmaFinal: vFinal,
    vwmaMin: isFiniteNumber(vMin) ? vMin : NaN,
    vwmaMax: isFiniteNumber(vMax) ? vMax : NaN,
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

export function computeLineVwmaLayout(
  options: ComputeLineVwmaLayoutOptions,
): ChartLineVwmaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_VWMA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineVwmaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineVwma(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineVwmaLayout = {
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
    vwmaPath: '',
    priceDots: [],
    vwmaMarkers: [],
    period: run.period,
    vwmaFinal: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineVwmaPanel = {
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
    if (s.vwma !== null) {
      if (s.vwma < yLo) yLo = s.vwma;
      if (s.vwma > yHi) yHi = s.vwma;
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

  const priceDots: ChartLineVwmaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    volume: s.volume,
    vwma: s.vwma,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const vwmaMarkers: ChartLineVwmaMarker[] = [];
  const vwmaPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.vwma !== null) {
      const px = projectX(s.x);
      const py = projectY(s.vwma);
      vwmaPts.push({ px, py });
      vwmaMarkers.push({ index: s.index, x: s.x, vwma: s.vwma, px, py });
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
    vwmaPath: buildPath(vwmaPts),
    priceDots,
    vwmaMarkers,
    period: run.period,
    vwmaFinal: run.vwmaFinal,
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

export function describeLineVwmaChart(
  data: readonly ChartLineVwmaPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineVwma(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Volume Weighted Moving Average (period ${run.period}): the VWMA averages the trailing ${run.period} bars with each price weighted by its bar volume -- VWMA = sum(price * volume) / sum(volume) over the window. Because a high-volume bar carries more weight than a low-volume bar, the VWMA tracks where the trading actually happened, unlike a simple moving average that weights every bar equally. The price runs above the VWMA on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const VWMA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineVwma = forwardRef<HTMLDivElement, ChartLineVwmaProps>(
  function ChartLineVwma(
    props: ChartLineVwmaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_VWMA_WIDTH,
      height = DEFAULT_CHART_LINE_VWMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_VWMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_VWMA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_VWMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_VWMA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_VWMA_PRICE_COLOR,
      vwmaColor = DEFAULT_CHART_LINE_VWMA_VWMA_COLOR,
      gridColor = DEFAULT_CHART_LINE_VWMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_VWMA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showVwma = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Volume Weighted Moving Average',
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
        computeLineVwmaLayout({
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
        describeLineVwmaChart(data, {
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
          data-section="chart-line-vwma"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-vwma-aria-desc"
            style={VWMA_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const vwmaVisible = showVwma && !hiddenSet.has('vwma');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'vwma', label: 'VWMA', color: vwmaColor },
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
        data-section="chart-line-vwma"
        data-empty="false"
        data-period={layout.period}
        data-vwma-final={layout.vwmaFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-vwma-aria-desc"
          style={VWMA_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-vwma-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-vwma-badge"
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
                data-section="chart-line-vwma-badge-icon"
                aria-hidden="true"
                style={{ color: vwmaColor }}
              >
                VWMA
              </span>
              <span data-section="chart-line-vwma-badge-config">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-vwma-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-vwma-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-vwma-grid-line"
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
                data-section="chart-line-vwma-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-vwma-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-vwma-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-vwma-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-vwma-tick-label"
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
                    data-section="chart-line-vwma-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-vwma-tick-label"
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

            {vwmaVisible && layout.vwmaPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Volume Weighted Moving Average line"
                data-section="chart-line-vwma-vwma-line"
                d={layout.vwmaPath}
                fill="none"
                stroke={vwmaColor}
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
                data-section="chart-line-vwma-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-vwma-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}, volume ${formatValue(d.volume)}`}
                      data-section="chart-line-vwma-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.value}
                      data-volume={d.volume}
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

            {vwmaVisible ? (
              <g data-section="chart-line-vwma-markers">
                {layout.vwmaMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`VWMA at x ${formatX(m.x)}: ${formatValue(m.vwma)}`}
                      data-section="chart-line-vwma-marker"
                      data-point-index={m.index}
                      data-vwma={m.vwma}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={vwmaColor}
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
                    data-section="chart-line-vwma-tooltip"
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
                    <div data-section="chart-line-vwma-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-vwma-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-vwma-tooltip-volume">
                      volume: {formatValue(d.volume)}
                    </div>
                    <div data-section="chart-line-vwma-tooltip-vwma">
                      vwma: {d.vwma === null ? 'n/a' : formatValue(d.vwma)}
                    </div>
                    <div data-section="chart-line-vwma-tooltip-position">
                      position: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-vwma-legend"
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
                  data-section="chart-line-vwma-legend-item"
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
                    data-section="chart-line-vwma-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-vwma-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-vwma-legend-stats"
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

ChartLineVwma.displayName = 'ChartLineVwma';
