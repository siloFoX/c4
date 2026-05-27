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
 * ChartLineSupertrendCrossPct -- pure-SVG dual-panel chart with
 * the close overlaid with the Supertrend trailing band in the
 * top panel and the `close - Supertrend` deviation scaled to
 * the close as a percent in the bottom panel. The percent
 * normalisation makes the adaptive volatility trend regime
 * comparable across instruments at different price magnitudes:
 *
 *   TR[i]       = i === 0 ? 0 : |close[i] - close[i-1]|
 *   ATR[i]      = Wilder smooth of TR over length
 *   upperBand   = close + factor * ATR
 *   lowerBand   = close - factor * ATR
 *   ST[i]       = trend flip with stickiness when close
 *                 crosses the active band
 *   stPct[i]    = close[i] === 0
 *                  ? null
 *                  : (close[i] - ST[i]) / close[i] * 100
 *
 * Defaults: `length = 10`, `factor = 3` (canonical Supertrend).
 * Regime classifier: `above` (stPct > 0; close above
 * Supertrend = uptrend), `below` (close below Supertrend =
 * downtrend), `at` (close === Supertrend), `none` (null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K (K > 0)**: TR = 0 every bar -> ATR = 0
 *   -> upperBand = lowerBand = K -> Supertrend = K every bar.
 *   `close - Supertrend = 0` -> `stPct = 0 / K * 100 = 0`
 *   every bar. K = 0 triggers the divide-by-zero guard ->
 *   stPct = null.
 */

export interface ChartLineSupertrendCrossPctPoint {
  x: number;
  close: number;
}

export type ChartLineSupertrendCrossPctRegime =
  | 'above'
  | 'below'
  | 'at'
  | 'none';

export type ChartLineSupertrendCrossPctSeriesId =
  | 'price'
  | 'supertrend'
  | 'pct';

export interface ChartLineSupertrendCrossPctSample {
  index: number;
  x: number;
  close: number;
  supertrend: number | null;
  stPct: number | null;
  regime: ChartLineSupertrendCrossPctRegime;
}

export interface ChartLineSupertrendCrossPctRun {
  series: ChartLineSupertrendCrossPctPoint[];
  length: number;
  factor: number;
  supertrendValues: Array<number | null>;
  pctValues: Array<number | null>;
  samples: ChartLineSupertrendCrossPctSample[];
  aboveCount: number;
  belowCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineSupertrendCrossPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSupertrendCrossPctLayout {
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
  priceDots: ChartLineSupertrendCrossPctDot[];
  supertrendPath: string;
  pctPath: string;
  priceMin: number;
  priceMax: number;
  pctMin: number;
  pctMax: number;
  zeroY: number;
  run: ChartLineSupertrendCrossPctRun;
}

export interface ChartLineSupertrendCrossPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSupertrendCrossPctPoint[];
  length?: number;
  factor?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  supertrendColor?: string;
  pctColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSupertrend?: boolean;
  showPct?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSupertrendCrossPctSeriesId[];
  defaultHiddenSeries?: ChartLineSupertrendCrossPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSupertrendCrossPctSeriesId;
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

export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_LENGTH = 10;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_FACTOR = 3;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_SUPERTREND_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_PCT_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineSupertrendCrossPctFinitePoints(
  data: readonly ChartLineSupertrendCrossPctPoint[] | null | undefined,
): ChartLineSupertrendCrossPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSupertrendCrossPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineSupertrendCrossPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a positive finite factor (> 0). */
export function normalizeLineSupertrendCrossPctFactor(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value > 0) return value;
  return fallback;
}

/**
 * Wilder smoothing with CONST short-circuit so a window of
 * identical values collapses bit-exact.
 */
export function applyLineSupertrendCrossPctWilder(
  values: readonly number[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (values.length < length) return out;
  let sum = 0;
  for (let i = 0; i < length; i += 1) sum += values[i]!;
  const seed = posZero(sum / length);
  out[length - 1] = seed;
  let prev = seed;
  for (let i = length; i < values.length; i += 1) {
    const v = values[i]!;
    const next =
      v === prev ? v : posZero((prev * (length - 1) + v) / length);
    out[i] = next;
    prev = next;
  }
  return out;
}

export interface LineSupertrendCrossPctChannels {
  supertrend: Array<number | null>;
  pct: Array<number | null>;
}

export function computeLineSupertrendCrossPct(
  series: readonly ChartLineSupertrendCrossPctPoint[] | null | undefined,
  options: { length?: number; factor?: number } = {},
): LineSupertrendCrossPctChannels {
  const cleaned = getLineSupertrendCrossPctFinitePoints(series);
  if (cleaned.length === 0) {
    return { supertrend: [], pct: [] };
  }
  const length = normalizeLineSupertrendCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_LENGTH,
  );
  const factor = normalizeLineSupertrendCrossPctFactor(
    options.factor,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_FACTOR,
  );

  const closes = cleaned.map((p) => p.close);
  const tr: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i += 1) {
    tr[i] = Math.abs(closes[i]! - closes[i - 1]!);
  }
  const atrFromIdx1 = applyLineSupertrendCrossPctWilder(
    tr.slice(1),
    length,
  );
  const atr: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < atrFromIdx1.length; i += 1) {
    atr[i + 1] = atrFromIdx1[i] ?? null;
  }

  const supertrend: Array<number | null> = new Array(closes.length).fill(
    null,
  );

  let direction: 1 | -1 = 1;
  let prevUpper = Infinity;
  let prevLower = -Infinity;
  let prevSt: number | null = null;

  for (let i = 0; i < closes.length; i += 1) {
    const a = atr[i];
    if (a == null) {
      continue;
    }
    const c = closes[i]!;
    const rawUpper = c + factor * a;
    const rawLower = c - factor * a;
    // Sticky bands: upper only moves down with care, lower only
    // moves up with care.
    let upper = rawUpper;
    let lower = rawLower;
    if (Number.isFinite(prevUpper)) {
      upper = rawUpper < prevUpper || closes[i - 1]! > prevUpper
        ? rawUpper
        : prevUpper;
    }
    if (Number.isFinite(prevLower)) {
      lower = rawLower > prevLower || closes[i - 1]! < prevLower
        ? rawLower
        : prevLower;
    }

    // Decide direction with stickiness from previous Supertrend.
    if (prevSt != null) {
      if (prevSt === prevUpper) {
        direction = c > upper ? 1 : -1;
      } else if (prevSt === prevLower) {
        direction = c < lower ? -1 : 1;
      } else {
        direction = c > prevSt ? 1 : -1;
      }
    } else {
      direction = c > rawUpper ? 1 : -1;
    }

    const st = direction === 1 ? lower : upper;
    supertrend[i] = posZero(st);
    prevUpper = upper;
    prevLower = lower;
    prevSt = st;
  }

  const pct: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const s = supertrend[i];
    if (s == null) continue;
    const c = closes[i]!;
    if (c === 0) continue;
    pct[i] = posZero(((c - s) / c) * 100);
  }

  return { supertrend, pct };
}

