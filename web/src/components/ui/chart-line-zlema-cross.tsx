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
 * ChartLineZlemaCross -- pure-SVG dual-panel chart with the close
 * overlaid with Ehlers' Zero-Lag EMA in the top panel and the
 * `close - ZLEMA` deviation in the bottom panel. Markers fire at
 * every close-vs-ZLEMA crossover -- the canonical lag-corrected
 * trend event.
 *
 *   lag         = floor((length - 1) / 2)
 *   adjusted[i] = 2 * close[i] - close[i - lag]    (i >= lag)
 *   ZLEMA[i]    = EMA(adjusted, length)
 *
 * The `2x` term cancels the natural EMA lag of `(n - 1) / 2` for
 * a linear series, so ZLEMA tracks the close more tightly than a
 * plain EMA. Cross detection uses the standard prev-relation +
 * strict-inequality guard.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: `adjusted = 2K - K = K`. The EMA helper
 *   carries the SMA-seeded `min === max` precision fix, so
 *   ZLEMA = K bit-exactly once seeded. `close - ZLEMA = 0`,
 *   relation `equal` forever, zero crosses. Verified across
 *   multiple K and length tuples.
 *
 * Soft anchor:
 *
 * - **LINEAR UP / DOWN**: ZLEMA's design cancels the EMA lag on
 *   a perfectly linear series, so ZLEMA tracks close in steady
 *   state (close - ZLEMA -> 0). Small 1-ULP drift can produce
 *   incidental crosses near the warmup boundary; the test only
 *   asserts that the deviation magnitude stays small (< 1.0)
 *   well into the series.
 */

export interface ChartLineZlemaCrossPoint {
  x: number;
  close: number;
}

export type ChartLineZlemaCrossRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLineZlemaCrossCross = 'up' | 'down' | null;

export type ChartLineZlemaCrossRegime =
  | 'trending-up'
  | 'trending-down'
  | 'aligned'
  | 'none';

export type ChartLineZlemaCrossSeriesId =
  | 'price'
  | 'zlema'
  | 'deviation';

export interface ChartLineZlemaCrossSample {
  index: number;
  x: number;
  close: number;
  adjusted: number | null;
  zlema: number | null;
  deviation: number | null;
  relation: ChartLineZlemaCrossRelation;
  regime: ChartLineZlemaCrossRegime;
  crossed: ChartLineZlemaCrossCross;
}

export interface ChartLineZlemaCrossRun {
  series: ChartLineZlemaCrossPoint[];
  length: number;
  lag: number;
  adjustedValues: Array<number | null>;
  zlemaValues: Array<number | null>;
  deviationValues: Array<number | null>;
  samples: ChartLineZlemaCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  trendingUpCount: number;
  trendingDownCount: number;
  alignedCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineZlemaCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  kind: 'up' | 'down';
}

export interface ChartLineZlemaCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineZlemaCrossLayout {
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
  priceDots: ChartLineZlemaCrossDot[];
  zlemaPath: string;
  deviationPath: string;
  markers: ChartLineZlemaCrossMarker[];
  priceMin: number;
  priceMax: number;
  devMin: number;
  devMax: number;
  zeroY: number;
  run: ChartLineZlemaCrossRun;
}

