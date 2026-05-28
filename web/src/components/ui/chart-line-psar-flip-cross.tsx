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
 * ChartLinePsarFlipCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the Wilder Parabolic SAR
 * (Stop And Reverse) in the bottom panel, marking bullish
 * (SAR flips from above price to below; trailing stop
 * reversal from downtrend to uptrend) / bearish (SAR flips
 * from below price to above; trailing stop reversal from
 * uptrend to downtrend) direction-flip crossover trigger
 * events with bias coloring derived from the SAR value
 * jump at the flip bar.
 *
 *   nextSar  = sar + af * (ep - sar)              (Wilder)
 *   clamp    = min(nextSar, values[i-1], values[i-2])
 *              in uptrend (cannot cross into recent lows)
 *            = max(nextSar, values[i-1], values[i-2])
 *              in downtrend (cannot cross into recent highs)
 *   flip     = price pierces nextSar:
 *              - uptrend + v < nextSar -> 'down' flip
 *                (bearish: trailing stop now above price,
 *                 downtrend confirmed)
 *              - downtrend + v > nextSar -> 'up' flip
 *                (bullish: trailing stop now below price,
 *                 uptrend confirmed)
 *              SAR jumps to prior ep, ep := v, af := step.
 *
 *   bullish (PSAR flip up) :
 *     prev trend === 'down' && cur trend === 'up'
 *   bearish (PSAR flip down) :
 *     prev trend === 'up' && cur trend === 'down'
 *
 *   regime   : 'bullish' when trend === 'up'
 *              'bearish' when trend === 'down'
 *              'none'    when trend === null
 *   bias     : sar[i] vs sar[i-1] -> up/down/flat/none.
 *              At a flip, SAR jumps from one side of price
 *              to the other, so bias is typically large in
 *              magnitude and signed by flip direction.
 *
 * Defaults: step = 0.02, maxStep = 0.2 -- canonical Wilder
 * SAR tuning. This primitive is the **stop-and-reverse**
 * core of the Parabolic SAR system: every flip event is the
 * primary trading trigger in Wilder's 1978 design, where
 * the SAR is intended to be used as a literal stop-loss
 * line that flips sides when price pierces it.
 *
 * Sibling family (SAR signal family):
 *   - chart-line-parabolic-sar -- raw SAR with reversal
 *     markers (the source of the SAR computation reused
 *     here)
 *   - chart-line-sar-cross-sig v1.11.1086 -- SAR vs
 *     SMA(SAR) trailing stop confirmation
 *   - chart-line-supertrend-flip-cross v1.11.1078 --
 *     analogous trend-flip detector for the Supertrend
 *     trailing stop
 *   - this primitive: SAR direction flip (the primary
 *     SAR trigger event)
 *
 * Distinct from sibling sar-cross-sig v1.11.1086:
 *   - **cross-sig** compares SAR against its own SMA
 *     (CONFIRMATION: SAR trajectory sustained enough to
 *     pull above/below its smoothed mean)
 *   - **flip-cross** (this primitive) detects the SAR's
 *     own STOP-AND-REVERSE events (PRIMARY TRIGGER: SAR
 *     literally flips sides; the original SAR signal)
 *
 * Warmup is i = 1 (SAR seeds at i = 0 from values[0] with
 * initial trend from the first move). The first potential
 * flip lands at i = 1 if the second value pierces the
 * seed SAR, though in practice flips happen later.
 *
 * Bit-exact anchors (single-value input):
 *
 * - **CONST** `value = K`: First move = 0, initial trend
 *   'up' (>=). SAR = K. Every subsequent bar v = K ===
 *   nextSar (K + step*(K-K) = K). The piercing check is
 *   v < nextSar (strict), so v === nextSar does NOT fire.
 *   trend stays 'up' forever. 0 flips. regime `bullish`.
 *   Verified across K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `value = i`: First move +1, trend 'up'.
 *   SAR forms slow-moving lower envelope clamped by
 *   min(values[i-1], values[i-2]). Price never falls
 *   below SAR (price is monotonically increasing). 0
 *   flips. regime `bullish`.
 * - **LINEAR DOWN** `value = -i`: First move -1, trend
 *   'down'. SAR forms slow-moving upper envelope clamped
 *   by max(values[i-1], values[i-2]). Price never rises
 *   above SAR. 0 flips. regime `bearish`.
 *
 * All three steady-state anchors produce 0 flips because
 * price never pierces SAR. Real flips fire at actual
 * trend reversals in the input series -- the SAR's
 * primary purpose.
 */

export type ChartLinePsarFlipCrossTrend = 'up' | 'down';

export interface ChartLinePsarFlipCrossPoint {
  x: number;
  value: number;
}

