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
 * ChartLineAdxCross -- pure-SVG dual-panel chart with the close on
 * top and a Wilder ADX line in the bottom panel that fires marker
 * events when ADX crosses one of two regime thresholds (low at 20,
 * high at 40). Tracks four crossover events:
 *
 *   enter20: ADX newly exceeds the low threshold (weak -> trending)
 *   exit20:  ADX newly falls below the low threshold (-> weak)
 *   enter40: ADX newly exceeds the high threshold (-> strong)
 *   exit40:  ADX newly falls below the high threshold (-> trending)
 *
 * Formula:
 *   TR[i]      = max(h-l, |h - prevClose|, |l - prevClose|);
 *                TR[0] = h - l (no prevClose).
 *   +DM[i]     = (h - prevHigh) if positive and > (prevLow - l) else 0
 *   -DM[i]     = (prevLow - l) if positive and > (h - prevHigh) else 0
 *   trSmooth   = Wilder(TR, n)
 *   pdmSmooth  = Wilder(+DM, n)
 *   ndmSmooth  = Wilder(-DM, n)
 *   +DI        = 100 * pdmSmooth / trSmooth
 *   -DI        = 100 * ndmSmooth / trSmooth
 *   DX         = 100 * |+DI - -DI| / (+DI + -DI)
 *   ADX        = Wilder(DX, n)
 *
 * Bit-exact anchors (with the `min === max` Wilder precision fix
 * and the `next = v === smoothed ? v : ...` CONST short-circuit):
 *
 * - **CONST h = l = close = K**: TR is constant 0, both DMs are 0
 *   -- division by zero leaves +DI/-DI/DX/ADX `null` forever. Zero
 *   crosses fire and bias is `none`.
 * - **LINEAR UP h = close = i+1, l = i**: TR is constant 1, +DM = 1
 *   on every bar after the first (with +DM[0] = 0), -DM = 0
 *   everywhere. -DI = 0 makes `DX = 100 * |+DI| / +DI = 100` for
 *   every defined bar, so `ADX = 100` bit-exactly once seeded.
 * - **LINEAR DOWN h = (N-i)+5, l = (N-i)-5, close = N-i**: TR is
 *   constant 10, -DM = 1 on every bar after the first, +DM = 0
 *   everywhere. Mirror image of LINEAR UP -- +DI = 0 makes
 *   `DX = 100` and `ADX = 100` bit-exactly.
 *
 * In all three cases ADX never crosses 20 or 40 (CONST stays at
 * null; LINEAR UP / DOWN appear directly at 100 with no prev
 * relation), so cross counts are zero.
 */

export interface ChartLineAdxCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAdxCrossRegime =
  | 'none'
  | 'weak'
  | 'trending'
  | 'strong';

export type ChartLineAdxCrossEvent =
  | 'enter20'
  | 'exit20'
  | 'enter40'
  | 'exit40'
  | null;

export type ChartLineAdxCrossSeriesId = 'price' | 'adx';

export interface ChartLineAdxCrossSample {
  index: number;
  x: number;
  close: number;
  adx: number | null;
  regime: ChartLineAdxCrossRegime;
  event: ChartLineAdxCrossEvent;
}

export interface ChartLineAdxCrossRun {
  series: ChartLineAdxCrossPoint[];
  length: number;
  lowThreshold: number;
  highThreshold: number;
  adxValues: Array<number | null>;
  samples: ChartLineAdxCrossSample[];
  enter20Count: number;
  exit20Count: number;
  enter40Count: number;
  exit40Count: number;
  weakCount: number;
  trendingCount: number;
  strongCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineAdxCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  adx: number;
  event: NonNullable<ChartLineAdxCrossEvent>;
}

export interface ChartLineAdxCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAdxCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  adxTop: number;
  adxBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineAdxCrossDot[];
  adxPath: string;
  markers: ChartLineAdxCrossMarker[];
  priceMin: number;
  priceMax: number;
  adxMin: number;
  adxMax: number;
  lowY: number;
  highY: number;
  run: ChartLineAdxCrossRun;
}

export interface ChartLineAdxCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAdxCrossPoint[];
  length?: number;
  lowThreshold?: number;
  highThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  adxColor?: string;
  lowThresholdColor?: string;
  highThresholdColor?: string;
  enterColor?: string;
  exitColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAdx?: boolean;
  showMarkers?: boolean;
  showLowThreshold?: boolean;
  showHighThreshold?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAdxCrossSeriesId[];
  defaultHiddenSeries?: ChartLineAdxCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAdxCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineAdxCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatAdx?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ADX_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ADX_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ADX_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_ADX_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ADX_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ADX_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ADX_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ADX_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_ADX_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_ADX_CROSS_LOW_THRESHOLD = 20;
