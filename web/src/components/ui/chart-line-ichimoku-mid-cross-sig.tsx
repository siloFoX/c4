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
 * ChartLineIchimokuMidCrossSig -- pure-SVG dual-panel chart
 * with the close in the top panel and the Ichimoku kumo
 * midline plus its smoothed SMA signal line in the bottom
 * panel, marking bullish (kumo midline crosses up through
 * signal -- cloud centerline trend trigger up) / bearish
 * (kumo midline crosses down through signal -- cloud
 * centerline trend trigger down) midline-over-signal
 * crossover trigger events with bias coloring derived from
 * the kumo midline slope at the trigger bar.
 *
 *   tenkan[i]    = (HH(high, tenkanPeriod) +
 *                   LL(low,  tenkanPeriod)) / 2
 *   kijun[i]     = (HH(high, kijunPeriod) +
 *                   LL(low,  kijunPeriod)) / 2
 *   senkouA[i]   = (tenkan[i] + kijun[i]) / 2
 *   senkouB[i]   = (HH(high, senkouBPeriod) +
 *                   LL(low,  senkouBPeriod)) / 2
 *   kumoMid[i]   = (senkouA[i] + senkouB[i]) / 2
 *   signal[i]    = SMA(kumoMid, signalLength)
 *
 *   bullish      : prev kumoMid <= prev signal &&
 *                  cur kumoMid > cur signal
 *   bearish      : prev kumoMid >= prev signal &&
 *                  cur kumoMid < cur signal
 *   regime       : 'bullish' when kumoMid >= signal
 *                  'bearish' when kumoMid <  signal
 *                  'none'    when either is null
 *   bias         : kumoMid[i] vs kumoMid[i-1] -> up /
 *                  down / flat / none
 *
 * Defaults: `tenkanPeriod = 9`, `kijunPeriod = 26`,
 * `senkouBPeriod = 52`, `signalLength = 3`. Goichi Hosoda's
 * 1969 Ichimoku Kinko Hyo ("one-glance equilibrium chart")
 * cloud is constructed from rolling Donchian midpoints over
 * three lookback windows (9 / 26 / 52). The kumo (cloud) is
 * bounded by senkouA and senkouB; its midline is the
 * geometric centre of the cloud and represents the
 * equilibrium price implied by the cloud's two spans. This
 * primitive watches the kumo midline against its own
 * SMA-smoothed signal line to detect cloud centerline
 * trend trigger events.
 *
 * Unlike the canonical Ichimoku visualisation, this
 * primitive uses **current-bar reads** (no 26-bar forward
 * displacement) so the current direction of the cloud
 * centerline can be compared with the current SMA signal
 * line without time-shifted alignment ambiguity.
 *
 * Warmup is `senkouBPeriod + signalLength - 2 = 53` for
 * the default tuning: senkouB seeds at i = senkouBPeriod
 * - 1 = 51, kumoMid is valid from i = 51, then the signal
 * SMA needs `signalLength - 1 = 2` more bars.
 *
 * Bit-exact anchors (HL input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`: HH =
 *   K + 1, LL = K - 1 over every window -> tenkan =
 *   kijun = senkouB = K, senkouA = K, kumoMid = K. signal
 *   = SMA(K, 3) = K. kumoMid === signal -> regime
 *   `bullish` (>=) for every valid bar. 0 crosses.
 *   Verified across K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`: HH(high,
 *   n) at i = i + 1 (latest), LL(low, n) at i = i - n
 *   (oldest). tenkan = (i + 1 + i - 9) / 2 = i - 4.
 *   kijun = (i + 1 + i - 26) / 2 = i - 12.5. senkouA =
 *   (tenkan + kijun) / 2 = i - 8.25. senkouB = (i + 1 +
 *   i - 52) / 2 = i - 25.5. kumoMid = (senkouA +
 *   senkouB) / 2 = i - 16.875. SMA(kumoMid, 3) at i =
 *   ((i - 2 - 16.875) + (i - 1 - 16.875) + (i - 16.875))
 *   / 3 = i - 17.875. kumoMid - signal = +1 (constant).
 *   regime `bullish` for every valid bar. 0 crosses
 *   (no transition into bearish).
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`:
 *   mirror -> kumoMid = -i + 16.875. signal = -i +
 *   17.875. kumoMid - signal = -1 (constant). regime
 *   `bearish` for every valid bar. 0 crosses (no
 *   transition into bullish).
 */

export interface ChartLineIchimokuMidCrossSigPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineIchimokuMidCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineIchimokuMidCrossSigBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineIchimokuMidCrossSigSeriesId =
  | 'price'
  | 'kumoMid'
  | 'signal';

export type ChartLineIchimokuMidCrossSigCrossKind =
  | 'bullish'
  | 'bearish';

export interface ChartLineIchimokuMidCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineIchimokuMidCrossSigCrossKind;
  bias: ChartLineIchimokuMidCrossSigBias;
}

export interface ChartLineIchimokuMidCrossSigSample {
  index: number;
  x: number;
  close: number;
  kumoMid: number | null;
  signal: number | null;
  regime: ChartLineIchimokuMidCrossSigRegime;
  bias: ChartLineIchimokuMidCrossSigBias;
}

export interface ChartLineIchimokuMidCrossSigRun {
  series: ChartLineIchimokuMidCrossSigPoint[];
  tenkanPeriod: number;
  kijunPeriod: number;
  senkouBPeriod: number;
  signalLength: number;
  tenkanValues: Array<number | null>;
  kijunValues: Array<number | null>;
  senkouAValues: Array<number | null>;
  senkouBValues: Array<number | null>;
  kumoMidValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineIchimokuMidCrossSigSample[];
  crosses: ChartLineIchimokuMidCrossSigCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  upBiasCount: number;
  downBiasCount: number;
  flatBiasCount: number;
  ok: boolean;
}

export interface ChartLineIchimokuMidCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineIchimokuMidCrossSigLayout {
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
  priceDots: ChartLineIchimokuMidCrossSigDot[];
  kumoMidPath: string;
  signalPath: string;
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
    kind: ChartLineIchimokuMidCrossSigCrossKind;
    bias: ChartLineIchimokuMidCrossSigBias;
  }>;
  run: ChartLineIchimokuMidCrossSigRun;
}

export interface ChartLineIchimokuMidCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineIchimokuMidCrossSigPoint[];
  tenkanPeriod?: number;
  kijunPeriod?: number;
  senkouBPeriod?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kumoMidColor?: string;
  signalColor?: string;
  upBiasColor?: string;
  downBiasColor?: string;
  flatBiasColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showKumoMid?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineIchimokuMidCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineIchimokuMidCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineIchimokuMidCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_TENKAN_PERIOD = 9;
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_KIJUN_PERIOD = 26;
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SENKOU_B_PERIOD = 52;
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SIGNAL_LENGTH = 3;
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_KUMO_MID_COLOR =
  '#7c3aed';
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SIGNAL_COLOR =
  '#f59e0b';
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_AXIS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_GRID_COLOR =
  '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineIchimokuMidCrossSigFinitePoints(
  data: readonly ChartLineIchimokuMidCrossSigPoint[] | null | undefined,
): ChartLineIchimokuMidCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineIchimokuMidCrossSigPoint[] = [];
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

export function normalizeLineIchimokuMidCrossSigLength(
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

/** Simple moving average with min===max short-circuit for CONST bit-exactness. */
export function applyLineIchimokuMidCrossSigSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (length === 1) {
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i];
      if (v != null) out[i] = posZero(v);
    }
    return out;
  }
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    let valid = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = values[j];
      if (v == null) {
        valid = false;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!valid) continue;
    out[i] = winMin === winMax ? winMin : posZero(sum / length);
  }
  return out;
}

export interface IchimokuMidCrossSigChannels {
  tenkan: Array<number | null>;
  kijun: Array<number | null>;
  senkouA: Array<number | null>;
  senkouB: Array<number | null>;
  kumoMid: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineIchimokuMidCrossSig(
  series: readonly ChartLineIchimokuMidCrossSigPoint[] | null | undefined,
  options: {
    tenkanPeriod?: number;
    kijunPeriod?: number;
    senkouBPeriod?: number;
    signalLength?: number;
  } = {},
): IchimokuMidCrossSigChannels {
  const cleaned = getLineIchimokuMidCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      tenkan: [],
      kijun: [],
      senkouA: [],
      senkouB: [],
      kumoMid: [],
      signal: [],
    };
  }
  const tenkanPeriod = normalizeLineIchimokuMidCrossSigLength(
    options.tenkanPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_TENKAN_PERIOD,
  );
  const kijunPeriod = normalizeLineIchimokuMidCrossSigLength(
    options.kijunPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_KIJUN_PERIOD,
  );
  const senkouBPeriod = normalizeLineIchimokuMidCrossSigLength(
    options.senkouBPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SENKOU_B_PERIOD,
  );
  const signalLength = normalizeLineIchimokuMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SIGNAL_LENGTH,
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
  const kumoMid: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const t = tenkan[i];
    const k = kijun[i];
    if (t == null || k == null) continue;
    senkouA[i] = posZero((t + k) / 2);
    const sB = senkouB[i];
    if (sB == null) continue;
    kumoMid[i] = posZero((senkouA[i]! + sB) / 2);
  }

  const signal = applyLineIchimokuMidCrossSigSma(kumoMid, signalLength);
  return { tenkan, kijun, senkouA, senkouB, kumoMid, signal };
}

export function classifyLineIchimokuMidCrossSigRegime(
  kumoMid: number | null,
  signal: number | null,
): ChartLineIchimokuMidCrossSigRegime {
  if (kumoMid == null || signal == null) return 'none';
  if (kumoMid >= signal) return 'bullish';
  return 'bearish';
}

export function classifyLineIchimokuMidCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineIchimokuMidCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineIchimokuMidCrossSigCrosses(
  series: readonly ChartLineIchimokuMidCrossSigPoint[],
  kumoMidValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineIchimokuMidCrossSigCross[] {
  const out: ChartLineIchimokuMidCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pk = kumoMidValues[i - 1];
    const ps = signalValues[i - 1];
    const ck = kumoMidValues[i];
    const cs = signalValues[i];
    if (pk == null || ps == null || ck == null || cs == null) continue;
    const bias = classifyLineIchimokuMidCrossSigBias(ck, pk);
    if (pk <= ps && ck > cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pk >= ps && ck < cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineIchimokuMidCrossSig(
  data: ChartLineIchimokuMidCrossSigPoint[],
  options: {
    tenkanPeriod?: number;
    kijunPeriod?: number;
    senkouBPeriod?: number;
    signalLength?: number;
  } = {},
): ChartLineIchimokuMidCrossSigRun {
  const cleaned = getLineIchimokuMidCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const tenkanPeriod = normalizeLineIchimokuMidCrossSigLength(
    options.tenkanPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_TENKAN_PERIOD,
  );
  const kijunPeriod = normalizeLineIchimokuMidCrossSigLength(
    options.kijunPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_KIJUN_PERIOD,
  );
  const senkouBPeriod = normalizeLineIchimokuMidCrossSigLength(
    options.senkouBPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SENKOU_B_PERIOD,
  );
  const signalLength = normalizeLineIchimokuMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SIGNAL_LENGTH,
  );

  const channels = computeLineIchimokuMidCrossSig(series, {
    tenkanPeriod,
    kijunPeriod,
    senkouBPeriod,
    signalLength,
  });

  const samples: ChartLineIchimokuMidCrossSigSample[] = series.map(
    (p, i) => {
      const kumoMid = channels.kumoMid[i] ?? null;
      const signal = channels.signal[i] ?? null;
      const prev = i > 0 ? (channels.kumoMid[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        kumoMid,
        signal,
        regime: classifyLineIchimokuMidCrossSigRegime(kumoMid, signal),
        bias: classifyLineIchimokuMidCrossSigBias(kumoMid, prev),
      };
    },
  );

  const crosses = detectLineIchimokuMidCrossSigCrosses(
    series,
    channels.kumoMid,
    channels.signal,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let noneCount = 0;
  let upBiasCount = 0;
  let downBiasCount = 0;
  let flatBiasCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else noneCount += 1;
    if (s.bias === 'up') upBiasCount += 1;
    else if (s.bias === 'down') downBiasCount += 1;
    else if (s.bias === 'flat') flatBiasCount += 1;
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const warmup = senkouBPeriod + signalLength - 2;
  const ok = series.length > warmup;

  return {
    series,
    tenkanPeriod,
    kijunPeriod,
    senkouBPeriod,
    signalLength,
    tenkanValues: channels.tenkan,
    kijunValues: channels.kijun,
    senkouAValues: channels.senkouA,
    senkouBValues: channels.senkouB,
    kumoMidValues: channels.kumoMid,
    signalValues: channels.signal,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    upBiasCount,
    downBiasCount,
    flatBiasCount,
    ok,
  };
}

export interface ComputeLineIchimokuMidCrossSigLayoutOptions {
  data: ChartLineIchimokuMidCrossSigPoint[];
  tenkanPeriod?: number;
  kijunPeriod?: number;
  senkouBPeriod?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineIchimokuMidCrossSigLayout(
  opts: ComputeLineIchimokuMidCrossSigLayoutOptions,
): ChartLineIchimokuMidCrossSigLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_PANEL_GAP;

  const run = runLineIchimokuMidCrossSig(opts.data, {
    tenkanPeriod: opts.tenkanPeriod ?? undefined,
    kijunPeriod: opts.kijunPeriod ?? undefined,
    senkouBPeriod: opts.senkouBPeriod ?? undefined,
    signalLength: opts.signalLength ?? undefined,
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
  for (let i = 0; i < run.kumoMidValues.length; i += 1) {
    const k = run.kumoMidValues[i];
    const s = run.signalValues[i];
    if (k != null) {
      if (k < oscRawMin) oscRawMin = k;
      if (k > oscRawMax) oscRawMax = k;
    }
    if (s != null) {
      if (s < oscRawMin) oscRawMin = s;
      if (s > oscRawMax) oscRawMax = s;
    }
  }
  if (!Number.isFinite(oscRawMin) || !Number.isFinite(oscRawMax)) {
    oscRawMin = -1;
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
      kumoMidPath: '',
      signalPath: '',
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
  const priceDots: ChartLineIchimokuMidCrossSigDot[] = [];
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

  let kumoMidPath = '';
  let firstKumoMid = true;
  for (const s of run.samples) {
    if (s.kumoMid == null) {
      firstKumoMid = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.kumoMid);
    kumoMidPath += `${firstKumoMid ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstKumoMid = false;
  }
  kumoMidPath = kumoMidPath.trim();

  let signalPath = '';
  let firstSignal = true;
  for (const s of run.samples) {
    if (s.signal == null) {
      firstSignal = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.signal);
    signalPath += `${firstSignal ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstSignal = false;
  }
  signalPath = signalPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const kumoAt = run.kumoMidValues[c.index];
    const cyOsc = kumoAt != null ? syOscBase(kumoAt) : oscBottom;
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
    kumoMidPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineIchimokuMidCrossSigChart(
  data: ChartLineIchimokuMidCrossSigPoint[],
  options: {
    tenkanPeriod?: number;
    kijunPeriod?: number;
    senkouBPeriod?: number;
    signalLength?: number;
  } = {},
): string {
  const cleaned = getLineIchimokuMidCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const tenkanPeriod = normalizeLineIchimokuMidCrossSigLength(
    options.tenkanPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_TENKAN_PERIOD,
  );
  const kijunPeriod = normalizeLineIchimokuMidCrossSigLength(
    options.kijunPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_KIJUN_PERIOD,
  );
  const senkouBPeriod = normalizeLineIchimokuMidCrossSigLength(
    options.senkouBPeriod,
    DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SENKOU_B_PERIOD,
  );
  const signalLength = normalizeLineIchimokuMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `Ichimoku kumo-midline-over-Signal chart over ${cleaned.length} ` +
    `bars (tenkan ${tenkanPeriod}, kijun ${kijunPeriod}, senkouB ` +
    `${senkouBPeriod}, signalLength ${signalLength}). Top panel ` +
    `renders the close with bullish (kumo midline crosses up ` +
    `through signal, cloud centerline trend trigger up) / bearish ` +
    `(kumo midline crosses down through signal, cloud centerline ` +
    `trend trigger down) chevron overlays at every midline-signal ` +
    `trigger event; bottom panel renders Goichi Hosoda's (1969) ` +
    `Ichimoku Kinko Hyo kumo midline (geometric centre of the ` +
    `cloud bounded by senkouA = avg(tenkan, kijun) and senkouB = ` +
    `avg(HH, LL) over the 52-bar window) with its SMA signal line, ` +
    `marker-coloured by kumo midline slope bias (rising / falling / ` +
    `flat) at the trigger bar, flagging cloud centerline trend ` +
    `trigger events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineIchimokuMidCrossSigCrossKind,
  bias: ChartLineIchimokuMidCrossSigBias,
  upColor: string,
  downColor: string,
  flatColor: string,
  bullishColor: string,
  bearishColor: string,
): string {
  if (bias === 'up') return upColor;
  if (bias === 'down') return downColor;
  if (bias === 'flat') return flatColor;
  return kind === 'bullish' ? bullishColor : bearishColor;
}

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 2);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineIchimokuMidCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineIchimokuMidCrossSigProps
>(function ChartLineIchimokuMidCrossSig(props, ref): ReactNode {
  const {
    data,
    tenkanPeriod = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_TENKAN_PERIOD,
    kijunPeriod = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_KIJUN_PERIOD,
    senkouBPeriod = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SENKOU_B_PERIOD,
    signalLength = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_PRICE_COLOR,
    kumoMidColor = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_KUMO_MID_COLOR,
    signalColor = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_SIGNAL_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ICHIMOKU_MID_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showKumoMid = true,
    showSignal = true,
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
    () => getLineIchimokuMidCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineIchimokuMidCrossSigLayout({
        data: cleaned,
        tenkanPeriod,
        kijunPeriod,
        senkouBPeriod,
        signalLength,
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
      signalLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineIchimokuMidCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineIchimokuMidCrossSigSeriesId,
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
    seriesId: ChartLineIchimokuMidCrossSigSeriesId,
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
        data-section="chart-line-ichimoku-mid-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineIchimokuMidCrossSigChart(cleaned, {
      tenkanPeriod,
      kijunPeriod,
      senkouBPeriod,
      signalLength,
    });

  const showPrice = !hidden.has('price');
  const showKumoMidLine = !hidden.has('kumoMid') && showKumoMid;
  const showSignalLine = !hidden.has('signal') && showSignal;

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
      aria-label={ariaLabel ?? 'Ichimoku kumo-midline-over-Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-ichimoku-mid-cross-sig"
      data-tenkan-period={tenkanPeriod}
      data-kijun-period={kijunPeriod}
      data-senkou-b-period={senkouBPeriod}
      data-signal-length={signalLength}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-up-bias-count={layout.run.upBiasCount}
      data-down-bias-count={layout.run.downBiasCount}
      data-flat-bias-count={layout.run.flatBiasCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-ichimoku-mid-cross-sig-title"
      >
        {ariaLabel ?? 'Ichimoku kumo-midline-over-Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-ichimoku-mid-cross-sig-aria-desc"
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
        data-section="chart-line-ichimoku-mid-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-ichimoku-mid-cross-sig-grid">
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
                  data-section="chart-line-ichimoku-mid-cross-sig-grid-line-price"
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
                  data-section="chart-line-ichimoku-mid-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-ichimoku-mid-cross-sig-axes">
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
                  data-section="chart-line-ichimoku-mid-cross-sig-tick-price"
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
                  data-section="chart-line-ichimoku-mid-cross-sig-tick-osc"
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
            data-section="chart-line-ichimoku-mid-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-ichimoku-mid-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-ichimoku-mid-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showKumoMidLine ? (
          <path
            d={layout.kumoMidPath}
            stroke={kumoMidColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ichimoku-mid-cross-sig-kumo-mid-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ichimoku-mid-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-ichimoku-mid-cross-sig-crosses"
            role="group"
            aria-label="Ichimoku midline-signal trigger markers"
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
                  upBiasColor,
                  downBiasColor,
                  flatBiasColor,
                  bullishColor,
                  bearishColor,
                )}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} kumo midline-signal trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-ichimoku-mid-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-ichimoku-mid-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay Ichimoku midline-signal trigger markers"
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
                  upBiasColor,
                  downBiasColor,
                  flatBiasColor,
                  bullishColor,
                  bearishColor,
                )}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-ichimoku-mid-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-ichimoku-mid-cross-sig-hover-targets">
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
                data-section="chart-line-ichimoku-mid-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-ichimoku-mid-cross-sig-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={280}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-mid-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-mid-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-mid-cross-sig-tooltip-kumo-mid"
                >
                  kumo mid{' '}
                  {tooltipSample.kumoMid == null
                    ? '--'
                    : formatOsc(tooltipSample.kumoMid)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-mid-cross-sig-tooltip-signal"
                >
                  signal{' '}
                  {tooltipSample.signal == null
                    ? '--'
                    : formatOsc(tooltipSample.signal)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-mid-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-mid-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-mid-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-mid-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-mid-cross-sig-tooltip-biases"
                >
                  up {layout.run.upBiasCount} | down {layout.run.downBiasCount}{' '}
                  | flat {layout.run.flatBiasCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-ichimoku-mid-cross-sig-badge"
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
          {senkouBPeriod} | signal {signalLength} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-ichimoku-mid-cross-sig-legend"
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
                id: 'kumoMid' as const,
                color: kumoMidColor,
                label: 'kumo mid',
              },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineIchimokuMidCrossSigSeriesId;
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

ChartLineIchimokuMidCrossSig.displayName = 'ChartLineIchimokuMidCrossSig';
