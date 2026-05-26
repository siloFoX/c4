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
 * ChartLineTemaCrossPct -- pure-SVG dual-panel chart with the
 * close on top overlaid with the Triple Exponential Moving
 * Average (TEMA), and the `close - TEMA` deviation scaled to
 * the close as a percent on the bottom. The percent normalisation
 * makes the indicator comparable across instruments at different
 * price magnitudes:
 *
 *   ema1[i]     = EMA(close, length)
 *   ema2[i]     = EMA(ema1,  length)
 *   ema3[i]     = EMA(ema2,  length)
 *   TEMA[i]     = 3 * ema1[i] - 3 * ema2[i] + ema3[i]
 *   temaPct[i]  = close[i] === 0 ? null
 *                                : (close[i] - TEMA[i]) / close[i] * 100
 *
 * Regime classifier: `above` (temaPct > 0), `below` (< 0),
 * `at` (= 0), `none` (null). Defaults: `length = 14`.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K (K > 0)**: every EMA in the chain collapses
 *   to K via the SMA-seeded `min === max` precision fix.
 *   `TEMA = 3K - 3K + K = K`, deviation = 0, `temaPct = 0 / K *
 *   100 = 0`. Regime `at` everywhere after warmup. Verified
 *   across multiple K and length tuples. K = 0 triggers the
 *   divide-by-zero guard -> temaPct = null.
 */

export interface ChartLineTemaCrossPctPoint {
  x: number;
  close: number;
}

export type ChartLineTemaCrossPctRegime =
  | 'above'
  | 'below'
  | 'at'
  | 'none';

export type ChartLineTemaCrossPctSeriesId =
  | 'price'
  | 'tema'
  | 'temaPct';

export interface ChartLineTemaCrossPctSample {
  index: number;
  x: number;
  close: number;
  ema1: number | null;
  ema2: number | null;
  ema3: number | null;
  tema: number | null;
  temaPct: number | null;
  regime: ChartLineTemaCrossPctRegime;
}

