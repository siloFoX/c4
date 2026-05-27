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
 * ChartLineEmaDivergenceCross -- pure-SVG dual-panel chart
 * with the close in the top panel and the Exponential
 * Moving Average (EMA) in the bottom panel, marking price
 * vs EMA direction-disagreement events as trend reversal
 * warnings.
 *
 *   ema[i]      = SMA-seeded EMA(close, period)
 *
 *   priceUp     : close[i] > close[i-1]
 *   priceDown   : close[i] < close[i-1]
 *   emaUp       : ema[i]   > ema[i-1]
 *   emaDown     : ema[i]   < ema[i-1]
 *
 *   regime ->
 *     'aligned-bullish'   when priceUp   && emaUp
 *     'aligned-bearish'   when priceDown && emaDown
 *     'divergent-bullish' when priceDown && emaUp
 *                          (price falling but EMA rising
 *                           -- bullish reversal warning)
 *     'divergent-bearish' when priceUp   && emaDown
 *                          (price rising but EMA falling
 *                           -- bearish reversal warning)
 *     'none'              when either side flat or null
 *
 *   bullish (divergence trigger up) :
 *     prev regime !== 'divergent-bullish' &&
 *     cur regime === 'divergent-bullish'
 *   bearish (divergence trigger down) :
 *     prev regime !== 'divergent-bearish' &&
 *     cur regime === 'divergent-bearish'
 *
 *   bias        : ema[i] vs ema[i-1] -> up / down / flat /
 *                 none (matches the chart-line-* convention)
 *
 * Defaults: `period = 14`. EMA is the close-only,
 * recency-weighted moving-average sibling of SMA. SMA
 * seeding (initialise EMA at index `period - 1` with
 * `SMA(close, period)`) makes the steady-state lag on
 * linear input exactly `(period - 1) / 2 = 6.5` from the
 * seed bar onwards, matching the SMA / WMA / HMA centroid
 * lag identity.
 *
 * Warmup is `period - 1 = 13` for the default tuning: EMA
 * first valid at i = 13. Divergence detection requires the
 * previous EMA + close, so the first regime classification
 * lands at i = 14 (one bar past warmup).
 *
 * Bit-exact anchors (close-only):
 *
 * - **CONST close = K**: SMA seed = K -> EMA stays at K
 *   (the recurrence `K * (1 - alpha) + K * alpha = K`).
 *   Both close and EMA are flat -> regime `none` for every
 *   bar. 0 divergence crosses. Verified across K in {0,
 *   1, 50, 200, 1234}.
 * - **LINEAR UP close = i**: SMA seed at i = 13 = `(0 + 1
 *   + ... + 13) / 14 = 91 / 14 = 6.5 = 13 - 6.5`. EMA[14]
 *   = `6.5 * (13 / 15) + 14 * (2 / 15) = (84.5 + 28) / 15
 *   = 7.5 = 14 - 6.5`. By induction, EMA = `i - 6.5` for
 *   every i >= 13. EMA[i] - EMA[i-1] = +1 (up); close[i]
 *   - close[i-1] = +1 (up). Both up -> regime
 *   `aligned-bullish`. 0 divergence crosses.
 * - **LINEAR DOWN close = -i**: mirror -> EMA = -i + 6.5.
 *   Both close and EMA falling -> regime `aligned-bearish`.
 *   0 divergence crosses.
 */

export interface ChartLineEmaDivergenceCrossPoint {
  x: number;
  close: number;
}

export type ChartLineEmaDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineEmaDivergenceCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineEmaDivergenceCrossSeriesId = 'price' | 'ema';

export type ChartLineEmaDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineEmaDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineEmaDivergenceCrossCrossKind;
  bias: ChartLineEmaDivergenceCrossBias;
}

export interface ChartLineEmaDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  ema: number | null;
  regime: ChartLineEmaDivergenceCrossRegime;
  bias: ChartLineEmaDivergenceCrossBias;
}

export interface ChartLineEmaDivergenceCrossRun {
  series: ChartLineEmaDivergenceCrossPoint[];
  period: number;
  emaValues: Array<number | null>;
  samples: ChartLineEmaDivergenceCrossSample[];
  crosses: ChartLineEmaDivergenceCrossCross[];
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

export interface ChartLineEmaDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineEmaDivergenceCrossLayout {
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
  priceDots: ChartLineEmaDivergenceCrossDot[];
  emaPath: string;
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
    kind: ChartLineEmaDivergenceCrossCrossKind;
    bias: ChartLineEmaDivergenceCrossBias;
  }>;
  run: ChartLineEmaDivergenceCrossRun;
}

