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
 * ChartLineObvMidCrossSig -- pure-SVG dual-panel chart
 * with the close in the top panel and the On Balance
 * Volume (OBV) centerline plus its smoothed SMA signal
 * line in the bottom panel, marking bullish (OBV crosses
 * up through signal -- accumulation trend trigger up) /
 * bearish (OBV crosses down through signal -- distribution
 * trend trigger down) OBV-over-signal crossover trigger
 * events with bias coloring derived from the OBV slope at
 * the trigger bar.
 *
 *   sign(d)     = +1 when d > 0
 *                 -1 when d < 0
 *                  0 when d == 0
 *   obv[0]      = 0
 *   obv[i]      = obv[i-1] + sign(close[i] - close[i-1])
 *                          * volume[i]
 *   signal[i]   = SMA(obv, signalLength)
 *
 *   bullish     : prev obv <= prev signal &&
 *                 cur obv > cur signal
 *                 (accumulation trend trigger up --
 *                  cumulative buying pressure breaking
 *                  above its baseline)
 *   bearish     : prev obv >= prev signal &&
 *                 cur obv < cur signal
 *                 (distribution trend trigger down --
 *                  cumulative selling pressure breaking
 *                  below its baseline)
 *   regime      : 'bullish' when obv >= signal
 *                 'bearish' when obv <  signal
 *                 'none'    when either is null
 *   bias        : obv[i] vs obv[i-1] -> up / down / flat /
 *                 none (matches the chart-line- convention)
 *
 * Defaults: `signalLength = 14`. OBV is the canonical
 * Joseph Granville cumulative-volume momentum indicator.
 * Unlike the close-only MA cross-sig primitives, OBV
 * incorporates volume directly into its centerline: every
 * bar's volume either adds to (close up), subtracts from
 * (close down), or leaves unchanged (close flat) the
 * cumulative running total. The SMA signal smooths the OBV
 * series so the cross-sig event isolates persistent
 * accumulation / distribution trend triggers from
 * single-bar volume spikes.
 *
 * Warmup is `signalLength - 1 = 13` for the default
 * tuning: OBV is valid from `i = 0` (seeded to 0), then
 * the signal SMA needs `signalLength` OBV values to fill
 * its window.
 *
 * Bit-exact anchors (close + volume input):
 *
 * - **CONST close = K, volume = 1**: every bar has flat
 *   close so `sign(close[i] - close[i-1]) = 0` -> OBV
 *   stays at 0 for every i. signal = SMA(0, 14) = 0.
 *   OBV === signal -> regime `bullish` (>=) for every
 *   valid bar. 0 crosses. Verified across K in {0, 1, 50,
 *   200, 1234}.
 * - **LINEAR UP close = i, volume = 1**: every bar has
 *   close[i] > close[i-1] so OBV[i] = OBV[i-1] + 1.
 *   OBV[0] = 0 -> OBV[i] = i. signal = SMA(OBV, 14) =
 *   `((i - 13) + ... + i) / 14 = (14i - 91) / 14 = i -
 *   6.5`. OBV - signal = `+6.5` -> regime `bullish`. 0
 *   crosses.
 * - **LINEAR DOWN close = -i, volume = 1**: every bar
 *   has close[i] < close[i-1] so OBV[i] = OBV[i-1] - 1.
 *   OBV[i] = -i. signal = -i + 6.5. OBV - signal =
 *   `-6.5` -> regime `bearish`. 0 crosses.
 */

export interface ChartLineObvMidCrossSigPoint {
  x: number;
  close: number;
  volume: number;
}

export type ChartLineObvMidCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineObvMidCrossSigBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineObvMidCrossSigSeriesId = 'price' | 'obv' | 'signal';

export type ChartLineObvMidCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineObvMidCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineObvMidCrossSigCrossKind;
  bias: ChartLineObvMidCrossSigBias;
}

export interface ChartLineObvMidCrossSigSample {
  index: number;
  x: number;
  close: number;
  obv: number | null;
  signal: number | null;
  regime: ChartLineObvMidCrossSigRegime;
  bias: ChartLineObvMidCrossSigBias;
}

export interface ChartLineObvMidCrossSigRun {
  series: ChartLineObvMidCrossSigPoint[];
  signalLength: number;
  obvValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineObvMidCrossSigSample[];
  crosses: ChartLineObvMidCrossSigCross[];
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

export interface ChartLineObvMidCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineObvMidCrossSigLayout {
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
  priceDots: ChartLineObvMidCrossSigDot[];
  obvPath: string;
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
    kind: ChartLineObvMidCrossSigCrossKind;
    bias: ChartLineObvMidCrossSigBias;
  }>;
  run: ChartLineObvMidCrossSigRun;
}

