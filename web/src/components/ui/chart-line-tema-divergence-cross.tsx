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
 * ChartLineTemaDivergenceCross -- pure-SVG dual-panel
 * chart with the close in the top panel and the Triple
 * Exponential Moving Average (TEMA) in the bottom panel,
 * marking price vs TEMA direction-disagreement events as
 * responsive trend reversal warnings.
 *
 *   ema1[i]     = EMA(close, period)
 *   ema2[i]     = EMA(ema1,  period)
 *   ema3[i]     = EMA(ema2,  period)
 *   tema[i]     = 3 * ema1[i] - 3 * ema2[i] + ema3[i]
 *
 *   priceUp     : close[i] > close[i-1]
 *   priceDown   : close[i] < close[i-1]
 *   temaUp      : tema[i]  > tema[i-1]
 *   temaDown    : tema[i]  < tema[i-1]
 *
 *   regime ->
 *     'aligned-bullish'   when priceUp   && temaUp
 *     'aligned-bearish'   when priceDown && temaDown
 *     'divergent-bullish' when priceDown && temaUp
 *                          (price falling but TEMA rising
 *                           -- responsive bullish reversal
 *                           warning)
 *     'divergent-bearish' when priceUp   && temaDown
 *                          (price rising but TEMA falling
 *                           -- responsive bearish reversal
 *                           warning)
 *     'none'              when either side flat or null
 *
 *   bullish (divergence trigger up) :
 *     prev regime !== 'divergent-bullish' &&
 *     cur regime === 'divergent-bullish'
 *   bearish (divergence trigger down) :
 *     prev regime !== 'divergent-bearish' &&
 *     cur regime === 'divergent-bearish'
 *
 *   bias        : tema[i] vs tema[i-1] -> up / down /
 *                 flat / none
 *
 * Defaults: `period = 14`. TEMA is Patrick Mulloy's
 * zero-lag triple EMA composite (1994). The
 * `3 * ema1 - 3 * ema2 + ema3` combination cancels the
 * EMA centroid lag exactly on linear input -- TEMA tracks
 * the close with zero lag, so the divergence detector
 * here surfaces only genuine direction disagreements
 * caused by sub-linear price patterns (no lag-driven
 * false positives).
 *
 * Warmup is `3 * (period - 1) = 39` for the default
 * tuning: ema1 seeds at `period - 1 = 13`, ema2 at
 * `2 * (period - 1) = 26`, ema3 at `3 * (period - 1) =
 * 39`. Divergence detection requires the previous TEMA
 * + close, so the first regime classification lands at
 * i = 40 (one bar past warmup).
 *
 * Bit-exact anchors (close-only, all use SMA-seeded EMA
 * recurrences):
 *
 * - **CONST close = K**: each EMA seeds at K -> ema1 =
 *   ema2 = ema3 = K -> TEMA = 3K - 3K + K = K. Both
 *   close and TEMA are flat -> regime `none` for every
 *   bar. 0 divergence crosses. Verified across K in
 *   {0, 1, 50, 200, 1234}.
 * - **LINEAR UP close = i**: SMA-seeded EMA on linear
 *   input settles at `i - (period - 1) / 2 = i - 6.5`,
 *   ema2 settles at `i - 13`, ema3 at `i - 19.5`. The
 *   Mulloy identity gives TEMA = `3 * (i - 6.5) - 3 *
 *   (i - 13) + (i - 19.5) = i` -- zero lag, exact match
 *   to close. close[i] - close[i-1] = +1 (up); TEMA[i]
 *   - TEMA[i-1] = +1 (up). Both up -> regime
 *   `aligned-bullish`. 0 divergence crosses.
 * - **LINEAR DOWN close = -i**: mirror -> TEMA = -i.
 *   Both close and TEMA falling -> regime
 *   `aligned-bearish`. 0 divergence crosses.
 */

export interface ChartLineTemaDivergenceCrossPoint {
  x: number;
  close: number;
}

