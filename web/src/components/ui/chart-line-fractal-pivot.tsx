import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
} from 'react';

/**
 * ChartLineFractalPivot -- pure-SVG single-panel chart that marks
 * confirmed Bill Williams fractal pivots on a price line. An n-bar
 * fractal is a center bar whose high is strictly greater than every
 * neighbour within `n` bars (upper fractal) or whose low is strictly
 * less than every neighbour within `n` bars (lower fractal).
 *
 *   isUpperFractal[i] = high[i] > high[i +/- 1 .. i +/- n]
 *   isLowerFractal[i] = low[i]  < low [i +/- 1 .. i +/- n]
 *
 * A fractal at index `i` is "confirmed" exactly `n` bars later (at
 * index `i + n`) because the right-side neighbours must be observed
 * before the strict-max / strict-min test can be evaluated. The
 * primitive renders one scatter marker per confirmed pivot at the
 * bar's high (upper) or low (lower).
 *
 * Bit-exact anchors:
 * - **CONST high = low = K**: the strict-max / strict-min tests fail
 *   on flat sequences, so `isUpperFractal = isLowerFractal = false`
 *   everywhere.
 * - **LINEAR UP / LINEAR DOWN**: monotonic series also yield no
 *   fractals.
 * - **SAWTOOTH with peaks at fixed `peakK` and troughs at fixed
 *   `troughL`, period 4**: every peak is a strict upper fractal, every
 *   trough a strict lower fractal. The pivot count is deterministic:
 *   for `N` bars and period-4 sawtooth with the default lookback 2,
 *   upper pivots fire at indices `{2, 6, 10, ...}` and lower pivots
 *   at indices `{4, 8, 12, ...}` (index 0 cannot fire because it has
 *   no left neighbour to test against).
 */

export interface ChartLineFractalPivotPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineFractalPivotKind = 'upper' | 'lower' | 'none';

export type ChartLineFractalPivotSeriesId =
  | 'price'
  | 'upper-pivots'
  | 'lower-pivots';

export interface ChartLineFractalPivotSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  isUpperFractal: boolean;
  isLowerFractal: boolean;
  pivotKind: ChartLineFractalPivotKind;
  pivotValue: number | null;
}

export interface ChartLineFractalPivotRun {
  series: ChartLineFractalPivotPoint[];
  fractalLookback: number;
  upperFractalValues: Array<number | null>;
  lowerFractalValues: Array<number | null>;
  samples: ChartLineFractalPivotSample[];
  upperPivotCount: number;
  lowerPivotCount: number;
  ok: boolean;
}

export interface ChartLineFractalPivotMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
  kind: 'upper' | 'lower';
}

export interface ChartLineFractalPivotDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineFractalPivotLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineFractalPivotDot[];
  markers: ChartLineFractalPivotMarker[];
  yMin: number;
  yMax: number;
  run: ChartLineFractalPivotRun;
}

export interface ChartLineFractalPivotProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineFractalPivotPoint[];
  fractalLookback?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  upperPivotColor?: string;
  lowerPivotColor?: string;
  axisColor?: string;
  gridColor?: string;
  labelColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showUpperPivots?: boolean;
  showLowerPivots?: boolean;
  showLabels?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineFractalPivotSeriesId[];
  defaultHiddenSeries?: ChartLineFractalPivotSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineFractalPivotSeriesId;
    hidden: boolean;
  }) => void;
  onPivotClick?: (detail: { point: ChartLineFractalPivotSample }) => void;
  formatPrice?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_FRACTAL_PIVOT_WIDTH = 720;
