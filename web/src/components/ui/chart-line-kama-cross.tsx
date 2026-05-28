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
 * ChartLineKamaCross -- pure-SVG dual-panel chart with the close
 * line on top overlaid with the Kaufman Adaptive Moving Average
 * (KAMA), and the `close - KAMA` deviation in the bottom panel.
 * Markers fire on every close-vs-KAMA crossover -- the canonical
 * efficiency-weighted trend transition.
 *
 *   ER[i]    = |close[i] - close[i - erLength]| /
 *              sum(|close[k] - close[k-1]|) for k in (i-erLength+1..i)
 *   fastSC   = 2 / (fastLength + 1)     -- default fastLength = 2
 *   slowSC   = 2 / (slowLength + 1)     -- default slowLength = 30
 *   SC[i]    = (ER[i] * (fastSC - slowSC) + slowSC) ^ 2
 *   KAMA[erLength]   = close[erLength]                        (seed)
 *   KAMA[i > seed]   = KAMA[i-1] + SC[i] * (close[i] - KAMA[i-1])
 *
 * When the lookback sum is zero (no price changes), ER is set to
 * 0 (treat as slow regime). At seed close === KAMA so the cross
 * detector marks the bar as `equal`, and the next bar fires the
 * first cross.
 *
 * Bit-exact / counted anchors:
 *
 * - **CONST close = K**: every change is 0 -> ER = 0 -> SC =
 *   slowSC^2. KAMA[seed] = K, then `K + SC * (K - K) = K`. KAMA
 *   stays at K forever, `close - KAMA = 0`, relation `equal`,
 *   zero crosses.
 * - **LINEAR UP close = i + 1**: every change is +1, ER = 1,
 *   SC = fastSC^2. KAMA[seed] = close[seed]. At the next bar the
 *   KAMA increment is `fastSC^2 * 1`, which is less than the
 *   close increment of 1, so `close - KAMA = 1 - fastSC^2 > 0`.
 *   The relation flips from `equal` to `bullish` and exactly one
 *   `up` event fires. The gap stays positive after that bar, so
 *   no further crosses.
 * - **LINEAR DOWN close = N - i**: mirror image. Exactly one
 *   `down` cross fires at the bar after the seed.
 */

export interface ChartLineKamaCrossPoint {
  x: number;
  close: number;
}

export type ChartLineKamaCrossRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLineKamaCrossCross = 'up' | 'down' | null;

export type ChartLineKamaCrossRegime =
  | 'trending-up'
  | 'trending-down'
  | 'neutral'
  | 'none';

export type ChartLineKamaCrossSeriesId = 'price' | 'kama' | 'deviation';

export interface ChartLineKamaCrossSample {
  index: number;
  x: number;
  close: number;
  er: number | null;
  sc: number | null;
  kama: number | null;
  deviation: number | null;
  relation: ChartLineKamaCrossRelation;
  regime: ChartLineKamaCrossRegime;
  crossed: ChartLineKamaCrossCross;
}

export interface ChartLineKamaCrossRun {
  series: ChartLineKamaCrossPoint[];
  erLength: number;
  fastLength: number;
  slowLength: number;
  fastSC: number;
  slowSC: number;
  erValues: Array<number | null>;
  scValues: Array<number | null>;
  kamaValues: Array<number | null>;
  deviationValues: Array<number | null>;
  samples: ChartLineKamaCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  trendingUpCount: number;
  trendingDownCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineKamaCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  kind: 'up' | 'down';
}

export interface ChartLineKamaCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineKamaCrossLayout {
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
  priceDots: ChartLineKamaCrossDot[];
  kamaPath: string;
  deviationPath: string;
  markers: ChartLineKamaCrossMarker[];
  priceMin: number;
  priceMax: number;
  devMin: number;
  devMax: number;
  zeroY: number;
  run: ChartLineKamaCrossRun;
}

export interface ChartLineKamaCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineKamaCrossPoint[];
  erLength?: number;
  fastLength?: number;
  slowLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  kamaColor?: string;
  deviationColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showKama?: boolean;
  showDeviation?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineKamaCrossSeriesId[];
  defaultHiddenSeries?: ChartLineKamaCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineKamaCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineKamaCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatDeviation?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_KAMA_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_KAMA_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_KAMA_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_KAMA_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_KAMA_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KAMA_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KAMA_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KAMA_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_KAMA_CROSS_ER_LENGTH = 10;
