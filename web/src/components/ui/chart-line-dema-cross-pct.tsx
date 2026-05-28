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
 * ChartLineDemaCrossPct -- pure-SVG dual-panel chart with the
 * close overlaid with the Double Exponential Moving Average
 * (DEMA) in the top panel and the `close - DEMA` deviation
 * scaled to the close as a percent in the bottom panel. The
 * percent normalisation makes the lag-corrected DEMA momentum
 * comparable across instruments at different price magnitudes:
 *
 *   ema1[i]    = EMA(close, length)
 *   ema2[i]    = EMA(ema1,  length)
 *   DEMA[i]    = 2 * ema1[i] - ema2[i]
 *   demaPct[i] = close[i] === 0 ? null
 *                               : (close[i] - DEMA[i]) / close[i] * 100
 *
 * Regime classifier: `above` (demaPct > 0), `below` (< 0),
 * `at` (= 0), `none` (null). Defaults: `length = 14`.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K (K > 0)**: both EMAs in the chain collapse
 *   to K via the SMA-seeded `min === max` precision fix.
 *   `DEMA = 2K - K = K`, deviation = 0, `demaPct = 0 / K * 100 =
 *   0`. Regime `at` everywhere after warmup. Verified across
 *   multiple K and length tuples. K = 0 triggers the divide-by-
 *   zero guard -> demaPct = null.
 */

export interface ChartLineDemaCrossPctPoint {
  x: number;
  close: number;
}

export type ChartLineDemaCrossPctRegime =
  | 'above'
  | 'below'
  | 'at'
  | 'none';

export type ChartLineDemaCrossPctSeriesId = 'price' | 'dema' | 'demaPct';

export interface ChartLineDemaCrossPctSample {
  index: number;
  x: number;
  close: number;
  dema: number | null;
  demaPct: number | null;
  regime: ChartLineDemaCrossPctRegime;
}

export interface ChartLineDemaCrossPctRun {
  series: ChartLineDemaCrossPctPoint[];
  length: number;
  demaValues: Array<number | null>;
  demaPctValues: Array<number | null>;
  samples: ChartLineDemaCrossPctSample[];
  aboveCount: number;
  belowCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineDemaCrossPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineDemaCrossPctLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  pctTop: number;
  pctBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineDemaCrossPctDot[];
  demaPath: string;
  pctPath: string;
  priceMin: number;
  priceMax: number;
  pctMin: number;
  pctMax: number;
  zeroY: number;
  run: ChartLineDemaCrossPctRun;
}

export interface ChartLineDemaCrossPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineDemaCrossPctPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  demaColor?: string;
  pctColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showDema?: boolean;
  showPct?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineDemaCrossPctSeriesId[];
  defaultHiddenSeries?: ChartLineDemaCrossPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineDemaCrossPctSeriesId;
    hidden: boolean;
  }) => void;
  formatPrice?: (value: number) => string;
  formatPct?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_DEMA_CROSS_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_DEMA_CROSS_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_DEMA_CROSS_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_DEMA_CROSS_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_DEMA_CROSS_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DEMA_CROSS_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DEMA_CROSS_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DEMA_CROSS_PCT_LENGTH = 14;
export const DEFAULT_CHART_LINE_DEMA_CROSS_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_DEMA_CROSS_PCT_DEMA_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DEMA_CROSS_PCT_PCT_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_DEMA_CROSS_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_DEMA_CROSS_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DEMA_CROSS_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineDemaCrossPctFinitePoints(
  data: readonly ChartLineDemaCrossPctPoint[] | null | undefined,
): ChartLineDemaCrossPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineDemaCrossPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineDemaCrossPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * SMA-seeded EMA chain with the `min === max` window-constant
 * precision fix and CONST short-circuit on the recursion.
 */
export function applyLineDemaCrossPctEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);

  let seedSum = 0;
  let seedCount = 0;
  let winMin = Infinity;
  let winMax = -Infinity;
  for (let i = 0; i < values.length && seedCount < length; i += 1) {
    const v = values[i];
    if (v == null) {
      seedSum = 0;
      seedCount = 0;
      winMin = Infinity;
      winMax = -Infinity;
      continue;
    }
    seedSum += v;
    seedCount += 1;
    if (v < winMin) winMin = v;
    if (v > winMax) winMax = v;
    if (seedCount === length) {
      const seed =
        winMin === winMax && Number.isFinite(winMin)
          ? winMin
          : posZero(seedSum / length);
      out[i] = seed;
      let prev = seed;
      for (let j = i + 1; j < values.length; j += 1) {
        const nv = values[j];
        if (nv == null) {
          break;
        }
        const next = nv === prev ? nv : posZero(alpha * nv + (1 - alpha) * prev);
        out[j] = next;
        prev = next;
      }
      break;
    }
  }
  return out;
}

export interface LineDemaCrossPctChannels {
  dema: Array<number | null>;
  demaPct: Array<number | null>;
}

