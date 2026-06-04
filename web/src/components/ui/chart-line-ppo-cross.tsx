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
 * ChartLinePpoCross -- pure-SVG dual-panel chart with the close on
 * top and the Percentage Price Oscillator plus its signal line on
 * the bottom. PPO normalises the MACD difference by the slow EMA
 * so the resulting oscillator is independent of price magnitude
 * and comparable across instruments:
 *
 *   ema1[i]   = EMA(close, fastLength)
 *   ema2[i]   = EMA(close, slowLength)
 *   PPO[i]    = ema2[i] === 0 ? null
 *                             : (ema1[i] - ema2[i]) / ema2[i] * 100
 *   signal[i] = EMA(PPO, signalLength)
 *
 * Cross events: `up` (PPO newly exceeds signal -> regime
 * `accelerating-up`), `down` (PPO newly drops below signal ->
 * regime `accelerating-down`). The zero-line bias is reported in
 * the tooltip as `bullish` (PPO > 0), `bearish` (PPO < 0) or
 * `neutral` (= 0).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K (K > 0)**: every EMA collapses to K via the
 *   SMA-seeded `min === max` precision fix. `PPO = (K - K) / K *
 *   100 = 0`, `signal = EMA(0) = 0`. Relation `equal` forever,
 *   regime `aligned`, zero crosses. Verified across multiple K
 *   and `(fastLength, slowLength, signalLength)` tuples.
 *
 * Soft anchor:
 *
 * - **LINEAR UP / DOWN**: PPO and signal share the same sign once
 *   defined (positive for LINEAR UP, negative for LINEAR DOWN)
 *   and the signal trails PPO in the same direction -- so they
 *   never cross back the other way. Zero crosses.
 */

export interface ChartLinePpoCrossPoint {
  x: number;
  close: number;
}

export type ChartLinePpoCrossRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLinePpoCrossCross = 'up' | 'down' | null;

export type ChartLinePpoCrossBias = 'bullish' | 'bearish' | 'neutral' | null;

export type ChartLinePpoCrossSeriesId = 'price' | 'ppo' | 'signal';

export interface ChartLinePpoCrossSample {
  index: number;
  x: number;
  close: number;
  ppo: number | null;
  signal: number | null;
  relation: ChartLinePpoCrossRelation;
  bias: ChartLinePpoCrossBias;
  crossed: ChartLinePpoCrossCross;
}

export interface ChartLinePpoCrossRun {
  series: ChartLinePpoCrossPoint[];
  fastLength: number;
  slowLength: number;
  signalLength: number;
  ppoValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLinePpoCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  neutralCrossCount: number;
  ok: boolean;
}

export interface ChartLinePpoCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  ppo: number;
  kind: 'up' | 'down';
  bias: NonNullable<ChartLinePpoCrossBias>;
}

export interface ChartLinePpoCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLinePpoCrossLayout {
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
  priceDots: ChartLinePpoCrossDot[];
  ppoPath: string;
  signalPath: string;
  markers: ChartLinePpoCrossMarker[];
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  run: ChartLinePpoCrossRun;
}

export interface ChartLinePpoCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLinePpoCrossPoint[];
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
  markerRadius?: number;
  priceColor?: string;
  ppoColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  neutralColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPpo?: boolean;
  showSignal?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLinePpoCrossSeriesId[];
  defaultHiddenSeries?: ChartLinePpoCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLinePpoCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLinePpoCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatPpo?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_PPO_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_PPO_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_PPO_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_PPO_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_PPO_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PPO_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PPO_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PPO_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_PPO_CROSS_FAST_LENGTH = 12;
