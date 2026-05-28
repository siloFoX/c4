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
 * ChartLineVolumeTrendCross -- pure-SVG dual-panel chart
 * with the close in the top panel and a volume-weighted
 * moving average (VWMA) overlaid against a simple moving
 * average (SMA) of the same period in the bottom panel,
 * marking bullish (VWMA crosses up through SMA -- volume
 * confirms uptrend; buying volume concentrated at higher
 * prices) / bearish (VWMA crosses down through SMA --
 * volume confirms downtrend; selling volume concentrated
 * at lower prices) volume-weighted trend crossover trigger
 * events with bias coloring derived from the (VWMA - SMA)
 * slope at the trigger bar.
 *
 *   VWMA[i] = sum(close[j] * volume[j]) / sum(volume[j])
 *             over j in [i-period+1 .. i]
 *             (null when the window volume sum is 0)
 *   SMA[i]  = sum(close[j]) / period
 *
 *   The VWMA-vs-SMA gap reveals whether volume is
 *   concentrated at higher prices (VWMA > SMA, demand
 *   confirming the advance) or lower prices (VWMA < SMA,
 *   supply confirming the decline) within the window. A
 *   cross is a "trend confirmation by volume regime
 *   change" -- the volume-weighted price has overtaken
 *   (or fallen behind) the unweighted average.
 *
 *   bullish (VWMA-cross up) :
 *     prev VWMA <= prev SMA && cur VWMA > cur SMA
 *   bearish (VWMA-cross down) :
 *     prev VWMA >= prev SMA && cur VWMA < cur SMA
 *
 *   regime : 'bullish' when VWMA >= SMA
 *            'bearish' when VWMA <  SMA
 *            'none'    when either is null
 *   bias   : (VWMA - SMA)[i] vs prev -> up/down/flat/none
 *
 * Defaults: `period = 20`. When volume is CONSTANT across
 * the window, VWMA reduces exactly to SMA (the volume
 * weights cancel), so the two lines coincide and no
 * cross fires -- the signal only activates when volume
 * VARIES and correlates with price. This is the
 * defining property of the volume-weighted trend cross:
 * it is silent in flat-volume regimes and fires only
 * when a volume regime change shifts the weighted price
 * across the simple average.
 *
 * Sibling family (volume-input family):
 *   - chart-line-volume-spike-cross v1.11.1064 -- volume
 *     vs its moving-average spike threshold
 *   - chart-line-vwap-cross / vwap-cross-sig -- price vs
 *     cumulative VWAP
 *   - chart-line-vwma (raw VWMA overlay)
 *   - this primitive: VWMA vs SMA cross (volume-weighted
 *     trend confirmation)
 *
 * Distinct from the VWAP-cross family: VWAP is a
 * cumulative (session-anchored) volume-weighted average,
 * whereas VWMA here is a rolling `period`-window
 * volume-weighted average compared against the matching
 * rolling SMA. The VWMA-vs-SMA cross isolates the
 * volume-weighting effect (both use the same window) so
 * the cross is purely a function of how volume is
 * distributed across prices within that window.
 *
 * Warmup is `period` for the first detectable cross: VWMA
 * and SMA both seed at i = period - 1, and cross
 * detection needs the previous bar, so the first
 * potential cross lands at i = period.
 *
 * Bit-exact anchors (close + volume input):
 *
 * - **CONST** `close = K`, `volume = V` (V > 0): VWMA =
 *   sum(K*V) / sum(V) = K. SMA = K. VWMA === SMA every
 *   bar -> no cross. regime `bullish` (via >=). 0
 *   crosses. Verified across K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP, CONST volume** `close = i`, `volume =
 *   V`: with constant volume the weights cancel, so
 *   VWMA = SMA = mean(i-period+1 .. i) exactly. VWMA ===
 *   SMA every bar -> no cross. regime `bullish` (via
 *   >=). 0 crosses. This anchors the constant-volume
 *   identity VWMA === SMA.
 * - **LINEAR UP, RISING volume** `close = i`, `volume =
 *   i + 1`: higher prices carry proportionally more
 *   volume, so VWMA > SMA (weighted toward the higher
 *   recent prices). The gap is positive and stable ->
 *   no cross. regime `bullish`. 0 crosses.
 * - **VOLUME REGIME SHIFT**: a series where the
 *   price-volume correlation flips (volume moves from
 *   concentrated-at-lows to concentrated-at-highs)
 *   drives VWMA across SMA, producing a cross. This is
 *   the signal's intended trigger.
 */