export type ChartLinePsarFlipCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLinePsarFlipCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLinePsarFlipCrossSeriesId = 'price' | 'sar';

export type ChartLinePsarFlipCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLinePsarFlipCrossCross {
  index: number;
  x: number;
  kind: ChartLinePsarFlipCrossCrossKind;
  bias: ChartLinePsarFlipCrossBias;
}

export interface ChartLinePsarFlipCrossSample {
  index: number;
  x: number;
  value: number;
  sar: number | null;
  trend: ChartLinePsarFlipCrossTrend | null;
  reversed: boolean;
  regime: ChartLinePsarFlipCrossRegime;
  bias: ChartLinePsarFlipCrossBias;
}

export interface ChartLinePsarFlipCrossRun {
  series: ChartLinePsarFlipCrossPoint[];
  step: number;
  maxStep: number;
  sarValues: Array<number | null>;
  trendValues: Array<ChartLinePsarFlipCrossTrend | null>;
  reversedValues: boolean[];
  samples: ChartLinePsarFlipCrossSample[];
  crosses: ChartLinePsarFlipCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  upBiasCount: number;
  downBiasCount: number;
  flatBiasCount: number;
  reversalCount: number;
  ok: boolean;
}

export interface ChartLinePsarFlipCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLinePsarFlipCrossLayout {
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
  priceDots: ChartLinePsarFlipCrossDot[];
  sarPath: string;
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
    kind: ChartLinePsarFlipCrossCrossKind;
    bias: ChartLinePsarFlipCrossBias;
  }>;
  run: ChartLinePsarFlipCrossRun;
}

export interface ChartLinePsarFlipCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLinePsarFlipCrossPoint[];
  step?: number;
  maxStep?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  sarColor?: string;
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
  showSar?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLinePsarFlipCrossSeriesId[];
  defaultHiddenSeries?: ChartLinePsarFlipCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLinePsarFlipCrossSeriesId;
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

export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_STEP = 0.02;
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_MAX_STEP = 0.2;
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_SAR_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLinePsarFlipCrossFinitePoints(
  data: readonly ChartLinePsarFlipCrossPoint[] | null | undefined,
): ChartLinePsarFlipCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLinePsarFlipCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

export function normalizeLinePsarFlipCrossStep(
  value: unknown,
  fallback: number,
): number {
  return isFiniteNumber(value) && value > 0 ? value : fallback;
}

export interface ComputeLinePsarFlipCrossResult {
  sar: Array<number | null>;
  trends: Array<ChartLinePsarFlipCrossTrend | null>;
  reversed: boolean[];
}

export function computeLinePsarFlipCross(
  series: readonly ChartLinePsarFlipCrossPoint[] | null | undefined,
  options: { step?: number; maxStep?: number } = {},
): ComputeLinePsarFlipCrossResult {
  const cleaned = getLinePsarFlipCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { sar: [], trends: [], reversed: [] };
  }
  const step = normalizeLinePsarFlipCrossStep(
    options.step,
    DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_STEP,
  );
  const maxStep = Math.max(
    step,
    normalizeLinePsarFlipCrossStep(
      options.maxStep,
      DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_MAX_STEP,
    ),
  );

  const n = cleaned.length;
  const sar: Array<number | null> = new Array(n).fill(null);
  const trends: Array<ChartLinePsarFlipCrossTrend | null> = new Array(n).fill(
    null,
  );
  const reversed: boolean[] = new Array(n).fill(false);

  if (n < 2) {
    return { sar, trends, reversed };
  }

  const values = cleaned.map((p) => p.value);
  let trend: ChartLinePsarFlipCrossTrend =
    values[1]! >= values[0]! ? 'up' : 'down';
  let af = step;
  let curSar = values[0]!;
  let ep = values[0]!;

  sar[0] = posZero(curSar);
  trends[0] = trend;

  for (let i = 1; i < n; i += 1) {
    const v = values[i]!;
    let nextSar = curSar + af * (ep - curSar);
    let didReverse = false;

    if (trend === 'up') {
      nextSar = Math.min(nextSar, values[i - 1]!);
      if (i >= 2) nextSar = Math.min(nextSar, values[i - 2]!);
      if (v < nextSar) {
        didReverse = true;
        trend = 'down';
        nextSar = ep;
        ep = v;
        af = step;
      } else if (v > ep) {
        ep = v;
        af = Math.min(af + step, maxStep);
      }
    } else {
      nextSar = Math.max(nextSar, values[i - 1]!);
      if (i >= 2) nextSar = Math.max(nextSar, values[i - 2]!);
      if (v > nextSar) {
        didReverse = true;
        trend = 'up';
        nextSar = ep;
        ep = v;
        af = step;
      } else if (v < ep) {
        ep = v;
        af = Math.min(af + step, maxStep);
      }
    }

    curSar = nextSar;
    sar[i] = posZero(curSar);
    trends[i] = trend;
    reversed[i] = didReverse;
  }

  return { sar, trends, reversed };
}

