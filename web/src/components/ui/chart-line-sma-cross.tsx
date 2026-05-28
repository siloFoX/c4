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
 * ChartLineSmaCross -- pure-SVG single-panel chart overlaying a
 * fast SMA and a slow SMA on a price line, with markers at every
 * detected crossover event:
 *
 *   fastSma[i] = mean(close[i - fastLength + 1 .. i])
 *   slowSma[i] = mean(close[i - slowLength + 1 .. i])
 *   up cross   = prev fastSma <= prev slowSma  AND  curr fastSma > curr slowSma
 *   down cross = prev fastSma >= prev slowSma  AND  curr fastSma < curr slowSma
 *
 * Bit-exact anchors:
 * - **CONST close = K**: `fastSma = slowSma = K`, the relation
 *   never strictly flips so `up = down = 0` crosses.
 * - **LINEAR UP close = i + 1**: `fastSma = (i + 1) - (fastLength -
 *   1) / 2`, `slowSma = (i + 1) - (slowLength - 1) / 2`, so
 *   `fastSma > slowSma` for every post-warmup bar (slow has the
 *   larger offset). Zero crosses.
 * - **STEP pattern close = K1 for i < N, K2 for i >= N**: the fast
 *   line lifts off K1 sooner than the slow line, producing an up
 *   cross at a deterministic index (specifically at the first bar
 *   where `fastSma > slowSma` -- for `K1 = 1, K2 = 5, fastLength =
 *   2, slowLength = 4`, the up cross fires at `i = 4`).
 */

export interface ChartLineSmaCrossPoint {
  x: number;
  close: number;
}

export type ChartLineSmaCrossRelation = 'above' | 'below' | 'equal' | 'none';

export type ChartLineSmaCrossCross = 'up' | 'down' | null;

export type ChartLineSmaCrossSeriesId = 'price' | 'fast' | 'slow';

export interface ChartLineSmaCrossSample {
  index: number;
  x: number;
  close: number;
  fastSma: number | null;
  slowSma: number | null;
  relation: ChartLineSmaCrossRelation;
  crossed: ChartLineSmaCrossCross;
}

export interface ChartLineSmaCrossRun {
  series: ChartLineSmaCrossPoint[];
  fastLength: number;
  slowLength: number;
  fastSmaValues: Array<number | null>;
  slowSmaValues: Array<number | null>;
  samples: ChartLineSmaCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  aboveCount: number;
  belowCount: number;
  equalCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineSmaCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  kind: 'up' | 'down';
}

export interface ChartLineSmaCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSmaCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineSmaCrossDot[];
  fastPath: string;
  slowPath: string;
  markers: ChartLineSmaCrossMarker[];
  yMin: number;
  yMax: number;
  run: ChartLineSmaCrossRun;
}

export interface ChartLineSmaCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSmaCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  fastColor?: string;
  slowColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFast?: boolean;
  showSlow?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSmaCrossSeriesId[];
  defaultHiddenSeries?: ChartLineSmaCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSmaCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineSmaCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_SMA_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_SMA_CROSS_HEIGHT = 360;
export const DEFAULT_CHART_LINE_SMA_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_SMA_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SMA_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SMA_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SMA_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_SMA_CROSS_FAST_LENGTH = 10;
export const DEFAULT_CHART_LINE_SMA_CROSS_SLOW_LENGTH = 50;
export const DEFAULT_CHART_LINE_SMA_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SMA_CROSS_FAST_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_SMA_CROSS_SLOW_COLOR = '#1d4ed8';
export const DEFAULT_CHART_LINE_SMA_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SMA_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SMA_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SMA_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x and close. */
export function getLineSmaCrossFinitePoints(
  data: readonly ChartLineSmaCrossPoint[] | null | undefined,
): ChartLineSmaCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSmaCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer SMA length (>= 2). */
export function normalizeLineSmaCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Rolling SMA with constant-window short-circuit. */
export function applyLineSmaCrossSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    let minV = Infinity;
    let maxV = -Infinity;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    out.push(minV === maxV ? posZero(minV) : posZero(sum / length));
  }
  return out;
}

export interface LineSmaCrossChannels {
  fastSma: Array<number | null>;
  slowSma: Array<number | null>;
}

