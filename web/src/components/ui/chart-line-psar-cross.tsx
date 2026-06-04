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
 * ChartLinePsarCross -- pure-SVG dual-panel chart with the close
 * line overlaid with the Parabolic SAR dots in the top panel and
 * the `close - SAR` deviation in the bottom panel. Markers fire at
 * every SAR flip -- the canonical "stop and reverse" event.
 *
 * Cross events:
 *   `flip-up`   -- trend newly turned to up (SAR moved below price)
 *   `flip-down` -- trend newly turned to down (SAR moved above price)
 *
 * Algorithm (Wilder's classic Parabolic SAR):
 *
 *   1. Initial trend = `up`, SAR[0] = low[0], EP = high[0],
 *      AF = afInitial.
 *   2. For each subsequent bar i:
 *      next_sar = SAR[i-1] + AF * (EP - SAR[i-1])
 *      In uptrend, clamp next_sar <= min(low[i-1], low[i-2])
 *      In downtrend, clamp next_sar >= max(high[i-1], high[i-2])
 *      If uptrend and low[i] < next_sar -> flip to down:
 *        SAR[i] = EP, EP = low[i], AF = afInitial
 *      Else if downtrend and high[i] > next_sar -> flip to up:
 *        SAR[i] = EP, EP = high[i], AF = afInitial
 *      Else (no flip):
 *        SAR[i] = next_sar
 *        In uptrend if high[i] > EP -> EP = high[i],
 *                                       AF = min(AF + afStep, afMax)
 *        In downtrend if low[i] < EP -> EP = low[i],
 *                                       AF = min(AF + afStep, afMax)
 *
 * Bit-exact anchors:
 *
 * - **CONST h = l = close = K**: SAR[0] = K, EP = K. Each bar's
 *   `next_sar = K + AF*(K - K) = K`, the clamp keeps it at K,
 *   and the flip checks (`low < SAR` / `high > SAR`) are false
 *   because both sides equal K. SAR stays K forever, trend stays
 *   `up`, deviation = 0, zero crosses.
 * - **LINEAR UP h = l = close = i + 1**: starts in uptrend with
 *   SAR = low[0] = 1, EP = 1. The cap clamps next_sar to the
 *   minimum of the previous two lows, which stays at 1 (since
 *   low[0] = 1 is always in the lookback). SAR stays at 1 forever
 *   and is always below the rising low, so no flips fire.
 * - **LINEAR DOWN h = l = close = N - i (count N)**: starts in
 *   uptrend with SAR = N, EP = N. At bar 1 the new low = N-1 is
 *   strictly less than SAR = N -> flip to downtrend, exactly one
 *   `flip-down` event fires. After that bar the downtrend cap
 *   keeps SAR above the dropping high; SAR stays above price; no
 *   further flips.
 */

export interface ChartLinePsarCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLinePsarCrossTrend = 'up' | 'down' | 'none';

export type ChartLinePsarCrossRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLinePsarCrossCross = 'flip-up' | 'flip-down' | null;

export type ChartLinePsarCrossSeriesId = 'price' | 'sar' | 'deviation';

export interface ChartLinePsarCrossSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  sar: number | null;
  deviation: number | null;
  trend: ChartLinePsarCrossTrend;
  relation: ChartLinePsarCrossRelation;
  crossed: ChartLinePsarCrossCross;
  af: number | null;
  ep: number | null;
}

export interface ChartLinePsarCrossRun {
  series: ChartLinePsarCrossPoint[];
  afInitial: number;
  afStep: number;
  afMax: number;
  sarValues: Array<number | null>;
  trendValues: ChartLinePsarCrossTrend[];
  afValues: Array<number | null>;
  epValues: Array<number | null>;
  samples: ChartLinePsarCrossSample[];
  flipUpCount: number;
  flipDownCount: number;
  bullishCount: number;
  bearishCount: number;
  equalCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLinePsarCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  kind: 'flip-up' | 'flip-down';
}

export interface ChartLinePsarCrossSarDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  sar: number;
  trend: ChartLinePsarCrossTrend;
}

export interface ChartLinePsarCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLinePsarCrossLayout {
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
  priceDots: ChartLinePsarCrossDot[];
  sarDots: ChartLinePsarCrossSarDot[];
  deviationPath: string;
  markers: ChartLinePsarCrossMarker[];
  priceMin: number;
  priceMax: number;
  devMin: number;
  devMax: number;
  zeroY: number;
  run: ChartLinePsarCrossRun;
}

export interface ChartLinePsarCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLinePsarCrossPoint[];
  afInitial?: number;
  afStep?: number;
  afMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  sarDotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  upSarColor?: string;
  downSarColor?: string;
  deviationColor?: string;
  flipUpColor?: string;
  flipDownColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSar?: boolean;
  showDeviation?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLinePsarCrossSeriesId[];
  defaultHiddenSeries?: ChartLinePsarCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLinePsarCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLinePsarCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatDeviation?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_PSAR_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_PSAR_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_PSAR_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_PSAR_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_PSAR_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PSAR_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PSAR_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PSAR_CROSS_SAR_DOT_RADIUS = 2.5;
