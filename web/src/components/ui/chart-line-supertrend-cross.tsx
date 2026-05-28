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
 * ChartLineSupertrendCross -- pure-SVG dual-panel chart with the
 * close overlaid with the Supertrend line in the top panel and the
 * `close - Supertrend` deviation in the bottom panel. Markers fire
 * at every Supertrend direction flip -- the canonical volatility-
 * adaptive trend transition.
 *
 *   hl2[i]          = (high[i] + low[i]) / 2
 *   ATR[i]          = Wilder(true_range[i], length)
 *   basicUpper[i]   = hl2[i] + multiplier * ATR[i]
 *   basicLower[i]   = hl2[i] - multiplier * ATR[i]
 *   finalUpper[i]   = (basicUpper[i] < finalUpper[i-1]
 *                      || close[i-1] > finalUpper[i-1])
 *                       ? basicUpper[i]
 *                       : finalUpper[i-1]
 *   finalLower[i]   = (basicLower[i] > finalLower[i-1]
 *                      || close[i-1] < finalLower[i-1])
 *                       ? basicLower[i]
 *                       : finalLower[i-1]
 *
 * Direction is initialised to `up` (supertrend = finalLower) on
 * the bar that first has a valid ATR. At each subsequent bar:
 *
 *   if direction === 'up'  && close[i] < finalLower[i]:
 *     flip to `down`, supertrend[i] = finalUpper[i]
 *   if direction === 'down' && close[i] > finalUpper[i]:
 *     flip to `up`,   supertrend[i] = finalLower[i]
 *
 * Cross events: `flip-up` (direction newly up), `flip-down`
 * (direction newly down).
 *
 * Bit-exact anchor:
 *
 * - **CONST h = l = close = K**: TR = 0 every bar, ATR = 0, both
 *   basic bands collapse to hl2 = K, both final bands collapse to
 *   K. Supertrend = K, close = K, deviation = 0, relation `equal`,
 *   zero crosses.
 */

export interface ChartLineSupertrendCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineSupertrendCrossDirection = 'up' | 'down' | 'none';

export type ChartLineSupertrendCrossRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLineSupertrendCrossCross = 'flip-up' | 'flip-down' | null;

export type ChartLineSupertrendCrossSeriesId =
  | 'price'
  | 'supertrend'
  | 'deviation';

export interface ChartLineSupertrendCrossSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  atr: number | null;
  supertrend: number | null;
  finalUpper: number | null;
  finalLower: number | null;
  deviation: number | null;
  direction: ChartLineSupertrendCrossDirection;
  relation: ChartLineSupertrendCrossRelation;
  crossed: ChartLineSupertrendCrossCross;
}

export interface ChartLineSupertrendCrossRun {
  series: ChartLineSupertrendCrossPoint[];
  length: number;
  multiplier: number;
  atrValues: Array<number | null>;
  supertrendValues: Array<number | null>;
  finalUpperValues: Array<number | null>;
  finalLowerValues: Array<number | null>;
  directionValues: ChartLineSupertrendCrossDirection[];
  samples: ChartLineSupertrendCrossSample[];
  flipUpCount: number;
  flipDownCount: number;
  bullishCount: number;
  bearishCount: number;
  equalCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineSupertrendCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  kind: 'flip-up' | 'flip-down';
}

export interface ChartLineSupertrendCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSupertrendCrossLayout {
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
  priceDots: ChartLineSupertrendCrossDot[];
  supertrendPath: string;
  deviationPath: string;
  markers: ChartLineSupertrendCrossMarker[];
  priceMin: number;
  priceMax: number;
  devMin: number;
  devMax: number;
  zeroY: number;
  run: ChartLineSupertrendCrossRun;
}

export interface ChartLineSupertrendCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSupertrendCrossPoint[];
  length?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  upSupertrendColor?: string;
  downSupertrendColor?: string;
  deviationColor?: string;
  flipUpColor?: string;
  flipDownColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSupertrend?: boolean;
  showDeviation?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSupertrendCrossSeriesId[];
  defaultHiddenSeries?: ChartLineSupertrendCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSupertrendCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineSupertrendCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatDeviation?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_LENGTH = 10;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_MULTIPLIER = 3;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_DEVIATION_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_FLIP_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_FLIP_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / high / low / close. */
