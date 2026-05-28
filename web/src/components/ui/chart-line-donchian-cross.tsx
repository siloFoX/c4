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
 * ChartLineDonchianCross -- pure-SVG single-panel chart overlaying
 * the Donchian channel on a price line, with markers at every event
 * where the close newly breaks above the upper band or below the
 * lower band:
 *
 *   upper[i] = max(high[i - length .. i - 1])
 *   lower[i] = min(low[i  - length .. i - 1])
 *   upperCross = curr close > curr upper  AND  prev close <= prev upper
 *   lowerCross = curr close < curr lower  AND  prev close >= prev lower
 *
 * The lookback window deliberately excludes the current bar so that
 * a fresh new high in `close[i]` can register as an "above the
 * band" event. The strict-inequality + prev-state guard ensures the
 * cross fires only on the bar that newly enters the breakout zone
 * (not every subsequent bar inside it).
 *
 * Bit-exact anchors:
 * - **CONST high = low = close = K**: `upper = lower = K`. `close >
 *   upper` and `close < lower` both fail (equal), so
 *   `upperCrossCount = lowerCrossCount = 0`.
 * - **LINEAR UP high = low = close = i + 1**: `upper[i] = i` and
 *   `close[i] = i + 1`, so `close > upper` is true for every
 *   post-warmup bar; but `close[i-1] > upper[i-1]` was also true, so
 *   no NEW crosses fire. Zero crosses.
 * - **LINEAR DOWN high = low = close = N - i**: symmetric -> zero
 *   crosses.
 * - **STEP close = K1 for i < N, K2 for i >= N** (`K1 < K2`,
 *   `N >= length`): for `i < N` close == upper, so no cross. At
 *   `i = N`, `upper = K1` (max of K1's), `close = K2 > K1` -> new
 *   cross. `i = N + 1` already has `upper = K2` (window includes
 *   the K2 at i = N), so `close = K2 > upper = K2` fails -> no
 *   second cross. Exactly one upper-cross at `i = N`. Symmetric for
 *   `K1 > K2` -> one lower-cross.
 */

export interface ChartLineDonchianCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineDonchianCrossRelation =
  | 'above'
  | 'below'
  | 'inside'
  | 'none';

export type ChartLineDonchianCrossCross = 'up' | 'down' | null;

export type ChartLineDonchianCrossSeriesId = 'price' | 'upper' | 'lower';

export interface ChartLineDonchianCrossSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  upper: number | null;
  lower: number | null;
  relation: ChartLineDonchianCrossRelation;
  crossed: ChartLineDonchianCrossCross;
}

export interface ChartLineDonchianCrossRun {
  series: ChartLineDonchianCrossPoint[];
  length: number;
  upperValues: Array<number | null>;
  lowerValues: Array<number | null>;
  samples: ChartLineDonchianCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  aboveCount: number;
  belowCount: number;
  insideCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineDonchianCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  kind: 'up' | 'down';
}

export interface ChartLineDonchianCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineDonchianCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineDonchianCrossDot[];
  upperPath: string;
  lowerPath: string;
  markers: ChartLineDonchianCrossMarker[];
  yMin: number;
  yMax: number;
  run: ChartLineDonchianCrossRun;
}

export interface ChartLineDonchianCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineDonchianCrossPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  upperColor?: string;
  lowerColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showUpper?: boolean;
  showLower?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineDonchianCrossSeriesId[];
  defaultHiddenSeries?: ChartLineDonchianCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineDonchianCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineDonchianCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_DONCHIAN_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_DONCHIAN_CROSS_HEIGHT = 360;
export const DEFAULT_CHART_LINE_DONCHIAN_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_DONCHIAN_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DONCHIAN_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DONCHIAN_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DONCHIAN_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_DONCHIAN_CROSS_LENGTH = 20;
export const DEFAULT_CHART_LINE_DONCHIAN_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_DONCHIAN_CROSS_UPPER_COLOR = '#06b6d4';
export const DEFAULT_CHART_LINE_DONCHIAN_CROSS_LOWER_COLOR = '#0e7490';
export const DEFAULT_CHART_LINE_DONCHIAN_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DONCHIAN_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DONCHIAN_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DONCHIAN_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite OHLC fields. */
export function getLineDonchianCrossFinitePoints(
  data: readonly ChartLineDonchianCrossPoint[] | null | undefined,
): ChartLineDonchianCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineDonchianCrossPoint[] = [];
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

/** Coerce a positive integer length (>= 2). */
export function normalizeLineDonchianCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Rolling max excluding current bar: window = [i - length, i - 1]. */
export function applyLineDonchianCrossRollingMax(
  values: readonly number[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length) {
      out.push(null);
      continue;
    }
    let hi = -Infinity;
    let ok = true;
    for (let j = 1; j <= length; j += 1) {
      const v = values[i - j];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      if (v > hi) hi = v;
    }
    out.push(ok && Number.isFinite(hi) ? posZero(hi) : null);
  }
  return out;
}