export const DEFAULT_CHART_LINE_ADX_CROSS_HIGH_THRESHOLD = 40;
export const DEFAULT_CHART_LINE_ADX_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ADX_CROSS_ADX_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ADX_CROSS_LOW_THRESHOLD_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_ADX_CROSS_HIGH_THRESHOLD_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_ADX_CROSS_ENTER_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADX_CROSS_EXIT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ADX_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x, high, low, close. */
export function getLineAdxCrossFinitePoints(
  data: readonly ChartLineAdxCrossPoint[] | null | undefined,
): ChartLineAdxCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAdxCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
      });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineAdxCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a finite threshold within [0, 100]. */
export function normalizeLineAdxCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 0 && value <= 100) return value;
  return fallback;
}

/**
 * Wilder smoothing with SMA seed + `min === max` precision fix.
 * `next = v === smoothed ? v : (smoothed * (n - 1) + v) / n` keeps
 * constants exact.
 */
export function applyLineAdxCrossWilder(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
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
        v === smoothed
          ? v
          : (smoothed * (length - 1) + v) / length;
      smoothed = next;
      out[i] = posZero(next);
    }
  }
  return out;
}

/** True Range with TR[0] = high[0] - low[0]. */
export function computeLineAdxCrossTr(
  data: readonly ChartLineAdxCrossPoint[],
): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 1) {
    const cur = data[i];
    if (!cur) {
      out.push(0);
      continue;
    }
    if (i === 0) {
      out.push(posZero(cur.high - cur.low));
      continue;
    }
    const prev = data[i - 1];
    if (!prev) {
      out.push(0);
      continue;
    }
    const a = cur.high - cur.low;
    const b = Math.abs(cur.high - prev.close);
    const c = Math.abs(cur.low - prev.close);
    out.push(posZero(Math.max(a, b, c)));
  }
  return out;
}

/** Per-bar +DM / -DM. [0] = 0 for both (no prev). */
export function computeLineAdxCrossDm(
  data: readonly ChartLineAdxCrossPoint[],
): { plusDm: number[]; minusDm: number[] } {
  const plusDm: number[] = [];
  const minusDm: number[] = [];
  for (let i = 0; i < data.length; i += 1) {
    const cur = data[i];
    if (!cur) {
      plusDm.push(0);
      minusDm.push(0);
      continue;
    }
    if (i === 0) {
      plusDm.push(0);
      minusDm.push(0);
      continue;
    }
    const prev = data[i - 1];
    if (!prev) {
      plusDm.push(0);
      minusDm.push(0);
      continue;
    }
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    if (upMove > downMove && upMove > 0) {
      plusDm.push(posZero(upMove));
      minusDm.push(0);
    } else if (downMove > upMove && downMove > 0) {
      plusDm.push(0);
      minusDm.push(posZero(downMove));
    } else {
      plusDm.push(0);
      minusDm.push(0);
    }
  }
  return { plusDm, minusDm };
}

export interface LineAdxCrossChannels {
  tr: number[];
  plusDm: number[];
  minusDm: number[];
  trSmoothed: Array<number | null>;
  plusDmSmoothed: Array<number | null>;
  minusDmSmoothed: Array<number | null>;
  plusDi: Array<number | null>;
  minusDi: Array<number | null>;
  dx: Array<number | null>;
  adx: Array<number | null>;
}

