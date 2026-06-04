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
 * ChartLineDemaCross -- pure-SVG dual-panel chart with the close
 * overlaid with the Double Exponential Moving Average (DEMA) in
 * the top panel and the `close - DEMA` deviation in the bottom
 * panel. Markers fire at every close-vs-DEMA crossover -- the
 * canonical double-smoothed trend regime event.
 *
 *   ema1[i]   = EMA(close, length)
 *   ema2[i]   = EMA(ema1,  length)
 *   DEMA[i]   = 2 * ema1[i] - ema2[i]
 *
 * Cross events: `up` (close newly exceeds DEMA -> regime
 * `trending-up`), `down` (close newly drops below DEMA ->
 * regime `trending-down`).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: every EMA in the chain collapses to K
 *   via the SMA-seeded `min === max` precision fix. `DEMA = 2K -
 *   K = K`, deviation = 0, relation `equal` forever, zero
 *   crosses. Verified across multiple K and length tuples.
 */

export interface ChartLineDemaCrossPoint {
  x: number;
  close: number;
}

export type ChartLineDemaCrossRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLineDemaCrossCross = 'up' | 'down' | null;

export type ChartLineDemaCrossRegime =
  | 'trending-up'
  | 'trending-down'
  | 'aligned'
  | 'none';

export type ChartLineDemaCrossSeriesId = 'price' | 'dema' | 'deviation';

export interface ChartLineDemaCrossSample {
  index: number;
  x: number;
  close: number;
  ema1: number | null;
  ema2: number | null;
  dema: number | null;
  deviation: number | null;
  relation: ChartLineDemaCrossRelation;
  regime: ChartLineDemaCrossRegime;
  crossed: ChartLineDemaCrossCross;
}

export interface ChartLineDemaCrossRun {
  series: ChartLineDemaCrossPoint[];
  length: number;
  ema1Values: Array<number | null>;
  ema2Values: Array<number | null>;
  demaValues: Array<number | null>;
  deviationValues: Array<number | null>;
  samples: ChartLineDemaCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  trendingUpCount: number;
  trendingDownCount: number;
  alignedCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineDemaCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  kind: 'up' | 'down';
}

export interface ChartLineDemaCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineDemaCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  devTop: number;
  devBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineDemaCrossDot[];
  demaPath: string;
  deviationPath: string;
  markers: ChartLineDemaCrossMarker[];
  priceMin: number;
  priceMax: number;
  devMin: number;
  devMax: number;
  zeroY: number;
  run: ChartLineDemaCrossRun;
}

export interface ChartLineDemaCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineDemaCrossPoint[];
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
  demaColor?: string;
  deviationColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showDema?: boolean;
  showDeviation?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineDemaCrossSeriesId[];
  defaultHiddenSeries?: ChartLineDemaCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineDemaCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineDemaCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatDeviation?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_DEMA_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_DEMA_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_DEMA_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_DEMA_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_DEMA_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DEMA_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DEMA_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DEMA_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_DEMA_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_DEMA_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_DEMA_CROSS_DEMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_DEMA_CROSS_DEVIATION_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_DEMA_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DEMA_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DEMA_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_DEMA_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DEMA_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineDemaCrossFinitePoints(
  data: readonly ChartLineDemaCrossPoint[] | null | undefined,
): ChartLineDemaCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineDemaCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineDemaCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * SMA-seeded EMA with `min === max` precision fix and CONST short-
 * circuit so constant inputs land bit-exactly on the constant.
 */
export function applyLineDemaCrossEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);
  let smoothed: number | null = null;
  let sum = 0;
  let count = 0;
  let seedMin = Infinity;
  let seedMax = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      smoothed = null;
      sum = 0;
      count = 0;
      seedMin = Infinity;
      seedMax = -Infinity;
      continue;
    }
    if (smoothed == null) {
      sum += v;
      count += 1;
      if (v < seedMin) seedMin = v;
      if (v > seedMax) seedMax = v;
      if (count >= length) {
        smoothed = seedMin === seedMax ? seedMin : sum / length;
        out[i] = posZero(smoothed);
      }
    } else {
      const next =
        v === smoothed ? v : alpha * v + (1 - alpha) * smoothed;
      smoothed = next;
      out[i] = posZero(next);
    }
  }
  return out;
}

