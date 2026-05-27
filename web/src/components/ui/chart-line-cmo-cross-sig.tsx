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
 * ChartLineCmoCrossSig -- pure-SVG dual-panel chart with the
 * close in the top panel and the close-only Chande Momentum
 * Oscillator (CMO) plus its smoothed signal line in the bottom
 * panel, marking bullish (CMO crosses up through the signal,
 * smoothed-CMO trigger) / bearish (CMO crosses down through the
 * signal) CMO-over-signal crossover events. Signal-line variant
 * of the CMO family that flags the discrete CMO crossing of its
 * own SMA-smoothed signal line -- the canonical trigger analysts
 * use to filter raw-CMO whipsaws and confirm momentum shifts.
 *
 *   gainSum[i]  = sum of positive close deltas in [i-length+1..i]
 *   lossSum[i]  = sum of absolute negative close deltas in window
 *   cmo[i]      = 100 * (gainSum - lossSum) / (gainSum + lossSum);
 *                 0 when both sums collapse to 0 (degenerate)
 *   signal[i]   = SMA(cmo, kSmoothing)
 *   bullish     : prev cmo <= prev signal && cur cmo >  cur signal
 *   bearish     : prev cmo >= prev signal && cur cmo <  cur signal
 *
 * Defaults: `length = 14` (Chande's recommended CMO window),
 * `kSmoothing = 3` (signal-line smoothing). Regime classifier
 * `bullish` (cmo >= signal), `bearish` (cmo < signal), `none`
 * (cmo or signal null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: deltas = 0 -> gainSum = lossSum = 0
 *   -> cmo = 0 (degenerate). signal = SMA(0, 3) = 0 via the SMA
 *   `min === max` short-circuit. cmo == signal == 0 -> regime
 *   `bullish` (cmo >= signal at boundary). cross count = 0.
 *   Verified across K = 0..1234.
 * - **LINEAR UP close = i**: deltas = +1, gainSum = length,
 *   lossSum = 0 -> cmo = 100. signal = SMA(100, 3) = 100. cmo
 *   == signal == 100 -> regime `bullish`. 0 crosses.
 * - **LINEAR DOWN close = -i**: deltas = -1, gainSum = 0,
 *   lossSum = length -> cmo = -100. signal = -100. cmo == signal
 *   == -100 -> regime `bullish` (CMO sits on its own SMA, so by
 *   the boundary-inclusive classifier it reads bullish even at
 *   the saturated bear extreme). 0 crosses.
 */

export interface ChartLineCmoCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineCmoCrossSigRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineCmoCrossSigSeriesId = 'price' | 'cmo' | 'signal';

export type ChartLineCmoCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineCmoCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineCmoCrossSigCrossKind;
}

export interface ChartLineCmoCrossSigSample {
  index: number;
  x: number;
  close: number;
  cmo: number | null;
  signal: number | null;
  regime: ChartLineCmoCrossSigRegime;
}

export interface ChartLineCmoCrossSigRun {
  series: ChartLineCmoCrossSigPoint[];
  length: number;
  kSmoothing: number;
  cmoValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineCmoCrossSigSample[];
  crosses: ChartLineCmoCrossSigCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineCmoCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCmoCrossSigLayout {
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
  priceDots: ChartLineCmoCrossSigDot[];
  cmoPath: string;
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
    kind: ChartLineCmoCrossSigCrossKind;
  }>;
  run: ChartLineCmoCrossSigRun;
}

export interface ChartLineCmoCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCmoCrossSigPoint[];
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
  cmoColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCmo?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZero?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCmoCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineCmoCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCmoCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_LENGTH = 14;
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_K_SMOOTHING = 3;
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_CMO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CMO_CROSS_SIG_ZERO_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineCmoCrossSigFinitePoints(
  data: readonly ChartLineCmoCrossSigPoint[] | null | undefined,
): ChartLineCmoCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCmoCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineCmoCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** SMA with CONST short-circuit via min === max. */
export function applyLineCmoCrossSigSma(
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

/**
 * Chande Momentum Oscillator with degenerate=0 fallback when
 * the rolling window has no gains and no losses.
 */
export function applyLineCmoCrossSigCmo(
  closes: readonly number[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (length < 1 || closes.length <= length) return out;
  for (let i = length; i < closes.length; i += 1) {
    let gainSum = 0;
    let lossSum = 0;
    for (let j = i - length + 1; j <= i; j += 1) {
      const d = closes[j]! - closes[j - 1]!;
      if (d > 0) gainSum += d;
      else if (d < 0) lossSum += -d;
    }
    const total = gainSum + lossSum;
    if (total === 0) {
      out[i] = 0;
    } else {
      out[i] = posZero((100 * (gainSum - lossSum)) / total);
    }
  }
  return out;
}

export interface LineCmoCrossSigChannels {
  cmo: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineCmoCrossSig(
  series: readonly ChartLineCmoCrossSigPoint[] | null | undefined,
  options: { length?: number; kSmoothing?: number } = {},
): LineCmoCrossSigChannels {
  const cleaned = getLineCmoCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { cmo: [], signal: [] };
  }
  const length = normalizeLineCmoCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_CMO_CROSS_SIG_LENGTH,
  );
  const kSmoothing = normalizeLineCmoCrossSigLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_CMO_CROSS_SIG_K_SMOOTHING,
  );
  const closes = cleaned.map((p) => p.close);
  const cmo = applyLineCmoCrossSigCmo(closes, length);
  const signal = applyLineCmoCrossSigSma(cmo, kSmoothing);
  return { cmo, signal };
}

export function classifyLineCmoCrossSigRegime(
  cmo: number | null,
  signal: number | null,
): ChartLineCmoCrossSigRegime {
  if (cmo == null || signal == null) return 'none';
  if (cmo >= signal) return 'bullish';
  return 'bearish';
}

export function detectLineCmoCrossSigCrosses(
  series: readonly ChartLineCmoCrossSigPoint[],
  cmoValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineCmoCrossSigCross[] {
  const out: ChartLineCmoCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pc = cmoValues[i - 1];
    const ps = signalValues[i - 1];
    const cc = cmoValues[i];
    const cs = signalValues[i];
    if (pc == null || ps == null || cc == null || cs == null) continue;
    if (pc <= ps && cc > cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (pc >= ps && cc < cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineCmoCrossSig(
  data: ChartLineCmoCrossSigPoint[],
  options: { length?: number; kSmoothing?: number } = {},
): ChartLineCmoCrossSigRun {
  const cleaned = getLineCmoCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineCmoCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_CMO_CROSS_SIG_LENGTH,
  );
  const kSmoothing = normalizeLineCmoCrossSigLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_CMO_CROSS_SIG_K_SMOOTHING,
  );

  const channels = computeLineCmoCrossSig(series, { length, kSmoothing });

  const samples: ChartLineCmoCrossSigSample[] = series.map((p, i) => {
    const cmo = channels.cmo[i] ?? null;
    const signal = channels.signal[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      cmo,
      signal,
      regime: classifyLineCmoCrossSigRegime(cmo, signal),
    };
  });

  const crosses = detectLineCmoCrossSigCrosses(
    series,
    channels.cmo,
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
    cmoValues: channels.cmo,
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

export interface ComputeLineCmoCrossSigLayoutOptions {
  data: ChartLineCmoCrossSigPoint[];
  length?: number;
  kSmoothing?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineCmoCrossSigLayout(
  opts: ComputeLineCmoCrossSigLayoutOptions,
): ChartLineCmoCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_CMO_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_CMO_CROSS_SIG_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_CMO_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_CMO_CROSS_SIG_PANEL_GAP;

  const run = runLineCmoCrossSig(opts.data, {
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

  const oscMin = -100;
  const oscMax = 100;
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
      cmoPath: '',
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
  const priceDots: ChartLineCmoCrossSigDot[] = [];
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

  let cmoPath = '';
  let cmoFirst = true;
  for (const s of run.samples) {
    if (s.cmo == null) {
      cmoFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.cmo);
    cmoPath += `${cmoFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    cmoFirst = false;
  }
  cmoPath = cmoPath.trim();

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
    const cyOsc = syOscBase(run.cmoValues[c.index] ?? 0);
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
    cmoPath,
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

export function describeLineCmoCrossSigChart(
  data: ChartLineCmoCrossSigPoint[],
  options: { length?: number; kSmoothing?: number } = {},
): string {
  const cleaned = getLineCmoCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineCmoCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_CMO_CROSS_SIG_LENGTH,
  );
  const kSmoothing = normalizeLineCmoCrossSigLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_CMO_CROSS_SIG_K_SMOOTHING,
  );
  return (
    `CMO Signal Cross chart over ${cleaned.length} bars (length ` +
    `${length}, kSmoothing ${kSmoothing}). Top panel renders the ` +
    `close with bullish (CMO crosses up through the signal line, ` +
    `smoothed-CMO trigger) / bearish (CMO crosses down through ` +
    `the signal line) chevron overlays at every Chande Momentum ` +
    `Oscillator signal-line crossover; bottom panel renders the ` +
    `close-only CMO and its smoothed signal line on a -100..100 ` +
    `oscillator with the zero reference and marks smoothed CMO ` +
    `trigger events.`
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

export const ChartLineCmoCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineCmoCrossSigProps
>(function ChartLineCmoCrossSig(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_CMO_CROSS_SIG_LENGTH,
    kSmoothing = DEFAULT_CHART_LINE_CMO_CROSS_SIG_K_SMOOTHING,
    width = DEFAULT_CHART_LINE_CMO_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_CMO_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_CMO_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_CMO_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CMO_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CMO_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CMO_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CMO_CROSS_SIG_PRICE_COLOR,
    cmoColor = DEFAULT_CHART_LINE_CMO_CROSS_SIG_CMO_COLOR,
    signalColor = DEFAULT_CHART_LINE_CMO_CROSS_SIG_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_CMO_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_CMO_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_CMO_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CMO_CROSS_SIG_GRID_COLOR,
    zeroColor = DEFAULT_CHART_LINE_CMO_CROSS_SIG_ZERO_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCmo = true,
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
    () => getLineCmoCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineCmoCrossSigLayout({
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
    ChartLineCmoCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineCmoCrossSigSeriesId,
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
    seriesId: ChartLineCmoCrossSigSeriesId,
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
        data-section="chart-line-cmo-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineCmoCrossSigChart(cleaned, { length, kSmoothing });

  const showPrice = !hidden.has('price');
  const showCmoLine = !hidden.has('cmo') && showCmo;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [-100, 0, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'CMO Signal Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-cmo-cross-sig"
      data-length={length}
      data-k-smoothing={kSmoothing}
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
        data-section="chart-line-cmo-cross-sig-title"
      >
        {ariaLabel ?? 'CMO Signal Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-cmo-cross-sig-aria-desc"
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
        data-section="chart-line-cmo-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-cmo-cross-sig-grid">
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
                  data-section="chart-line-cmo-cross-sig-grid-line-price"
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
                  data-section="chart-line-cmo-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showZero ? (
          <g data-section="chart-line-cmo-cross-sig-zero">
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeDasharray="4 4"
              data-section="chart-line-cmo-cross-sig-zero-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-cmo-cross-sig-axes">
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
                  data-section="chart-line-cmo-cross-sig-tick-price"
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
                  data-section="chart-line-cmo-cross-sig-tick-osc"
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
            data-section="chart-line-cmo-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-cmo-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-cmo-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showCmoLine ? (
          <path
            d={layout.cmoPath}
            stroke={cmoColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-cmo-cross-sig-cmo-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            strokeDasharray="3 3"
            fill="none"
            data-section="chart-line-cmo-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-cmo-cross-sig-crosses"
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
                data-section={`chart-line-cmo-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-cmo-cross-sig-overlay-crosses"
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
                data-section={`chart-line-cmo-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-cmo-cross-sig-hover-targets">
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
                data-section="chart-line-cmo-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-cmo-cross-sig-tooltip"
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
                  data-section="chart-line-cmo-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-cross-sig-tooltip-cmo"
                >
                  CMO{' '}
                  {tooltipSample.cmo == null
                    ? '--'
                    : formatOsc(tooltipSample.cmo)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-cross-sig-tooltip-signal"
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
                  data-section="chart-line-cmo-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-cross-sig-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-cross-sig-tooltip-crosses"
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
          data-section="chart-line-cmo-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | kSmoothing {kSmoothing} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-cmo-cross-sig-legend"
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
              { id: 'cmo' as const, color: cmoColor, label: 'CMO' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineCmoCrossSigSeriesId;
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

ChartLineCmoCrossSig.displayName = 'ChartLineCmoCrossSig';
