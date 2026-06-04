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
 * ChartLinePsarDivergenceCross -- pure-SVG dual-panel chart
 * with the close in the top panel and the Wilder Parabolic
 * SAR (Stop And Reverse) line in the bottom panel, marking
 * bullish (price down + PSAR up, potential bottom reversal
 * warning) / bearish (price up + PSAR down, potential top
 * reversal warning) divergence cross events. Divergence
 * variant of the trailing-stop family that flags discrete
 * price-vs-PSAR direction disagreement transitions over a
 * configurable look-back window.
 *
 *   Init    : SAR[0] = low[0], EP = high[0], AF = step, trend = up
 *   Step (uptrend at bar i):
 *     SAR_next = SAR + AF * (EP - SAR)
 *     If high[i] > EP -> EP = high[i], AF = min(AF + step, max)
 *     If low[i]  < SAR_next ->
 *       flip to downtrend, SAR_next = old EP,
 *       AF = step, EP = low[i]
 *   Step (downtrend at bar i):
 *     SAR_next = SAR + AF * (EP - SAR)
 *     If low[i]  < EP -> EP = low[i],  AF = min(AF + step, max)
 *     If high[i] > SAR_next ->
 *       flip to uptrend, SAR_next = old EP,
 *       AF = step, EP = high[i]
 *
 *   priceUp  = close[i] > close[i-window]
 *   psarUp   = sar[i]   > sar[i-window]
 *   state
 *     aligned-bullish    : priceUp && psarUp
 *     aligned-bearish    : !priceUp && !psarUp
 *     divergent-bullish  : !priceUp && psarUp   (price down, SAR up)
 *     divergent-bearish  : priceUp && !psarUp   (price up, SAR down)
 *   bullish-cross : prev != 'divergent-bullish' && cur == 'divergent-bullish'
 *   bearish-cross : prev != 'divergent-bearish' && cur == 'divergent-bearish'
 *
 * Defaults: `step = 0.02`, `maxStep = 0.20` (Wilder's canonical
 * PSAR acceleration factor), `warmupLength = 15` (bars to
 * skip past the initial trend-detection flip transient before
 * exposing SAR values), `divergenceWindow = 5`. Crosses never
 * fire when prev state is `none` (insufficient data).
 *
 * Bit-exact anchor:
 *
 * - **CONST high = low = close = K**: SAR remains pinned at K
 *   (no acceleration target). priceUp = false (close[i] ===
 *   close[i-5]), psarUp = false (K === K) -> regime
 *   `aligned-bearish`. 0 divergence crosses. Verified across
 *   K = 0..1234.
 * - **LINEAR UP (h=i+1, l=i-1, c=i)**: SAR steady-state
 *   tracks behind the rising EP, climbing roughly at one
 *   unit per bar. priceUp = true, psarUp = true -> regime
 *   `aligned-bullish` (the trailing stop trends with the
 *   price). 0 crosses because no flip happens.
 * - **LINEAR DOWN (h=-i+1, l=-i-1, c=-i)**: after the init
 *   uptrend flips to a downtrend on bar 1, SAR steady-state
 *   tracks above the falling EP, descending roughly at one
 *   unit per bar. priceUp = false, psarUp = false -> regime
 *   `aligned-bearish`. 0 crosses.
 */

export interface ChartLinePsarDivergenceCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLinePsarDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLinePsarDivergenceCrossSeriesId = 'price' | 'psar';

export type ChartLinePsarDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLinePsarDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLinePsarDivergenceCrossCrossKind;
}

export interface ChartLinePsarDivergenceCrossSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  psar: number | null;
  priceUp: boolean | null;
  psarUp: boolean | null;
  regime: ChartLinePsarDivergenceCrossRegime;
}

export interface ChartLinePsarDivergenceCrossRun {
  series: ChartLinePsarDivergenceCrossPoint[];
  step: number;
  maxStep: number;
  warmupLength: number;
  divergenceWindow: number;
  psarValues: Array<number | null>;
  samples: ChartLinePsarDivergenceCrossSample[];
  crosses: ChartLinePsarDivergenceCrossCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLinePsarDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLinePsarDivergenceCrossLayout {
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
  priceDots: ChartLinePsarDivergenceCrossDot[];
  psarPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLinePsarDivergenceCrossCrossKind;
  }>;
  run: ChartLinePsarDivergenceCrossRun;
}

export interface ChartLinePsarDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLinePsarDivergenceCrossPoint[];
  step?: number;
  maxStep?: number;
  warmupLength?: number;
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  psarColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPsar?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZero?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLinePsarDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLinePsarDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLinePsarDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_STEP = 0.02;
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_MAX_STEP = 0.2;
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WARMUP_LENGTH = 15;
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WINDOW = 5;
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_PSAR_COLOR =
  '#7c3aed';
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_ZERO_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLinePsarDivergenceCrossFinitePoints(
  data: readonly ChartLinePsarDivergenceCrossPoint[] | null | undefined,
): ChartLinePsarDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLinePsarDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
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

