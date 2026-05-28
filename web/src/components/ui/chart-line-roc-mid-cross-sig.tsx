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
 * ChartLineRocMidCrossSig -- pure-SVG dual-panel chart with
 * the close in the top panel and the Rate of Change (ROC,
 * percentage variant of Momentum) plus its smoothed SMA
 * signal line in the bottom panel, marking bullish (ROC
 * crosses up through signal -- momentum percentage
 * centerline trigger up) / bearish (ROC crosses down
 * through signal -- momentum percentage centerline
 * trigger down) ROC-over-signal crossover trigger events
 * with bias coloring derived from the ROC slope at the
 * trigger bar.
 *
 *   roc[i]       = (close[i - period] !== 0)
 *                  ? 100 * (close[i] - close[i - period])
 *                        / close[i - period]
 *                  : null  (zero-guard: indeterminate)
 *   signal[i]    = SMA(roc, signalLength)
 *
 *   bullish      : prev roc <= prev signal &&
 *                  cur roc > cur signal
 *   bearish      : prev roc >= prev signal &&
 *                  cur roc < cur signal
 *   regime       : 'bullish' when roc >= signal
 *                  'bearish' when roc <  signal
 *                  'none'    when either is null
 *   bias         : roc[i] vs roc[i-1] -> up / down / flat
 *                  / none
 *
 * Defaults: `period = 10`, `signalLength = 3`. ROC is the
 * percentage variant of the canonical Momentum oscillator
 * (`chart-line-momentum-mid-cross-sig` v1.11.1080) --
 * same shape, different normalisation. Where Momentum
 * gives the raw price change in absolute units, ROC
 * gives the relative change as a percentage, making it
 * comparable across instruments with different price
 * scales. `0` is the natural centerline; positive ROC
 * means price has grown relative to `period` bars ago,
 * negative means shrunk.
 *
 * The zero-guard on `close[i - period] === 0` returns
 * `null` per pandas-ta / TA-Lib convention: the
 * percentage change is undefined when the reference
 * price is zero. Regime stays `none` until valid ROC is
 * available.
 *
 * Warmup is `period + signalLength - 1 = 12` for the
 * default tuning: ROC is valid from i = period = 10
 * (assuming non-zero close[0]), then the signal SMA
 * needs `signalLength - 1 = 2` more bars.
 *
 * Bit-exact anchors (close-input):
 *
 * - **CONST band** `close = K, K > 0`: ROC = 100 * (K -
 *   K) / K = 0 / K = 0 (exactly the centerline). signal
 *   = SMA(0, 3) = 0. ROC === signal -> regime `bullish`
 *   (>=) for every valid bar. 0 crosses. Verified across
 *   K in {1, 50, 200, 1234}.
 * - **CONST K = 0**: ROC = 0 / 0 -> `null` via zero-
 *   guard. regime `none` for every bar. 0 crosses.
 *   (This is the documented limitation of ROC on zero
 *   reference prices.)
 * - **LINEAR UP shifted** `close = i + 100`: close[i]
 *   - close[i - period] = period = 10. close[i -
 *   period] = i + 100 - 10 = i + 90. ROC = 100 * 10 /
 *   (i + 90) = 1000 / (i + 90). Non-constant (decays
 *   from ~10 at i=10 toward 0 as i grows). signal = SMA
 *   of decay over 3 bars -- slightly above current ROC.
 *   regime stays `bearish` because signal lags
 *   (averages older, larger values). 0 crosses (the
 *   trend is monotonic, no transition).
 *
 * Unlike the Momentum sibling, ROC does **not** produce
 * clean integer LINEAR anchors -- the percentage
 * normalisation introduces a 1/(i + offset) decay shape.
 * This is the canonical limitation of ROC: it's not
 * scale-invariant. For bit-exact testability the
 * primitive verifies (a) CONST cases work exactly, (b)
 * specific i values on LINEAR shifted, (c) no crosses
 * fire on monotonic input.
 */

export interface ChartLineRocMidCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineRocMidCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineRocMidCrossSigBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineRocMidCrossSigSeriesId =
  | 'price'
  | 'roc'
  | 'signal';

export type ChartLineRocMidCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineRocMidCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineRocMidCrossSigCrossKind;
  bias: ChartLineRocMidCrossSigBias;
}

export interface ChartLineRocMidCrossSigSample {
  index: number;
  x: number;
  close: number;
  roc: number | null;
  signal: number | null;
  regime: ChartLineRocMidCrossSigRegime;
  bias: ChartLineRocMidCrossSigBias;
}

export interface ChartLineRocMidCrossSigRun {
  series: ChartLineRocMidCrossSigPoint[];
  period: number;
  signalLength: number;
  rocValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineRocMidCrossSigSample[];
  crosses: ChartLineRocMidCrossSigCross[];
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

export interface ChartLineRocMidCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineRocMidCrossSigLayout {
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
  priceDots: ChartLineRocMidCrossSigDot[];
  rocPath: string;
  signalPath: string;
  centerlineY: number;
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
    kind: ChartLineRocMidCrossSigCrossKind;
    bias: ChartLineRocMidCrossSigBias;
  }>;
  run: ChartLineRocMidCrossSigRun;
}