export interface ChartLineVolumeTrendCrossPoint {
  x: number;
  close: number;
  volume: number;
}

export type ChartLineVolumeTrendCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineVolumeTrendCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineVolumeTrendCrossSeriesId = 'price' | 'vwma' | 'sma';

export type ChartLineVolumeTrendCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineVolumeTrendCrossCross {
  index: number;
  x: number;
  kind: ChartLineVolumeTrendCrossCrossKind;
  bias: ChartLineVolumeTrendCrossBias;
}

export interface ChartLineVolumeTrendCrossSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  vwma: number | null;
  sma: number | null;
  diff: number | null;
  regime: ChartLineVolumeTrendCrossRegime;
  bias: ChartLineVolumeTrendCrossBias;
}

export interface ChartLineVolumeTrendCrossRun {
  series: ChartLineVolumeTrendCrossPoint[];
  period: number;
  vwmaValues: Array<number | null>;
  smaValues: Array<number | null>;
  diffValues: Array<number | null>;
  samples: ChartLineVolumeTrendCrossSample[];
  crosses: ChartLineVolumeTrendCrossCross[];
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

export interface ChartLineVolumeTrendCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVolumeTrendCrossLayout {
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
  priceDots: ChartLineVolumeTrendCrossDot[];
  vwmaPath: string;
  smaPath: string;
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
    kind: ChartLineVolumeTrendCrossCrossKind;
    bias: ChartLineVolumeTrendCrossBias;
  }>;
  run: ChartLineVolumeTrendCrossRun;
}

export interface ChartLineVolumeTrendCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVolumeTrendCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  vwmaColor?: string;
  smaColor?: string;
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
  showVwma?: boolean;
  showSma?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVolumeTrendCrossSeriesId[];
  defaultHiddenSeries?: ChartLineVolumeTrendCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVolumeTrendCrossSeriesId;
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

export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PERIOD = 20;
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_VWMA_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_SMA_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineVolumeTrendCrossFinitePoints(
  data: readonly ChartLineVolumeTrendCrossPoint[] | null | undefined,
): ChartLineVolumeTrendCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVolumeTrendCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume) &&
      point.volume >= 0
    ) {
      out.push({ x: point.x, close: point.close, volume: point.volume });
    }
  }
  return out;
}

export function normalizeLineVolumeTrendCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export interface ComputeLineVolumeTrendCrossResult {
  vwma: Array<number | null>;
  sma: Array<number | null>;
}

export function computeLineVolumeTrendCross(
  series: readonly ChartLineVolumeTrendCrossPoint[] | null | undefined,
  options: { period?: number } = {},
): ComputeLineVolumeTrendCrossResult {
  const cleaned = getLineVolumeTrendCrossFinitePoints(series);
  if (cleaned.length === 0) return { vwma: [], sma: [] };
  const period = normalizeLineVolumeTrendCrossLength(
    options.period,
    DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PERIOD,
  );

  const n = cleaned.length;
  const vwma: Array<number | null> = new Array(n).fill(null);
  const sma: Array<number | null> = new Array(n).fill(null);
  for (let i = period - 1; i < n; i += 1) {
    let sumClose = 0;
    let sumPV = 0;
    let sumV = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      const c = cleaned[j]!.close;
      const v = cleaned[j]!.volume;
      sumClose += c;
      sumPV += c * v;
      sumV += v;
    }
    sma[i] = posZero(sumClose / period);
    vwma[i] = sumV === 0 ? null : posZero(sumPV / sumV);
  }
  return { vwma, sma };
}

export function classifyLineVolumeTrendCrossRegime(
  vwma: number | null,
  sma: number | null,
): ChartLineVolumeTrendCrossRegime {
  if (vwma == null || sma == null) return 'none';
  if (vwma >= sma) return 'bullish';
  return 'bearish';
}

export function classifyLineVolumeTrendCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineVolumeTrendCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineVolumeTrendCrossCrosses(
  series: readonly ChartLineVolumeTrendCrossPoint[],
  vwmaValues: readonly (number | null)[],
  smaValues: readonly (number | null)[],
): ChartLineVolumeTrendCrossCross[] {
  const out: ChartLineVolumeTrendCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pV = vwmaValues[i - 1];
    const pS = smaValues[i - 1];
    const cV = vwmaValues[i];
    const cS = smaValues[i];
    if (pV == null || pS == null || cV == null || cS == null) continue;
    const prevDiff = pV - pS;
    const curDiff = cV - cS;
    const bias = classifyLineVolumeTrendCrossBias(curDiff, prevDiff);
    if (pV <= pS && cV > cS) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pV >= pS && cV < cS) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineVolumeTrendCross(
  data: ChartLineVolumeTrendCrossPoint[],
  options: { period?: number } = {},
): ChartLineVolumeTrendCrossRun {
  const cleaned = getLineVolumeTrendCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineVolumeTrendCrossLength(
    options.period,
    DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PERIOD,
  );

  const { vwma: vwmaValues, sma: smaValues } = computeLineVolumeTrendCross(
    series,
    { period },
  );

  const diffValues: Array<number | null> = series.map((_, i) => {
    const v = vwmaValues[i] ?? null;
    const s = smaValues[i] ?? null;
    if (v == null || s == null) return null;
    return posZero(v - s);
  });

  const samples: ChartLineVolumeTrendCrossSample[] = series.map((p, i) => {
    const vwma = vwmaValues[i] ?? null;
    const sma = smaValues[i] ?? null;
    const diff = diffValues[i] ?? null;
    const prevDiff = i > 0 ? (diffValues[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      volume: p.volume,
      vwma,
      sma,
      diff,
      regime: classifyLineVolumeTrendCrossRegime(vwma, sma),
      bias: classifyLineVolumeTrendCrossBias(diff, prevDiff),
    };
  });

  const crosses = detectLineVolumeTrendCrossCrosses(
    series,
    vwmaValues,
    smaValues,
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

  const warmup = period;
  const ok = series.length > warmup;

  return {
    series,
    period,
    vwmaValues,
    smaValues,
    diffValues,
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

export interface ComputeLineVolumeTrendCrossLayoutOptions {
  data: ChartLineVolumeTrendCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineVolumeTrendCrossLayout(
  opts: ComputeLineVolumeTrendCrossLayoutOptions,
): ChartLineVolumeTrendCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PANEL_GAP;

  const run = runLineVolumeTrendCross(opts.data, {
    period: opts.period ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

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
      vwmaPath: '',
      smaPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin: 0,
      oscMax: 0,
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

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const s of run.samples) {
    if (s.vwma != null) {
      if (s.vwma < oscMin) oscMin = s.vwma;
      if (s.vwma > oscMax) oscMax = s.vwma;
    }
    if (s.sma != null) {
      if (s.sma < oscMin) oscMin = s.sma;
      if (s.sma > oscMax) oscMax = s.sma;
    }
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = priceMin;
    oscMax = priceMax;
  }
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syOsc = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

  let pricePath = '';
  const priceDots: ChartLineVolumeTrendCrossDot[] = [];
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

  let vwmaPath = '';
  let firstV = true;
  for (const s of run.samples) {
    if (s.vwma == null) {
      firstV = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.vwma);
    vwmaPath += `${firstV ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstV = false;
  }
  vwmaPath = vwmaPath.trim();

  let smaPath = '';
  let firstS = true;
  for (const s of run.samples) {
    if (s.sma == null) {
      firstS = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.sma);
    smaPath += `${firstS ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstS = false;
  }
  smaPath = smaPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const vAt = run.vwmaValues[c.index];
    const cyOsc = vAt != null ? syOsc(vAt) : oscBottom;
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
    vwmaPath,
    smaPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineVolumeTrendCrossChart(
  data: ChartLineVolumeTrendCrossPoint[],
  options: { period?: number } = {},
): string {
  const cleaned = getLineVolumeTrendCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineVolumeTrendCrossLength(
    options.period,
    DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PERIOD,
  );
  return (
    `Volume-weighted trend cross chart over ${cleaned.length} ` +
    `bars (period ${period}). Top panel renders the close ` +
    `with bullish (VWMA crosses up through SMA, volume ` +
    `confirms uptrend) / bearish (VWMA crosses down through ` +
    `SMA, volume confirms downtrend) chevron overlays at ` +
    `every volume regime change trigger event; bottom panel ` +
    `renders the volume-weighted moving average (sum of ` +
    `close times volume divided by sum of volume) against ` +
    `the simple moving average of the same period, markers ` +
    `coloured by (VWMA - SMA) slope bias (rising / falling ` +
    `/ flat) at the trigger bar, flagging trend confirmation ` +
    `by volume regime change events.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineVolumeTrendCrossCrossKind,
  bias: ChartLineVolumeTrendCrossBias,
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

export const ChartLineVolumeTrendCross = forwardRef<
  HTMLDivElement,
  ChartLineVolumeTrendCrossProps
>(function ChartLineVolumeTrendCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PERIOD,
    width = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_PRICE_COLOR,
    vwmaColor = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_VWMA_COLOR,
    smaColor = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_SMA_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_VOLUME_TREND_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showVwma = true,
    showSma = true,
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
    () => getLineVolumeTrendCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineVolumeTrendCrossLayout({
        data: cleaned,
        period,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, period, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineVolumeTrendCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineVolumeTrendCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineVolumeTrendCrossSeriesId,
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
        data-section="chart-line-volume-trend-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineVolumeTrendCrossChart(cleaned, { period });

  const showPrice = !hidden.has('price');
  const showVwmaLine = !hidden.has('vwma') && showVwma;
  const showSmaLine = !hidden.has('sma') && showSma;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickOscValues.push(
      layout.oscMin + ((layout.oscMax - layout.oscMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'Volume-weighted trend cross chart'}
      aria-describedby={descId}
      data-section="chart-line-volume-trend-cross"
      data-period={period}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-none-count={layout.run.noneCount}
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
        data-section="chart-line-volume-trend-cross-title"
      >
        {ariaLabel ?? 'Volume-weighted trend cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-volume-trend-cross-aria-desc"
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
        data-section="chart-line-volume-trend-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-volume-trend-cross-grid">
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
                  data-section="chart-line-volume-trend-cross-grid-line-price"
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
                  data-section="chart-line-volume-trend-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-volume-trend-cross-axes">
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
                  data-section="chart-line-volume-trend-cross-tick-price"
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
                  data-section="chart-line-volume-trend-cross-tick-osc"
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
            data-section="chart-line-volume-trend-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-volume-trend-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-volume-trend-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showVwmaLine ? (
          <path
            d={layout.vwmaPath}
            stroke={vwmaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-volume-trend-cross-vwma-path"
          />
        ) : null}

        {showSmaLine ? (
          <path
            d={layout.smaPath}
            stroke={smaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-volume-trend-cross-sma-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-volume-trend-cross-crosses"
            role="group"
            aria-label="Volume-weighted trend cross trigger markers"
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
                aria-label={`${m.kind} volume trend cross at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-volume-trend-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-volume-trend-cross-overlay-crosses"
            role="group"
            aria-label="overlay Volume-weighted trend cross trigger markers"
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
                data-section={`chart-line-volume-trend-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-volume-trend-cross-hover-targets">
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
                data-section="chart-line-volume-trend-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-volume-trend-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={288}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-trend-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-trend-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-trend-cross-tooltip-vwma"
                >
                  VWMA{' '}
                  {tooltipSample.vwma == null
                    ? '--'
                    : formatOsc(tooltipSample.vwma)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-trend-cross-tooltip-sma"
                >
                  SMA{' '}
                  {tooltipSample.sma == null
                    ? '--'
                    : formatOsc(tooltipSample.sma)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-trend-cross-tooltip-volume"
                >
                  vol {formatOsc(tooltipSample.volume)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-trend-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-trend-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-trend-cross-tooltip-counts"
                >
                  bull {layout.run.bullishCount} | bear{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-trend-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-volume-trend-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-volume-trend-cross-legend"
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
              { id: 'vwma' as const, color: vwmaColor, label: 'VWMA' },
              { id: 'sma' as const, color: smaColor, label: 'SMA' },
            ] satisfies Array<{
              id: ChartLineVolumeTrendCrossSeriesId;
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

ChartLineVolumeTrendCross.displayName = 'ChartLineVolumeTrendCross';