export const DEFAULT_CHART_LINE_PPO_CROSS_SLOW_LENGTH = 26;
export const DEFAULT_CHART_LINE_PPO_CROSS_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_PPO_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_PPO_CROSS_PPO_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_PPO_CROSS_SIGNAL_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_PPO_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PPO_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PPO_CROSS_NEUTRAL_COLOR = '#475569';
export const DEFAULT_CHART_LINE_PPO_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_PPO_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PPO_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLinePpoCrossFinitePoints(
  data: readonly ChartLinePpoCrossPoint[] | null | undefined,
): ChartLinePpoCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLinePpoCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLinePpoCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * SMA-seeded EMA with `min === max` precision fix and CONST short-
 * circuit.
 */
export function applyLinePpoCrossEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);
  let smoothed: number | null = null;
  let sum = 0;
  let count = 0;
  let seedMin = Infinity;
  let seedMax = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      smoothed = null;
      sum = 0;
      count = 0;
      seedMin = Infinity;
      seedMax = -Infinity;
      continue;
    }
    if (smoothed == null) {
      sum += v;
      count += 1;
      if (v < seedMin) seedMin = v;
      if (v > seedMax) seedMax = v;
      if (count >= length) {
        smoothed = seedMin === seedMax ? seedMin : sum / length;
        out[i] = posZero(smoothed);
      }
    } else {
      const next =
        v === smoothed ? v : alpha * v + (1 - alpha) * smoothed;
      smoothed = next;
      out[i] = posZero(next);
    }
  }
  return out;
}

export interface LinePpoCrossChannels {
  ema1: Array<number | null>;
  ema2: Array<number | null>;
  ppo: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLinePpoCross(
  series: readonly ChartLinePpoCrossPoint[] | null | undefined,
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): LinePpoCrossChannels {
  const cleaned = getLinePpoCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { ema1: [], ema2: [], ppo: [], signal: [] };
  }
  const fastLength = normalizeLinePpoCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_PPO_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLinePpoCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_PPO_CROSS_SLOW_LENGTH,
  );
  const signalLength = normalizeLinePpoCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_PPO_CROSS_SIGNAL_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const ema1 = applyLinePpoCrossEma(closes, fastLength);
  const ema2 = applyLinePpoCrossEma(closes, slowLength);
  const ppo: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const a = ema1[i];
    const b = ema2[i];
    if (a == null || b == null) continue;
    if (b === 0) continue;
    ppo[i] = posZero(((a - b) / b) * 100);
  }
  const signal = applyLinePpoCrossEma(ppo, signalLength);
  return { ema1, ema2, ppo, signal };
}

export function classifyLinePpoCrossRelation(
  ppo: number | null,
  signal: number | null,
): ChartLinePpoCrossRelation {
  if (ppo == null || signal == null) return 'none';
  if (ppo > signal) return 'bullish';
  if (ppo < signal) return 'bearish';
  return 'equal';
}

export function classifyLinePpoCrossBias(
  ppo: number | null,
): ChartLinePpoCrossBias {
  if (ppo == null) return null;
  if (ppo > 0) return 'bullish';
  if (ppo < 0) return 'bearish';
  return 'neutral';
}