export const DEFAULT_CHART_LINE_KAMA_CROSS_FAST_LENGTH = 2;
export const DEFAULT_CHART_LINE_KAMA_CROSS_SLOW_LENGTH = 30;
export const DEFAULT_CHART_LINE_KAMA_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KAMA_CROSS_KAMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_KAMA_CROSS_DEVIATION_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_KAMA_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_KAMA_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_KAMA_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_KAMA_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KAMA_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineKamaCrossFinitePoints(
  data: readonly ChartLineKamaCrossPoint[] | null | undefined,
): ChartLineKamaCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineKamaCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineKamaCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * Compute the rolling efficiency ratio.
 * ER[i] = |close[i] - close[i-n]| / sum(|delta|) over i-n+1..i.
 * Returns 0 when the sum is 0 (treat as slow regime).
 */
export function computeLineKamaCrossEfficiencyRatio(
  closes: readonly number[],
  erLength: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (erLength < 1 || closes.length === 0) return out;
  for (let i = erLength; i < closes.length; i += 1) {
    const cur = closes[i];
    const prevN = closes[i - erLength];
    if (cur == null || prevN == null) continue;
    let sumAbs = 0;
    let ok = true;
    for (let k = i - erLength + 1; k <= i; k += 1) {
      const a = closes[k];
      const b = closes[k - 1];
      if (a == null || b == null) {
        ok = false;
        break;
      }
      sumAbs += Math.abs(a - b);
    }
    if (!ok) continue;
    const num = Math.abs(cur - prevN);
    if (sumAbs === 0) {
      out[i] = 0;
    } else {
      out[i] = posZero(num / sumAbs);
    }
  }
  return out;
}

export interface LineKamaCrossChannels {
  er: Array<number | null>;
  sc: Array<number | null>;
  kama: Array<number | null>;
  deviation: Array<number | null>;
  fastSC: number;
  slowSC: number;
}

export function computeLineKamaCross(
  series: readonly ChartLineKamaCrossPoint[] | null | undefined,
  options: {
    erLength?: number;
    fastLength?: number;
    slowLength?: number;
  } = {},
): LineKamaCrossChannels {
  const cleaned = getLineKamaCrossFinitePoints(series);
  const erLength = normalizeLineKamaCrossLength(
    options.erLength,
    DEFAULT_CHART_LINE_KAMA_CROSS_ER_LENGTH,
  );
  const fastLength = normalizeLineKamaCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KAMA_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineKamaCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KAMA_CROSS_SLOW_LENGTH,
  );
  const fastSC = 2 / (fastLength + 1);
  const slowSC = 2 / (slowLength + 1);

  if (cleaned.length === 0) {
    return {
      er: [],
      sc: [],
      kama: [],
      deviation: [],
      fastSC,
      slowSC,
    };
  }

  const closes = cleaned.map((p) => p.close);
  const er = computeLineKamaCrossEfficiencyRatio(closes, erLength);
  const sc: Array<number | null> = new Array(closes.length).fill(null);
  const kama: Array<number | null> = new Array(closes.length).fill(null);
  const deviation: Array<number | null> = new Array(closes.length).fill(null);
  const scDiff = fastSC - slowSC;

  for (let i = 0; i < closes.length; i += 1) {
    const erVal = er[i];
    if (erVal != null) {
      const inner = erVal * scDiff + slowSC;
      sc[i] = posZero(inner * inner);
    }
  }

  let prevKama: number | null = null;
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i];
    if (c == null) {
      prevKama = null;
      continue;
    }
    if (i < erLength) continue;
    if (i === erLength) {
      // seed at first valid ER bar with current close
      kama[i] = posZero(c);
      prevKama = c;
      deviation[i] = 0;
      continue;
    }
    if (prevKama == null) continue;
    const scVal = sc[i];
    if (scVal == null) {
      kama[i] = posZero(prevKama);
      deviation[i] = posZero(c - prevKama);
      continue;
    }
    const next = prevKama + scVal * (c - prevKama);
    kama[i] = posZero(next);
    prevKama = next;
    deviation[i] = posZero(c - next);
  }

  return { er, sc, kama, deviation, fastSC, slowSC };
}

export function classifyLineKamaCrossRelation(
  close: number | null,
  kama: number | null,
): ChartLineKamaCrossRelation {
  if (close == null || kama == null) return 'none';
  if (close > kama) return 'bullish';
  if (close < kama) return 'bearish';
  return 'equal';
}

export function classifyLineKamaCrossRegime(
  relation: ChartLineKamaCrossRelation,
): ChartLineKamaCrossRegime {
  if (relation === 'bullish') return 'trending-up';
  if (relation === 'bearish') return 'trending-down';
  if (relation === 'equal') return 'neutral';
  return 'none';
}

