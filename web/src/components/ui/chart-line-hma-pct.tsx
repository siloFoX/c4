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
 * ChartLineHmaPct -- pure-SVG dual-panel chart with the close on
 * top overlaid with the Hull Moving Average and the HMA percent
 * deviation in the bottom panel:
 *
 *   wma1[i]  = WMA(close, floor(length / 2))
 *   wma2[i]  = WMA(close, length)
 *   raw[i]   = 2 * wma1[i] - wma2[i]
 *   HMA[i]   = WMA(raw, floor(sqrt(length)))
 *   hmaPct[i] = HMA[i] === 0 ? null
 *                            : (close[i] - HMA[i]) / HMA[i] * 100
 *
 * Regime classifier: `above` when hmaPct > 0, `below` when < 0,
 * `at` when exactly 0, `none` when null. Defaults `length = 9`
 * (classic Hull period); the WMA helper carries a `min === max`
 * window-constant precision fix so constant inputs lock onto
 * their values exactly.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: every WMA in the chain collapses to K
 *   via the precision fix. raw = 2K - K = K, HMA = K, deviation
 *   = 0, `hmaPct = 0 / K * 100 = 0` (or `null` when K === 0).
 *
 * Algebraic soft anchors:
 *
 * - **LINEAR UP close = i + 1**: the Hull formula's well-known
 *   property is that it perfectly tracks a linear series, so the
 *   exact HMA[i] = i + 1 = close[i] and hmaPct = 0. Floating-
 *   point intermediates (1/3 is non-dyadic) introduce a small
 *   1-ULP drift; the test asserts hmaPct is close to zero rather
 *   than exactly zero.
 * - **LINEAR DOWN**: mirror image, same near-zero hmaPct.
 */

export interface ChartLineHmaPctPoint {
  x: number;
  close: number;
}

export type ChartLineHmaPctRegime = 'above' | 'below' | 'at' | 'none';

export type ChartLineHmaPctSeriesId = 'price' | 'hma' | 'pct';

export interface ChartLineHmaPctSample {
  index: number;
  x: number;
  close: number;
  hma: number | null;
  hmaPct: number | null;
  regime: ChartLineHmaPctRegime;
}

export interface ChartLineHmaPctRun {
  series: ChartLineHmaPctPoint[];
  length: number;
  hmaValues: Array<number | null>;
  hmaPctValues: Array<number | null>;
  samples: ChartLineHmaPctSample[];
  aboveCount: number;
  belowCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineHmaPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineHmaPctLayout {
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
  priceDots: ChartLineHmaPctDot[];
  hmaPath: string;
  pctPath: string;
  priceMin: number;
  priceMax: number;
  pctMin: number;
  pctMax: number;
  zeroY: number;
  run: ChartLineHmaPctRun;
}

export interface ChartLineHmaPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineHmaPctPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  hmaColor?: string;
  pctColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showHma?: boolean;
  showPct?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineHmaPctSeriesId[];
  defaultHiddenSeries?: ChartLineHmaPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineHmaPctSeriesId;
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

export const DEFAULT_CHART_LINE_HMA_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_HMA_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_HMA_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_HMA_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_HMA_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HMA_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HMA_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HMA_PCT_LENGTH = 9;
export const DEFAULT_CHART_LINE_HMA_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_HMA_PCT_HMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_HMA_PCT_PCT_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_HMA_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_HMA_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_HMA_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineHmaPctFinitePoints(
  data: readonly ChartLineHmaPctPoint[] | null | undefined,
): ChartLineHmaPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineHmaPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineHmaPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * Linear-weighted moving average with the `min === max` window-
 * constant precision fix.
 */
export function applyLineHmaPctWma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const denom = (length * (length + 1)) / 2;
  for (let i = length - 1; i < values.length; i += 1) {
    let num = 0;
    let winMin = Infinity;
    let winMax = -Infinity;
    let ok = true;
    for (let k = 0; k < length; k += 1) {
      const v = values[i - length + 1 + k];
      if (v == null) {
        ok = false;
        break;
      }
      num += (k + 1) * v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!ok) continue;
    out[i] =
      winMin === winMax && Number.isFinite(winMin)
        ? winMin
        : posZero(num / denom);
  }
  return out;
}