export function computeLineDemaCrossPct(
  series: readonly ChartLineDemaCrossPctPoint[] | null | undefined,
  options: { length?: number } = {},
): LineDemaCrossPctChannels {
  const cleaned = getLineDemaCrossPctFinitePoints(series);
  if (cleaned.length === 0) {
    return { dema: [], demaPct: [] };
  }
  const length = normalizeLineDemaCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_DEMA_CROSS_PCT_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const ema1 = applyLineDemaCrossPctEma(closes, length);
  const ema2 = applyLineDemaCrossPctEma(ema1, length);
  const dema: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const a = ema1[i];
    const b = ema2[i];
    if (a == null || b == null) continue;
    dema[i] = posZero(2 * a - b);
  }
  const demaPct: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const d = dema[i];
    if (d == null) continue;
    const c = closes[i]!;
    if (c === 0) continue;
    demaPct[i] = posZero(((c - d) / c) * 100);
  }
  return { dema, demaPct };
}

export function classifyLineDemaCrossPctRegime(
  demaPct: number | null,
): ChartLineDemaCrossPctRegime {
  if (demaPct == null) return 'none';
  if (demaPct > 0) return 'above';
  if (demaPct < 0) return 'below';
  return 'at';
}

export function runLineDemaCrossPct(
  data: ChartLineDemaCrossPctPoint[],
  options: { length?: number } = {},
): ChartLineDemaCrossPctRun {
  const cleaned = getLineDemaCrossPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineDemaCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_DEMA_CROSS_PCT_LENGTH,
  );

  const channels = computeLineDemaCrossPct(series, { length });

  const samples: ChartLineDemaCrossPctSample[] = series.map((p, i) => {
    const dema = channels.dema[i] ?? null;
    const demaPct = channels.demaPct[i] ?? null;
    const regime = classifyLineDemaCrossPctRegime(demaPct);
    return {
      index: i,
      x: p.x,
      close: p.close,
      dema,
      demaPct,
      regime,
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let atCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'above') aboveCount += 1;
    else if (s.regime === 'below') belowCount += 1;
    else if (s.regime === 'at') atCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length;

  return {
    series = [],
    length,
    demaValues: channels.dema,
    demaPctValues: channels.demaPct,
    samples,
    aboveCount,
    belowCount,
    atCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineDemaCrossPctLayoutOptions {
  data: ChartLineDemaCrossPctPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineDemaCrossPctLayout(
  opts: ComputeLineDemaCrossPctLayoutOptions,
): ChartLineDemaCrossPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_DEMA_CROSS_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_DEMA_CROSS_PCT_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_DEMA_CROSS_PCT_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_DEMA_CROSS_PCT_PANEL_GAP;

  const run = runLineDemaCrossPct(opts.data, {
    length: opts.length ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const pctTop = priceBottom + panelGap;
  const pctBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      pctTop,
      pctBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      demaPath: '',
      pctPath: '',
      priceMin: 0,
      priceMax: 0,
      pctMin: -1,
      pctMax: 1,
      zeroY: (pctTop + pctBottom) / 2,
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

  let pctMin = Infinity;
  let pctMax = -Infinity;
  for (const s of run.samples) {
    if (s.demaPct == null) continue;
    if (s.demaPct < pctMin) pctMin = s.demaPct;
    if (s.demaPct > pctMax) pctMax = s.demaPct;
  }
  if (!Number.isFinite(pctMin) || !Number.isFinite(pctMax)) {
    pctMin = -1;
    pctMax = 1;
  }
  if (pctMin === pctMax) {
    pctMin -= 1;
    pctMax += 1;
  }
  if (pctMin > 0) pctMin = 0;
  if (pctMax < 0) pctMax = 0;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syPct = (y: number): number =>
    pctBottom - ((y - pctMin) / (pctMax - pctMin)) * (pctBottom - pctTop);

  let pricePath = '';
  const priceDots: ChartLineDemaCrossPctDot[] = [];
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

  let pctPath = '';
  let pctFirst = true;
  for (const s of run.samples) {
    if (s.demaPct == null) {
      pctFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPct(s.demaPct);
    pctPath += `${pctFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    pctFirst = false;
  }
  pctPath = pctPath.trim();

  return {
    ok: true,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    pctTop,
    pctBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    demaPath,
    pctPath,
    priceMin,
    priceMax,
    pctMin,
    pctMax,
    zeroY: syPct(0),
    run,
  };
}

export function describeLineDemaCrossPctChart(
  data: ChartLineDemaCrossPctPoint[],
  options: { length?: number } = {},
): string {
  const cleaned = getLineDemaCrossPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineDemaCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_DEMA_CROSS_PCT_LENGTH,
  );
  return (
    `DEMA Cross Pct chart over ${cleaned.length} bars (length ` +
    `${length}). Top panel overlays the close with the Double ` +
    `Exponential Moving Average; bottom panel renders the (close ` +
    `- DEMA) / close * 100 percent deviation scaled to price ` +
    `magnitude for cross-instrument comparable lag-corrected ` +
    `trend momentum.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultPctFormatter = (value: number): string => formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineDemaCrossPct = forwardRef<
  HTMLDivElement,
  ChartLineDemaCrossPctProps
>(function ChartLineDemaCrossPct(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_DEMA_CROSS_PCT_LENGTH,
    width = DEFAULT_CHART_LINE_DEMA_CROSS_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_DEMA_CROSS_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_DEMA_CROSS_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_DEMA_CROSS_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_DEMA_CROSS_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DEMA_CROSS_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DEMA_CROSS_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DEMA_CROSS_PCT_PRICE_COLOR,
    demaColor = DEFAULT_CHART_LINE_DEMA_CROSS_PCT_DEMA_COLOR,
    pctColor = DEFAULT_CHART_LINE_DEMA_CROSS_PCT_PCT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_DEMA_CROSS_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_DEMA_CROSS_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_DEMA_CROSS_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showDema = true,
    showPct = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    formatPrice = defaultPriceFormatter,
    formatPct = defaultPctFormatter,
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
    () => getLineDemaCrossPctFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineDemaCrossPctLayout({
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
    ChartLineDemaCrossPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineDemaCrossPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineDemaCrossPctSeriesId,
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
        data-section="chart-line-dema-cross-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineDemaCrossPctChart(cleaned, { length });

  const showPrice = !hidden.has('price');
  const showDemaLine = !hidden.has('dema') && showDema;
  const showPctLine = !hidden.has('demaPct') && showPct;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickPctValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPctValues.push(
      layout.pctMin + ((layout.pctMax - layout.pctMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'DEMA Cross Percent chart'}
      aria-describedby={descId}
      data-section="chart-line-dema-cross-pct"
      data-length={length}
      data-total-points={cleaned.length}
      data-above-count={layout.run.aboveCount}
      data-below-count={layout.run.belowCount}
      data-at-count={layout.run.atCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-dema-cross-pct-title"
      >
        {ariaLabel ?? 'DEMA Cross Percent chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-dema-cross-pct-aria-desc"
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
        data-section="chart-line-dema-cross-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-dema-cross-pct-grid">
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
                  data-section="chart-line-dema-cross-pct-grid-line-price"
                />
              );
            })}
            {tickPctValues.map((v, i) => {
              const y =
                layout.pctBottom -
                ((v - layout.pctMin) /
                  (layout.pctMax - layout.pctMin)) *
                  (layout.pctBottom - layout.pctTop);
              return (
                <line
                  key={`grid-pct-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-dema-cross-pct-grid-line-pct"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-dema-cross-pct-axes">
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
              y1={layout.pctTop}
              x2={layout.innerLeft}
              y2={layout.pctBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.pctBottom}
              x2={layout.innerRight}
              y2={layout.pctBottom}
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
                  data-section="chart-line-dema-cross-pct-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickPctValues.map((v, i) => {
              const y =
                layout.pctBottom -
                ((v - layout.pctMin) /
                  (layout.pctMax - layout.pctMin)) *
                  (layout.pctBottom - layout.pctTop);
              return (
                <text
                  key={`tick-pct-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-dema-cross-pct-tick-pct"
                >
                  {formatPct(v)}
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
            data-section="chart-line-dema-cross-pct-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-dema-cross-pct-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-dema-cross-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-dema-cross-pct-price-dot"
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
            data-section="chart-line-dema-cross-pct-dema"
          />
        ) : null}

        {showPctLine ? (
          <path
            d={layout.pctPath}
            stroke={pctColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-dema-cross-pct-pct"
          />
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-dema-cross-pct-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.pctBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-dema-cross-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-dema-cross-pct-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={196}
                  height={116}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-pct-tooltip-dema"
                >
                  dema{' '}
                  {tooltipSample.dema == null
                    ? '--'
                    : formatPrice(tooltipSample.dema)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-pct-tooltip-pct"
                >
                  demaPct{' '}
                  {tooltipSample.demaPct == null
                    ? '--'
                    : formatPct(tooltipSample.demaPct)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-pct-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-pct-tooltip-counts"
                >
                  above {layout.run.aboveCount} | below{' '}
                  {layout.run.belowCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dema-cross-pct-tooltip-counts2"
                >
                  at {layout.run.atCount} | none {layout.run.noneCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-dema-cross-pct-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | above {layout.run.aboveCount} | below{' '}
          {layout.run.belowCount} | at {layout.run.atCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-dema-cross-pct-legend"
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
                id: 'demaPct' as const,
                color: pctColor,
                label: 'demaPct',
              },
            ] satisfies Array<{
              id: ChartLineDemaCrossPctSeriesId;
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

ChartLineDemaCrossPct.displayName = 'ChartLineDemaCrossPct';