export function computeLineSmaCross(
  series: readonly ChartLineSmaCrossPoint[] | null | undefined,
  options: { fastLength?: number; slowLength?: number } = {},
): LineSmaCrossChannels {
  const cleaned = getLineSmaCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { fastSma: [], slowSma: [] };
  }
  const fastLength = normalizeLineSmaCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_SMA_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineSmaCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_SMA_CROSS_SLOW_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  return {
    fastSma: applyLineSmaCrossSma(closes, fastLength),
    slowSma: applyLineSmaCrossSma(closes, slowLength),
  };
}

export function classifyLineSmaCrossRelation(
  fast: number | null,
  slow: number | null,
): ChartLineSmaCrossRelation {
  if (fast == null || slow == null) return 'none';
  if (fast > slow) return 'above';
  if (fast < slow) return 'below';
  return 'equal';
}

export function detectLineSmaCrossCrosses(
  fasts: readonly (number | null)[],
  slows: readonly (number | null)[],
): ChartLineSmaCrossCross[] {
  const out: ChartLineSmaCrossCross[] = [];
  let prevFast: number | null = null;
  let prevSlow: number | null = null;
  for (let i = 0; i < fasts.length; i += 1) {
    const f = fasts[i];
    const s = slows[i];
    if (f == null || s == null) {
      out.push(null);
      prevFast = null;
      prevSlow = null;
      continue;
    }
    if (prevFast == null || prevSlow == null) {
      out.push(null);
      prevFast = f;
      prevSlow = s;
      continue;
    }
    if (prevFast <= prevSlow && f > s) {
      out.push('up');
    } else if (prevFast >= prevSlow && f < s) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevFast = f;
    prevSlow = s;
  }
  return out;
}

export function runLineSmaCross(
  data: ChartLineSmaCrossPoint[],
  options: { fastLength?: number; slowLength?: number } = {},
): ChartLineSmaCrossRun {
  const cleaned = getLineSmaCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineSmaCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_SMA_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineSmaCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_SMA_CROSS_SLOW_LENGTH,
  );

  const channels = computeLineSmaCross(series, { fastLength, slowLength });
  const crosses = detectLineSmaCrossCrosses(
    channels.fastSma,
    channels.slowSma,
  );

  const samples: ChartLineSmaCrossSample[] = series.map((p, i) => {
    const fastSma = channels.fastSma[i] ?? null;
    const slowSma = channels.slowSma[i] ?? null;
    const relation = classifyLineSmaCrossRelation(fastSma, slowSma);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      fastSma,
      slowSma,
      relation,
      crossed,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let aboveCount = 0;
  let belowCount = 0;
  let equalCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.relation === 'above') aboveCount += 1;
    else if (s.relation === 'below') belowCount += 1;
    else if (s.relation === 'equal') equalCount += 1;
    else noneCount += 1;
  }

  const ok = series.length >= Math.max(fastLength, slowLength);

  return {
    series = [],
    fastLength,
    slowLength,
    fastSmaValues: channels.fastSma,
    slowSmaValues: channels.slowSma,
    samples,
    upCrossCount,
    downCrossCount,
    aboveCount,
    belowCount,
    equalCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineSmaCrossLayoutOptions {
  data: ChartLineSmaCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  width?: number;
  height?: number;
  padding?: number;
}

export function computeLineSmaCrossLayout(
  opts: ComputeLineSmaCrossLayoutOptions,
): ChartLineSmaCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_SMA_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_SMA_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_SMA_CROSS_PADDING;

  const run = runLineSmaCross(opts.data, {
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
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
      fastPath: '',
      slowPath: '',
      markers: [],
      yMin: 0,
      yMax: 1,
      run,
    };
  }

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < yMin) yMin = s.close;
    if (s.close > yMax) yMax = s.close;
    if (s.fastSma != null) {
      if (s.fastSma < yMin) yMin = s.fastSma;
      if (s.fastSma > yMax) yMax = s.fastSma;
    }
    if (s.slowSma != null) {
      if (s.slowSma < yMin) yMin = s.slowSma;
      if (s.slowSma > yMax) yMax = s.slowSma;
    }
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
  const priceDots: ChartLineSmaCrossDot[] = [];
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

  const buildPath = (key: 'fastSma' | 'slowSma'): string => {
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

  const fastPath = buildPath('fastSma');
  const slowPath = buildPath('slowSma');

  const markers: ChartLineSmaCrossMarker[] = [];
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
    fastPath,
    slowPath,
    markers,
    yMin,
    yMax,
    run,
  };
}