export interface LineDemaCrossChannels {
  ema1: Array<number | null>;
  ema2: Array<number | null>;
  dema: Array<number | null>;
}

export function computeLineDemaCross(
  series: readonly ChartLineDemaCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineDemaCrossChannels {
  const cleaned = getLineDemaCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { ema1: [], ema2: [], dema: [] };
  }
  const length = normalizeLineDemaCrossLength(
    options.length,
    DEFAULT_CHART_LINE_DEMA_CROSS_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const ema1 = applyLineDemaCrossEma(closes, length);
  const ema2 = applyLineDemaCrossEma(ema1, length);
  const dema: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const a = ema1[i];
    const b = ema2[i];
    if (a == null || b == null) continue;
    dema[i] = posZero(2 * a - b);
  }
  return { ema1, ema2, dema };
}

export function classifyLineDemaCrossRelation(
  close: number | null,
  dema: number | null,
): ChartLineDemaCrossRelation {
  if (close == null || dema == null) return 'none';
  if (close > dema) return 'bullish';
  if (close < dema) return 'bearish';
  return 'equal';
}

export function classifyLineDemaCrossRegime(
  relation: ChartLineDemaCrossRelation,
): ChartLineDemaCrossRegime {
  if (relation === 'bullish') return 'trending-up';
  if (relation === 'bearish') return 'trending-down';
  if (relation === 'equal') return 'aligned';
  return 'none';
}

export function detectLineDemaCrossCrosses(
  closes: readonly (number | null)[],
  demas: readonly (number | null)[],
): ChartLineDemaCrossCross[] {
  const out: ChartLineDemaCrossCross[] = [];
  let prevClose: number | null = null;
  let prevDema: number | null = null;
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i];
    const d = demas[i];
    if (c == null || d == null) {
      out.push(null);
      prevClose = null;
      prevDema = null;
      continue;
    }
    if (prevClose == null || prevDema == null) {
      out.push(null);
      prevClose = c;
      prevDema = d;
      continue;
    }
    if (prevClose <= prevDema && c > d) {
      out.push('up');
    } else if (prevClose >= prevDema && c < d) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevClose = c;
    prevDema = d;
  }
  return out;
}