export interface LineHmaPctChannels {
  hma: Array<number | null>;
  hmaPct: Array<number | null>;
}

export function computeLineHmaPct(
  series: readonly ChartLineHmaPctPoint[] | null | undefined,
  options: { length?: number } = {},
): LineHmaPctChannels {
  const cleaned = getLineHmaPctFinitePoints(series);
  if (cleaned.length === 0) {
    return { hma: [], hmaPct: [] };
  }
  const length = normalizeLineHmaPctLength(
    options.length,
    DEFAULT_CHART_LINE_HMA_PCT_LENGTH,
  );
  const half = Math.max(1, Math.floor(length / 2));
  const sqrtLen = Math.max(1, Math.floor(Math.sqrt(length)));
  const closes = cleaned.map((p) => p.close);
  const wma1 = applyLineHmaPctWma(closes, half);
  const wma2 = applyLineHmaPctWma(closes, length);
  const raw: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const a = wma1[i];
    const b = wma2[i];
    if (a == null || b == null) continue;
    raw[i] = posZero(2 * a - b);
  }
  const hma = applyLineHmaPctWma(raw, sqrtLen);
  const hmaPct: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const h = hma[i];
    if (h == null) continue;
    if (h === 0) continue;
    hmaPct[i] = posZero(((closes[i]! - h) / h) * 100);
  }
  return { hma, hmaPct };
}

export function classifyLineHmaPctRegime(
  hmaPct: number | null,
): ChartLineHmaPctRegime {
  if (hmaPct == null) return 'none';
  if (hmaPct > 0) return 'above';
  if (hmaPct < 0) return 'below';
  return 'at';
}

