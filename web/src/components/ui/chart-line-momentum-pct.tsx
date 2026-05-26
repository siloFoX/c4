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
 * ChartLineMomentumPct -- pure-SVG dual-panel chart with the close
 * on top and a Momentum-Percent oscillator on the bottom:
 *
 *   momentum[i] = close[i - length] === 0
 *                   ? null
 *                   : (close[i] - close[i - length])
 *                       / close[i - length] * 100
 *
 * `momentum[i]` is `null` during warmup (`i < length`) and whenever
 * `close[i - length]` is zero (divide-by-zero guard).
 *
 * Bit-exact anchors:
 * - **CONST close = K, K != 0**: `close[i] - close[i - L] = 0`, so
 *   `momentum = 0 / K * 100 = 0` bit-exact post-warmup.
 * - **CONST close = 0**: divide-by-zero guard -> `null` everywhere.
 * - **DOUBLED step close = K for i < L, close = 2K for i >= L**:
 *   for `L <= i < 2L` the lookback bar lives in the first segment
 *   (value `K`) and the current bar lives in the second (value
 *   `2K`), so `momentum = (2K - K) / K * 100 = 100` bit-exact. For
 *   `i >= 2L` both bars sit in the second segment so the difference
 *   is 0 and `momentum = 0`.
 */

export interface ChartLineMomentumPctPoint {
  x: number;
  close: number;
}

export type ChartLineMomentumPctZone =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineMomentumPctCross = 'up' | 'down' | null;

export type ChartLineMomentumPctSeriesId = 'price' | 'momentum';

export interface ChartLineMomentumPctSample {
  index: number;
  x: number;
  close: number;
  prior: number | null;
  delta: number | null;
  momentum: number | null;
  zone: ChartLineMomentumPctZone;
  crossed: ChartLineMomentumPctCross;
}

export interface ChartLineMomentumPctRun {
  series: ChartLineMomentumPctPoint[];
  length: number;
  bullishThreshold: number;
  bearishThreshold: number;
  priorValues: Array<number | null>;
  deltaValues: Array<number | null>;
  momentumValues: Array<number | null>;
  samples: ChartLineMomentumPctSample[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineMomentumPctMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  momentum: number;
  crossed: 'up' | 'down';
}

export interface ChartLineMomentumPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMomentumPctLayout {
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
  priceDots: ChartLineMomentumPctDot[];
  momentumPath: string;
  bullishY: number;
  bearishY: number;
  zeroY: number;
  markers: ChartLineMomentumPctMarker[];
  priceMin: number;
  priceMax: number;
  momMin: number;
  momMax: number;
  run: ChartLineMomentumPctRun;
}

export interface ChartLineMomentumPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMomentumPctPoint[];
  length?: number;
  bullishThreshold?: number;
  bearishThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  momentumColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMomentum?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMomentumPctSeriesId[];
  defaultHiddenSeries?: ChartLineMomentumPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMomentumPctSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineMomentumPctSample }) => void;
  formatPrice?: (value: number) => string;
  formatMomentum?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_MOMENTUM_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_LENGTH = 10;
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_BULLISH_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_BEARISH_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_MOMENTUM_COLOR = '#ec4899';
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MOMENTUM_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x and close. */
export function getLineMomentumPctFinitePoints(
  data: readonly ChartLineMomentumPctPoint[] | null | undefined,
): ChartLineMomentumPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMomentumPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer lookback length (>= 1). */
export function normalizeLineMomentumPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a numeric threshold (any finite real). */
export function normalizeLineMomentumPctThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold)) return threshold;
  return fallback;
}

export interface LineMomentumPctChannels {
  prior: Array<number | null>;
  delta: Array<number | null>;
  momentum: Array<number | null>;
}

/** Compute prior, delta, momentum channels. */
export function computeLineMomentumPct(
  series: readonly ChartLineMomentumPctPoint[] | null | undefined,
  options: { length?: number } = {},
): LineMomentumPctChannels {
  const cleaned = getLineMomentumPctFinitePoints(series);
  if (cleaned.length === 0) {
    return { prior: [], delta: [], momentum: [] };
  }
  const length = normalizeLineMomentumPctLength(
    options.length,
    DEFAULT_CHART_LINE_MOMENTUM_PCT_LENGTH,
  );

  const prior: Array<number | null> = [];
  const delta: Array<number | null> = [];
  const momentum: Array<number | null> = [];

  for (let i = 0; i < cleaned.length; i += 1) {
    if (i < length) {
      prior.push(null);
      delta.push(null);
      momentum.push(null);
      continue;
    }
    const c = cleaned[i]!.close;
    const cPast = cleaned[i - length]!.close;
    prior.push(cPast);
    const d = c - cPast;
    delta.push(posZero(d));
    if (cPast === 0) {
      momentum.push(null);
      continue;
    }
    const raw = (d / cPast) * 100;
    momentum.push(Number.isFinite(raw) ? posZero(raw) : null);
  }

  return { prior, delta, momentum };
}