export interface ChartLineZlemaCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineZlemaCrossPoint[];
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
  zlemaColor?: string;
  deviationColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showZlema?: boolean;
  showDeviation?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineZlemaCrossSeriesId[];
  defaultHiddenSeries?: ChartLineZlemaCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineZlemaCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineZlemaCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatDeviation?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ZLEMA_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_ZLEMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_DEVIATION_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineZlemaCrossFinitePoints(
  data: readonly ChartLineZlemaCrossPoint[] | null | undefined,
): ChartLineZlemaCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineZlemaCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineZlemaCrossLength(
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
export function applyLineZlemaCrossEma(
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

export interface LineZlemaCrossChannels {
  adjusted: Array<number | null>;
  zlema: Array<number | null>;
  lag: number;
}

export function computeLineZlemaCross(
  series: readonly ChartLineZlemaCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineZlemaCrossChannels {
  const cleaned = getLineZlemaCrossFinitePoints(series);
  const length = normalizeLineZlemaCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ZLEMA_CROSS_LENGTH,
  );
  const lag = Math.floor((length - 1) / 2);

  if (cleaned.length === 0) {
    return { adjusted: [], zlema: [], lag };
  }

  const closes = cleaned.map((p) => p.close);
  const adjusted: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = lag; i < closes.length; i += 1) {
    const cur = closes[i];
    const past = closes[i - lag];
    if (cur == null || past == null) continue;
    adjusted[i] = posZero(2 * cur - past);
  }
  const zlema = applyLineZlemaCrossEma(adjusted, length);
  return { adjusted, zlema, lag };
}

export function classifyLineZlemaCrossRelation(
  close: number | null,
  zlema: number | null,
): ChartLineZlemaCrossRelation {
  if (close == null || zlema == null) return 'none';
  if (close > zlema) return 'bullish';
  if (close < zlema) return 'bearish';
  return 'equal';
}

export function classifyLineZlemaCrossRegime(
  relation: ChartLineZlemaCrossRelation,
): ChartLineZlemaCrossRegime {
  if (relation === 'bullish') return 'trending-up';
  if (relation === 'bearish') return 'trending-down';
  if (relation === 'equal') return 'aligned';
  return 'none';
}

export function detectLineZlemaCrossCrosses(
  closes: readonly (number | null)[],
  zlemas: readonly (number | null)[],
): ChartLineZlemaCrossCross[] {
  const out: ChartLineZlemaCrossCross[] = [];
  let prevClose: number | null = null;
  let prevZlema: number | null = null;
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i];
    const z = zlemas[i];
    if (c == null || z == null) {
      out.push(null);
      prevClose = null;
      prevZlema = null;
      continue;
    }
    if (prevClose == null || prevZlema == null) {
      out.push(null);
      prevClose = c;
      prevZlema = z;
      continue;
    }
    if (prevClose <= prevZlema && c > z) {
      out.push('up');
    } else if (prevClose >= prevZlema && c < z) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevClose = c;
    prevZlema = z;
  }
  return out;
}