export const DEFAULT_CHART_LINE_PSAR_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_PSAR_CROSS_AF_INITIAL = 0.02;
export const DEFAULT_CHART_LINE_PSAR_CROSS_AF_STEP = 0.02;
export const DEFAULT_CHART_LINE_PSAR_CROSS_AF_MAX = 0.2;
export const DEFAULT_CHART_LINE_PSAR_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_PSAR_CROSS_UP_SAR_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PSAR_CROSS_DOWN_SAR_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PSAR_CROSS_DEVIATION_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_PSAR_CROSS_FLIP_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PSAR_CROSS_FLIP_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PSAR_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_PSAR_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PSAR_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / high / low / close. */
export function getLinePsarCrossFinitePoints(
  data: readonly ChartLinePsarCrossPoint[] | null | undefined,
): ChartLinePsarCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLinePsarCrossPoint[] = [];
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

/** Coerce a finite acceleration value within [0, 1]. */
export function normalizeLinePsarCrossAcceleration(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 0 && value <= 1) return value;
  return fallback;
}

export interface LinePsarCrossChannels {
  sar: Array<number | null>;
  trends: ChartLinePsarCrossTrend[];
  af: Array<number | null>;
  ep: Array<number | null>;
}

export function computeLinePsarCross(
  series: readonly ChartLinePsarCrossPoint[] | null | undefined,
  options: {
    afInitial?: number;
    afStep?: number;
    afMax?: number;
  } = {},
): LinePsarCrossChannels {
  const cleaned = getLinePsarCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { sar: [], trends: [], af: [], ep: [] };
  }
  const afInitial = normalizeLinePsarCrossAcceleration(
    options.afInitial,
    DEFAULT_CHART_LINE_PSAR_CROSS_AF_INITIAL,
  );
  const afStep = normalizeLinePsarCrossAcceleration(
    options.afStep,
    DEFAULT_CHART_LINE_PSAR_CROSS_AF_STEP,
  );
  const afMax = normalizeLinePsarCrossAcceleration(
    options.afMax,
    DEFAULT_CHART_LINE_PSAR_CROSS_AF_MAX,
  );

  const n = cleaned.length;
  const sar: Array<number | null> = new Array(n).fill(null);
  const trends: ChartLinePsarCrossTrend[] = new Array(n).fill('none');
  const af: Array<number | null> = new Array(n).fill(null);
  const ep: Array<number | null> = new Array(n).fill(null);

  const first = cleaned[0];
  if (!first) {
    return { sar, trends, af, ep };
  }

  let trend: 'up' | 'down' = 'up';
  let curSar = first.low;
  let curEp = first.high;
  let curAf = afInitial;
  sar[0] = posZero(curSar);
  trends[0] = trend;
  af[0] = posZero(curAf);
  ep[0] = posZero(curEp);

  for (let i = 1; i < n; i += 1) {
    const cur = cleaned[i];
    if (!cur) continue;
    const prev1 = cleaned[i - 1];
    if (!prev1) continue;
    const prev2 = i >= 2 ? cleaned[i - 2] : prev1;

    let nextSar = curSar + curAf * (curEp - curSar);
    if (trend === 'up') {
      const cap = Math.min(prev1.low, prev2 ? prev2.low : prev1.low);
      if (nextSar > cap) nextSar = cap;
    } else {
      const cap = Math.max(prev1.high, prev2 ? prev2.high : prev1.high);
      if (nextSar < cap) nextSar = cap;
    }

    if (trend === 'up') {
      if (cur.low < nextSar) {
        trend = 'down';
        curSar = curEp;
        curEp = cur.low;
        curAf = afInitial;
      } else {
        curSar = nextSar;
        if (cur.high > curEp) {
          curEp = cur.high;
          curAf = Math.min(curAf + afStep, afMax);
        }
      }
    } else {
      if (cur.high > nextSar) {
        trend = 'up';
        curSar = curEp;
        curEp = cur.high;
        curAf = afInitial;
      } else {
        curSar = nextSar;
        if (cur.low < curEp) {
          curEp = cur.low;
          curAf = Math.min(curAf + afStep, afMax);
        }
      }
    }

    sar[i] = posZero(curSar);
    trends[i] = trend;
    af[i] = posZero(curAf);
    ep[i] = posZero(curEp);
  }

  return { sar, trends, af, ep };
}

export function classifyLinePsarCrossRelation(
  close: number | null,
  sar: number | null,
): ChartLinePsarCrossRelation {
  if (close == null || sar == null) return 'none';
  if (close > sar) return 'bullish';
  if (close < sar) return 'bearish';
  return 'equal';
}