export function normalizeLinePsarDivergenceCrossStep(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value > 0 && value < 1) return value;
  return fallback;
}

export function normalizeLinePsarDivergenceCrossMaxStep(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value > 0 && value <= 1) return value;
  return fallback;
}

export function normalizeLinePsarDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLinePsarDivergenceCrossWarmup(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 1) return Math.floor(value);
  return fallback;
}

/**
 * Wilder Parabolic SAR over HLC inputs. Iterates the SAR
 * recurrence with acceleration factor stepping each new
 * extreme point, flipping trend when the SAR breaches the
 * current bar. The first `warmupLength` bars of SAR are
 * nulled out so the initial trend-detection flip transient
 * does not contaminate the divergence regime classifier.
 */
export function applyLinePsarDivergenceCrossPsar(
  highs: readonly number[],
  lows: readonly number[],
  step: number,
  maxStep: number,
  warmupLength: number,
): Array<number | null> {
  const n = Math.min(highs.length, lows.length);
  const out: Array<number | null> = new Array(n).fill(null);
  if (step <= 0 || maxStep <= 0 || n === 0) return out;
  // Init: uptrend with SAR=low[0], EP=high[0], AF=step.
  let trend: 'up' | 'down' = 'up';
  let sar = lows[0]!;
  let ep = highs[0]!;
  let af = step;
  const raw: number[] = new Array(n);
  raw[0] = sar;
  for (let i = 1; i < n; i += 1) {
    const h = highs[i]!;
    const l = lows[i]!;
    let nextSar = sar + af * (ep - sar);
    if (trend === 'up') {
      // Update EP / AF on new high.
      if (h > ep) {
        ep = h;
        af = Math.min(af + step, maxStep);
      }
      // Flip on low <= prior SAR.
      if (l < nextSar) {
        trend = 'down';
        nextSar = ep;
        af = step;
        ep = l;
      }
    } else {
      if (l < ep) {
        ep = l;
        af = Math.min(af + step, maxStep);
      }
      if (h > nextSar) {
        trend = 'up';
        nextSar = ep;
        af = step;
        ep = h;
      }
    }
    sar = nextSar;
    raw[i] = sar;
  }
  for (let i = warmupLength; i < n; i += 1) {
    out[i] = posZero(raw[i]!);
  }
  return out;
}

export interface LinePsarDivergenceCrossChannels {
  psar: Array<number | null>;
}

export function computeLinePsarDivergenceCross(
  series: readonly ChartLinePsarDivergenceCrossPoint[] | null | undefined,
  options: {
    step?: number;
    maxStep?: number;
    warmupLength?: number;
  } = {},
): LinePsarDivergenceCrossChannels {
  const cleaned = getLinePsarDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { psar: [] };
  }
  const step = normalizeLinePsarDivergenceCrossStep(
    options.step,
    DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_STEP,
  );
  const maxStep = normalizeLinePsarDivergenceCrossMaxStep(
    options.maxStep,
    DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_MAX_STEP,
  );
  const warmupLength = normalizeLinePsarDivergenceCrossWarmup(
    options.warmupLength,
    DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WARMUP_LENGTH,
  );
  const highs = cleaned.map((p) => p.high);
  const lows = cleaned.map((p) => p.low);
  const psar = applyLinePsarDivergenceCrossPsar(
    highs,
    lows,
    step,
    maxStep,
    warmupLength,
  );
  return { psar };
}

export function classifyLinePsarDivergenceCrossRegime(
  priceUp: boolean | null,
  psarUp: boolean | null,
): ChartLinePsarDivergenceCrossRegime {
  if (priceUp == null || psarUp == null) return 'none';
  if (priceUp && psarUp) return 'aligned-bullish';
  if (!priceUp && !psarUp) return 'aligned-bearish';
  if (!priceUp && psarUp) return 'divergent-bullish';
  return 'divergent-bearish';
}

