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
 * ChartLineMacdCrossPct -- pure-SVG dual-panel chart with the
 * close on top and a MACD percent oscillator on the bottom. The
 * MACD difference is scaled to the close so the resulting series
 * is comparable across instruments at different price magnitudes:
 *
 *   ema1[i]    = EMA(close, fastLength)
 *   ema2[i]    = EMA(close, slowLength)
 *   macd[i]    = ema1[i] - ema2[i]
 *   macdPct[i] = close[i] === 0 ? null
 *                                : macd[i] / close[i] * 100
 *
 * Regime classifier: `above` (macdPct > 0), `below` (< 0),
 * `at` (= 0), `none` (null). Defaults: classic MACD periods
 * `fastLength = 12`, `slowLength = 26`.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K (K > 0)**: every EMA collapses to K via
 *   the SMA-seeded `min === max` precision fix. `macd = K - K =
 *   0`, `macdPct = 0 / K * 100 = 0`. Regime `at` everywhere
 *   after warmup. Verified across multiple K and
 *   `(fastLength, slowLength)` tuples. K = 0 triggers the
 *   divide-by-zero guard -> macdPct = null.
 */

export interface ChartLineMacdCrossPctPoint {
  x: number;
  close: number;
}

export type ChartLineMacdCrossPctRegime =
  | 'above'
  | 'below'
  | 'at'
  | 'none';

export type ChartLineMacdCrossPctSeriesId = 'price' | 'macdPct';

export interface ChartLineMacdCrossPctSample {
  index: number;
  x: number;
  close: number;
  macd: number | null;
  macdPct: number | null;
  regime: ChartLineMacdCrossPctRegime;
}

export interface ChartLineMacdCrossPctRun {
  series: ChartLineMacdCrossPctPoint[];
  fastLength: number;
  slowLength: number;
  macdValues: Array<number | null>;
  macdPctValues: Array<number | null>;
  samples: ChartLineMacdCrossPctSample[];
  aboveCount: number;
  belowCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineMacdCrossPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMacdCrossPctLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  oscTop: number;
  oscBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineMacdCrossPctDot[];
  macdPctPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  run: ChartLineMacdCrossPctRun;
}

export interface ChartLineMacdCrossPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMacdCrossPctPoint[];
  fastLength?: number;
  slowLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  macdPctColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMacdPct?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMacdCrossPctSeriesId[];
  defaultHiddenSeries?: ChartLineMacdCrossPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMacdCrossPctSeriesId;
    hidden: boolean;
  }) => void;
  formatPrice?: (value: number) => string;
  formatMacdPct?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_MACD_CROSS_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_MACD_CROSS_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MACD_CROSS_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_MACD_CROSS_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MACD_CROSS_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MACD_CROSS_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MACD_CROSS_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MACD_CROSS_PCT_FAST_LENGTH = 12;
export const DEFAULT_CHART_LINE_MACD_CROSS_PCT_SLOW_LENGTH = 26;
export const DEFAULT_CHART_LINE_MACD_CROSS_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MACD_CROSS_PCT_MACD_PCT_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_MACD_CROSS_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_MACD_CROSS_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MACD_CROSS_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineMacdCrossPctFinitePoints(
  data: readonly ChartLineMacdCrossPctPoint[] | null | undefined,
): ChartLineMacdCrossPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMacdCrossPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineMacdCrossPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * SMA-seeded EMA with `min === max` precision fix and CONST short-
 * circuit.
 */