export function computeLineAdxCross(
  series: readonly ChartLineAdxCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineAdxCrossChannels {
  const cleaned = getLineAdxCrossFinitePoints(series);
  const length = normalizeLineAdxCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ADX_CROSS_LENGTH,
  );
  if (cleaned.length === 0) {
    return {
      tr: [],
      plusDm: [],
      minusDm: [],
      trSmoothed: [],
      plusDmSmoothed: [],
      minusDmSmoothed: [],
      plusDi: [],
      minusDi: [],
      dx: [],
      adx: [],
    };
  }
  const tr = computeLineAdxCrossTr(cleaned);
  const { plusDm, minusDm } = computeLineAdxCrossDm(cleaned);

  const trSmoothed = applyLineAdxCrossWilder(tr, length);
  const plusDmSmoothed = applyLineAdxCrossWilder(plusDm, length);
  const minusDmSmoothed = applyLineAdxCrossWilder(minusDm, length);

  const plusDi: Array<number | null> = [];
  const minusDi: Array<number | null> = [];
  const dx: Array<number | null> = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const t = trSmoothed[i];
    const p = plusDmSmoothed[i];
    const m = minusDmSmoothed[i];
    if (t == null || p == null || m == null || t === 0) {
      plusDi.push(null);
      minusDi.push(null);
      dx.push(null);
      continue;
    }
    const pd = (100 * p) / t;
    const nd = (100 * m) / t;
    plusDi.push(posZero(pd));
    minusDi.push(posZero(nd));
    const sum = pd + nd;
    if (sum === 0) {
      dx.push(null);
      continue;
    }
    dx.push(posZero((100 * Math.abs(pd - nd)) / sum));
  }

  const adx = applyLineAdxCrossWilder(dx, length);
  return {
    tr,
    plusDm,
    minusDm,
    trSmoothed,
    plusDmSmoothed,
    minusDmSmoothed,
    plusDi,
    minusDi,
    dx,
    adx,
  };
}

export function classifyLineAdxCrossRegime(
  adx: number | null,
  lowThreshold: number,
  highThreshold: number,
): ChartLineAdxCrossRegime {
  if (adx == null) return 'none';
  if (adx < lowThreshold) return 'weak';
  if (adx < highThreshold) return 'trending';
  return 'strong';
}

export function detectLineAdxCrossEvents(
  adxValues: readonly (number | null)[],
  lowThreshold: number,
  highThreshold: number,
): ChartLineAdxCrossEvent[] {
  const out: ChartLineAdxCrossEvent[] = [];
  let prev: number | null = null;
  for (let i = 0; i < adxValues.length; i += 1) {
    const cur = adxValues[i];
    if (cur == null) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev == null) {
      out.push(null);
      prev = cur;
      continue;
    }
    let event: ChartLineAdxCrossEvent = null;
    if (prev <= highThreshold && cur > highThreshold) {
      event = 'enter40';
    } else if (prev >= highThreshold && cur < highThreshold) {
      event = 'exit40';
    } else if (prev <= lowThreshold && cur > lowThreshold) {
      event = 'enter20';
    } else if (prev >= lowThreshold && cur < lowThreshold) {
      event = 'exit20';
    }
    out.push(event);
    prev = cur;
  }
  return out;
}