export function describeLineSmaCrossChart(
  data: ChartLineSmaCrossPoint[],
  options: { fastLength?: number; slowLength?: number } = {},
): string {
  const cleaned = getLineSmaCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fastLength = normalizeLineSmaCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_SMA_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineSmaCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_SMA_CROSS_SLOW_LENGTH,
  );
  return (
    `SMA Cross chart over ${cleaned.length} bars ` +
    `(fastLength ${fastLength}, slowLength ${slowLength}). Single ` +
    `panel with the close annotated by fast and slow SMA overlays ` +
    `plus markers at every fast-over-slow up cross and down cross.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineSmaCross = forwardRef<
  HTMLDivElement,
  ChartLineSmaCrossProps
>(function ChartLineSmaCross(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_SMA_CROSS_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_SMA_CROSS_SLOW_LENGTH,
    width = DEFAULT_CHART_LINE_SMA_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_SMA_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_SMA_CROSS_PADDING,
    tickCount = DEFAULT_CHART_LINE_SMA_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SMA_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SMA_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_SMA_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SMA_CROSS_PRICE_COLOR,
    fastColor = DEFAULT_CHART_LINE_SMA_CROSS_FAST_COLOR,
    slowColor = DEFAULT_CHART_LINE_SMA_CROSS_SLOW_COLOR,
    bullishColor = DEFAULT_CHART_LINE_SMA_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_SMA_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_SMA_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_SMA_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showFast = true,
    showSlow = true,
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
    () => getLineSmaCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineSmaCrossLayout({
        data: cleaned,
        fastLength,
        slowLength,
        width,
        height,
        padding,
      }),
    [cleaned, fastLength, slowLength, width, height, padding],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineSmaCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineSmaCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineSmaCrossSeriesId,
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
        data-section="chart-line-sma-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineSmaCrossChart(cleaned, { fastLength, slowLength });

  const showPrice = !hidden.has('price');
  const showFastLine = !hidden.has('fast') && showFast;
  const showSlowLine = !hidden.has('slow') && showSlow;

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
      aria-label={ariaLabel ?? 'SMA Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-sma-cross"
      data-fast-length={fastLength}
      data-slow-length={slowLength}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-sma-cross-title"
      >
        {ariaLabel ?? 'SMA Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-sma-cross-aria-desc"
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
        data-section="chart-line-sma-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-sma-cross-grid">
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
                  data-section="chart-line-sma-cross-grid-line"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-sma-cross-axes">
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
                  data-section="chart-line-sma-cross-tick"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showSlowLine ? (
          <path
            d={layout.slowPath}
            stroke={slowColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-sma-cross-slow"
          />
        ) : null}

        {showFastLine ? (
          <path
            d={layout.fastPath}
            stroke={fastColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-sma-cross-fast"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-sma-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-sma-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-sma-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-sma-cross-markers">
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
                data-section="chart-line-sma-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-sma-cross-hover-targets">
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
                data-section="chart-line-sma-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.innerTop + 8})`}
                data-section="chart-line-sma-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={180}
                  height={108}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-cross-tooltip-fast"
                >
                  fast{' '}
                  {tooltipSample.fastSma == null
                    ? '--'
                    : formatPrice(tooltipSample.fastSma)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-cross-tooltip-slow"
                >
                  slow{' '}
                  {tooltipSample.slowSma == null
                    ? '--'
                    : formatPrice(tooltipSample.slowSma)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-cross-tooltip-counts"
                >
                  up {layout.run.upCrossCount} | down{' '}
                  {layout.run.downCrossCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-sma-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          fast {fastLength} | slow {slowLength} | up{' '}
          {layout.run.upCrossCount} | down {layout.run.downCrossCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-sma-cross-legend"
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
              { id: 'fast' as const, color: fastColor, label: 'fast' },
              { id: 'slow' as const, color: slowColor, label: 'slow' },
            ] satisfies Array<{
              id: ChartLineSmaCrossSeriesId;
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

ChartLineSmaCross.displayName = 'ChartLineSmaCross';