export function getLineSupertrendCrossFinitePoints(
  data: readonly ChartLineSupertrendCrossPoint[] | null | undefined,
): ChartLineSupertrendCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSupertrendCrossPoint[] = [];
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
export function normalizeLineSupertrendCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive finite multiplier (> 0). */
export function normalizeLineSupertrendCrossMultiplier(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value > 0) return value;
  return fallback;
}

/**
 * Wilder smoothing with SMA seed + `min === max` precision fix.
 */
export function applyLineSupertrendCrossWilder(
  values: readonly number[],
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
export function computeLineSupertrendCrossTr(
  data: readonly ChartLineSupertrendCrossPoint[],
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

export interface LineSupertrendCrossChannels {
  atr: Array<number | null>;
  finalUpper: Array<number | null>;
  finalLower: Array<number | null>;
  supertrend: Array<number | null>;
  direction: ChartLineSupertrendCrossDirection[];
}

export function computeLineSupertrendCross(
  series: readonly ChartLineSupertrendCrossPoint[] | null | undefined,
  options: { length?: number; multiplier?: number } = {},
): LineSupertrendCrossChannels {
  const cleaned = getLineSupertrendCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      atr: [],
      finalUpper: [],
      finalLower: [],
      supertrend: [],
      direction: [],
    };
  }
  const length = normalizeLineSupertrendCrossLength(
    options.length,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_LENGTH,
  );
  const multiplier = normalizeLineSupertrendCrossMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_MULTIPLIER,
  );

  const n = cleaned.length;
  const tr = computeLineSupertrendCrossTr(cleaned);
  const atr = applyLineSupertrendCrossWilder(tr, length);

  const finalUpper: Array<number | null> = new Array(n).fill(null);
  const finalLower: Array<number | null> = new Array(n).fill(null);
  const supertrend: Array<number | null> = new Array(n).fill(null);
  const direction: ChartLineSupertrendCrossDirection[] = new Array(n).fill(
    'none',
  );

  let prevUpper: number | null = null;
  let prevLower: number | null = null;
  let prevDir: 'up' | 'down' | null = null;

  for (let i = 0; i < n; i += 1) {
    const cur = cleaned[i];
    const a = atr[i];
    if (!cur || a == null) continue;

    const hl2 = (cur.high + cur.low) / 2;
    const basicUpper = hl2 + multiplier * a;
    const basicLower = hl2 - multiplier * a;

    const prev = i > 0 ? cleaned[i - 1] : null;
    let upper: number;
    let lower: number;
    if (prevUpper == null || prev == null) {
      upper = basicUpper;
    } else {
      upper =
        basicUpper < prevUpper || prev.close > prevUpper
          ? basicUpper
          : prevUpper;
    }
    if (prevLower == null || prev == null) {
      lower = basicLower;
    } else {
      lower =
        basicLower > prevLower || prev.close < prevLower
          ? basicLower
          : prevLower;
    }

    let dir: 'up' | 'down';
    if (prevDir == null) {
      dir = cur.close >= hl2 ? 'up' : 'down';
    } else if (prevDir === 'up') {
      dir = cur.close < lower ? 'down' : 'up';
    } else {
      dir = cur.close > upper ? 'up' : 'down';
    }

    const st = dir === 'up' ? lower : upper;

    finalUpper[i] = posZero(upper);
    finalLower[i] = posZero(lower);
    supertrend[i] = posZero(st);
    direction[i] = dir;

    prevUpper = upper;
    prevLower = lower;
    prevDir = dir;
  }

  return { atr, finalUpper, finalLower, supertrend, direction };
}

export function classifyLineSupertrendCrossRelation(
  close: number | null,
  supertrend: number | null,
): ChartLineSupertrendCrossRelation {
  if (close == null || supertrend == null) return 'none';
  if (close > supertrend) return 'bullish';
  if (close < supertrend) return 'bearish';
  return 'equal';
}

export function detectLineSupertrendCrossFlips(
  directions: readonly ChartLineSupertrendCrossDirection[],
): ChartLineSupertrendCrossCross[] {
  const out: ChartLineSupertrendCrossCross[] = [];
  let prev: ChartLineSupertrendCrossDirection = 'none';
  for (let i = 0; i < directions.length; i += 1) {
    const cur = directions[i] ?? 'none';
    if (i === 0 || prev === 'none' || cur === 'none' || prev === cur) {
      out.push(null);
    } else if (cur === 'up') {
      out.push('flip-up');
    } else {
      out.push('flip-down');
    }
    prev = cur;
  }
  return out;
}