export const DEFAULT_CHART_LINE_FRACTAL_PIVOT_HEIGHT = 360;
export const DEFAULT_CHART_LINE_FRACTAL_PIVOT_PADDING = 44;
export const DEFAULT_CHART_LINE_FRACTAL_PIVOT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FRACTAL_PIVOT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_FRACTAL_PIVOT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FRACTAL_PIVOT_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_FRACTAL_PIVOT_FRACTAL_LOOKBACK = 2;
export const DEFAULT_CHART_LINE_FRACTAL_PIVOT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_FRACTAL_PIVOT_UPPER_PIVOT_COLOR = '#ef4444';
export const DEFAULT_CHART_LINE_FRACTAL_PIVOT_LOWER_PIVOT_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_FRACTAL_PIVOT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_FRACTAL_PIVOT_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_FRACTAL_PIVOT_LABEL_COLOR = '#0f172a';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC fields. */
export function getLineFractalPivotFinitePoints(
  data: readonly ChartLineFractalPivotPoint[] | null | undefined,
): ChartLineFractalPivotPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineFractalPivotPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
      });
    }
  }
  return out;
}

/** Coerce a positive integer fractal lookback (>= 1). */
export function normalizeLineFractalPivotFractalLookback(
  lookback: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(lookback) && lookback >= 1) return Math.floor(lookback);
  return fallback;
}

/** Strict upper fractal: high[i] > all neighbours in i +/- lookback. */
export function detectLineFractalPivotUpperFractals(
  highs: readonly number[],
  lookback: number,
): boolean[] {
  const n = highs.length;
  const out: boolean[] = new Array(n).fill(false);
  for (let i = lookback; i < n - lookback; i += 1) {
    const center = highs[i]!;
    let isMax = true;
    for (let j = 1; j <= lookback; j += 1) {
      if (highs[i - j]! >= center || highs[i + j]! >= center) {
        isMax = false;
        break;
      }
    }
    if (isMax) out[i] = true;
  }
  return out;
}

/** Strict lower fractal: low[i] < all neighbours in i +/- lookback. */
export function detectLineFractalPivotLowerFractals(
  lows: readonly number[],
  lookback: number,
): boolean[] {
  const n = lows.length;
  const out: boolean[] = new Array(n).fill(false);
  for (let i = lookback; i < n - lookback; i += 1) {
    const center = lows[i]!;
    let isMin = true;
    for (let j = 1; j <= lookback; j += 1) {
      if (lows[i - j]! <= center || lows[i + j]! <= center) {
        isMin = false;
        break;
      }
    }
    if (isMin) out[i] = true;
  }
  return out;
}

export interface LineFractalPivotChannels {
  upperFractal: boolean[];
  lowerFractal: boolean[];
}

export function computeLineFractalPivot(
  series: readonly ChartLineFractalPivotPoint[] | null | undefined,
  options: { fractalLookback?: number } = {},
): LineFractalPivotChannels {
  const cleaned = getLineFractalPivotFinitePoints(series);
  if (cleaned.length === 0) {
    return { upperFractal: [], lowerFractal: [] };
  }
  const fractalLookback = normalizeLineFractalPivotFractalLookback(
    options.fractalLookback,
    DEFAULT_CHART_LINE_FRACTAL_PIVOT_FRACTAL_LOOKBACK,
  );
  const highs = cleaned.map((p) => p.high);
  const lows = cleaned.map((p) => p.low);
  return {
    upperFractal: detectLineFractalPivotUpperFractals(
      highs,
      fractalLookback,
    ),
    lowerFractal: detectLineFractalPivotLowerFractals(
      lows,
      fractalLookback,
    ),
  };
}

export function classifyLineFractalPivotKind(
  isUpper: boolean,
  isLower: boolean,
): ChartLineFractalPivotKind {
  if (isUpper) return 'upper';
  if (isLower) return 'lower';
  return 'none';
}

