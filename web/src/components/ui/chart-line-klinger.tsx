import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_KLINGER_WIDTH = 560;
export const DEFAULT_CHART_LINE_KLINGER_HEIGHT = 360;
export const DEFAULT_CHART_LINE_KLINGER_PADDING = 40;
export const DEFAULT_CHART_LINE_KLINGER_GAP = 26;
export const DEFAULT_CHART_LINE_KLINGER_PRICE_PANEL_RATIO = 0.54;
export const DEFAULT_CHART_LINE_KLINGER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KLINGER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KLINGER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KLINGER_FAST_PERIOD = 34;
export const DEFAULT_CHART_LINE_KLINGER_SLOW_PERIOD = 55;
export const DEFAULT_CHART_LINE_KLINGER_SIGNAL_PERIOD = 13;
export const DEFAULT_CHART_LINE_KLINGER_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_KLINGER_KVO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_KLINGER_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_KLINGER_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_KLINGER_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_KLINGER_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_KLINGER_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_KLINGER_AXIS_COLOR = '#cbd5e1';

export type ChartLineKlingerSign = 'positive' | 'negative' | 'zero';

export interface ChartLineKlingerPoint {
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartLineKlingerSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vf: number;
  kvo: number | null;
  signal: number | null;
  sign: ChartLineKlingerSign;
}

export interface ChartLineKlingerRun {
  series: ChartLineKlingerPoint[];
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  vf: number[];
  kvo: (number | null)[];
  signal: (number | null)[];
  samples: ChartLineKlingerSample[];
  kvoFinal: number;
  signalFinal: number;
  kvoMin: number;
  kvoMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineKlingerPriceDot {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vf: number;
  kvo: number | null;
  signal: number | null;
  sign: ChartLineKlingerSign;
  px: number;
  py: number;
}

export interface ChartLineKlingerMarker {
  index: number;
  x: number;
  kvo: number;
  sign: ChartLineKlingerSign;
  px: number;
  py: number;
}

export interface ChartLineKlingerPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineKlingerLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineKlingerPanel;
  kvoPanel: ChartLineKlingerPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  kvoYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  kvoYBound: number;
  pricePath: string;
  priceDots: ChartLineKlingerPriceDot[];
  kvoPath: string;
  signalPath: string;
  markers: ChartLineKlingerMarker[];
  zeroY: number;
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  kvoFinal: number;
  signalFinal: number;
  kvoMin: number;
  kvoMax: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineKlingerLayoutOptions {
  data: readonly ChartLineKlingerPoint[];
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineKlingerProps {
  data: readonly ChartLineKlingerPoint[];
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kvoColor?: string;
  signalColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showKvo?: boolean;
  showSignal?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineKlingerPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineKlingerFinitePoints(
  points: readonly ChartLineKlingerPoint[] | null | undefined,
): ChartLineKlingerPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineKlingerPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close) &&
      isFiniteNumber(p.volume),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineKlingerPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Stephen Klinger's Volume Force. Each bar's typical price
 * `(high + low + close) / 3` sets a +1/-1 trend; the daily
 * measurement `high - low` accumulates into a cumulative measurement
 * that resets when the trend flips; the volume force scales volume by
 * the trend and the daily/cumulative ratio.
 */
export function computeLineKlingerVf(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
): {
  hlc: number[];
  trend: number[];
  dm: number[];
  cm: number[];
  vf: number[];
} {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes) ||
    !Array.isArray(volumes)
  ) {
    return { hlc: [], trend: [], dm: [], cm: [], vf: [] };
  }
  const n = Math.min(
    highs.length,
    lows.length,
    closes.length,
    volumes.length,
  );
  const hlc: number[] = new Array(n);
  const trend: number[] = new Array(n);
  const dm: number[] = new Array(n);
  const cm: number[] = new Array(n);
  const vf: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    hlc[i] = (highs[i]! + lows[i]! + closes[i]!) / 3;
    dm[i] = highs[i]! - lows[i]!;
  }
  for (let i = 0; i < n; i += 1) {
    if (i === 0) {
      trend[i] = 1;
      cm[i] = dm[i]!;
      vf[i] = 0;
    } else {
      trend[i] = hlc[i]! > hlc[i - 1]! ? 1 : -1;
      cm[i] =
        trend[i] === trend[i - 1]
          ? cm[i - 1]! + dm[i]!
          : dm[i - 1]! + dm[i]!;
      if (cm[i] === 0) {
        vf[i] = 0;
      } else {
        const raw =
          volumes[i]! *
          Math.abs(2 * (dm[i]! / cm[i]! - 1)) *
          trend[i]! *
          100;
        vf[i] = raw === 0 ? 0 : raw;
      }
    }
  }
  return { hlc, trend, dm, cm, vf };
}

