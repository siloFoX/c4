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
 * ChartLineEmaPct -- pure-SVG dual-panel chart with the close on
 * top and an EMA Percent-Change oscillator on the bottom:
 *
 *   ema[i]    = EMA(close, length)[i]
 *   emaPct[i] = ema[i] === 0 ? null : (close[i] - ema[i]) / ema[i] * 100
 *
 * `emaPct[i]` is `null` during EMA warmup (`i < length - 1`) and
 * whenever `ema[i]` is zero (divide-by-zero guard).
 *
 * Bit-exact anchors:
 * - **CONST close = K, K != 0**: the SMA-seeded EMA helper with the
 *   `min === max` seed fix collapses to `K` exactly; the CONST
 *   short-circuit preserves it, so `emaPct = (K - K) / K * 100 = 0`
 *   bit-exact post-warmup.
 * - **CONST close = 0**: `ema = 0`, divide-by-zero guard returns
 *   `null`.
 * - **LINEAR UP close = i + 1 at i = L - 1 (seed index)**: SMA seed
 *   `ema = (L + 1) / 2`, `close = L`, so
 *   `emaPct = (L - (L+1)/2) / ((L+1)/2) * 100 = (L-1)/(L+1) * 100`.
 *   For `L in {3, 7, 15}` this constant is dyadic
 *   (50, 75, 87.5) and bit-exact in IEEE 754.
 */

export interface ChartLineEmaPctPoint {
  x: number;
  close: number;
}

export type ChartLineEmaPctZone =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineEmaPctCross = 'up' | 'down' | null;

export type ChartLineEmaPctSeriesId = 'price' | 'ema' | 'pct';

export interface ChartLineEmaPctSample {
  index: number;
  x: number;
  close: number;
  ema: number | null;
  delta: number | null;
  emaPct: number | null;
  zone: ChartLineEmaPctZone;
  crossed: ChartLineEmaPctCross;
}

export interface ChartLineEmaPctRun {
  series: ChartLineEmaPctPoint[];
  length: number;
  bullishThreshold: number;
  bearishThreshold: number;
  emaValues: Array<number | null>;
  deltaValues: Array<number | null>;
  emaPctValues: Array<number | null>;
  samples: ChartLineEmaPctSample[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineEmaPctMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  emaPct: number;
  crossed: 'up' | 'down';
}

export interface ChartLineEmaPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineEmaPctLayout {
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
  emaPath: string;
  priceDots: ChartLineEmaPctDot[];
  pctPath: string;
  bullishY: number;
  bearishY: number;
  zeroY: number;
  markers: ChartLineEmaPctMarker[];
  priceMin: number;
  priceMax: number;
  pctMin: number;
  pctMax: number;
  run: ChartLineEmaPctRun;
}

export interface ChartLineEmaPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineEmaPctPoint[];
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
  emaColor?: string;
  pctColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showEma?: boolean;
  showPct?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineEmaPctSeriesId[];
  defaultHiddenSeries?: ChartLineEmaPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineEmaPctSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineEmaPctSample }) => void;
  formatPrice?: (value: number) => string;
  formatPct?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_EMA_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_EMA_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_EMA_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_EMA_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_EMA_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_EMA_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_EMA_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_EMA_PCT_LENGTH = 14;
export const DEFAULT_CHART_LINE_EMA_PCT_BULLISH_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_EMA_PCT_BEARISH_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_EMA_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_EMA_PCT_EMA_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_EMA_PCT_PCT_COLOR = '#8b5cf6';
export const DEFAULT_CHART_LINE_EMA_PCT_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_EMA_PCT_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_EMA_PCT_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_EMA_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_EMA_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_EMA_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x and close. */
export function getLineEmaPctFinitePoints(
  data: readonly ChartLineEmaPctPoint[] | null | undefined,
): ChartLineEmaPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineEmaPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer EMA length (>= 2). */
export function normalizeLineEmaPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a numeric threshold (any finite real). */
export function normalizeLineEmaPctThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold)) return threshold;
  return fallback;
}

