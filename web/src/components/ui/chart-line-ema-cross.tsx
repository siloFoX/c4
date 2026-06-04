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
 * ChartLineEmaCross -- pure-SVG single-panel chart overlaying a
 * fast EMA and a slow EMA on a price line, with markers at every
 * detected crossover event:
 *
 *   fastEma[i] = EMA(close, fastLength)[i]
 *   slowEma[i] = EMA(close, slowLength)[i]
 *   up cross   = prev fastEma <= prev slowEma  AND  curr fastEma > curr slowEma
 *   down cross = prev fastEma >= prev slowEma  AND  curr fastEma < curr slowEma
 *
 * The EMA helper carries the `min === max` seed precision fix and
 * the CONST short-circuit so constant inputs collapse to the exact
 * constant without 1-ULP drift. This is the parallel of 11.840
 * chart-line-sma-cross, swapping the rolling SMA for the SMA-seeded
 * EMA.
 *
 * Bit-exact anchors:
 * - **CONST close = K**: both EMAs collapse to `K` exactly, so the
 *   relation stays `equal` and `up = down = 0` crosses.
 * - **LINEAR UP close = i + 1**: at steady state both EMAs track
 *   the input with an offset proportional to length; with
 *   `slowLength > fastLength`, the fast EMA leads the slow EMA, so
 *   `fast > slow` for every post-warmup bar and `up = down = 0`
 *   crosses.
 * - **STEP close = K1 for i < N, K2 for i >= N** (`K1 < K2`): the
 *   fast EMA accelerates first, producing exactly one up-cross at
 *   a deterministic index. For `K1 = 1, K2 = 5, fastLength = 2,
 *   slowLength = 4, N = 4`, the up-cross fires at `i = 4`.
 */

export interface ChartLineEmaCrossPoint {
  x: number;
  close: number;
}

export type ChartLineEmaCrossRelation = 'above' | 'below' | 'equal' | 'none';

export type ChartLineEmaCrossCross = 'up' | 'down' | null;

export type ChartLineEmaCrossSeriesId = 'price' | 'fast' | 'slow';

export interface ChartLineEmaCrossSample {
  index: number;
  x: number;
  close: number;
  fastEma: number | null;
  slowEma: number | null;
  relation: ChartLineEmaCrossRelation;
  crossed: ChartLineEmaCrossCross;
}

export interface ChartLineEmaCrossRun {
  series: ChartLineEmaCrossPoint[];
  fastLength: number;
  slowLength: number;
  fastEmaValues: Array<number | null>;
  slowEmaValues: Array<number | null>;
  samples: ChartLineEmaCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  aboveCount: number;
  belowCount: number;
  equalCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineEmaCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  kind: 'up' | 'down';
}

export interface ChartLineEmaCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineEmaCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineEmaCrossDot[];
  fastPath: string;
  slowPath: string;
  markers: ChartLineEmaCrossMarker[];
  yMin: number;
  yMax: number;
  run: ChartLineEmaCrossRun;
}

export interface ChartLineEmaCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineEmaCrossPoint[];
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
  hiddenSeries?: ChartLineEmaCrossSeriesId[];
  defaultHiddenSeries?: ChartLineEmaCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineEmaCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineEmaCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_EMA_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_EMA_CROSS_HEIGHT = 360;
export const DEFAULT_CHART_LINE_EMA_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_EMA_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_EMA_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_EMA_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_EMA_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_EMA_CROSS_FAST_LENGTH = 12;
export const DEFAULT_CHART_LINE_EMA_CROSS_SLOW_LENGTH = 26;
export const DEFAULT_CHART_LINE_EMA_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_EMA_CROSS_FAST_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_EMA_CROSS_SLOW_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_EMA_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_EMA_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_EMA_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_EMA_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x and close. */
export function getLineEmaCrossFinitePoints(
  data: readonly ChartLineEmaCrossPoint[] | null | undefined,
): ChartLineEmaCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineEmaCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer EMA length (>= 2). */
export function normalizeLineEmaCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * SMA-seeded EMA with CONST short-circuit and `min === max` seed
 * precision fix.
 */
export function applyLineEmaCrossEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);
  let ema: number | null = null;
  let sum = 0;
  let count = 0;
  let seedMin = Infinity;
  let seedMax = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      ema = null;
      sum = 0;
      count = 0;
      seedMin = Infinity;
      seedMax = -Infinity;
      continue;
    }
    if (ema == null) {
      sum += v;
      count += 1;
      if (v < seedMin) seedMin = v;
      if (v > seedMax) seedMax = v;
      if (count >= length) {
        ema = seedMin === seedMax ? seedMin : sum / length;
        out[i] = posZero(ema);
      }
    } else {
      const next = v === ema ? v : alpha * v + (1 - alpha) * ema;
      ema = next;
      out[i] = posZero(next);
    }
  }
  return out;
}

export interface LineEmaCrossChannels {
  fastEma: Array<number | null>;
  slowEma: Array<number | null>;
}

export function computeLineEmaCross(
  series: readonly ChartLineEmaCrossPoint[] | null | undefined,
  options: { fastLength?: number; slowLength?: number } = {},
): LineEmaCrossChannels {
  const cleaned = getLineEmaCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { fastEma: [], slowEma: [] };
  }
  const fastLength = normalizeLineEmaCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_EMA_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineEmaCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_EMA_CROSS_SLOW_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  return {
    fastEma: applyLineEmaCrossEma(closes, fastLength),
    slowEma: applyLineEmaCrossEma(closes, slowLength),
  };
}

export function classifyLineEmaCrossRelation(
  fast: number | null,
  slow: number | null,
): ChartLineEmaCrossRelation {
  if (fast == null || slow == null) return 'none';
  if (fast > slow) return 'above';
  if (fast < slow) return 'below';
  return 'equal';
}

