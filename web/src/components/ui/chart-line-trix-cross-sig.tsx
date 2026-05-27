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
 * ChartLineTrixCrossSig -- pure-SVG dual-panel chart with the
 * close in the top panel and the TRIX (triple-smoothed EMA
 * one-period rate of change) with its EMA-smoothed signal in
 * the bottom panel, marking bullish / bearish cross trigger
 * events. The trigger-focused TRIX variant distinct from the
 * base TRIX line: this primitive isolates the actionable
 * momentum trigger events when TRIX crosses its signal and
 * paints them as arrow overlays on the price panel for direct
 * charting-overlay use.
 *
 *   ema1[i]   = EMA(close, length)
 *   ema2[i]   = EMA(ema1,  length)
 *   ema3[i]   = EMA(ema2,  length)
 *   TRIX[i]   = ema3[i-1] === 0
 *                 ? null
 *                 : 100 * (ema3[i] - ema3[i-1]) / ema3[i-1]
 *   signal[i] = EMA(TRIX, signalLength)
 *   bullish  : (TRIX - signal) crosses up    (prev <= 0, cur > 0)
 *   bearish  : (TRIX - signal) crosses down  (prev >= 0, cur < 0)
 *
 * Defaults: `length = 15` (canonical TRIX), `signalLength = 9`.
 * Regime classifier: `bullish` (TRIX > signal), `bearish` (TRIX
 * < signal), `neutral` (TRIX === signal), `none` (either side
 * null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K (K > 0)**: every EMA in the triple chain
 *   collapses to K via the SMA-seeded `min === max` precision
 *   fix. ema3[i] === ema3[i-1] === K so TRIX = 100 * (K - K) /
 *   K = 0 every bar after the full chained warmup at
 *   3*length - 2 (each EMA seeds at length-1 in its own input
 *   stream). signal EMA of 0s = 0. TRIX === signal everywhere
 *   -> regime `neutral`, cross count = 0. CONST K = 0
 *   triggers divide-by-zero guard -> TRIX = null -> regime
 *   `none`.
 */

export interface ChartLineTrixCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineTrixCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineTrixCrossSigSeriesId = 'price' | 'trix' | 'signal';

export type ChartLineTrixCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineTrixCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineTrixCrossSigCrossKind;
}

export interface ChartLineTrixCrossSigSample {
  index: number;
  x: number;
  close: number;
  trix: number | null;
  signal: number | null;
  regime: ChartLineTrixCrossSigRegime;
}

export interface ChartLineTrixCrossSigRun {
  series: ChartLineTrixCrossSigPoint[];
  length: number;
  signalLength: number;
  trixValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineTrixCrossSigSample[];
  crosses: ChartLineTrixCrossSigCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineTrixCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTrixCrossSigLayout {
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
  priceDots: ChartLineTrixCrossSigDot[];
  trixPath: string;
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
    kind: ChartLineTrixCrossSigCrossKind;
  }>;
  run: ChartLineTrixCrossSigRun;
}

export interface ChartLineTrixCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTrixCrossSigPoint[];
  length?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  trixColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTrix?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTrixCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineTrixCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTrixCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_LENGTH = 15;
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_TRIX_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineTrixCrossSigFinitePoints(
  data: readonly ChartLineTrixCrossSigPoint[] | null | undefined,
): ChartLineTrixCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTrixCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineTrixCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** SMA-seeded EMA with the precision fix. */
export function applyLineTrixCrossSigEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);

  let seedSum = 0;
  let seedCount = 0;
  let winMin = Infinity;
  let winMax = -Infinity;
  for (let i = 0; i < values.length && seedCount < length; i += 1) {
    const v = values[i];
    if (v == null) {
      seedSum = 0;
      seedCount = 0;
      winMin = Infinity;
      winMax = -Infinity;
      continue;
    }
    seedSum += v;
    seedCount += 1;
    if (v < winMin) winMin = v;
    if (v > winMax) winMax = v;
    if (seedCount === length) {
      const seed =
        winMin === winMax && Number.isFinite(winMin)
          ? winMin
          : posZero(seedSum / length);
      out[i] = seed;
      let prev = seed;
      for (let j = i + 1; j < values.length; j += 1) {
        const nv = values[j];
        if (nv == null) {
          break;
        }
        const next = nv === prev ? nv : posZero(alpha * nv + (1 - alpha) * prev);
        out[j] = next;
        prev = next;
      }
      break;
    }
  }
  return out;
}