export function detectLinePpoCrossCrosses(
  ppoValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLinePpoCrossCross[] {
  const out: ChartLinePpoCrossCross[] = [];
  let prevP: number | null = null;
  let prevS: number | null = null;
  for (let i = 0; i < ppoValues.length; i += 1) {
    const p = ppoValues[i];
    const s = signalValues[i];
    if (p == null || s == null) {
      out.push(null);
      prevP = null;
      prevS = null;
      continue;
    }
    if (prevP == null || prevS == null) {
      out.push(null);
      prevP = p;
      prevS = s;
      continue;
    }
    if (prevP <= prevS && p > s) {
      out.push('up');
    } else if (prevP >= prevS && p < s) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevP = p;
    prevS = s;
  }
  return out;
}

export function runLinePpoCross(
  data: ChartLinePpoCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): ChartLinePpoCrossRun {
  const cleaned = getLinePpoCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLinePpoCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_PPO_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLinePpoCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_PPO_CROSS_SLOW_LENGTH,
  );
  const signalLength = normalizeLinePpoCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_PPO_CROSS_SIGNAL_LENGTH,
  );

  const channels = computeLinePpoCross(series, {
    fastLength,
    slowLength,
    signalLength,
  });
  const crosses = detectLinePpoCrossCrosses(channels.ppo, channels.signal);

  const samples: ChartLinePpoCrossSample[] = series.map((p, i) => {
    const ppo = channels.ppo[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const relation = classifyLinePpoCrossRelation(ppo, signal);
    const bias = classifyLinePpoCrossBias(ppo);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      ppo,
      signal,
      relation,
      bias,
      crossed,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  let neutralCrossCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.crossed != null) {
      if (s.bias === 'bullish') bullishCrossCount += 1;
      else if (s.bias === 'bearish') bearishCrossCount += 1;
      else neutralCrossCount += 1;
    }
  }

  const ok = series.length > slowLength + signalLength;

  return {
    series,
    fastLength,
    slowLength,
    signalLength,
    ppoValues: channels.ppo,
    signalValues: channels.signal,
    samples,
    upCrossCount,
    downCrossCount,
    bullishCrossCount,
    bearishCrossCount,
    neutralCrossCount,
    ok,
  };
}

export interface ComputeLinePpoCrossLayoutOptions {
  data: ChartLinePpoCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLinePpoCrossLayout(
  opts: ComputeLinePpoCrossLayoutOptions,
): ChartLinePpoCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_PPO_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_PPO_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_PPO_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_PPO_CROSS_PANEL_GAP;

  const run = runLinePpoCross(opts.data, {
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
      ppoPath: '',
      signalPath: '',
      markers: [],
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
      zeroY: (oscTop + oscBottom) / 2,
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
    if (s.ppo != null) {
      if (s.ppo < oscMin) oscMin = s.ppo;
      if (s.ppo > oscMax) oscMax = s.ppo;
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
  const priceDots: ChartLinePpoCrossDot[] = [];
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

  const buildPath = (key: 'ppo' | 'signal'): string => {
    let p = '';
    let first = true;
    for (const s of run.samples) {
      const v = s[key];
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = syOsc(v);
      p += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return p.trim();
  };

  const ppoPath = buildPath('ppo');
  const signalPath = buildPath('signal');

  const markers: ChartLinePpoCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.ppo == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syOsc(s.ppo),
      ppo: s.ppo,
      kind: s.crossed,
      bias: s.bias ?? 'neutral',
    });
  }

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
    ppoPath,
    signalPath,
    markers,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY: syOsc(0),
    run,
  };
}

