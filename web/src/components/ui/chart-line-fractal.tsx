import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_FRACTAL_WIDTH = 560;
export const DEFAULT_CHART_LINE_FRACTAL_HEIGHT = 320;
export const DEFAULT_CHART_LINE_FRACTAL_PADDING = 40;
export const DEFAULT_CHART_LINE_FRACTAL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FRACTAL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_FRACTAL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FRACTAL_WING = 2;
export const DEFAULT_CHART_LINE_FRACTAL_MARKER_SIZE = 6;
export const DEFAULT_CHART_LINE_FRACTAL_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_FRACTAL_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_FRACTAL_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_FRACTAL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_FRACTAL_AXIS_COLOR = '#cbd5e1';

export type ChartLineFractalType = 'up' | 'down';

export interface ChartLineFractalPoint {
  x: number;
  value: number;
}

export interface ChartLineFractalSignal {
  index: number;
  x: number;
  value: number;
  type: ChartLineFractalType;
}

export interface ChartLineFractalSample {
  index: number;
  x: number;
  value: number;
  fractal: ChartLineFractalType | null;
}

export interface ChartLineFractalRun {
  series: ChartLineFractalPoint[];
  wing: number;
  fractals: (ChartLineFractalType | null)[];
  signals: ChartLineFractalSignal[];
  samples: ChartLineFractalSample[];
  upCount: number;
  downCount: number;
  lastUp: number;
  lastDown: number;
  ok: boolean;
}

export interface ChartLineFractalPriceDot {
  index: number;
  x: number;
  value: number;
  fractal: ChartLineFractalType | null;
  px: number;
  py: number;
}

export interface ChartLineFractalMarker {
  index: number;
  x: number;
  value: number;
  type: ChartLineFractalType;
  px: number;
  py: number;
}

