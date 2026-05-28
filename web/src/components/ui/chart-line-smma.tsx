import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_SMMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_SMMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_SMMA_PADDING = 40;
export const DEFAULT_CHART_LINE_SMMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SMMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SMMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SMMA_PERIOD = 14;
export const DEFAULT_CHART_LINE_SMMA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_SMMA_SMMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_SMMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SMMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineSmmaPosition = 'above' | 'below' | 'on';

export interface ChartLineSmmaPoint {
  x: number;
  value: number;
}

export interface ChartLineSmmaSample {
  index: number;
  x: number;
  value: number;
  smma: number | null;
  position: ChartLineSmmaPosition;
}

export interface ChartLineSmmaRun {
  series: ChartLineSmmaPoint[];
  period: number;
  smma: (number | null)[];
  samples: ChartLineSmmaSample[];
  smmaFinal: number;
  smmaMin: number;
  smmaMax: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineSmmaPriceDot {
  index: number;
  x: number;
  value: number;
  smma: number | null;
  position: ChartLineSmmaPosition;
  px: number;
  py: number;
}

export interface ChartLineSmmaMarker {
  index: number;
  x: number;
  smma: number;
  px: number;
  py: number;
}

export interface ChartLineSmmaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineSmmaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineSmmaPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  smmaPath: string;
  priceDots: ChartLineSmmaPriceDot[];
  smmaMarkers: ChartLineSmmaMarker[];
  period: number;
  smmaFinal: number;
  smmaMin: number;
  smmaMax: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineSmmaLayoutOptions {
  data: readonly ChartLineSmmaPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineSmmaProps {
  data: readonly ChartLineSmmaPoint[];
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
  smmaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSmma?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineSmmaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineSmmaFinitePoints(
  points: readonly ChartLineSmmaPoint[] | null | undefined,
): ChartLineSmmaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineSmmaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineSmmaPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Welles Wilder's Smoothed Moving Average. The first value is the
 * simple mean of the first `period` prices; each later bar folds in
 * as `SMMA = (SMMA_prev * (period - 1) + price) / period`. That is a
 * running mean with the slow weight `1 / period` -- every past value
 * still contributes with an exponentially decaying weight, so no
 * value is ever fully dropped and the average stays exceptionally
 * smooth. The SMMA is defined from index `period - 1` onward.
 */
export function computeLineSmma(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p) return out;
  let sum = 0;
  for (let k = 0; k < p; k += 1) sum += values[k]!;
  let smma = sum / p;
  out[p - 1] = smma;
  for (let i = p; i < n; i += 1) {
    smma = (smma * (p - 1) + values[i]!) / p;
    out[i] = smma;
  }
  return out;
}

function classifyPosition(
  value: number,
  smma: number | null,
): ChartLineSmmaPosition {
  if (smma === null) return 'on';
  if (value > smma) return 'above';
  if (value < smma) return 'below';
  return 'on';
}

export function runLineSmma(
  points: readonly ChartLineSmmaPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineSmmaRun {
  const finite = getLineSmmaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineSmmaPeriod(
    options?.period ?? DEFAULT_CHART_LINE_SMMA_PERIOD,
    DEFAULT_CHART_LINE_SMMA_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      smma: [],
      samples: [],
      smmaFinal: NaN,
      smmaMin: NaN,
      smmaMax: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const smma = computeLineSmma(values, period);

  const samples: ChartLineSmmaSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    smma: smma[i] ?? null,
    position: classifyPosition(p.value, smma[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let smmaMin = NaN;
  let smmaMax = NaN;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.smma !== null) {
      if (Number.isNaN(smmaMin) || s.smma < smmaMin) smmaMin = s.smma;
      if (Number.isNaN(smmaMax) || s.smma > smmaMax) smmaMax = s.smma;
    }
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series = [],
    period,
    smma,
    samples,
    smmaFinal: lastDefined(smma),
    smmaMin,
    smmaMax,
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

export function computeLineSmmaLayout(
  options: ComputeLineSmmaLayoutOptions,
): ChartLineSmmaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_SMMA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineSmmaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineSmma(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineSmmaLayout = {
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
    smmaPath: '',
    priceDots: [],
    smmaMarkers: [],
    period: run.period,
    smmaFinal: NaN,
    smmaMin: NaN,
    smmaMax: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineSmmaPanel = {
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
    if (s.smma !== null) {
      if (s.smma < yLo) yLo = s.smma;
      if (s.smma > yHi) yHi = s.smma;
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

  const priceDots: ChartLineSmmaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    smma: s.smma,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const smmaMarkers: ChartLineSmmaMarker[] = [];
  const smmaPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.smma !== null) {
      const px = projectX(s.x);
      const py = projectY(s.smma);
      smmaPts.push({ px, py });
      smmaMarkers.push({ index: s.index, x: s.x, smma: s.smma, px, py });
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
    smmaPath: buildPath(smmaPts),
    priceDots,
    smmaMarkers,
    period: run.period,
    smmaFinal: run.smmaFinal,
    smmaMin: run.smmaMin,
    smmaMax: run.smmaMax,
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

export function describeLineSmmaChart(
  data: readonly ChartLineSmmaPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineSmma(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Smoothed Moving Average (SMMA) overlay (period ${run.period}): the SMMA applies Welles Wilder's running-mean smoothing -- after a simple-average seed, each bar folds in as (SMMA_prev * (N-1) + price) / N. This is a running mean with the slow weight 1/N, so no past value is ever fully dropped and the average stays exceptionally smooth, lagging more than a same-period exponential moving average. The price runs above the SMMA on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const SMMA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineSmma = forwardRef<HTMLDivElement, ChartLineSmmaProps>(
  function ChartLineSmma(
    props: ChartLineSmmaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_SMMA_WIDTH,
      height = DEFAULT_CHART_LINE_SMMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_SMMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_SMMA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_SMMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_SMMA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_SMMA_PRICE_COLOR,
      smmaColor = DEFAULT_CHART_LINE_SMMA_SMMA_COLOR,
      gridColor = DEFAULT_CHART_LINE_SMMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_SMMA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showSmma = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Smoothed Moving Average overlay',
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
        computeLineSmmaLayout({
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
        describeLineSmmaChart(data, {
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
          data-section="chart-line-smma"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-smma-aria-desc"
            style={SMMA_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const smmaVisible = showSmma && !hiddenSet.has('smma');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'smma', label: 'SMMA', color: smmaColor },
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
        data-section="chart-line-smma"
        data-empty="false"
        data-period={layout.period}
        data-smma-final={layout.smmaFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-smma-aria-desc"
          style={SMMA_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-smma-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-smma-badge"
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
                data-section="chart-line-smma-badge-icon"
                aria-hidden="true"
                style={{ color: smmaColor }}
              >
                SMMA
              </span>
              <span data-section="chart-line-smma-badge-period">
                p={layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-smma-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-smma-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-smma-grid-line"
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
                data-section="chart-line-smma-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-smma-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-smma-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-smma-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-smma-tick-label"
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
                    data-section="chart-line-smma-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-smma-tick-label"
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
                data-section="chart-line-smma-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-smma-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-smma-dot"
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

            {smmaVisible && layout.smmaPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Smoothed Moving Average line"
                data-section="chart-line-smma-smma-line"
                d={layout.smmaPath}
                fill="none"
                stroke={smmaColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {smmaVisible ? (
              <g data-section="chart-line-smma-markers">
                {layout.smmaMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`SMMA at x ${formatX(m.x)}: ${formatValue(m.smma)}`}
                      data-section="chart-line-smma-marker"
                      data-point-index={m.index}
                      data-smma={m.smma}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={smmaColor}
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
                    data-section="chart-line-smma-tooltip"
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
                    <div data-section="chart-line-smma-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-smma-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-smma-tooltip-smma">
                      smma: {d.smma === null ? 'n/a' : formatValue(d.smma)}
                    </div>
                    <div data-section="chart-line-smma-tooltip-position">
                      position: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-smma-legend"
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
                  data-section="chart-line-smma-legend-item"
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
                    data-section="chart-line-smma-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-smma-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-smma-legend-stats"
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

ChartLineSmma.displayName = 'ChartLineSmma';