export function applyLineMacdCrossPctEma(
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

export interface LineMacdCrossPctChannels {
  ema1: Array<number | null>;
  ema2: Array<number | null>;
  macd: Array<number | null>;
  macdPct: Array<number | null>;
}

export function computeLineMacdCrossPct(
  series: readonly ChartLineMacdCrossPctPoint[] | null | undefined,
  options: { fastLength?: number; slowLength?: number } = {},
): LineMacdCrossPctChannels {
  const cleaned = getLineMacdCrossPctFinitePoints(series);
  if (cleaned.length === 0) {
    return { ema1: [], ema2: [], macd: [], macdPct: [] };
  }
  const fastLength = normalizeLineMacdCrossPctLength(
    options.fastLength,
    DEFAULT_CHART_LINE_MACD_CROSS_PCT_FAST_LENGTH,
  );
  const slowLength = normalizeLineMacdCrossPctLength(
    options.slowLength,
    DEFAULT_CHART_LINE_MACD_CROSS_PCT_SLOW_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const ema1 = applyLineMacdCrossPctEma(closes, fastLength);
  const ema2 = applyLineMacdCrossPctEma(closes, slowLength);
  const macd: Array<number | null> = new Array(closes.length).fill(null);
  const macdPct: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const a = ema1[i];
    const b = ema2[i];
    if (a == null || b == null) continue;
    const diff = a - b;
    macd[i] = posZero(diff);
    const c = closes[i]!;
    if (c === 0) continue;
    macdPct[i] = posZero((diff / c) * 100);
  }
  return { ema1, ema2, macd, macdPct };
}

export function classifyLineMacdCrossPctRegime(
  macdPct: number | null,
): ChartLineMacdCrossPctRegime {
  if (macdPct == null) return 'none';
  if (macdPct > 0) return 'above';
  if (macdPct < 0) return 'below';
  return 'at';
}

export function runLineMacdCrossPct(
  data: ChartLineMacdCrossPctPoint[],
  options: { fastLength?: number; slowLength?: number } = {},
): ChartLineMacdCrossPctRun {
  const cleaned = getLineMacdCrossPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineMacdCrossPctLength(
    options.fastLength,
    DEFAULT_CHART_LINE_MACD_CROSS_PCT_FAST_LENGTH,
  );
  const slowLength = normalizeLineMacdCrossPctLength(
    options.slowLength,
    DEFAULT_CHART_LINE_MACD_CROSS_PCT_SLOW_LENGTH,
  );

  const channels = computeLineMacdCrossPct(series, {
    fastLength,
    slowLength,
  });

  const samples: ChartLineMacdCrossPctSample[] = series.map((p, i) => {
    const macd = channels.macd[i] ?? null;
    const macdPct = channels.macdPct[i] ?? null;
    const regime = classifyLineMacdCrossPctRegime(macdPct);
    return {
      index: i,
      x: p.x,
      close: p.close,
      macd,
      macdPct,
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

  const ok = series.length > slowLength;

  return {
    series,
    fastLength,
    slowLength,
    macdValues: channels.macd,
    macdPctValues: channels.macdPct,
    samples,
    aboveCount,
    belowCount,
    atCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineMacdCrossPctLayoutOptions {
  data: ChartLineMacdCrossPctPoint[];
  fastLength?: number;
  slowLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineMacdCrossPctLayout(
  opts: ComputeLineMacdCrossPctLayoutOptions,
): ChartLineMacdCrossPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_MACD_CROSS_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_MACD_CROSS_PCT_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_MACD_CROSS_PCT_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_MACD_CROSS_PCT_PANEL_GAP;

  const run = runLineMacdCrossPct(opts.data, {
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      oscTop,
      oscBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      macdPctPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
      zeroY: (oscTop + oscBottom) / 2,
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

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const s of run.samples) {
    if (s.macdPct == null) continue;
    if (s.macdPct < oscMin) oscMin = s.macdPct;
    if (s.macdPct > oscMax) oscMax = s.macdPct;
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = -1;
    oscMax = 1;
  }
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }
  if (oscMin > 0) oscMin = 0;
  if (oscMax < 0) oscMax = 0;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syOsc = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

  let pricePath = '';
  const priceDots: ChartLineMacdCrossPctDot[] = [];
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

  let macdPctPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.macdPct == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.macdPct);
    macdPctPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  macdPctPath = macdPctPath.trim();

  return {
    ok: true,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    oscTop,
    oscBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    macdPctPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY: syOsc(0),
    run,
  };
}

export function describeLineMacdCrossPctChart(
  data: ChartLineMacdCrossPctPoint[],
  options: { fastLength?: number; slowLength?: number } = {},
): string {
  const cleaned = getLineMacdCrossPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fastLength = normalizeLineMacdCrossPctLength(
    options.fastLength,
    DEFAULT_CHART_LINE_MACD_CROSS_PCT_FAST_LENGTH,
  );
  const slowLength = normalizeLineMacdCrossPctLength(
    options.slowLength,
    DEFAULT_CHART_LINE_MACD_CROSS_PCT_SLOW_LENGTH,
  );
  return (
    `MACD Pct chart over ${cleaned.length} bars (fastLength ` +
    `${fastLength}, slowLength ${slowLength}). Top panel renders ` +
    `the close; bottom panel renders the MACD percent oscillator ` +
    `(MACD / close * 100) scaled to price magnitude for comparable ` +
    `momentum across assets.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultMacdPctFormatter = (value: number): string =>
  formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineMacdCrossPct = forwardRef<
  HTMLDivElement,
  ChartLineMacdCrossPctProps
>(function ChartLineMacdCrossPct(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_MACD_CROSS_PCT_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_MACD_CROSS_PCT_SLOW_LENGTH,
    width = DEFAULT_CHART_LINE_MACD_CROSS_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_MACD_CROSS_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_MACD_CROSS_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_MACD_CROSS_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MACD_CROSS_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MACD_CROSS_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MACD_CROSS_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MACD_CROSS_PCT_PRICE_COLOR,
    macdPctColor = DEFAULT_CHART_LINE_MACD_CROSS_PCT_MACD_PCT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_MACD_CROSS_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_MACD_CROSS_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MACD_CROSS_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMacdPct = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    formatPrice = defaultPriceFormatter,
    formatMacdPct = defaultMacdPctFormatter,
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
    () => getLineMacdCrossPctFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineMacdCrossPctLayout({
        data: cleaned,
        fastLength,
        slowLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, fastLength, slowLength, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineMacdCrossPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineMacdCrossPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineMacdCrossPctSeriesId,
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
        data-section="chart-line-macd-cross-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineMacdCrossPctChart(cleaned, { fastLength, slowLength });

  const showPrice = !hidden.has('price');
  const showMacdPctLine = !hidden.has('macdPct') && showMacdPct;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickOscValues.push(
      layout.oscMin + ((layout.oscMax - layout.oscMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'MACD Percent chart'}
      aria-describedby={descId}
      data-section="chart-line-macd-cross-pct"
      data-fast-length={fastLength}
      data-slow-length={slowLength}
      data-total-points={cleaned.length}
      data-above-count={layout.run.aboveCount}
      data-below-count={layout.run.belowCount}
      data-at-count={layout.run.atCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-macd-cross-pct-title"
      >
        {ariaLabel ?? 'MACD Percent chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-macd-cross-pct-aria-desc"
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
        data-section="chart-line-macd-cross-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-macd-cross-pct-grid">
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
                  data-section="chart-line-macd-cross-pct-grid-line-price"
                />
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <line
                  key={`grid-osc-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-macd-cross-pct-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-macd-cross-pct-axes">
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
              y1={layout.oscTop}
              x2={layout.innerLeft}
              y2={layout.oscBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oscBottom}
              x2={layout.innerRight}
              y2={layout.oscBottom}
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
                  data-section="chart-line-macd-cross-pct-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <text
                  key={`tick-osc-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-macd-cross-pct-tick-osc"
                >
                  {formatMacdPct(v)}
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
            data-section="chart-line-macd-cross-pct-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-macd-cross-pct-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-macd-cross-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-macd-cross-pct-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showMacdPctLine ? (
          <path
            d={layout.macdPctPath}
            stroke={macdPctColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-macd-cross-pct-macd"
          />
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-macd-cross-pct-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.oscBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-macd-cross-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-macd-cross-pct-tooltip"
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
                  data-section="chart-line-macd-cross-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-cross-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-cross-pct-tooltip-macd"
                >
                  macd{' '}
                  {tooltipSample.macd == null
                    ? '--'
                    : formatMacdPct(tooltipSample.macd)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-cross-pct-tooltip-macdpct"
                >
                  macdPct{' '}
                  {tooltipSample.macdPct == null
                    ? '--'
                    : formatMacdPct(tooltipSample.macdPct)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-cross-pct-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-cross-pct-tooltip-counts"
                >
                  above {layout.run.aboveCount} | below{' '}
                  {layout.run.belowCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-cross-pct-tooltip-counts2"
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
          data-section="chart-line-macd-cross-pct-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          fast {fastLength} | slow {slowLength} | above{' '}
          {layout.run.aboveCount} | below {layout.run.belowCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-macd-cross-pct-legend"
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
              {
                id: 'macdPct' as const,
                color: macdPctColor,
                label: 'macdPct',
              },
            ] satisfies Array<{
              id: ChartLineMacdCrossPctSeriesId;
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

ChartLineMacdCrossPct.displayName = 'ChartLineMacdCrossPct';
