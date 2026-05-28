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
 * ChartLineRocDivergenceCross -- pure-SVG dual-panel chart
 * with the close in the top panel and the Rate Of Change
 * (ROC) oscillator in the bottom panel, marking bullish
 * (price down while ROC up -- bullish momentum-percentage
 * reversal warning) / bearish (price up while ROC down --
 * bearish momentum-percentage reversal warning)
 * price-vs-ROC direction disagreement (divergence)
 * trigger events with bias coloring derived from the ROC
 * slope at the divergence-entry bar.
 *
 *   ROC[i] = (close[i] - close[i - period]) /
 *            close[i - period] * 100
 *
 *   (returns null when close[i - period] === 0 to avoid
 *   division by zero)
 *
 *   priceUp     = close[i] > close[i-1]
 *   priceDown   = close[i] < close[i-1]
 *   rocUp       = ROC[i]   > ROC[i-1]
 *   rocDown     = ROC[i]   < ROC[i-1]
 *
 *   regime :
 *     'aligned-bullish'   when priceUp   && rocUp
 *                         (price + ROC confirm uptrend)
 *     'aligned-bearish'   when priceDown && rocDown
 *                         (price + ROC confirm downtrend)
 *     'divergent-bullish' when priceDown && rocUp
 *                         (price falling but ROC
 *                          recovering -- bullish reversal
 *                          warning)
 *     'divergent-bearish' when priceUp   && rocDown
 *                         (price rising but ROC decaying
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
 *   bias : ROC[i] vs ROC[i-1] -> up / down / flat / none
 *
 * Defaults: `period = 12`. ROC is the percentage version
 * of the Momentum oscillator: rather than the absolute
 * price change, ROC measures the percentage change over
 * the lookback period. This normalisation makes ROC
 * comparable across instruments at different price levels
 * but ALSO breaks the bit-exact linear-input property
 * that Momentum has -- a price line that climbs by a
 * fixed dollar amount each bar produces a Momentum value
 * that is constant, but a ROC value that DECAYS (since
 * the same dollar increment is a smaller percentage of
 * an ever-larger base).
 *
 * Sibling family (divergence-cross family):
 *   - chart-line-atr-divergence-cross v1.11.1046 --
 *     price vs ATR (volatility-direction divergence)
 *   - chart-line-keltner-divergence-cross v1.11.1054 --
 *     price vs Keltner mid
 *   - chart-line-bollinger-divergence-cross v1.11.1055 --
 *     price vs Bollinger mid
 *   - chart-line-donchian-divergence-cross v1.11.1059 --
 *     price vs Donchian mid
 *   - chart-line-momentum-divergence-cross v1.11.1088 --
 *     price vs raw Momentum oscillator
 *   - this primitive: price vs Rate Of Change percentage
 *     oscillator (the momentum-percentage reversal
 *     warning)
 *
 * Distinct from the sibling momentum-divergence-cross
 * v1.11.1088: same divergence detector, different
 * underlying oscillator. ROC normalises by the base price
 * so it is more reactive on instruments at different
 * price levels and more sensitive to *relative* (not
 * absolute) momentum changes. The bit-exact anchors
 * shift accordingly -- LINEAR UP gives divergent-bearish
 * under ROC (decelerating percentage growth) where
 * Momentum gives `none` (constant momentum, flat).
 *
 * Warmup is `period = 12` for the default tuning: first
 * ROC value at i = period (ROC[period] = (close[period]
 * - close[0]) / close[0] * 100). Cross detection needs
 * the previous bar's regime, so the first potential
 * cross lands at i = period + 1 = 13.
 *
 * Bit-exact anchors (single-close input):
 *
 * - **CONST** `close = K` (K != 0): ROC[i] = (K - K)/K
 *   * 100 = 0 (constant from i = period). Price delta =
 *   0 (flat), ROC delta = 0 (flat). regime `none`
 *   throughout. 0 crosses. Verified across K in {1, 50,
 *   200, 1234}.
 * - **CONST K = 0**: close[i-period] = 0, division by
 *   zero -> ROC = null throughout. regime `none`. 0
 *   crosses.
 * - **LINEAR UP** `close = i + 1` (positive
 *   monotonically increasing): ROC[i] = period * 100 /
 *   (i - period + 1) -- DECAYS as i grows (same dollar
 *   delta but larger base). priceUp = true (constant
 *   +1). rocDown = true (ROC declining). regime
 *   `divergent-bearish` throughout post-warmup. At
 *   least one bearish cross fires when regime first
 *   enters divergent-bearish.
 * - **LINEAR DOWN** `close = n - i` (positive
 *   monotonically decreasing, n > period): ROC[i] =
 *   -period * 100 / (n - i + period) -- becomes more
 *   negative as i grows (denominator shrinks). priceDown
 *   = true. rocDown = true. regime `aligned-bearish`.
 *   0 crosses (no entry into divergent state).
 * - **DECELERATING DECLINE** `close = K - sqrt(i+1)`
 *   (positive monotonically decreasing at decreasing
 *   rate): price still falls each bar (priceDown) but
 *   ROC magnitude shrinks (rocUp -- ROC rising toward
 *   zero from below). regime `divergent-bullish`. At
 *   least one bullish cross fires.
 */

export interface ChartLineRocDivergenceCrossPoint {
  x: number;
  close: number;
}

export type ChartLineRocDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineRocDivergenceCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineRocDivergenceCrossSeriesId = 'price' | 'roc';

export type ChartLineRocDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineRocDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineRocDivergenceCrossCrossKind;
  bias: ChartLineRocDivergenceCrossBias;
}