export interface LineTrixCrossSigChannels {
  trix: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineTrixCrossSig(
  series: readonly ChartLineTrixCrossSigPoint[] | null | undefined,
  options: { length?: number; signalLength?: number } = {},
): LineTrixCrossSigChannels {
  const cleaned = getLineTrixCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { trix: [], signal: [] };
  }
  const length = normalizeLineTrixCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_TRIX_CROSS_SIG_LENGTH,
  );
  const signalLength = normalizeLineTrixCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_TRIX_CROSS_SIG_SIGNAL_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const ema1 = applyLineTrixCrossSigEma(closes, length);
  const ema2 = applyLineTrixCrossSigEma(ema1, length);
  const ema3 = applyLineTrixCrossSigEma(ema2, length);

  const trix: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i += 1) {
    const cur = ema3[i];
    const prev = ema3[i - 1];
    if (cur == null || prev == null) continue;
    if (prev === 0) continue;
    trix[i] = posZero(((cur - prev) / prev) * 100);
  }

  const signal = applyLineTrixCrossSigEma(trix, signalLength);

  return { trix, signal };
}

export function classifyLineTrixCrossSigRegime(
  trix: number | null,
  signal: number | null,
): ChartLineTrixCrossSigRegime {
  if (trix == null || signal == null) return 'none';
  if (trix > signal) return 'bullish';
  if (trix < signal) return 'bearish';
  return 'neutral';
}