export function detectLinePsarCrossFlips(
  trends: readonly ChartLinePsarCrossTrend[],
): ChartLinePsarCrossCross[] {
  const out: ChartLinePsarCrossCross[] = [];
  let prev: ChartLinePsarCrossTrend = 'none';
  for (let i = 0; i < trends.length; i += 1) {
    const cur = trends[i] ?? 'none';
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

export function runLinePsarCross(
  data: ChartLinePsarCrossPoint[],
  options: {
    afInitial?: number;
    afStep?: number;
    afMax?: number;
  } = {},
): ChartLinePsarCrossRun {
  const cleaned = getLinePsarCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const afInitial = normalizeLinePsarCrossAcceleration(
    options.afInitial,
    DEFAULT_CHART_LINE_PSAR_CROSS_AF_INITIAL,
  );
  const afStep = normalizeLinePsarCrossAcceleration(
    options.afStep,
    DEFAULT_CHART_LINE_PSAR_CROSS_AF_STEP,
  );
  const afMax = normalizeLinePsarCrossAcceleration(
    options.afMax,
    DEFAULT_CHART_LINE_PSAR_CROSS_AF_MAX,
  );

  const channels = computeLinePsarCross(series, {
    afInitial,
    afStep,
    afMax,
  });
  const flips = detectLinePsarCrossFlips(channels.trends);

  const samples: ChartLinePsarCrossSample[] = series.map((p, i) => {
    const sar = channels.sar[i] ?? null;
    const trend = channels.trends[i] ?? 'none';
    const relation = classifyLinePsarCrossRelation(p.close, sar);
    const crossed = flips[i] ?? null;
    const deviation = sar == null ? null : posZero(p.close - sar);
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      sar,
      deviation,
      trend,
      relation,
      crossed,
      af: channels.af[i] ?? null,
      ep: channels.ep[i] ?? null,
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

  const ok = series.length >= 2;

  return {
    series,
    afInitial,
    afStep,
    afMax,
    sarValues: channels.sar,
    trendValues: channels.trends,
    afValues: channels.af,
    epValues: channels.ep,
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

export interface ComputeLinePsarCrossLayoutOptions {
  data: ChartLinePsarCrossPoint[];
  afInitial?: number;
  afStep?: number;
  afMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLinePsarCrossLayout(
  opts: ComputeLinePsarCrossLayoutOptions,
): ChartLinePsarCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_PSAR_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_PSAR_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_PSAR_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_PSAR_CROSS_PANEL_GAP;

  const run = runLinePsarCross(opts.data, {
    afInitial: opts.afInitial ?? undefined,
    afStep: opts.afStep ?? undefined,
    afMax: opts.afMax ?? undefined,
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
      sarDots: [],
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
    if (s.sar != null) {
      if (s.sar < priceMin) priceMin = s.sar;
      if (s.sar > priceMax) priceMax = s.sar;
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
  const priceDots: ChartLinePsarCrossDot[] = [];
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

  const sarDots: ChartLinePsarCrossSarDot[] = [];
  for (const s of run.samples) {
    if (s.sar == null) continue;
    sarDots.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syPrice(s.sar),
      sar: s.sar,
      trend: s.trend,
    });
  }

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

  const markers: ChartLinePsarCrossMarker[] = [];
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
    sarDots,
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

export function describeLinePsarCrossChart(
  data: ChartLinePsarCrossPoint[],
  options: { afInitial?: number; afStep?: number; afMax?: number } = {},
): string {
  const cleaned = getLinePsarCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const afInitial = normalizeLinePsarCrossAcceleration(
    options.afInitial,
    DEFAULT_CHART_LINE_PSAR_CROSS_AF_INITIAL,
  );
  const afStep = normalizeLinePsarCrossAcceleration(
    options.afStep,
    DEFAULT_CHART_LINE_PSAR_CROSS_AF_STEP,
  );
  const afMax = normalizeLinePsarCrossAcceleration(
    options.afMax,
    DEFAULT_CHART_LINE_PSAR_CROSS_AF_MAX,
  );
  return (
    `PSAR Cross chart over ${cleaned.length} bars (afInitial ` +
    `${afInitial}, afStep ${afStep}, afMax ${afMax}). Top panel ` +
    `renders the close overlaid with Parabolic SAR dots; bottom ` +
    `panel renders close - SAR with markers at every stop-and-` +
    `reverse flip (flip-up -> uptrend entry, flip-down -> ` +
    `downtrend entry).`
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

export const ChartLinePsarCross = forwardRef<
  HTMLDivElement,
  ChartLinePsarCrossProps
>(function ChartLinePsarCross(props, ref): ReactNode {
  const {
    data,
    afInitial = DEFAULT_CHART_LINE_PSAR_CROSS_AF_INITIAL,
    afStep = DEFAULT_CHART_LINE_PSAR_CROSS_AF_STEP,
    afMax = DEFAULT_CHART_LINE_PSAR_CROSS_AF_MAX,
    width = DEFAULT_CHART_LINE_PSAR_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_PSAR_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_PSAR_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_PSAR_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_PSAR_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_PSAR_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_PSAR_CROSS_DOT_RADIUS,
    sarDotRadius = DEFAULT_CHART_LINE_PSAR_CROSS_SAR_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_PSAR_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_PSAR_CROSS_PRICE_COLOR,
    upSarColor = DEFAULT_CHART_LINE_PSAR_CROSS_UP_SAR_COLOR,
    downSarColor = DEFAULT_CHART_LINE_PSAR_CROSS_DOWN_SAR_COLOR,
    deviationColor = DEFAULT_CHART_LINE_PSAR_CROSS_DEVIATION_COLOR,
    flipUpColor = DEFAULT_CHART_LINE_PSAR_CROSS_FLIP_UP_COLOR,
    flipDownColor = DEFAULT_CHART_LINE_PSAR_CROSS_FLIP_DOWN_COLOR,
    zeroColor = DEFAULT_CHART_LINE_PSAR_CROSS_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_PSAR_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_PSAR_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSar = true,
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
    () => getLinePsarCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLinePsarCrossLayout({
        data: cleaned,
        afInitial,
        afStep,
        afMax,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, afInitial, afStep, afMax, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLinePsarCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLinePsarCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLinePsarCrossSeriesId,
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
        data-section="chart-line-psar-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLinePsarCrossChart(cleaned, { afInitial, afStep, afMax });

  const showPrice = !hidden.has('price');
  const showSarDots = !hidden.has('sar') && showSar;
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

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'PSAR Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-psar-cross"
      data-af-initial={afInitial}
      data-af-step={afStep}
      data-af-max={afMax}
      data-total-points={cleaned.length}
      data-flip-up-count={layout.run.flipUpCount}
      data-flip-down-count={layout.run.flipDownCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-psar-cross-title"
      >
        {ariaLabel ?? 'PSAR Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-psar-cross-aria-desc"
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
        data-section="chart-line-psar-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-psar-cross-grid">
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
                  data-section="chart-line-psar-cross-grid-line-price"
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
                  data-section="chart-line-psar-cross-grid-line-dev"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-psar-cross-axes">
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
                  data-section="chart-line-psar-cross-tick-price"
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
                  data-section="chart-line-psar-cross-tick-dev"
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
            data-section="chart-line-psar-cross-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-psar-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-psar-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-psar-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSarDots ? (
          <g data-section="chart-line-psar-cross-sar-dots">
            {layout.sarDots.map((d) => (
              <circle
                key={`sar-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={sarDotRadius}
                fill={d.trend === 'up' ? upSarColor : downSarColor}
                data-section="chart-line-psar-cross-sar-dot"
                data-trend={d.trend}
              />
            ))}
          </g>
        ) : null}

        {showDeviationLine ? (
          <path
            d={layout.deviationPath}
            stroke={deviationColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-psar-cross-deviation"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-psar-cross-markers">
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
                data-section="chart-line-psar-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-psar-cross-hover-targets">
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
                data-section="chart-line-psar-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-psar-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={200}
                  height={158}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-tooltip-sar"
                >
                  sar{' '}
                  {tooltipSample.sar == null
                    ? '--'
                    : formatPrice(tooltipSample.sar)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-tooltip-deviation"
                >
                  deviation{' '}
                  {tooltipSample.deviation == null
                    ? '--'
                    : formatDeviation(tooltipSample.deviation)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-tooltip-trend"
                >
                  trend {tooltipSample.trend}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-tooltip-af"
                >
                  af{' '}
                  {tooltipSample.af == null
                    ? '--'
                    : formatDeviation(tooltipSample.af)}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-tooltip-ep"
                >
                  ep{' '}
                  {tooltipSample.ep == null
                    ? '--'
                    : formatPrice(tooltipSample.ep)}
                </text>
                <text
                  x={12}
                  y={142}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-tooltip-counts"
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
          data-section="chart-line-psar-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          af0 {afInitial} | step {afStep} | max {afMax} | flip-up{' '}
          {layout.run.flipUpCount} | flip-down{' '}
          {layout.run.flipDownCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-psar-cross-legend"
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
              { id: 'sar' as const, color: upSarColor, label: 'sar' },
              {
                id: 'deviation' as const,
                color: deviationColor,
                label: 'deviation',
              },
            ] satisfies Array<{
              id: ChartLinePsarCrossSeriesId;
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

ChartLinePsarCross.displayName = 'ChartLinePsarCross';