export interface ChartLineTemaCrossPctRun {
  series: ChartLineTemaCrossPctPoint[];
  length: number;
  ema1Values: Array<number | null>;
  ema2Values: Array<number | null>;
  ema3Values: Array<number | null>;
  temaValues: Array<number | null>;
  temaPctValues: Array<number | null>;
  samples: ChartLineTemaCrossPctSample[];
  aboveCount: number;
  belowCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineTemaCrossPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTemaCrossPctLayout {
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
  priceDots: ChartLineTemaCrossPctDot[];
  temaPath: string;
  pctPath: string;
  priceMin: number;
  priceMax: number;
  pctMin: number;
  pctMax: number;
  zeroY: number;
  run: ChartLineTemaCrossPctRun;
}

export interface ChartLineTemaCrossPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTemaCrossPctPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  temaColor?: string;
  pctColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTema?: boolean;
  showPct?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTemaCrossPctSeriesId[];
  defaultHiddenSeries?: ChartLineTemaCrossPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTemaCrossPctSeriesId;
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

export const DEFAULT_CHART_LINE_TEMA_CROSS_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_TEMA_CROSS_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TEMA_CROSS_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_TEMA_CROSS_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TEMA_CROSS_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TEMA_CROSS_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TEMA_CROSS_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TEMA_CROSS_PCT_LENGTH = 14;
export const DEFAULT_CHART_LINE_TEMA_CROSS_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TEMA_CROSS_PCT_TEMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TEMA_CROSS_PCT_PCT_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_TEMA_CROSS_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_TEMA_CROSS_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TEMA_CROSS_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineTemaCrossPctFinitePoints(
  data: readonly ChartLineTemaCrossPctPoint[] | null | undefined,
): ChartLineTemaCrossPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTemaCrossPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineTemaCrossPctLength(
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
export function applyLineTemaCrossPctEma(
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

export interface LineTemaCrossPctChannels {
  ema1: Array<number | null>;
  ema2: Array<number | null>;
  ema3: Array<number | null>;
  tema: Array<number | null>;
  temaPct: Array<number | null>;
}

export function computeLineTemaCrossPct(
  series: readonly ChartLineTemaCrossPctPoint[] | null | undefined,
  options: { length?: number } = {},
): LineTemaCrossPctChannels {
  const cleaned = getLineTemaCrossPctFinitePoints(series);
  if (cleaned.length === 0) {
    return { ema1: [], ema2: [], ema3: [], tema: [], temaPct: [] };
  }
  const length = normalizeLineTemaCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_TEMA_CROSS_PCT_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const ema1 = applyLineTemaCrossPctEma(closes, length);
  const ema2 = applyLineTemaCrossPctEma(ema1, length);
  const ema3 = applyLineTemaCrossPctEma(ema2, length);
  const tema: Array<number | null> = new Array(closes.length).fill(null);
  const temaPct: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const a = ema1[i];
    const b = ema2[i];
    const c = ema3[i];
    if (a == null || b == null || c == null) continue;
    const t = 3 * a - 3 * b + c;
    tema[i] = posZero(t);
    const cl = closes[i]!;
    if (cl === 0) continue;
    temaPct[i] = posZero(((cl - t) / cl) * 100);
  }
  return { ema1, ema2, ema3, tema, temaPct };
}

export function classifyLineTemaCrossPctRegime(
  temaPct: number | null,
): ChartLineTemaCrossPctRegime {
  if (temaPct == null) return 'none';
  if (temaPct > 0) return 'above';
  if (temaPct < 0) return 'below';
  return 'at';
}

export function runLineTemaCrossPct(
  data: ChartLineTemaCrossPctPoint[],
  options: { length?: number } = {},
): ChartLineTemaCrossPctRun {
  const cleaned = getLineTemaCrossPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineTemaCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_TEMA_CROSS_PCT_LENGTH,
  );

  const channels = computeLineTemaCrossPct(series, { length });

  const samples: ChartLineTemaCrossPctSample[] = series.map((p, i) => {
    const ema1 = channels.ema1[i] ?? null;
    const ema2 = channels.ema2[i] ?? null;
    const ema3 = channels.ema3[i] ?? null;
    const tema = channels.tema[i] ?? null;
    const temaPct = channels.temaPct[i] ?? null;
    const regime = classifyLineTemaCrossPctRegime(temaPct);
    return {
      index: i,
      x: p.x,
      close: p.close,
      ema1,
      ema2,
      ema3,
      tema,
      temaPct,
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

  const ok = series.length > length * 3;

  return {
    series,
    length,
    ema1Values: channels.ema1,
    ema2Values: channels.ema2,
    ema3Values: channels.ema3,
    temaValues: channels.tema,
    temaPctValues: channels.temaPct,
    samples,
    aboveCount,
    belowCount,
    atCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineTemaCrossPctLayoutOptions {
  data: ChartLineTemaCrossPctPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineTemaCrossPctLayout(
  opts: ComputeLineTemaCrossPctLayoutOptions,
): ChartLineTemaCrossPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_TEMA_CROSS_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_TEMA_CROSS_PCT_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_TEMA_CROSS_PCT_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_TEMA_CROSS_PCT_PANEL_GAP;

  const run = runLineTemaCrossPct(opts.data, {
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
      temaPath: '',
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
    if (s.tema != null) {
      if (s.tema < priceMin) priceMin = s.tema;
      if (s.tema > priceMax) priceMax = s.tema;
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
    if (s.temaPct == null) continue;
    if (s.temaPct < pctMin) pctMin = s.temaPct;
    if (s.temaPct > pctMax) pctMax = s.temaPct;
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
  const priceDots: ChartLineTemaCrossPctDot[] = [];
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

  let temaPath = '';
  let temaFirst = true;
  for (const s of run.samples) {
    if (s.tema == null) {
      temaFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPrice(s.tema);
    temaPath += `${temaFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    temaFirst = false;
  }
  temaPath = temaPath.trim();

  let pctPath = '';
  let pctFirst = true;
  for (const s of run.samples) {
    if (s.temaPct == null) {
      pctFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPct(s.temaPct);
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
    temaPath,
    pctPath,
    priceMin,
    priceMax,
    pctMin,
    pctMax,
    zeroY: syPct(0),
    run,
  };
}

export function describeLineTemaCrossPctChart(
  data: ChartLineTemaCrossPctPoint[],
  options: { length?: number } = {},
): string {
  const cleaned = getLineTemaCrossPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineTemaCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_TEMA_CROSS_PCT_LENGTH,
  );
  return (
    `TEMA Pct chart over ${cleaned.length} bars (length ${length}). ` +
    `Top panel overlays the close with the Triple Exponential ` +
    `Moving Average; bottom panel renders the (close - TEMA) / ` +
    `close * 100 percent deviation scaled to price magnitude for ` +
    `cross-instrument comparable TEMA momentum.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultPctFormatter = (value: number): string => formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineTemaCrossPct = forwardRef<
  HTMLDivElement,
  ChartLineTemaCrossPctProps
>(function ChartLineTemaCrossPct(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_TEMA_CROSS_PCT_LENGTH,
    width = DEFAULT_CHART_LINE_TEMA_CROSS_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_TEMA_CROSS_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_TEMA_CROSS_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_TEMA_CROSS_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TEMA_CROSS_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TEMA_CROSS_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TEMA_CROSS_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TEMA_CROSS_PCT_PRICE_COLOR,
    temaColor = DEFAULT_CHART_LINE_TEMA_CROSS_PCT_TEMA_COLOR,
    pctColor = DEFAULT_CHART_LINE_TEMA_CROSS_PCT_PCT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_TEMA_CROSS_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_TEMA_CROSS_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TEMA_CROSS_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTema = true,
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
    () => getLineTemaCrossPctFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineTemaCrossPctLayout({
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
    ChartLineTemaCrossPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineTemaCrossPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineTemaCrossPctSeriesId,
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
        data-section="chart-line-tema-cross-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineTemaCrossPctChart(cleaned, { length });

  const showPrice = !hidden.has('price');
  const showTemaLine = !hidden.has('tema') && showTema;
  const showPctLine = !hidden.has('temaPct') && showPct;

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
      aria-label={ariaLabel ?? 'TEMA Percent chart'}
      aria-describedby={descId}
      data-section="chart-line-tema-cross-pct"
      data-length={length}
      data-total-points={cleaned.length}
      data-above-count={layout.run.aboveCount}
      data-below-count={layout.run.belowCount}
      data-at-count={layout.run.atCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-tema-cross-pct-title"
      >
        {ariaLabel ?? 'TEMA Percent chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-tema-cross-pct-aria-desc"
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
        data-section="chart-line-tema-cross-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-tema-cross-pct-grid">
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
                  data-section="chart-line-tema-cross-pct-grid-line-price"
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
                  data-section="chart-line-tema-cross-pct-grid-line-pct"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-tema-cross-pct-axes">
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
                  data-section="chart-line-tema-cross-pct-tick-price"
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
                  data-section="chart-line-tema-cross-pct-tick-pct"
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
            data-section="chart-line-tema-cross-pct-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-tema-cross-pct-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-tema-cross-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-tema-cross-pct-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showTemaLine ? (
          <path
            d={layout.temaPath}
            stroke={temaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-tema-cross-pct-tema"
          />
        ) : null}

        {showPctLine ? (
          <path
            d={layout.pctPath}
            stroke={pctColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-tema-cross-pct-pct"
          />
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-tema-cross-pct-hover-targets">
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
                data-section="chart-line-tema-cross-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-tema-cross-pct-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={200}
                  height={130}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-cross-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-cross-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-cross-pct-tooltip-tema"
                >
                  tema{' '}
                  {tooltipSample.tema == null
                    ? '--'
                    : formatPrice(tooltipSample.tema)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-cross-pct-tooltip-pct"
                >
                  temaPct{' '}
                  {tooltipSample.temaPct == null
                    ? '--'
                    : formatPct(tooltipSample.temaPct)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-cross-pct-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-cross-pct-tooltip-counts"
                >
                  above {layout.run.aboveCount} | below{' '}
                  {layout.run.belowCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-cross-pct-tooltip-counts2"
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
          data-section="chart-line-tema-cross-pct-badge"
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
          data-section="chart-line-tema-cross-pct-legend"
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
              { id: 'tema' as const, color: temaColor, label: 'tema' },
              {
                id: 'temaPct' as const,
                color: pctColor,
                label: 'temaPct',
              },
            ] satisfies Array<{
              id: ChartLineTemaCrossPctSeriesId;
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

ChartLineTemaCrossPct.displayName = 'ChartLineTemaCrossPct';
