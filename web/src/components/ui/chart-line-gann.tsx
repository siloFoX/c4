import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_GANN_WIDTH = 560;
export const DEFAULT_CHART_LINE_GANN_HEIGHT = 320;
export const DEFAULT_CHART_LINE_GANN_PADDING = 40;
export const DEFAULT_CHART_LINE_GANN_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_GANN_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_GANN_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_GANN_PIVOT_RADIUS = 5;
export const DEFAULT_CHART_LINE_GANN_PRICE_PER_UNIT = 1;
export const DEFAULT_CHART_LINE_GANN_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_GANN_FAN_COLOR = '#6366f1';
export const DEFAULT_CHART_LINE_GANN_PRIMARY_COLOR = '#d97706';
export const DEFAULT_CHART_LINE_GANN_PIVOT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_GANN_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_GANN_AXIS_COLOR = '#cbd5e1';

export type ChartLineGannDirection = 'up' | 'down';

export type ChartLineGannPosition = 'above' | 'below' | 'on';

/**
 * W.D. Gann's classic price-time ratios for the nine-ray fan. Each
 * entry is `priceUnits x timeUnits`; the central `1x1` is the
 * 45-degree reference line.
 */
export const GANN_RATIOS: ReadonlyArray<{
  id: string;
  label: string;
  priceUnits: number;
  timeUnits: number;
}> = [
  { id: '1x8', label: '1x8', priceUnits: 1, timeUnits: 8 },
  { id: '1x4', label: '1x4', priceUnits: 1, timeUnits: 4 },
  { id: '1x3', label: '1x3', priceUnits: 1, timeUnits: 3 },
  { id: '1x2', label: '1x2', priceUnits: 1, timeUnits: 2 },
  { id: '1x1', label: '1x1', priceUnits: 1, timeUnits: 1 },
  { id: '2x1', label: '2x1', priceUnits: 2, timeUnits: 1 },
  { id: '3x1', label: '3x1', priceUnits: 3, timeUnits: 1 },
  { id: '4x1', label: '4x1', priceUnits: 4, timeUnits: 1 },
  { id: '8x1', label: '8x1', priceUnits: 8, timeUnits: 1 },
];

export interface ChartLineGannPoint {
  x: number;
  value: number;
}

export interface ChartLineGannRay {
  id: string;
  label: string;
  priceUnits: number;
  timeUnits: number;
  ratio: number;
  slope: number;
  isPrimary: boolean;
}

export interface ChartLineGannSample {
  index: number;
  x: number;
  value: number;
  position: ChartLineGannPosition;
}