export interface ChartLineEmaDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineEmaDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  emaColor?: string;
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
  showEma?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineEmaDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineEmaDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineEmaDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PERIOD = 14;
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_EMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineEmaDivergenceCrossFinitePoints(
  data: readonly ChartLineEmaDivergenceCrossPoint[] | null | undefined,
): ChartLineEmaDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineEmaDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineEmaDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/**
 * SMA-seeded exponential moving average. Seeds at index
 * `length - 1` with the simple average of the first
 * `length` values, then applies the standard EMA recurrence
 * `ema[i] = prev * (1 - alpha) + value * alpha` with alpha
 * = 2 / (length + 1). SMA seeding keeps the steady-state
 * lag on linear input exactly equal to `(length - 1) / 2`
 * from the seed bar onwards, matching the SMA centroid
 * identity bit-exact.
 */
export function applyLineEmaDivergenceCrossEma(
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
  const alpha = 2 / (length + 1);
  let seeded = false;
  let prev: number | null = null;
  for (let i = length - 1; i < values.length; i += 1) {
    if (!seeded) {
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
      const seed = winMin === winMax ? winMin : posZero(sum / length);
      out[i] = seed;
      prev = seed;
      seeded = true;
      continue;
    }
    const v = values[i];
    if (v == null) {
      seeded = false;
      prev = null;
      continue;
    }
    if (prev == null) continue;
    out[i] = posZero(prev * (1 - alpha) + v * alpha);
    prev = out[i] as number;
  }
  return out;
}

export interface EmaDivergenceCrossChannels {
  ema: Array<number | null>;
}

export function computeLineEmaDivergenceCross(
  series: readonly ChartLineEmaDivergenceCrossPoint[] | null | undefined,
  options: { period?: number } = {},
): EmaDivergenceCrossChannels {
  const cleaned = getLineEmaDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { ema: [] };
  }
  const period = normalizeLineEmaDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PERIOD,
  );
  const closes: Array<number | null> = cleaned.map((p) => p.close);
  const ema = applyLineEmaDivergenceCrossEma(closes, period);
  return { ema };
}