/**
 * SMA-seeded EMA with CONST short-circuit. Seeds with the exact
 * value when the seed window is constant (`min === max`) to avoid
 * 1-ULP drift from non-dyadic sum-then-divide arithmetic.
 */
export function applyLineEmaPctEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);
  let ema: number | null = null;
  let sum = 0;
  let count = 0;
  let seedMin = Infinity;
  let seedMax = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      ema = null;
      sum = 0;
      count = 0;
      seedMin = Infinity;
      seedMax = -Infinity;
      continue;
    }
    if (ema == null) {
      sum += v;
      count += 1;
      if (v < seedMin) seedMin = v;
      if (v > seedMax) seedMax = v;
      if (count >= length) {
        ema = seedMin === seedMax ? seedMin : sum / length;
        out[i] = posZero(ema);
      }
    } else {
      const next = v === ema ? v : alpha * v + (1 - alpha) * ema;
      ema = next;
      out[i] = posZero(next);
    }
  }
  return out;
}

export interface LineEmaPctChannels {
  ema: Array<number | null>;
  delta: Array<number | null>;
  emaPct: Array<number | null>;
}

export function computeLineEmaPct(
  series: readonly ChartLineEmaPctPoint[] | null | undefined,
  options: { length?: number } = {},
): LineEmaPctChannels {
  const cleaned = getLineEmaPctFinitePoints(series);
  if (cleaned.length === 0) {
    return { ema: [], delta: [], emaPct: [] };
  }
  const length = normalizeLineEmaPctLength(
    options.length,
    DEFAULT_CHART_LINE_EMA_PCT_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const ema = applyLineEmaPctEma(closes, length);

  const delta: Array<number | null> = [];
  const emaPct: Array<number | null> = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const e = ema[i];
    const c = closes[i]!;
    if (e == null) {
      delta.push(null);
      emaPct.push(null);
      continue;
    }
    delta.push(posZero(c - e));
    if (e === 0) {
      emaPct.push(null);
      continue;
    }
    const raw = ((c - e) / e) * 100;
    emaPct.push(Number.isFinite(raw) ? posZero(raw) : null);
  }

  return { ema, delta, emaPct };
}

export function classifyLineEmaPctZone(
  value: number | null,
  bullishThreshold: number,
  bearishThreshold: number,
): ChartLineEmaPctZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > bullishThreshold) return 'bullish';
  if (value < bearishThreshold) return 'bearish';
  return 'neutral';
}