export interface ChartLineGannRun {
  series: ChartLineGannPoint[];
  pivotIndex: number;
  pivot: ChartLineGannPoint | null;
  pricePerUnit: number;
  direction: ChartLineGannDirection;
  rays: ChartLineGannRay[];
  samples: ChartLineGannSample[];
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineGannPriceDot {
  index: number;
  x: number;
  value: number;
  position: ChartLineGannPosition;
  px: number;
  py: number;
}

export interface ChartLineGannRayLine {
  id: string;
  label: string;
  ratio: number;
  slope: number;
  isPrimary: boolean;
  pivotPx: number;
  pivotPy: number;
  endPx: number;
  endPy: number;
  endValue: number;
}

export interface ChartLineGannPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineGannLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineGannPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  priceDots: ChartLineGannPriceDot[];
  rayLines: ChartLineGannRayLine[];
  pivotPx: number;
  pivotPy: number;
  pivotIndex: number;
  pivotValue: number;
  pricePerUnit: number;
  direction: ChartLineGannDirection;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineGannLayoutOptions {
  data: readonly ChartLineGannPoint[];
  pivotIndex?: number;
  pricePerUnit?: number;
  direction?: ChartLineGannDirection;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineGannProps {
  data: readonly ChartLineGannPoint[];
  pivotIndex?: number;
  pricePerUnit?: number;
  direction?: ChartLineGannDirection;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  pivotRadius?: number;
  priceColor?: string;
  fanColor?: string;
  primaryColor?: string;
  pivotColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFan?: boolean;
  showPivot?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineGannPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function noNegativeZero(v: number): number {
  return v === 0 ? 0 : v;
}

export function getLineGannFinitePoints(
  points: readonly ChartLineGannPoint[] | null | undefined,
): ChartLineGannPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineGannPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Clamp a pivot index to a valid position inside a series of `count`
 * points. A non-finite or negative index falls back to 0; an index
 * past the end clamps to the last point; a fractional index floors.
 */
export function normalizeLineGannPivotIndex(
  index: number,
  count: number,
): number {
  if (count < 1) return 0;
  if (!isFiniteNumber(index)) return 0;
  const i = Math.floor(index);
  if (i < 0) return 0;
  if (i > count - 1) return count - 1;
  return i;
}

function normalizePricePerUnit(value: number | undefined): number {
  if (isFiniteNumber(value) && value > 0) return value;
  return DEFAULT_CHART_LINE_GANN_PRICE_PER_UNIT;
}

/**
 * The nine Gann fan rays for a given price-per-time scale and fan
 * direction. Each ray's `slope` is `ratio * pricePerUnit` (price per
 * one x-unit), signed positive for an up fan and negative for a down
 * fan; `ratio` is `priceUnits / timeUnits`. The `1x1` ray is flagged
 * `isPrimary` -- it is the 45-degree reference of the fan.
 */
export function computeLineGannRays(options?: {
  pricePerUnit?: number;
  direction?: ChartLineGannDirection;
}): ChartLineGannRay[] {
  const pricePerUnit = normalizePricePerUnit(options?.pricePerUnit);
  const direction: ChartLineGannDirection =
    options?.direction === 'down' ? 'down' : 'up';
  const sign = direction === 'down' ? -1 : 1;
  return GANN_RATIOS.map((r) => {
    const ratio = r.priceUnits / r.timeUnits;
    return {
      id: r.id,
      label: r.label,
      priceUnits: r.priceUnits,
      timeUnits: r.timeUnits,
      ratio,
      slope: noNegativeZero(sign * ratio * pricePerUnit),
      isPrimary: r.id === '1x1',
    };
  });
}

function classifyPosition(
  value: number,
  rayValue: number,
): ChartLineGannPosition {
  if (value > rayValue) return 'above';
  if (value < rayValue) return 'below';
  return 'on';
}

export function runLineGann(
  points: readonly ChartLineGannPoint[] | null | undefined,
  options?: {
    pivotIndex?: number;
    pricePerUnit?: number;
    direction?: ChartLineGannDirection;
  },
): ChartLineGannRun {
  const finite = getLineGannFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const pricePerUnit = normalizePricePerUnit(options?.pricePerUnit);
  const direction: ChartLineGannDirection =
    options?.direction === 'down' ? 'down' : 'up';
  const n = series.length;
  const pivotIndex = normalizeLineGannPivotIndex(
    options?.pivotIndex ?? 0,
    n,
  );
  const rays = computeLineGannRays({ pricePerUnit, direction });

  if (n < 2) {
    return {
      series,
      pivotIndex,
      pivot: null,
      pricePerUnit,
      direction,
      rays,
      samples: [],
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const pivot = series[pivotIndex]!;
  const primary = rays.find((r) => r.isPrimary)!;

  const samples: ChartLineGannSample[] = series.map((p, i) => {
    const rayValue = pivot.value + primary.slope * (p.x - pivot.x);
    return {
      index: i,
      x: p.x,
      value: p.value,
      position: classifyPosition(p.value, rayValue),
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series = [],
    pivotIndex,
    pivot,
    pricePerUnit,
    direction,
    rays,
    samples,
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

export function computeLineGannLayout(
  options: ComputeLineGannLayoutOptions,
): ChartLineGannLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_GANN_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineGannPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineGann(data, {
    ...(isFiniteNumber(options.pivotIndex)
      ? { pivotIndex: options.pivotIndex }
      : {}),
    ...(isFiniteNumber(options.pricePerUnit)
      ? { pricePerUnit: options.pricePerUnit }
      : {}),
    ...(options.direction ? { direction: options.direction } : {}),
  });
  const empty: ChartLineGannLayout = {
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
    rayLines: [],
    pivotPx: 0,
    pivotPy: 0,
    pivotIndex: run.pivotIndex,
    pivotValue: NaN,
    pricePerUnit: run.pricePerUnit,
    direction: run.direction,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok || run.pivot === null) return empty;

  const panel: ChartLineGannPanel = {
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

  const priceDots: ChartLineGannPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const pivot = run.pivot;
  const pivotPx = projectX(pivot.x);
  const pivotPy = projectY(pivot.value);

  const rayLines: ChartLineGannRayLine[] = run.rays.map((ray) => {
    const endValue = pivot.value + ray.slope * (xHi - pivot.x);
    return {
      id: ray.id,
      label: ray.label,
      ratio: ray.ratio,
      slope: ray.slope,
      isPrimary: ray.isPrimary,
      pivotPx,
      pivotPy,
      endPx: projectX(xHi),
      endPy: projectY(endValue),
      endValue,
    };
  });

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
    rayLines,
    pivotPx,
    pivotPy,
    pivotIndex: run.pivotIndex,
    pivotValue: pivot.value,
    pricePerUnit: run.pricePerUnit,
    direction: run.direction,
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

export function describeLineGannChart(
  data: readonly ChartLineGannPoint[] | null | undefined,
  options?: {
    pivotIndex?: number;
    pricePerUnit?: number;
    direction?: ChartLineGannDirection;
  },
): string {
  const run = runLineGann(data, options);
  if (!run.ok || run.pivot === null) return 'No data';
  return `Line chart with a Gann fan: nine angled rays are projected from the pivot at x ${defaultFormatValue(run.pivot.x)} (value ${defaultFormatValue(run.pivot.value)}) at W.D. Gann's classic price-time ratios -- 1x8, 1x4, 1x3, 1x2, the central 1x1 (the 45-degree reference line), 2x1, 3x1, 4x1 and 8x1. Each ray rises ${defaultFormatValue(run.pricePerUnit)} price per time unit times its ratio, fanning ${run.direction} from the pivot. The price runs above the 1x1 ray on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} bars.`;
}

const GANN_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

function pivotDiamond(px: number, py: number, r: number): string {
  return `${px},${py - r} ${px + r},${py} ${px},${py + r} ${px - r},${py}`;
}

export const ChartLineGann = forwardRef<HTMLDivElement, ChartLineGannProps>(
  function ChartLineGann(
    props: ChartLineGannProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      pivotIndex,
      pricePerUnit,
      direction,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_GANN_WIDTH,
      height = DEFAULT_CHART_LINE_GANN_HEIGHT,
      padding = DEFAULT_CHART_LINE_GANN_PADDING,
      tickCount = DEFAULT_CHART_LINE_GANN_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_GANN_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_GANN_DOT_RADIUS,
      pivotRadius = DEFAULT_CHART_LINE_GANN_PIVOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_GANN_PRICE_COLOR,
      fanColor = DEFAULT_CHART_LINE_GANN_FAN_COLOR,
      primaryColor = DEFAULT_CHART_LINE_GANN_PRIMARY_COLOR,
      pivotColor = DEFAULT_CHART_LINE_GANN_PIVOT_COLOR,
      gridColor = DEFAULT_CHART_LINE_GANN_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_GANN_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showFan = true,
      showPivot = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Gann fan',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      onPointClick,
      onSeriesToggle,
      style,
    } = props;

    const reactId = useId();
    const descId = `${reactId}-desc`;
    const clipId = `${reactId}-clip`;

    const isControlled = controlledHidden !== undefined;
    const [uncontrolled, setUncontrolled] = useState<Set<string>>(() =>
      normaliseHidden(defaultHiddenSeries),
    );
    const hiddenSet = isControlled
      ? normaliseHidden(controlledHidden)
      : uncontrolled;

    const layout = useMemo(
      () =>
        computeLineGannLayout({
          data,
          width,
          height,
          padding,
          tickCount,
          ...(isFiniteNumber(pivotIndex) ? { pivotIndex } : {}),
          ...(isFiniteNumber(pricePerUnit) ? { pricePerUnit } : {}),
          ...(direction ? { direction } : {}),
        }),
      [data, width, height, padding, tickCount, pivotIndex, pricePerUnit, direction],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineGannChart(data, {
          ...(isFiniteNumber(pivotIndex) ? { pivotIndex } : {}),
          ...(isFiniteNumber(pricePerUnit) ? { pricePerUnit } : {}),
          ...(direction ? { direction } : {}),
        }),
      [ariaDescription, data, pivotIndex, pricePerUnit, direction],
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
          data-section="chart-line-gann"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-gann-aria-desc"
            style={GANN_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const fanVisible = showFan && !hiddenSet.has('fan');
    const pivotVisible = showPivot && !hiddenSet.has('pivot');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'fan', label: 'Gann fan', color: fanColor },
      { id: 'pivot', label: 'Pivot', color: pivotColor },
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
        data-section="chart-line-gann"
        data-empty="false"
        data-pivot-index={layout.pivotIndex}
        data-pivot-value={layout.pivotValue}
        data-price-per-unit={layout.pricePerUnit}
        data-direction={layout.direction}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-gann-aria-desc"
          style={GANN_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-gann-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-gann-badge"
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
                data-section="chart-line-gann-badge-icon"
                aria-hidden="true"
                style={{ color: primaryColor }}
              >
                GANN
              </span>
              <span data-section="chart-line-gann-badge-direction">
                {layout.direction}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-gann-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            <defs>
              <clipPath id={clipId}>
                <rect
                  x={cp.x}
                  y={cp.y}
                  width={cp.width}
                  height={cp.height}
                />
              </clipPath>
            </defs>

            {showGrid ? (
              <g
                data-section="chart-line-gann-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-gann-grid-line"
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
                data-section="chart-line-gann-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-gann-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-gann-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-gann-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-gann-tick-label"
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
                    data-section="chart-line-gann-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-gann-tick-label"
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

            {fanVisible ? (
              <g
                data-section="chart-line-gann-rays"
                clipPath={`url(#${clipId})`}
              >
                {layout.rayLines.map((r) => (
                  <line
                    key={`ray-${r.id}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Gann ${r.label} ray`}
                    data-section="chart-line-gann-ray"
                    data-ray-id={r.id}
                    data-ratio={r.ratio}
                    data-primary={r.isPrimary ? 'true' : 'false'}
                    x1={r.pivotPx}
                    y1={r.pivotPy}
                    x2={r.endPx}
                    y2={r.endPy}
                    stroke={r.isPrimary ? primaryColor : fanColor}
                    strokeWidth={r.isPrimary ? 2 : 1.25}
                    strokeDasharray={r.isPrimary ? undefined : '5 3'}
                    strokeLinecap="round"
                  />
                ))}
              </g>
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-gann-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-gann-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-gann-dot"
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

            {pivotVisible ? (
              <polygon
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Gann fan pivot at value ${formatValue(layout.pivotValue)}`}
                data-section="chart-line-gann-pivot"
                data-pivot-index={layout.pivotIndex}
                points={pivotDiamond(
                  layout.pivotPx,
                  layout.pivotPy,
                  pivotRadius,
                )}
                fill={pivotColor}
                stroke="#ffffff"
                strokeWidth={1.25}
              />
            ) : null}
          </svg>

          {showTooltip && hoverIndex !== null && tooltipPos
            ? (() => {
                const d = layout.priceDots.find((x) => x.index === hoverIndex);
                if (!d) return null;
                return (
                  <div
                    data-section="chart-line-gann-tooltip"
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
                    <div data-section="chart-line-gann-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-gann-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-gann-tooltip-position">
                      vs 1x1: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-gann-legend"
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
                  data-section="chart-line-gann-legend-item"
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
                    data-section="chart-line-gann-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-gann-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-gann-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.aboveCount} above 1x1, {layout.belowCount} below
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineGann.displayName = 'ChartLineGann';