export function detectLineKamaCrossCrosses(
  closes: readonly (number | null)[],
  kamas: readonly (number | null)[],
): ChartLineKamaCrossCross[] {
  const out: ChartLineKamaCrossCross[] = [];
  let prevClose: number | null = null;
  let prevKama: number | null = null;
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i];
    const k = kamas[i];
    if (c == null || k == null) {
      out.push(null);
      prevClose = null;
      prevKama = null;
      continue;
    }
    if (prevClose == null || prevKama == null) {
      out.push(null);
      prevClose = c;
      prevKama = k;
      continue;
    }
    if (prevClose <= prevKama && c > k) {
      out.push('up');
    } else if (prevClose >= prevKama && c < k) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevClose = c;
    prevKama = k;
  }
  return out;
}

export function runLineKamaCross(
  data: ChartLineKamaCrossPoint[],
  options: {
    erLength?: number;
    fastLength?: number;
    slowLength?: number;
  } = {},
): ChartLineKamaCrossRun {
  const cleaned = getLineKamaCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const erLength = normalizeLineKamaCrossLength(
    options.erLength,
    DEFAULT_CHART_LINE_KAMA_CROSS_ER_LENGTH,
  );
  const fastLength = normalizeLineKamaCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KAMA_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineKamaCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KAMA_CROSS_SLOW_LENGTH,
  );

  const channels = computeLineKamaCross(series, {
    erLength,
    fastLength,
    slowLength,
  });
  const closes = series.map((p) => p.close);
  const crosses = detectLineKamaCrossCrosses(closes, channels.kama);

  const samples: ChartLineKamaCrossSample[] = series.map((p, i) => {
    const kama = channels.kama[i] ?? null;
    const deviation = channels.deviation[i] ?? null;
    const relation = classifyLineKamaCrossRelation(p.close, kama);
    const regime = classifyLineKamaCrossRegime(relation);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      er: channels.er[i] ?? null,
      sc: channels.sc[i] ?? null,
      kama,
      deviation,
      relation,
      regime,
      crossed,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let trendingUpCount = 0;
  let trendingDownCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.regime === 'trending-up') trendingUpCount += 1;
    else if (s.regime === 'trending-down') trendingDownCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > erLength + 1;

  return {
    series = [],
    erLength,
    fastLength,
    slowLength,
    fastSC: channels.fastSC,
    slowSC: channels.slowSC,
    erValues: channels.er,
    scValues: channels.sc,
    kamaValues: channels.kama,
    deviationValues: channels.deviation,
    samples,
    upCrossCount,
    downCrossCount,
    trendingUpCount,
    trendingDownCount,
    neutralCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineKamaCrossLayoutOptions {
  data: ChartLineKamaCrossPoint[];
  erLength?: number;
  fastLength?: number;
  slowLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineKamaCrossLayout(
  opts: ComputeLineKamaCrossLayoutOptions,
): ChartLineKamaCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_KAMA_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_KAMA_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_KAMA_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_KAMA_CROSS_PANEL_GAP;

  const run = runLineKamaCross(opts.data, {
    erLength: opts.erLength ?? undefined,
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
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
      kamaPath: '',
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
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
    if (s.kama != null) {
      if (s.kama < priceMin) priceMin = s.kama;
      if (s.kama > priceMax) priceMax = s.kama;
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
  const priceDots: ChartLineKamaCrossDot[] = [];
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

  let kamaPath = '';
  let kamaFirst = true;
  for (const s of run.samples) {
    if (s.kama == null) {
      kamaFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPrice(s.kama);
    kamaPath += `${kamaFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    kamaFirst = false;
  }
  kamaPath = kamaPath.trim();

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

  const markers: ChartLineKamaCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
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
    kamaPath,
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

export function describeLineKamaCrossChart(
  data: ChartLineKamaCrossPoint[],
  options: {
    erLength?: number;
    fastLength?: number;
    slowLength?: number;
  } = {},
): string {
  const cleaned = getLineKamaCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const erLength = normalizeLineKamaCrossLength(
    options.erLength,
    DEFAULT_CHART_LINE_KAMA_CROSS_ER_LENGTH,
  );
  const fastLength = normalizeLineKamaCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KAMA_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineKamaCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KAMA_CROSS_SLOW_LENGTH,
  );
  return (
    `KAMA Cross chart over ${cleaned.length} bars ` +
    `(erLength ${erLength}, fastLength ${fastLength}, slowLength ` +
    `${slowLength}). Top panel overlays the close with the Kaufman ` +
    `Adaptive Moving Average; bottom panel renders the close - KAMA ` +
    `deviation with markers at every close-vs-KAMA cross (up -> ` +
    `trending-up, down -> trending-down).`
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

export const ChartLineKamaCross = forwardRef<
  HTMLDivElement,
  ChartLineKamaCrossProps
>(function ChartLineKamaCross(props, ref): ReactNode {
  const {
    data,
    erLength = DEFAULT_CHART_LINE_KAMA_CROSS_ER_LENGTH,
    fastLength = DEFAULT_CHART_LINE_KAMA_CROSS_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_KAMA_CROSS_SLOW_LENGTH,
    width = DEFAULT_CHART_LINE_KAMA_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_KAMA_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_KAMA_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_KAMA_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_KAMA_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_KAMA_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_KAMA_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_KAMA_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_KAMA_CROSS_PRICE_COLOR,
    kamaColor = DEFAULT_CHART_LINE_KAMA_CROSS_KAMA_COLOR,
    deviationColor = DEFAULT_CHART_LINE_KAMA_CROSS_DEVIATION_COLOR,
    bullishColor = DEFAULT_CHART_LINE_KAMA_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_KAMA_CROSS_BEARISH_COLOR,
    zeroColor = DEFAULT_CHART_LINE_KAMA_CROSS_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_KAMA_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_KAMA_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showKama = true,
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
    () => getLineKamaCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineKamaCrossLayout({
        data: cleaned,
        erLength,
        fastLength,
        slowLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      erLength,
      fastLength,
      slowLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineKamaCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineKamaCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineKamaCrossSeriesId,
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
        data-section="chart-line-kama-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineKamaCrossChart(cleaned, {
      erLength,
      fastLength,
      slowLength,
    });

  const showPrice = !hidden.has('price');
  const showKamaLine = !hidden.has('kama') && showKama;
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

  const markerColor = (kind: 'up' | 'down'): string =>
    kind === 'up' ? bullishColor : bearishColor;

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'KAMA Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-kama-cross"
      data-er-length={erLength}
      data-fast-length={fastLength}
      data-slow-length={slowLength}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-kama-cross-title"
      >
        {ariaLabel ?? 'KAMA Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-kama-cross-aria-desc"
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
        data-section="chart-line-kama-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-kama-cross-grid">
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
                  data-section="chart-line-kama-cross-grid-line-price"
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
                  data-section="chart-line-kama-cross-grid-line-dev"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-kama-cross-axes">
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
                  data-section="chart-line-kama-cross-tick-price"
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
                  data-section="chart-line-kama-cross-tick-dev"
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
            data-section="chart-line-kama-cross-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-kama-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-kama-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-kama-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showKamaLine ? (
          <path
            d={layout.kamaPath}
            stroke={kamaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-kama-cross-kama"
          />
        ) : null}

        {showDeviationLine ? (
          <path
            d={layout.deviationPath}
            stroke={deviationColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-kama-cross-deviation"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-kama-cross-markers">
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
                data-section="chart-line-kama-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-kama-cross-hover-targets">
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
                data-section="chart-line-kama-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-kama-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={200}
                  height={160}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-tooltip-kama"
                >
                  kama{' '}
                  {tooltipSample.kama == null
                    ? '--'
                    : formatPrice(tooltipSample.kama)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-tooltip-er"
                >
                  er{' '}
                  {tooltipSample.er == null
                    ? '--'
                    : formatDeviation(tooltipSample.er)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-tooltip-sc"
                >
                  sc{' '}
                  {tooltipSample.sc == null
                    ? '--'
                    : formatDeviation(tooltipSample.sc)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-tooltip-deviation"
                >
                  deviation{' '}
                  {tooltipSample.deviation == null
                    ? '--'
                    : formatDeviation(tooltipSample.deviation)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={142}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-tooltip-counts"
                >
                  up {layout.run.upCrossCount} | down{' '}
                  {layout.run.downCrossCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-kama-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          er {erLength} | fast {fastLength} | slow {slowLength} | up{' '}
          {layout.run.upCrossCount} | down {layout.run.downCrossCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-kama-cross-legend"
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
              { id: 'kama' as const, color: kamaColor, label: 'kama' },
              {
                id: 'deviation' as const,
                color: deviationColor,
                label: 'deviation',
              },
            ] satisfies Array<{
              id: ChartLineKamaCrossSeriesId;
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

ChartLineKamaCross.displayName = 'ChartLineKamaCross';