export interface ChartLineRocDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  roc: number | null;
  regime: ChartLineRocDivergenceCrossRegime;
  bias: ChartLineRocDivergenceCrossBias;
}

export interface ChartLineRocDivergenceCrossRun {
  series: ChartLineRocDivergenceCrossPoint[];
  period: number;
  rocValues: Array<number | null>;
  regimes: ChartLineRocDivergenceCrossRegime[];
  samples: ChartLineRocDivergenceCrossSample[];
  crosses: ChartLineRocDivergenceCrossCross[];
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

export interface ChartLineRocDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineRocDivergenceCrossLayout {
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
  priceDots: ChartLineRocDivergenceCrossDot[];
  rocPath: string;
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
    kind: ChartLineRocDivergenceCrossCrossKind;
    bias: ChartLineRocDivergenceCrossBias;
  }>;
  run: ChartLineRocDivergenceCrossRun;
}

export interface ChartLineRocDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRocDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  rocColor?: string;
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
  showRoc?: boolean;
  showZeroLine?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRocDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineRocDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRocDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PERIOD = 12;
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_ROC_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_ZERO_LINE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineRocDivergenceCrossFinitePoints(
  data: readonly ChartLineRocDivergenceCrossPoint[] | null | undefined,
): ChartLineRocDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRocDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineRocDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function computeLineRocDivergenceCross(
  series: readonly ChartLineRocDivergenceCrossPoint[] | null | undefined,
  options: { period?: number } = {},
): Array<number | null> {
  const cleaned = getLineRocDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) return [];
  const period = normalizeLineRocDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PERIOD,
  );
  const n = cleaned.length;
  const out: Array<number | null> = new Array(n).fill(null);
  for (let i = period; i < n; i += 1) {
    const base = cleaned[i - period]!.close;
    if (base === 0) continue; // divide-by-zero guard
    out[i] = posZero(((cleaned[i]!.close - base) / base) * 100);
  }
  return out;
}