export interface ChartLineRocMidCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRocMidCrossSigPoint[];
  period?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  rocColor?: string;
  signalColor?: string;
  centerlineColor?: string;
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
  showSignal?: boolean;
  showCenterline?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRocMidCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineRocMidCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRocMidCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_PERIOD = 10;
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_SIGNAL_LENGTH = 3;
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_CENTERLINE = 0;
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_ROC_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_CENTERLINE_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineRocMidCrossSigFinitePoints(
  data: readonly ChartLineRocMidCrossSigPoint[] | null | undefined,
): ChartLineRocMidCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRocMidCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineRocMidCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Simple moving average with min===max short-circuit for CONST bit-exactness. */
export function applyLineRocMidCrossSigSma(
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

export interface RocMidCrossSigChannels {
  roc: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineRocMidCrossSig(
  series: readonly ChartLineRocMidCrossSigPoint[] | null | undefined,
  options: { period?: number; signalLength?: number } = {},
): RocMidCrossSigChannels {
  const cleaned = getLineRocMidCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { roc: [], signal: [] };
  }
  const period = normalizeLineRocMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineRocMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_SIGNAL_LENGTH,
  );

  const n = cleaned.length;
  const roc: Array<number | null> = new Array(n).fill(null);
  for (let i = period; i < n; i += 1) {
    const ref = cleaned[i - period]!.close;
    if (ref === 0) continue; // zero-guard: indeterminate
    roc[i] = posZero((100 * (cleaned[i]!.close - ref)) / ref);
  }

  const signal = applyLineRocMidCrossSigSma(roc, signalLength);
  return { roc, signal };
}

export function classifyLineRocMidCrossSigRegime(
  roc: number | null,
  signal: number | null,
): ChartLineRocMidCrossSigRegime {
  if (roc == null || signal == null) return 'none';
  if (roc >= signal) return 'bullish';
  return 'bearish';
}