export function classifyLineSupertrendCrossPctRegime(
  pct: number | null,
): ChartLineSupertrendCrossPctRegime {
  if (pct == null) return 'none';
  if (pct > 0) return 'above';
  if (pct < 0) return 'below';
  return 'at';
}

export function runLineSupertrendCrossPct(
  data: ChartLineSupertrendCrossPctPoint[],
  options: { length?: number; factor?: number } = {},
): ChartLineSupertrendCrossPctRun {
  const cleaned = getLineSupertrendCrossPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineSupertrendCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_LENGTH,
  );
  const factor = normalizeLineSupertrendCrossPctFactor(
    options.factor,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_FACTOR,
  );

  const channels = computeLineSupertrendCrossPct(series, { length, factor });

  const samples: ChartLineSupertrendCrossPctSample[] = series.map((p, i) => {
    const supertrend = channels.supertrend[i] ?? null;
    const pct = channels.pct[i] ?? null;
    const regime = classifyLineSupertrendCrossPctRegime(pct);
    return {
      index: i,
      x: p.x,
      close: p.close,
      supertrend,
      stPct: pct,
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
    factor,
    supertrendValues: channels.supertrend,
    pctValues: channels.pct,
    samples,
    aboveCount,
    belowCount,
    atCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineSupertrendCrossPctLayoutOptions {
  data: ChartLineSupertrendCrossPctPoint[];
  length?: number;
  factor?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineSupertrendCrossPctLayout(
  opts: ComputeLineSupertrendCrossPctLayoutOptions,
): ChartLineSupertrendCrossPctLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_PANEL_GAP;

  const run = runLineSupertrendCrossPct(opts.data, {
    length: opts.length ?? undefined,
    factor: opts.factor ?? undefined,
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
      supertrendPath: '',
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
    if (s.supertrend != null) {
      if (s.supertrend < priceMin) priceMin = s.supertrend;
      if (s.supertrend > priceMax) priceMax = s.supertrend;
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
    if (s.stPct == null) continue;
    if (s.stPct < pctMin) pctMin = s.stPct;
    if (s.stPct > pctMax) pctMax = s.stPct;
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
  const priceDots: ChartLineSupertrendCrossPctDot[] = [];
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

  let supertrendPath = '';
  let supertrendFirst = true;
  for (const s of run.samples) {
    if (s.supertrend == null) {
      supertrendFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPrice(s.supertrend);
    supertrendPath += `${supertrendFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    supertrendFirst = false;
  }
  supertrendPath = supertrendPath.trim();

  let pctPath = '';
  let pctFirst = true;
  for (const s of run.samples) {
    if (s.stPct == null) {
      pctFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPct(s.stPct);
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
    supertrendPath,
    pctPath,
    priceMin,
    priceMax,
    pctMin,
    pctMax,
    zeroY: syPct(0),
    run,
  };
}

export function describeLineSupertrendCrossPctChart(
  data: ChartLineSupertrendCrossPctPoint[],
  options: { length?: number; factor?: number } = {},
): string {
  const cleaned = getLineSupertrendCrossPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineSupertrendCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_LENGTH,
  );
  const factor = normalizeLineSupertrendCrossPctFactor(
    options.factor,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_FACTOR,
  );
  return (
    `Supertrend Cross Pct chart over ${cleaned.length} bars ` +
    `(length ${length}, factor ${factor}). Top panel overlays ` +
    `the close with the Supertrend trailing band; bottom panel ` +
    `renders the (close - Supertrend) / close * 100 percent ` +
    `deviation scaled to price magnitude for cross-instrument ` +
    `comparable adaptive volatility trend regime.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultPctFormatter = (value: number): string => formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineSupertrendCrossPct = forwardRef<
  HTMLDivElement,
  ChartLineSupertrendCrossPctProps
>(function ChartLineSupertrendCrossPct(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_LENGTH,
    factor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_FACTOR,
    width = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_PRICE_COLOR,
    supertrendColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_SUPERTREND_COLOR,
    pctColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_PCT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSupertrend = true,
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
    () => getLineSupertrendCrossPctFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineSupertrendCrossPctLayout({
        data: cleaned,
        length,
        factor,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, factor, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineSupertrendCrossPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineSupertrendCrossPctSeriesId,
  ) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineSupertrendCrossPctSeriesId,
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
        data-section="chart-line-supertrend-cross-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineSupertrendCrossPctChart(cleaned, { length, factor });

  const showPrice = !hidden.has('price');
  const showSupertrendLine = !hidden.has('supertrend') && showSupertrend;
  const showPctLine = !hidden.has('pct') && showPct;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'Supertrend Cross Percent chart'}
      aria-describedby={descId}
      data-section="chart-line-supertrend-cross-pct"
      data-length={length}
      data-factor={factor}
      data-total-points={cleaned.length}
      data-above-count={layout.run.aboveCount}
      data-below-count={layout.run.belowCount}
      data-at-count={layout.run.atCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-supertrend-cross-pct-title"
      >
        {ariaLabel ?? 'Supertrend Cross Percent chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-supertrend-cross-pct-aria-desc"
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
        data-section="chart-line-supertrend-cross-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-supertrend-cross-pct-grid">
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
                  data-section="chart-line-supertrend-cross-pct-grid-line-price"
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
                  data-section="chart-line-supertrend-cross-pct-grid-line-pct"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-supertrend-cross-pct-axes">
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
                  data-section="chart-line-supertrend-cross-pct-tick-price"
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
                  data-section="chart-line-supertrend-cross-pct-tick-pct"
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
            data-section="chart-line-supertrend-cross-pct-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-supertrend-cross-pct-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-supertrend-cross-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-supertrend-cross-pct-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSupertrendLine ? (
          <path
            d={layout.supertrendPath}
            stroke={supertrendColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-supertrend-cross-pct-supertrend"
          />
        ) : null}

        {showPctLine ? (
          <path
            d={layout.pctPath}
            stroke={pctColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-supertrend-cross-pct-pct"
          />
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-supertrend-cross-pct-hover-targets">
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
                data-section="chart-line-supertrend-cross-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-supertrend-cross-pct-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={216}
                  height={116}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-pct-tooltip-supertrend"
                >
                  st{' '}
                  {tooltipSample.supertrend == null
                    ? '--'
                    : formatPrice(tooltipSample.supertrend)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-pct-tooltip-pct"
                >
                  stPct{' '}
                  {tooltipSample.stPct == null
                    ? '--'
                    : formatPct(tooltipSample.stPct)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-pct-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-pct-tooltip-counts"
                >
                  above {layout.run.aboveCount} | below{' '}
                  {layout.run.belowCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-pct-tooltip-counts2"
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
          data-section="chart-line-supertrend-cross-pct-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | factor {factor} | above {layout.run.aboveCount} |
          below {layout.run.belowCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-supertrend-cross-pct-legend"
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
                id: 'supertrend' as const,
                color: supertrendColor,
                label: 'supertrend',
              },
              { id: 'pct' as const, color: pctColor, label: 'stPct' },
            ] satisfies Array<{
              id: ChartLineSupertrendCrossPctSeriesId;
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

ChartLineSupertrendCrossPct.displayName = 'ChartLineSupertrendCrossPct';