export interface ChartLineObvMidCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineObvMidCrossSigPoint[];
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  obvColor?: string;
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
  showObv?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineObvMidCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineObvMidCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineObvMidCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_SIGNAL_LENGTH = 14;
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_OBV_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineObvMidCrossSigFinitePoints(
  data: readonly ChartLineObvMidCrossSigPoint[] | null | undefined,
): ChartLineObvMidCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineObvMidCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume) &&
      point.volume >= 0
    ) {
      out.push({
        x: point.x,
        close: point.close,
        volume: point.volume,
      });
    }
  }
  return out;
}

export function normalizeLineObvMidCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Simple moving average with min===max short-circuit for CONST bit-exactness. */
export function applyLineObvMidCrossSigSma(
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

export interface ObvMidCrossSigChannels {
  obv: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineObvMidCrossSig(
  series: readonly ChartLineObvMidCrossSigPoint[] | null | undefined,
  options: { signalLength?: number } = {},
): ObvMidCrossSigChannels {
  const cleaned = getLineObvMidCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { obv: [], signal: [] };
  }
  const signalLength = normalizeLineObvMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_SIGNAL_LENGTH,
  );

  const n = cleaned.length;
  const obv: Array<number | null> = new Array(n).fill(null);
  obv[0] = 0;
  for (let i = 1; i < n; i += 1) {
    const cur = cleaned[i]!;
    const prev = cleaned[i - 1]!;
    const prevObv = obv[i - 1] ?? 0;
    if (cur.close > prev.close) obv[i] = posZero(prevObv + cur.volume);
    else if (cur.close < prev.close) obv[i] = posZero(prevObv - cur.volume);
    else obv[i] = posZero(prevObv);
  }

  const signal = applyLineObvMidCrossSigSma(obv, signalLength);
  return { obv, signal };
}

export function classifyLineObvMidCrossSigRegime(
  obv: number | null,
  signal: number | null,
): ChartLineObvMidCrossSigRegime {
  if (obv == null || signal == null) return 'none';
  if (obv >= signal) return 'bullish';
  return 'bearish';
}