export function runLineSupertrendCross(
  data: ChartLineSupertrendCrossPoint[],
  options: { length?: number; multiplier?: number } = {},
): ChartLineSupertrendCrossRun {
  const cleaned = getLineSupertrendCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineSupertrendCrossLength(
    options.length,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_LENGTH,
  );
  const multiplier = normalizeLineSupertrendCrossMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_MULTIPLIER,
  );

  const channels = computeLineSupertrendCross(series, {
    length,
    multiplier,
  });
  const flips = detectLineSupertrendCrossFlips(channels.direction);

  const samples: ChartLineSupertrendCrossSample[] = series.map((p, i) => {
    const supertrend = channels.supertrend[i] ?? null;
    const direction = channels.direction[i] ?? 'none';
    const relation = classifyLineSupertrendCrossRelation(p.close, supertrend);
    const crossed = flips[i] ?? null;
    const deviation = supertrend == null ? null : posZero(p.close - supertrend);
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      atr: channels.atr[i] ?? null,
      supertrend,
      finalUpper: channels.finalUpper[i] ?? null,
      finalLower: channels.finalLower[i] ?? null,
      deviation,
      direction,
      relation,
      crossed,
    };
  });

  let flipUpCount = 0;
  let flipDownCount = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let equalCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.crossed === 'flip-up') flipUpCount += 1;
    else if (s.crossed === 'flip-down') flipDownCount += 1;
    if (s.relation === 'bullish') bullishCount += 1;
    else if (s.relation === 'bearish') bearishCount += 1;
    else if (s.relation === 'equal') equalCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length + 1;

  return {
    series = [],
    length,
    multiplier,
    atrValues: channels.atr,
    supertrendValues: channels.supertrend,
    finalUpperValues: channels.finalUpper,
    finalLowerValues: channels.finalLower,
    directionValues: channels.direction,
    samples,
    flipUpCount,
    flipDownCount,
    bullishCount,
    bearishCount,
    equalCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineSupertrendCrossLayoutOptions {
  data: ChartLineSupertrendCrossPoint[];
  length?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineSupertrendCrossLayout(
  opts: ComputeLineSupertrendCrossLayoutOptions,
): ChartLineSupertrendCrossLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_SUPERTREND_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_SUPERTREND_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_SUPERTREND_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_SUPERTREND_CROSS_PANEL_GAP;

  const run = runLineSupertrendCross(opts.data, {
    length: opts.length ?? undefined,
    multiplier: opts.multiplier ?? undefined,
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
      supertrendPath: '',
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
    if (s.low < priceMin) priceMin = s.low;
    if (s.high > priceMax) priceMax = s.high;
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
  const priceDots: ChartLineSupertrendCrossDot[] = [];
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
  let stFirst = true;
  for (const s of run.samples) {
    if (s.supertrend == null) {
      stFirst = true;
      continue;
    }
    if (s.crossed != null && !stFirst) {
      stFirst = true;
    }
    const cx = sx(s.x);
    const cy = syPrice(s.supertrend);
    supertrendPath += `${stFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    stFirst = false;
  }
  supertrendPath = supertrendPath.trim();

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

  const markers: ChartLineSupertrendCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'flip-up' && s.crossed !== 'flip-down') continue;
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
    supertrendPath,
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

export function describeLineSupertrendCrossChart(
  data: ChartLineSupertrendCrossPoint[],
  options: { length?: number; multiplier?: number } = {},
): string {
  const cleaned = getLineSupertrendCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineSupertrendCrossLength(
    options.length,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_LENGTH,
  );
  const multiplier = normalizeLineSupertrendCrossMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_MULTIPLIER,
  );
  return (
    `Supertrend Cross chart over ${cleaned.length} bars (length ` +
    `${length}, multiplier ${multiplier}). Top panel overlays the ` +
    `close with the volatility-adaptive Supertrend; bottom panel ` +
    `renders close - Supertrend with markers at every direction ` +
    `flip (flip-up -> uptrend entry, flip-down -> downtrend entry).`
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

export const ChartLineSupertrendCross = forwardRef<
  HTMLDivElement,
  ChartLineSupertrendCrossProps
>(function ChartLineSupertrendCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_SUPERTREND_CROSS_LENGTH,
    multiplier = DEFAULT_CHART_LINE_SUPERTREND_CROSS_MULTIPLIER,
    width = DEFAULT_CHART_LINE_SUPERTREND_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_SUPERTREND_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_SUPERTREND_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SUPERTREND_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SUPERTREND_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_SUPERTREND_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_PRICE_COLOR,
    upSupertrendColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_UP_COLOR,
    downSupertrendColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_DOWN_COLOR,
    deviationColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_DEVIATION_COLOR,
    flipUpColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_FLIP_UP_COLOR,
    flipDownColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_FLIP_DOWN_COLOR,
    zeroColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSupertrend = true,
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
    () => getLineSupertrendCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineSupertrendCrossLayout({
        data: cleaned,
        length,
        multiplier,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, multiplier, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineSupertrendCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineSupertrendCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineSupertrendCrossSeriesId,
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
        data-section="chart-line-supertrend-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineSupertrendCrossChart(cleaned, { length, multiplier });

  const showPrice = !hidden.has('price');
  const showSupertrendLine = !hidden.has('supertrend') && showSupertrend;
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

  const markerColor = (kind: 'flip-up' | 'flip-down'): string =>
    kind === 'flip-up' ? flipUpColor : flipDownColor;

  const currentDir = layout.run.directionValues.find(
    (d) => d === 'up' || d === 'down',
  );
  const supertrendStroke =
    currentDir === 'down' ? downSupertrendColor : upSupertrendColor;

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Supertrend Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-supertrend-cross"
      data-length={length}
      data-multiplier={multiplier}
      data-total-points={cleaned.length}
      data-flip-up-count={layout.run.flipUpCount}
      data-flip-down-count={layout.run.flipDownCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-supertrend-cross-title"
      >
        {ariaLabel ?? 'Supertrend Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-supertrend-cross-aria-desc"
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
        data-section="chart-line-supertrend-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-supertrend-cross-grid">
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
                  data-section="chart-line-supertrend-cross-grid-line-price"
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
                  data-section="chart-line-supertrend-cross-grid-line-dev"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-supertrend-cross-axes">
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
                  data-section="chart-line-supertrend-cross-tick-price"
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
                  data-section="chart-line-supertrend-cross-tick-dev"
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
            data-section="chart-line-supertrend-cross-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-supertrend-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-supertrend-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-supertrend-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSupertrendLine ? (
          <path
            d={layout.supertrendPath}
            stroke={supertrendStroke}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-supertrend-cross-supertrend"
          />
        ) : null}

        {showDeviationLine ? (
          <path
            d={layout.deviationPath}
            stroke={deviationColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-supertrend-cross-deviation"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-supertrend-cross-markers">
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
                data-section="chart-line-supertrend-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-supertrend-cross-hover-targets">
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
                data-section="chart-line-supertrend-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-supertrend-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={208}
                  height={172}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-tooltip-atr"
                >
                  atr{' '}
                  {tooltipSample.atr == null
                    ? '--'
                    : formatDeviation(tooltipSample.atr)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-tooltip-supertrend"
                >
                  supertrend{' '}
                  {tooltipSample.supertrend == null
                    ? '--'
                    : formatPrice(tooltipSample.supertrend)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-tooltip-upper"
                >
                  upper{' '}
                  {tooltipSample.finalUpper == null
                    ? '--'
                    : formatPrice(tooltipSample.finalUpper)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-tooltip-lower"
                >
                  lower{' '}
                  {tooltipSample.finalLower == null
                    ? '--'
                    : formatPrice(tooltipSample.finalLower)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-tooltip-deviation"
                >
                  deviation{' '}
                  {tooltipSample.deviation == null
                    ? '--'
                    : formatDeviation(tooltipSample.deviation)}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-tooltip-direction"
                >
                  direction {tooltipSample.direction}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={142}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={156}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-tooltip-counts"
                >
                  flip-up {layout.run.flipUpCount} | flip-down{' '}
                  {layout.run.flipDownCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-supertrend-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | x{multiplier} | flip-up{' '}
          {layout.run.flipUpCount} | flip-down{' '}
          {layout.run.flipDownCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-supertrend-cross-legend"
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
                color: supertrendStroke,
                label: 'supertrend',
              },
              {
                id: 'deviation' as const,
                color: deviationColor,
                label: 'deviation',
              },
            ] satisfies Array<{
              id: ChartLineSupertrendCrossSeriesId;
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

ChartLineSupertrendCross.displayName = 'ChartLineSupertrendCross';
