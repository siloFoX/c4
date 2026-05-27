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
 * ChartLineKvoCross -- pure-SVG dual-panel chart with the close
 * in the top panel and the Klinger Volume Oscillator (KVO) with
 * its EMA-smoothed signal in the bottom panel, marking bullish /
 * bearish cross trigger events for volume force trend regime
 * shifts. The simplified single-series KVO uses
 *
 *   trend[i]    = i === 0 ? 0
 *                        : close[i] > close[i-1] ? 1
 *                        : close[i] < close[i-1] ? -1
 *                        : 0
 *   volForce[i] = volume[i] * trend[i]
 *   emaFast[i]  = EMA(volForce, fastLength)
 *   emaSlow[i]  = EMA(volForce, slowLength)
 *   KVO[i]      = emaFast[i] - emaSlow[i]
 *   signal[i]   = EMA(KVO, signalLength)
 *   bullish    : (KVO - signal) crosses up    (prev <= 0, cur > 0)
 *   bearish    : (KVO - signal) crosses down  (prev >= 0, cur < 0)
 *
 * Defaults: `fastLength = 34`, `slowLength = 55`, `signalLength
 * = 13` (canonical KVO). Regime classifier: `bullish` (KVO >
 * signal), `bearish` (KVO < signal), `neutral` (KVO === signal),
 * `none` (either side null).
 *
 * Bit-exact anchors (three):
 *
 * - **CONST {close = K, volume = V}**: every trend = 0 ->
 *   volForce = 0 -> emaFast = emaSlow = 0 -> KVO = 0 every bar
 *   -> signal EMA of 0s = 0. KVO === signal -> regime
 *   `neutral`, cross count = 0.
 * - **LINEAR UP step > 0 with V > 0**: trend = 1 every bar,
 *   volForce = V (constant). emaFast and emaSlow both collapse
 *   to V via the `min === max` precision fix -> KVO = V - V =
 *   0 -> signal = 0 -> regime `neutral`, cross count = 0.
 * - **LINEAR DOWN step < 0 with V > 0**: trend = -1 every
 *   bar, volForce = -V (constant). emaFast = emaSlow = -V ->
 *   KVO = -V - (-V) = 0 -> signal = 0 -> regime `neutral`,
 *   cross count = 0.
 */

export interface ChartLineKvoCrossPoint {
  x: number;
  close: number;
  volume: number;
}

export type ChartLineKvoCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineKvoCrossSeriesId = 'price' | 'kvo' | 'signal';

export type ChartLineKvoCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineKvoCrossCross {
  index: number;
  x: number;
  kind: ChartLineKvoCrossCrossKind;
}

export interface ChartLineKvoCrossSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  kvo: number | null;
  signal: number | null;
  regime: ChartLineKvoCrossRegime;
}

export interface ChartLineKvoCrossRun {
  series: ChartLineKvoCrossPoint[];
  fastLength: number;
  slowLength: number;
  signalLength: number;
  kvoValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineKvoCrossSample[];
  crosses: ChartLineKvoCrossCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineKvoCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineKvoCrossLayout {
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
  priceDots: ChartLineKvoCrossDot[];
  kvoPath: string;
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
    kind: ChartLineKvoCrossCrossKind;
  }>;
  run: ChartLineKvoCrossRun;
}

export interface ChartLineKvoCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineKvoCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kvoColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showKvo?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineKvoCrossSeriesId[];
  defaultHiddenSeries?: ChartLineKvoCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineKvoCrossSeriesId;
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

