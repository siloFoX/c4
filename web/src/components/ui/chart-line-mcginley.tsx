import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_MCGINLEY_WIDTH = 560;
export const DEFAULT_CHART_LINE_MCGINLEY_HEIGHT = 320;
export const DEFAULT_CHART_LINE_MCGINLEY_PADDING = 40;
export const DEFAULT_CHART_LINE_MCGINLEY_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MCGINLEY_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MCGINLEY_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MCGINLEY_PERIOD = 14;
export const DEFAULT_CHART_LINE_MCGINLEY_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_MCGINLEY_MD_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_MCGINLEY_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MCGINLEY_AXIS_COLOR = '#cbd5e1';

export type ChartLineMcGinleyPosition = 'above' | 'below' | 'on';

export interface ChartLineMcGinleyPoint {
  x: number;
  value: number;
}

export interface ChartLineMcGinleySample {
  index: number;
  x: number;
  value: number;
  md: number;
  position: ChartLineMcGinleyPosition;
}

export interface ChartLineMcGinleyRun {
  series: ChartLineMcGinleyPoint[];
  period: number;
  md: number[];
  samples: ChartLineMcGinleySample[];
  mdFinal: number;
  mdMin: number;
  mdMax: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineMcGinleyPriceDot {
  index: number;
  x: number;
  value: number;
  md: number;
  position: ChartLineMcGinleyPosition;
  px: number;
  py: number;
}

export interface ChartLineMcGinleyMarker {
  index: number;
  x: number;
  md: number;
  px: number;
  py: number;
}

export interface ChartLineMcGinleyPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineMcGinleyLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineMcGinleyPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  mdPath: string;
  priceDots: ChartLineMcGinleyPriceDot[];
  mdMarkers: ChartLineMcGinleyMarker[];
  period: number;
  mdFinal: number;
  mdMin: number;
  mdMax: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineMcGinleyLayoutOptions {
  data: readonly ChartLineMcGinleyPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineMcGinleyProps {
  data: readonly ChartLineMcGinleyPoint[];
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
  mdColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMd?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineMcGinleyPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineMcGinleyFinitePoints(
  points: readonly ChartLineMcGinleyPoint[] | null | undefined,
): ChartLineMcGinleyPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineMcGinleyPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineMcGinleyPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The McGinley Dynamic, John R. McGinley's adaptive moving average.
 * It seeds with the first price and folds each later bar in as:
 *
 *   MD = MD_prev + (price - MD_prev) / (N * (price / MD_prev)^4)
 *
 * The `(price / MD_prev)^4` divisor is the adaptive term: in an up
 * market the ratio exceeds one so the divisor grows and the average
 * slows, while in a down market the divisor shrinks and the average
 * speeds up to track the fall. The line is defined from index 0
 * with no warm-up. A non-positive previous value re-seeds on the
 * current price to avoid a divide-by-zero.
 */
export function computeLineMcGinley(
  values: readonly number[] | null | undefined,
  period: number,
): number[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  if (n === 0) return [];
  const p = period < 1 ? 1 : Math.floor(period);
  const out: number[] = new Array(n);
  out[0] = values[0]!;
  for (let i = 1; i < n; i += 1) {
    const price = values[i]!;
    const prev = out[i - 1]!;
    if (!isFiniteNumber(price)) {
      out[i] = prev;
      continue;
    }
    if (!isFiniteNumber(prev) || prev <= 0) {
      out[i] = price;
      continue;
    }
    const ratio = price / prev;
    const denom = p * Math.pow(ratio, 4);
    const next = denom === 0 ? price : prev + (price - prev) / denom;
    out[i] = isFiniteNumber(next) ? next : price;
  }
  return out;
}

function classifyPosition(
  value: number,
  md: number,
): ChartLineMcGinleyPosition {
  if (value > md) return 'above';
  if (value < md) return 'below';
  return 'on';
}

export function runLineMcGinley(
  points: readonly ChartLineMcGinleyPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineMcGinleyRun {
  const finite = getLineMcGinleyFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineMcGinleyPeriod(
    options?.period ?? DEFAULT_CHART_LINE_MCGINLEY_PERIOD,
    DEFAULT_CHART_LINE_MCGINLEY_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      md: [],
      samples: [],
      mdFinal: NaN,
      mdMin: NaN,
      mdMax: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const md = computeLineMcGinley(
    series.map((p) => p.value),
    period,
  );

  const samples: ChartLineMcGinleySample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    md: md[i]!,
    position: classifyPosition(p.value, md[i]!),
  }));

  let mdMin = Number.POSITIVE_INFINITY;
  let mdMax = Number.NEGATIVE_INFINITY;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.md < mdMin) mdMin = s.md;
    if (s.md > mdMax) mdMax = s.md;
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series = [],
    period,
    md,
    samples,
    mdFinal: md[md.length - 1]!,
    mdMin,
    mdMax,
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

export function computeLineMcGinleyLayout(
  options: ComputeLineMcGinleyLayoutOptions,
): ChartLineMcGinleyLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_MCGINLEY_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineMcGinleyPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineMcGinley(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineMcGinleyLayout = {
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
    mdPath: '',
    priceDots: [],
    mdMarkers: [],
    period: run.period,
    mdFinal: NaN,
    mdMin: NaN,
    mdMax: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineMcGinleyPanel = {
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
    if (s.md < yLo) yLo = s.md;
    if (s.md > yHi) yHi = s.md;
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

  const priceDots: ChartLineMcGinleyPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    md: s.md,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const mdMarkers: ChartLineMcGinleyMarker[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    md: s.md,
    px: projectX(s.x),
    py: projectY(s.md),
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
    mdPath: buildPath(mdMarkers.map((m) => ({ px: m.px, py: m.py }))),
    priceDots,
    mdMarkers,
    period: run.period,
    mdFinal: run.mdFinal,
    mdMin: run.mdMin,
    mdMax: run.mdMax,
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

export function describeLineMcGinleyChart(
  data: readonly ChartLineMcGinleyPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineMcGinley(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a McGinley Dynamic overlay (period ${run.period}): the McGinley Dynamic is an adaptive moving average that self-adjusts to speed. It seeds with the first price and folds each later bar in as MD = MD_prev + (price - MD_prev) / (N * (price / MD_prev)^4). The (price / MD)^4 divisor is the adaptive term -- in an up market the ratio exceeds one so the divisor grows and the average slows, while in a down market the divisor shrinks and the average speeds up to track the fall. The price runs above the McGinley line on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const MCGINLEY_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineMcGinley = forwardRef<
  HTMLDivElement,
  ChartLineMcGinleyProps
>(function ChartLineMcGinley(
  props: ChartLineMcGinleyProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_MCGINLEY_WIDTH,
    height = DEFAULT_CHART_LINE_MCGINLEY_HEIGHT,
    padding = DEFAULT_CHART_LINE_MCGINLEY_PADDING,
    tickCount = DEFAULT_CHART_LINE_MCGINLEY_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MCGINLEY_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MCGINLEY_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MCGINLEY_PRICE_COLOR,
    mdColor = DEFAULT_CHART_LINE_MCGINLEY_MD_COLOR,
    gridColor = DEFAULT_CHART_LINE_MCGINLEY_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_MCGINLEY_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMd = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a McGinley Dynamic overlay',
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
      computeLineMcGinleyLayout({
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
      describeLineMcGinleyChart(data, {
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
        data-section="chart-line-mcginley"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-mcginley-aria-desc"
          style={MCGINLEY_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const cp = layout.panel;
  const priceVisible = !hiddenSet.has('price');
  const mdVisible = showMd && !hiddenSet.has('md');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'md', label: 'McGinley', color: mdColor },
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
      data-section="chart-line-mcginley"
      data-empty="false"
      data-period={layout.period}
      data-md-final={layout.mdFinal}
      data-above-count={layout.aboveCount}
      data-below-count={layout.belowCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-mcginley-aria-desc"
        style={MCGINLEY_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-mcginley-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-mcginley-badge"
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
              data-section="chart-line-mcginley-badge-icon"
              aria-hidden="true"
              style={{ color: mdColor }}
            >
              MCGINLEY
            </span>
            <span data-section="chart-line-mcginley-badge-period">
              p={layout.period}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-mcginley-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-mcginley-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => (
                <line
                  key={`gy-${i}`}
                  data-section="chart-line-mcginley-grid-line"
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
              data-section="chart-line-mcginley-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-mcginley-axis"
                data-axis="x"
                x1={cp.x}
                y1={cp.y + cp.height}
                x2={cp.x + cp.width}
                y2={cp.y + cp.height}
              />
              <line
                data-section="chart-line-mcginley-axis"
                data-axis="y"
                x1={cp.x}
                y1={cp.y}
                x2={cp.x}
                y2={cp.y + cp.height}
              />
              {layout.yTicks.map((t, i) => (
                <g
                  key={`yt-${i}`}
                  data-section="chart-line-mcginley-tick"
                  data-axis="y"
                >
                  <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                  <text
                    data-section="chart-line-mcginley-tick-label"
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
                  data-section="chart-line-mcginley-tick"
                  data-axis="x"
                >
                  <line
                    x1={t.px}
                    x2={t.px}
                    y1={cp.y + cp.height}
                    y2={cp.y + cp.height + 4}
                  />
                  <text
                    data-section="chart-line-mcginley-tick-label"
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
              data-section="chart-line-mcginley-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-mcginley-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-mcginley-dot"
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

          {mdVisible && layout.mdPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="McGinley Dynamic line"
              data-section="chart-line-mcginley-md-line"
              d={layout.mdPath}
              fill="none"
              stroke={mdColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {mdVisible ? (
            <g data-section="chart-line-mcginley-markers">
              {layout.mdMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`McGinley Dynamic at x ${formatX(m.x)}: ${formatValue(m.md)}`}
                    data-section="chart-line-mcginley-marker"
                    data-point-index={m.index}
                    data-md={m.md}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={mdColor}
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
                  data-section="chart-line-mcginley-tooltip"
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
                  <div data-section="chart-line-mcginley-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-mcginley-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-mcginley-tooltip-md">
                    md: {formatValue(d.md)}
                  </div>
                  <div data-section="chart-line-mcginley-tooltip-position">
                    position: {d.position}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-mcginley-legend"
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
                data-section="chart-line-mcginley-legend-item"
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
                  data-section="chart-line-mcginley-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-mcginley-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-mcginley-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.aboveCount} above, {layout.belowCount} below
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineMcGinley.displayName = 'ChartLineMcGinley';