export function classifyLinePsarFlipCrossRegime(
  trend: ChartLinePsarFlipCrossTrend | null,
): ChartLinePsarFlipCrossRegime {
  if (trend == null) return 'none';
  if (trend === 'up') return 'bullish';
  return 'bearish';
}

export function classifyLinePsarFlipCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLinePsarFlipCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLinePsarFlipCrossCrosses(
  series: readonly ChartLinePsarFlipCrossPoint[],
  trendValues: readonly (ChartLinePsarFlipCrossTrend | null)[],
  sarValues: readonly (number | null)[],
): ChartLinePsarFlipCrossCross[] {
  const out: ChartLinePsarFlipCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pt = trendValues[i - 1];
    const ct = trendValues[i];
    if (pt == null || ct == null) continue;
    const prevSar = sarValues[i - 1] ?? null;
    const curSar = sarValues[i] ?? null;
    const bias = classifyLinePsarFlipCrossBias(curSar, prevSar);
    if (pt === 'down' && ct === 'up') {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pt === 'up' && ct === 'down') {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLinePsarFlipCross(
  data: ChartLinePsarFlipCrossPoint[],
  options: { step?: number; maxStep?: number } = {},
): ChartLinePsarFlipCrossRun {
  const cleaned = getLinePsarFlipCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const step = normalizeLinePsarFlipCrossStep(
    options.step,
    DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_STEP,
  );
  const maxStep = Math.max(
    step,
    normalizeLinePsarFlipCrossStep(
      options.maxStep,
      DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_MAX_STEP,
    ),
  );

  const { sar: sarValues, trends: trendValues, reversed: reversedValues } =
    computeLinePsarFlipCross(series, { step, maxStep });

  const samples: ChartLinePsarFlipCrossSample[] = series.map((p, i) => {
    const sar = sarValues[i] ?? null;
    const prev = i > 0 ? (sarValues[i - 1] ?? null) : null;
    const trend = trendValues[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      sar,
      trend,
      reversed: reversedValues[i] ?? false,
      regime: classifyLinePsarFlipCrossRegime(trend),
      bias: classifyLinePsarFlipCrossBias(sar, prev),
    };
  });

  const crosses = detectLinePsarFlipCrossCrosses(
    series,
    trendValues,
    sarValues,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let noneCount = 0;
  let upBiasCount = 0;
  let downBiasCount = 0;
  let flatBiasCount = 0;
  let reversalCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else noneCount += 1;
    if (s.bias === 'up') upBiasCount += 1;
    else if (s.bias === 'down') downBiasCount += 1;
    else if (s.bias === 'flat') flatBiasCount += 1;
    if (s.reversed) reversalCount += 1;
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const ok = series.length > 1;

  return {
    series,
    step,
    maxStep,
    sarValues,
    trendValues,
    reversedValues,
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
    reversalCount,
    ok,
  };
}

export interface ComputeLinePsarFlipCrossLayoutOptions {
  data: ChartLinePsarFlipCrossPoint[];
  step?: number;
  maxStep?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLinePsarFlipCrossLayout(
  opts: ComputeLinePsarFlipCrossLayoutOptions,
): ChartLinePsarFlipCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_PANEL_GAP;

  const run = runLinePsarFlipCross(opts.data, {
    step: opts.step ?? undefined,
    maxStep: opts.maxStep ?? undefined,
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
      sarPath: '',
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
    if (s.value < priceMin) priceMin = s.value;
    if (s.value > priceMax) priceMax = s.value;
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
    if (s.sar != null) {
      if (s.sar < oscMin) oscMin = s.sar;
      if (s.sar > oscMax) oscMax = s.sar;
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
  const priceDots: ChartLinePsarFlipCrossDot[] = [];
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = syPrice(s.value);
    pricePath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    priceDots.push({
      index: s.index,
      x: s.x,
      cx,
      cy,
      value: s.value,
    });
  }

  let sarPath = '';
  let firstSar = true;
  for (const s of run.samples) {
    if (s.sar == null) {
      firstSar = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.sar);
    sarPath += `${firstSar ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstSar = false;
  }
  sarPath = sarPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.value) : priceBottom;
    const sAt = run.sarValues[c.index];
    const cyOsc = sAt != null ? syOsc(sAt) : oscBottom;
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
    sarPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLinePsarFlipCrossChart(
  data: ChartLinePsarFlipCrossPoint[],
  options: { step?: number } = {},
): string {
  const cleaned = getLinePsarFlipCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const step = normalizeLinePsarFlipCrossStep(
    options.step,
    DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_STEP,
  );
  return (
    `Parabolic SAR direction flip-cross chart over ` +
    `${cleaned.length} bars (step ${step}). Top panel ` +
    `renders the close with bullish (SAR flips from above ` +
    `price to below, trailing stop reversal from downtrend ` +
    `to uptrend) / bearish (SAR flips from below price to ` +
    `above, trailing stop reversal from uptrend to ` +
    `downtrend) chevron overlays at every trailing stop ` +
    `reversal flip event; bottom panel renders J. Welles ` +
    `Wilder Jr's (1978) Parabolic SAR (Stop And Reverse) ` +
    `with markers coloured by SAR value jump bias (rising ` +
    `/ falling / flat) at the flip bar. The SAR's primary ` +
    `trigger signal: every flip event is a stop-and-reverse ` +
    `directive in Wilder's original 1978 design.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLinePsarFlipCrossCrossKind,
  bias: ChartLinePsarFlipCrossBias,
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

export const ChartLinePsarFlipCross = forwardRef<
  HTMLDivElement,
  ChartLinePsarFlipCrossProps
>(function ChartLinePsarFlipCross(props, ref): ReactNode {
  const {
    data,
    step = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_STEP,
    maxStep = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_MAX_STEP,
    width = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_PRICE_COLOR,
    sarColor = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_SAR_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSar = true,
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
    () => getLinePsarFlipCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLinePsarFlipCrossLayout({
        data: cleaned,
        step,
        maxStep,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, step, maxStep, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLinePsarFlipCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLinePsarFlipCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLinePsarFlipCrossSeriesId,
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
        data-section="chart-line-psar-flip-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLinePsarFlipCrossChart(cleaned, { step });

  const showPrice = !hidden.has('price');
  const showSarLine = !hidden.has('sar') && showSar;

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
      aria-label={ariaLabel ?? 'Parabolic SAR direction flip-cross chart'}
      aria-describedby={descId}
      data-section="chart-line-psar-flip-cross"
      data-step={step}
      data-max-step={maxStep}
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
      data-reversal-count={layout.run.reversalCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-psar-flip-cross-title"
      >
        {ariaLabel ?? 'Parabolic SAR direction flip-cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-psar-flip-cross-aria-desc"
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
        data-section="chart-line-psar-flip-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-psar-flip-cross-grid">
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
                  data-section="chart-line-psar-flip-cross-grid-line-price"
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
                  data-section="chart-line-psar-flip-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-psar-flip-cross-axes">
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
                  data-section="chart-line-psar-flip-cross-tick-price"
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
                  data-section="chart-line-psar-flip-cross-tick-osc"
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
            data-section="chart-line-psar-flip-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-psar-flip-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-psar-flip-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSarLine ? (
          <path
            d={layout.sarPath}
            stroke={sarColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-psar-flip-cross-sar-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-psar-flip-cross-crosses"
            role="group"
            aria-label="PSAR flip trigger markers"
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
                aria-label={`${m.kind} PSAR flip at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-psar-flip-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-psar-flip-cross-overlay-crosses"
            role="group"
            aria-label="overlay PSAR flip trigger markers"
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
                data-section={`chart-line-psar-flip-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-psar-flip-cross-hover-targets">
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
                data-section="chart-line-psar-flip-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-psar-flip-cross-tooltip"
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
                  data-section="chart-line-psar-flip-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-flip-cross-tooltip-value"
                >
                  value {formatPrice(tooltipSample.value)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-flip-cross-tooltip-sar"
                >
                  SAR{' '}
                  {tooltipSample.sar == null
                    ? '--'
                    : formatOsc(tooltipSample.sar)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-flip-cross-tooltip-trend"
                >
                  trend {tooltipSample.trend ?? '--'}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-flip-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-flip-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-flip-cross-tooltip-counts"
                >
                  bull {layout.run.bullishCount} | bear{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-flip-cross-tooltip-crosses"
                >
                  bull flips {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-flip-cross-tooltip-reversals"
                >
                  reversals {layout.run.reversalCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-psar-flip-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          step {step} | flips {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-psar-flip-cross-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              { id: 'price' as const, color: priceColor, label: 'value' },
              { id: 'sar' as const, color: sarColor, label: 'SAR' },
            ] satisfies Array<{
              id: ChartLinePsarFlipCrossSeriesId;
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

ChartLinePsarFlipCross.displayName = 'ChartLinePsarFlipCross';