export const DEFAULT_CHART_LINE_KVO_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_KVO_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_KVO_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_KVO_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_KVO_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KVO_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KVO_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KVO_CROSS_FAST_LENGTH = 34;
export const DEFAULT_CHART_LINE_KVO_CROSS_SLOW_LENGTH = 55;
export const DEFAULT_CHART_LINE_KVO_CROSS_SIGNAL_LENGTH = 13;
export const DEFAULT_CHART_LINE_KVO_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KVO_CROSS_KVO_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_KVO_CROSS_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_KVO_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_KVO_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_KVO_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_KVO_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KVO_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close / volume. */
export function getLineKvoCrossFinitePoints(
  data: readonly ChartLineKvoCrossPoint[] | null | undefined,
): ChartLineKvoCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineKvoCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume)
    ) {
      out.push({ x: point.x, close: point.close, volume: point.volume });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineKvoCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** SMA-seeded EMA with the precision fix. */
export function applyLineKvoCrossEma(
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

export interface LineKvoCrossChannels {
  kvo: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineKvoCross(
  series: readonly ChartLineKvoCrossPoint[] | null | undefined,
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): LineKvoCrossChannels {
  const cleaned = getLineKvoCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { kvo: [], signal: [] };
  }
  const fastLength = normalizeLineKvoCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KVO_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineKvoCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KVO_CROSS_SLOW_LENGTH,
  );
  const signalLength = normalizeLineKvoCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_KVO_CROSS_SIGNAL_LENGTH,
  );

  const volForce: number[] = new Array(cleaned.length).fill(0);
  for (let i = 1; i < cleaned.length; i += 1) {
    const c = cleaned[i]!.close;
    const cp = cleaned[i - 1]!.close;
    const vol = cleaned[i]!.volume;
    let trend = 0;
    if (c > cp) trend = 1;
    else if (c < cp) trend = -1;
    volForce[i] = posZero(vol * trend);
  }

  // Slice from index 1 so the EMA seed lands aligned with the first
  // computable volume force value.
  const vfTail = volForce.slice(1);
  const emaFastTail = applyLineKvoCrossEma(vfTail, fastLength);
  const emaSlowTail = applyLineKvoCrossEma(vfTail, slowLength);

  const kvo: Array<number | null> = new Array(cleaned.length).fill(null);
  for (let i = 0; i < emaFastTail.length; i += 1) {
    const f = emaFastTail[i];
    const s = emaSlowTail[i];
    if (f == null || s == null) continue;
    kvo[i + 1] = posZero(f - s);
  }

  const signal = applyLineKvoCrossEma(kvo, signalLength);

  return { kvo, signal };
}

export function classifyLineKvoCrossRegime(
  kvo: number | null,
  signal: number | null,
): ChartLineKvoCrossRegime {
  if (kvo == null || signal == null) return 'none';
  if (kvo > signal) return 'bullish';
  if (kvo < signal) return 'bearish';
  return 'neutral';
}

