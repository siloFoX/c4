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
 * ChartLineIchimokuKijunCross -- pure-SVG dual-panel chart
 * with the close in the top panel and the Ichimoku
 * tenkan-sen, kijun-sen, and kumo (senkou A / senkou B
 * cloud) in the bottom panel, marking bullish (price
 * closes up through the kijun-sen baseline -- baseline
 * trigger up) / bearish (price closes down through the
 * kijun-sen baseline -- baseline trigger down) kijun-cross
 * events with **cloud-color bias** at the trigger bar.
 *
 * The kijun (baseline) cross is a classic Ichimoku trend
 * signal: the kijun-sen is the 26-period midpoint and acts
 * as a dynamic support/resistance level. When the close
 * crosses above the baseline, it signals a shift to
 * bullish equilibrium; below, bearish. The cloud color
 * (senkouA vs senkouB at the trigger bar) provides
 * directional confirmation -- a bullish kijun cross with
 * a bullish cloud is canonical "strong bull"; a bullish
 * cross with a bearish cloud is "weak bull" / counter-
 * trend. Distinct from the sibling tenkan-cross
 * (v1.11.1061) which detects the tenkan/kijun TK-cross;
 * this primitive detects the price/baseline cross.
 *
 *   tenkan[i]    = (HH(high, tenkanPeriod) +
 *                   LL(low,  tenkanPeriod)) / 2
 *   kijun[i]     = (HH(high, kijunPeriod) +
 *                   LL(low,  kijunPeriod)) / 2
 *   senkouA[i]   = (tenkan[i] + kijun[i]) / 2
 *   senkouB[i]   = (HH(high, senkouBPeriod) +
 *                   LL(low,  senkouBPeriod)) / 2
 *
 *   bullish (kijun cross up) :
 *     prev close <= prev kijun &&
 *     cur close > cur kijun
 *   bearish (kijun cross down) :
 *     prev close >= prev kijun &&
 *     cur close < cur kijun
 *
 *   regime       : 'bullish' when close >= kijun
 *                  'bearish' when close <  kijun
 *                  'none'    when either is null
 *
 *   bias (cloud color at trigger bar) :
 *     'bullish' when senkouA >  senkouB (green cloud)
 *     'bearish' when senkouA <  senkouB (red cloud)
 *     'flat'    when senkouA === senkouB (flat cloud)
 *     'none'    when either is null (cloud not yet valid)
 *
 * Defaults: `tenkanPeriod = 9`, `kijunPeriod = 26`,
 * `senkouBPeriod = 52` -- canonical Goichi Hosoda
 * (1969) Ichimoku Kinko Hyo tuning. The cloud-color bias
 * is the distinguishing feature: unlike the other cross-
 * sig family members which colour markers by indicator
 * slope, this primitive uses cloud-color confirmation,
 * which is more idiomatic for Ichimoku. The tenkan line
 * is still computed and rendered (it feeds senkouA) but
 * is not part of the trigger -- the trigger is close vs
 * kijun.
 *
 * Sibling family:
 *   - chart-line-ichimoku-tenkan-cross v1.11.1061 --
 *     tenkan/kijun TK-cross with cloud bias
 *   - chart-line-ichimoku-mid-cross-sig v1.11.1067 --
 *     kumo midline vs SMA signal cross
 *   - chart-line-ichimoku-divergence-cross -- kumo
 *     midline direction vs price direction
 *   - this primitive -- price/kijun baseline cross with
 *     cloud bias
 *
 * Uses current-bar reads (no 26-bar forward displacement)
 * matching the sibling convention -- the senkouA/senkouB
 * values at bar `i` are computed from the high/low data
 * up to bar `i`, with no time-shift.
 *
 * Warmup is `kijunPeriod = 26` for kijun cross detection
 * (kijun valid at i and i-1; close is always present).
 * Cloud-color bias additionally requires senkouB valid,
 * which seeds at i = senkouBPeriod - 1 = 51. Crosses that
 * fire before i = 51 carry `bias = 'none'`.
 *
 * Bit-exact anchors (HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`,
 *   `close = K`: HH = K + 1, LL = K - 1 for every
 *   window. kijun = K (constant). close = K. close ===
 *   kijun every bar -> no cross. senkouA = K, senkouB =
 *   K -> cloud flat. regime `bullish` (via >=). 0
 *   crosses. Verified across K in {0, 1, 50, 200,
 *   1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`,
 *   `close = i`: kijun = (i + 1 + i - 26) / 2 = i -
 *   12.5. close = i. close - kijun = +12.5 (constant
 *   spread, close always above kijun) -> no cross.
 *   senkouA = i - 8.25, senkouB = i - 25.5 -> senkouA
 *   - senkouB = +17.25 -> bullish cloud. regime
 *   `bullish`. 0 crosses.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: mirror -> kijun = -i + 12.5, close =
 *   -i. close - kijun = -12.5 (close always below
 *   kijun) -> no cross. senkouA = -i + 8.25, senkouB =
 *   -i + 25.5 -> senkouA - senkouB = -17.25 -> bearish
 *   cloud. regime `bearish`. 0 crosses.
 *
 * All three steady-state anchors produce 0 crosses
 * because the close stays on the same side of the kijun
 * throughout (a constant +/-12.5 spread). Real crosses
 * fire when price actually pierces the baseline -- a
 * trend reversal.
 */

export interface ChartLineIchimokuKijunCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineIchimokuKijunCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineIchimokuKijunCrossBias =
  | 'bullish'
  | 'bearish'
  | 'flat'
  | 'none';

export type ChartLineIchimokuKijunCrossSeriesId =
  | 'price'
  | 'tenkan'
  | 'kijun'
  | 'senkouA'
  | 'senkouB';

export type ChartLineIchimokuKijunCrossCrossKind =
  | 'bullish'
  | 'bearish';

export interface ChartLineIchimokuKijunCrossCross {
  index: number;
  x: number;
  kind: ChartLineIchimokuKijunCrossCrossKind;
  bias: ChartLineIchimokuKijunCrossBias;
}

export interface ChartLineIchimokuKijunCrossSample {
  index: number;
  x: number;
  close: number;
  tenkan: number | null;
  kijun: number | null;
  senkouA: number | null;
  senkouB: number | null;
  regime: ChartLineIchimokuKijunCrossRegime;
  bias: ChartLineIchimokuKijunCrossBias;
}

export interface ChartLineIchimokuKijunCrossRun {
  series: ChartLineIchimokuKijunCrossPoint[];
  tenkanPeriod: number;
  kijunPeriod: number;
  senkouBPeriod: number;
  tenkanValues: Array<number | null>;
  kijunValues: Array<number | null>;
  senkouAValues: Array<number | null>;
  senkouBValues: Array<number | null>;
  samples: ChartLineIchimokuKijunCrossSample[];
  crosses: ChartLineIchimokuKijunCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  bullishCloudCount: number;
  bearishCloudCount: number;
  flatCloudCount: number;
  ok: boolean;
}

export interface ChartLineIchimokuKijunCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineIchimokuKijunCrossLayout {
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
  priceDots: ChartLineIchimokuKijunCrossDot[];
  tenkanPath: string;
  kijunPath: string;
  senkouAPath: string;
  senkouBPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineIchimokuKijunCrossCrossKind;
    bias: ChartLineIchimokuKijunCrossBias;
  }>;
  run: ChartLineIchimokuKijunCrossRun;
}

export interface ChartLineIchimokuKijunCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineIchimokuKijunCrossPoint[];
  tenkanPeriod?: number;
  kijunPeriod?: number;
  senkouBPeriod?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  tenkanColor?: string;
  kijunColor?: string;
  senkouAColor?: string;
  senkouBColor?: string;
  bullishCloudColor?: string;
  bearishCloudColor?: string;
  flatCloudColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTenkan?: boolean;
  showKijun?: boolean;
  showSenkouA?: boolean;
  showSenkouB?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineIchimokuKijunCrossSeriesId[];
  defaultHiddenSeries?: ChartLineIchimokuKijunCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineIchimokuKijunCrossSeriesId;
    hidden: boolean;
  }) => void;
  formatPrice?: (value: number) => string;
  formatOsc?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_TENKAN_PERIOD = 9;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_KIJUN_PERIOD = 26;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_SENKOU_B_PERIOD = 52;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_TENKAN_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_KIJUN_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_SENKOU_A_COLOR =
  '#10b981';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_SENKOU_B_COLOR =
  '#f97316';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_BULLISH_CLOUD_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_BEARISH_CLOUD_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_FLAT_CLOUD_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_AXIS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_GRID_COLOR =
  '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineIchimokuKijunCrossFinitePoints(
  data: readonly ChartLineIchimokuKijunCrossPoint[] | null | undefined,
): ChartLineIchimokuKijunCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineIchimokuKijunCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      point.high >= point.low
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

export function normalizeLineIchimokuKijunCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

function donchianMid(
  high: readonly number[],
  low: readonly number[],
  i: number,
  period: number,
): number | null {
  if (i < period - 1) return null;
  let hh = -Infinity;
  let ll = Infinity;
  for (let j = i - period + 1; j <= i; j += 1) {
    const h = high[j];
    const l = low[j];
    if (h == null || l == null) return null;
    if (h > hh) hh = h;
    if (l < ll) ll = l;
  }
  return posZero((hh + ll) / 2);
}

export interface IchimokuKijunCrossChannels {
  tenkan: Array<number | null>;
  kijun: Array<number | null>;
  senkouA: Array<number | null>;
  senkouB: Array<number | null>;
}

export function computeLineIchimokuKijunCross(
  series: readonly ChartLineIchimokuKijunCrossPoint[] | null | undefined,
  options: {
    tenkanPeriod?: number;
    kijunPeriod?: number;
    senkouBPeriod?: number;
  } = {},
): IchimokuKijunCrossChannels {
  const cleaned = getLineIchimokuKijunCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { tenkan: [], kijun: [], senkouA: [], senkouB: [] };
  }
  const tenkanPeriod = normalizeLineIchimokuKijunCrossLength(
    options.tenkanPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_TENKAN_PERIOD,
  );
  const kijunPeriod = normalizeLineIchimokuKijunCrossLength(
    options.kijunPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_KIJUN_PERIOD,
  );
  const senkouBPeriod = normalizeLineIchimokuKijunCrossLength(
    options.senkouBPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_SENKOU_B_PERIOD,
  );

  const n = cleaned.length;
  const high = cleaned.map((p) => p.high);
  const low = cleaned.map((p) => p.low);

  const tenkan: Array<number | null> = new Array(n).fill(null);
  const kijun: Array<number | null> = new Array(n).fill(null);
  const senkouB: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    tenkan[i] = donchianMid(high, low, i, tenkanPeriod);
    kijun[i] = donchianMid(high, low, i, kijunPeriod);
    senkouB[i] = donchianMid(high, low, i, senkouBPeriod);
  }

  const senkouA: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const t = tenkan[i];
    const k = kijun[i];
    if (t == null || k == null) continue;
    senkouA[i] = posZero((t + k) / 2);
  }

  return { tenkan, kijun, senkouA, senkouB };
}

export function classifyLineIchimokuKijunCrossRegime(
  close: number | null,
  kijun: number | null,
): ChartLineIchimokuKijunCrossRegime {
  if (close == null || kijun == null) return 'none';
  if (close >= kijun) return 'bullish';
  return 'bearish';
}

export function classifyLineIchimokuKijunCrossCloudBias(
  senkouA: number | null,
  senkouB: number | null,
): ChartLineIchimokuKijunCrossBias {
  if (senkouA == null || senkouB == null) return 'none';
  if (senkouA > senkouB) return 'bullish';
  if (senkouA < senkouB) return 'bearish';
  return 'flat';
}