export function runLineHmaPct(
  data: ChartLineHmaPctPoint[],
  options: { length?: number } = {},
): ChartLineHmaPctRun {
  const cleaned = getLineHmaPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineHmaPctLength(
    options.length,
    DEFAULT_CHART_LINE_HMA_PCT_LENGTH,
  );

  const channels = computeLineHmaPct(series, { length });

  const samples: ChartLineHmaPctSample[] = series.map((p, i) => {
    const hma = channels.hma[i] ?? null;
    const hmaPct = channels.hmaPct[i] ?? null;
    const regime = classifyLineHmaPctRegime(hmaPct);
    return {
      index: i,
      x: p.x,
      close: p.close,
      hma,
      hmaPct,
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
    series,
    length,
    hmaValues: channels.hma,
    hmaPctValues: channels.hmaPct,
    samples,
    aboveCount,
    belowCount,
    atCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineHmaPctLayoutOptions {
  data: ChartLineHmaPctPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineHmaPctLayout(
  opts: ComputeLineHmaPctLayoutOptions,
): ChartLineHmaPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_HMA_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_HMA_PCT_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_HMA_PCT_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_HMA_PCT_PANEL_GAP;

  const run = runLineHmaPct(opts.data, {
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
      hmaPath: '',
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
    if (s.hma != null) {
      if (s.hma < priceMin) priceMin = s.hma;
      if (s.hma > priceMax) priceMax = s.hma;
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
    if (s.hmaPct == null) continue;
    if (s.hmaPct < pctMin) pctMin = s.hmaPct;
    if (s.hmaPct > pctMax) pctMax = s.hmaPct;
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
  const priceDots: ChartLineHmaPctDot[] = [];
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

  let hmaPath = '';
  let hmaFirst = true;
  for (const s of run.samples) {
    if (s.hma == null) {
      hmaFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPrice(s.hma);
    hmaPath += `${hmaFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    hmaFirst = false;
  }
  hmaPath = hmaPath.trim();

  let pctPath = '';
  let pctFirst = true;
  for (const s of run.samples) {
    if (s.hmaPct == null) {
      pctFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPct(s.hmaPct);
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
    hmaPath,
    pctPath,
    priceMin,
    priceMax,
    pctMin,
    pctMax,
    zeroY: syPct(0),
    run,
  };
}

export function describeLineHmaPctChart(
  data: ChartLineHmaPctPoint[],
  options: { length?: number } = {},
): string {
  const cleaned = getLineHmaPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineHmaPctLength(
    options.length,
    DEFAULT_CHART_LINE_HMA_PCT_LENGTH,
  );
  return (
    `HMA Pct chart over ${cleaned.length} bars (length ${length}). ` +
    `Top panel renders the close overlaid with the Hull Moving ` +
    `Average; bottom panel renders the (close - HMA) / HMA * 100 ` +
    `percent deviation across the lookback.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultPctFormatter = (value: number): string => formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineHmaPct = forwardRef<
  HTMLDivElement,
  ChartLineHmaPctProps
>(function ChartLineHmaPct(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_HMA_PCT_LENGTH,
    width = DEFAULT_CHART_LINE_HMA_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_HMA_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_HMA_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_HMA_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_HMA_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_HMA_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_HMA_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_HMA_PCT_PRICE_COLOR,
    hmaColor = DEFAULT_CHART_LINE_HMA_PCT_HMA_COLOR,
    pctColor = DEFAULT_CHART_LINE_HMA_PCT_PCT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_HMA_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_HMA_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_HMA_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showHma = true,
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

  const cleaned = useMemo(() => getLineHmaPctFinitePoints(data), [data]);

  const layout = useMemo(
    () =>
      computeLineHmaPctLayout({
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
    ChartLineHmaPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineHmaPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineHmaPctSeriesId,
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
        data-section="chart-line-hma-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineHmaPctChart(cleaned, { length });

  const showPrice = !hidden.has('price');
  const showHmaLine = !hidden.has('hma') && showHma;
  const showPctLine = !hidden.has('pct') && showPct;

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
      aria-label={ariaLabel ?? 'HMA Percent chart'}
      aria-describedby={descId}
      data-section="chart-line-hma-pct"
      data-length={length}
      data-total-points={cleaned.length}
      data-above-count={layout.run.aboveCount}
      data-below-count={layout.run.belowCount}
      data-at-count={layout.run.atCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-hma-pct-title"
      >
        {ariaLabel ?? 'HMA Percent chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-hma-pct-aria-desc"
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
        data-section="chart-line-hma-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-hma-pct-grid">
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
                  data-section="chart-line-hma-pct-grid-line-price"
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
                  data-section="chart-line-hma-pct-grid-line-pct"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-hma-pct-axes">
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
                  data-section="chart-line-hma-pct-tick-price"
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
                  data-section="chart-line-hma-pct-tick-pct"
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
            data-section="chart-line-hma-pct-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-hma-pct-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-hma-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-hma-pct-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showHmaLine ? (
          <path
            d={layout.hmaPath}
            stroke={hmaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-hma-pct-hma"
          />
        ) : null}

        {showPctLine ? (
          <path
            d={layout.pctPath}
            stroke={pctColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-hma-pct-pct"
          />
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-hma-pct-hover-targets">
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
                data-section="chart-line-hma-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-hma-pct-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={188}
                  height={102}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hma-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hma-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hma-pct-tooltip-hma"
                >
                  hma{' '}
                  {tooltipSample.hma == null
                    ? '--'
                    : formatPrice(tooltipSample.hma)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hma-pct-tooltip-pct"
                >
                  hmaPct{' '}
                  {tooltipSample.hmaPct == null
                    ? '--'
                    : formatPct(tooltipSample.hmaPct)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hma-pct-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hma-pct-tooltip-counts"
                >
                  above {layout.run.aboveCount} | below{' '}
                  {layout.run.belowCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-hma-pct-badge"
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
          data-section="chart-line-hma-pct-legend"
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
              { id: 'hma' as const, color: hmaColor, label: 'hma' },
              { id: 'pct' as const, color: pctColor, label: 'hmaPct' },
            ] satisfies Array<{
              id: ChartLineHmaPctSeriesId;
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

ChartLineHmaPct.displayName = 'ChartLineHmaPct';