export function classifyLineMomentumPctZone(
  value: number | null,
  bullishThreshold: number,
  bearishThreshold: number,
): ChartLineMomentumPctZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > bullishThreshold) return 'bullish';
  if (value < bearishThreshold) return 'bearish';
  return 'neutral';
}

export function detectLineMomentumPctCrosses(
  values: readonly (number | null)[],
  bullishThreshold: number,
  bearishThreshold: number,
): ChartLineMomentumPctCross[] {
  const out: ChartLineMomentumPctCross[] = [];
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
    if (prev <= bullishThreshold && v > bullishThreshold) {
      out.push('up');
    } else if (prev >= bearishThreshold && v < bearishThreshold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

export function runLineMomentumPct(
  data: ChartLineMomentumPctPoint[],
  options: {
    length?: number;
    bullishThreshold?: number;
    bearishThreshold?: number;
  } = {},
): ChartLineMomentumPctRun {
  const cleaned = getLineMomentumPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineMomentumPctLength(
    options.length,
    DEFAULT_CHART_LINE_MOMENTUM_PCT_LENGTH,
  );
  const bullishThreshold = normalizeLineMomentumPctThreshold(
    options.bullishThreshold,
    DEFAULT_CHART_LINE_MOMENTUM_PCT_BULLISH_THRESHOLD,
  );
  const bearishThreshold = normalizeLineMomentumPctThreshold(
    options.bearishThreshold,
    DEFAULT_CHART_LINE_MOMENTUM_PCT_BEARISH_THRESHOLD,
  );

  const channels = computeLineMomentumPct(series, { length });
  const crosses = detectLineMomentumPctCrosses(
    channels.momentum,
    bullishThreshold,
    bearishThreshold,
  );

  const samples: ChartLineMomentumPctSample[] = series.map((p, i) => {
    const prior = channels.prior[i] ?? null;
    const delta = channels.delta[i] ?? null;
    const momentum = channels.momentum[i] ?? null;
    const zone = classifyLineMomentumPctZone(
      momentum,
      bullishThreshold,
      bearishThreshold,
    );
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      prior,
      delta,
      momentum,
      zone,
      crossed,
    };
  });

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const s of samples) {
    if (s.zone === 'bullish') bullishCount += 1;
    else if (s.zone === 'bearish') bearishCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    else noneCount += 1;
    if (s.crossed === 'up') bullishCrossCount += 1;
    else if (s.crossed === 'down') bearishCrossCount += 1;
  }

  const ok = series.length > length;

  return {
    series,
    length,
    bullishThreshold,
    bearishThreshold,
    priorValues: channels.prior,
    deltaValues: channels.delta,
    momentumValues: channels.momentum,
    samples,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineMomentumPctLayoutOptions {
  data: ChartLineMomentumPctPoint[];
  length?: number;
  bullishThreshold?: number;
  bearishThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineMomentumPctLayout(
  opts: ComputeLineMomentumPctLayoutOptions,
): ChartLineMomentumPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_MOMENTUM_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_MOMENTUM_PCT_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_MOMENTUM_PCT_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_MOMENTUM_PCT_PANEL_GAP;

  const run = runLineMomentumPct(opts.data, {
    length: opts.length ?? undefined,
    bullishThreshold: opts.bullishThreshold ?? undefined,
    bearishThreshold: opts.bearishThreshold ?? undefined,
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
      bullishY: momTop,
      bearishY: momBottom,
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
  const priceDots: ChartLineMomentumPctDot[] = [];
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
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s || s.momentum == null) {
      firstM = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syMom(s.momentum);
    momentumPath += `${firstM ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstM = false;
  }

  const markers: ChartLineMomentumPctMarker[] = [];
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
      crossed: s.crossed,
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
    bullishY: syMom(run.bullishThreshold),
    bearishY: syMom(run.bearishThreshold),
    zeroY: syMom(0),
    markers,
    priceMin,
    priceMax,
    momMin,
    momMax,
    run,
  };
}

export function describeLineMomentumPctChart(
  data: ChartLineMomentumPctPoint[],
  options: {
    length?: number;
    bullishThreshold?: number;
    bearishThreshold?: number;
  } = {},
): string {
  const cleaned = getLineMomentumPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineMomentumPctLength(
    options.length,
    DEFAULT_CHART_LINE_MOMENTUM_PCT_LENGTH,
  );
  const bullishThreshold = normalizeLineMomentumPctThreshold(
    options.bullishThreshold,
    DEFAULT_CHART_LINE_MOMENTUM_PCT_BULLISH_THRESHOLD,
  );
  const bearishThreshold = normalizeLineMomentumPctThreshold(
    options.bearishThreshold,
    DEFAULT_CHART_LINE_MOMENTUM_PCT_BEARISH_THRESHOLD,
  );
  return (
    `Momentum Percent chart over ${cleaned.length} bars ` +
    `(length ${length}, bullishThreshold ${bullishThreshold}, ` +
    `bearishThreshold ${bearishThreshold}). Top panel renders the ` +
    `close; bottom panel renders the close minus the lookback close ` +
    `scaled to a percent of the prior close.`
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

export const ChartLineMomentumPct = forwardRef<
  HTMLDivElement,
  ChartLineMomentumPctProps
>(function ChartLineMomentumPct(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_MOMENTUM_PCT_LENGTH,
    bullishThreshold = DEFAULT_CHART_LINE_MOMENTUM_PCT_BULLISH_THRESHOLD,
    bearishThreshold = DEFAULT_CHART_LINE_MOMENTUM_PCT_BEARISH_THRESHOLD,
    width = DEFAULT_CHART_LINE_MOMENTUM_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_MOMENTUM_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_MOMENTUM_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_MOMENTUM_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MOMENTUM_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MOMENTUM_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MOMENTUM_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MOMENTUM_PCT_PRICE_COLOR,
    momentumColor = DEFAULT_CHART_LINE_MOMENTUM_PCT_MOMENTUM_COLOR,
    bullishColor = DEFAULT_CHART_LINE_MOMENTUM_PCT_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_MOMENTUM_PCT_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_MOMENTUM_PCT_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_MOMENTUM_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_MOMENTUM_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MOMENTUM_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMomentum = true,
    showMarkers = true,
    showThresholds = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
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
    () => getLineMomentumPctFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineMomentumPctLayout({
        data: cleaned,
        length,
        bullishThreshold,
        bearishThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      bullishThreshold,
      bearishThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineMomentumPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineMomentumPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineMomentumPctSeriesId,
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
        data-section="chart-line-momentum-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineMomentumPctChart(cleaned, {
      length,
      bullishThreshold,
      bearishThreshold,
    });

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
      aria-label={ariaLabel ?? 'Momentum Percent chart'}
      aria-describedby={descId}
      data-section="chart-line-momentum-pct"
      data-length={length}
      data-bullish-threshold={bullishThreshold}
      data-bearish-threshold={bearishThreshold}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-momentum-pct-title"
      >
        {ariaLabel ?? 'Momentum Percent chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-momentum-pct-aria-desc"
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
        data-section="chart-line-momentum-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-momentum-pct-grid">
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
                  data-section="chart-line-momentum-pct-grid-line-price"
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
                  data-section="chart-line-momentum-pct-grid-line-mom"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-momentum-pct-axes">
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
                  data-section="chart-line-momentum-pct-tick-price"
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
                  data-section="chart-line-momentum-pct-tick-mom"
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
            data-section="chart-line-momentum-pct-zero-line"
          />
        ) : null}

        {showThresholds &&
        (bullishThreshold !== 0 || bearishThreshold !== 0) ? (
          <g data-section="chart-line-momentum-pct-thresholds">
            <line
              x1={layout.innerLeft}
              y1={layout.bullishY}
              x2={layout.innerRight}
              y2={layout.bullishY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-momentum-pct-bullish-line"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.bearishY}
              x2={layout.innerRight}
              y2={layout.bearishY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-momentum-pct-bearish-line"
            />
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-momentum-pct-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-momentum-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-momentum-pct-price-dot"
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
            data-section="chart-line-momentum-pct-line"
          />
        ) : null}

        {showMarkers && showMomLine ? (
          <g data-section="chart-line-momentum-pct-markers">
            {layout.markers.map((m) => (
              <circle
                key={`mom-marker-${m.index}`}
                cx={m.cx}
                cy={m.cy}
                r={dotRadius + 2}
                fill={m.crossed === 'up' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onPointClick?.({ point: sample });
                }}
                data-section="chart-line-momentum-pct-marker"
                data-cross={m.crossed}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-momentum-pct-hover-targets">
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
                data-section="chart-line-momentum-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-momentum-pct-tooltip"
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
                  data-section="chart-line-momentum-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-pct-tooltip-prior"
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
                  data-section="chart-line-momentum-pct-tooltip-delta"
                >
                  delta{' '}
                  {tooltipSample.delta == null
                    ? '--'
                    : formatPrice(tooltipSample.delta)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-pct-tooltip-momentum"
                >
                  momentum{' '}
                  {tooltipSample.momentum == null
                    ? '--'
                    : formatMomentum(tooltipSample.momentum)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-pct-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-pct-tooltip-cross"
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
          data-section="chart-line-momentum-pct-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | bull {bullishThreshold} | bear{' '}
          {bearishThreshold}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-momentum-pct-legend"
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
            momentum pct
          </button>
        </div>
      ) : null}
    </div>
  );
});

ChartLineMomentumPct.displayName = 'ChartLineMomentumPct';
