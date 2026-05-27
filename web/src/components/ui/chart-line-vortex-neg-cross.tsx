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
 * ChartLineVortexNegCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the Vortex Indicator
 * negative line (VI-) plus its smoothed SMA signal line in
 * the bottom panel, marking VI- crosses up through signal
 * -- downtrend confirmation up (rising downward pressure) /
 * VI- crosses down through signal -- downtrend confirmation
 * lost (downward pressure releasing) VI- over-signal
 * crossover trigger events with bias coloring derived from
 * the VI- slope at the trigger bar.
 *
 *   VM-[i]    = |low[i]  - high[i-1]|
 *   VM+[i]    = |high[i] - low[i-1]|
 *   TR[i]     = max(high[i] - low[i],
 *                   |high[i] - close[i-1]|,
 *                   |low[i]  - close[i-1]|)
 *   VI-[i]    = sum(VM-, period) / sum(TR, period)
 *   signal[i] = SMA(VI-, signalLength)
 *   bullish   : prev VI- <= prev signal && cur VI- > cur signal
 *                (downtrend confirmation -- VI- rising through
 *                signal means downward pressure is mounting)
 *   bearish   : prev VI- >= prev signal && cur VI- < cur signal
 *                (downtrend confirmation lost -- VI- falling
 *                through signal means downward pressure is
 *                releasing)
 *   regime    : bullish (VI- >= signal), bearish (VI- < signal)
 *   bias      : up / down / flat / none from VI-[i] vs VI-[i-1]
 *
 * Defaults: `period = 14`, `signalLength = 3`. Botes /
 * Siepman (2010) VI- traditionally pairs with VI+ (the dual
 * VI line view lives in `chart-line-vortex-divergence-cross`
 * and the VI+ over-signal trigger lives in
 * `chart-line-vortex-pos-cross`); here we focus on the VI-
 * vs its SMA signal smoothing for a downtrend confirmation
 * cadence. Cross kind labels (`bullish`/`bearish`) refer to
 * the *line* crossing direction (VI- up through / down
 * through signal); the semantic meaning is downtrend
 * mounting / releasing.
 *
 * Warmup is `period + signalLength - 1 = 16` for the default
 * tuning: VM/TR seed at `i >= 1`, the rolling sum across
 * `period` bars first fills at `i = period = 14`, then the
 * signal SMA adds another `signalLength - 1 = 2` bars.
 *
 * Bit-exact anchors (all use HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close =
 *   K`: VM- = 2, VM+ = 2, TR = 2 from i >= 1, so VI- = 1
 *   from `i = period`, signal = 1 from `i = period +
 *   signalLength - 1`. VI- === signal -> regime `bullish`
 *   (>=). 0 crosses. Verified across K in {0, 1, 50, 200,
 *   1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close =
 *   i`: VM- = |(i-1) - i| = 1, VM+ = 3, TR = 2 -> VI- =
 *   0.5, signal = 0.5. VI- === signal -> regime `bullish`,
 *   0 crosses (downward pressure is low and steady).
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`, `close
 *   = -i`: VM- = |(-i-1) - (-(i-1)+1)| = 3, VM+ = 1, TR =
 *   2 -> VI- = 1.5, signal = 1.5. VI- === signal -> regime
 *   `bullish` (>=), 0 crosses (downward pressure is high and
 *   steady).
 */

export interface ChartLineVortexNegCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineVortexNegCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineVortexNegCrossBias = 'up' | 'down' | 'flat' | 'none';

export type ChartLineVortexNegCrossSeriesId = 'price' | 'vortex' | 'signal';

export type ChartLineVortexNegCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineVortexNegCrossCross {
  index: number;
  x: number;
  kind: ChartLineVortexNegCrossCrossKind;
  bias: ChartLineVortexNegCrossBias;
}

export interface ChartLineVortexNegCrossSample {
  index: number;
  x: number;
  close: number;
  vortex: number | null;
  signal: number | null;
  regime: ChartLineVortexNegCrossRegime;
  bias: ChartLineVortexNegCrossBias;
}

export interface ChartLineVortexNegCrossRun {
  series: ChartLineVortexNegCrossPoint[];
  period: number;
  signalLength: number;
  vmPlus: Array<number | null>;
  vmMinus: Array<number | null>;
  trueRange: Array<number | null>;
  vortexValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineVortexNegCrossSample[];
  crosses: ChartLineVortexNegCrossCross[];
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

export interface ChartLineVortexNegCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVortexNegCrossLayout {
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
  priceDots: ChartLineVortexNegCrossDot[];
  vortexPath: string;
  signalPath: string;
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
    kind: ChartLineVortexNegCrossCrossKind;
    bias: ChartLineVortexNegCrossBias;
  }>;
  run: ChartLineVortexNegCrossRun;
}

export interface ChartLineVortexNegCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVortexNegCrossPoint[];
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
  vortexColor?: string;
  signalColor?: string;
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
  showVortex?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVortexNegCrossSeriesId[];
  defaultHiddenSeries?: ChartLineVortexNegCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVortexNegCrossSeriesId;
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

export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PERIOD = 14;
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_SIGNAL_LENGTH = 3;
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_VORTEX_COLOR = '#db2777';
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineVortexNegCrossFinitePoints(
  data: readonly ChartLineVortexNegCrossPoint[] | null | undefined,
): ChartLineVortexNegCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVortexNegCrossPoint[] = [];
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

export function normalizeLineVortexNegCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Simple moving average over a `(number | null)[]` series. */
export function applyLineVortexNegCrossSma(
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

export interface VortexNegCrossChannels {
  vmPlus: Array<number | null>;
  vmMinus: Array<number | null>;
  trueRange: Array<number | null>;
  vortex: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineVortexNegCross(
  series: readonly ChartLineVortexNegCrossPoint[] | null | undefined,
  options: { period?: number; signalLength?: number } = {},
): VortexNegCrossChannels {
  const cleaned = getLineVortexNegCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      vmPlus: [],
      vmMinus: [],
      trueRange: [],
      vortex: [],
      signal: [],
    };
  }
  const period = normalizeLineVortexNegCrossLength(
    options.period,
    DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PERIOD,
  );
  const signalLength = normalizeLineVortexNegCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_SIGNAL_LENGTH,
  );

  const n = cleaned.length;
  const vmPlus: Array<number | null> = new Array(n).fill(null);
  const vmMinus: Array<number | null> = new Array(n).fill(null);
  const trueRange: Array<number | null> = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = cleaned[i]!;
    const prev = cleaned[i - 1]!;
    vmPlus[i] = posZero(Math.abs(cur.high - prev.low));
    vmMinus[i] = posZero(Math.abs(cur.low - prev.high));
    const range = cur.high - cur.low;
    const highToPrevClose = Math.abs(cur.high - prev.close);
    const lowToPrevClose = Math.abs(cur.low - prev.close);
    trueRange[i] = posZero(
      Math.max(range, highToPrevClose, lowToPrevClose),
    );
  }

  const vortex: Array<number | null> = new Array(n).fill(null);
  for (let i = period; i < n; i += 1) {
    let sumVm = 0;
    let sumTr = 0;
    let valid = true;
    for (let j = i - period + 1; j <= i; j += 1) {
      const vm = vmMinus[j];
      const tr = trueRange[j];
      if (vm == null || tr == null) {
        valid = false;
        break;
      }
      sumVm += vm;
      sumTr += tr;
    }
    if (!valid || sumTr === 0) continue;
    vortex[i] = posZero(sumVm / sumTr);
  }

  const signal = applyLineVortexNegCrossSma(vortex, signalLength);
  return { vmPlus, vmMinus, trueRange, vortex, signal };
}

export function classifyLineVortexNegCrossRegime(
  vortex: number | null,
  signal: number | null,
): ChartLineVortexNegCrossRegime {
  if (vortex == null || signal == null) return 'none';
  if (vortex >= signal) return 'bullish';
  return 'bearish';
}

export function classifyLineVortexNegCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineVortexNegCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineVortexNegCrossCrosses(
  series: readonly ChartLineVortexNegCrossPoint[],
  vortexValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineVortexNegCrossCross[] {
  const out: ChartLineVortexNegCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pv = vortexValues[i - 1];
    const ps = signalValues[i - 1];
    const cv = vortexValues[i];
    const cs = signalValues[i];
    if (pv == null || ps == null || cv == null || cs == null) continue;
    const bias = classifyLineVortexNegCrossBias(cv, pv);
    if (pv <= ps && cv > cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pv >= ps && cv < cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineVortexNegCross(
  data: ChartLineVortexNegCrossPoint[],
  options: { period?: number; signalLength?: number } = {},
): ChartLineVortexNegCrossRun {
  const cleaned = getLineVortexNegCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineVortexNegCrossLength(
    options.period,
    DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PERIOD,
  );
  const signalLength = normalizeLineVortexNegCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_SIGNAL_LENGTH,
  );

  const channels = computeLineVortexNegCross(series, {
    period,
    signalLength,
  });

  const samples: ChartLineVortexNegCrossSample[] = series.map((p, i) => {
    const vortex = channels.vortex[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const prevVortex = i > 0 ? (channels.vortex[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      vortex,
      signal,
      regime: classifyLineVortexNegCrossRegime(vortex, signal),
      bias: classifyLineVortexNegCrossBias(vortex, prevVortex),
    };
  });

  const crosses = detectLineVortexNegCrossCrosses(
    series,
    channels.vortex,
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
    vmPlus: channels.vmPlus,
    vmMinus: channels.vmMinus,
    trueRange: channels.trueRange,
    vortexValues: channels.vortex,
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

export interface ComputeLineVortexNegCrossLayoutOptions {
  data: ChartLineVortexNegCrossPoint[];
  period?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineVortexNegCrossLayout(
  opts: ComputeLineVortexNegCrossLayoutOptions,
): ChartLineVortexNegCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PANEL_GAP;

  const run = runLineVortexNegCross(opts.data, {
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
  for (let i = 0; i < run.vortexValues.length; i += 1) {
    const v = run.vortexValues[i];
    const s = run.signalValues[i];
    if (v != null) {
      if (v < oscRawMin) oscRawMin = v;
      if (v > oscRawMax) oscRawMax = v;
    }
    if (s != null) {
      if (s < oscRawMin) oscRawMin = s;
      if (s > oscRawMax) oscRawMax = s;
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
      vortexPath: '',
      signalPath: '',
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
  const priceDots: ChartLineVortexNegCrossDot[] = [];
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

  let vortexPath = '';
  let firstVortex = true;
  for (const s of run.samples) {
    if (s.vortex == null) {
      firstVortex = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.vortex);
    vortexPath += `${firstVortex ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstVortex = false;
  }
  vortexPath = vortexPath.trim();

  let signalPath = '';
  let firstSignal = true;
  for (const s of run.samples) {
    if (s.signal == null) {
      firstSignal = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.signal);
    signalPath += `${firstSignal ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstSignal = false;
  }
  signalPath = signalPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const vortexAtCross = run.vortexValues[c.index];
    const cyOsc =
      vortexAtCross != null ? syOscBase(vortexAtCross) : oscBottom;
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
    vortexPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineVortexNegCrossChart(
  data: ChartLineVortexNegCrossPoint[],
  options: { period?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineVortexNegCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineVortexNegCrossLength(
    options.period,
    DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PERIOD,
  );
  const signalLength = normalizeLineVortexNegCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_SIGNAL_LENGTH,
  );
  return (
    `Vortex--over-Signal chart over ${cleaned.length} bars ` +
    `(period ${period}, signalLength ${signalLength}). Top panel ` +
    `renders the close with VI- crosses up (downtrend confirmation, ` +
    `downward pressure mounting) / VI- crosses down (downtrend ` +
    `confirmation lost, downward pressure releasing) chevron ` +
    `overlays at every VI--signal trigger event; bottom panel ` +
    `renders the Vortex negative line and its SMA signal line with ` +
    `markers coloured by VI- slope bias (rising / falling / flat) ` +
    `at the trigger bar, flagging downtrend confirmation events ` +
    `with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineVortexNegCrossCrossKind,
  bias: ChartLineVortexNegCrossBias,
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
const defaultOscFormatter = (value: number): string =>
  formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineVortexNegCross = forwardRef<
  HTMLDivElement,
  ChartLineVortexNegCrossProps
>(function ChartLineVortexNegCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PERIOD,
    signalLength = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_PRICE_COLOR,
    vortexColor = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_VORTEX_COLOR,
    signalColor = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_SIGNAL_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_VORTEX_NEG_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showVortex = true,
    showSignal = true,
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
    () => getLineVortexNegCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineVortexNegCrossLayout({
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
    ChartLineVortexNegCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineVortexNegCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineVortexNegCrossSeriesId,
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
        data-section="chart-line-vortex-neg-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineVortexNegCrossChart(cleaned, { period, signalLength });

  const showPrice = !hidden.has('price');
  const showVortexLine = !hidden.has('vortex') && showVortex;
  const showSignalLine = !hidden.has('signal') && showSignal;

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
      aria-label={ariaLabel ?? 'Vortex--over-Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-vortex-neg-cross"
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
        data-section="chart-line-vortex-neg-cross-title"
      >
        {ariaLabel ?? 'Vortex--over-Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-vortex-neg-cross-aria-desc"
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
        data-section="chart-line-vortex-neg-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-vortex-neg-cross-grid">
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
                  data-section="chart-line-vortex-neg-cross-grid-line-price"
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
                  data-section="chart-line-vortex-neg-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-vortex-neg-cross-axes">
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
                  data-section="chart-line-vortex-neg-cross-tick-price"
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
                  data-section="chart-line-vortex-neg-cross-tick-osc"
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
            data-section="chart-line-vortex-neg-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-vortex-neg-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-vortex-neg-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showVortexLine ? (
          <path
            d={layout.vortexPath}
            stroke={vortexColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vortex-neg-cross-vortex-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vortex-neg-cross-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-vortex-neg-cross-crosses"
            role="group"
            aria-label="VI--signal trigger markers"
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
                aria-label={`${m.kind} VI--signal trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-vortex-neg-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-vortex-neg-cross-overlay-crosses"
            role="group"
            aria-label="overlay VI--signal trigger markers"
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
                data-section={`chart-line-vortex-neg-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-vortex-neg-cross-hover-targets">
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
                data-section="chart-line-vortex-neg-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-vortex-neg-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={252}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-neg-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-neg-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-neg-cross-tooltip-vortex"
                >
                  VI-{' '}
                  {tooltipSample.vortex == null
                    ? '--'
                    : formatOsc(tooltipSample.vortex)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-neg-cross-tooltip-signal"
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
                  data-section="chart-line-vortex-neg-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-neg-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-neg-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-neg-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-neg-cross-tooltip-biases"
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
          data-section="chart-line-vortex-neg-cross-badge"
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
          data-section="chart-line-vortex-neg-cross-legend"
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
              { id: 'vortex' as const, color: vortexColor, label: 'VI-' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineVortexNegCrossSeriesId;
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

ChartLineVortexNegCross.displayName = 'ChartLineVortexNegCross';
