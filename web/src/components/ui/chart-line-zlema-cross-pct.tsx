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
 * ChartLineZlemaCrossPct -- pure-SVG dual-panel chart with the
 * close overlaid with the Zero Lag EMA (ZLEMA) in the top panel
 * and the `close - ZLEMA` deviation scaled to the close as a
 * percent in the bottom panel. The percent normalisation makes
 * the lag-corrected ZLEMA momentum comparable across instruments
 * at different price magnitudes:
 *
 *   lag        = floor((length - 1) / 2)
 *   zlemaIn[i] = i >= lag
 *                  ? close[i] + (close[i] - close[i - lag])
 *                  : null
 *   ZLEMA[i]   = EMA(zlemaIn, length)
 *   zlemaPct[i] = close[i] === 0
 *                  ? null
 *                  : (close[i] - ZLEMA[i]) / close[i] * 100
 *
 * Defaults: `length = 14`. Regime classifier: `above` (zlemaPct
 * > 0), `below` (< 0), `at` (= 0), `none` (null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K (K > 0)**: every `close - close[i-lag] =
 *   K - K = 0`, so `zlemaIn[i] = K`. EMA(K, length) collapses to
 *   K via the SMA-seeded `min === max` precision fix.
 *   `close - ZLEMA = 0`, `zlemaPct = 0 / K * 100 = 0` every bar
 *   after warmup. K = 0 triggers the divide-by-zero guard ->
 *   zlemaPct = null.
 */

export interface ChartLineZlemaCrossPctPoint {
  x: number;
  close: number;
}

export type ChartLineZlemaCrossPctRegime =
  | 'above'
  | 'below'
  | 'at'
  | 'none';

export type ChartLineZlemaCrossPctSeriesId = 'price' | 'zlema' | 'pct';

export interface ChartLineZlemaCrossPctSample {
  index: number;
  x: number;
  close: number;
  zlema: number | null;
  zlemaPct: number | null;
  regime: ChartLineZlemaCrossPctRegime;
}

export interface ChartLineZlemaCrossPctRun {
  series: ChartLineZlemaCrossPctPoint[];
  length: number;
  lag: number;
  zlemaValues: Array<number | null>;
  pctValues: Array<number | null>;
  samples: ChartLineZlemaCrossPctSample[];
  aboveCount: number;
  belowCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineZlemaCrossPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineZlemaCrossPctLayout {
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
  priceDots: ChartLineZlemaCrossPctDot[];
  zlemaPath: string;
  pctPath: string;
  priceMin: number;
  priceMax: number;
  pctMin: number;
  pctMax: number;
  zeroY: number;
  run: ChartLineZlemaCrossPctRun;
}

export interface ChartLineZlemaCrossPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineZlemaCrossPctPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  zlemaColor?: string;
  pctColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showZlema?: boolean;
  showPct?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineZlemaCrossPctSeriesId[];
  defaultHiddenSeries?: ChartLineZlemaCrossPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineZlemaCrossPctSeriesId;
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

export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_LENGTH = 14;
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_ZLEMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_PCT_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineZlemaCrossPctFinitePoints(
  data: readonly ChartLineZlemaCrossPctPoint[] | null | undefined,
): ChartLineZlemaCrossPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineZlemaCrossPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineZlemaCrossPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** SMA-seeded EMA with the precision fix. */
export function applyLineZlemaCrossPctEma(
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

export interface LineZlemaCrossPctChannels {
  zlema: Array<number | null>;
  pct: Array<number | null>;
  lag: number;
}

export function computeLineZlemaCrossPct(
  series: readonly ChartLineZlemaCrossPctPoint[] | null | undefined,
  options: { length?: number } = {},
): LineZlemaCrossPctChannels {
  const cleaned = getLineZlemaCrossPctFinitePoints(series);
  if (cleaned.length === 0) {
    return { zlema: [], pct: [], lag: 0 };
  }
  const length = normalizeLineZlemaCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_LENGTH,
  );
  const lag = Math.floor((length - 1) / 2);

  const closes = cleaned.map((p) => p.close);
  const zlemaIn: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = lag; i < closes.length; i += 1) {
    zlemaIn[i] = posZero(closes[i]! + (closes[i]! - closes[i - lag]!));
  }

  const zlema = applyLineZlemaCrossPctEma(zlemaIn, length);

  const pct: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const z = zlema[i];
    if (z == null) continue;
    const c = closes[i]!;
    if (c === 0) continue;
    pct[i] = posZero(((c - z) / c) * 100);
  }

  return { zlema, pct, lag };
}

export function classifyLineZlemaCrossPctRegime(
  pct: number | null,
): ChartLineZlemaCrossPctRegime {
  if (pct == null) return 'none';
  if (pct > 0) return 'above';
  if (pct < 0) return 'below';
  return 'at';
}

