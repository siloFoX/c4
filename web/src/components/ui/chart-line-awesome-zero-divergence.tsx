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
 * ChartLineAwesomeZeroDivergence -- pure-SVG dual-panel
 * chart with the median price (HL2 = (high + low) / 2) in
 * the top panel and the Bill Williams Awesome Oscillator
 * (AO) in the bottom panel, marking bullish (price down
 * while AO up -- bullish momentum reversal warning,
 * downward price exhaustion while AO recovers toward or
 * away from zero) / bearish (price up while AO down --
 * bearish momentum reversal warning, upward price
 * exhaustion while AO decays toward or away from zero)
 * price-vs-AO direction disagreement (divergence) trigger
 * events with bias coloring derived from the AO slope at
 * the divergence-entry bar.
 *
 *   HL2[i]  = (high[i] + low[i]) / 2
 *   AO[i]   = SMA(HL2, fastLength)[i] -
 *             SMA(HL2, slowLength)[i]
 *
 *   priceUp     = HL2[i]  > HL2[i-1]
 *   priceDown   = HL2[i]  < HL2[i-1]
 *   aoUp        = AO[i]   > AO[i-1]
 *   aoDown      = AO[i]   < AO[i-1]
 *
 *   regime :
 *     'aligned-bullish'   when priceUp   && aoUp
 *                         (price + AO confirm uptrend)
 *     'aligned-bearish'   when priceDown && aoDown
 *                         (price + AO confirm downtrend)
 *     'divergent-bullish' when priceDown && aoUp
 *                         (price falling but AO
 *                          recovering -- bullish reversal
 *                          warning)
 *     'divergent-bearish' when priceUp   && aoDown
 *                         (price rising but AO decaying
 *                          -- bearish reversal warning)
 *     'none'              otherwise (null or any flat)
 *
 *   bullish cross :
 *     prev regime !== 'divergent-bullish' &&
 *     cur regime === 'divergent-bullish'
 *   bearish cross :
 *     prev regime !== 'divergent-bearish' &&
 *     cur regime === 'divergent-bearish'
 *
 *   bias : AO[i] vs AO[i-1] -> up/down/flat/none
 *
 * Defaults: `fastLength = 5`, `slowLength = 34` --
 * canonical Bill Williams Awesome Oscillator tuning. The
 * AO is a "zero-line" momentum oscillator: it oscillates
 * around zero rather than within a fixed [0, 100] range
 * like RSI, and its sign indicates whether short-term
 * momentum (5-bar median) is above or below medium-term
 * momentum (34-bar median). Divergence between price
 * direction and AO direction is a classical reversal
 * warning -- the underlying short-vs-long momentum gap
 * has reversed direction even though price has not yet.
 *
 * Sibling family (divergence-cross family):
 *   - chart-line-atr-divergence-cross v1.11.1046 --
 *     price vs ATR (volatility-direction)
 *   - chart-line-keltner-divergence-cross v1.11.1054 --
 *     price vs Keltner mid
 *   - chart-line-bollinger-divergence-cross v1.11.1055 --
 *     price vs Bollinger mid
 *   - chart-line-donchian-divergence-cross v1.11.1059 --
 *     price vs Donchian mid
 *   - chart-line-momentum-divergence-cross v1.11.1088 --
 *     price vs raw Momentum oscillator
 *   - chart-line-roc-divergence-cross v1.11.1089 --
 *     price vs ROC percentage oscillator
 *   - this primitive: price vs Awesome Oscillator (the
 *     classical Bill Williams zero-line momentum
 *     reversal warning)
 *
 * Distinct from the Momentum / ROC siblings: AO is a
 * SMA-difference oscillator (5-bar fast SMA minus 34-bar
 * slow SMA of HL2), not a single-period delta. This
 * dual-SMA construction means AO has bit-exact CONSTANT
 * behaviour on linear input (the constant difference
 * between two linear SMAs offset by their windows) --
 * 14.5 on LINEAR UP, -14.5 on LINEAR DOWN. This is
 * different from ROC (always divergent against linear
 * growth) and same as Momentum (constant momentum on
 * linear input), but the value is the half-difference
 * between the two SMA lookbacks rather than the raw
 * Momentum period.
 *
 * Warmup is `slowLength - 1 = 33` for the first AO
 * value: the slow SMA window fills at i = slowLength -
 * 1. Cross detection needs the previous bar's regime,
 * so the first potential cross lands at i = slowLength
 * = 34.
 *
 * Bit-exact anchors (HL input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`: HL2
 *   = K. SMA(K, 5) = K, SMA(K, 34) = K. AO = K - K =
 *   0 (constant from i = slowLength - 1). Price delta
 *   = 0 (flat), AO delta = 0 (flat). regime `none`
 *   throughout. 0 crosses. Verified across K in {0, 1,
 *   50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`:
 *   HL2 = i. SMA(HL2, 5)[i] = i - 2 (mean of i-4..i),
 *   SMA(HL2, 34)[i] = i - 16.5 (mean of i-33..i).
 *   AO[i] = (i - 2) - (i - 16.5) = 14.5 (constant).
 *   Price delta = +1 (priceUp). AO delta = 0 (flat).
 *   regime `none`. 0 crosses.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`:
 *   HL2 = -i. AO[i] = -14.5 (constant mirror). regime
 *   `none`. 0 crosses.
 * - **QUADRATIC UP** `high = i*i + 1`, `low = i*i -
 *   1`: HL2 = i*i. The 5-bar SMA of i^2 grows faster
 *   than the 34-bar SMA of i^2 (smaller window
 *   captures more recent acceleration). AO rises
 *   monotonically. priceUp + aoUp -> aligned-bullish.
 *   0 crosses.
 */

export interface ChartLineAwesomeZeroDivergencePoint {
  x: number;
  high: number;
  low: number;
}

export type ChartLineAwesomeZeroDivergenceRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineAwesomeZeroDivergenceBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineAwesomeZeroDivergenceSeriesId = 'price' | 'ao';

export type ChartLineAwesomeZeroDivergenceCrossKind = 'bullish' | 'bearish';

export interface ChartLineAwesomeZeroDivergenceCross {
  index: number;
  x: number;
  kind: ChartLineAwesomeZeroDivergenceCrossKind;
  bias: ChartLineAwesomeZeroDivergenceBias;
}

export interface ChartLineAwesomeZeroDivergenceSample {
  index: number;
  x: number;
  hl2: number;
  ao: number | null;
  regime: ChartLineAwesomeZeroDivergenceRegime;
  bias: ChartLineAwesomeZeroDivergenceBias;
}

export interface ChartLineAwesomeZeroDivergenceRun {
  series: ChartLineAwesomeZeroDivergencePoint[];
  fastLength: number;
  slowLength: number;
  hl2Values: number[];
  aoValues: Array<number | null>;
  regimes: ChartLineAwesomeZeroDivergenceRegime[];
  samples: ChartLineAwesomeZeroDivergenceSample[];
  crosses: ChartLineAwesomeZeroDivergenceCross[];
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

export interface ChartLineAwesomeZeroDivergenceDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  hl2: number;
}

export interface ChartLineAwesomeZeroDivergenceLayout {
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
  priceDots: ChartLineAwesomeZeroDivergenceDot[];
  aoPath: string;
  zeroLineY: number;
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
    kind: ChartLineAwesomeZeroDivergenceCrossKind;
    bias: ChartLineAwesomeZeroDivergenceBias;
  }>;
  run: ChartLineAwesomeZeroDivergenceRun;
}

export interface ChartLineAwesomeZeroDivergenceProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAwesomeZeroDivergencePoint[];
  fastLength?: number;
  slowLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  aoColor?: string;
  zeroLineColor?: string;
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
  showAo?: boolean;
  showZeroLine?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAwesomeZeroDivergenceSeriesId[];
  defaultHiddenSeries?: ChartLineAwesomeZeroDivergenceSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAwesomeZeroDivergenceSeriesId;
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

export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_WIDTH = 720;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_HEIGHT = 460;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_PADDING = 44;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_FAST_LENGTH = 5;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_SLOW_LENGTH = 34;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_AO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_ZERO_LINE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineAwesomeZeroDivergenceFinitePoints(
  data: readonly ChartLineAwesomeZeroDivergencePoint[] | null | undefined,
): ChartLineAwesomeZeroDivergencePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAwesomeZeroDivergencePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      point.high >= point.low
    ) {
      out.push({ x: point.x, high: point.high, low: point.low });
    }
  }
  return out;
}

export function normalizeLineAwesomeZeroDivergenceLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

function sma(
  values: readonly number[],
  length: number,
): Array<number | null> {
  const n = values.length;
  const out: Array<number | null> = new Array(n).fill(null);
  for (let i = length - 1; i < n; i += 1) {
    let sum = 0;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = values[j]!;
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    out[i] = winMin === winMax ? winMin : posZero(sum / length);
  }
  return out;
}

export function computeLineAwesomeZeroDivergence(
  series: readonly ChartLineAwesomeZeroDivergencePoint[] | null | undefined,
  options: { fastLength?: number; slowLength?: number } = {},
): { hl2: number[]; ao: Array<number | null> } {
  const cleaned = getLineAwesomeZeroDivergenceFinitePoints(series);
  if (cleaned.length === 0) return { hl2: [], ao: [] };
  const fastLength = normalizeLineAwesomeZeroDivergenceLength(
    options.fastLength,
    DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_FAST_LENGTH,
  );
  const slowLength = normalizeLineAwesomeZeroDivergenceLength(
    options.slowLength,
    DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_SLOW_LENGTH,
  );
  const hl2 = cleaned.map((p) => posZero((p.high + p.low) / 2));
  const fast = sma(hl2, fastLength);
  const slow = sma(hl2, slowLength);
  const n = hl2.length;
  const ao: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const f = fast[i];
    const s = slow[i];
    if (f == null || s == null) continue;
    ao[i] = posZero(f - s);
  }
  return { hl2, ao };
}

export function classifyLineAwesomeZeroDivergenceRegime(
  curPrice: number | null,
  prevPrice: number | null,
  curAo: number | null,
  prevAo: number | null,
): ChartLineAwesomeZeroDivergenceRegime {
  if (
    curPrice == null ||
    prevPrice == null ||
    curAo == null ||
    prevAo == null
  )
    return 'none';
  const priceUp = curPrice > prevPrice;
  const priceDown = curPrice < prevPrice;
  const aoUp = curAo > prevAo;
  const aoDown = curAo < prevAo;
  if (priceUp && aoUp) return 'aligned-bullish';
  if (priceDown && aoDown) return 'aligned-bearish';
  if (priceDown && aoUp) return 'divergent-bullish';
  if (priceUp && aoDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineAwesomeZeroDivergenceBias(
  cur: number | null,
  prev: number | null,
): ChartLineAwesomeZeroDivergenceBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineAwesomeZeroDivergenceCrosses(
  series: readonly ChartLineAwesomeZeroDivergencePoint[],
  regimes: readonly ChartLineAwesomeZeroDivergenceRegime[],
  aoValues: readonly (number | null)[],
): ChartLineAwesomeZeroDivergenceCross[] {
  const out: ChartLineAwesomeZeroDivergenceCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevAo = aoValues[i - 1];
    const curAo = aoValues[i];
    const bias = classifyLineAwesomeZeroDivergenceBias(
      curAo ?? null,
      prevAo ?? null,
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

export function runLineAwesomeZeroDivergence(
  data: ChartLineAwesomeZeroDivergencePoint[],
  options: { fastLength?: number; slowLength?: number } = {},
): ChartLineAwesomeZeroDivergenceRun {
  const cleaned = getLineAwesomeZeroDivergenceFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineAwesomeZeroDivergenceLength(
    options.fastLength,
    DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_FAST_LENGTH,
  );
  const slowLength = normalizeLineAwesomeZeroDivergenceLength(
    options.slowLength,
    DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_SLOW_LENGTH,
  );

  const { hl2: hl2Values, ao: aoValues } = computeLineAwesomeZeroDivergence(
    series,
    { fastLength, slowLength },
  );

  const regimes: ChartLineAwesomeZeroDivergenceRegime[] = series.map((_, i) => {
    if (i === 0) return 'none';
    return classifyLineAwesomeZeroDivergenceRegime(
      hl2Values[i] ?? null,
      hl2Values[i - 1] ?? null,
      aoValues[i] ?? null,
      aoValues[i - 1] ?? null,
    );
  });

  const samples: ChartLineAwesomeZeroDivergenceSample[] = series.map(
    (p, i) => {
      const ao = aoValues[i] ?? null;
      const prevAo = i > 0 ? (aoValues[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        hl2: hl2Values[i] ?? 0,
        ao,
        regime: regimes[i] ?? 'none',
        bias: classifyLineAwesomeZeroDivergenceBias(ao, prevAo),
      };
    },
  );

  const crosses = detectLineAwesomeZeroDivergenceCrosses(
    series,
    regimes,
    aoValues,
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

  const warmup = slowLength + 1;
  const ok = series.length > warmup;

  return {
    series,
    fastLength,
    slowLength,
    hl2Values,
    aoValues,
    regimes,
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

export interface ComputeLineAwesomeZeroDivergenceLayoutOptions {
  data: ChartLineAwesomeZeroDivergencePoint[];
  fastLength?: number;
  slowLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAwesomeZeroDivergenceLayout(
  opts: ComputeLineAwesomeZeroDivergenceLayoutOptions,
): ChartLineAwesomeZeroDivergenceLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_PANEL_GAP;

  const run = runLineAwesomeZeroDivergence(opts.data, {
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
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
      aoPath: '',
      zeroLineY: oscBottom,
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
      crossMarkers: [],
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.hl2 < priceMin) priceMin = s.hl2;
    if (s.hl2 > priceMax) priceMax = s.hl2;
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
    if (s.ao != null) {
      if (s.ao < oscMin) oscMin = s.ao;
      if (s.ao > oscMax) oscMax = s.ao;
    }
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = -1;
    oscMax = 1;
  }
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }
  // Ensure zero is visible in the AO panel
  if (oscMin > 0) oscMin = 0;
  if (oscMax < 0) oscMax = 0;

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

  const zeroLineY = syOsc(0);

  let pricePath = '';
  const priceDots: ChartLineAwesomeZeroDivergenceDot[] = [];
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = syPrice(s.hl2);
    pricePath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    priceDots.push({
      index: s.index,
      x: s.x,
      cx,
      cy,
      hl2: s.hl2,
    });
  }

  let aoPath = '';
  let firstAo = true;
  for (const s of run.samples) {
    if (s.ao == null) {
      firstAo = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.ao);
    aoPath += `${firstAo ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstAo = false;
  }
  aoPath = aoPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.hl2) : priceBottom;
    const aAt = run.aoValues[c.index];
    const cyOsc = aAt != null ? syOsc(aAt) : oscBottom;
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
    aoPath,
    zeroLineY,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineAwesomeZeroDivergenceChart(
  data: ChartLineAwesomeZeroDivergencePoint[],
  options: { fastLength?: number; slowLength?: number } = {},
): string {
  const cleaned = getLineAwesomeZeroDivergenceFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fastLength = normalizeLineAwesomeZeroDivergenceLength(
    options.fastLength,
    DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_FAST_LENGTH,
  );
  const slowLength = normalizeLineAwesomeZeroDivergenceLength(
    options.slowLength,
    DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_SLOW_LENGTH,
  );
  return (
    `Awesome Oscillator zero line divergence-cross chart ` +
    `over ${cleaned.length} bars (fast ${fastLength}, slow ` +
    `${slowLength}). Top panel renders the HL2 median ` +
    `price with bullish (price down while AO up, bullish ` +
    `momentum reversal warning) / bearish (price up while ` +
    `AO down, bearish momentum reversal warning) chevron ` +
    `overlays at every divergence-entry event; bottom ` +
    `panel renders Bill Williams' Awesome Oscillator ` +
    `(SMA(HL2, fast) - SMA(HL2, slow)) with the zero ` +
    `reference line, markers coloured by AO slope bias ` +
    `(rising / falling / flat) at the divergence-entry ` +
    `bar, flagging price versus AO direction disagreement ` +
    `events for momentum reversal warning.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineAwesomeZeroDivergenceCrossKind,
  bias: ChartLineAwesomeZeroDivergenceBias,
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

export const ChartLineAwesomeZeroDivergence = forwardRef<
  HTMLDivElement,
  ChartLineAwesomeZeroDivergenceProps
>(function ChartLineAwesomeZeroDivergence(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_SLOW_LENGTH,
    width = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_WIDTH,
    height = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_HEIGHT,
    padding = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_PADDING,
    panelGap = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_PRICE_COLOR,
    aoColor = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_AO_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_ZERO_LINE_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAo = true,
    showZeroLine = true,
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
    () => getLineAwesomeZeroDivergenceFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAwesomeZeroDivergenceLayout({
        data: cleaned,
        fastLength,
        slowLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, fastLength, slowLength, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineAwesomeZeroDivergenceSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineAwesomeZeroDivergenceSeriesId,
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
    seriesId: ChartLineAwesomeZeroDivergenceSeriesId,
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
        data-section="chart-line-awesome-zero-divergence-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAwesomeZeroDivergenceChart(cleaned, {
      fastLength,
      slowLength,
    });

  const showPrice = !hidden.has('price');
  const showAoLine = !hidden.has('ao') && showAo;

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
      aria-label={
        ariaLabel ?? 'Awesome Oscillator zero line divergence-cross chart'
      }
      aria-describedby={descId}
      data-section="chart-line-awesome-zero-divergence"
      data-fast-length={fastLength}
      data-slow-length={slowLength}
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
        data-section="chart-line-awesome-zero-divergence-title"
      >
        {ariaLabel ?? 'Awesome Oscillator zero line divergence-cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-awesome-zero-divergence-aria-desc"
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
        data-section="chart-line-awesome-zero-divergence-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-awesome-zero-divergence-grid">
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
                  data-section="chart-line-awesome-zero-divergence-grid-line-price"
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
                  data-section="chart-line-awesome-zero-divergence-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-awesome-zero-divergence-axes">
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
                  data-section="chart-line-awesome-zero-divergence-tick-price"
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
                  data-section="chart-line-awesome-zero-divergence-tick-osc"
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
            data-section="chart-line-awesome-zero-divergence-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-awesome-zero-divergence-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-awesome-zero-divergence-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroLineY}
            x2={layout.innerRight}
            y2={layout.zeroLineY}
            stroke={zeroLineColor}
            strokeDasharray="4 3"
            data-section="chart-line-awesome-zero-divergence-zero-line"
          />
        ) : null}

        {showAoLine ? (
          <path
            d={layout.aoPath}
            stroke={aoColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-awesome-zero-divergence-ao-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-awesome-zero-divergence-crosses"
            role="group"
            aria-label="AO divergence trigger markers"
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
                aria-label={`${m.kind} AO divergence at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-awesome-zero-divergence-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-awesome-zero-divergence-overlay-crosses"
            role="group"
            aria-label="overlay AO divergence trigger markers"
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
                data-section={`chart-line-awesome-zero-divergence-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-awesome-zero-divergence-hover-targets">
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
                data-section="chart-line-awesome-zero-divergence-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-awesome-zero-divergence-tooltip"
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
                  data-section="chart-line-awesome-zero-divergence-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-awesome-zero-divergence-tooltip-hl2"
                >
                  HL2 {formatPrice(tooltipSample.hl2)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-awesome-zero-divergence-tooltip-ao"
                >
                  AO{' '}
                  {tooltipSample.ao == null
                    ? '--'
                    : formatOsc(tooltipSample.ao)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-awesome-zero-divergence-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-awesome-zero-divergence-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-awesome-zero-divergence-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-awesome-zero-divergence-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-awesome-zero-divergence-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-awesome-zero-divergence-tooltip-biases"
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
          data-section="chart-line-awesome-zero-divergence-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          fast {fastLength} | slow {slowLength} | divergences{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-awesome-zero-divergence-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              { id: 'price' as const, color: priceColor, label: 'HL2' },
              { id: 'ao' as const, color: aoColor, label: 'AO' },
            ] satisfies Array<{
              id: ChartLineAwesomeZeroDivergenceSeriesId;
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

ChartLineAwesomeZeroDivergence.displayName = 'ChartLineAwesomeZeroDivergence';