/** Rolling min excluding current bar. */
export function applyLineDonchianCrossRollingMin(
  values: readonly number[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length) {
      out.push(null);
      continue;
    }
    let lo = Infinity;
    let ok = true;
    for (let j = 1; j <= length; j += 1) {
      const v = values[i - j];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      if (v < lo) lo = v;
    }
    out.push(ok && Number.isFinite(lo) ? posZero(lo) : null);
  }
  return out;
}

export interface LineDonchianCrossChannels {
  upper: Array<number | null>;
  lower: Array<number | null>;
}

export function computeLineDonchianCross(
  series: readonly ChartLineDonchianCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineDonchianCrossChannels {
  const cleaned = getLineDonchianCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { upper: [], lower: [] };
  }
  const length = normalizeLineDonchianCrossLength(
    options.length,
    DEFAULT_CHART_LINE_DONCHIAN_CROSS_LENGTH,
  );
  const highs = cleaned.map((p) => p.high);
  const lows = cleaned.map((p) => p.low);
  return {
    upper: applyLineDonchianCrossRollingMax(highs, length),
    lower: applyLineDonchianCrossRollingMin(lows, length),
  };
}

export function classifyLineDonchianCrossRelation(
  close: number,
  upper: number | null,
  lower: number | null,
): ChartLineDonchianCrossRelation {
  if (upper == null || lower == null) return 'none';
  if (close > upper) return 'above';
  if (close < lower) return 'below';
  return 'inside';
}

export function detectLineDonchianCrossCrosses(
  closes: readonly number[],
  uppers: readonly (number | null)[],
  lowers: readonly (number | null)[],
): ChartLineDonchianCrossCross[] {
  const out: ChartLineDonchianCrossCross[] = [];
  let prevClose: number | null = null;
  let prevUpper: number | null = null;
  let prevLower: number | null = null;
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i]!;
    const u = uppers[i] ?? null;
    const l = lowers[i] ?? null;
    if (u == null || l == null) {
      out.push(null);
      prevClose = null;
      prevUpper = null;
      prevLower = null;
      continue;
    }
    if (prevClose == null || prevUpper == null || prevLower == null) {
      out.push(null);
      prevClose = c;
      prevUpper = u;
      prevLower = l;
      continue;
    }
    if (c > u && prevClose <= prevUpper) {
      out.push('up');
    } else if (c < l && prevClose >= prevLower) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevClose = c;
    prevUpper = u;
    prevLower = l;
  }
  return out;
}