export function detectLineEmaCrossCrosses(
  fasts: readonly (number | null)[],
  slows: readonly (number | null)[],
): ChartLineEmaCrossCross[] {
  const out: ChartLineEmaCrossCross[] = [];
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

export function runLineEmaCross(
  data: ChartLineEmaCrossPoint[],
  options: { fastLength?: number; slowLength?: number } = {},
): ChartLineEmaCrossRun {
  const cleaned = getLineEmaCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineEmaCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_EMA_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineEmaCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_EMA_CROSS_SLOW_LENGTH,
  );

  const channels = computeLineEmaCross(series, { fastLength, slowLength });
  const crosses = detectLineEmaCrossCrosses(
    channels.fastEma,
    channels.slowEma,
  );

  const samples: ChartLineEmaCrossSample[] = series.map((p, i) => {
    const fastEma = channels.fastEma[i] ?? null;
    const slowEma = channels.slowEma[i] ?? null;
    const relation = classifyLineEmaCrossRelation(fastEma, slowEma);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      fastEma,
      slowEma,
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
    series,
    fastLength,
    slowLength,
    fastEmaValues: channels.fastEma,
    slowEmaValues: channels.slowEma,
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

export interface ComputeLineEmaCrossLayoutOptions {
  data: ChartLineEmaCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  width?: number;
  height?: number;
  padding?: number;
}

export function computeLineEmaCrossLayout(
  opts: ComputeLineEmaCrossLayoutOptions,
): ChartLineEmaCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_EMA_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_EMA_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_EMA_CROSS_PADDING;

  const run = runLineEmaCross(opts.data, {
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
    if (s.fastEma != null) {
      if (s.fastEma < yMin) yMin = s.fastEma;
      if (s.fastEma > yMax) yMax = s.fastEma;
    }
    if (s.slowEma != null) {
      if (s.slowEma < yMin) yMin = s.slowEma;
      if (s.slowEma > yMax) yMax = s.slowEma;
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
  const priceDots: ChartLineEmaCrossDot[] = [];
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

  const buildPath = (key: 'fastEma' | 'slowEma'): string => {
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

  const fastPath = buildPath('fastEma');
  const slowPath = buildPath('slowEma');

  const markers: ChartLineEmaCrossMarker[] = [];
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

export function describeLineEmaCrossChart(
  data: ChartLineEmaCrossPoint[],
  options: { fastLength?: number; slowLength?: number } = {},
): string {
  const cleaned = getLineEmaCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fastLength = normalizeLineEmaCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_EMA_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineEmaCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_EMA_CROSS_SLOW_LENGTH,
  );
  return (
    `EMA Cross chart over ${cleaned.length} bars ` +
    `(fastLength ${fastLength}, slowLength ${slowLength}). Single ` +
    `panel with the close annotated by fast and slow EMA overlays ` +
    `plus markers at every fast-over-slow up cross and down cross.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineEmaCross = forwardRef<
  HTMLDivElement,
  ChartLineEmaCrossProps
>(function ChartLineEmaCross(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_EMA_CROSS_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_EMA_CROSS_SLOW_LENGTH,
    width = DEFAULT_CHART_LINE_EMA_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_EMA_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_EMA_CROSS_PADDING,
    tickCount = DEFAULT_CHART_LINE_EMA_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_EMA_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_EMA_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_EMA_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_EMA_CROSS_PRICE_COLOR,
    fastColor = DEFAULT_CHART_LINE_EMA_CROSS_FAST_COLOR,
    slowColor = DEFAULT_CHART_LINE_EMA_CROSS_SLOW_COLOR,
    bullishColor = DEFAULT_CHART_LINE_EMA_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_EMA_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_EMA_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_EMA_CROSS_GRID_COLOR,
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
    () => getLineEmaCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineEmaCrossLayout({
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
    ChartLineEmaCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineEmaCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineEmaCrossSeriesId,
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
        data-section="chart-line-ema-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineEmaCrossChart(cleaned, { fastLength, slowLength });

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
      aria-label={ariaLabel ?? 'EMA Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-ema-cross"
      data-fast-length={fastLength}
      data-slow-length={slowLength}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-ema-cross-title"
      >
        {ariaLabel ?? 'EMA Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-ema-cross-aria-desc"
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
        data-section="chart-line-ema-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-ema-cross-grid">
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
                  data-section="chart-line-ema-cross-grid-line"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-ema-cross-axes">
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
                  data-section="chart-line-ema-cross-tick"
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
            data-section="chart-line-ema-cross-slow"
          />
        ) : null}

        {showFastLine ? (
          <path
            d={layout.fastPath}
            stroke={fastColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ema-cross-fast"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ema-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-ema-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-ema-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-ema-cross-markers">
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
                data-section="chart-line-ema-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-ema-cross-hover-targets">
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
                data-section="chart-line-ema-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.innerTop + 8})`}
                data-section="chart-line-ema-cross-tooltip"
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
                  data-section="chart-line-ema-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-cross-tooltip-fast"
                >
                  fast{' '}
                  {tooltipSample.fastEma == null
                    ? '--'
                    : formatPrice(tooltipSample.fastEma)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-cross-tooltip-slow"
                >
                  slow{' '}
                  {tooltipSample.slowEma == null
                    ? '--'
                    : formatPrice(tooltipSample.slowEma)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-cross-tooltip-counts"
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
          data-section="chart-line-ema-cross-badge"
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
          data-section="chart-line-ema-cross-legend"
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
              id: ChartLineEmaCrossSeriesId;
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

ChartLineEmaCross.displayName = 'ChartLineEmaCross';