export function runLineAdxCross(
  data: ChartLineAdxCrossPoint[],
  options: {
    length?: number;
    lowThreshold?: number;
    highThreshold?: number;
  } = {},
): ChartLineAdxCrossRun {
  const cleaned = getLineAdxCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineAdxCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ADX_CROSS_LENGTH,
  );
  const lowThreshold = normalizeLineAdxCrossThreshold(
    options.lowThreshold,
    DEFAULT_CHART_LINE_ADX_CROSS_LOW_THRESHOLD,
  );
  const highThreshold = normalizeLineAdxCrossThreshold(
    options.highThreshold,
    DEFAULT_CHART_LINE_ADX_CROSS_HIGH_THRESHOLD,
  );

  const channels = computeLineAdxCross(series, { length });
  const events = detectLineAdxCrossEvents(
    channels.adx,
    lowThreshold,
    highThreshold,
  );

  const samples: ChartLineAdxCrossSample[] = series.map((p, i) => {
    const adx = channels.adx[i] ?? null;
    const regime = classifyLineAdxCrossRegime(
      adx,
      lowThreshold,
      highThreshold,
    );
    const event = events[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      adx,
      regime,
      event,
    };
  });

  let enter20Count = 0;
  let exit20Count = 0;
  let enter40Count = 0;
  let exit40Count = 0;
  let weakCount = 0;
  let trendingCount = 0;
  let strongCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.event === 'enter20') enter20Count += 1;
    else if (s.event === 'exit20') exit20Count += 1;
    else if (s.event === 'enter40') enter40Count += 1;
    else if (s.event === 'exit40') exit40Count += 1;
    if (s.regime === 'weak') weakCount += 1;
    else if (s.regime === 'trending') trendingCount += 1;
    else if (s.regime === 'strong') strongCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length * 2;

  return {
    series,
    length,
    lowThreshold,
    highThreshold,
    adxValues: channels.adx,
    samples,
    enter20Count,
    exit20Count,
    enter40Count,
    exit40Count,
    weakCount,
    trendingCount,
    strongCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineAdxCrossLayoutOptions {
  data: ChartLineAdxCrossPoint[];
  length?: number;
  lowThreshold?: number;
  highThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAdxCrossLayout(
  opts: ComputeLineAdxCrossLayoutOptions,
): ChartLineAdxCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ADX_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ADX_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_ADX_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_ADX_CROSS_PANEL_GAP;

  const run = runLineAdxCross(opts.data, {
    length: opts.length ?? undefined,
    lowThreshold: opts.lowThreshold ?? undefined,
    highThreshold: opts.highThreshold ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const adxTop = priceBottom + panelGap;
  const adxBottom = priceBottom + panelGap + usable * 0.45;

  const adxMin = 0;
  const adxMax = 100;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      adxTop,
      adxBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      adxPath: '',
      markers: [],
      priceMin: 0,
      priceMax: 0,
      adxMin,
      adxMax,
      lowY: 0,
      highY: 0,
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

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syAdx = (y: number): number =>
    adxBottom - ((y - adxMin) / (adxMax - adxMin)) * (adxBottom - adxTop);

  let pricePath = '';
  const priceDots: ChartLineAdxCrossDot[] = [];
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

  let adxPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.adx == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syAdx(s.adx);
    adxPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  adxPath = adxPath.trim();

  const markers: ChartLineAdxCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.event == null) continue;
    if (s.adx == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syAdx(s.adx),
      adx: s.adx,
      event: s.event,
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
    adxTop,
    adxBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    adxPath,
    markers,
    priceMin,
    priceMax,
    adxMin,
    adxMax,
    lowY: syAdx(run.lowThreshold),
    highY: syAdx(run.highThreshold),
    run,
  };
}

export function describeLineAdxCrossChart(
  data: ChartLineAdxCrossPoint[],
  options: {
    length?: number;
    lowThreshold?: number;
    highThreshold?: number;
  } = {},
): string {
  const cleaned = getLineAdxCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineAdxCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ADX_CROSS_LENGTH,
  );
  const lowThreshold = normalizeLineAdxCrossThreshold(
    options.lowThreshold,
    DEFAULT_CHART_LINE_ADX_CROSS_LOW_THRESHOLD,
  );
  const highThreshold = normalizeLineAdxCrossThreshold(
    options.highThreshold,
    DEFAULT_CHART_LINE_ADX_CROSS_HIGH_THRESHOLD,
  );
  return (
    `ADX Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, low ${lowThreshold}, high ${highThreshold}). ` +
    `Top panel renders the close; bottom panel renders the Wilder ` +
    `ADX line with markers at every threshold cross (enter20 / ` +
    `exit20 / enter40 / exit40).`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultAdxFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineAdxCross = forwardRef<
  HTMLDivElement,
  ChartLineAdxCrossProps
>(function ChartLineAdxCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_ADX_CROSS_LENGTH,
    lowThreshold = DEFAULT_CHART_LINE_ADX_CROSS_LOW_THRESHOLD,
    highThreshold = DEFAULT_CHART_LINE_ADX_CROSS_HIGH_THRESHOLD,
    width = DEFAULT_CHART_LINE_ADX_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_ADX_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ADX_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_ADX_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ADX_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ADX_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ADX_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_ADX_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ADX_CROSS_PRICE_COLOR,
    adxColor = DEFAULT_CHART_LINE_ADX_CROSS_ADX_COLOR,
    lowThresholdColor = DEFAULT_CHART_LINE_ADX_CROSS_LOW_THRESHOLD_COLOR,
    highThresholdColor = DEFAULT_CHART_LINE_ADX_CROSS_HIGH_THRESHOLD_COLOR,
    enterColor = DEFAULT_CHART_LINE_ADX_CROSS_ENTER_COLOR,
    exitColor = DEFAULT_CHART_LINE_ADX_CROSS_EXIT_COLOR,
    axisColor = DEFAULT_CHART_LINE_ADX_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ADX_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAdx = true,
    showMarkers = true,
    showLowThreshold = true,
    showHighThreshold = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onCrossClick,
    formatPrice = defaultPriceFormatter,
    formatAdx = defaultAdxFormatter,
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
    () => getLineAdxCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAdxCrossLayout({
        data: cleaned,
        length,
        lowThreshold,
        highThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      lowThreshold,
      highThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineAdxCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineAdxCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineAdxCrossSeriesId,
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
        data-section="chart-line-adx-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAdxCrossChart(cleaned, {
      length,
      lowThreshold,
      highThreshold,
    });

  const showPrice = !hidden.has('price');
  const showAdxLine = !hidden.has('adx') && showAdx;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickAdxValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickAdxValues.push(
      layout.adxMin + ((layout.adxMax - layout.adxMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  const markerColor = (
    event: NonNullable<ChartLineAdxCrossEvent>,
  ): string => {
    if (event === 'enter20' || event === 'enter40') return enterColor;
    return exitColor;
  };

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'ADX Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-adx-cross"
      data-length={length}
      data-low-threshold={lowThreshold}
      data-high-threshold={highThreshold}
      data-total-points={cleaned.length}
      data-enter20-count={layout.run.enter20Count}
      data-exit20-count={layout.run.exit20Count}
      data-enter40-count={layout.run.enter40Count}
      data-exit40-count={layout.run.exit40Count}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-adx-cross-title"
      >
        {ariaLabel ?? 'ADX Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-adx-cross-aria-desc"
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
        data-section="chart-line-adx-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-adx-cross-grid">
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
                  data-section="chart-line-adx-cross-grid-line-price"
                />
              );
            })}
            {tickAdxValues.map((v, i) => {
              const y =
                layout.adxBottom -
                ((v - layout.adxMin) /
                  (layout.adxMax - layout.adxMin)) *
                  (layout.adxBottom - layout.adxTop);
              return (
                <line
                  key={`grid-adx-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-adx-cross-grid-line-adx"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-adx-cross-axes">
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
              y1={layout.adxTop}
              x2={layout.innerLeft}
              y2={layout.adxBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.adxBottom}
              x2={layout.innerRight}
              y2={layout.adxBottom}
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
                  data-section="chart-line-adx-cross-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickAdxValues.map((v, i) => {
              const y =
                layout.adxBottom -
                ((v - layout.adxMin) /
                  (layout.adxMax - layout.adxMin)) *
                  (layout.adxBottom - layout.adxTop);
              return (
                <text
                  key={`tick-adx-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-adx-cross-tick-adx"
                >
                  {formatAdx(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showLowThreshold ? (
          <line
            x1={layout.innerLeft}
            y1={layout.lowY}
            x2={layout.innerRight}
            y2={layout.lowY}
            stroke={lowThresholdColor}
            strokeDasharray="3 3"
            data-section="chart-line-adx-cross-low-threshold"
          />
        ) : null}

        {showHighThreshold ? (
          <line
            x1={layout.innerLeft}
            y1={layout.highY}
            x2={layout.innerRight}
            y2={layout.highY}
            stroke={highThresholdColor}
            strokeDasharray="3 3"
            data-section="chart-line-adx-cross-high-threshold"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-adx-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-adx-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-adx-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showAdxLine ? (
          <path
            d={layout.adxPath}
            stroke={adxColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-adx-cross-adx-path"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-adx-cross-markers">
            {layout.markers.map((m) => (
              <circle
                key={`marker-${m.index}-${m.event}`}
                cx={m.cx}
                cy={m.cy}
                r={markerRadius}
                fill={markerColor(m.event)}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onCrossClick?.({ point: sample });
                }}
                data-section="chart-line-adx-cross-marker"
                data-event={m.event}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-adx-cross-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.adxBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-adx-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-adx-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={188}
                  height={130}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-cross-tooltip-adx"
                >
                  adx{' '}
                  {tooltipSample.adx == null
                    ? '--'
                    : formatAdx(tooltipSample.adx)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-cross-tooltip-event"
                >
                  event {tooltipSample.event ?? '--'}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-cross-tooltip-enter"
                >
                  enter20 {layout.run.enter20Count} | enter40{' '}
                  {layout.run.enter40Count}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-cross-tooltip-exit"
                >
                  exit20 {layout.run.exit20Count} | exit40{' '}
                  {layout.run.exit40Count}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-adx-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | low {lowThreshold} | high {highThreshold} |
          enter20 {layout.run.enter20Count} | exit20{' '}
          {layout.run.exit20Count} | enter40 {layout.run.enter40Count} |
          exit40 {layout.run.exit40Count}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-adx-cross-legend"
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
              { id: 'adx' as const, color: adxColor, label: 'adx' },
            ] satisfies Array<{
              id: ChartLineAdxCrossSeriesId;
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

ChartLineAdxCross.displayName = 'ChartLineAdxCross';