export function detectLinePsarDivergenceCrossCrosses(
  series: readonly ChartLinePsarDivergenceCrossPoint[],
  states: readonly ChartLinePsarDivergenceCrossRegime[],
): ChartLinePsarDivergenceCrossCross[] {
  const out: ChartLinePsarDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = states[i - 1];
    const cur = states[i];
    if (prev === 'none' || cur === 'none') continue;
    if (prev !== 'divergent-bullish' && cur === 'divergent-bullish') {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (
      prev !== 'divergent-bearish' &&
      cur === 'divergent-bearish'
    ) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLinePsarDivergenceCross(
  data: ChartLinePsarDivergenceCrossPoint[],
  options: {
    step?: number;
    maxStep?: number;
    warmupLength?: number;
    divergenceWindow?: number;
  } = {},
): ChartLinePsarDivergenceCrossRun {
  const cleaned = getLinePsarDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const step = normalizeLinePsarDivergenceCrossStep(
    options.step,
    DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_STEP,
  );
  const maxStep = normalizeLinePsarDivergenceCrossMaxStep(
    options.maxStep,
    DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_MAX_STEP,
  );
  const warmupLength = normalizeLinePsarDivergenceCrossWarmup(
    options.warmupLength,
    DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WARMUP_LENGTH,
  );
  const divergenceWindow = normalizeLinePsarDivergenceCrossLength(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WINDOW,
  );

  const channels = computeLinePsarDivergenceCross(series, {
    step,
    maxStep,
    warmupLength,
  });

  const samples: ChartLinePsarDivergenceCrossSample[] = series.map((p, i) => {
    const psar = channels.psar[i] ?? null;
    let priceUp: boolean | null = null;
    let psarUp: boolean | null = null;
    if (i >= divergenceWindow) {
      const cPrev = series[i - divergenceWindow]?.close;
      if (cPrev != null) priceUp = p.close > cPrev;
      const sPrev = channels.psar[i - divergenceWindow] ?? null;
      if (psar != null && sPrev != null) psarUp = psar > sPrev;
    }
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      psar,
      priceUp,
      psarUp,
      regime: classifyLinePsarDivergenceCrossRegime(priceUp, psarUp),
    };
  });

  const states = samples.map((s) => s.regime);
  const crosses = detectLinePsarDivergenceCrossCrosses(series, states);

  let alignedBullishCount = 0;
  let alignedBearishCount = 0;
  let divergentBullishCount = 0;
  let divergentBearishCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    switch (s.regime) {
      case 'aligned-bullish':
        alignedBullishCount += 1;
        break;
      case 'aligned-bearish':
        alignedBearishCount += 1;
        break;
      case 'divergent-bullish':
        divergentBullishCount += 1;
        break;
      case 'divergent-bearish':
        divergentBearishCount += 1;
        break;
      default:
        noneCount += 1;
    }
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const ok = series.length > warmupLength + divergenceWindow;

  return {
    series,
    step,
    maxStep,
    warmupLength,
    divergenceWindow,
    psarValues: channels.psar,
    samples,
    crosses,
    alignedBullishCount,
    alignedBearishCount,
    divergentBullishCount,
    divergentBearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLinePsarDivergenceCrossLayoutOptions {
  data: ChartLinePsarDivergenceCrossPoint[];
  step?: number;
  maxStep?: number;
  warmupLength?: number;
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLinePsarDivergenceCrossLayout(
  opts: ComputeLinePsarDivergenceCrossLayoutOptions,
): ChartLinePsarDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLinePsarDivergenceCross(opts.data, {
    step: opts.step ?? undefined,
    maxStep: opts.maxStep ?? undefined,
    warmupLength: opts.warmupLength ?? undefined,
    divergenceWindow: opts.divergenceWindow ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  let psarMin = Infinity;
  let psarMax = -Infinity;
  for (let i = 0; i < run.psarValues.length; i += 1) {
    const v = run.psarValues[i];
    if (v == null) continue;
    if (v < psarMin) psarMin = v;
    if (v > psarMax) psarMax = v;
  }
  if (!Number.isFinite(psarMin) || !Number.isFinite(psarMax)) {
    psarMin = -1;
    psarMax = 1;
  }
  if (psarMin === psarMax) {
    psarMin -= 1;
    psarMax += 1;
  }
  const oscMin = psarMin;
  const oscMax = psarMax;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const zeroY =
    0 >= oscMin && 0 <= oscMax ? syOscBase(0) : oscBottom;

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
      psarPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      zeroY,
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
  const priceDots: ChartLinePsarDivergenceCrossDot[] = [];
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

  let psarPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.psar == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.psar);
    psarPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  psarPath = psarPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.psarValues[c.index] ?? 0);
    return {
      index: c.index,
      x: c.x,
      cx,
      cyPrice,
      cyOsc,
      kind: c.kind,
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
    psarPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLinePsarDivergenceCrossChart(
  data: ChartLinePsarDivergenceCrossPoint[],
  options: {
    step?: number;
    maxStep?: number;
    warmupLength?: number;
    divergenceWindow?: number;
  } = {},
): string {
  const cleaned = getLinePsarDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const step = normalizeLinePsarDivergenceCrossStep(
    options.step,
    DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_STEP,
  );
  const maxStep = normalizeLinePsarDivergenceCrossMaxStep(
    options.maxStep,
    DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_MAX_STEP,
  );
  const warmupLength = normalizeLinePsarDivergenceCrossWarmup(
    options.warmupLength,
    DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WARMUP_LENGTH,
  );
  const divergenceWindow = normalizeLinePsarDivergenceCrossLength(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WINDOW,
  );
  return (
    `PSAR Divergence Cross chart over ${cleaned.length} bars ` +
    `(step ${step}, maxStep ${maxStep}, warmupLength ${warmupLength}, ` +
    `divergenceWindow ${divergenceWindow}). Top panel renders the ` +
    `close with bullish (price down + PSAR up, potential bottom ` +
    `reversal warning) / bearish (price up + PSAR down, potential ` +
    `top reversal warning) chevron overlays at every price-versus-` +
    `PSAR direction disagreement event; bottom panel renders the ` +
    `Wilder Parabolic SAR trailing stop and marks divergence ` +
    `transitions for trailing stop reversal warning.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 2);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLinePsarDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLinePsarDivergenceCrossProps
>(function ChartLinePsarDivergenceCross(props, ref): ReactNode {
  const {
    data,
    step = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_STEP,
    maxStep = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_MAX_STEP,
    warmupLength = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WARMUP_LENGTH,
    divergenceWindow = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WINDOW,
    width = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_PRICE_COLOR,
    psarColor = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_PSAR_COLOR,
    bullishColor = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_GRID_COLOR,
    zeroColor = DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_ZERO_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPsar = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showZero = true,
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
    () => getLinePsarDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLinePsarDivergenceCrossLayout({
        data: cleaned,
        step,
        maxStep,
        warmupLength,
        divergenceWindow,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      step,
      maxStep,
      warmupLength,
      divergenceWindow,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLinePsarDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLinePsarDivergenceCrossSeriesId,
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
    seriesId: ChartLinePsarDivergenceCrossSeriesId,
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
        data-section="chart-line-psar-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLinePsarDivergenceCrossChart(cleaned, {
      step,
      maxStep,
      warmupLength,
      divergenceWindow,
    });

  const showPrice = !hidden.has('price');
  const showPsarLine = !hidden.has('psar') && showPsar;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [layout.oscMin, 0, layout.oscMax];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'PSAR Divergence Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-psar-divergence-cross"
      data-step={step}
      data-max-step={maxStep}
      data-warmup-length={warmupLength}
      data-divergence-window={divergenceWindow}
      data-total-points={cleaned.length}
      data-aligned-bullish-count={layout.run.alignedBullishCount}
      data-aligned-bearish-count={layout.run.alignedBearishCount}
      data-divergent-bullish-count={layout.run.divergentBullishCount}
      data-divergent-bearish-count={layout.run.divergentBearishCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-psar-divergence-cross-title"
      >
        {ariaLabel ?? 'PSAR Divergence Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-psar-divergence-cross-aria-desc"
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
        data-section="chart-line-psar-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-psar-divergence-cross-grid">
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
                  data-section="chart-line-psar-divergence-cross-grid-line-price"
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
                  data-section="chart-line-psar-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showZero ? (
          <g data-section="chart-line-psar-divergence-cross-zero">
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeDasharray="4 4"
              data-section="chart-line-psar-divergence-cross-zero-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-psar-divergence-cross-axes">
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
                  data-section="chart-line-psar-divergence-cross-tick-price"
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
                  data-section="chart-line-psar-divergence-cross-tick-osc"
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
            data-section="chart-line-psar-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-psar-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-psar-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showPsarLine ? (
          <path
            d={layout.psarPath}
            stroke={psarColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-psar-divergence-cross-psar-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-psar-divergence-cross-crosses"
            role="group"
            aria-label="divergence markers"
          >
            {layout.crossMarkers.map((m) => (
              <circle
                key={`cross-osc-${m.index}`}
                cx={m.cx}
                cy={m.cyOsc}
                r={4}
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} divergence at ${formatX(m.x)}`}
                data-section={`chart-line-psar-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-psar-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay divergence markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                    : `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                }
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} divergence overlay at ${formatX(m.x)}`}
                data-section={`chart-line-psar-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-psar-divergence-cross-hover-targets">
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
                data-section="chart-line-psar-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-psar-divergence-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={252}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-divergence-cross-tooltip-psar"
                >
                  PSAR{' '}
                  {tooltipSample.psar == null
                    ? '--'
                    : formatOsc(tooltipSample.psar)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-divergence-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-divergence-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-psar-divergence-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          step {step} | max {maxStep} | warmup {warmupLength} | window{' '}
          {divergenceWindow} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-psar-divergence-cross-legend"
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
              { id: 'psar' as const, color: psarColor, label: 'PSAR' },
            ] satisfies Array<{
              id: ChartLinePsarDivergenceCrossSeriesId;
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

ChartLinePsarDivergenceCross.displayName = 'ChartLinePsarDivergenceCross';