export function runLineDemaCross(
  data: ChartLineDemaCrossPoint[],
  options: { length?: number } = {},
): ChartLineDemaCrossRun {
  const cleaned = getLineDemaCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineDemaCrossLength(
    options.length,
    DEFAULT_CHART_LINE_DEMA_CROSS_LENGTH,
  );

  const channels = computeLineDemaCross(series, { length });
  const closes = series.map((p) => p.close);
  const crosses = detectLineDemaCrossCrosses(closes, channels.dema);

  const samples: ChartLineDemaCrossSample[] = series.map((p, i) => {
    const ema1 = channels.ema1[i] ?? null;
    const ema2 = channels.ema2[i] ?? null;
    const dema = channels.dema[i] ?? null;
    const relation = classifyLineDemaCrossRelation(p.close, dema);
    const regime = classifyLineDemaCrossRegime(relation);
    const crossed = crosses[i] ?? null;
    const deviation = dema == null ? null : posZero(p.close - dema);
    return {
      index: i,
      x: p.x,
      close: p.close,
      ema1,
      ema2,
      dema,
      deviation,
      relation,
      regime,
      crossed,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let trendingUpCount = 0;
  let trendingDownCount = 0;
  let alignedCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.regime === 'trending-up') trendingUpCount += 1;
    else if (s.regime === 'trending-down') trendingDownCount += 1;
    else if (s.regime === 'aligned') alignedCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length * 2;

  return {
    series,
    length,
    ema1Values: channels.ema1,
    ema2Values: channels.ema2,
    demaValues: channels.dema,
    deviationValues: samples.map((s) => s.deviation),
    samples,
    upCrossCount,
    downCrossCount,
    trendingUpCount,
    trendingDownCount,
    alignedCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineDemaCrossLayoutOptions {
  data: ChartLineDemaCrossPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineDemaCrossLayout(
  opts: ComputeLineDemaCrossLayoutOptions,
): ChartLineDemaCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_DEMA_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_DEMA_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_DEMA_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_DEMA_CROSS_PANEL_GAP;

  const run = runLineDemaCross(opts.data, {
    length: opts.length ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const devTop = priceBottom + panelGap;
  const devBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      devTop,
      devBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      demaPath: '',
      deviationPath: '',
      markers: [],
      priceMin: 0,
      priceMax: 0,
      devMin: -1,
      devMax: 1,
      zeroY: (devTop + devBottom) / 2,
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
    if (s.dema != null) {
      if (s.dema < priceMin) priceMin = s.dema;
      if (s.dema > priceMax) priceMax = s.dema;
    }
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  let devMin = Infinity;
  let devMax = -Infinity;
  for (const s of run.samples) {
    if (s.deviation == null) continue;
    if (s.deviation < devMin) devMin = s.deviation;
    if (s.deviation > devMax) devMax = s.deviation;
  }
  if (!Number.isFinite(devMin) || !Number.isFinite(devMax)) {
    devMin = -1;
    devMax = 1;
  }
  if (devMin === devMax) {
    devMin -= 1;
    devMax += 1;
  }
  if (devMin > 0) devMin = 0;
  if (devMax < 0) devMax = 0;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syDev = (y: number): number =>
    devBottom - ((y - devMin) / (devMax - devMin)) * (devBottom - devTop);

  let pricePath = '';
  const priceDots: ChartLineDemaCrossDot[] = [];
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

  let demaPath = '';
  let demaFirst = true;
  for (const s of run.samples) {
    if (s.dema == null) {
      demaFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPrice(s.dema);
    demaPath += `${demaFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    demaFirst = false;
  }
  demaPath = demaPath.trim();

  let deviationPath = '';
  let devFirst = true;
  for (const s of run.samples) {
    if (s.deviation == null) {
      devFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syDev(s.deviation);
    deviationPath += `${devFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    devFirst = false;
  }
  deviationPath = deviationPath.trim();

  const markers: ChartLineDemaCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syPrice(s.close),
      close: s.close,
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
    devTop,
    devBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    demaPath,
    deviationPath,
    markers,
    priceMin,
    priceMax,
    devMin,
    devMax,
    zeroY: syDev(0),
    run,
  };
}

export function describeLineDemaCrossChart(
  data: ChartLineDemaCrossPoint[],
  options: { length?: number } = {},
): string {
  const cleaned = getLineDemaCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineDemaCrossLength(
    options.length,
    DEFAULT_CHART_LINE_DEMA_CROSS_LENGTH,
  );
  return (
    `DEMA Cross chart over ${cleaned.length} bars (length ${length}). ` +
    `Top panel overlays the close with the Double Exponential ` +
    `Moving Average; bottom panel renders the close - DEMA ` +
    `deviation with markers at every close-vs-DEMA cross (up -> ` +
    `trending-up, down -> trending-down).`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultDeviationFormatter = (value: number): string =>
  formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineDemaCross = forwardRef<
  HTMLDivElement,
  ChartLineDemaCrossProps
>(function ChartLineDemaCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_DEMA_CROSS_LENGTH,
    width = DEFAULT_CHART_LINE_DEMA_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_DEMA_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_DEMA_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_DEMA_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_DEMA_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DEMA_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DEMA_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_DEMA_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DEMA_CROSS_PRICE_COLOR,
    demaColor = DEFAULT_CHART_LINE_DEMA_CROSS_DEMA_COLOR,
    deviationColor = DEFAULT_CHART_LINE_DEMA_CROSS_DEVIATION_COLOR,
    bullishColor = DEFAULT_CHART_LINE_DEMA_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_DEMA_CROSS_BEARISH_COLOR,
    zeroColor = DEFAULT_CHART_LINE_DEMA_CROSS_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_DEMA_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_DEMA_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showDema = true,
    showDeviation = true,
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
    formatDeviation = defaultDeviationFormatter,
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
    () => getLineDemaCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineDemaCrossLayout({
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
    ChartLineDemaCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineDemaCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineDemaCrossSeriesId,
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
        data-section="chart-line-dema-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineDemaCrossChart(cleaned, { length });

  const showPrice = !hidden.has('price');
  const showDemaLine = !hidden.has('dema') && showDema;
  const showDeviationLine = !hidden.has('deviation') && showDeviation;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickDevValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickDevValues.push(
      layout.devMin + ((layout.devMax - layout.devMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  const markerColor = (kind: 'up' | 'down'): string =>
    kind === 'up' ? bullishColor : bearishColor;

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'DEMA Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-dema-cross"
      data-length={length}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-dema-cross-title"
      >
        {ariaLabel ?? 'DEMA Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-dema-cross-aria-desc"
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
        data-section="chart-line-dema-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-dema-cross-grid">
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
                  data-section="chart-line-dema-cross-grid-line-price"
                />
              );
            })}
            {tickDevValues.map((v, i) => {
              const y =
                layout.devBottom -
                ((v - layout.devMin) /
                  (layout.devMax - layout.devMin)) *
                  (layout.devBottom - layout.devTop);
              return (
                <line
                  key={`grid-dev-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-dema-cross-grid-line-dev"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-dema-cross-axes">
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
              y1={layout.devTop}
              x2={layout.innerLeft}
              y2={layout.devBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.devBottom}
              x2={layout.innerRight}
              y2={layout.devBottom}
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
                  data-section="chart-line-dema-cross-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickDevValues.map((v, i) => {
              const y =
                layout.devBottom -
                ((v - layout.devMin) /
                  (layout.devMax - layout.devMin)) *
                  (layout.devBottom - layout.devTop);
              return (
                <text
                  key={`tick-dev-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-dema-cross-tick-dev"
                >
                  {formatDeviation(v)}
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
            data-section="chart-line-dema-cross-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-dema-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-dema-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-dema-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showDemaLine ? (
          <path
            d={layout.demaPath}
            stroke={demaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-dema-cross-dema"
          />
        ) : null}

        {showDeviationLine ? (
          <path
            d={layout.deviationPath}
            stroke={deviationColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-dema-cross-deviation"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-dema-cross-markers">
            {layout.markers.map((m) => (
              <circle
                key={`marker-${m.index}-${m.kind}`}
                cx={m.cx}
                cy={m.cy}
                r={markerRadius}
                fill={markerColor(m.kind)}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onCrossClick?.({ point: sample });
                }}
                data-section="chart-line-dema-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-dema-cross-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.devBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-dema-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-dema-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={200}
                  height={154}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-tooltip-ema1"
                >
                  ema1{' '}
                  {tooltipSample.ema1 == null
                    ? '--'
                    : formatPrice(tooltipSample.ema1)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-tooltip-ema2"
                >
                  ema2{' '}
                  {tooltipSample.ema2 == null
                    ? '--'
                    : formatPrice(tooltipSample.ema2)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-tooltip-dema"
                >
                  dema{' '}
                  {tooltipSample.dema == null
                    ? '--'
                    : formatPrice(tooltipSample.dema)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-tooltip-deviation"
                >
                  deviation{' '}
                  {tooltipSample.deviation == null
                    ? '--'
                    : formatDeviation(tooltipSample.deviation)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={142}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-tooltip-counts"
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
          data-section="chart-line-dema-cross-badge"
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
          data-section="chart-line-dema-cross-legend"
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
              { id: 'dema' as const, color: demaColor, label: 'dema' },
              {
                id: 'deviation' as const,
                color: deviationColor,
                label: 'deviation',
              },
            ] satisfies Array<{
              id: ChartLineDemaCrossSeriesId;
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

ChartLineDemaCross.displayName = 'ChartLineDemaCross';