export function runLineZlemaCrossPct(
  data: ChartLineZlemaCrossPctPoint[],
  options: { length?: number } = {},
): ChartLineZlemaCrossPctRun {
  const cleaned = getLineZlemaCrossPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineZlemaCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_LENGTH,
  );

  const channels = computeLineZlemaCrossPct(series, { length });

  const samples: ChartLineZlemaCrossPctSample[] = series.map((p, i) => {
    const z = channels.zlema[i] ?? null;
    const pct = channels.pct[i] ?? null;
    const regime = classifyLineZlemaCrossPctRegime(pct);
    return {
      index: i,
      x: p.x,
      close: p.close,
      zlema: z,
      zlemaPct: pct,
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

  const ok = series.length > length + channels.lag;

  return {
    series,
    length,
    lag: channels.lag,
    zlemaValues: channels.zlema,
    pctValues: channels.pct,
    samples,
    aboveCount,
    belowCount,
    atCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineZlemaCrossPctLayoutOptions {
  data: ChartLineZlemaCrossPctPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineZlemaCrossPctLayout(
  opts: ComputeLineZlemaCrossPctLayoutOptions,
): ChartLineZlemaCrossPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_PANEL_GAP;

  const run = runLineZlemaCrossPct(opts.data, {
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
      zlemaPath: '',
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

  let pctMin = Infinity;
  let pctMax = -Infinity;
  for (const s of run.samples) {
    if (s.zlemaPct == null) continue;
    if (s.zlemaPct < pctMin) pctMin = s.zlemaPct;
    if (s.zlemaPct > pctMax) pctMax = s.zlemaPct;
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
  const priceDots: ChartLineZlemaCrossPctDot[] = [];
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

  let pctPath = '';
  let pctFirst = true;
  for (const s of run.samples) {
    if (s.zlemaPct == null) {
      pctFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPct(s.zlemaPct);
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
    zlemaPath,
    pctPath,
    priceMin,
    priceMax,
    pctMin,
    pctMax,
    zeroY: syPct(0),
    run,
  };
}

export function describeLineZlemaCrossPctChart(
  data: ChartLineZlemaCrossPctPoint[],
  options: { length?: number } = {},
): string {
  const cleaned = getLineZlemaCrossPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineZlemaCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_LENGTH,
  );
  return (
    `ZLEMA Cross Pct chart over ${cleaned.length} bars (length ` +
    `${length}). Top panel overlays the close with the Zero Lag ` +
    `EMA; bottom panel renders the (close - ZLEMA) / close * 100 ` +
    `percent deviation scaled to price magnitude for cross-` +
    `instrument comparable lag-corrected trend momentum.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultPctFormatter = (value: number): string => formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineZlemaCrossPct = forwardRef<
  HTMLDivElement,
  ChartLineZlemaCrossPctProps
>(function ChartLineZlemaCrossPct(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_LENGTH,
    width = DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_PRICE_COLOR,
    zlemaColor = DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_ZLEMA_COLOR,
    pctColor = DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_PCT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ZLEMA_CROSS_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showZlema = true,
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
    () => getLineZlemaCrossPctFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineZlemaCrossPctLayout({
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
    ChartLineZlemaCrossPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineZlemaCrossPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineZlemaCrossPctSeriesId,
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
        data-section="chart-line-zlema-cross-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineZlemaCrossPctChart(cleaned, { length });

  const showPrice = !hidden.has('price');
  const showZlemaLine = !hidden.has('zlema') && showZlema;
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
      aria-label={ariaLabel ?? 'ZLEMA Cross Percent chart'}
      aria-describedby={descId}
      data-section="chart-line-zlema-cross-pct"
      data-length={length}
      data-lag={layout.run.lag}
      data-total-points={cleaned.length}
      data-above-count={layout.run.aboveCount}
      data-below-count={layout.run.belowCount}
      data-at-count={layout.run.atCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-zlema-cross-pct-title"
      >
        {ariaLabel ?? 'ZLEMA Cross Percent chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-zlema-cross-pct-aria-desc"
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
        data-section="chart-line-zlema-cross-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-zlema-cross-pct-grid">
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
                  data-section="chart-line-zlema-cross-pct-grid-line-price"
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
                  data-section="chart-line-zlema-cross-pct-grid-line-pct"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-zlema-cross-pct-axes">
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
                  data-section="chart-line-zlema-cross-pct-tick-price"
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
                  data-section="chart-line-zlema-cross-pct-tick-pct"
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
            data-section="chart-line-zlema-cross-pct-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-zlema-cross-pct-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-zlema-cross-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-zlema-cross-pct-price-dot"
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
            data-section="chart-line-zlema-cross-pct-zlema"
          />
        ) : null}

        {showPctLine ? (
          <path
            d={layout.pctPath}
            stroke={pctColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-zlema-cross-pct-pct"
          />
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-zlema-cross-pct-hover-targets">
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
                data-section="chart-line-zlema-cross-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-zlema-cross-pct-tooltip"
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
                  data-section="chart-line-zlema-cross-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-zlema-cross-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-zlema-cross-pct-tooltip-zlema"
                >
                  zlema{' '}
                  {tooltipSample.zlema == null
                    ? '--'
                    : formatPrice(tooltipSample.zlema)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-zlema-cross-pct-tooltip-pct"
                >
                  zlemaPct{' '}
                  {tooltipSample.zlemaPct == null
                    ? '--'
                    : formatPct(tooltipSample.zlemaPct)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-zlema-cross-pct-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-zlema-cross-pct-tooltip-counts"
                >
                  above {layout.run.aboveCount} | below{' '}
                  {layout.run.belowCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-zlema-cross-pct-tooltip-counts2"
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
          data-section="chart-line-zlema-cross-pct-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | lag {layout.run.lag} | above{' '}
          {layout.run.aboveCount} | below {layout.run.belowCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-zlema-cross-pct-legend"
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
              { id: 'pct' as const, color: pctColor, label: 'zlemaPct' },
            ] satisfies Array<{
              id: ChartLineZlemaCrossPctSeriesId;
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

ChartLineZlemaCrossPct.displayName = 'ChartLineZlemaCrossPct';