export function classifyLineRocDivergenceCrossRegime(
  curClose: number | null,
  prevClose: number | null,
  curRoc: number | null,
  prevRoc: number | null,
): ChartLineRocDivergenceCrossRegime {
  if (
    curClose == null ||
    prevClose == null ||
    curRoc == null ||
    prevRoc == null
  )
    return 'none';
  const priceUp = curClose > prevClose;
  const priceDown = curClose < prevClose;
  const rocUp = curRoc > prevRoc;
  const rocDown = curRoc < prevRoc;
  if (priceUp && rocUp) return 'aligned-bullish';
  if (priceDown && rocDown) return 'aligned-bearish';
  if (priceDown && rocUp) return 'divergent-bullish';
  if (priceUp && rocDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineRocDivergenceCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineRocDivergenceCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineRocDivergenceCrossCrosses(
  series: readonly ChartLineRocDivergenceCrossPoint[],
  regimes: readonly ChartLineRocDivergenceCrossRegime[],
  rocValues: readonly (number | null)[],
): ChartLineRocDivergenceCrossCross[] {
  const out: ChartLineRocDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevRoc = rocValues[i - 1];
    const curRoc = rocValues[i];
    const bias = classifyLineRocDivergenceCrossBias(
      curRoc ?? null,
      prevRoc ?? null,
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

export function runLineRocDivergenceCross(
  data: ChartLineRocDivergenceCrossPoint[],
  options: { period?: number } = {},
): ChartLineRocDivergenceCrossRun {
  const cleaned = getLineRocDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineRocDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PERIOD,
  );

  const rocValues = computeLineRocDivergenceCross(series, { period });

  const regimes: ChartLineRocDivergenceCrossRegime[] = series.map((_, i) => {
    if (i === 0) return 'none';
    return classifyLineRocDivergenceCrossRegime(
      series[i]!.close,
      series[i - 1]!.close,
      rocValues[i] ?? null,
      rocValues[i - 1] ?? null,
    );
  });

  const samples: ChartLineRocDivergenceCrossSample[] = series.map((p, i) => {
    const roc = rocValues[i] ?? null;
    const prevRoc = i > 0 ? (rocValues[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      roc,
      regime: regimes[i] ?? 'none',
      bias: classifyLineRocDivergenceCrossBias(roc, prevRoc),
    };
  });

  const crosses = detectLineRocDivergenceCrossCrosses(
    series,
    regimes,
    rocValues,
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

  const warmup = period + 1;
  const ok = series.length > warmup;

  return {
    series,
    period,
    rocValues,
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

export interface ComputeLineRocDivergenceCrossLayoutOptions {
  data: ChartLineRocDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineRocDivergenceCrossLayout(
  opts: ComputeLineRocDivergenceCrossLayoutOptions,
): ChartLineRocDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineRocDivergenceCross(opts.data, {
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
      rocPath: '',
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
    if (s.roc != null) {
      if (s.roc < oscMin) oscMin = s.roc;
      if (s.roc > oscMax) oscMax = s.roc;
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
  // Ensure zero is visible in the ROC panel
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
  const priceDots: ChartLineRocDivergenceCrossDot[] = [];
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

  let rocPath = '';
  let firstRoc = true;
  for (const s of run.samples) {
    if (s.roc == null) {
      firstRoc = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.roc);
    rocPath += `${firstRoc ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstRoc = false;
  }
  rocPath = rocPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const rAt = run.rocValues[c.index];
    const cyOsc = rAt != null ? syOsc(rAt) : oscBottom;
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
    rocPath,
    zeroLineY,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineRocDivergenceCrossChart(
  data: ChartLineRocDivergenceCrossPoint[],
  options: { period?: number } = {},
): string {
  const cleaned = getLineRocDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineRocDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PERIOD,
  );
  return (
    `Rate Of Change oscillator divergence-cross chart over ` +
    `${cleaned.length} bars (period ${period}). Top panel ` +
    `renders the close with bullish (price down while ROC ` +
    `up, bullish momentum percentage reversal warning) / ` +
    `bearish (price up while ROC down, bearish momentum ` +
    `percentage reversal warning) chevron overlays at ` +
    `every divergence-entry event; bottom panel renders ` +
    `the Rate Of Change percentage oscillator ` +
    `((close[i] - close[i-period]) / close[i-period] * ` +
    `100) with the zero reference line, markers coloured ` +
    `by ROC slope bias (rising / falling / flat) at the ` +
    `divergence-entry bar, flagging price versus ROC ` +
    `direction disagreement events for momentum ` +
    `percentage reversal warning.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineRocDivergenceCrossCrossKind,
  bias: ChartLineRocDivergenceCrossBias,
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

export const ChartLineRocDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineRocDivergenceCrossProps
>(function ChartLineRocDivergenceCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PERIOD,
    width = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PRICE_COLOR,
    rocColor = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_ROC_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_ZERO_LINE_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRoc = true,
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
    () => getLineRocDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineRocDivergenceCrossLayout({
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
    ChartLineRocDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineRocDivergenceCrossSeriesId,
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
    seriesId: ChartLineRocDivergenceCrossSeriesId,
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
        data-section="chart-line-roc-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineRocDivergenceCrossChart(cleaned, { period });

  const showPrice = !hidden.has('price');
  const showRocLine = !hidden.has('roc') && showRoc;

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
        ariaLabel ?? 'Rate Of Change oscillator divergence-cross chart'
      }
      aria-describedby={descId}
      data-section="chart-line-roc-divergence-cross"
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
        data-section="chart-line-roc-divergence-cross-title"
      >
        {ariaLabel ?? 'Rate Of Change oscillator divergence-cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-roc-divergence-cross-aria-desc"
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
        data-section="chart-line-roc-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-roc-divergence-cross-grid">
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
                  data-section="chart-line-roc-divergence-cross-grid-line-price"
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
                  data-section="chart-line-roc-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-roc-divergence-cross-axes">
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
                  data-section="chart-line-roc-divergence-cross-tick-price"
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
                  data-section="chart-line-roc-divergence-cross-tick-osc"
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
            data-section="chart-line-roc-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-roc-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-roc-divergence-cross-price-dot"
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
            data-section="chart-line-roc-divergence-cross-zero-line"
          />
        ) : null}

        {showRocLine ? (
          <path
            d={layout.rocPath}
            stroke={rocColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-roc-divergence-cross-roc-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-roc-divergence-cross-crosses"
            role="group"
            aria-label="ROC divergence trigger markers"
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
                aria-label={`${m.kind} ROC divergence at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-roc-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-roc-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay ROC divergence trigger markers"
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
                data-section={`chart-line-roc-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-roc-divergence-cross-hover-targets">
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
                data-section="chart-line-roc-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-roc-divergence-cross-tooltip"
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
                  data-section="chart-line-roc-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-divergence-cross-tooltip-roc"
                >
                  ROC{' '}
                  {tooltipSample.roc == null
                    ? '--'
                    : formatOsc(tooltipSample.roc)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-divergence-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-divergence-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-divergence-cross-tooltip-biases"
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
          data-section="chart-line-roc-divergence-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | divergences {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-roc-divergence-cross-legend"
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
              { id: 'roc' as const, color: rocColor, label: 'ROC' },
            ] satisfies Array<{
              id: ChartLineRocDivergenceCrossSeriesId;
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

ChartLineRocDivergenceCross.displayName = 'ChartLineRocDivergenceCross';