export interface ChartLineFractalPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineFractalLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineFractalPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  priceDots: ChartLineFractalPriceDot[];
  markers: ChartLineFractalMarker[];
  wing: number;
  upCount: number;
  downCount: number;
  lastUp: number;
  lastDown: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineFractalLayoutOptions {
  data: readonly ChartLineFractalPoint[];
  wing?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineFractalProps {
  data: readonly ChartLineFractalPoint[];
  wing?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerSize?: number;
  priceColor?: string;
  upColor?: string;
  downColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFractals?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineFractalPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineFractalFinitePoints(
  points: readonly ChartLineFractalPoint[] | null | undefined,
): ChartLineFractalPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineFractalPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a fractal wing to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineFractalWing(
  wing: number,
  fallback: number,
): number {
  if (!isFiniteNumber(wing)) return fallback;
  const w = Math.floor(wing);
  return w < 1 ? fallback : w;
}

/**
 * Williams Fractal detection on a single price series. A fractal is a
 * swing pivot: an `up` fractal is a bar whose value strictly exceeds
 * the values of the `wing` bars on each side (a local swing high), a
 * `down` fractal is a bar strictly below the `wing` bars on each side
 * (a swing low). The classic Williams fractal uses `wing = 2` (a
 * 5-bar window). Comparisons are strict, so a tie with any neighbour
 * disqualifies the bar. Because a fractal needs `wing` bars of
 * confirmation on both sides, the first `wing` and last `wing` bars
 * are always null. Returns an array parallel to `values` carrying
 * `'up'` / `'down'` / `null` per bar.
 */
export function computeLineFractals(
  values: readonly number[] | null | undefined,
  wing: number,
): (ChartLineFractalType | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const w = wing < 1 ? 1 : Math.floor(wing);
  const out: (ChartLineFractalType | null)[] = new Array(n).fill(null);
  if (n < 2 * w + 1) return out;
  for (let i = w; i < n - w; i += 1) {
    const v = values[i]!;
    let isUp = true;
    let isDown = true;
    for (let k = 1; k <= w; k += 1) {
      const left = values[i - k]!;
      const right = values[i + k]!;
      if (!(v > left) || !(v > right)) isUp = false;
      if (!(v < left) || !(v < right)) isDown = false;
    }
    if (isUp) out[i] = 'up';
    else if (isDown) out[i] = 'down';
  }
  return out;
}

export function runLineFractals(
  points: readonly ChartLineFractalPoint[] | null | undefined,
  options?: { wing?: number },
): ChartLineFractalRun {
  const finite = getLineFractalFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const wing = normalizeLineFractalWing(
    options?.wing ?? DEFAULT_CHART_LINE_FRACTAL_WING,
    DEFAULT_CHART_LINE_FRACTAL_WING,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      wing,
      fractals: [],
      signals: [],
      samples: [],
      upCount: 0,
      downCount: 0,
      lastUp: NaN,
      lastDown: NaN,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const fractals = computeLineFractals(values, wing);

  const samples: ChartLineFractalSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    fractal: fractals[i] ?? null,
  }));

  const signals: ChartLineFractalSignal[] = [];
  let upCount = 0;
  let downCount = 0;
  let lastUp = NaN;
  let lastDown = NaN;
  for (const s of samples) {
    if (s.fractal === 'up') {
      upCount += 1;
      lastUp = s.value;
      signals.push({ index: s.index, x: s.x, value: s.value, type: 'up' });
    } else if (s.fractal === 'down') {
      downCount += 1;
      lastDown = s.value;
      signals.push({ index: s.index, x: s.x, value: s.value, type: 'down' });
    }
  }

  return {
    series = [],
    wing,
    fractals,
    signals,
    samples,
    upCount,
    downCount,
    lastUp,
    lastDown,
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

export function computeLineFractalLayout(
  options: ComputeLineFractalLayoutOptions,
): ChartLineFractalLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_FRACTAL_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineFractalPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineFractals(data, {
    ...(isFiniteNumber(options.wing) ? { wing: options.wing } : {}),
  });
  const empty: ChartLineFractalLayout = {
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
    markers: [],
    wing: run.wing,
    upCount: 0,
    downCount: 0,
    lastUp: NaN,
    lastDown: NaN,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineFractalPanel = {
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

  const priceDots: ChartLineFractalPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    fractal: s.fractal,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const markers: ChartLineFractalMarker[] = run.signals.map((g) => ({
    index: g.index,
    x: g.x,
    value: g.value,
    type: g.type,
    px: projectX(g.x),
    py: projectY(g.value),
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
    priceDots,
    markers,
    wing: run.wing,
    upCount: run.upCount,
    downCount: run.downCount,
    lastUp: run.lastUp,
    lastDown: run.lastDown,
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

export function describeLineFractalChart(
  data: readonly ChartLineFractalPoint[] | null | undefined,
  options?: { wing?: number },
): string {
  const run = runLineFractals(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with Williams Fractal reversal markers (wing ${run.wing}): a Williams fractal is a swing pivot in the price series -- an up fractal is a bar whose value strictly exceeds the ${run.wing} bars on each side (a local swing high marking a potential reversal down), a down fractal is a bar strictly below the ${run.wing} bars on each side (a swing low marking a potential reversal up). Because a fractal needs ${run.wing} bars of confirmation on both sides, the first ${run.wing} and last ${run.wing} bars can never be fractals. The series carries ${run.upCount} up fractals and ${run.downCount} down fractals across ${run.samples.length} bars.`;
}

const FRACTAL_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

function markerPolygon(
  marker: ChartLineFractalMarker,
  markerSize: number,
): string {
  const gap = 4;
  const ms = markerSize;
  if (marker.type === 'up') {
    const base = marker.py - gap;
    return `${marker.px},${base - ms} ${marker.px - ms},${base} ${marker.px + ms},${base}`;
  }
  const base = marker.py + gap;
  return `${marker.px},${base + ms} ${marker.px - ms},${base} ${marker.px + ms},${base}`;
}

export const ChartLineFractal = forwardRef<
  HTMLDivElement,
  ChartLineFractalProps
>(function ChartLineFractal(
  props: ChartLineFractalProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    wing,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_FRACTAL_WIDTH,
    height = DEFAULT_CHART_LINE_FRACTAL_HEIGHT,
    padding = DEFAULT_CHART_LINE_FRACTAL_PADDING,
    tickCount = DEFAULT_CHART_LINE_FRACTAL_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_FRACTAL_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_FRACTAL_DOT_RADIUS,
    markerSize = DEFAULT_CHART_LINE_FRACTAL_MARKER_SIZE,
    priceColor = DEFAULT_CHART_LINE_FRACTAL_PRICE_COLOR,
    upColor = DEFAULT_CHART_LINE_FRACTAL_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_FRACTAL_DOWN_COLOR,
    gridColor = DEFAULT_CHART_LINE_FRACTAL_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_FRACTAL_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showFractals = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with Williams Fractal reversal markers',
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
      computeLineFractalLayout({
        data,
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(wing) ? { wing } : {}),
      }),
    [data, width, height, padding, tickCount, wing],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineFractalChart(data, {
        ...(isFiniteNumber(wing) ? { wing } : {}),
      }),
    [ariaDescription, data, wing],
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
        data-section="chart-line-fractal"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-fractal-aria-desc"
          style={FRACTAL_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const cp = layout.panel;
  const priceVisible = !hiddenSet.has('price');
  const upVisible = showFractals && !hiddenSet.has('up');
  const downVisible = showFractals && !hiddenSet.has('down');

  const visibleMarkers = layout.markers.filter((m) =>
    m.type === 'up' ? upVisible : downVisible,
  );

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'up', label: 'Up fractal', color: upColor },
    { id: 'down', label: 'Down fractal', color: downColor },
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
      data-section="chart-line-fractal"
      data-empty="false"
      data-wing={layout.wing}
      data-up-count={layout.upCount}
      data-down-count={layout.downCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-fractal-aria-desc"
        style={FRACTAL_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-fractal-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-fractal-badge"
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
              data-section="chart-line-fractal-badge-icon"
              aria-hidden="true"
              style={{ color: upColor }}
            >
              FRACTAL
            </span>
            <span data-section="chart-line-fractal-badge-wing">
              w={layout.wing}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-fractal-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-fractal-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => (
                <line
                  key={`gy-${i}`}
                  data-section="chart-line-fractal-grid-line"
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
              data-section="chart-line-fractal-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-fractal-axis"
                data-axis="x"
                x1={cp.x}
                y1={cp.y + cp.height}
                x2={cp.x + cp.width}
                y2={cp.y + cp.height}
              />
              <line
                data-section="chart-line-fractal-axis"
                data-axis="y"
                x1={cp.x}
                y1={cp.y}
                x2={cp.x}
                y2={cp.y + cp.height}
              />
              {layout.yTicks.map((t, i) => (
                <g
                  key={`yt-${i}`}
                  data-section="chart-line-fractal-tick"
                  data-axis="y"
                >
                  <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                  <text
                    data-section="chart-line-fractal-tick-label"
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
                  data-section="chart-line-fractal-tick"
                  data-axis="x"
                >
                  <line
                    x1={t.px}
                    x2={t.px}
                    y1={cp.y + cp.height}
                    y2={cp.y + cp.height + 4}
                  />
                  <text
                    data-section="chart-line-fractal-tick-label"
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
              data-section="chart-line-fractal-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-fractal-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-fractal-dot"
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

          {showFractals ? (
            <g data-section="chart-line-fractal-markers">
              {visibleMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                const color = m.type === 'up' ? upColor : downColor;
                return (
                  <polygon
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${m.type === 'up' ? 'Up' : 'Down'} fractal at x ${formatX(m.x)}: ${formatValue(m.value)}`}
                    data-section="chart-line-fractal-marker"
                    data-point-index={m.index}
                    data-fractal-type={m.type}
                    data-value={m.value}
                    points={markerPolygon(m, isHover ? markerSize + 2 : markerSize)}
                    fill={color}
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
                  data-section="chart-line-fractal-tooltip"
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
                  <div data-section="chart-line-fractal-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-fractal-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-fractal-tooltip-fractal">
                    fractal: {d.fractal ?? 'none'}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-fractal-legend"
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
                data-section="chart-line-fractal-legend-item"
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
                  data-section="chart-line-fractal-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-fractal-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-fractal-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.upCount} up, {layout.downCount} down
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineFractal.displayName = 'ChartLineFractal';