export function classifyLineObvMidCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineObvMidCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineObvMidCrossSigCrosses(
  series: readonly ChartLineObvMidCrossSigPoint[],
  obvValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineObvMidCrossSigCross[] {
  const out: ChartLineObvMidCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const po = obvValues[i - 1];
    const ps = signalValues[i - 1];
    const co = obvValues[i];
    const cs = signalValues[i];
    if (po == null || ps == null || co == null || cs == null) continue;
    const bias = classifyLineObvMidCrossSigBias(co, po);
    if (po <= ps && co > cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (po >= ps && co < cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineObvMidCrossSig(
  data: ChartLineObvMidCrossSigPoint[],
  options: { signalLength?: number } = {},
): ChartLineObvMidCrossSigRun {
  const cleaned = getLineObvMidCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const signalLength = normalizeLineObvMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_SIGNAL_LENGTH,
  );

  const channels = computeLineObvMidCrossSig(series, { signalLength });

  const samples: ChartLineObvMidCrossSigSample[] = series.map((p, i) => {
    const obv = channels.obv[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const prevObv = i > 0 ? (channels.obv[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      obv,
      signal,
      regime: classifyLineObvMidCrossSigRegime(obv, signal),
      bias: classifyLineObvMidCrossSigBias(obv, prevObv),
    };
  });

  const crosses = detectLineObvMidCrossSigCrosses(
    series,
    channels.obv,
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

  const warmup = signalLength - 1;
  const ok = series.length > warmup;

  return {
    series,
    signalLength,
    obvValues: channels.obv,
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

export interface ComputeLineObvMidCrossSigLayoutOptions {
  data: ChartLineObvMidCrossSigPoint[];
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineObvMidCrossSigLayout(
  opts: ComputeLineObvMidCrossSigLayoutOptions,
): ChartLineObvMidCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_PANEL_GAP;

  const run = runLineObvMidCrossSig(opts.data, {
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
  for (let i = 0; i < run.obvValues.length; i += 1) {
    const o = run.obvValues[i];
    const s = run.signalValues[i];
    if (o != null) {
      if (o < oscRawMin) oscRawMin = o;
      if (o > oscRawMax) oscRawMax = o;
    }
    if (s != null) {
      if (s < oscRawMin) oscRawMin = s;
      if (s > oscRawMax) oscRawMax = s;
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
      obvPath: '',
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
  const priceDots: ChartLineObvMidCrossSigDot[] = [];
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

  let obvPath = '';
  let firstObv = true;
  for (const s of run.samples) {
    if (s.obv == null) {
      firstObv = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.obv);
    obvPath += `${firstObv ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstObv = false;
  }
  obvPath = obvPath.trim();

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
    const obvAtCross = run.obvValues[c.index];
    const cyOsc = obvAtCross != null ? syOscBase(obvAtCross) : oscBottom;
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
    obvPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineObvMidCrossSigChart(
  data: ChartLineObvMidCrossSigPoint[],
  options: { signalLength?: number } = {},
): string {
  const cleaned = getLineObvMidCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const signalLength = normalizeLineObvMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `OBV centerline-over-Signal chart over ${cleaned.length} ` +
    `bars (signalLength ${signalLength}). Top panel renders ` +
    `the close with bullish (OBV crosses up through signal, ` +
    `accumulation distribution trend trigger up) / bearish ` +
    `(OBV crosses down through signal, accumulation ` +
    `distribution trend trigger down) chevron overlays at ` +
    `every OBV-signal trigger event; bottom panel renders ` +
    `the cumulative On Balance Volume line and its SMA ` +
    `signal line with markers coloured by OBV slope bias ` +
    `(rising / falling / flat) at the trigger bar, flagging ` +
    `accumulation distribution trend trigger events with ` +
    `bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineObvMidCrossSigCrossKind,
  bias: ChartLineObvMidCrossSigBias,
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
const defaultOscFormatter = (value: number): string => formatNumber(value, 0);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineObvMidCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineObvMidCrossSigProps
>(function ChartLineObvMidCrossSig(props, ref): ReactNode {
  const {
    data,
    signalLength = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_PRICE_COLOR,
    obvColor = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_OBV_COLOR,
    signalColor = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_SIGNAL_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_OBV_MID_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showObv = true,
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
    () => getLineObvMidCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineObvMidCrossSigLayout({
        data: cleaned,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, signalLength, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineObvMidCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineObvMidCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineObvMidCrossSigSeriesId,
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
        data-section="chart-line-obv-mid-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineObvMidCrossSigChart(cleaned, { signalLength });

  const showPrice = !hidden.has('price');
  const showObvLine = !hidden.has('obv') && showObv;
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
      aria-label={ariaLabel ?? 'OBV centerline-over-Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-obv-mid-cross-sig"
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
        data-section="chart-line-obv-mid-cross-sig-title"
      >
        {ariaLabel ?? 'OBV centerline-over-Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-obv-mid-cross-sig-aria-desc"
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
        data-section="chart-line-obv-mid-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-obv-mid-cross-sig-grid">
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
                  data-section="chart-line-obv-mid-cross-sig-grid-line-price"
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
                  data-section="chart-line-obv-mid-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-obv-mid-cross-sig-axes">
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
                  data-section="chart-line-obv-mid-cross-sig-tick-price"
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
                  data-section="chart-line-obv-mid-cross-sig-tick-osc"
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
            data-section="chart-line-obv-mid-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-obv-mid-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-obv-mid-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showObvLine ? (
          <path
            d={layout.obvPath}
            stroke={obvColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-obv-mid-cross-sig-obv-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-obv-mid-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-obv-mid-cross-sig-crosses"
            role="group"
            aria-label="OBV-signal trigger markers"
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
                aria-label={`${m.kind} OBV-signal trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-obv-mid-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-obv-mid-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay OBV-signal trigger markers"
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
                data-section={`chart-line-obv-mid-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-obv-mid-cross-sig-hover-targets">
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
                data-section="chart-line-obv-mid-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-obv-mid-cross-sig-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={272}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-mid-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-mid-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-mid-cross-sig-tooltip-obv"
                >
                  OBV{' '}
                  {tooltipSample.obv == null
                    ? '--'
                    : formatOsc(tooltipSample.obv)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-mid-cross-sig-tooltip-signal"
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
                  data-section="chart-line-obv-mid-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-mid-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-mid-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-mid-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-mid-cross-sig-tooltip-biases"
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
          data-section="chart-line-obv-mid-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          signal {signalLength} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-obv-mid-cross-sig-legend"
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
              { id: 'obv' as const, color: obvColor, label: 'OBV' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineObvMidCrossSigSeriesId;
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

ChartLineObvMidCrossSig.displayName = 'ChartLineObvMidCrossSig';