export function classifyLineRocMidCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineRocMidCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineRocMidCrossSigCrosses(
  series: readonly ChartLineRocMidCrossSigPoint[],
  rocValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineRocMidCrossSigCross[] {
  const out: ChartLineRocMidCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pr = rocValues[i - 1];
    const ps = signalValues[i - 1];
    const cr = rocValues[i];
    const cs = signalValues[i];
    if (pr == null || ps == null || cr == null || cs == null) continue;
    const bias = classifyLineRocMidCrossSigBias(cr, pr);
    if (pr <= ps && cr > cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pr >= ps && cr < cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineRocMidCrossSig(
  data: ChartLineRocMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): ChartLineRocMidCrossSigRun {
  const cleaned = getLineRocMidCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineRocMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineRocMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_SIGNAL_LENGTH,
  );

  const channels = computeLineRocMidCrossSig(series, {
    period,
    signalLength,
  });

  const samples: ChartLineRocMidCrossSigSample[] = series.map((p, i) => {
    const roc = channels.roc[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const prev = i > 0 ? (channels.roc[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      roc,
      signal,
      regime: classifyLineRocMidCrossSigRegime(roc, signal),
      bias: classifyLineRocMidCrossSigBias(roc, prev),
    };
  });

  const crosses = detectLineRocMidCrossSigCrosses(
    series,
    channels.roc,
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

  const warmup = period + signalLength - 1;
  const ok = series.length > warmup;

  return {
    series,
    period,
    signalLength,
    rocValues: channels.roc,
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

export interface ComputeLineRocMidCrossSigLayoutOptions {
  data: ChartLineRocMidCrossSigPoint[];
  period?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineRocMidCrossSigLayout(
  opts: ComputeLineRocMidCrossSigLayoutOptions,
): ChartLineRocMidCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_PANEL_GAP;

  const run = runLineRocMidCrossSig(opts.data, {
    period: opts.period ?? undefined,
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
  for (let i = 0; i < run.rocValues.length; i += 1) {
    const r = run.rocValues[i];
    const s = run.signalValues[i];
    if (r != null) {
      if (r < oscRawMin) oscRawMin = r;
      if (r > oscRawMax) oscRawMax = r;
    }
    if (s != null) {
      if (s < oscRawMin) oscRawMin = s;
      if (s > oscRawMax) oscRawMax = s;
    }
  }
  if (!Number.isFinite(oscRawMin) || !Number.isFinite(oscRawMax)) {
    oscRawMin = -1;
    oscRawMax = 1;
  }
  // Guarantee centerline (0) is always within view.
  if (oscRawMin > 0) oscRawMin = 0;
  if (oscRawMax < 0) oscRawMax = 0;
  if (oscRawMin === oscRawMax) {
    oscRawMin -= 1;
    oscRawMax += 1;
  }
  const oscMin = oscRawMin;
  const oscMax = oscRawMax;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const centerlineY = syOscBase(
    DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_CENTERLINE,
  );

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
      signalPath: '',
      centerlineY,
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
  const priceDots: ChartLineRocMidCrossSigDot[] = [];
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

  const buildPath = (
    accessor: (s: ChartLineRocMidCrossSigSample) => number | null,
  ): string => {
    let path = '';
    let first = true;
    for (const s of run.samples) {
      const v = accessor(s);
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = syOscBase(v);
      path += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return path.trim();
  };

  const rocPath = buildPath((s) => s.roc);
  const signalPath = buildPath((s) => s.signal);

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const rAt = run.rocValues[c.index];
    const cyOsc = rAt != null ? syOscBase(rAt) : oscBottom;
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
    signalPath,
    centerlineY,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineRocMidCrossSigChart(
  data: ChartLineRocMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineRocMidCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineRocMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineRocMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `ROC midline-over-Signal chart over ${cleaned.length} bars ` +
    `(period ${period}, signalLength ${signalLength}). Top panel ` +
    `renders the close with bullish (ROC crosses up through signal, ` +
    `momentum percentage centerline trigger up) / bearish (ROC ` +
    `crosses down through signal, momentum percentage centerline ` +
    `trigger down) chevron overlays at every ROC-signal trigger ` +
    `event; bottom panel renders the canonical Rate of Change ` +
    `oscillator (100 * (close[i] - close[i - period]) / close[i - ` +
    `period], the percentage variant of Momentum) with the ` +
    `conventional zero centerline and its SMA signal line, marker- ` +
    `coloured by ROC slope bias (rising / falling / flat) at the ` +
    `trigger bar, flagging momentum percentage centerline trigger ` +
    `events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineRocMidCrossSigCrossKind,
  bias: ChartLineRocMidCrossSigBias,
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

export const ChartLineRocMidCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineRocMidCrossSigProps
>(function ChartLineRocMidCrossSig(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_PERIOD,
    signalLength = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_PRICE_COLOR,
    rocColor = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_ROC_COLOR,
    signalColor = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_SIGNAL_COLOR,
    centerlineColor = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_CENTERLINE_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRoc = true,
    showSignal = true,
    showCenterline = true,
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
    () => getLineRocMidCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineRocMidCrossSigLayout({
        data: cleaned,
        period,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, period, signalLength, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineRocMidCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineRocMidCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineRocMidCrossSigSeriesId,
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
        data-section="chart-line-roc-mid-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineRocMidCrossSigChart(cleaned, { period, signalLength });

  const showPrice = !hidden.has('price');
  const showRocLine = !hidden.has('roc') && showRoc;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [
    layout.oscMin,
    DEFAULT_CHART_LINE_ROC_MID_CROSS_SIG_CENTERLINE,
    layout.oscMax,
  ];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'ROC midline-over-Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-roc-mid-cross-sig"
      data-period={period}
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
        data-section="chart-line-roc-mid-cross-sig-title"
      >
        {ariaLabel ?? 'ROC midline-over-Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-roc-mid-cross-sig-aria-desc"
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
        data-section="chart-line-roc-mid-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-roc-mid-cross-sig-grid">
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
                  data-section="chart-line-roc-mid-cross-sig-grid-line-price"
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
                  data-section="chart-line-roc-mid-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-roc-mid-cross-sig-axes">
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
                  data-section="chart-line-roc-mid-cross-sig-tick-price"
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
                  data-section="chart-line-roc-mid-cross-sig-tick-osc"
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
            data-section="chart-line-roc-mid-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-roc-mid-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-roc-mid-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showCenterline ? (
          <line
            x1={layout.innerLeft}
            y1={layout.centerlineY}
            x2={layout.innerRight}
            y2={layout.centerlineY}
            stroke={centerlineColor}
            strokeDasharray="4 3"
            data-section="chart-line-roc-mid-cross-sig-centerline"
          />
        ) : null}

        {showRocLine ? (
          <path
            d={layout.rocPath}
            stroke={rocColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-roc-mid-cross-sig-roc-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-roc-mid-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-roc-mid-cross-sig-crosses"
            role="group"
            aria-label="ROC-signal trigger markers"
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
                aria-label={`${m.kind} ROC-signal trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-roc-mid-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-roc-mid-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay ROC-signal trigger markers"
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
                data-section={`chart-line-roc-mid-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-roc-mid-cross-sig-hover-targets">
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
                data-section="chart-line-roc-mid-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-roc-mid-cross-sig-tooltip"
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
                  data-section="chart-line-roc-mid-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-mid-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-mid-cross-sig-tooltip-roc"
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
                  data-section="chart-line-roc-mid-cross-sig-tooltip-signal"
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
                  data-section="chart-line-roc-mid-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-mid-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-mid-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-mid-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-mid-cross-sig-tooltip-biases"
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
          data-section="chart-line-roc-mid-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | signal {signalLength} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-roc-mid-cross-sig-legend"
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
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineRocMidCrossSigSeriesId;
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

ChartLineRocMidCrossSig.displayName = 'ChartLineRocMidCrossSig';
