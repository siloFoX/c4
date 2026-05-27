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
 * ChartLineVwapDivergenceCross -- pure-SVG dual-panel chart
 * with the close in the top panel and the rolling Volume
 * Weighted Average Price (VWAP) in the bottom panel,
 * marking price vs VWAP direction-disagreement events as
 * institutional flow reversal warnings.
 *
 *   typical[i]  = (high[i] + low[i] + close[i]) / 3
 *   vwap[i]     = sum(typical[j] * volume[j], j = i -
 *                     period + 1..i)
 *                 / sum(volume[j], j = i - period + 1..i)
 *                 (the rolling volume-weighted average of
 *                 typical prices over the lookback window)
 *
 *   priceUp     : close[i] > close[i-1]
 *   priceDown   : close[i] < close[i-1]
 *   vwapUp      : vwap[i]   > vwap[i-1]
 *   vwapDown    : vwap[i]   < vwap[i-1]
 *
 *   regime ->
 *     'aligned-bullish'   when priceUp   && vwapUp
 *     'aligned-bearish'   when priceDown && vwapDown
 *     'divergent-bullish' when priceDown && vwapUp
 *                          (price falling but VWAP rising
 *                           -- bullish reversal warning,
 *                           institutional buying)
 *     'divergent-bearish' when priceUp   && vwapDown
 *                          (price rising but VWAP falling
 *                           -- bearish reversal warning,
 *                           institutional selling)
 *     'none'              when either side flat or null
 *
 *   bullish (divergence trigger up) :
 *     prev regime !== 'divergent-bullish' &&
 *     cur regime === 'divergent-bullish'
 *   bearish (divergence trigger down) :
 *     prev regime !== 'divergent-bearish' &&
 *     cur regime === 'divergent-bearish'
 *
 *   bias        : vwap[i] vs vwap[i-1] -> up / down / flat
 *                 / none (matches the chart-line- convention)
 *
 * Defaults: `period = 14`. VWAP is the institutional-flow
 * proxy: weighting each bar's typical price by its volume
 * captures the average price paid for the most active
 * trades. When close diverges from VWAP, the implication
 * is that retail price action is pulling away from the
 * institutional average -- a classic mean-reversion
 * warning.
 *
 * For constant volume the rolling VWAP reduces to
 * `SMA(typical, period)`, so the bit-exact anchors track
 * the SMA centroid identity. For varying volume the
 * difference becomes meaningful -- bars with heavier
 * volume pull the VWAP toward their price more strongly.
 *
 * Warmup is `period - 1 = 13` for the default tuning: VWAP
 * first valid at i = 13. Divergence detection requires the
 * previous VWAP + close, so the first regime classification
 * lands at i = 14 (one bar past warmup).
 *
 * Bit-exact anchors (HLCV input, all with constant
 * volume V = 1):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close
 *   = K`, `volume = 1`: typical = ((K+1) + (K-1) + K) / 3
 *   = K. vwap = SMA(K, period) = K. Both close and VWAP
 *   are flat -> regime `none`. 0 crosses. Verified across
 *   K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close
 *   = i`, `volume = 1`: typical = ((i+1) + (i-1) + i) / 3
 *   = i. vwap = SMA(typical, period) = i - 6.5. close[i]
 *   - close[i-1] = +1 (up); vwap[i] - vwap[i-1] = +1
 *   (up). Both up -> regime `aligned-bullish`. 0 crosses.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`, `volume = 1`: mirror -> typical = -i,
 *   vwap = -i + 6.5. Both close and VWAP falling ->
 *   regime `aligned-bearish`. 0 crosses.
 */

export interface ChartLineVwapDivergenceCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartLineVwapDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineVwapDivergenceCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineVwapDivergenceCrossSeriesId = 'price' | 'vwap';

export type ChartLineVwapDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineVwapDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineVwapDivergenceCrossCrossKind;
  bias: ChartLineVwapDivergenceCrossBias;
}

export interface ChartLineVwapDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  vwap: number | null;
  regime: ChartLineVwapDivergenceCrossRegime;
  bias: ChartLineVwapDivergenceCrossBias;
}

export interface ChartLineVwapDivergenceCrossRun {
  series: ChartLineVwapDivergenceCrossPoint[];
  period: number;
  typicalValues: Array<number | null>;
  vwapValues: Array<number | null>;
  samples: ChartLineVwapDivergenceCrossSample[];
  crosses: ChartLineVwapDivergenceCrossCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  upBiasCount: number;
  downBiasCount: number;
  flatBiasCount: number;
  ok: boolean;
}

export interface ChartLineVwapDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVwapDivergenceCrossLayout {
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
  priceDots: ChartLineVwapDivergenceCrossDot[];
  vwapPath: string;
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
    kind: ChartLineVwapDivergenceCrossCrossKind;
    bias: ChartLineVwapDivergenceCrossBias;
  }>;
  run: ChartLineVwapDivergenceCrossRun;
}

export interface ChartLineVwapDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVwapDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  vwapColor?: string;
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
  showVwap?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVwapDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineVwapDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVwapDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PERIOD = 14;
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_VWAP_COLOR =
  '#0d9488';
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineVwapDivergenceCrossFinitePoints(
  data: readonly ChartLineVwapDivergenceCrossPoint[] | null | undefined,
): ChartLineVwapDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVwapDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume) &&
      point.high >= point.low &&
      point.volume >= 0
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: point.volume,
      });
    }
  }
  return out;
}

export function normalizeLineVwapDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export interface VwapDivergenceCrossChannels {
  typical: Array<number | null>;
  vwap: Array<number | null>;
}

export function computeLineVwapDivergenceCross(
  series: readonly ChartLineVwapDivergenceCrossPoint[] | null | undefined,
  options: { period?: number } = {},
): VwapDivergenceCrossChannels {
  const cleaned = getLineVwapDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { typical: [], vwap: [] };
  }
  const period = normalizeLineVwapDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PERIOD,
  );

  const n = cleaned.length;
  const typical: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const p = cleaned[i]!;
    typical[i] = posZero((p.high + p.low + p.close) / 3);
  }

  const vwap: Array<number | null> = new Array(n).fill(null);
  for (let i = period - 1; i < n; i += 1) {
    let numerator = 0;
    let denominator = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      const t = typical[j];
      const p = cleaned[j];
      if (t == null || p == null) {
        numerator = NaN;
        break;
      }
      numerator += t * p.volume;
      denominator += p.volume;
    }
    if (!Number.isFinite(numerator) || denominator === 0) continue;
    vwap[i] = posZero(numerator / denominator);
  }

  return { typical, vwap };
}

export function classifyLineVwapDivergenceCrossRegime(
  curClose: number | null,
  prevClose: number | null,
  curVwap: number | null,
  prevVwap: number | null,
): ChartLineVwapDivergenceCrossRegime {
  if (
    curClose == null ||
    prevClose == null ||
    curVwap == null ||
    prevVwap == null
  )
    return 'none';
  const priceUp = curClose > prevClose;
  const priceDown = curClose < prevClose;
  const vwapUp = curVwap > prevVwap;
  const vwapDown = curVwap < prevVwap;
  if (priceUp && vwapUp) return 'aligned-bullish';
  if (priceDown && vwapDown) return 'aligned-bearish';
  if (priceDown && vwapUp) return 'divergent-bullish';
  if (priceUp && vwapDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineVwapDivergenceCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineVwapDivergenceCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineVwapDivergenceCrossCrosses(
  series: readonly ChartLineVwapDivergenceCrossPoint[],
  regimes: readonly ChartLineVwapDivergenceCrossRegime[],
  vwapValues: readonly (number | null)[],
): ChartLineVwapDivergenceCrossCross[] {
  const out: ChartLineVwapDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevVwap = vwapValues[i - 1];
    const curVwap = vwapValues[i];
    const bias = classifyLineVwapDivergenceCrossBias(
      curVwap ?? null,
      prevVwap ?? null,
    );
    if (cur === 'divergent-bullish' && prev !== 'divergent-bullish') {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (
      cur === 'divergent-bearish' &&
      prev !== 'divergent-bearish'
    ) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineVwapDivergenceCross(
  data: ChartLineVwapDivergenceCrossPoint[],
  options: { period?: number } = {},
): ChartLineVwapDivergenceCrossRun {
  const cleaned = getLineVwapDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineVwapDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PERIOD,
  );

  const channels = computeLineVwapDivergenceCross(series, { period });

  const regimes: ChartLineVwapDivergenceCrossRegime[] = series.map(
    (p, i) => {
      if (i === 0) return 'none';
      const prevSample = series[i - 1];
      const curVwap = channels.vwap[i] ?? null;
      const prevVwap = channels.vwap[i - 1] ?? null;
      return classifyLineVwapDivergenceCrossRegime(
        p.close,
        prevSample ? prevSample.close : null,
        curVwap,
        prevVwap,
      );
    },
  );

  const samples: ChartLineVwapDivergenceCrossSample[] = series.map(
    (p, i) => {
      const vwap = channels.vwap[i] ?? null;
      const prevVwap = i > 0 ? (channels.vwap[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        vwap,
        regime: regimes[i] ?? 'none',
        bias: classifyLineVwapDivergenceCrossBias(vwap, prevVwap),
      };
    },
  );

  const crosses = detectLineVwapDivergenceCrossCrosses(
    series,
    regimes,
    channels.vwap,
  );

  let alignedBullishCount = 0;
  let alignedBearishCount = 0;
  let divergentBullishCount = 0;
  let divergentBearishCount = 0;
  let noneCount = 0;
  let upBiasCount = 0;
  let downBiasCount = 0;
  let flatBiasCount = 0;
  for (const s of samples) {
    if (s.regime === 'aligned-bullish') alignedBullishCount += 1;
    else if (s.regime === 'aligned-bearish') alignedBearishCount += 1;
    else if (s.regime === 'divergent-bullish') divergentBullishCount += 1;
    else if (s.regime === 'divergent-bearish') divergentBearishCount += 1;
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

  const warmup = period - 1;
  const ok = series.length > warmup + 1;

  return {
    series,
    period,
    typicalValues: channels.typical,
    vwapValues: channels.vwap,
    samples,
    crosses,
    alignedBullishCount,
    alignedBearishCount,
    divergentBullishCount,
    divergentBearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    upBiasCount,
    downBiasCount,
    flatBiasCount,
    ok,
  };
}

export interface ComputeLineVwapDivergenceCrossLayoutOptions {
  data: ChartLineVwapDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineVwapDivergenceCrossLayout(
  opts: ComputeLineVwapDivergenceCrossLayoutOptions,
): ChartLineVwapDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineVwapDivergenceCross(opts.data, {
    period: opts.period ?? undefined,
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
  for (let i = 0; i < run.vwapValues.length; i += 1) {
    const v = run.vwapValues[i];
    if (v != null) {
      if (v < oscRawMin) oscRawMin = v;
      if (v > oscRawMax) oscRawMax = v;
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
      vwapPath: '',
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
  const priceDots: ChartLineVwapDivergenceCrossDot[] = [];
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

  let vwapPath = '';
  let firstVwap = true;
  for (const s of run.samples) {
    if (s.vwap == null) {
      firstVwap = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.vwap);
    vwapPath += `${firstVwap ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstVwap = false;
  }
  vwapPath = vwapPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const vwapAtCross = run.vwapValues[c.index];
    const cyOsc = vwapAtCross != null ? syOscBase(vwapAtCross) : oscBottom;
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
    vwapPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineVwapDivergenceCrossChart(
  data: ChartLineVwapDivergenceCrossPoint[],
  options: { period?: number } = {},
): string {
  const cleaned = getLineVwapDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineVwapDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PERIOD,
  );
  return (
    `VWAP divergence chart over ${cleaned.length} bars (period ` +
    `${period}). Top panel renders the close with bullish ` +
    `(price falling while VWAP rising, bullish divergence -- ` +
    `institutional flow reversal warning up) / bearish (price ` +
    `rising while VWAP falling, bearish divergence -- ` +
    `institutional flow reversal warning down) chevron ` +
    `overlays at every price-vs-VWAP direction-disagreement ` +
    `transition; bottom panel renders the rolling Volume ` +
    `Weighted Average Price (typical-price-weighted by ` +
    `volume) with markers coloured by VWAP slope bias ` +
    `(rising / falling / flat) at the trigger bar, flagging ` +
    `institutional flow reversal warning events with bias ` +
    `coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineVwapDivergenceCrossCrossKind,
  bias: ChartLineVwapDivergenceCrossBias,
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

export const ChartLineVwapDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineVwapDivergenceCrossProps
>(function ChartLineVwapDivergenceCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PERIOD,
    width = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_PRICE_COLOR,
    vwapColor = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_VWAP_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_VWAP_DIVERGENCE_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showVwap = true,
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
    () => getLineVwapDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineVwapDivergenceCrossLayout({
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
    ChartLineVwapDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineVwapDivergenceCrossSeriesId,
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
    seriesId: ChartLineVwapDivergenceCrossSeriesId,
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
        data-section="chart-line-vwap-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineVwapDivergenceCrossChart(cleaned, { period });

  const showPrice = !hidden.has('price');
  const showVwapLine = !hidden.has('vwap') && showVwap;

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
      aria-label={ariaLabel ?? 'VWAP divergence chart'}
      aria-describedby={descId}
      data-section="chart-line-vwap-divergence-cross"
      data-period={period}
      data-total-points={cleaned.length}
      data-aligned-bullish-count={layout.run.alignedBullishCount}
      data-aligned-bearish-count={layout.run.alignedBearishCount}
      data-divergent-bullish-count={layout.run.divergentBullishCount}
      data-divergent-bearish-count={layout.run.divergentBearishCount}
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
        data-section="chart-line-vwap-divergence-cross-title"
      >
        {ariaLabel ?? 'VWAP divergence chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-vwap-divergence-cross-aria-desc"
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
        data-section="chart-line-vwap-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-vwap-divergence-cross-grid">
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
                  data-section="chart-line-vwap-divergence-cross-grid-line-price"
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
                  data-section="chart-line-vwap-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-vwap-divergence-cross-axes">
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
                  data-section="chart-line-vwap-divergence-cross-tick-price"
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
                  data-section="chart-line-vwap-divergence-cross-tick-osc"
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
            data-section="chart-line-vwap-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-vwap-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-vwap-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showVwapLine ? (
          <path
            d={layout.vwapPath}
            stroke={vwapColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vwap-divergence-cross-vwap-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-vwap-divergence-cross-crosses"
            role="group"
            aria-label="VWAP divergence trigger markers"
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
                aria-label={`${m.kind} VWAP divergence trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-vwap-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-vwap-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay VWAP divergence trigger markers"
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
                data-section={`chart-line-vwap-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-vwap-divergence-cross-hover-targets">
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
                data-section="chart-line-vwap-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-vwap-divergence-cross-tooltip"
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
                  data-section="chart-line-vwap-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-divergence-cross-tooltip-vwap"
                >
                  VWAP{' '}
                  {tooltipSample.vwap == null
                    ? '--'
                    : formatOsc(tooltipSample.vwap)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-divergence-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-divergence-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-divergence-cross-tooltip-biases"
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
          data-section="chart-line-vwap-divergence-cross-badge"
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
          data-section="chart-line-vwap-divergence-cross-legend"
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
              { id: 'vwap' as const, color: vwapColor, label: 'VWAP' },
            ] satisfies Array<{
              id: ChartLineVwapDivergenceCrossSeriesId;
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

ChartLineVwapDivergenceCross.displayName = 'ChartLineVwapDivergenceCross';
