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
 * ChartLineMomentumCross -- pure-SVG dual-panel chart with the
 * close on top and an absolute-units Momentum oscillator on the
 * bottom, with markers placed at every zero-line crossover:
 *
 *   momentum[i] = close[i] - close[i - length]
 *   up cross    = prev momentum <= 0  AND  curr momentum > 0
 *   down cross  = prev momentum >= 0  AND  curr momentum < 0
 *
 * `momentum[i]` is `null` during warmup (`i < length`).
 *
 * Distinct from 11.807 chart-line-momentum-divergence (which plots
 * Momentum vs ROC side-by-side) and 11.835 chart-line-momentum-pct
 * (which scales by the prior close). This primitive keeps the raw
 * absolute units and focuses on the canonical zero-line cross.
 *
 * Bit-exact anchors:
 * - **CONST close = K**: `momentum = 0` for every post-warmup bar;
 *   the relation stays at zero so neither `prev > 0` nor `curr > 0`
 *   holds strictly -> zero crosses.
 * - **LINEAR UP close = i + 1**: `momentum = (i + 1) - (i + 1 - L) =
 *   L > 0` constant for every post-warmup bar -> zero crosses.
 * - **LINEAR DOWN close = N - i**: `momentum = -L < 0` constant ->
 *   zero crosses.
 * - **STEP close = K1 for i < N, K2 for i >= N** (`K1 != K2`,
 *   `N >= L`): for `L <= i < N`, momentum = 0 (both bars in segment
 *   one). At `i = N`, curr momentum = `K2 - K1`. If `K2 > K1` an up
 *   cross fires at exactly `i = N`; if `K2 < K1` a down cross fires.
 *   For `i > N + L - 1`, momentum returns to 0; the cross when the
 *   lookback bar finally moves into segment two does NOT count
 *   (prev > 0, curr = 0 fails strict `curr > 0`).
 */

export interface ChartLineMomentumCrossPoint {
  x: number;
  close: number;
}

export type ChartLineMomentumCrossZone =
  | 'positive'
  | 'negative'
  | 'zero'
  | 'none';

export type ChartLineMomentumCrossCross = 'up' | 'down' | null;

export type ChartLineMomentumCrossSeriesId = 'price' | 'momentum';

export interface ChartLineMomentumCrossSample {
  index: number;
  x: number;
  close: number;
  prior: number | null;
  momentum: number | null;
  zone: ChartLineMomentumCrossZone;
  crossed: ChartLineMomentumCrossCross;
}

export interface ChartLineMomentumCrossRun {
  series: ChartLineMomentumCrossPoint[];
  length: number;
  priorValues: Array<number | null>;
  momentumValues: Array<number | null>;
  samples: ChartLineMomentumCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineMomentumCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  momentum: number;
  kind: 'up' | 'down';
}

export interface ChartLineMomentumCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMomentumCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  momTop: number;
  momBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineMomentumCrossDot[];
  momentumPath: string;
  zeroY: number;
  markers: ChartLineMomentumCrossMarker[];
  priceMin: number;
  priceMax: number;
  momMin: number;
  momMax: number;
  run: ChartLineMomentumCrossRun;
}

export interface ChartLineMomentumCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMomentumCrossPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  momentumColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMomentum?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMomentumCrossSeriesId[];
  defaultHiddenSeries?: ChartLineMomentumCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMomentumCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineMomentumCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatMomentum?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_LENGTH = 10;
export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_MOMENTUM_COLOR = '#d946ef';
export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MOMENTUM_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x and close. */
export function getLineMomentumCrossFinitePoints(
  data: readonly ChartLineMomentumCrossPoint[] | null | undefined,
): ChartLineMomentumCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMomentumCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer lookback length (>= 1). */
export function normalizeLineMomentumCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export interface LineMomentumCrossChannels {
  prior: Array<number | null>;
  momentum: Array<number | null>;
}

export function computeLineMomentumCross(
  series: readonly ChartLineMomentumCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineMomentumCrossChannels {
  const cleaned = getLineMomentumCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { prior: [], momentum: [] };
  }
  const length = normalizeLineMomentumCrossLength(
    options.length,
    DEFAULT_CHART_LINE_MOMENTUM_CROSS_LENGTH,
  );

  const prior: Array<number | null> = [];
  const momentum: Array<number | null> = [];

  for (let i = 0; i < cleaned.length; i += 1) {
    if (i < length) {
      prior.push(null);
      momentum.push(null);
      continue;
    }
    const c = cleaned[i]!.close;
    const cPast = cleaned[i - length]!.close;
    prior.push(cPast);
    momentum.push(posZero(c - cPast));
  }

  return { prior, momentum };
}

export function classifyLineMomentumCrossZone(
  value: number | null,
): ChartLineMomentumCrossZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'zero';
}