export function describeLinePpoCrossChart(
  data: ChartLinePpoCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): string {
  const cleaned = getLinePpoCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fastLength = normalizeLinePpoCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_PPO_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLinePpoCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_PPO_CROSS_SLOW_LENGTH,
  );
  const signalLength = normalizeLinePpoCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_PPO_CROSS_SIGNAL_LENGTH,
  );
  return (
    `PPO Cross chart over ${cleaned.length} bars (fastLength ` +
    `${fastLength}, slowLength ${slowLength}, signalLength ` +
    `${signalLength}). Top panel renders the close; bottom panel ` +
    `renders the Percentage Price Oscillator and its signal line ` +
    `with markers at every PPO-vs-signal cross (up -> ` +
    `accelerating-up, down -> accelerating-down).`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultPpoFormatter = (value: number): string => formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLinePpoCross = forwardRef<
  HTMLDivElement,
  ChartLinePpoCrossProps
>(function ChartLinePpoCross(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_PPO_CROSS_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_PPO_CROSS_SLOW_LENGTH,
    signalLength = DEFAULT_CHART_LINE_PPO_CROSS_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_PPO_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_PPO_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_PPO_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_PPO_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_PPO_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_PPO_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_PPO_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_PPO_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_PPO_CROSS_PRICE_COLOR,
    ppoColor = DEFAULT_CHART_LINE_PPO_CROSS_PPO_COLOR,
    signalColor = DEFAULT_CHART_LINE_PPO_CROSS_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_PPO_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_PPO_CROSS_BEARISH_COLOR,
    neutralColor = DEFAULT_CHART_LINE_PPO_CROSS_NEUTRAL_COLOR,
    zeroColor = DEFAULT_CHART_LINE_PPO_CROSS_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_PPO_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_PPO_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPpo = true,
    showSignal = true,
    showMarkers = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onCrossClick,
    formatPrice = defaultPriceFormatter,
    formatPpo = defaultPpoFormatter,
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

  const cleaned = useMemo(() => getLinePpoCrossFinitePoints(data), [data]);

  const layout = useMemo(
    () =>
      computeLinePpoCrossLayout({
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
    ChartLinePpoCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLinePpoCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLinePpoCrossSeriesId,
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
        data-section="chart-line-ppo-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLinePpoCrossChart(cleaned, {
      fastLength,
      slowLength,
      signalLength,
    });

  const showPrice = !hidden.has('price');
  const showPpoLine = !hidden.has('ppo') && showPpo;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
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

  const markerColor = (
    bias: NonNullable<ChartLinePpoCrossBias>,
  ): string => {
    if (bias === 'bullish') return bullishColor;
    if (bias === 'bearish') return bearishColor;
    return neutralColor;
  };

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'PPO Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-ppo-cross"
      data-fast-length={fastLength}
      data-slow-length={slowLength}
      data-signal-length={signalLength}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-ppo-cross-title"
      >
        {ariaLabel ?? 'PPO Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-ppo-cross-aria-desc"
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
        data-section="chart-line-ppo-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-ppo-cross-grid">
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
                  data-section="chart-line-ppo-cross-grid-line-price"
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
                  data-section="chart-line-ppo-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-ppo-cross-axes">
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
                  data-section="chart-line-ppo-cross-tick-price"
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
                  data-section="chart-line-ppo-cross-tick-osc"
                >
                  {formatPpo(v)}
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
            data-section="chart-line-ppo-cross-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ppo-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-ppo-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-ppo-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ppo-cross-signal"
          />
        ) : null}

        {showPpoLine ? (
          <path
            d={layout.ppoPath}
            stroke={ppoColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ppo-cross-ppo"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-ppo-cross-markers">
            {layout.markers.map((m) => (
              <circle
                key={`marker-${m.index}-${m.kind}`}
                cx={m.cx}
                cy={m.cy}
                r={markerRadius}
                fill={markerColor(m.bias)}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onCrossClick?.({ point: sample });
                }}
                data-section="chart-line-ppo-cross-marker"
                data-kind={m.kind}
                data-bias={m.bias}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-ppo-cross-hover-targets">
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
                data-section="chart-line-ppo-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-ppo-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={200}
                  height={140}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ppo-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ppo-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ppo-cross-tooltip-ppo"
                >
                  ppo{' '}
                  {tooltipSample.ppo == null
                    ? '--'
                    : formatPpo(tooltipSample.ppo)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ppo-cross-tooltip-signal"
                >
                  signal{' '}
                  {tooltipSample.signal == null
                    ? '--'
                    : formatPpo(tooltipSample.signal)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ppo-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ppo-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias ?? '--'}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ppo-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ppo-cross-tooltip-counts"
                >
                  up {layout.run.upCrossCount} | down{' '}
                  {layout.run.downCrossCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-ppo-cross-badge"
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
          up {layout.run.upCrossCount} | down {layout.run.downCrossCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-ppo-cross-legend"
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
              { id: 'ppo' as const, color: ppoColor, label: 'ppo' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLinePpoCrossSeriesId;
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

ChartLinePpoCross.displayName = 'ChartLinePpoCross';
