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
 * ChartLineTemaPct -- pure-SVG dual-panel chart with the close on
 * top and a Triple-EMA Percent-Change oscillator on the bottom:
 *
 *   ema1[i]   = EMA(close, length)[i]
 *   ema2[i]   = EMA(ema1,  length)[i]
 *   ema3[i]   = EMA(ema2,  length)[i]
 *   tema[i]   = 3 * ema1[i] - 3 * ema2[i] + ema3[i]
 *   temaPct[i] = tema[i] === 0 ? null
 *              : (close[i] - tema[i]) / tema[i] * 100
 *
 * The TEMA formulation cancels the EMA lag at the linear-trend
 * order. `temaPct[i]` is `null` during the triple-EMA warmup
 * (`i < 3 * (length - 1)`) and whenever `tema[i]` is zero.
 *
 * Parallel to 11.836 ema-pct, 11.837 sma-pct, 11.845 wma-pct -- the
 * fourth and final "moving average percent change" variant in this
 * batch.
 *
 * Bit-exact anchors:
 * - **CONST close = K, K != 0**: each EMA pass collapses to `K`
 *   (min === max seed + CONST short-circuit), so
 *   `tema = 3K - 3K + K = K`, and `temaPct = 0` bit-exact
 *   post-warmup.
 * - **CONST close = 0**: every EMA pass is 0, so `tema = 0` ->
 *   divide-by-zero guard returns `null`.
 */

export interface ChartLineTemaPctPoint {
  x: number;
  close: number;
}

export type ChartLineTemaPctZone =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineTemaPctCross = 'up' | 'down' | null;

export type ChartLineTemaPctSeriesId = 'price' | 'tema' | 'pct';

export interface ChartLineTemaPctSample {
  index: number;
  x: number;
  close: number;
  ema1: number | null;
  ema2: number | null;
  ema3: number | null;
  tema: number | null;
  delta: number | null;
  temaPct: number | null;
  zone: ChartLineTemaPctZone;
  crossed: ChartLineTemaPctCross;
}

export interface ChartLineTemaPctRun {
  series: ChartLineTemaPctPoint[];
  length: number;
  bullishThreshold: number;
  bearishThreshold: number;
  ema1Values: Array<number | null>;
  ema2Values: Array<number | null>;
  ema3Values: Array<number | null>;
  temaValues: Array<number | null>;
  deltaValues: Array<number | null>;
  temaPctValues: Array<number | null>;
  samples: ChartLineTemaPctSample[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineTemaPctMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  temaPct: number;
  crossed: 'up' | 'down';
}

export interface ChartLineTemaPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTemaPctLayout {
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
  temaPath: string;
  priceDots: ChartLineTemaPctDot[];
  pctPath: string;
  bullishY: number;
  bearishY: number;
  zeroY: number;
  markers: ChartLineTemaPctMarker[];
  priceMin: number;
  priceMax: number;
  pctMin: number;
  pctMax: number;
  run: ChartLineTemaPctRun;
}

export interface ChartLineTemaPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTemaPctPoint[];
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
  temaColor?: string;
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
  showTema?: boolean;
  showPct?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTemaPctSeriesId[];
  defaultHiddenSeries?: ChartLineTemaPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTemaPctSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineTemaPctSample }) => void;
  formatPrice?: (value: number) => string;
  formatPct?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_TEMA_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_TEMA_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TEMA_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_TEMA_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TEMA_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TEMA_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TEMA_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TEMA_PCT_LENGTH = 14;
export const DEFAULT_CHART_LINE_TEMA_PCT_BULLISH_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_TEMA_PCT_BEARISH_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_TEMA_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TEMA_PCT_TEMA_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_TEMA_PCT_PCT_COLOR = '#db2777';
export const DEFAULT_CHART_LINE_TEMA_PCT_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TEMA_PCT_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TEMA_PCT_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_TEMA_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_TEMA_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TEMA_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x and close. */
export function getLineTemaPctFinitePoints(
  data: readonly ChartLineTemaPctPoint[] | null | undefined,
): ChartLineTemaPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTemaPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer EMA length (>= 2). */
export function normalizeLineTemaPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a numeric threshold (any finite real). */
export function normalizeLineTemaPctThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold)) return threshold;
  return fallback;
}

/**
 * SMA-seeded EMA with CONST short-circuit and `min === max` seed
 * precision fix. Used three times for the TEMA cascade.
 */