export function detectLineIchimokuKijunCrossCrosses(
  series: readonly ChartLineIchimokuKijunCrossPoint[],
  kijunValues: readonly (number | null)[],
  senkouAValues: readonly (number | null)[],
  senkouBValues: readonly (number | null)[],
): ChartLineIchimokuKijunCrossCross[] {
  const out: ChartLineIchimokuKijunCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pc = series[i - 1]?.close ?? null;
    const pk = kijunValues[i - 1];
    const cc = series[i]?.close ?? null;
    const ck = kijunValues[i];
    if (pc == null || pk == null || cc == null || ck == null) continue;
    const bias = classifyLineIchimokuKijunCrossCloudBias(
      senkouAValues[i] ?? null,
      senkouBValues[i] ?? null,
    );
    // Kijun baseline cross: the close (price) crosses the kijun-sen.
    if (pc <= pk && cc > ck) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pc >= pk && cc < ck) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineIchimokuKijunCross(
  data: ChartLineIchimokuKijunCrossPoint[],
  options: {
    tenkanPeriod?: number;
    kijunPeriod?: number;
    senkouBPeriod?: number;
  } = {},
): ChartLineIchimokuKijunCrossRun {
  const cleaned = getLineIchimokuKijunCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const tenkanPeriod = normalizeLineIchimokuKijunCrossLength(
    options.tenkanPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_TENKAN_PERIOD,
  );
  const kijunPeriod = normalizeLineIchimokuKijunCrossLength(
    options.kijunPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_KIJUN_PERIOD,
  );
  const senkouBPeriod = normalizeLineIchimokuKijunCrossLength(
    options.senkouBPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_SENKOU_B_PERIOD,
  );

  const channels = computeLineIchimokuKijunCross(series, {
    tenkanPeriod,
    kijunPeriod,
    senkouBPeriod,
  });

  const samples: ChartLineIchimokuKijunCrossSample[] = series.map(
    (p, i) => {
      const tenkan = channels.tenkan[i] ?? null;
      const kijun = channels.kijun[i] ?? null;
      const senkouA = channels.senkouA[i] ?? null;
      const senkouB = channels.senkouB[i] ?? null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        tenkan,
        kijun,
        senkouA,
        senkouB,
        regime: classifyLineIchimokuKijunCrossRegime(p.close, kijun),
        bias: classifyLineIchimokuKijunCrossCloudBias(senkouA, senkouB),
      };
    },
  );

  const crosses = detectLineIchimokuKijunCrossCrosses(
    series,
    channels.kijun,
    channels.senkouA,
    channels.senkouB,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let noneCount = 0;
  let bullishCloudCount = 0;
  let bearishCloudCount = 0;
  let flatCloudCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else noneCount += 1;
    if (s.bias === 'bullish') bullishCloudCount += 1;
    else if (s.bias === 'bearish') bearishCloudCount += 1;
    else if (s.bias === 'flat') flatCloudCount += 1;
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const warmup = kijunPeriod;
  const ok = series.length > warmup;

  return {
    series,
    tenkanPeriod,
    kijunPeriod,
    senkouBPeriod,
    tenkanValues: channels.tenkan,
    kijunValues: channels.kijun,
    senkouAValues: channels.senkouA,
    senkouBValues: channels.senkouB,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    bullishCloudCount,
    bearishCloudCount,
    flatCloudCount,
    ok,
  };
}

export interface ComputeLineIchimokuKijunCrossLayoutOptions {
  data: ChartLineIchimokuKijunCrossPoint[];
  tenkanPeriod?: number;
  kijunPeriod?: number;
  senkouBPeriod?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineIchimokuKijunCrossLayout(
  opts: ComputeLineIchimokuKijunCrossLayoutOptions,
): ChartLineIchimokuKijunCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_PANEL_GAP;