export function detectLineTrixCrossSigCrosses(
  series: readonly ChartLineTrixCrossSigPoint[],
  trix: readonly (number | null)[],
  signal: readonly (number | null)[],
): ChartLineTrixCrossSigCross[] {
  const out: ChartLineTrixCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prevTrix = trix[i - 1];
    const prevSig = signal[i - 1];
    const curTrix = trix[i];
    const curSig = signal[i];
    if (
      prevTrix == null ||
      prevSig == null ||
      curTrix == null ||
      curSig == null
    ) {
      continue;
    }
    const prevDiff = prevTrix - prevSig;
    const curDiff = curTrix - curSig;
    if (prevDiff <= 0 && curDiff > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prevDiff >= 0 && curDiff < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineTrixCrossSig(
  data: ChartLineTrixCrossSigPoint[],
  options: { length?: number; signalLength?: number } = {},
): ChartLineTrixCrossSigRun {
  const cleaned = getLineTrixCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineTrixCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_TRIX_CROSS_SIG_LENGTH,
  );
  const signalLength = normalizeLineTrixCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_TRIX_CROSS_SIG_SIGNAL_LENGTH,
  );

  const channels = computeLineTrixCrossSig(series, { length, signalLength });

  const samples: ChartLineTrixCrossSigSample[] = series.map((p, i) => {
    const trix = channels.trix[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const regime = classifyLineTrixCrossSigRegime(trix, signal);
    return {
      index: i,
      x: p.x,
      close: p.close,
      trix,
      signal,
      regime,
    };
  });

  const crosses = detectLineTrixCrossSigCrosses(
    series,
    channels.trix,
    channels.signal,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > 3 * length + signalLength;

  return {
    series,
    length,
    signalLength,
    trixValues: channels.trix,
    signalValues: channels.signal,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineTrixCrossSigLayoutOptions {
  data: ChartLineTrixCrossSigPoint[];
  length?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineTrixCrossSigLayout(
  opts: ComputeLineTrixCrossSigLayoutOptions,
): ChartLineTrixCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_TRIX_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_TRIX_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_TRIX_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_TRIX_CROSS_SIG_PANEL_GAP;

  const run = runLineTrixCrossSig(opts.data, {
    length: opts.length ?? undefined,
    signalLength: opts.signalLength ?? undefined,
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
      trixPath: '',
      signalPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
      zeroY: (oscTop + oscBottom) / 2,
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
    if (s.trix != null) {
      if (s.trix < oscMin) oscMin = s.trix;
      if (s.trix > oscMax) oscMax = s.trix;
    }
    if (s.signal != null) {
      if (s.signal < oscMin) oscMin = s.signal;
      if (s.signal > oscMax) oscMax = s.signal;
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

  let pricePath = '';
  const priceDots: ChartLineTrixCrossSigDot[] = [];
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

  let trixPath = '';
  let trixFirst = true;
  for (const s of run.samples) {
    if (s.trix == null) {
      trixFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.trix);
    trixPath += `${trixFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    trixFirst = false;
  }
  trixPath = trixPath.trim();

  let signalPath = '';
  let signalFirst = true;
  for (const s of run.samples) {
    if (s.signal == null) {
      signalFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.signal);
    signalPath += `${signalFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    signalFirst = false;
  }
  signalPath = signalPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOsc(run.trixValues[c.index] ?? 0);
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
    trixPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY: syOsc(0),
    crossMarkers,
    run,
  };
}

export function describeLineTrixCrossSigChart(
  data: ChartLineTrixCrossSigPoint[],
  options: { length?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineTrixCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineTrixCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_TRIX_CROSS_SIG_LENGTH,
  );
  const signalLength = normalizeLineTrixCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_TRIX_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `TRIX Cross Signal chart over ${cleaned.length} bars (length ` +
    `${length}, signalLength ${signalLength}). Top panel renders ` +
    `the close with bullish / bearish arrow overlays at every ` +
    `cross trigger; bottom panel overlays the TRIX (triple-` +
    `smoothed EMA one-period rate of change) with its EMA-` +
    `smoothed signal line and marks momentum trigger events ` +
    `distinct from the base TRIX line.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineTrixCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineTrixCrossSigProps
>(function ChartLineTrixCrossSig(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_LENGTH,
    signalLength = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_PRICE_COLOR,
    trixColor = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_TRIX_COLOR,
    signalColor = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_BEARISH_COLOR,
    zeroColor = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TRIX_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTrix = true,
    showSignal = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showZeroLine = true,
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
    () => getLineTrixCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineTrixCrossSigLayout({
        data: cleaned,
        length,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, signalLength, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineTrixCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineTrixCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineTrixCrossSigSeriesId,
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
        data-section="chart-line-trix-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineTrixCrossSigChart(cleaned, { length, signalLength });

  const showPrice = !hidden.has('price');
  const showTrixLine = !hidden.has('trix') && showTrix;
  const showSignalLine = !hidden.has('signal') && showSignal;

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
      aria-label={ariaLabel ?? 'TRIX Cross Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-trix-cross-sig"
      data-length={length}
      data-signal-length={signalLength}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-neutral-count={layout.run.neutralCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-trix-cross-sig-title"
      >
        {ariaLabel ?? 'TRIX Cross Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-trix-cross-sig-aria-desc"
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
        data-section="chart-line-trix-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-trix-cross-sig-grid">
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
                  data-section="chart-line-trix-cross-sig-grid-line-price"
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
                  data-section="chart-line-trix-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-trix-cross-sig-axes">
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
                  data-section="chart-line-trix-cross-sig-tick-price"
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
                  data-section="chart-line-trix-cross-sig-tick-osc"
                >
                  {formatOsc(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroY}
            x2={layout.innerRight}
            y2={layout.zeroY}
            stroke={zeroColor}
            strokeDasharray="2 4"
            data-section="chart-line-trix-cross-sig-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-trix-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-trix-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-trix-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showTrixLine ? (
          <path
            d={layout.trixPath}
            stroke={trixColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-trix-cross-sig-trix-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-trix-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-trix-cross-sig-crosses"
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
                data-section={`chart-line-trix-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-trix-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                    : `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                }
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)}`}
                data-section={`chart-line-trix-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-trix-cross-sig-hover-targets">
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
                data-section="chart-line-trix-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-trix-cross-sig-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={208}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-sig-tooltip-trix"
                >
                  trix{' '}
                  {tooltipSample.trix == null
                    ? '--'
                    : formatOsc(tooltipSample.trix)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-sig-tooltip-signal"
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
                  data-section="chart-line-trix-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-sig-tooltip-counts2"
                >
                  neutral {layout.run.neutralCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-sig-tooltip-crosses"
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
          data-section="chart-line-trix-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | signal {signalLength} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-trix-cross-sig-legend"
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
              { id: 'trix' as const, color: trixColor, label: 'trix' },
              {
                id: 'signal' as const,
                color: signalColor,
                label: 'signal',
              },
            ] satisfies Array<{
              id: ChartLineTrixCrossSigSeriesId;
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

ChartLineTrixCrossSig.displayName = 'ChartLineTrixCrossSig';