/**
 * An exponential moving average over `period` values, tolerating
 * leading `null` placeholders. The seed is the simple mean of the
 * first `period` defined values placed at that value's index; each
 * later defined value folds in at weight `2 / (period + 1)`.
 */
export function computeLineKlingerEma(
  src: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  const idx: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (isDefined(src[i])) idx.push(i);
  }
  if (idx.length < p) return out;
  const mult = 2 / (p + 1);
  let sum = 0;
  for (let k = 0; k < p; k += 1) sum += src[idx[k]!] as number;
  let ema = sum / p;
  out[idx[p - 1]!] = ema;
  for (let k = p; k < idx.length; k += 1) {
    const i = idx[k]!;
    ema = (src[i] as number) * mult + ema * (1 - mult);
    out[i] = ema;
  }
  return out;
}

/**
 * The Klinger Volume Oscillator: the difference between a fast and a
 * slow exponential moving average of the volume force, with a signal
 * line that is itself an EMA of the oscillator.
 */
export function computeLineKlinger(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number,
): {
  vf: number[];
  fastEma: (number | null)[];
  slowEma: (number | null)[];
  kvo: (number | null)[];
  signal: (number | null)[];
} {
  const { vf } = computeLineKlingerVf(highs, lows, closes, volumes);
  const n = vf.length;
  const fastEma = computeLineKlingerEma(vf, fastPeriod);
  const slowEma = computeLineKlingerEma(vf, slowPeriod);
  const kvo: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const f = fastEma[i];
    const s = slowEma[i];
    if (isDefined(f) && isDefined(s)) {
      const raw = f - s;
      kvo[i] = raw === 0 ? 0 : raw;
    }
  }
  const signal = computeLineKlingerEma(kvo, signalPeriod);
  return { vf, fastEma, slowEma, kvo, signal };
}

function classifySign(v: number | null): ChartLineKlingerSign {
  if (v === null) return 'zero';
  if (v > 0) return 'positive';
  if (v < 0) return 'negative';
  return 'zero';
}