export function classifyLineEmaDivergenceCrossRegime(
  curClose: number | null,
  prevClose: number | null,
  curEma: number | null,
  prevEma: number | null,
): ChartLineEmaDivergenceCrossRegime {
  if (
    curClose == null ||
    prevClose == null ||
    curEma == null ||
    prevEma == null
  )
    return 'none';
  const priceUp = curClose > prevClose;
  const priceDown = curClose < prevClose;
  const emaUp = curEma > prevEma;
  const emaDown = curEma < prevEma;
  if (priceUp && emaUp) return 'aligned-bullish';
  if (priceDown && emaDown) return 'aligned-bearish';
  if (priceDown && emaUp) return 'divergent-bullish';
  if (priceUp && emaDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineEmaDivergenceCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineEmaDivergenceCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineEmaDivergenceCrossCrosses(
  series: readonly ChartLineEmaDivergenceCrossPoint[],
  regimes: readonly ChartLineEmaDivergenceCrossRegime[],
  emaValues: readonly (number | null)[],
): ChartLineEmaDivergenceCrossCross[] {
  const out: ChartLineEmaDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevEma = emaValues[i - 1];
    const curEma = emaValues[i];
    const bias = classifyLineEmaDivergenceCrossBias(
      curEma ?? null,
      prevEma ?? null,
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

export function runLineEmaDivergenceCross(
  data: ChartLineEmaDivergenceCrossPoint[],
  options: { period?: number } = {},
): ChartLineEmaDivergenceCrossRun {
  const cleaned = getLineEmaDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineEmaDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PERIOD,
  );

  const channels = computeLineEmaDivergenceCross(series, { period });

  const regimes: ChartLineEmaDivergenceCrossRegime[] = series.map((p, i) => {
    if (i === 0) return 'none';
    const prevSample = series[i - 1];
    const curEma = channels.ema[i] ?? null;
    const prevEma = channels.ema[i - 1] ?? null;
    return classifyLineEmaDivergenceCrossRegime(
      p.close,
      prevSample ? prevSample.close : null,
      curEma,
      prevEma,
    );
  });

  const samples: ChartLineEmaDivergenceCrossSample[] = series.map((p, i) => {
    const ema = channels.ema[i] ?? null;
    const prevEma = i > 0 ? (channels.ema[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      ema,
      regime: regimes[i] ?? 'none',
      bias: classifyLineEmaDivergenceCrossBias(ema, prevEma),
    };
  });

  const crosses = detectLineEmaDivergenceCrossCrosses(
    series,
    regimes,
    channels.ema,
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
    emaValues: channels.ema,
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

export interface ComputeLineEmaDivergenceCrossLayoutOptions {
  data: ChartLineEmaDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineEmaDivergenceCrossLayout(
  opts: ComputeLineEmaDivergenceCrossLayoutOptions,
): ChartLineEmaDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineEmaDivergenceCross(opts.data, {
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
  for (let i = 0; i < run.emaValues.length; i += 1) {
    const e = run.emaValues[i];
    if (e != null) {
      if (e < oscRawMin) oscRawMin = e;
      if (e > oscRawMax) oscRawMax = e;
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
      emaPath: '',
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
  const priceDots: ChartLineEmaDivergenceCrossDot[] = [];
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

  let emaPath = '';
  let firstEma = true;
  for (const s of run.samples) {
    if (s.ema == null) {
      firstEma = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.ema);
    emaPath += `${firstEma ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstEma = false;
  }
  emaPath = emaPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const emaAtCross = run.emaValues[c.index];
    const cyOsc = emaAtCross != null ? syOscBase(emaAtCross) : oscBottom;
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
    emaPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineEmaDivergenceCrossChart(
  data: ChartLineEmaDivergenceCrossPoint[],
  options: { period?: number } = {},
): string {
  const cleaned = getLineEmaDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineEmaDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PERIOD,
  );
  return (
    `EMA divergence chart over ${cleaned.length} bars (period ` +
    `${period}). Top panel renders the close with bullish ` +
    `(price falling while EMA rising, bullish divergence -- ` +
    `trend reversal warning up) / bearish (price rising while ` +
    `EMA falling, bearish divergence -- trend reversal warning ` +
    `down) chevron overlays at every price-vs-EMA direction- ` +
    `disagreement transition; bottom panel renders the ` +
    `Exponential Moving Average with markers coloured by EMA ` +
    `slope bias (rising / falling / flat) at the trigger bar, ` +
    `flagging trend reversal warning events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineEmaDivergenceCrossCrossKind,
  bias: ChartLineEmaDivergenceCrossBias,
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

export const ChartLineEmaDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineEmaDivergenceCrossProps
>(function ChartLineEmaDivergenceCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PERIOD,
    width = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_PRICE_COLOR,
    emaColor = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_EMA_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_EMA_DIVERGENCE_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showEma = true,
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
    () => getLineEmaDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineEmaDivergenceCrossLayout({
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
    ChartLineEmaDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineEmaDivergenceCrossSeriesId,
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
    seriesId: ChartLineEmaDivergenceCrossSeriesId,
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
        data-section="chart-line-ema-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineEmaDivergenceCrossChart(cleaned, { period });

  const showPrice = !hidden.has('price');
  const showEmaLine = !hidden.has('ema') && showEma;

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
      aria-label={ariaLabel ?? 'EMA divergence chart'}
      aria-describedby={descId}
      data-section="chart-line-ema-divergence-cross"
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
        data-section="chart-line-ema-divergence-cross-title"
      >
        {ariaLabel ?? 'EMA divergence chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-ema-divergence-cross-aria-desc"
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
        data-section="chart-line-ema-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-ema-divergence-cross-grid">
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
                  data-section="chart-line-ema-divergence-cross-grid-line-price"
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
                  data-section="chart-line-ema-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-ema-divergence-cross-axes">
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
                  data-section="chart-line-ema-divergence-cross-tick-price"
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
                  data-section="chart-line-ema-divergence-cross-tick-osc"
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
            data-section="chart-line-ema-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-ema-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-ema-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showEmaLine ? (
          <path
            d={layout.emaPath}
            stroke={emaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ema-divergence-cross-ema-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-ema-divergence-cross-crosses"
            role="group"
            aria-label="EMA divergence trigger markers"
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
                aria-label={`${m.kind} EMA divergence trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-ema-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-ema-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay EMA divergence trigger markers"
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
                data-section={`chart-line-ema-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-ema-divergence-cross-hover-targets">
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
                data-section="chart-line-ema-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-ema-divergence-cross-tooltip"
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
                  data-section="chart-line-ema-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-divergence-cross-tooltip-ema"
                >
                  EMA{' '}
                  {tooltipSample.ema == null
                    ? '--'
                    : formatOsc(tooltipSample.ema)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-divergence-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-divergence-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ema-divergence-cross-tooltip-biases"
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
          data-section="chart-line-ema-divergence-cross-badge"
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
          data-section="chart-line-ema-divergence-cross-legend"
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
              { id: 'ema' as const, color: emaColor, label: 'EMA' },
            ] satisfies Array<{
              id: ChartLineEmaDivergenceCrossSeriesId;
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

ChartLineEmaDivergenceCross.displayName = 'ChartLineEmaDivergenceCross';