export function runLineDonchianCross(
  data: ChartLineDonchianCrossPoint[],
  options: { length?: number } = {},
): ChartLineDonchianCrossRun {
  const cleaned = getLineDonchianCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineDonchianCrossLength(
    options.length,
    DEFAULT_CHART_LINE_DONCHIAN_CROSS_LENGTH,
  );

  const channels = computeLineDonchianCross(series, { length });
  const closes = series.map((p) => p.close);
  const crosses = detectLineDonchianCrossCrosses(
    closes,
    channels.upper,
    channels.lower,
  );

  const samples: ChartLineDonchianCrossSample[] = series.map((p, i) => {
    const upper = channels.upper[i] ?? null;
    const lower = channels.lower[i] ?? null;
    const relation = classifyLineDonchianCrossRelation(
      p.close,
      upper,
      lower,
    );
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      upper,
      lower,
      relation,
      crossed,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let aboveCount = 0;
  let belowCount = 0;
  let insideCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.relation === 'above') aboveCount += 1;
    else if (s.relation === 'below') belowCount += 1;
    else if (s.relation === 'inside') insideCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length;

  return {
    series = [],
    length,
    upperValues: channels.upper,
    lowerValues: channels.lower,
    samples,
    upCrossCount,
    downCrossCount,
    aboveCount,
    belowCount,
    insideCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineDonchianCrossLayoutOptions {
  data: ChartLineDonchianCrossPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
}

export function computeLineDonchianCrossLayout(
  opts: ComputeLineDonchianCrossLayoutOptions,
): ChartLineDonchianCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_DONCHIAN_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_DONCHIAN_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_DONCHIAN_CROSS_PADDING;

  const run = runLineDonchianCross(opts.data, {
    length: opts.length ?? undefined,
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
      upperPath: '',
      lowerPath: '',
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
    if (s.upper != null && s.upper > yMax) yMax = s.upper;
    if (s.lower != null && s.lower < yMin) yMin = s.lower;
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
  const priceDots: ChartLineDonchianCrossDot[] = [];
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

  const buildBand = (key: 'upper' | 'lower'): string => {
    let p = '';
    let first = true;
    for (const s of run.samples) {
      const v = s[key];
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = sy(v);
      p += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return p.trim();
  };

  const upperPath = buildBand('upper');
  const lowerPath = buildBand('lower');

  const markers: ChartLineDonchianCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: sy(s.close),
      close: s.close,
      kind: s.crossed,
    });
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
    upperPath,
    lowerPath,
    markers,
    yMin,
    yMax,
    run,
  };
}

export function describeLineDonchianCrossChart(
  data: ChartLineDonchianCrossPoint[],
  options: { length?: number } = {},
): string {
  const cleaned = getLineDonchianCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineDonchianCrossLength(
    options.length,
    DEFAULT_CHART_LINE_DONCHIAN_CROSS_LENGTH,
  );
  return (
    `Donchian Cross chart over ${cleaned.length} bars ` +
    `(length ${length}). Single panel with the close annotated by ` +
    `upper and lower Donchian channel overlays (rolling max-high ` +
    `and min-low over the lookback excluding the current bar) plus ` +
    `markers at every new close-hits-upper or close-hits-lower event.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineDonchianCross = forwardRef<
  HTMLDivElement,
  ChartLineDonchianCrossProps
>(function ChartLineDonchianCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_DONCHIAN_CROSS_LENGTH,
    width = DEFAULT_CHART_LINE_DONCHIAN_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_DONCHIAN_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_DONCHIAN_CROSS_PADDING,
    tickCount = DEFAULT_CHART_LINE_DONCHIAN_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DONCHIAN_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DONCHIAN_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_DONCHIAN_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DONCHIAN_CROSS_PRICE_COLOR,
    upperColor = DEFAULT_CHART_LINE_DONCHIAN_CROSS_UPPER_COLOR,
    lowerColor = DEFAULT_CHART_LINE_DONCHIAN_CROSS_LOWER_COLOR,
    bullishColor = DEFAULT_CHART_LINE_DONCHIAN_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_DONCHIAN_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_DONCHIAN_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_DONCHIAN_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showUpper = true,
    showLower = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onCrossClick,
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
    () => getLineDonchianCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineDonchianCrossLayout({
        data: cleaned,
        length,
        width,
        height,
        padding,
      }),
    [cleaned, length, width, height, padding],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineDonchianCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineDonchianCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineDonchianCrossSeriesId,
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
        data-section="chart-line-donchian-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineDonchianCrossChart(cleaned, { length });

  const showPrice = !hidden.has('price');
  const showUpperLine = !hidden.has('upper') && showUpper;
  const showLowerLine = !hidden.has('lower') && showLower;

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
      aria-label={ariaLabel ?? 'Donchian Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-donchian-cross"
      data-length={length}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-donchian-cross-title"
      >
        {ariaLabel ?? 'Donchian Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-donchian-cross-aria-desc"
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
        data-section="chart-line-donchian-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-donchian-cross-grid">
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
                  data-section="chart-line-donchian-cross-grid-line"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-donchian-cross-axes">
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
                  data-section="chart-line-donchian-cross-tick"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showUpperLine ? (
          <path
            d={layout.upperPath}
            stroke={upperColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-donchian-cross-upper"
          />
        ) : null}

        {showLowerLine ? (
          <path
            d={layout.lowerPath}
            stroke={lowerColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-donchian-cross-lower"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-donchian-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-donchian-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-donchian-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-donchian-cross-markers">
            {layout.markers.map((m) => (
              <circle
                key={`marker-${m.index}-${m.kind}`}
                cx={m.cx}
                cy={m.cy}
                r={markerRadius}
                fill={m.kind === 'up' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onCrossClick?.({ point: sample });
                }}
                data-section="chart-line-donchian-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-donchian-cross-hover-targets">
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
                data-section="chart-line-donchian-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.innerTop + 8})`}
                data-section="chart-line-donchian-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={180}
                  height={122}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-cross-tooltip-high"
                >
                  high {formatPrice(tooltipSample.high)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-cross-tooltip-low"
                >
                  low {formatPrice(tooltipSample.low)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-cross-tooltip-upper"
                >
                  upper{' '}
                  {tooltipSample.upper == null
                    ? '--'
                    : formatPrice(tooltipSample.upper)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-cross-tooltip-lower"
                >
                  lower{' '}
                  {tooltipSample.lower == null
                    ? '--'
                    : formatPrice(tooltipSample.lower)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-donchian-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | up {layout.run.upCrossCount} | down{' '}
          {layout.run.downCrossCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-donchian-cross-legend"
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
              { id: 'upper' as const, color: upperColor, label: 'upper' },
              { id: 'lower' as const, color: lowerColor, label: 'lower' },
            ] satisfies Array<{
              id: ChartLineDonchianCrossSeriesId;
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

ChartLineDonchianCross.displayName = 'ChartLineDonchianCross';