export function runLineKlinger(
  points: readonly ChartLineKlingerPoint[] | null | undefined,
  options?: {
    fastPeriod?: number;
    slowPeriod?: number;
    signalPeriod?: number;
  },
): ChartLineKlingerRun {
  const finite = getLineKlingerFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const fastPeriod = normalizeLineKlingerPeriod(
    options?.fastPeriod ?? DEFAULT_CHART_LINE_KLINGER_FAST_PERIOD,
    DEFAULT_CHART_LINE_KLINGER_FAST_PERIOD,
  );
  const slowPeriod = normalizeLineKlingerPeriod(
    options?.slowPeriod ?? DEFAULT_CHART_LINE_KLINGER_SLOW_PERIOD,
    DEFAULT_CHART_LINE_KLINGER_SLOW_PERIOD,
  );
  const signalPeriod = normalizeLineKlingerPeriod(
    options?.signalPeriod ?? DEFAULT_CHART_LINE_KLINGER_SIGNAL_PERIOD,
    DEFAULT_CHART_LINE_KLINGER_SIGNAL_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      fastPeriod,
      slowPeriod,
      signalPeriod,
      vf: [],
      kvo: [],
      signal: [],
      samples: [],
      kvoFinal: NaN,
      signalFinal: NaN,
      kvoMin: NaN,
      kvoMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const closes = series.map((p) => p.close);
  const volumes = series.map((p) => p.volume);
  const { vf, kvo, signal } = computeLineKlinger(
    highs,
    lows,
    closes,
    volumes,
    fastPeriod,
    slowPeriod,
    signalPeriod,
  );

  const samples: ChartLineKlingerSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
    vf: vf[i]!,
    kvo: kvo[i] ?? null,
    signal: signal[i] ?? null,
    sign: classifySign(kvo[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let kvoMin = NaN;
  let kvoMax = NaN;
  let positiveCount = 0;
  let negativeCount = 0;
  for (const s of samples) {
    if (s.kvo !== null) {
      if (Number.isNaN(kvoMin) || s.kvo < kvoMin) kvoMin = s.kvo;
      if (Number.isNaN(kvoMax) || s.kvo > kvoMax) kvoMax = s.kvo;
    }
    if (s.sign === 'positive') positiveCount += 1;
    if (s.sign === 'negative') negativeCount += 1;
  }

  return {
    series = [],
    fastPeriod,
    slowPeriod,
    signalPeriod,
    vf,
    kvo,
    signal,
    samples,
    kvoFinal: lastDefined(kvo),
    signalFinal: lastDefined(signal),
    kvoMin,
    kvoMax,
    positiveCount,
    negativeCount,
    ok: true,
  };
}

function buildPath(points: readonly { px: number; py: number }[]): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  return parts.join(' ');
}

function normaliseHidden(
  hidden: ReadonlySet<string> | readonly string[] | null | undefined,
): Set<string> {
  if (!hidden) return new Set();
  if (hidden instanceof Set) return new Set(hidden);
  if (Array.isArray(hidden)) return new Set(hidden);
  return new Set();
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineKlingerLayout(
  options: ComputeLineKlingerLayoutOptions,
): ChartLineKlingerLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_KLINGER_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_KLINGER_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_KLINGER_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineKlingerPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineKlinger(data, {
    ...(isFiniteNumber(options.fastPeriod)
      ? { fastPeriod: options.fastPeriod }
      : {}),
    ...(isFiniteNumber(options.slowPeriod)
      ? { slowPeriod: options.slowPeriod }
      : {}),
    ...(isFiniteNumber(options.signalPeriod)
      ? { signalPeriod: options.signalPeriod }
      : {}),
  });
  const empty: ChartLineKlingerLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    kvoPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    kvoYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    kvoYBound: 0,
    pricePath: '',
    priceDots: [],
    kvoPath: '',
    signalPath: '',
    markers: [],
    zeroY: 0,
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    signalPeriod: run.signalPeriod,
    kvoFinal: NaN,
    signalFinal: NaN,
    kvoMin: NaN,
    kvoMax: NaN,
    positiveCount: 0,
    negativeCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const kvoH = usableHeight - priceH;
  if (priceH <= 0 || kvoH <= 0) return empty;

  const pricePanel: ChartLineKlingerPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const kvoPanel: ChartLineKlingerPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: kvoH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let bound = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.close < pyLo) pyLo = s.close;
    if (s.close > pyHi) pyHi = s.close;
    if (s.kvo !== null && Math.abs(s.kvo) > bound) bound = Math.abs(s.kvo);
    if (s.signal !== null && Math.abs(s.signal) > bound) {
      bound = Math.abs(s.signal);
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }
  if (bound <= 0) bound = 1;

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectKvoY = (v: number): number =>
    kvoPanel.y +
    kvoPanel.height -
    ((v + bound) / (2 * bound)) * kvoPanel.height;

  const priceDots: ChartLineKlingerPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    high: s.high,
    low: s.low,
    close: s.close,
    volume: s.volume,
    vf: s.vf,
    kvo: s.kvo,
    signal: s.signal,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.close),
  }));

  const kvoPts: { px: number; py: number }[] = [];
  const signalPts: { px: number; py: number }[] = [];
  const markers: ChartLineKlingerMarker[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    if (s.kvo !== null) {
      const py = projectKvoY(s.kvo);
      kvoPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        kvo: s.kvo,
        sign: s.sign,
        px,
        py,
      });
    }
    if (s.signal !== null) {
      signalPts.push({ px, py: projectKvoY(s.signal) });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    kvoPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    kvoYTicks: computeTicks(-bound, bound, tickCount).map((v) => ({
      value: v,
      py: projectKvoY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    kvoYBound: bound,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    kvoPath: buildPath(kvoPts),
    signalPath: buildPath(signalPts),
    markers,
    zeroY: projectKvoY(0),
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    signalPeriod: run.signalPeriod,
    kvoFinal: run.kvoFinal,
    signalFinal: run.signalFinal,
    kvoMin: run.kvoMin,
    kvoMax: run.kvoMax,
    positiveCount: run.positiveCount,
    negativeCount: run.negativeCount,
    totalPoints: run.samples.length,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineKlingerChart(
  data: readonly ChartLineKlingerPoint[] | null | undefined,
  options?: {
    fastPeriod?: number;
    slowPeriod?: number;
    signalPeriod?: number;
  },
): string {
  const run = runLineKlinger(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Klinger Volume Oscillator panel (EMA ${run.fastPeriod}/${run.slowPeriod}, signal ${run.signalPeriod}): the Klinger Volume Oscillator builds a volume force from each bar's range, trend and volume, then takes the difference of a fast and a slow exponential moving average of it; the signal line is an EMA of the oscillator. It swings around zero. ${run.positiveCount} readings above and ${run.negativeCount} below the zero line across ${run.samples.length} periods.`;
}

const KLINGER_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineKlinger = forwardRef<
  HTMLDivElement,
  ChartLineKlingerProps
>(function ChartLineKlinger(
  props: ChartLineKlingerProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    fastPeriod,
    slowPeriod,
    signalPeriod,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_KLINGER_WIDTH,
    height = DEFAULT_CHART_LINE_KLINGER_HEIGHT,
    padding = DEFAULT_CHART_LINE_KLINGER_PADDING,
    gap = DEFAULT_CHART_LINE_KLINGER_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_KLINGER_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_KLINGER_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_KLINGER_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_KLINGER_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_KLINGER_PRICE_COLOR,
    kvoColor = DEFAULT_CHART_LINE_KLINGER_KVO_COLOR,
    signalColor = DEFAULT_CHART_LINE_KLINGER_SIGNAL_COLOR,
    positiveColor = DEFAULT_CHART_LINE_KLINGER_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_KLINGER_NEGATIVE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_KLINGER_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_KLINGER_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_KLINGER_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showKvo = true,
    showSignal = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a Klinger Volume Oscillator panel',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    onPointClick,
    onSeriesToggle,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const isControlled = controlledHidden !== undefined;
  const [uncontrolled, setUncontrolled] = useState<Set<string>>(() =>
    normaliseHidden(defaultHiddenSeries),
  );
  const hiddenSet = isControlled
    ? normaliseHidden(controlledHidden)
    : uncontrolled;

  const layout = useMemo(
    () =>
      computeLineKlingerLayout({
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        ...(isFiniteNumber(fastPeriod) ? { fastPeriod } : {}),
        ...(isFiniteNumber(slowPeriod) ? { slowPeriod } : {}),
        ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
      }),
    [
      data,
      width,
      height,
      padding,
      gap,
      pricePanelRatio,
      tickCount,
      fastPeriod,
      slowPeriod,
      signalPeriod,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineKlingerChart(data, {
        ...(isFiniteNumber(fastPeriod) ? { fastPeriod } : {}),
        ...(isFiniteNumber(slowPeriod) ? { slowPeriod } : {}),
        ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
      }),
    [ariaDescription, data, fastPeriod, slowPeriod, signalPeriod],
  );

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHoverIndex(null);
    setTooltipPos(null);
  }, []);

  const handleToggle = useCallback(
    (seriesId: string) => {
      const next = new Set(hiddenSet);
      const willHide = !next.has(seriesId);
      if (willHide) next.add(seriesId);
      else next.delete(seriesId);
      if (!isControlled) setUncontrolled(next);
      onHiddenSeriesChange?.(next);
      onSeriesToggle?.({ seriesId, hidden: willHide });
    },
    [hiddenSet, isControlled, onHiddenSeriesChange, onSeriesToggle],
  );

  const signColor = useCallback(
    (s: ChartLineKlingerSign): string =>
      s === 'positive'
        ? positiveColor
        : s === 'negative'
          ? negativeColor
          : kvoColor,
    [positiveColor, negativeColor, kvoColor],
  );

  const containerStyle: CSSProperties = {
    width,
    height,
    position: 'relative',
    ...(style ?? {}),
  };

  if (!layout.ok) {
    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={className}
        style={containerStyle}
        data-section="chart-line-klinger"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-klinger-aria-desc"
          style={KLINGER_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const kp = layout.kvoPanel;
  const priceVisible = !hiddenSet.has('price');
  const kvoVisible = showKvo && !hiddenSet.has('kvo');
  const signalVisible = showSignal && !hiddenSet.has('signal');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'kvo', label: 'KVO', color: kvoColor },
    { id: 'signal', label: 'Signal', color: signalColor },
  ];

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={
        [className, animateClass].filter(Boolean).join(' ') || undefined
      }
      style={containerStyle}
      data-section="chart-line-klinger"
      data-empty="false"
      data-fast-period={layout.fastPeriod}
      data-slow-period={layout.slowPeriod}
      data-signal-period={layout.signalPeriod}
      data-kvo-final={layout.kvoFinal}
      data-positive-count={layout.positiveCount}
      data-negative-count={layout.negativeCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-klinger-aria-desc"
        style={KLINGER_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-klinger-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-klinger-badge"
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: '#0f172a',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-klinger-badge-icon"
              aria-hidden="true"
              style={{ color: kvoColor }}
            >
              KLINGER
            </span>
            <span data-section="chart-line-klinger-badge-ema">
              {layout.fastPeriod}/{layout.slowPeriod}
            </span>
            <span data-section="chart-line-klinger-badge-signal">
              s={layout.signalPeriod}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-klinger-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-klinger-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`pgy-${i}`}
                  data-section="chart-line-klinger-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.kvoYTicks.map((t, i) => (
                <line
                  key={`kgy-${i}`}
                  data-section="chart-line-klinger-grid-line"
                  data-panel="kvo"
                  x1={kp.x}
                  x2={kp.x + kp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-klinger-zero-line"
              x1={kp.x}
              x2={kp.x + kp.width}
              y1={layout.zeroY}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-klinger-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              {[
                { panel: pp, name: 'price', yt: layout.priceYTicks },
                { panel: kp, name: 'kvo', yt: layout.kvoYTicks },
              ].map((cfg) => (
                <g
                  key={`axis-${cfg.name}`}
                  data-section="chart-line-klinger-axis-group"
                  data-panel={cfg.name}
                >
                  <line
                    data-section="chart-line-klinger-axis"
                    data-panel={cfg.name}
                    data-axis="x"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y + cfg.panel.height}
                    x2={cfg.panel.x + cfg.panel.width}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  <line
                    data-section="chart-line-klinger-axis"
                    data-panel={cfg.name}
                    data-axis="y"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y}
                    x2={cfg.panel.x}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  {cfg.yt.map((t, i) => (
                    <g
                      key={`yt-${cfg.name}-${i}`}
                      data-section="chart-line-klinger-tick"
                      data-panel={cfg.name}
                      data-axis="y"
                    >
                      <line
                        x1={cfg.panel.x - 4}
                        x2={cfg.panel.x}
                        y1={t.py}
                        y2={t.py}
                      />
                      <text
                        data-section="chart-line-klinger-tick-label"
                        data-panel={cfg.name}
                        data-axis="y"
                        x={cfg.panel.x - 6}
                        y={t.py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatValue(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              ))}
              <g data-section="chart-line-klinger-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`tx-${i}`}
                    data-section="chart-line-klinger-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={kp.y + kp.height}
                      y2={kp.y + kp.height + 4}
                    />
                    <text
                      data-section="chart-line-klinger-tick-label"
                      data-axis="x"
                      x={t.px}
                      y={kp.y + kp.height + 14}
                      textAnchor="middle"
                      fontSize={10}
                      fill={axisColor}
                      stroke="none"
                    >
                      {formatX(t.value)}
                    </text>
                  </g>
                ))}
              </g>
            </g>
          ) : null}

          <g data-section="chart-line-klinger-panel-labels">
            <text
              data-section="chart-line-klinger-panel-label"
              data-panel="price"
              x={pp.x + pp.width / 2}
              y={pp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Price
            </text>
            <text
              data-section="chart-line-klinger-panel-label"
              data-panel="kvo"
              x={kp.x + kp.width / 2}
              y={kp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Klinger Volume Oscillator
            </text>
          </g>

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-klinger-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-klinger-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                    data-section="chart-line-klinger-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-value={d.close}
                    cx={d.px}
                    cy={d.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={priceColor}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverIndex(d.index);
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(d.index);
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => onPointClick?.({ point: d })}
                  />
                );
              })}
            </g>
          ) : null}

          {signalVisible && layout.signalPath ? (
            <path
              data-section="chart-line-klinger-signal-line"
              d={layout.signalPath}
              fill="none"
              stroke={signalColor}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {kvoVisible && layout.kvoPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Klinger Volume Oscillator line"
              data-section="chart-line-klinger-kvo-line"
              d={layout.kvoPath}
              fill="none"
              stroke={kvoColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {kvoVisible ? (
            <g data-section="chart-line-klinger-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Klinger Volume Oscillator at x ${formatX(m.x)}: ${formatValue(m.kvo)} (${m.sign})`}
                    data-section="chart-line-klinger-marker"
                    data-point-index={m.index}
                    data-kvo={m.kvo}
                    data-sign={m.sign}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={signColor(m.sign)}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverIndex(m.index);
                      setTooltipPos({ px: m.px, py: m.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(m.index);
                      setTooltipPos({ px: m.px, py: m.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => {
                      const d = layout.priceDots.find(
                        (x) => x.index === m.index,
                      );
                      if (d) onPointClick?.({ point: d });
                    }}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoverIndex !== null && tooltipPos
          ? (() => {
              const d = layout.priceDots.find((x) => x.index === hoverIndex);
              if (!d) return null;
              return (
                <div
                  data-section="chart-line-klinger-tooltip"
                  data-point-index={d.index}
                  style={{
                    position: 'absolute',
                    left: tooltipPos.px + 8,
                    top: tooltipPos.py + 8,
                    background: '#0f172a',
                    color: '#f8fafc',
                    padding: '6px 8px',
                    fontSize: 11,
                    borderRadius: 4,
                    pointerEvents: 'none',
                    minWidth: 150,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div data-section="chart-line-klinger-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-klinger-tooltip-close"
                    style={{ fontWeight: 600 }}
                  >
                    close: {formatValue(d.close)}
                  </div>
                  <div data-section="chart-line-klinger-tooltip-volume">
                    volume: {formatValue(d.volume)}
                  </div>
                  <div data-section="chart-line-klinger-tooltip-vf">
                    volume force: {formatValue(d.vf)}
                  </div>
                  <div data-section="chart-line-klinger-tooltip-kvo">
                    kvo: {d.kvo === null ? 'n/a' : formatValue(d.kvo)}
                  </div>
                  <div data-section="chart-line-klinger-tooltip-signal">
                    signal:{' '}
                    {d.signal === null ? 'n/a' : formatValue(d.signal)}
                  </div>
                  <div data-section="chart-line-klinger-tooltip-sign">
                    sign: {d.sign}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-klinger-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          {legendItems.map((item) => {
            const isHidden = hiddenSet.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-section="chart-line-klinger-legend-item"
                data-series-id={item.id}
                data-hidden={isHidden ? 'true' : 'false'}
                onClick={() => handleToggle(item.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  opacity: isHidden ? 0.5 : 1,
                }}
              >
                <span
                  data-section="chart-line-klinger-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-klinger-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-klinger-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.positiveCount} above, {layout.negativeCount} below
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineKlinger.displayName = 'ChartLineKlinger';