export function runLineFractalPivot(
  data: ChartLineFractalPivotPoint[],
  options: { fractalLookback?: number } = {},
): ChartLineFractalPivotRun {
  const cleaned = getLineFractalPivotFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fractalLookback = normalizeLineFractalPivotFractalLookback(
    options.fractalLookback,
    DEFAULT_CHART_LINE_FRACTAL_PIVOT_FRACTAL_LOOKBACK,
  );

  const channels = computeLineFractalPivot(series, { fractalLookback });

  const upperFractalValues: Array<number | null> = series.map((p, i) =>
    channels.upperFractal[i] ? p.high : null,
  );
  const lowerFractalValues: Array<number | null> = series.map((p, i) =>
    channels.lowerFractal[i] ? p.low : null,
  );

  const samples: ChartLineFractalPivotSample[] = series.map((p, i) => {
    const isUpperFractal = !!channels.upperFractal[i];
    const isLowerFractal = !!channels.lowerFractal[i];
    const pivotKind = classifyLineFractalPivotKind(
      isUpperFractal,
      isLowerFractal,
    );
    const pivotValue = isUpperFractal
      ? p.high
      : isLowerFractal
        ? p.low
        : null;
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      isUpperFractal,
      isLowerFractal,
      pivotKind,
      pivotValue,
    };
  });

  let upperPivotCount = 0;
  let lowerPivotCount = 0;
  for (const s of samples) {
    if (s.isUpperFractal) upperPivotCount += 1;
    if (s.isLowerFractal) lowerPivotCount += 1;
  }

  const ok = series.length >= 2 * fractalLookback + 1;

  return {
    series,
    fractalLookback,
    upperFractalValues,
    lowerFractalValues,
    samples,
    upperPivotCount,
    lowerPivotCount,
    ok,
  };
}

export interface ComputeLineFractalPivotLayoutOptions {
  data: ChartLineFractalPivotPoint[];
  fractalLookback?: number;
  width?: number;
  height?: number;
  padding?: number;
}

export function computeLineFractalPivotLayout(
  opts: ComputeLineFractalPivotLayoutOptions,
): ChartLineFractalPivotLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_FRACTAL_PIVOT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_FRACTAL_PIVOT_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_FRACTAL_PIVOT_PADDING;

  const run = runLineFractalPivot(opts.data, {
    fractalLookback: opts.fractalLookback ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      innerLeft,
      innerRight,
      innerTop,
      innerBottom,
      pricePath: '',
      priceDots: [],
      markers: [],
      yMin: 0,
      yMax: 1,
      run,
    };
  }

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const s of run.samples) {
    if (s.low < yMin) yMin = s.low;
    if (s.high > yMax) yMax = s.high;
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0;
    yMax = 1;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const sy = (y: number): number =>
    innerBottom - ((y - yMin) / (yMax - yMin)) * (innerBottom - innerTop);

  let pricePath = '';
  const priceDots: ChartLineFractalPivotDot[] = [];
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = sy(s.close);
    pricePath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    priceDots.push({
      index: s.index,
      x: s.x,
      cx,
      cy,
      close: s.close,
    });
  }

  const markers: ChartLineFractalPivotMarker[] = [];
  for (const s of run.samples) {
    if (s.isUpperFractal) {
      markers.push({
        index: s.index,
        x: s.x,
        cx: sx(s.x),
        cy: sy(s.high),
        value: s.high,
        kind: 'upper',
      });
    }
    if (s.isLowerFractal) {
      markers.push({
        index: s.index,
        x: s.x,
        cx: sx(s.x),
        cy: sy(s.low),
        value: s.low,
        kind: 'lower',
      });
    }
  }

  return {
    ok: true,
    width,
    height,
    padding,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    pricePath: pricePath.trim(),
    priceDots,
    markers,
    yMin,
    yMax,
    run,
  };
}