export type ChartLineTemaDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineTemaDivergenceCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineTemaDivergenceCrossSeriesId = 'price' | 'tema';

export type ChartLineTemaDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineTemaDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineTemaDivergenceCrossCrossKind;
  bias: ChartLineTemaDivergenceCrossBias;
}

export interface ChartLineTemaDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  tema: number | null;
  regime: ChartLineTemaDivergenceCrossRegime;
  bias: ChartLineTemaDivergenceCrossBias;
}

export interface ChartLineTemaDivergenceCrossRun {
  series: ChartLineTemaDivergenceCrossPoint[];
  period: number;
  ema1Values: Array<number | null>;
  ema2Values: Array<number | null>;
  ema3Values: Array<number | null>;
  temaValues: Array<number | null>;
  samples: ChartLineTemaDivergenceCrossSample[];
  crosses: ChartLineTemaDivergenceCrossCross[];
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

export interface ChartLineTemaDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTemaDivergenceCrossLayout {
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
  priceDots: ChartLineTemaDivergenceCrossDot[];
  temaPath: string;
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
    kind: ChartLineTemaDivergenceCrossCrossKind;
    bias: ChartLineTemaDivergenceCrossBias;
  }>;
  run: ChartLineTemaDivergenceCrossRun;
}

export interface ChartLineTemaDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTemaDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  temaColor?: string;
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
  showTema?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTemaDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineTemaDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTemaDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PERIOD = 14;
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_TEMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineTemaDivergenceCrossFinitePoints(
  data: readonly ChartLineTemaDivergenceCrossPoint[] | null | undefined,
): ChartLineTemaDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTemaDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineTemaDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/**
 * SMA-seeded exponential moving average. Seeds at index
 * `length - 1` with the simple average of the first
 * `length` values, then applies the standard EMA
 * recurrence with alpha = 2 / (length + 1). SMA seeding
 * keeps the steady-state lag on linear input exactly equal
 * to `(length - 1) / 2` from the seed bar onwards.
 */
export function applyLineTemaDivergenceCrossEma(
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
  let seedSearchStart = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (!seeded) {
      if (i < seedSearchStart + length - 1) continue;
      let sum = 0;
      let valid = true;
      let winMin = Infinity;
      let winMax = -Infinity;
      for (let j = i - length + 1; j <= i; j += 1) {
        const v = values[j];
        if (v == null) {
          valid = false;
          seedSearchStart = j + 1;
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
      seedSearchStart = i + 1;
      continue;
    }
    if (prev == null) continue;
    out[i] = posZero(prev * (1 - alpha) + v * alpha);
    prev = out[i] as number;
  }
  return out;
}

export interface TemaDivergenceCrossChannels {
  ema1: Array<number | null>;
  ema2: Array<number | null>;
  ema3: Array<number | null>;
  tema: Array<number | null>;
}

export function computeLineTemaDivergenceCross(
  series: readonly ChartLineTemaDivergenceCrossPoint[] | null | undefined,
  options: { period?: number } = {},
): TemaDivergenceCrossChannels {
  const cleaned = getLineTemaDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { ema1: [], ema2: [], ema3: [], tema: [] };
  }
  const period = normalizeLineTemaDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PERIOD,
  );
  const closes: Array<number | null> = cleaned.map((p) => p.close);
  const ema1 = applyLineTemaDivergenceCrossEma(closes, period);
  const ema2 = applyLineTemaDivergenceCrossEma(ema1, period);
  const ema3 = applyLineTemaDivergenceCrossEma(ema2, period);
  const tema: Array<number | null> = new Array(cleaned.length).fill(null);
  for (let i = 0; i < cleaned.length; i += 1) {
    const e1 = ema1[i];
    const e2 = ema2[i];
    const e3 = ema3[i];
    if (e1 == null || e2 == null || e3 == null) continue;
    tema[i] = posZero(3 * e1 - 3 * e2 + e3);
  }
  return { ema1, ema2, ema3, tema };
}

