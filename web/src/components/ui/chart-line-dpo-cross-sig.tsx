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
 * ChartLineDpoCrossSig -- pure-SVG dual-panel chart with the
 * close in the top panel and the close-only Detrended Price
 * Oscillator (DPO) plus its smoothed signal line in the bottom
 * panel, marking bullish (DPO crosses up through the signal,
 * smoothed detrended momentum trigger) / bearish (DPO crosses
 * down through the signal) DPO-over-signal crossover events.
 * Signal-line variant of the DPO family that flags the discrete
 * DPO crossing of its own SMA-smoothed signal line -- the
 * canonical trigger analysts use to filter raw-DPO whipsaws
 * while preserving the detrended-momentum responsiveness.
 *
 *   shift       = floor(length / 2) + 1
 *   sma[i]      = SMA(close, length)[i]
 *   dpo[i]      = close[i - shift] - sma[i]
 *   signal[i]   = SMA(dpo, kSmoothing)
 *   bullish     : prev dpo <= prev signal && cur dpo >  cur signal
 *   bearish     : prev dpo >= prev signal && cur dpo <  cur signal
 *
 * Defaults: `length = 20` (canonical DPO window), `kSmoothing
 * = 9` (signal smoothing inherited from MACD lineage). Regime
 * classifier `bullish` (dpo >= signal), `bearish` (dpo <
 * signal), `none` (dpo or signal null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: close[i-shift] = K, sma = K -> dpo = 0
 *   constant for i >= length - 1. signal = SMA(0, 9) = 0 via
 *   the SMA `min === max` short-circuit. dpo == signal == 0 ->
 *   regime `bullish` (boundary inclusive). 0 crosses. Verified
 *   across K = 0..1234.
 * - **LINEAR UP close = i**: close[i-shift] = i - 11, sma[i]
 *   = i - 9.5 (length=20 constant lag) -> dpo = -1.5 constant
 *   for i >= 19. signal = SMA(-1.5, 9) = -1.5. dpo == signal
 *   == -1.5 -> regime `bullish`. 0 crosses. The negative DPO
 *   reflects "the look-back close sits 1.5 units below the
 *   centered SMA" -- detrended momentum is symmetric around
 *   zero for a clean linear ramp.
 * - **LINEAR DOWN close = -i**: close[i-shift] = -(i-11),
 *   sma[i] = -(i - 9.5) -> dpo = 1.5 constant. signal = 1.5.
 *   dpo == signal == 1.5 -> regime `bullish`. 0 crosses.
 */

export interface ChartLineDpoCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineDpoCrossSigRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineDpoCrossSigSeriesId = 'price' | 'dpo' | 'signal';

export type ChartLineDpoCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineDpoCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineDpoCrossSigCrossKind;
}

export interface ChartLineDpoCrossSigSample {
  index: number;
  x: number;
  close: number;
  dpo: number | null;
  signal: number | null;
  regime: ChartLineDpoCrossSigRegime;
}

export interface ChartLineDpoCrossSigRun {
  series: ChartLineDpoCrossSigPoint[];
  length: number;
  kSmoothing: number;
  shift: number;
  dpoValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineDpoCrossSigSample[];
  crosses: ChartLineDpoCrossSigCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineDpoCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineDpoCrossSigLayout {
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
  priceDots: ChartLineDpoCrossSigDot[];
  dpoPath: string;
  signalPath: string;
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
    kind: ChartLineDpoCrossSigCrossKind;
  }>;
  run: ChartLineDpoCrossSigRun;
}

export interface ChartLineDpoCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineDpoCrossSigPoint[];
  length?: number;
  kSmoothing?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  dpoColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showDpo?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZero?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineDpoCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineDpoCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineDpoCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_LENGTH = 20;
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_K_SMOOTHING = 9;
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_DPO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DPO_CROSS_SIG_ZERO_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Canonical DPO shift = floor(length / 2) + 1. */
export function lineDpoCrossSigShift(length: number): number {
  return Math.floor(length / 2) + 1;
}

/** Keep only points with finite x / close. */
export function getLineDpoCrossSigFinitePoints(
  data: readonly ChartLineDpoCrossSigPoint[] | null | undefined,
): ChartLineDpoCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineDpoCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineDpoCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** SMA with CONST short-circuit via min === max. */
export function applyLineDpoCrossSigSma(
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

export interface LineDpoCrossSigChannels {
  sma: Array<number | null>;
  dpo: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineDpoCrossSig(
  series: readonly ChartLineDpoCrossSigPoint[] | null | undefined,
  options: { length?: number; kSmoothing?: number } = {},
): LineDpoCrossSigChannels {
  const cleaned = getLineDpoCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { sma: [], dpo: [], signal: [] };
  }
  const length = normalizeLineDpoCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_DPO_CROSS_SIG_LENGTH,
  );
  const kSmoothing = normalizeLineDpoCrossSigLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_DPO_CROSS_SIG_K_SMOOTHING,
  );
  const shift = lineDpoCrossSigShift(length);

  const closes = cleaned.map((p) => p.close);
  const sma = applyLineDpoCrossSigSma(closes, length);

  const dpo: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const s = sma[i];
    if (s == null) continue;
    if (i < shift) continue;
    const c = closes[i - shift];
    if (c == null) continue;
    dpo[i] = posZero(c - s);
  }

  const signal = applyLineDpoCrossSigSma(dpo, kSmoothing);

  return { sma, dpo, signal };
}