export function detectLineKvoCrossCrosses(
  series: readonly ChartLineKvoCrossPoint[],
  kvo: readonly (number | null)[],
  signal: readonly (number | null)[],
): ChartLineKvoCrossCross[] {
  const out: ChartLineKvoCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prevKvo = kvo[i - 1];
    const prevSig = signal[i - 1];
    const curKvo = kvo[i];
    const curSig = signal[i];
    if (
      prevKvo == null ||
      prevSig == null ||
      curKvo == null ||
      curSig == null
    ) {
      continue;
    }
    const prevDiff = prevKvo - prevSig;
    const curDiff = curKvo - curSig;
    if (prevDiff <= 0 && curDiff > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prevDiff >= 0 && curDiff < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineKvoCross(
  data: ChartLineKvoCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): ChartLineKvoCrossRun {
  const cleaned = getLineKvoCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineKvoCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KVO_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineKvoCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KVO_CROSS_SLOW_LENGTH,
  );
  const signalLength = normalizeLineKvoCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_KVO_CROSS_SIGNAL_LENGTH,
  );

  const channels = computeLineKvoCross(series, {
    fastLength,
    slowLength,
    signalLength,
  });

  const samples: ChartLineKvoCrossSample[] = series.map((p, i) => {
    const kvo = channels.kvo[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const regime = classifyLineKvoCrossRegime(kvo, signal);
    return {
      index: i,
      x: p.x,
      close: p.close,
      volume: p.volume,
      kvo,
      signal,
      regime,
    };
  });

  const crosses = detectLineKvoCrossCrosses(
    series,
    channels.kvo,
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

  const ok = series.length > slowLength + signalLength;

  return {
    series,
    fastLength,
    slowLength,
    signalLength,
    kvoValues: channels.kvo,
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

export interface ComputeLineKvoCrossLayoutOptions {
  data: ChartLineKvoCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineKvoCrossLayout(
  opts: ComputeLineKvoCrossLayoutOptions,
): ChartLineKvoCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_KVO_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_KVO_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_KVO_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_KVO_CROSS_PANEL_GAP;

  const run = runLineKvoCross(opts.data, {
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
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
      kvoPath: '',
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
    if (s.kvo != null) {
      if (s.kvo < oscMin) oscMin = s.kvo;
      if (s.kvo > oscMax) oscMax = s.kvo;
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
  const priceDots: ChartLineKvoCrossDot[] = [];
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

  let kvoPath = '';
  let kvoFirst = true;
  for (const s of run.samples) {
    if (s.kvo == null) {
      kvoFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.kvo);
    kvoPath += `${kvoFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    kvoFirst = false;
  }
  kvoPath = kvoPath.trim();

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
    const cyOsc = syOsc(run.kvoValues[c.index] ?? 0);
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
    kvoPath,
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

export function describeLineKvoCrossChart(
  data: ChartLineKvoCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): string {
  const cleaned = getLineKvoCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fast = normalizeLineKvoCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KVO_CROSS_FAST_LENGTH,
  );
  const slow = normalizeLineKvoCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KVO_CROSS_SLOW_LENGTH,
  );
  const sig = normalizeLineKvoCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_KVO_CROSS_SIGNAL_LENGTH,
  );
  return (
    `KVO Cross chart over ${cleaned.length} bars (fast ${fast}, ` +
    `slow ${slow}, signal ${sig}). Top panel renders the close ` +
    `with bullish / bearish arrow overlays at every cross ` +
    `trigger; bottom panel overlays the Klinger Volume ` +
    `Oscillator with its EMA-smoothed signal line and marks ` +
    `volume force trend events.`
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

export const ChartLineKvoCross = forwardRef<
  HTMLDivElement,
  ChartLineKvoCrossProps
>(function ChartLineKvoCross(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_KVO_CROSS_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_KVO_CROSS_SLOW_LENGTH,
    signalLength = DEFAULT_CHART_LINE_KVO_CROSS_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_KVO_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_KVO_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_KVO_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_KVO_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_KVO_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_KVO_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_KVO_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_KVO_CROSS_PRICE_COLOR,
    kvoColor = DEFAULT_CHART_LINE_KVO_CROSS_KVO_COLOR,
    signalColor = DEFAULT_CHART_LINE_KVO_CROSS_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_KVO_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_KVO_CROSS_BEARISH_COLOR,
    zeroColor = DEFAULT_CHART_LINE_KVO_CROSS_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_KVO_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_KVO_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showKvo = true,
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
    () => getLineKvoCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineKvoCrossLayout({
        data: cleaned,
        fastLength,
        slowLength,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      fastLength,
      slowLength,
      signalLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineKvoCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineKvoCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineKvoCrossSeriesId,
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
        data-section="chart-line-kvo-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineKvoCrossChart(cleaned, {
      fastLength,
      slowLength,
      signalLength,
    });

  const showPrice = !hidden.has('price');
  const showKvoLine = !hidden.has('kvo') && showKvo;
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
      aria-label={ariaLabel ?? 'KVO Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-kvo-cross"
      data-fast-length={fastLength}
      data-slow-length={slowLength}
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
        data-section="chart-line-kvo-cross-title"
      >
        {ariaLabel ?? 'KVO Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-kvo-cross-aria-desc"
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
        data-section="chart-line-kvo-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-kvo-cross-grid">
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
                  data-section="chart-line-kvo-cross-grid-line-price"
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
                  data-section="chart-line-kvo-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-kvo-cross-axes">
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
                  data-section="chart-line-kvo-cross-tick-price"
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
                  data-section="chart-line-kvo-cross-tick-osc"
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
            data-section="chart-line-kvo-cross-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-kvo-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-kvo-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-kvo-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showKvoLine ? (
          <path
            d={layout.kvoPath}
            stroke={kvoColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-kvo-cross-kvo-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-kvo-cross-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-kvo-cross-crosses"
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
                data-section={`chart-line-kvo-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-kvo-cross-overlay-crosses"
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
                data-section={`chart-line-kvo-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-kvo-cross-hover-targets">
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
                data-section="chart-line-kvo-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-kvo-cross-tooltip"
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
                  data-section="chart-line-kvo-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-cross-tooltip-kvo"
                >
                  kvo{' '}
                  {tooltipSample.kvo == null
                    ? '--'
                    : formatOsc(tooltipSample.kvo)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-cross-tooltip-signal"
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
                  data-section="chart-line-kvo-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-cross-tooltip-counts2"
                >
                  neutral {layout.run.neutralCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-cross-tooltip-crosses"
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
          data-section="chart-line-kvo-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          fast {fastLength} | slow {slowLength} | signal {signalLength} |
          crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-kvo-cross-legend"
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
              { id: 'kvo' as const, color: kvoColor, label: 'kvo' },
              {
                id: 'signal' as const,
                color: signalColor,
                label: 'signal',
              },
            ] satisfies Array<{
              id: ChartLineKvoCrossSeriesId;
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

ChartLineKvoCross.displayName = 'ChartLineKvoCross';