  const run = runLineIchimokuKijunCross(opts.data, {
    tenkanPeriod: opts.tenkanPeriod ?? undefined,
    kijunPeriod: opts.kijunPeriod ?? undefined,
    senkouBPeriod: opts.senkouBPeriod ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  let oscRawMin = Infinity;
  let oscRawMax = -Infinity;
  for (let i = 0; i < run.tenkanValues.length; i += 1) {
    const t = run.tenkanValues[i];
    const k = run.kijunValues[i];
    const a = run.senkouAValues[i];
    const b = run.senkouBValues[i];
    if (t != null) {
      if (t < oscRawMin) oscRawMin = t;
      if (t > oscRawMax) oscRawMax = t;
    }
    if (k != null) {
      if (k < oscRawMin) oscRawMin = k;
      if (k > oscRawMax) oscRawMax = k;
    }
    if (a != null) {
      if (a < oscRawMin) oscRawMin = a;
      if (a > oscRawMax) oscRawMax = a;
    }
    if (b != null) {
      if (b < oscRawMin) oscRawMin = b;
      if (b > oscRawMax) oscRawMax = b;
    }
  }
  if (!Number.isFinite(oscRawMin) || !Number.isFinite(oscRawMax)) {
    oscRawMin = 0;
    oscRawMax = 1;
  }
  if (oscRawMin === oscRawMax) {
    oscRawMin -= 1;
    oscRawMax += 1;
  }
  const oscMin = oscRawMin;
  const oscMax = oscRawMax;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

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
      tenkanPath: '',
      kijunPath: '',
      senkouAPath: '',
      senkouBPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      crossMarkers: [],
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

  let pricePath = '';
  const priceDots: ChartLineIchimokuKijunCrossDot[] = [];
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

  const buildPath = (
    accessor: (s: ChartLineIchimokuKijunCrossSample) => number | null,
  ): string => {
    let path = '';
    let first = true;
    for (const s of run.samples) {
      const v = accessor(s);
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = syOscBase(v);
      path += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return path.trim();
  };

  const tenkanPath = buildPath((s) => s.tenkan);
  const kijunPath = buildPath((s) => s.kijun);
  const senkouAPath = buildPath((s) => s.senkouA);
  const senkouBPath = buildPath((s) => s.senkouB);

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const tAt = run.tenkanValues[c.index];
    const cyOsc = tAt != null ? syOscBase(tAt) : oscBottom;
    return {
      index: c.index,
      x: c.x,
      cx,
      cyPrice,
      cyOsc,
      kind: c.kind,
      bias: c.bias,
    };
  });

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
    tenkanPath,
    kijunPath,
    senkouAPath,
    senkouBPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineIchimokuKijunCrossChart(
  data: ChartLineIchimokuKijunCrossPoint[],
  options: {
    tenkanPeriod?: number;
    kijunPeriod?: number;
    senkouBPeriod?: number;
  } = {},
): string {
  const cleaned = getLineIchimokuKijunCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const tenkanPeriod = normalizeLineIchimokuKijunCrossLength(
    options.tenkanPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_TENKAN_PERIOD,
  );
  const kijunPeriod = normalizeLineIchimokuKijunCrossLength(
    options.kijunPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_KIJUN_PERIOD,
  );
  const senkouBPeriod = normalizeLineIchimokuKijunCrossLength(
    options.senkouBPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_SENKOU_B_PERIOD,
  );
  return (
    `Ichimoku kijun-sen baseline cross chart over ` +
    `${cleaned.length} bars (tenkan ${tenkanPeriod}, kijun ` +
    `${kijunPeriod}, senkouB ${senkouBPeriod}). Top panel renders ` +
    `the close with bullish (price closes up through the kijun-sen ` +
    `baseline, baseline trigger up) / bearish (price closes down ` +
    `through the kijun-sen baseline, baseline trigger down) chevron ` +
    `overlays at every kijun-cross event; bottom panel renders ` +
    `Goichi Hosoda's (1969) Ichimoku tenkan-sen (9-bar Donchian ` +
    `midpoint), kijun-sen (26-bar Donchian midpoint), and the kumo ` +
    `cloud bounded by senkouA = (tenkan + kijun) / 2 and senkouB = ` +
    `52-bar Donchian midpoint, with markers coloured by cloud bias ` +
    `(bullish cloud / bearish cloud / flat cloud) at the trigger ` +
    `bar, flagging Ichimoku baseline trigger events with cloud-` +
    `color confirmation.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineIchimokuKijunCrossCrossKind,
  bias: ChartLineIchimokuKijunCrossBias,
  bullishCloudColor: string,
  bearishCloudColor: string,
  flatCloudColor: string,
  bullishColor: string,
  bearishColor: string,
): string {
  if (bias === 'bullish') return bullishCloudColor;
  if (bias === 'bearish') return bearishCloudColor;
  if (bias === 'flat') return flatCloudColor;
  return kind === 'bullish' ? bullishColor : bearishColor;
}

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 2);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineIchimokuKijunCross = forwardRef<
  HTMLDivElement,
  ChartLineIchimokuKijunCrossProps
>(function ChartLineIchimokuKijunCross(props, ref): ReactNode {
  const {
    data,
    tenkanPeriod = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_TENKAN_PERIOD,
    kijunPeriod = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_KIJUN_PERIOD,
    senkouBPeriod = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_SENKOU_B_PERIOD,
    width = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_PRICE_COLOR,
    tenkanColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_TENKAN_COLOR,
    kijunColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_KIJUN_COLOR,
    senkouAColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_SENKOU_A_COLOR,
    senkouBColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_SENKOU_B_COLOR,
    bullishCloudColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_BULLISH_CLOUD_COLOR,
    bearishCloudColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_BEARISH_CLOUD_COLOR,
    flatCloudColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_FLAT_CLOUD_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTenkan = true,
    showKijun = true,
    showSenkouA = true,
    showSenkouB = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    formatPrice = defaultPriceFormatter,
    formatOsc = defaultOscFormatter,
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
    () => getLineIchimokuKijunCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineIchimokuKijunCrossLayout({
        data: cleaned,
        tenkanPeriod,
        kijunPeriod,
        senkouBPeriod,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      tenkanPeriod,
      kijunPeriod,
      senkouBPeriod,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineIchimokuKijunCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineIchimokuKijunCrossSeriesId,
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
    seriesId: ChartLineIchimokuKijunCrossSeriesId,
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
        data-section="chart-line-ichimoku-kijun-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineIchimokuKijunCrossChart(cleaned, {
      tenkanPeriod,
      kijunPeriod,
      senkouBPeriod,
    });

  const showPrice = !hidden.has('price');
  const showTenkanLine = !hidden.has('tenkan') && showTenkan;
  const showKijunLine = !hidden.has('kijun') && showKijun;
  const showSenkouALine = !hidden.has('senkouA') && showSenkouA;
  const showSenkouBLine = !hidden.has('senkouB') && showSenkouB;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [layout.oscMin, layout.oscMax];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Ichimoku kijun baseline cross chart'}
      aria-describedby={descId}
      data-section="chart-line-ichimoku-kijun-cross"
      data-tenkan-period={tenkanPeriod}
      data-kijun-period={kijunPeriod}
      data-senkou-b-period={senkouBPeriod}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-bullish-cloud-count={layout.run.bullishCloudCount}
      data-bearish-cloud-count={layout.run.bearishCloudCount}
      data-flat-cloud-count={layout.run.flatCloudCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-ichimoku-kijun-cross-title"
      >
        {ariaLabel ?? 'Ichimoku kijun baseline cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-ichimoku-kijun-cross-aria-desc"
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
        data-section="chart-line-ichimoku-kijun-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-ichimoku-kijun-cross-grid">
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
                  data-section="chart-line-ichimoku-kijun-cross-grid-line-price"
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
                  data-section="chart-line-ichimoku-kijun-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-ichimoku-kijun-cross-axes">
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
                  data-section="chart-line-ichimoku-kijun-cross-tick-price"
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
                  data-section="chart-line-ichimoku-kijun-cross-tick-osc"
                >
                  {formatOsc(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ichimoku-kijun-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-ichimoku-kijun-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-ichimoku-kijun-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSenkouALine ? (
          <path
            d={layout.senkouAPath}
            stroke={senkouAColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray="4 3"
            data-section="chart-line-ichimoku-kijun-cross-senkou-a-path"
          />
        ) : null}

        {showSenkouBLine ? (
          <path
            d={layout.senkouBPath}
            stroke={senkouBColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray="4 3"
            data-section="chart-line-ichimoku-kijun-cross-senkou-b-path"
          />
        ) : null}

        {showTenkanLine ? (
          <path
            d={layout.tenkanPath}
            stroke={tenkanColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ichimoku-kijun-cross-tenkan-path"
          />
        ) : null}

        {showKijunLine ? (
          <path
            d={layout.kijunPath}
            stroke={kijunColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ichimoku-kijun-cross-kijun-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-ichimoku-kijun-cross-crosses"
            role="group"
            aria-label="Ichimoku kijun baseline cross trigger markers"
          >
            {layout.crossMarkers.map((m) => (
              <circle
                key={`cross-osc-${m.index}`}
                cx={m.cx}
                cy={m.cyOsc}
                r={4}
                fill={biasFillColor(
                  m.kind,
                  m.bias,
                  bullishCloudColor,
                  bearishCloudColor,
                  flatCloudColor,
                  bullishColor,
                  bearishColor,
                )}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} Ichimoku kijun cross at ${formatX(m.x)} cloud ${m.bias}`}
                data-cloud-bias={m.bias}
                data-section={`chart-line-ichimoku-kijun-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-ichimoku-kijun-cross-overlay-crosses"
            role="group"
            aria-label="overlay Ichimoku kijun baseline cross trigger markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                    : `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                }
                fill={biasFillColor(
                  m.kind,
                  m.bias,
                  bullishCloudColor,
                  bearishCloudColor,
                  flatCloudColor,
                  bullishColor,
                  bearishColor,
                )}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)} cloud ${m.bias}`}
                data-cloud-bias={m.bias}
                data-section={`chart-line-ichimoku-kijun-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-ichimoku-kijun-cross-hover-targets">
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
                data-section="chart-line-ichimoku-kijun-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-ichimoku-kijun-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={296}
                  height={172}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-kijun-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-kijun-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-kijun-cross-tooltip-tenkan"
                >
                  tenkan{' '}
                  {tooltipSample.tenkan == null
                    ? '--'
                    : formatOsc(tooltipSample.tenkan)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-kijun-cross-tooltip-kijun"
                >
                  kijun{' '}
                  {tooltipSample.kijun == null
                    ? '--'
                    : formatOsc(tooltipSample.kijun)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-kijun-cross-tooltip-senkou-a"
                >
                  senkouA{' '}
                  {tooltipSample.senkouA == null
                    ? '--'
                    : formatOsc(tooltipSample.senkouA)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-kijun-cross-tooltip-senkou-b"
                >
                  senkouB{' '}
                  {tooltipSample.senkouB == null
                    ? '--'
                    : formatOsc(tooltipSample.senkouB)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-kijun-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-kijun-cross-tooltip-cloud"
                >
                  cloud {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-kijun-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={142}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-kijun-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={156}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-kijun-cross-tooltip-clouds"
                >
                  cloud bull {layout.run.bullishCloudCount} | bear{' '}
                  {layout.run.bearishCloudCount} | flat{' '}
                  {layout.run.flatCloudCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-ichimoku-kijun-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          tenkan {tenkanPeriod} | kijun {kijunPeriod} | senkouB{' '}
          {senkouBPeriod} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-ichimoku-kijun-cross-legend"
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
                id: 'tenkan' as const,
                color: tenkanColor,
                label: 'tenkan',
              },
              { id: 'kijun' as const, color: kijunColor, label: 'kijun' },
              {
                id: 'senkouA' as const,
                color: senkouAColor,
                label: 'senkouA',
              },
              {
                id: 'senkouB' as const,
                color: senkouBColor,
                label: 'senkouB',
              },
            ] satisfies Array<{
              id: ChartLineIchimokuKijunCrossSeriesId;
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

ChartLineIchimokuKijunCross.displayName = 'ChartLineIchimokuKijunCross';