export function detectLineMomentumCrossCrosses(
  values: readonly (number | null)[],
): ChartLineMomentumCrossCross[] {
  const out: ChartLineMomentumCrossCross[] = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev == null) {
      out.push(null);
      prev = v;
      continue;
    }
    if (prev <= 0 && v > 0) {
      out.push('up');
    } else if (prev >= 0 && v < 0) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

export function runLineMomentumCross(
  data: ChartLineMomentumCrossPoint[],
  options: { length?: number } = {},
): ChartLineMomentumCrossRun {
  const cleaned = getLineMomentumCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineMomentumCrossLength(
    options.length,
    DEFAULT_CHART_LINE_MOMENTUM_CROSS_LENGTH,
  );

  const channels = computeLineMomentumCross(series, { length });
  const crosses = detectLineMomentumCrossCrosses(channels.momentum);

  const samples: ChartLineMomentumCrossSample[] = series.map((p, i) => {
    const prior = channels.prior[i] ?? null;
    const momentum = channels.momentum[i] ?? null;
    const zone = classifyLineMomentumCrossZone(momentum);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      prior,
      momentum,
      zone,
      crossed,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let zeroCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.zone === 'positive') positiveCount += 1;
    else if (s.zone === 'negative') negativeCount += 1;
    else if (s.zone === 'zero') zeroCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length;

  return {
    series,
    length,
    priorValues: channels.prior,
    momentumValues: channels.momentum,
    samples,
    upCrossCount,
    downCrossCount,
    positiveCount,
    negativeCount,
    zeroCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineMomentumCrossLayoutOptions {
  data: ChartLineMomentumCrossPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineMomentumCrossLayout(
  opts: ComputeLineMomentumCrossLayoutOptions,
): ChartLineMomentumCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_MOMENTUM_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_MOMENTUM_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_MOMENTUM_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_MOMENTUM_CROSS_PANEL_GAP;

  const run = runLineMomentumCross(opts.data, {
    length: opts.length ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const momTop = priceBottom + panelGap;
  const momBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      momTop,
      momBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      momentumPath: '',
      zeroY: (momTop + momBottom) / 2,
      markers: [],
      priceMin: 0,
      priceMax: 0,
      momMin: -1,
      momMax: 1,
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  let momMin = Infinity;
  let momMax = -Infinity;
  for (const s of run.samples) {
    if (s.momentum == null) continue;
    if (s.momentum < momMin) momMin = s.momentum;
    if (s.momentum > momMax) momMax = s.momentum;
  }
  if (!Number.isFinite(momMin) || !Number.isFinite(momMax)) {
    momMin = -1;
    momMax = 1;
  }
  if (momMin > 0) momMin = 0;
  if (momMax < 0) momMax = 0;
  if (momMin === momMax) {
    momMin -= 1;
    momMax += 1;
  }

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syMom = (y: number): number =>
    momBottom - ((y - momMin) / (momMax - momMin)) * (momBottom - momTop);

  let pricePath = '';
  const priceDots: ChartLineMomentumCrossDot[] = [];
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = syPrice(s.close);
    pricePath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    priceDots.push({
      index: s.index,
      x: s.x,
      cx,
      cy,
      close: s.close,
    });
  }

  let momentumPath = '';
  let firstM = true;
  for (const s of run.samples) {
    if (s.momentum == null) {
      firstM = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syMom(s.momentum);
    momentumPath += `${firstM ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstM = false;
  }

  const markers: ChartLineMomentumCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.momentum == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syMom(s.momentum),
      close: s.close,
      momentum: s.momentum,
      kind: s.crossed,
    });
  }

  return {
    ok: true,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    momTop,
    momBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    momentumPath: momentumPath.trim(),
    zeroY: syMom(0),
    markers,
    priceMin,
    priceMax,
    momMin,
    momMax,
    run,
  };
}

export function describeLineMomentumCrossChart(
  data: ChartLineMomentumCrossPoint[],
  options: { length?: number } = {},
): string {
  const cleaned = getLineMomentumCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineMomentumCrossLength(
    options.length,
    DEFAULT_CHART_LINE_MOMENTUM_CROSS_LENGTH,
  );
  return (
    `Momentum Cross chart over ${cleaned.length} bars ` +
    `(length ${length}). Top panel renders the close; bottom panel ` +
    `renders the absolute-units Momentum oscillator (close minus the ` +
    `lookback close) with markers at every zero-line crossover.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultMomentumFormatter = (value: number): string =>
  formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineMomentumCross = forwardRef<
  HTMLDivElement,
  ChartLineMomentumCrossProps
>(function ChartLineMomentumCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_MOMENTUM_CROSS_LENGTH,
    width = DEFAULT_CHART_LINE_MOMENTUM_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_MOMENTUM_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_MOMENTUM_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_MOMENTUM_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MOMENTUM_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MOMENTUM_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MOMENTUM_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_MOMENTUM_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MOMENTUM_CROSS_PRICE_COLOR,
    momentumColor = DEFAULT_CHART_LINE_MOMENTUM_CROSS_MOMENTUM_COLOR,
    bullishColor = DEFAULT_CHART_LINE_MOMENTUM_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_MOMENTUM_CROSS_BEARISH_COLOR,
    zeroColor = DEFAULT_CHART_LINE_MOMENTUM_CROSS_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_MOMENTUM_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MOMENTUM_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMomentum = true,
    showMarkers = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onCrossClick,
    formatPrice = defaultPriceFormatter,
    formatMomentum = defaultMomentumFormatter,
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
    () => getLineMomentumCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineMomentumCrossLayout({
        data: cleaned,
        length,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineMomentumCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineMomentumCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineMomentumCrossSeriesId,
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
        data-section="chart-line-momentum-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineMomentumCrossChart(cleaned, { length });

  const showPrice = !hidden.has('price');
  const showMomLine = !hidden.has('momentum') && showMomentum;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickMomValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickMomValues.push(
      layout.momMin + ((layout.momMax - layout.momMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'Momentum Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-momentum-cross"
      data-length={length}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-momentum-cross-title"
      >
        {ariaLabel ?? 'Momentum Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-momentum-cross-aria-desc"
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
        data-section="chart-line-momentum-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-momentum-cross-grid">
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <line
                  key={`grid-price-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-momentum-cross-grid-line-price"
                />
              );
            })}
            {tickMomValues.map((v, i) => {
              const y =
                layout.momBottom -
                ((v - layout.momMin) /
                  (layout.momMax - layout.momMin)) *
                  (layout.momBottom - layout.momTop);
              return (
                <line
                  key={`grid-mom-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-momentum-cross-grid-line-mom"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-momentum-cross-axes">
            <line
              x1={layout.innerLeft}
              y1={layout.priceTop}
              x2={layout.innerLeft}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.priceBottom}
              x2={layout.innerRight}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.momTop}
              x2={layout.innerLeft}
              y2={layout.momBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.momBottom}
              x2={layout.innerRight}
              y2={layout.momBottom}
              stroke={axisColor}
            />
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <text
                  key={`tick-price-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-momentum-cross-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickMomValues.map((v, i) => {
              const y =
                layout.momBottom -
                ((v - layout.momMin) /
                  (layout.momMax - layout.momMin)) *
                  (layout.momBottom - layout.momTop);
              return (
                <text
                  key={`tick-mom-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-momentum-cross-tick-mom"
                >
                  {formatMomentum(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroY}
            x2={layout.innerRight}
            y2={layout.zeroY}
            stroke={zeroColor}
            strokeDasharray="2 4"
            data-section="chart-line-momentum-cross-zero-line"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-momentum-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-momentum-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-momentum-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showMomLine ? (
          <path
            d={layout.momentumPath}
            stroke={momentumColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-momentum-cross-line"
          />
        ) : null}

        {showMarkers && showMomLine ? (
          <g data-section="chart-line-momentum-cross-markers">
            {layout.markers.map((m) => (
              <circle
                key={`mom-marker-${m.index}-${m.kind}`}
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
                data-section="chart-line-momentum-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-momentum-cross-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.momBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-momentum-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-momentum-cross-tooltip"
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
                  data-section="chart-line-momentum-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-cross-tooltip-prior"
                >
                  prior{' '}
                  {tooltipSample.prior == null
                    ? '--'
                    : formatPrice(tooltipSample.prior)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-cross-tooltip-momentum"
                >
                  momentum{' '}
                  {tooltipSample.momentum == null
                    ? '--'
                    : formatMomentum(tooltipSample.momentum)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-cross-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-cross-tooltip-counts"
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
          data-section="chart-line-momentum-cross-badge"
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
          data-section="chart-line-momentum-cross-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            data-series-id="price"
            aria-pressed={!hidden.has('price')}
            onClick={() => handleLegendClick('price')}
            onKeyDown={(e) => handleLegendKey(e, 'price')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              fontSize: 11,
              opacity: hidden.has('price') ? 0.4 : 1,
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
                background: priceColor,
                borderRadius: 2,
              }}
            />
            close
          </button>
          <button
            type="button"
            data-series-id="momentum"
            aria-pressed={!hidden.has('momentum')}
            onClick={() => handleLegendClick('momentum')}
            onKeyDown={(e) => handleLegendKey(e, 'momentum')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              fontSize: 11,
              opacity: hidden.has('momentum') ? 0.4 : 1,
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
                background: momentumColor,
                borderRadius: 2,
              }}
            />
            momentum
          </button>
        </div>
      ) : null}
    </div>
  );
});

ChartLineMomentumCross.displayName = 'ChartLineMomentumCross';