export function describeLineFractalPivotChart(
  data: ChartLineFractalPivotPoint[],
  options: { fractalLookback?: number } = {},
): string {
  const cleaned = getLineFractalPivotFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fractalLookback = normalizeLineFractalPivotFractalLookback(
    options.fractalLookback,
    DEFAULT_CHART_LINE_FRACTAL_PIVOT_FRACTAL_LOOKBACK,
  );
  return (
    `Fractal Pivot chart over ${cleaned.length} bars ` +
    `(fractalLookback ${fractalLookback}). Single panel with the ` +
    `close line annotated by markers at every confirmed Bill ` +
    `Williams n-bar swing high and swing low fractal.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineFractalPivot = forwardRef<
  HTMLDivElement,
  ChartLineFractalPivotProps
>(function ChartLineFractalPivot(props, ref): ReactNode {
  const {
    data,
    fractalLookback = DEFAULT_CHART_LINE_FRACTAL_PIVOT_FRACTAL_LOOKBACK,
    width = DEFAULT_CHART_LINE_FRACTAL_PIVOT_WIDTH,
    height = DEFAULT_CHART_LINE_FRACTAL_PIVOT_HEIGHT,
    padding = DEFAULT_CHART_LINE_FRACTAL_PIVOT_PADDING,
    tickCount = DEFAULT_CHART_LINE_FRACTAL_PIVOT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_FRACTAL_PIVOT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_FRACTAL_PIVOT_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_FRACTAL_PIVOT_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_FRACTAL_PIVOT_PRICE_COLOR,
    upperPivotColor = DEFAULT_CHART_LINE_FRACTAL_PIVOT_UPPER_PIVOT_COLOR,
    lowerPivotColor = DEFAULT_CHART_LINE_FRACTAL_PIVOT_LOWER_PIVOT_COLOR,
    axisColor = DEFAULT_CHART_LINE_FRACTAL_PIVOT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_FRACTAL_PIVOT_GRID_COLOR,
    labelColor = DEFAULT_CHART_LINE_FRACTAL_PIVOT_LABEL_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showUpperPivots = true,
    showLowerPivots = true,
    showLabels = false,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPivotClick,
    formatPrice = defaultPriceFormatter,
    formatX = defaultXFormatter,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...rest
  } = props;

  const reactId = useId();
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  const cleaned = useMemo(
    () => getLineFractalPivotFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineFractalPivotLayout({
        data: cleaned,
        fractalLookback,
        width,
        height,
        padding,
      }),
    [cleaned, fractalLookback, width, height, padding],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineFractalPivotSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineFractalPivotSeriesId,
  ) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineFractalPivotSeriesId,
  ): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLegendClick(seriesId);
    }
  };

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (cleaned.length === 0) {
    return (
      <div
        ref={ref}
        className={className}
        style={style}
        data-section="chart-line-fractal-pivot-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineFractalPivotChart(cleaned, { fractalLookback });

  const showPrice = !hidden.has('price');
  const showUpperMarkers =
    !hidden.has('upper-pivots') && showUpperPivots;
  const showLowerMarkers =
    !hidden.has('lower-pivots') && showLowerPivots;

  const tickValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickValues.push(
      layout.yMin + ((layout.yMax - layout.yMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Fractal Pivot chart'}
      aria-describedby={descId}
      data-section="chart-line-fractal-pivot"
      data-fractal-lookback={fractalLookback}
      data-total-points={cleaned.length}
      data-upper-pivots={layout.run.upperPivotCount}
      data-lower-pivots={layout.run.lowerPivotCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-fractal-pivot-title"
      >
        {ariaLabel ?? 'Fractal Pivot chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-fractal-pivot-aria-desc"
      >
        {desc}
      </span>
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={0}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={animate ? 'motion-safe:animate-fade-in' : undefined}
        data-section="chart-line-fractal-pivot-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-fractal-pivot-grid">
            {tickValues.map((v, i) => {
              const y =
                layout.innerBottom -
                ((v - layout.yMin) / (layout.yMax - layout.yMin)) *
                  (layout.innerBottom - layout.innerTop);
              return (
                <line
                  key={`grid-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-fractal-pivot-grid-line"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-fractal-pivot-axes">
            <line
              x1={layout.innerLeft}
              y1={layout.innerTop}
              x2={layout.innerLeft}
              y2={layout.innerBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.innerBottom}
              x2={layout.innerRight}
              y2={layout.innerBottom}
              stroke={axisColor}
            />
            {tickValues.map((v, i) => {
              const y =
                layout.innerBottom -
                ((v - layout.yMin) / (layout.yMax - layout.yMin)) *
                  (layout.innerBottom - layout.innerTop);
              return (
                <text
                  key={`tick-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-fractal-pivot-tick"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fractal-pivot-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-fractal-pivot-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-fractal-pivot-price-dot"
              />
            ))}
          </g>
        ) : null}

        <g data-section="chart-line-fractal-pivot-markers">
          {layout.markers.map((m) => {
            if (m.kind === 'upper' && !showUpperMarkers) return null;
            if (m.kind === 'lower' && !showLowerMarkers) return null;
            const color =
              m.kind === 'upper' ? upperPivotColor : lowerPivotColor;
            return (
              <g
                key={`marker-${m.index}-${m.kind}`}
                data-section="chart-line-fractal-pivot-marker-group"
                data-kind={m.kind}
              >
                <circle
                  cx={m.cx}
                  cy={m.cy}
                  r={markerRadius}
                  fill={color}
                  role="graphics-symbol"
                  tabIndex={0}
                  onClick={() => {
                    const sample = layout.run.samples[m.index];
                    if (sample) onPivotClick?.({ point: sample });
                  }}
                  data-section="chart-line-fractal-pivot-marker"
                  data-kind={m.kind}
                />
                {showLabels ? (
                  <text
                    x={m.cx}
                    y={
                      m.kind === 'upper'
                        ? m.cy - markerRadius - 4
                        : m.cy + markerRadius + 10
                    }
                    fontSize={10}
                    fill={labelColor}
                    textAnchor="middle"
                    data-section="chart-line-fractal-pivot-label"
                  >
                    {formatPrice(m.value)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>

        {showTooltip ? (
          <g data-section="chart-line-fractal-pivot-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.innerTop}
                width={10}
                height={layout.innerBottom - layout.innerTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-fractal-pivot-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.innerTop + 8})`}
                data-section="chart-line-fractal-pivot-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={170}
                  height={94}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-pivot-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-pivot-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-pivot-tooltip-high"
                >
                  high {formatPrice(tooltipSample.high)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-pivot-tooltip-low"
                >
                  low {formatPrice(tooltipSample.low)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-pivot-tooltip-kind"
                >
                  pivot {tooltipSample.pivotKind}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-pivot-tooltip-value"
                >
                  value{' '}
                  {tooltipSample.pivotValue == null
                    ? '--'
                    : formatPrice(tooltipSample.pivotValue)}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-fractal-pivot-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          lookback {fractalLookback} | up{' '}
          {layout.run.upperPivotCount} | down{' '}
          {layout.run.lowerPivotCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-fractal-pivot-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              { id: 'price' as const, color: priceColor, label: 'close' },
              {
                id: 'upper-pivots' as const,
                color: upperPivotColor,
                label: 'upper pivots',
              },
              {
                id: 'lower-pivots' as const,
                color: lowerPivotColor,
                label: 'lower pivots',
              },
            ] satisfies Array<{
              id: ChartLineFractalPivotSeriesId;
              color: string;
              label: string;
            }>
          ).map(({ id, color, label }) => (
            <button
              key={id}
              type="button"
              data-series-id={id}
              aria-pressed={!hidden.has(id)}
              onClick={() => handleLegendClick(id)}
              onKeyDown={(e) => handleLegendKey(e, id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                fontSize: 11,
                opacity: hidden.has(id) ? 0.4 : 1,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  background: color,
                  borderRadius: 2,
                }}
              />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

ChartLineFractalPivot.displayName = 'ChartLineFractalPivot';