export function applyLineTemaPctEma(
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

export interface LineTemaPctChannels {
  ema1: Array<number | null>;
  ema2: Array<number | null>;
  ema3: Array<number | null>;
  tema: Array<number | null>;
  delta: Array<number | null>;
  temaPct: Array<number | null>;
}

export function computeLineTemaPct(
  series: readonly ChartLineTemaPctPoint[] | null | undefined,
  options: { length?: number } = {},
): LineTemaPctChannels {
  const cleaned = getLineTemaPctFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      ema1: [],
      ema2: [],
      ema3: [],
      tema: [],
      delta: [],
      temaPct: [],
    };
  }
  const length = normalizeLineTemaPctLength(
    options.length,
    DEFAULT_CHART_LINE_TEMA_PCT_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const ema1 = applyLineTemaPctEma(closes, length);
  const ema2 = applyLineTemaPctEma(ema1, length);
  const ema3 = applyLineTemaPctEma(ema2, length);

  const tema: Array<number | null> = [];
  const delta: Array<number | null> = [];
  const temaPct: Array<number | null> = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const e1 = ema1[i];
    const e2 = ema2[i];
    const e3 = ema3[i];
    if (e1 == null || e2 == null || e3 == null) {
      tema.push(null);
      delta.push(null);
      temaPct.push(null);
      continue;
    }
    const t = 3 * e1 - 3 * e2 + e3;
    tema.push(posZero(t));
    const c = closes[i]!;
    delta.push(posZero(c - t));
    if (t === 0) {
      temaPct.push(null);
      continue;
    }
    const raw = ((c - t) / t) * 100;
    temaPct.push(Number.isFinite(raw) ? posZero(raw) : null);
  }

  return { ema1, ema2, ema3, tema, delta, temaPct };
}

export function classifyLineTemaPctZone(
  value: number | null,
  bullishThreshold: number,
  bearishThreshold: number,
): ChartLineTemaPctZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > bullishThreshold) return 'bullish';
  if (value < bearishThreshold) return 'bearish';
  return 'neutral';
}