export function classifyLineTemaDivergenceCrossRegime(
  curClose: number | null,
  prevClose: number | null,
  curTema: number | null,
  prevTema: number | null,
): ChartLineTemaDivergenceCrossRegime {
  if (
    curClose == null ||
    prevClose == null ||
    curTema == null ||
    prevTema == null
  )
    return 'none';
  const priceUp = curClose > prevClose;
  const priceDown = curClose < prevClose;
  const temaUp = curTema > prevTema;
  const temaDown = curTema < prevTema;
  if (priceUp && temaUp) return 'aligned-bullish';
  if (priceDown && temaDown) return 'aligned-bearish';
  if (priceDown && temaUp) return 'divergent-bullish';
  if (priceUp && temaDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineTemaDivergenceCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineTemaDivergenceCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineTemaDivergenceCrossCrosses(
  series: readonly ChartLineTemaDivergenceCrossPoint[],
  regimes: readonly ChartLineTemaDivergenceCrossRegime[],
  temaValues: readonly (number | null)[],
): ChartLineTemaDivergenceCrossCross[] {
  const out: ChartLineTemaDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevTema = temaValues[i - 1];
    const curTema = temaValues[i];
    const bias = classifyLineTemaDivergenceCrossBias(
      curTema ?? null,
      prevTema ?? null,
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

export function runLineTemaDivergenceCross(
  data: ChartLineTemaDivergenceCrossPoint[],
  options: { period?: number } = {},
): ChartLineTemaDivergenceCrossRun {
  const cleaned = getLineTemaDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineTemaDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PERIOD,
  );

  const channels = computeLineTemaDivergenceCross(series, { period });

  const regimes: ChartLineTemaDivergenceCrossRegime[] = series.map(
    (p, i) => {
      if (i === 0) return 'none';
      const prevSample = series[i - 1];
      const curTema = channels.tema[i] ?? null;
      const prevTema = channels.tema[i - 1] ?? null;
      return classifyLineTemaDivergenceCrossRegime(
        p.close,
        prevSample ? prevSample.close : null,
        curTema,
        prevTema,
      );
    },
  );

  const samples: ChartLineTemaDivergenceCrossSample[] = series.map(
    (p, i) => {
      const tema = channels.tema[i] ?? null;
      const prevTema = i > 0 ? (channels.tema[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        tema,
        regime: regimes[i] ?? 'none',
        bias: classifyLineTemaDivergenceCrossBias(tema, prevTema),
      };
    },
  );

  const crosses = detectLineTemaDivergenceCrossCrosses(
    series,
    regimes,
    channels.tema,
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

  const warmup = 3 * (period - 1);
  const ok = series.length > warmup + 1;

  return {
    series,
    period,
    ema1Values: channels.ema1,
    ema2Values: channels.ema2,
    ema3Values: channels.ema3,
    temaValues: channels.tema,
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

export interface ComputeLineTemaDivergenceCrossLayoutOptions {
  data: ChartLineTemaDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineTemaDivergenceCrossLayout(
  opts: ComputeLineTemaDivergenceCrossLayoutOptions,
): ChartLineTemaDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineTemaDivergenceCross(opts.data, {
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
  for (let i = 0; i < run.temaValues.length; i += 1) {
    const t = run.temaValues[i];
    if (t != null) {
      if (t < oscRawMin) oscRawMin = t;
      if (t > oscRawMax) oscRawMax = t;
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
      temaPath: '',
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
  const priceDots: ChartLineTemaDivergenceCrossDot[] = [];
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

  let temaPath = '';
  let firstTema = true;
  for (const s of run.samples) {
    if (s.tema == null) {
      firstTema = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.tema);
    temaPath += `${firstTema ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstTema = false;
  }
  temaPath = temaPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const temaAtCross = run.temaValues[c.index];
    const cyOsc = temaAtCross != null ? syOscBase(temaAtCross) : oscBottom;
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
    temaPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineTemaDivergenceCrossChart(
  data: ChartLineTemaDivergenceCrossPoint[],
  options: { period?: number } = {},
): string {
  const cleaned = getLineTemaDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineTemaDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PERIOD,
  );
  return (
    `TEMA divergence chart over ${cleaned.length} bars (period ` +
    `${period}). Top panel renders the close with bullish ` +
    `(price falling while TEMA rising, bullish divergence -- ` +
    `responsive trend reversal warning up) / bearish (price ` +
    `rising while TEMA falling, bearish divergence -- ` +
    `responsive trend reversal warning down) chevron overlays ` +
    `at every price-vs-TEMA direction-disagreement transition; ` +
    `bottom panel renders the Triple Exponential Moving ` +
    `Average (Mulloy's zero-lag triple EMA composite) with ` +
    `markers coloured by TEMA slope bias (rising / falling / ` +
    `flat) at the trigger bar, flagging responsive trend ` +
    `reversal warning events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineTemaDivergenceCrossCrossKind,
  bias: ChartLineTemaDivergenceCrossBias,
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

export const ChartLineTemaDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineTemaDivergenceCrossProps
>(function ChartLineTemaDivergenceCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PERIOD,
    width = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_PRICE_COLOR,
    temaColor = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_TEMA_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TEMA_DIVERGENCE_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTema = true,
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
    () => getLineTemaDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineTemaDivergenceCrossLayout({
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
    ChartLineTemaDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineTemaDivergenceCrossSeriesId,
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
    seriesId: ChartLineTemaDivergenceCrossSeriesId,
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
        data-section="chart-line-tema-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineTemaDivergenceCrossChart(cleaned, { period });

  const showPrice = !hidden.has('price');
  const showTemaLine = !hidden.has('tema') && showTema;

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
      aria-label={ariaLabel ?? 'TEMA divergence chart'}
      aria-describedby={descId}
      data-section="chart-line-tema-divergence-cross"
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
        data-section="chart-line-tema-divergence-cross-title"
      >
        {ariaLabel ?? 'TEMA divergence chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-tema-divergence-cross-aria-desc"
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
        data-section="chart-line-tema-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-tema-divergence-cross-grid">
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
                  data-section="chart-line-tema-divergence-cross-grid-line-price"
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
                  data-section="chart-line-tema-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-tema-divergence-cross-axes">
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
                  data-section="chart-line-tema-divergence-cross-tick-price"
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
                  data-section="chart-line-tema-divergence-cross-tick-osc"
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
            data-section="chart-line-tema-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-tema-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-tema-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showTemaLine ? (
          <path
            d={layout.temaPath}
            stroke={temaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-tema-divergence-cross-tema-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-tema-divergence-cross-crosses"
            role="group"
            aria-label="TEMA divergence trigger markers"
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
                aria-label={`${m.kind} TEMA divergence trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-tema-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-tema-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay TEMA divergence trigger markers"
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
                data-section={`chart-line-tema-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-tema-divergence-cross-hover-targets">
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
                data-section="chart-line-tema-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-tema-divergence-cross-tooltip"
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
                  data-section="chart-line-tema-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-divergence-cross-tooltip-tema"
                >
                  TEMA{' '}
                  {tooltipSample.tema == null
                    ? '--'
                    : formatOsc(tooltipSample.tema)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-divergence-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-divergence-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tema-divergence-cross-tooltip-biases"
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
          data-section="chart-line-tema-divergence-cross-badge"
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
          data-section="chart-line-tema-divergence-cross-legend"
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
              { id: 'tema' as const, color: temaColor, label: 'TEMA' },
            ] satisfies Array<{
              id: ChartLineTemaDivergenceCrossSeriesId;
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

ChartLineTemaDivergenceCross.displayName = 'ChartLineTemaDivergenceCross';
