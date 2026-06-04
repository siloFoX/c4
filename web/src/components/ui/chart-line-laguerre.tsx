import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_LAGUERRE_WIDTH = 560;
export const DEFAULT_CHART_LINE_LAGUERRE_HEIGHT = 320;
export const DEFAULT_CHART_LINE_LAGUERRE_PADDING = 40;
export const DEFAULT_CHART_LINE_LAGUERRE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_LAGUERRE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_LAGUERRE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_LAGUERRE_GAMMA = 0.5;
export const DEFAULT_CHART_LINE_LAGUERRE_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_LAGUERRE_FILTER_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_LAGUERRE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_LAGUERRE_AXIS_COLOR = '#cbd5e1';

export type ChartLineLaguerrePosition = 'above' | 'below' | 'on';

export interface ChartLineLaguerrePoint {
  x: number;
  value: number;
}

export interface ChartLineLaguerreStages {
  l0: number[];
  l1: number[];
  l2: number[];
  l3: number[];
}

export interface ChartLineLaguerreSample {
  index: number;
  x: number;
  value: number;
  filter: number;
  position: ChartLineLaguerrePosition;
}

export interface ChartLineLaguerreRun {
  series: ChartLineLaguerrePoint[];
  gamma: number;
  filter: number[];
  samples: ChartLineLaguerreSample[];
  filterFinal: number;
  filterMin: number;
  filterMax: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineLaguerrePriceDot {
  index: number;
  x: number;
  value: number;
  filter: number;
  position: ChartLineLaguerrePosition;
  px: number;
  py: number;
}

export interface ChartLineLaguerreMarker {
  index: number;
  x: number;
  filter: number;
  px: number;
  py: number;
}

export interface ChartLineLaguerrePanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineLaguerreLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineLaguerrePanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  filterPath: string;
  priceDots: ChartLineLaguerrePriceDot[];
  filterMarkers: ChartLineLaguerreMarker[];
  gamma: number;
  filterFinal: number;
  filterMin: number;
  filterMax: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineLaguerreLayoutOptions {
  data: readonly ChartLineLaguerrePoint[];
  gamma?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineLaguerreProps {
  data: readonly ChartLineLaguerrePoint[];
  gamma?: number;
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
  filterColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFilter?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineLaguerrePriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineLaguerreFinitePoints(
  points: readonly ChartLineLaguerrePoint[] | null | undefined,
): ChartLineLaguerrePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineLaguerrePoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a Laguerre gamma to the valid damping range `[0, 1)`. A
 * value outside that range, or a non-finite value, falls back to
 * `fallback`.
 */
export function normalizeLineLaguerreGamma(
  gamma: number,
  fallback: number,
): number {
  if (isFiniteNumber(gamma) && gamma >= 0 && gamma < 1) return gamma;
  return fallback;
}

/**
 * The four cascade stages of John Ehlers' Laguerre filter. Seeded
 * with the first price, each bar advances the cascade:
 *
 *   L0 = (1 - gamma) * price + gamma * L0_prev
 *   L1 = -gamma * L0 + L0_prev + gamma * L1_prev
 *   L2 = -gamma * L1 + L1_prev + gamma * L2_prev
 *   L3 = -gamma * L2 + L2_prev + gamma * L3_prev
 *
 * Each stage damps the one before it; the cascade of four gives the
 * filter its smooth, low-lag shape. Returns the four stage series.
 */
export function computeLineLaguerreStages(
  values: readonly number[] | null | undefined,
  gamma: number,
): ChartLineLaguerreStages {
  if (!Array.isArray(values) || values.length === 0) {
    return { l0: [], l1: [], l2: [], l3: [] };
  }
  const g = normalizeLineLaguerreGamma(gamma, DEFAULT_CHART_LINE_LAGUERRE_GAMMA);
  const n = values.length;
  const l0: number[] = new Array(n);
  const l1: number[] = new Array(n);
  const l2: number[] = new Array(n);
  const l3: number[] = new Array(n);
  const seed = isFiniteNumber(values[0]) ? values[0]! : 0;
  let p0 = seed;
  let p1 = seed;
  let p2 = seed;
  let p3 = seed;
  for (let i = 0; i < n; i += 1) {
    const price = isFiniteNumber(values[i]) ? values[i]! : p0;
    const c0 = (1 - g) * price + g * p0;
    const c1 = -g * c0 + p0 + g * p1;
    const c2 = -g * c1 + p1 + g * p2;
    const c3 = -g * c2 + p2 + g * p3;
    l0[i] = c0;
    l1[i] = c1;
    l2[i] = c2;
    l3[i] = c3;
    p0 = c0;
    p1 = c1;
    p2 = c2;
    p3 = c3;
  }
  return { l0, l1, l2, l3 };
}

/**
 * The Ehlers Laguerre filter -- the weighted blend of the four
 * cascade stages, `(L0 + 2*L1 + 2*L2 + L3) / 6`. The line is
 * defined from index 0 with no warm-up; a flat series holds at its
 * constant.
 */
export function computeLineLaguerre(
  values: readonly number[] | null | undefined,
  gamma: number,
): number[] {
  const { l0, l1, l2, l3 } = computeLineLaguerreStages(values, gamma);
  const out: number[] = new Array(l0.length);
  for (let i = 0; i < l0.length; i += 1) {
    out[i] = (l0[i]! + 2 * l1[i]! + 2 * l2[i]! + l3[i]!) / 6;
  }
  return out;
}

function classifyPosition(
  value: number,
  filter: number,
): ChartLineLaguerrePosition {
  if (value > filter) return 'above';
  if (value < filter) return 'below';
  return 'on';
}

export function runLineLaguerre(
  points: readonly ChartLineLaguerrePoint[] | null | undefined,
  options?: { gamma?: number },
): ChartLineLaguerreRun {
  const finite = getLineLaguerreFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const gamma = normalizeLineLaguerreGamma(
    options?.gamma ?? DEFAULT_CHART_LINE_LAGUERRE_GAMMA,
    DEFAULT_CHART_LINE_LAGUERRE_GAMMA,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      gamma,
      filter: [],
      samples: [],
      filterFinal: NaN,
      filterMin: NaN,
      filterMax: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const filter = computeLineLaguerre(
    series.map((p) => p.value),
    gamma,
  );

  const samples: ChartLineLaguerreSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    filter: filter[i]!,
    position: classifyPosition(p.value, filter[i]!),
  }));

  let filterMin = Number.POSITIVE_INFINITY;
  let filterMax = Number.NEGATIVE_INFINITY;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.filter < filterMin) filterMin = s.filter;
    if (s.filter > filterMax) filterMax = s.filter;
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series,
    gamma,
    filter,
    samples,
    filterFinal: filter[filter.length - 1]!,
    filterMin,
    filterMax,
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

export function computeLineLaguerreLayout(
  options: ComputeLineLaguerreLayoutOptions,
): ChartLineLaguerreLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_LAGUERRE_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineLaguerrePanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineLaguerre(data, {
    ...(isFiniteNumber(options.gamma) ? { gamma: options.gamma } : {}),
  });
  const empty: ChartLineLaguerreLayout = {
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
    filterPath: '',
    priceDots: [],
    filterMarkers: [],
    gamma: run.gamma,
    filterFinal: NaN,
    filterMin: NaN,
    filterMax: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineLaguerrePanel = {
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
    if (s.filter < yLo) yLo = s.filter;
    if (s.filter > yHi) yHi = s.filter;
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

  const priceDots: ChartLineLaguerrePriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    filter: s.filter,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const filterMarkers: ChartLineLaguerreMarker[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    filter: s.filter,
    px: projectX(s.x),
    py: projectY(s.filter),
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
    filterPath: buildPath(filterMarkers.map((m) => ({ px: m.px, py: m.py }))),
    priceDots,
    filterMarkers,
    gamma: run.gamma,
    filterFinal: run.filterFinal,
    filterMin: run.filterMin,
    filterMax: run.filterMax,
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

export function describeLineLaguerreChart(
  data: readonly ChartLineLaguerrePoint[] | null | undefined,
  options?: { gamma?: number },
): string {
  const run = runLineLaguerre(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with an Ehlers Laguerre filter overlay (gamma ${defaultFormatValue(run.gamma)}): the Laguerre filter is John Ehlers' smoothing filter built from a four-stage cascade L0..L3 -- each stage damps the one before it as L_k = -gamma * L_{k-1} + L_{k-1} prev + gamma * L_k prev, seeded from L0 = (1 - gamma) * price + gamma * L0 prev. The output filter is the weighted blend (L0 + 2*L1 + 2*L2 + L3) / 6. The gamma damping factor trades smoothness against lag -- a higher gamma damps more. The price runs above the Laguerre filter on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const LAGUERRE_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineLaguerre = forwardRef<
  HTMLDivElement,
  ChartLineLaguerreProps
>(function ChartLineLaguerre(
  props: ChartLineLaguerreProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    gamma,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_LAGUERRE_WIDTH,
    height = DEFAULT_CHART_LINE_LAGUERRE_HEIGHT,
    padding = DEFAULT_CHART_LINE_LAGUERRE_PADDING,
    tickCount = DEFAULT_CHART_LINE_LAGUERRE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_LAGUERRE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_LAGUERRE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_LAGUERRE_PRICE_COLOR,
    filterColor = DEFAULT_CHART_LINE_LAGUERRE_FILTER_COLOR,
    gridColor = DEFAULT_CHART_LINE_LAGUERRE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_LAGUERRE_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showFilter = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with an Ehlers Laguerre filter overlay',
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
      computeLineLaguerreLayout({
        data,
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(gamma) ? { gamma } : {}),
      }),
    [data, width, height, padding, tickCount, gamma],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineLaguerreChart(data, {
        ...(isFiniteNumber(gamma) ? { gamma } : {}),
      }),
    [ariaDescription, data, gamma],
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
        data-section="chart-line-laguerre"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-laguerre-aria-desc"
          style={LAGUERRE_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const cp = layout.panel;
  const priceVisible = !hiddenSet.has('price');
  const filterVisible = showFilter && !hiddenSet.has('filter');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'filter', label: 'Laguerre', color: filterColor },
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
      data-section="chart-line-laguerre"
      data-empty="false"
      data-gamma={layout.gamma}
      data-filter-final={layout.filterFinal}
      data-above-count={layout.aboveCount}
      data-below-count={layout.belowCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-laguerre-aria-desc"
        style={LAGUERRE_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-laguerre-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-laguerre-badge"
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
              data-section="chart-line-laguerre-badge-icon"
              aria-hidden="true"
              style={{ color: filterColor }}
            >
              LAGUERRE
            </span>
            <span data-section="chart-line-laguerre-badge-gamma">
              g={formatValue(layout.gamma)}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-laguerre-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-laguerre-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => (
                <line
                  key={`gy-${i}`}
                  data-section="chart-line-laguerre-grid-line"
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
              data-section="chart-line-laguerre-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-laguerre-axis"
                data-axis="x"
                x1={cp.x}
                y1={cp.y + cp.height}
                x2={cp.x + cp.width}
                y2={cp.y + cp.height}
              />
              <line
                data-section="chart-line-laguerre-axis"
                data-axis="y"
                x1={cp.x}
                y1={cp.y}
                x2={cp.x}
                y2={cp.y + cp.height}
              />
              {layout.yTicks.map((t, i) => (
                <g
                  key={`yt-${i}`}
                  data-section="chart-line-laguerre-tick"
                  data-axis="y"
                >
                  <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                  <text
                    data-section="chart-line-laguerre-tick-label"
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
                  data-section="chart-line-laguerre-tick"
                  data-axis="x"
                >
                  <line
                    x1={t.px}
                    x2={t.px}
                    y1={cp.y + cp.height}
                    y2={cp.y + cp.height + 4}
                  />
                  <text
                    data-section="chart-line-laguerre-tick-label"
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
              data-section="chart-line-laguerre-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-laguerre-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-laguerre-dot"
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

          {filterVisible && layout.filterPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Ehlers Laguerre filter line"
              data-section="chart-line-laguerre-filter-line"
              d={layout.filterPath}
              fill="none"
              stroke={filterColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {filterVisible ? (
            <g data-section="chart-line-laguerre-markers">
              {layout.filterMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Laguerre filter at x ${formatX(m.x)}: ${formatValue(m.filter)}`}
                    data-section="chart-line-laguerre-marker"
                    data-point-index={m.index}
                    data-filter={m.filter}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={filterColor}
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
                  data-section="chart-line-laguerre-tooltip"
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
                  <div data-section="chart-line-laguerre-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-laguerre-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-laguerre-tooltip-filter">
                    filter: {formatValue(d.filter)}
                  </div>
                  <div data-section="chart-line-laguerre-tooltip-position">
                    position: {d.position}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-laguerre-legend"
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
                data-section="chart-line-laguerre-legend-item"
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
                  data-section="chart-line-laguerre-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-laguerre-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-laguerre-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.aboveCount} above, {layout.belowCount} below
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineLaguerre.displayName = 'ChartLineLaguerre';