export function runLineZlemaCross(
  data: ChartLineZlemaCrossPoint[],
  options: { length?: number } = {},
): ChartLineZlemaCrossRun {
  const cleaned = getLineZlemaCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineZlemaCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ZLEMA_CROSS_LENGTH,
  );

  const channels = computeLineZlemaCross(series, { length });
  const closes = series.map((p) => p.close);
  const crosses = detectLineZlemaCrossCrosses(closes, channels.zlema);

  const samples: ChartLineZlemaCrossSample[] = series.map((p, i) => {
    const adjusted = channels.adjusted[i] ?? null;
    const zlema = channels.zlema[i] ?? null;
    const relation = classifyLineZlemaCrossRelation(p.close, zlema);
    const regime = classifyLineZlemaCrossRegime(relation);
    const crossed = crosses[i] ?? null;
    const deviation = zlema == null ? null : posZero(p.close - zlema);
    return {
      index: i,
      x: p.x,
      close: p.close,
      adjusted,
      zlema,
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

  const ok = series.length > length + channels.lag;

  return {
    series = [],
    length,
    lag: channels.lag,
    adjustedValues: channels.adjusted,
    zlemaValues: channels.zlema,
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

export interface ComputeLineZlemaCrossLayoutOptions {
  data: ChartLineZlemaCrossPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineZlemaCrossLayout(
  opts: ComputeLineZlemaCrossLayoutOptions,
): ChartLineZlemaCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ZLEMA_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ZLEMA_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_ZLEMA_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_ZLEMA_CROSS_PANEL_GAP;

  const run = runLineZlemaCross(opts.data, {
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
      zlemaPath: '',
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
    if (s.zlema != null) {
      if (s.zlema < priceMin) priceMin = s.zlema;
      if (s.zlema > priceMax) priceMax = s.zlema;
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
  const priceDots: ChartLineZlemaCrossDot[] = [];
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

  let zlemaPath = '';
  let zlemaFirst = true;
  for (const s of run.samples) {
    if (s.zlema == null) {
      zlemaFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPrice(s.zlema);
    zlemaPath += `${zlemaFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    zlemaFirst = false;
  }
  zlemaPath = zlemaPath.trim();

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

  const markers: ChartLineZlemaCrossMarker[] = [];
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
    zlemaPath,
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

export function describeLineZlemaCrossChart(
  data: ChartLineZlemaCrossPoint[],
  options: { length?: number } = {},
): string {
  const cleaned = getLineZlemaCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineZlemaCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ZLEMA_CROSS_LENGTH,
  );
  return (
    `ZLEMA Cross chart over ${cleaned.length} bars (length ` +
    `${length}). Top panel overlays the close with Ehlers ` +
    `Zero-Lag EMA; bottom panel renders the close - ZLEMA ` +
    `deviation with markers at every close-vs-ZLEMA cross ` +
    `(up -> trending-up, down -> trending-down).`
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

export const ChartLineZlemaCross = forwardRef<
  HTMLDivElement,
  ChartLineZlemaCrossProps
>(function ChartLineZlemaCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_ZLEMA_CROSS_LENGTH,
    width = DEFAULT_CHART_LINE_ZLEMA_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_ZLEMA_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ZLEMA_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_ZLEMA_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ZLEMA_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ZLEMA_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ZLEMA_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_ZLEMA_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ZLEMA_CROSS_PRICE_COLOR,
    zlemaColor = DEFAULT_CHART_LINE_ZLEMA_CROSS_ZLEMA_COLOR,
    deviationColor = DEFAULT_CHART_LINE_ZLEMA_CROSS_DEVIATION_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ZLEMA_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ZLEMA_CROSS_BEARISH_COLOR,
    zeroColor = DEFAULT_CHART_LINE_ZLEMA_CROSS_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_ZLEMA_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ZLEMA_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showZlema = true,
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
    () => getLineZlemaCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineZlemaCrossLayout({
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
    ChartLineZlemaCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineZlemaCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineZlemaCrossSeriesId,
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
        data-section="chart-line-zlema-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineZlemaCrossChart(cleaned, { length });

  const showPrice = !hidden.has('price');
  const showZlemaLine = !hidden.has('zlema') && showZlema;
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
      aria-label={ariaLabel ?? 'ZLEMA Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-zlema-cross"
      data-length={length}
      data-lag={layout.run.lag}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-zlema-cross-title"
      >
        {ariaLabel ?? 'ZLEMA Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-zlema-cross-aria-desc"
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
        data-section="chart-line-zlema-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-zlema-cross-grid">
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
                  data-section="chart-line-zlema-cross-grid-line-price"
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
                  data-section="chart-line-zlema-cross-grid-line-dev"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-zlema-cross-axes">
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
                  data-section="chart-line-zlema-cross-tick-price"
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
                  data-section="chart-line-zlema-cross-tick-dev"
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
            data-section="chart-line-zlema-cross-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-zlema-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-zlema-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-zlema-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showZlemaLine ? (
          <path
            d={layout.zlemaPath}
            stroke={zlemaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-zlema-cross-zlema"
          />
        ) : null}

        {showDeviationLine ? (
          <path
            d={layout.deviationPath}
            stroke={deviationColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-zlema-cross-deviation"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-zlema-cross-markers">
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
                data-section="chart-line-zlema-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-zlema-cross-hover-targets">
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
                data-section="chart-line-zlema-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-zlema-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={196}
                  height={140}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-zlema-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-zlema-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-zlema-cross-tooltip-adjusted"
                >
                  adjusted{' '}
                  {tooltipSample.adjusted == null
                    ? '--'
                    : formatPrice(tooltipSample.adjusted)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-zlema-cross-tooltip-zlema"
                >
                  zlema{' '}
                  {tooltipSample.zlema == null
                    ? '--'
                    : formatPrice(tooltipSample.zlema)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-zlema-cross-tooltip-deviation"
                >
                  deviation{' '}
                  {tooltipSample.deviation == null
                    ? '--'
                    : formatDeviation(tooltipSample.deviation)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-zlema-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-zlema-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-zlema-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-zlema-cross-tooltip-counts"
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
          data-section="chart-line-zlema-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | lag {layout.run.lag} | up{' '}
          {layout.run.upCrossCount} | down {layout.run.downCrossCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-zlema-cross-legend"
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
              { id: 'zlema' as const, color: zlemaColor, label: 'zlema' },
              {
                id: 'deviation' as const,
                color: deviationColor,
                label: 'deviation',
              },
            ] satisfies Array<{
              id: ChartLineZlemaCrossSeriesId;
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

ChartLineZlemaCross.displayName = 'ChartLineZlemaCross';