export function detectLineTemaPctCrosses(
  values: readonly (number | null)[],
  bullishThreshold: number,
  bearishThreshold: number,
): ChartLineTemaPctCross[] {
  const out: ChartLineTemaPctCross[] = [];
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

export function runLineTemaPct(
  data: ChartLineTemaPctPoint[],
  options: {
    length?: number;
    bullishThreshold?: number;
    bearishThreshold?: number;
  } = {},
): ChartLineTemaPctRun {
  const cleaned = getLineTemaPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineTemaPctLength(
    options.length,
    DEFAULT_CHART_LINE_TEMA_PCT_LENGTH,
  );
  const bullishThreshold = normalizeLineTemaPctThreshold(
    options.bullishThreshold,
    DEFAULT_CHART_LINE_TEMA_PCT_BULLISH_THRESHOLD,
  );
  const bearishThreshold = normalizeLineTemaPctThreshold(
    options.bearishThreshold,
    DEFAULT_CHART_LINE_TEMA_PCT_BEARISH_THRESHOLD,
  );

  const channels = computeLineTemaPct(series, { length });
  const crosses = detectLineTemaPctCrosses(
    channels.temaPct,
    bullishThreshold,
    bearishThreshold,
  );

  const samples: ChartLineTemaPctSample[] = series.map((p, i) => {
    const ema1 = channels.ema1[i] ?? null;
    const ema2 = channels.ema2[i] ?? null;
    const ema3 = channels.ema3[i] ?? null;
    const tema = channels.tema[i] ?? null;
    const delta = channels.delta[i] ?? null;
    const temaPct = channels.temaPct[i] ?? null;
    const zone = classifyLineTemaPctZone(
      temaPct,
      bullishThreshold,
      bearishThreshold,
    );
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      ema1,
      ema2,
      ema3,
      tema,
      delta,
      temaPct,
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

  const ok = series.length >= 3 * (length - 1) + 1;

  return {
    series,
    length,
    bullishThreshold,
    bearishThreshold,
    ema1Values: channels.ema1,
    ema2Values: channels.ema2,
    ema3Values: channels.ema3,
    temaValues: channels.tema,
    deltaValues: channels.delta,
    temaPctValues: channels.temaPct,
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

export interface ComputeLineTemaPctLayoutOptions {
  data: ChartLineTemaPctPoint[];
  length?: number;
  bullishThreshold?: number;
  bearishThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineTemaPctLayout(
  opts: ComputeLineTemaPctLayoutOptions,
): ChartLineTemaPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_TEMA_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_TEMA_PCT_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_TEMA_PCT_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_TEMA_PCT_PANEL_GAP;

  const run = runLineTemaPct(opts.data, {
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
      temaPath: '',
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
  const priceDots: ChartLineTemaPctDot[] = [];
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
  let firstT = true;
  for (const s of run.samples) {
    if (s.tema == null) {
      firstT = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPrice(s.tema);
    temaPath += `${firstT ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstT = false;
  }

  let pctPath = '';
  let firstP = true;
  for (const s of run.samples) {
    if (s.temaPct == null) {
      firstP = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPct(s.temaPct);
    pctPath += `${firstP ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstP = false;
  }

  const markers: ChartLineTemaPctMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.temaPct == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syPct(s.temaPct),
      close: s.close,
      temaPct: s.temaPct,
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
    temaPath: temaPath.trim(),
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

export function describeLineTemaPctChart(
  data: ChartLineTemaPctPoint[],
  options: {
    length?: number;
    bullishThreshold?: number;
    bearishThreshold?: number;
  } = {},
): string {
  const cleaned = getLineTemaPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineTemaPctLength(
    options.length,
    DEFAULT_CHART_LINE_TEMA_PCT_LENGTH,
  );
  const bullishThreshold = normalizeLineTemaPctThreshold(
    options.bullishThreshold,
    DEFAULT_CHART_LINE_TEMA_PCT_BULLISH_THRESHOLD,
  );
  const bearishThreshold = normalizeLineTemaPctThreshold(
    options.bearishThreshold,
    DEFAULT_CHART_LINE_TEMA_PCT_BEARISH_THRESHOLD,
  );
  return (
    `TEMA Percent-Change chart over ${cleaned.length} bars ` +
    `(length ${length}, bullishThreshold ${bullishThreshold}, ` +
    `bearishThreshold ${bearishThreshold}). Top panel renders the ` +
    `close and the triple-EMA TEMA; bottom panel renders the close ` +
    `minus the TEMA over the TEMA scaled to percent.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultPctFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineTemaPct = forwardRef<
  HTMLDivElement,
  ChartLineTemaPctProps
>(function ChartLineTemaPct(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_TEMA_PCT_LENGTH,
    bullishThreshold = DEFAULT_CHART_LINE_TEMA_PCT_BULLISH_THRESHOLD,
    bearishThreshold = DEFAULT_CHART_LINE_TEMA_PCT_BEARISH_THRESHOLD,
    width = DEFAULT_CHART_LINE_TEMA_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_TEMA_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_TEMA_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_TEMA_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TEMA_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TEMA_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TEMA_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TEMA_PCT_PRICE_COLOR,
    temaColor = DEFAULT_CHART_LINE_TEMA_PCT_TEMA_COLOR,
    pctColor = DEFAULT_CHART_LINE_TEMA_PCT_PCT_COLOR,
    bullishColor = DEFAULT_CHART_LINE_TEMA_PCT_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_TEMA_PCT_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_TEMA_PCT_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_TEMA_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_TEMA_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TEMA_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTema = true,
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
    () => getLineTemaPctFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineTemaPctLayout({
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
    ChartLineTemaPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineTemaPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineTemaPctSeriesId,
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
        data-section="chart-line-tema-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineTemaPctChart(cleaned, {
      length,
      bullishThreshold,
      bearishThreshold,
    });

  const showPrice = !hidden.has('price');
  const showTemaLine = !hidden.has('tema') && showTema;
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
      aria-label={ariaLabel ?? 'TEMA Percent-Change chart'}
      aria-describedby={descId}
      data-section="chart-line-tema-pct"
      data-length={length}
      data-bullish-threshold={bullishThreshold}
      data-bearish-threshold={bearishThreshold}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-tema-pct-title"
      >
        {ariaLabel ?? 'TEMA Percent-Change chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-tema-pct-aria-desc"
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
        data-section="chart-line-tema-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-tema-pct-grid">
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
                  data-section="chart-line-tema-pct-grid-line-price"
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
                  data-section="chart-line-tema-pct-grid-line-pct"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-tema-pct-axes">
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
                  data-section="chart-line-tema-pct-tick-price"
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
                  data-section="chart-line-tema-pct-tick-pct"
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
            data-section="chart-line-tema-pct-zero-line"
          />
        ) : null}

        {showThresholds &&
        (bullishThreshold !== 0 || bearishThreshold !== 0) ? (
          <g data-section="chart-line-tema-pct-thresholds">
            <line
              x1={layout.innerLeft}
              y1={layout.bullishY}
              x2={layout.innerRight}
              y2={layout.bullishY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-tema-pct-bullish-line"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.bearishY}
              x2={layout.innerRight}
              y2={layout.bearishY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-tema-pct-bearish-line"
            />
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-tema-pct-price-path"
          />
        ) : null}

        {showTemaLine ? (
          <path
            d={layout.temaPath}
            stroke={temaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-tema-pct-tema-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-tema-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-tema-pct-price-dot"
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
            data-section="chart-line-tema-pct-line"
          />
        ) : null}

        {showMarkers && showPctLine ? (
          <g data-section="chart-line-tema-pct-markers">
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
                data-section="chart-line-tema-pct-marker"
                data-cross={m.crossed}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-tema-pct-hover-targets">
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
                data-section="chart-line-tema-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-tema-pct-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={180}
                  height={136}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-pct-tooltip-ema1"
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
                  data-section="chart-line-tema-pct-tooltip-ema2"
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
                  data-section="chart-line-tema-pct-tooltip-ema3"
                >
                  ema3{' '}
                  {tooltipSample.ema3 == null
                    ? '--'
                    : formatPrice(tooltipSample.ema3)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-pct-tooltip-tema"
                >
                  tema{' '}
                  {tooltipSample.tema == null
                    ? '--'
                    : formatPrice(tooltipSample.tema)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-pct-tooltip-pct"
                >
                  temaPct{' '}
                  {tooltipSample.temaPct == null
                    ? '--'
                    : formatPct(tooltipSample.temaPct)}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-pct-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-pct-tooltip-cross"
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
          data-section="chart-line-tema-pct-badge"
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
          data-section="chart-line-tema-pct-legend"
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
              { id: 'pct' as const, color: pctColor, label: 'tema pct' },
            ] satisfies Array<{
              id: ChartLineTemaPctSeriesId;
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

ChartLineTemaPct.displayName = 'ChartLineTemaPct';