export function detectLineEmaPctCrosses(
  values: readonly (number | null)[],
  bullishThreshold: number,
  bearishThreshold: number,
): ChartLineEmaPctCross[] {
  const out: ChartLineEmaPctCross[] = [];
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

export function runLineEmaPct(
  data: ChartLineEmaPctPoint[],
  options: {
    length?: number;
    bullishThreshold?: number;
    bearishThreshold?: number;
  } = {},
): ChartLineEmaPctRun {
  const cleaned = getLineEmaPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineEmaPctLength(
    options.length,
    DEFAULT_CHART_LINE_EMA_PCT_LENGTH,
  );
  const bullishThreshold = normalizeLineEmaPctThreshold(
    options.bullishThreshold,
    DEFAULT_CHART_LINE_EMA_PCT_BULLISH_THRESHOLD,
  );
  const bearishThreshold = normalizeLineEmaPctThreshold(
    options.bearishThreshold,
    DEFAULT_CHART_LINE_EMA_PCT_BEARISH_THRESHOLD,
  );

  const channels = computeLineEmaPct(series, { length });
  const crosses = detectLineEmaPctCrosses(
    channels.emaPct,
    bullishThreshold,
    bearishThreshold,
  );

  const samples: ChartLineEmaPctSample[] = series.map((p, i) => {
    const ema = channels.ema[i] ?? null;
    const delta = channels.delta[i] ?? null;
    const emaPct = channels.emaPct[i] ?? null;
    const zone = classifyLineEmaPctZone(
      emaPct,
      bullishThreshold,
      bearishThreshold,
    );
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      ema,
      delta,
      emaPct,
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

  const ok = series.length >= length;

  return {
    series,
    length,
    bullishThreshold,
    bearishThreshold,
    emaValues: channels.ema,
    deltaValues: channels.delta,
    emaPctValues: channels.emaPct,
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

export interface ComputeLineEmaPctLayoutOptions {
  data: ChartLineEmaPctPoint[];
  length?: number;
  bullishThreshold?: number;
  bearishThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineEmaPctLayout(
  opts: ComputeLineEmaPctLayoutOptions,
): ChartLineEmaPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_EMA_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_EMA_PCT_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_EMA_PCT_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_EMA_PCT_PANEL_GAP;

  const run = runLineEmaPct(opts.data, {
    length: opts.length ?? undefined,
    bullishThreshold: opts.bullishThreshold ?? undefined,
    bearishThreshold: opts.bearishThreshold ?? undefined,
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
      emaPath: '',
      priceDots: [],
      pctPath: '',
      bullishY: pctTop,
      bearishY: pctBottom,
      zeroY: (pctTop + pctBottom) / 2,
      markers: [],
      priceMin: 0,
      priceMax: 0,
      pctMin: -1,
      pctMax: 1,
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
    if (s.ema != null) {
      if (s.ema < priceMin) priceMin = s.ema;
      if (s.ema > priceMax) priceMax = s.ema;
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
    if (s.emaPct == null) continue;
    if (s.emaPct < pctMin) pctMin = s.emaPct;
    if (s.emaPct > pctMax) pctMax = s.emaPct;
  }
  if (!Number.isFinite(pctMin) || !Number.isFinite(pctMax)) {
    pctMin = -1;
    pctMax = 1;
  }
  if (pctMin > 0) pctMin = 0;
  if (pctMax < 0) pctMax = 0;
  if (pctMin === pctMax) {
    pctMin -= 1;
    pctMax += 1;
  }

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
  const priceDots: ChartLineEmaPctDot[] = [];
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

  let emaPath = '';
  let firstE = true;
  for (const s of run.samples) {
    if (s.ema == null) {
      firstE = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPrice(s.ema);
    emaPath += `${firstE ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstE = false;
  }

  let pctPath = '';
  let firstP = true;
  for (const s of run.samples) {
    if (s.emaPct == null) {
      firstP = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPct(s.emaPct);
    pctPath += `${firstP ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstP = false;
  }

  const markers: ChartLineEmaPctMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.emaPct == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syPct(s.emaPct),
      close: s.close,
      emaPct: s.emaPct,
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
    pctTop,
    pctBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    emaPath: emaPath.trim(),
    priceDots,
    pctPath: pctPath.trim(),
    bullishY: syPct(run.bullishThreshold),
    bearishY: syPct(run.bearishThreshold),
    zeroY: syPct(0),
    markers,
    priceMin,
    priceMax,
    pctMin,
    pctMax,
    run,
  };
}

export function describeLineEmaPctChart(
  data: ChartLineEmaPctPoint[],
  options: {
    length?: number;
    bullishThreshold?: number;
    bearishThreshold?: number;
  } = {},
): string {
  const cleaned = getLineEmaPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineEmaPctLength(
    options.length,
    DEFAULT_CHART_LINE_EMA_PCT_LENGTH,
  );
  const bullishThreshold = normalizeLineEmaPctThreshold(
    options.bullishThreshold,
    DEFAULT_CHART_LINE_EMA_PCT_BULLISH_THRESHOLD,
  );
  const bearishThreshold = normalizeLineEmaPctThreshold(
    options.bearishThreshold,
    DEFAULT_CHART_LINE_EMA_PCT_BEARISH_THRESHOLD,
  );
  return (
    `EMA Percent-Change chart over ${cleaned.length} bars ` +
    `(length ${length}, bullishThreshold ${bullishThreshold}, ` +
    `bearishThreshold ${bearishThreshold}). Top panel renders the ` +
    `close and the EMA; bottom panel renders the close minus the EMA ` +
    `over the EMA scaled to percent.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultPctFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineEmaPct = forwardRef<
  HTMLDivElement,
  ChartLineEmaPctProps
>(function ChartLineEmaPct(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_EMA_PCT_LENGTH,
    bullishThreshold = DEFAULT_CHART_LINE_EMA_PCT_BULLISH_THRESHOLD,
    bearishThreshold = DEFAULT_CHART_LINE_EMA_PCT_BEARISH_THRESHOLD,
    width = DEFAULT_CHART_LINE_EMA_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_EMA_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_EMA_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_EMA_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_EMA_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_EMA_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_EMA_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_EMA_PCT_PRICE_COLOR,
    emaColor = DEFAULT_CHART_LINE_EMA_PCT_EMA_COLOR,
    pctColor = DEFAULT_CHART_LINE_EMA_PCT_PCT_COLOR,
    bullishColor = DEFAULT_CHART_LINE_EMA_PCT_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_EMA_PCT_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_EMA_PCT_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_EMA_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_EMA_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_EMA_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showEma = true,
    showPct = true,
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
    () => getLineEmaPctFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineEmaPctLayout({
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
    ChartLineEmaPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineEmaPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineEmaPctSeriesId,
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
        data-section="chart-line-ema-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineEmaPctChart(cleaned, {
      length,
      bullishThreshold,
      bearishThreshold,
    });

  const showPrice = !hidden.has('price');
  const showEmaLine = !hidden.has('ema') && showEma;
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
      aria-label={ariaLabel ?? 'EMA Percent-Change chart'}
      aria-describedby={descId}
      data-section="chart-line-ema-pct"
      data-length={length}
      data-bullish-threshold={bullishThreshold}
      data-bearish-threshold={bearishThreshold}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-ema-pct-title"
      >
        {ariaLabel ?? 'EMA Percent-Change chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-ema-pct-aria-desc"
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
        data-section="chart-line-ema-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-ema-pct-grid">
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
                  data-section="chart-line-ema-pct-grid-line-price"
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
                  data-section="chart-line-ema-pct-grid-line-pct"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-ema-pct-axes">
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
                  data-section="chart-line-ema-pct-tick-price"
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
                  data-section="chart-line-ema-pct-tick-pct"
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
            data-section="chart-line-ema-pct-zero-line"
          />
        ) : null}

        {showThresholds &&
        (bullishThreshold !== 0 || bearishThreshold !== 0) ? (
          <g data-section="chart-line-ema-pct-thresholds">
            <line
              x1={layout.innerLeft}
              y1={layout.bullishY}
              x2={layout.innerRight}
              y2={layout.bullishY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-ema-pct-bullish-line"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.bearishY}
              x2={layout.innerRight}
              y2={layout.bearishY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-ema-pct-bearish-line"
            />
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ema-pct-price-path"
          />
        ) : null}

        {showEmaLine ? (
          <path
            d={layout.emaPath}
            stroke={emaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ema-pct-ema-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-ema-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-ema-pct-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showPctLine ? (
          <path
            d={layout.pctPath}
            stroke={pctColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ema-pct-line"
          />
        ) : null}

        {showMarkers && showPctLine ? (
          <g data-section="chart-line-ema-pct-markers">
            {layout.markers.map((m) => (
              <circle
                key={`pct-marker-${m.index}`}
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
                data-section="chart-line-ema-pct-marker"
                data-cross={m.crossed}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-ema-pct-hover-targets">
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
                data-section="chart-line-ema-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-ema-pct-tooltip"
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
                  data-section="chart-line-ema-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-pct-tooltip-ema"
                >
                  ema{' '}
                  {tooltipSample.ema == null
                    ? '--'
                    : formatPrice(tooltipSample.ema)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-pct-tooltip-delta"
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
                  data-section="chart-line-ema-pct-tooltip-pct"
                >
                  emaPct{' '}
                  {tooltipSample.emaPct == null
                    ? '--'
                    : formatPct(tooltipSample.emaPct)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-pct-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-pct-tooltip-cross"
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
          data-section="chart-line-ema-pct-badge"
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
          data-section="chart-line-ema-pct-legend"
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
              { id: 'ema' as const, color: emaColor, label: 'ema' },
              { id: 'pct' as const, color: pctColor, label: 'ema pct' },
            ] satisfies Array<{
              id: ChartLineEmaPctSeriesId;
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

ChartLineEmaPct.displayName = 'ChartLineEmaPct';
