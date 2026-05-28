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
 * ChartLineCciOversoldDivergence -- pure-SVG dual-panel
 * chart with the close in the top panel and Donald
 * Lambert's Commodity Channel Index (CCI) in the bottom
 * panel, marking bullish (price down while CCI up at
 * oversold levels -- **bottom reversal warning**;
 * downward exhaustion while CCI recovers from a
 * depressed extreme) / bearish (price up while CCI down
 * at oversold levels -- contrarian exhaustion-rally
 * warning, less common) price-vs-CCI direction
 * disagreement (divergence) trigger events with bias
 * coloring derived from the CCI slope at the
 * divergence-entry bar. **Crosses are gated to the
 * oversold zone**: only fire when CCI <=
 * oversoldLevel (default -100).
 *
 *   TP[i]  = (high[i] + low[i] + close[i]) / 3
 *   SMA[i] = mean(TP[i-period+1..i])
 *   MAD[i] = mean(|TP[j] - SMA[i]| for j in window)
 *   CCI[i] = (TP[i] - SMA[i]) / (0.015 * MAD[i])
 *
 *   (returns null when MAD === 0 to avoid div-by-zero)
 *
 *   priceUp     = close[i] > close[i-1]
 *   priceDown   = close[i] < close[i-1]
 *   cciUp       = CCI[i]   > CCI[i-1]
 *   cciDown     = CCI[i]   < CCI[i-1]
 *
 *   regime :
 *     'aligned-bullish'   when priceUp   && cciUp
 *     'aligned-bearish'   when priceDown && cciDown
 *     'divergent-bullish' when priceDown && cciUp
 *                         (PRIMARY: bottom reversal
 *                          warning when CCI is in
 *                          oversold zone)
 *     'divergent-bearish' when priceUp   && cciDown
 *     'none'              otherwise (null / any flat)
 *
 *   bullish cross (at oversold) :
 *     prev regime !== 'divergent-bullish' &&
 *     cur regime === 'divergent-bullish' &&
 *     cur CCI <= oversoldLevel
 *   bearish cross (at oversold) :
 *     prev regime !== 'divergent-bearish' &&
 *     cur regime === 'divergent-bearish' &&
 *     cur CCI <= oversoldLevel
 *
 *   bias : CCI[i] vs CCI[i-1] -> up/down/flat/none
 *
 * Defaults: `period = 20`, `oversoldLevel = -100` --
 * canonical Lambert (1980) CCI tuning + classical
 * oversold threshold. Divergences at oversold levels are
 * the strongest bottom reversal warning signals -- the
 * underlying momentum has reversed (turning up) while
 * the price still shows depressed CCI, indicating that
 * the recent decline is losing steam at a stretched
 * level. Same signal mechanic as the broader divergence-
 * cross family, but gated to the oversold zone to filter
 * out low-conviction divergences in normal-range
 * trading. Mirror of chart-line-cci-overbought-divergence
 * v1.11.1092.
 *
 * Sibling family:
 *   - chart-line-cci-divergence-cross -- standard CCI
 *     divergence-cross without zone gating
 *   - chart-line-cci-overbought-divergence v1.11.1092 --
 *     mirror of this primitive, gated to overbought zone
 *     for top reversal warning
 *   - chart-line-cci-overbought-cross / cci-oversold-cross
 *     -- CCI vs threshold (level cross, not divergence)
 *   - chart-line-cci-mid-cross / cci-mid-cross-sig --
 *     CCI vs zero centerline
 *   - chart-line-cci-cross-sig -- CCI vs signal SMA
 *   - this primitive: CCI divergence gated to oversold
 *     zone (bottom reversal warning specialisation)
 *
 * Distinct from chart-line-cci-divergence-cross (the
 * ungated sibling): this primitive filters crosses to
 * only those that occur while CCI is in the oversold
 * zone. Fewer false positives, narrower coverage --
 * specifically targets the classical "bottom reversal
 * warning" use case where divergence at depressed levels
 * is the strongest reversal indicator.
 *
 * Warmup is `period = 20` for the first CCI value. Cross
 * detection needs the previous bar's regime, so the
 * first potential cross lands at i = period + 1 = 21.
 *
 * Bit-exact anchors (HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`,
 *   `close = K`: TP = K (constant). SMA = K. MAD = 0
 *   for every window. Divide-by-zero guard returns
 *   CCI = null. regime `none` throughout. 0 crosses.
 *   Verified across K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`,
 *   `close = i`: CCI = **+126.667** (constant; see
 *   period-invariant identity in the overbought-
 *   divergence sibling). CCI is in the OVERBOUGHT
 *   region (well above zero), NOT in the oversold zone.
 *   The oversold-zone gate filters out any divergent
 *   crosses that would otherwise fire. 0 crosses.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: CCI = **-126.667** (constant mirror).
 *   priceDown, cciFlat. CCI well below oversoldLevel
 *   (in oversold zone) -- the gate passes -- but the
 *   regime is `none` because cciFlat means neither
 *   cciUp nor cciDown. 0 crosses.
 */

export interface ChartLineCciOversoldDivergencePoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineCciOversoldDivergenceRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineCciOversoldDivergenceBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineCciOversoldDivergenceSeriesId = 'price' | 'cci';

export type ChartLineCciOversoldDivergenceCrossKind = 'bullish' | 'bearish';

export interface ChartLineCciOversoldDivergenceCross {
  index: number;
  x: number;
  kind: ChartLineCciOversoldDivergenceCrossKind;
  bias: ChartLineCciOversoldDivergenceBias;
}

export interface ChartLineCciOversoldDivergenceSample {
  index: number;
  x: number;
  close: number;
  cci: number | null;
  regime: ChartLineCciOversoldDivergenceRegime;
  bias: ChartLineCciOversoldDivergenceBias;
  oversold: boolean;
}

export interface ChartLineCciOversoldDivergenceRun {
  series: ChartLineCciOversoldDivergencePoint[];
  period: number;
  oversoldLevel: number;
  cciValues: Array<number | null>;
  regimes: ChartLineCciOversoldDivergenceRegime[];
  samples: ChartLineCciOversoldDivergenceSample[];
  crosses: ChartLineCciOversoldDivergenceCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  oversoldCount: number;
  upBiasCount: number;
  downBiasCount: number;
  flatBiasCount: number;
  ok: boolean;
}

export interface ChartLineCciOversoldDivergenceDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCciOversoldDivergenceLayout {
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
  priceDots: ChartLineCciOversoldDivergenceDot[];
  cciPath: string;
  overboughtLineY: number;
  oversoldLineY: number;
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
    kind: ChartLineCciOversoldDivergenceCrossKind;
    bias: ChartLineCciOversoldDivergenceBias;
  }>;
  run: ChartLineCciOversoldDivergenceRun;
}

export interface ChartLineCciOversoldDivergenceProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCciOversoldDivergencePoint[];
  period?: number;
  oversoldLevel?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  cciColor?: string;
  overboughtLineColor?: string;
  oversoldLineColor?: string;
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
  showCci?: boolean;
  showOverboughtLine?: boolean;
  showOversoldLine?: boolean;
  showZeroLine?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCciOversoldDivergenceSeriesId[];
  defaultHiddenSeries?: ChartLineCciOversoldDivergenceSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCciOversoldDivergenceSeriesId;
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

export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_WIDTH = 720;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PADDING = 44;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PERIOD = 20;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_OVERSOLD_LEVEL = -100;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_CCI_COLOR = '#a855f7';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_OVERBOUGHT_LINE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_OVERSOLD_LINE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_ZERO_LINE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineCciOversoldDivergenceFinitePoints(
  data: readonly ChartLineCciOversoldDivergencePoint[] | null | undefined,
): ChartLineCciOversoldDivergencePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCciOversoldDivergencePoint[] = [];
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

export function normalizeLineCciOversoldDivergenceLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineCciOversoldDivergenceLevel(
  level: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(level)) return level;
  return fallback;
}

export function computeLineCciOversoldDivergence(
  series: readonly ChartLineCciOversoldDivergencePoint[] | null | undefined,
  options: { period?: number } = {},
): Array<number | null> {
  const cleaned = getLineCciOversoldDivergenceFinitePoints(series);
  if (cleaned.length === 0) return [];
  const period = normalizeLineCciOversoldDivergenceLength(
    options.period,
    DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PERIOD,
  );
  const n = cleaned.length;
  const tp: number[] = cleaned.map(
    (p) => (p.high + p.low + p.close) / 3,
  );
  const cci: Array<number | null> = new Array(n).fill(null);
  for (let i = period - 1; i < n; i += 1) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j += 1) sum += tp[j]!;
    const sma = sum / period;
    let madSum = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      madSum += Math.abs(tp[j]! - sma);
    }
    const mad = madSum / period;
    if (mad === 0) continue;
    cci[i] = posZero((tp[i]! - sma) / (0.015 * mad));
  }
  return cci;
}