export function classifyLineDpoCrossSigRegime(
  dpo: number | null,
  signal: number | null,
): ChartLineDpoCrossSigRegime {
  if (dpo == null || signal == null) return 'none';
  if (dpo >= signal) return 'bullish';
  return 'bearish';
}

export function detectLineDpoCrossSigCrosses(
  series: readonly ChartLineDpoCrossSigPoint[],
  dpoValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineDpoCrossSigCross[] {
  const out: ChartLineDpoCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pd = dpoValues[i - 1];
    const ps = signalValues[i - 1];
    const cd = dpoValues[i];
    const cs = signalValues[i];
    if (pd == null || ps == null || cd == null || cs == null) continue;
    if (pd <= ps && cd > cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (pd >= ps && cd < cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineDpoCrossSig(
  data: ChartLineDpoCrossSigPoint[],
  options: { length?: number; kSmoothing?: number } = {},
): ChartLineDpoCrossSigRun {
  const cleaned = getLineDpoCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineDpoCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_DPO_CROSS_SIG_LENGTH,
  );
  const kSmoothing = normalizeLineDpoCrossSigLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_DPO_CROSS_SIG_K_SMOOTHING,
  );
  const shift = lineDpoCrossSigShift(length);

  const channels = computeLineDpoCrossSig(series, { length, kSmoothing });

  const samples: ChartLineDpoCrossSigSample[] = series.map((p, i) => {
    const dpo = channels.dpo[i] ?? null;
    const signal = channels.signal[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      dpo,
      signal,
      regime: classifyLineDpoCrossSigRegime(dpo, signal),
    };
  });

  const crosses = detectLineDpoCrossSigCrosses(
    series,
    channels.dpo,
    channels.signal,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else noneCount += 1;
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const ok = series.length > length + kSmoothing - 1;

  return {
    series,
    length,
    kSmoothing,
    shift,
    dpoValues: channels.dpo,
    signalValues: channels.signal,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineDpoCrossSigLayoutOptions {
  data: ChartLineDpoCrossSigPoint[];
  length?: number;
  kSmoothing?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineDpoCrossSigLayout(
  opts: ComputeLineDpoCrossSigLayoutOptions,
): ChartLineDpoCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_DPO_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_DPO_CROSS_SIG_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_DPO_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_DPO_CROSS_SIG_PANEL_GAP;

  const run = runLineDpoCrossSig(opts.data, {
    length: opts.length ?? undefined,
    kSmoothing: opts.kSmoothing ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  let dpoMin = Infinity;
  let dpoMax = -Infinity;
  for (const v of run.dpoValues) {
    if (v == null) continue;
    if (v < dpoMin) dpoMin = v;
    if (v > dpoMax) dpoMax = v;
  }
  for (const v of run.signalValues) {
    if (v == null) continue;
    if (v < dpoMin) dpoMin = v;
    if (v > dpoMax) dpoMax = v;
  }
  let oscMin: number;
  let oscMax: number;
  if (!Number.isFinite(dpoMin) || !Number.isFinite(dpoMax)) {
    oscMin = -1;
    oscMax = 1;
  } else {
    const lo = Math.min(dpoMin, 0);
    const hi = Math.max(dpoMax, 0);
    if (lo === hi) {
      oscMin = -1;
      oscMax = 1;
    } else {
      const span = Math.max(Math.abs(lo), Math.abs(hi));
      oscMin = -span * 1.1;
      oscMax = span * 1.1;
    }
  }
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const zeroY = syOscBase(0);

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
      dpoPath: '',
      signalPath: '',
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
  const priceDots: ChartLineDpoCrossSigDot[] = [];
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

  let dpoPath = '';
  let dpoFirst = true;
  for (const s of run.samples) {
    if (s.dpo == null) {
      dpoFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.dpo);
    dpoPath += `${dpoFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    dpoFirst = false;
  }
  dpoPath = dpoPath.trim();

  let signalPath = '';
  let sigFirst = true;
  for (const s of run.samples) {
    if (s.signal == null) {
      sigFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.signal);
    signalPath += `${sigFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    sigFirst = false;
  }
  signalPath = signalPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.dpoValues[c.index] ?? 0);
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
    dpoPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLineDpoCrossSigChart(
  data: ChartLineDpoCrossSigPoint[],
  options: { length?: number; kSmoothing?: number } = {},
): string {
  const cleaned = getLineDpoCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineDpoCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_DPO_CROSS_SIG_LENGTH,
  );
  const kSmoothing = normalizeLineDpoCrossSigLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_DPO_CROSS_SIG_K_SMOOTHING,
  );
  const shift = lineDpoCrossSigShift(length);
  return (
    `DPO Signal Cross chart over ${cleaned.length} bars (length ` +
    `${length}, kSmoothing ${kSmoothing}, shift ${shift}). Top ` +
    `panel renders the close with bullish (DPO crosses up through ` +
    `the signal line, smoothed detrended momentum trigger) / ` +
    `bearish (DPO crosses down through the signal line) chevron ` +
    `overlays at every Detrended Price Oscillator signal-line ` +
    `crossover; bottom panel renders the close-only DPO (close[i-` +
    `shift] minus length-bar SMA) and its smoothed signal line on ` +
    `a symmetric oscillator with the zero reference and marks ` +
    `smoothed detrended momentum trigger events.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 3);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineDpoCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineDpoCrossSigProps
>(function ChartLineDpoCrossSig(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_DPO_CROSS_SIG_LENGTH,
    kSmoothing = DEFAULT_CHART_LINE_DPO_CROSS_SIG_K_SMOOTHING,
    width = DEFAULT_CHART_LINE_DPO_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_DPO_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_DPO_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_DPO_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_DPO_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DPO_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DPO_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DPO_CROSS_SIG_PRICE_COLOR,
    dpoColor = DEFAULT_CHART_LINE_DPO_CROSS_SIG_DPO_COLOR,
    signalColor = DEFAULT_CHART_LINE_DPO_CROSS_SIG_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_DPO_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_DPO_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_DPO_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_DPO_CROSS_SIG_GRID_COLOR,
    zeroColor = DEFAULT_CHART_LINE_DPO_CROSS_SIG_ZERO_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showDpo = true,
    showSignal = true,
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
    () => getLineDpoCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineDpoCrossSigLayout({
        data: cleaned,
        length,
        kSmoothing,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, kSmoothing, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineDpoCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineDpoCrossSigSeriesId,
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
    seriesId: ChartLineDpoCrossSigSeriesId,
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
        data-section="chart-line-dpo-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineDpoCrossSigChart(cleaned, { length, kSmoothing });

  const showPrice = !hidden.has('price');
  const showDpoLine = !hidden.has('dpo') && showDpo;
  const showSignalLine = !hidden.has('signal') && showSignal;

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
      aria-label={ariaLabel ?? 'DPO Signal Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-dpo-cross-sig"
      data-length={length}
      data-k-smoothing={kSmoothing}
      data-shift={layout.run.shift}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-dpo-cross-sig-title"
      >
        {ariaLabel ?? 'DPO Signal Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-dpo-cross-sig-aria-desc"
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
        data-section="chart-line-dpo-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-dpo-cross-sig-grid">
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
                  data-section="chart-line-dpo-cross-sig-grid-line-price"
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
                  data-section="chart-line-dpo-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showZero ? (
          <g data-section="chart-line-dpo-cross-sig-zero">
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeDasharray="4 4"
              data-section="chart-line-dpo-cross-sig-zero-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-dpo-cross-sig-axes">
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
                  data-section="chart-line-dpo-cross-sig-tick-price"
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
                  data-section="chart-line-dpo-cross-sig-tick-osc"
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
            data-section="chart-line-dpo-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-dpo-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-dpo-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showDpoLine ? (
          <path
            d={layout.dpoPath}
            stroke={dpoColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-dpo-cross-sig-dpo-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            strokeDasharray="3 3"
            fill="none"
            data-section="chart-line-dpo-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-dpo-cross-sig-crosses"
            role="group"
            aria-label="cross markers"
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
                aria-label={`${m.kind} cross at ${formatX(m.x)}`}
                data-section={`chart-line-dpo-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-dpo-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay cross markers"
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
                aria-label={`${m.kind} overlay at ${formatX(m.x)}`}
                data-section={`chart-line-dpo-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-dpo-cross-sig-hover-targets">
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
                data-section="chart-line-dpo-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-dpo-cross-sig-tooltip"
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
                  data-section="chart-line-dpo-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-cross-sig-tooltip-dpo"
                >
                  DPO{' '}
                  {tooltipSample.dpo == null
                    ? '--'
                    : formatOsc(tooltipSample.dpo)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-cross-sig-tooltip-signal"
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
                  data-section="chart-line-dpo-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-cross-sig-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-cross-sig-tooltip-crosses"
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
          data-section="chart-line-dpo-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | kSmoothing {kSmoothing} | shift{' '}
          {layout.run.shift} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-dpo-cross-sig-legend"
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
              { id: 'dpo' as const, color: dpoColor, label: 'DPO' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineDpoCrossSigSeriesId;
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

ChartLineDpoCrossSig.displayName = 'ChartLineDpoCrossSig';