export function classifyLineCciOversoldDivergenceRegime(
  curClose: number | null,
  prevClose: number | null,
  curCci: number | null,
  prevCci: number | null,
): ChartLineCciOversoldDivergenceRegime {
  if (
    curClose == null ||
    prevClose == null ||
    curCci == null ||
    prevCci == null
  )
    return 'none';
  const priceUp = curClose > prevClose;
  const priceDown = curClose < prevClose;
  const cciUp = curCci > prevCci;
  const cciDown = curCci < prevCci;
  if (priceUp && cciUp) return 'aligned-bullish';
  if (priceDown && cciDown) return 'aligned-bearish';
  if (priceDown && cciUp) return 'divergent-bullish';
  if (priceUp && cciDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineCciOversoldDivergenceBias(
  cur: number | null,
  prev: number | null,
): ChartLineCciOversoldDivergenceBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineCciOversoldDivergenceCrosses(
  series: readonly ChartLineCciOversoldDivergencePoint[],
  regimes: readonly ChartLineCciOversoldDivergenceRegime[],
  cciValues: readonly (number | null)[],
  oversoldLevel: number,
): ChartLineCciOversoldDivergenceCross[] {
  const out: ChartLineCciOversoldDivergenceCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevCci = cciValues[i - 1];
    const curCci = cciValues[i];
    if (curCci == null) continue;
    // Oversold-zone gate (current bar must be at/below level).
    if (curCci > oversoldLevel) continue;
    const bias = classifyLineCciOversoldDivergenceBias(
      curCci ?? null,
      prevCci ?? null,
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

export function runLineCciOversoldDivergence(
  data: ChartLineCciOversoldDivergencePoint[],
  options: { period?: number; oversoldLevel?: number } = {},
): ChartLineCciOversoldDivergenceRun {
  const cleaned = getLineCciOversoldDivergenceFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineCciOversoldDivergenceLength(
    options.period,
    DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PERIOD,
  );
  const oversoldLevel = normalizeLineCciOversoldDivergenceLevel(
    options.oversoldLevel,
    DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_OVERSOLD_LEVEL,
  );

  const cciValues = computeLineCciOversoldDivergence(series, { period });

  const regimes: ChartLineCciOversoldDivergenceRegime[] = series.map(
    (_, i) => {
      if (i === 0) return 'none';
      return classifyLineCciOversoldDivergenceRegime(
        series[i]!.close,
        series[i - 1]!.close,
        cciValues[i] ?? null,
        cciValues[i - 1] ?? null,
      );
    },
  );

  const samples: ChartLineCciOversoldDivergenceSample[] = series.map(
    (p, i) => {
      const cci = cciValues[i] ?? null;
      const prevCci = i > 0 ? (cciValues[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        cci,
        regime: regimes[i] ?? 'none',
        bias: classifyLineCciOversoldDivergenceBias(cci, prevCci),
        oversold: cci != null && cci <= oversoldLevel,
      };
    },
  );

  const crosses = detectLineCciOversoldDivergenceCrosses(
    series,
    regimes,
    cciValues,
    oversoldLevel,
  );

  let alignedBullishCount = 0;
  let alignedBearishCount = 0;
  let divergentBullishCount = 0;
  let divergentBearishCount = 0;
  let noneCount = 0;
  let upBiasCount = 0;
  let downBiasCount = 0;
  let flatBiasCount = 0;
  let oversoldCount = 0;
  for (const s of samples) {
    if (s.regime === 'aligned-bullish') alignedBullishCount += 1;
    else if (s.regime === 'aligned-bearish') alignedBearishCount += 1;
    else if (s.regime === 'divergent-bullish') divergentBullishCount += 1;
    else if (s.regime === 'divergent-bearish') divergentBearishCount += 1;
    else noneCount += 1;
    if (s.bias === 'up') upBiasCount += 1;
    else if (s.bias === 'down') downBiasCount += 1;
    else if (s.bias === 'flat') flatBiasCount += 1;
    if (s.oversold) oversoldCount += 1;
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
    oversoldLevel,
    cciValues,
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
    oversoldCount,
    upBiasCount,
    downBiasCount,
    flatBiasCount,
    ok,
  };
}

export interface ComputeLineCciOversoldDivergenceLayoutOptions {
  data: ChartLineCciOversoldDivergencePoint[];
  period?: number;
  oversoldLevel?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineCciOversoldDivergenceLayout(
  opts: ComputeLineCciOversoldDivergenceLayoutOptions,
): ChartLineCciOversoldDivergenceLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PANEL_GAP;

  const run = runLineCciOversoldDivergence(opts.data, {
    period: opts.period ?? undefined,
    oversoldLevel: opts.oversoldLevel ?? undefined,
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
      cciPath: '',
      overboughtLineY: oscTop,
      oversoldLineY: oscBottom,
      zeroLineY: (oscTop + oscBottom) / 2,
      priceMin: 0,
      priceMax: 0,
      oscMin: -200,
      oscMax: 200,
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

  // CCI is conventionally bounded to roughly [-200, +200] for
  // chart purposes; auto-scale slightly to include any extreme.
  // oversoldLevel is negative (default -100), so derive bounds
  // from its absolute value to keep the panel symmetric.
  const absLevel = Math.abs(run.oversoldLevel);
  let oscMin = -absLevel * 2;
  let oscMax = absLevel * 2;
  for (const s of run.samples) {
    if (s.cci != null) {
      if (s.cci < oscMin) oscMin = s.cci;
      if (s.cci > oscMax) oscMax = s.cci;
    }
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

  const oversoldLineY = syOsc(run.oversoldLevel);
  const overboughtLineY = syOsc(-run.oversoldLevel);
  const zeroLineY = syOsc(0);

  let pricePath = '';
  const priceDots: ChartLineCciOversoldDivergenceDot[] = [];
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

  let cciPath = '';
  let firstCci = true;
  for (const s of run.samples) {
    if (s.cci == null) {
      firstCci = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.cci);
    cciPath += `${firstCci ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstCci = false;
  }
  cciPath = cciPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cciAt = run.cciValues[c.index];
    const cyOsc = cciAt != null ? syOsc(cciAt) : oscBottom;
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
    cciPath,
    overboughtLineY,
    oversoldLineY,
    zeroLineY,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineCciOversoldDivergenceChart(
  data: ChartLineCciOversoldDivergencePoint[],
  options: { period?: number; oversoldLevel?: number } = {},
): string {
  const cleaned = getLineCciOversoldDivergenceFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineCciOversoldDivergenceLength(
    options.period,
    DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PERIOD,
  );
  const oversoldLevel = normalizeLineCciOversoldDivergenceLevel(
    options.oversoldLevel,
    DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_OVERSOLD_LEVEL,
  );
  return (
    `Commodity Channel Index oversold-zone divergence ` +
    `chart over ${cleaned.length} bars (period ${period}, ` +
    `oversold ${oversoldLevel}). Top panel renders the ` +
    `close with bullish (price down while CCI up at ` +
    `oversold levels, bottom reversal warning) / bearish ` +
    `(price up while CCI down at oversold levels, ` +
    `contrarian rally exhaustion) chevron overlays at ` +
    `every divergence-entry event while CCI is at or ` +
    `below the oversold threshold; bottom panel renders ` +
    `Donald Lambert's (1980) Commodity Channel Index ` +
    `with the overbought / oversold reference lines and ` +
    `zero centerline, markers coloured by CCI slope ` +
    `bias (rising / falling / flat) at the divergence-` +
    `entry bar, flagging price versus CCI direction ` +
    `disagreement at depressed levels for bottom ` +
    `reversal warning.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineCciOversoldDivergenceCrossKind,
  bias: ChartLineCciOversoldDivergenceBias,
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

export const ChartLineCciOversoldDivergence = forwardRef<
  HTMLDivElement,
  ChartLineCciOversoldDivergenceProps
>(function ChartLineCciOversoldDivergence(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PERIOD,
    oversoldLevel = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_OVERSOLD_LEVEL,
    width = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_WIDTH,
    height = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_HEIGHT,
    padding = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PADDING,
    panelGap = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PRICE_COLOR,
    cciColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_CCI_COLOR,
    overboughtLineColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_OVERBOUGHT_LINE_COLOR,
    oversoldLineColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_OVERSOLD_LINE_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_ZERO_LINE_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCci = true,
    showOverboughtLine = true,
    showOversoldLine = true,
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
    () => getLineCciOversoldDivergenceFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineCciOversoldDivergenceLayout({
        data: cleaned,
        period,
        oversoldLevel,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      period,
      oversoldLevel,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineCciOversoldDivergenceSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineCciOversoldDivergenceSeriesId,
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
    seriesId: ChartLineCciOversoldDivergenceSeriesId,
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
        data-section="chart-line-cci-oversold-divergence-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineCciOversoldDivergenceChart(cleaned, {
      period,
      oversoldLevel,
    });

  const showPrice = !hidden.has('price');
  const showCciLine = !hidden.has('cci') && showCci;

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
        ariaLabel ?? 'CCI oversold-zone divergence chart'
      }
      aria-describedby={descId}
      data-section="chart-line-cci-oversold-divergence"
      data-period={period}
      data-oversold-level={oversoldLevel}
      data-total-points={cleaned.length}
      data-aligned-bullish-count={layout.run.alignedBullishCount}
      data-aligned-bearish-count={layout.run.alignedBearishCount}
      data-divergent-bullish-count={layout.run.divergentBullishCount}
      data-divergent-bearish-count={layout.run.divergentBearishCount}
      data-none-count={layout.run.noneCount}
      data-oversold-count={layout.run.oversoldCount}
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
        data-section="chart-line-cci-oversold-divergence-title"
      >
        {ariaLabel ?? 'CCI oversold-zone divergence chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-cci-oversold-divergence-aria-desc"
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
        data-section="chart-line-cci-oversold-divergence-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-cci-oversold-divergence-grid">
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
                  data-section="chart-line-cci-oversold-divergence-grid-line-price"
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
                  data-section="chart-line-cci-oversold-divergence-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-cci-oversold-divergence-axes">
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
                  data-section="chart-line-cci-oversold-divergence-tick-price"
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
                  data-section="chart-line-cci-oversold-divergence-tick-osc"
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
            data-section="chart-line-cci-oversold-divergence-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-cci-oversold-divergence-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-cci-oversold-divergence-price-dot"
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
            data-section="chart-line-cci-oversold-divergence-zero-line"
          />
        ) : null}

        {showOverboughtLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.overboughtLineY}
            x2={layout.innerRight}
            y2={layout.overboughtLineY}
            stroke={overboughtLineColor}
            strokeDasharray="3 2"
            data-section="chart-line-cci-oversold-divergence-overbought-line"
          />
        ) : null}

        {showOversoldLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.oversoldLineY}
            x2={layout.innerRight}
            y2={layout.oversoldLineY}
            stroke={oversoldLineColor}
            strokeDasharray="3 2"
            data-section="chart-line-cci-oversold-divergence-oversold-line"
          />
        ) : null}

        {showCciLine ? (
          <path
            d={layout.cciPath}
            stroke={cciColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-cci-oversold-divergence-cci-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-cci-oversold-divergence-crosses"
            role="group"
            aria-label="CCI oversold-divergence trigger markers"
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
                aria-label={`${m.kind} CCI oversold divergence at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-cci-oversold-divergence-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-cci-oversold-divergence-overlay-crosses"
            role="group"
            aria-label="overlay CCI oversold-divergence trigger markers"
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
                data-section={`chart-line-cci-oversold-divergence-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-cci-oversold-divergence-hover-targets">
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
                data-section="chart-line-cci-oversold-divergence-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-cci-oversold-divergence-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={288}
                  height={160}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-divergence-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-divergence-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-divergence-tooltip-cci"
                >
                  CCI{' '}
                  {tooltipSample.cci == null
                    ? '--'
                    : formatOsc(tooltipSample.cci)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-divergence-tooltip-oversold"
                >
                  oversold {tooltipSample.oversold ? 'yes' : 'no'}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-divergence-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-divergence-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-divergence-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-divergence-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-divergence-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={142}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-divergence-tooltip-oversold-count"
                >
                  bars oversold {layout.run.oversoldCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-cci-oversold-divergence-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | oversold {oversoldLevel} | divergences{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-cci-oversold-divergence-legend"
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
              { id: 'cci' as const, color: cciColor, label: 'CCI' },
            ] satisfies Array<{
              id: ChartLineCciOversoldDivergenceSeriesId;
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

ChartLineCciOversoldDivergence.displayName =
  'ChartLineCciOversoldDivergence';
