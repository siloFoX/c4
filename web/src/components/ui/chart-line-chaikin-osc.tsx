import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CHAIKIN_OSC_WIDTH = 560;
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_HEIGHT = 360;
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_PADDING = 40;
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_GAP = 26;
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_PRICE_PANEL_RATIO = 0.54;
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_FAST_PERIOD = 3;
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_SLOW_PERIOD = 10;
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_OSC_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CHAIKIN_OSC_AXIS_COLOR = '#cbd5e1';

export type ChartLineChaikinOscSign = 'positive' | 'negative' | 'zero';

export interface ChartLineChaikinOscPoint {
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartLineChaikinOscSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adl: number;
  oscillator: number | null;
  sign: ChartLineChaikinOscSign;
}

export interface ChartLineChaikinOscRun {
  series: ChartLineChaikinOscPoint[];
  fastPeriod: number;
  slowPeriod: number;
  adl: number[];
  fastEma: (number | null)[];
  slowEma: (number | null)[];
  oscillator: (number | null)[];
  samples: ChartLineChaikinOscSample[];
  oscFinal: number;
  oscMin: number;
  oscMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineChaikinOscPriceDot {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adl: number;
  oscillator: number | null;
  sign: ChartLineChaikinOscSign;
  px: number;
  py: number;
}

export interface ChartLineChaikinOscMarker {
  index: number;
  x: number;
  oscillator: number;
  sign: ChartLineChaikinOscSign;
  px: number;
  py: number;
}

export interface ChartLineChaikinOscPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineChaikinOscLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineChaikinOscPanel;
  oscPanel: ChartLineChaikinOscPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  oscYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  oscYBound: number;
  pricePath: string;
  priceDots: ChartLineChaikinOscPriceDot[];
  oscPath: string;
  markers: ChartLineChaikinOscMarker[];
  zeroY: number;
  fastPeriod: number;
  slowPeriod: number;
  oscFinal: number;
  oscMin: number;
  oscMax: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineChaikinOscLayoutOptions {
  data: readonly ChartLineChaikinOscPoint[];
  fastPeriod?: number;
  slowPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineChaikinOscProps {
  data: readonly ChartLineChaikinOscPoint[];
  fastPeriod?: number;
  slowPeriod?: number;
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
  oscColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showOscillator?: boolean;
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
  onPointClick?: (payload: { point: ChartLineChaikinOscPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineChaikinOscFinitePoints(
  points: readonly ChartLineChaikinOscPoint[] | null | undefined,
): ChartLineChaikinOscPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineChaikinOscPoint =>
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
export function normalizeLineChaikinOscPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Marc Chaikin's Money Flow Multiplier: where the close sits within
 * the bar's high-low range, scaled to [-1, +1]. A zero-range bar
 * reads 0.
 */
export function computeLineChaikinOscMfm(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
): number[] {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes)
  ) {
    return [];
  }
  const n = Math.min(highs.length, lows.length, closes.length);
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const range = highs[i]! - lows[i]!;
    if (range === 0) {
      out[i] = 0;
    } else {
      const raw =
        (closes[i]! - lows[i]! - (highs[i]! - closes[i]!)) / range;
      out[i] = raw === 0 ? 0 : raw;
    }
  }
  return out;
}

/**
 * The Accumulation/Distribution Line: each bar's Money Flow
 * Multiplier scales its volume into Money Flow Volume, accumulated
 * into a running cumulative total.
 */
export function computeLineChaikinOscAdl(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
): { mfm: number[]; mfv: number[]; adl: number[] } {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes) ||
    !Array.isArray(volumes)
  ) {
    return { mfm: [], mfv: [], adl: [] };
  }
  const n = Math.min(
    highs.length,
    lows.length,
    closes.length,
    volumes.length,
  );
  const mfmFull = computeLineChaikinOscMfm(highs, lows, closes);
  const mfm: number[] = new Array(n);
  const mfv: number[] = new Array(n);
  const adl: number[] = new Array(n);
  let running = 0;
  for (let i = 0; i < n; i += 1) {
    mfm[i] = mfmFull[i]!;
    const rawMfv = mfm[i]! * volumes[i]!;
    mfv[i] = rawMfv === 0 ? 0 : rawMfv;
    running = i === 0 ? mfv[i]! : running + mfv[i]!;
    adl[i] = running === 0 ? 0 : running;
  }
  return { mfm, mfv, adl };
}

/**
 * An exponential moving average over `period` values. The seed is
 * the simple mean of the first `period` values; each later value
 * folds in at weight `2 / (period + 1)`.
 */
export function computeLineChaikinOscEma(
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
 * Marc Chaikin's Oscillator: the difference between a fast and a
 * slow exponential moving average of the Accumulation Distribution
 * Line, measuring the momentum of accumulation and distribution.
 */
export function computeLineChaikinOsc(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
  fastPeriod: number,
  slowPeriod: number,
): {
  adl: number[];
  fastEma: (number | null)[];
  slowEma: (number | null)[];
  oscillator: (number | null)[];
} {
  const { adl } = computeLineChaikinOscAdl(highs, lows, closes, volumes);
  const n = adl.length;
  const fastEma = computeLineChaikinOscEma(adl, fastPeriod);
  const slowEma = computeLineChaikinOscEma(adl, slowPeriod);
  const oscillator: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const f = fastEma[i];
    const s = slowEma[i];
    if (isDefined(f) && isDefined(s)) {
      const raw = f - s;
      oscillator[i] = raw === 0 ? 0 : raw;
    }
  }
  return { adl, fastEma, slowEma, oscillator };
}

function classifySign(v: number | null): ChartLineChaikinOscSign {
  if (v === null) return 'zero';
  if (v > 0) return 'positive';
  if (v < 0) return 'negative';
  return 'zero';
}

export function runLineChaikinOsc(
  points: readonly ChartLineChaikinOscPoint[] | null | undefined,
  options?: { fastPeriod?: number; slowPeriod?: number },
): ChartLineChaikinOscRun {
  const finite = getLineChaikinOscFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const fastPeriod = normalizeLineChaikinOscPeriod(
    options?.fastPeriod ?? DEFAULT_CHART_LINE_CHAIKIN_OSC_FAST_PERIOD,
    DEFAULT_CHART_LINE_CHAIKIN_OSC_FAST_PERIOD,
  );
  const slowPeriod = normalizeLineChaikinOscPeriod(
    options?.slowPeriod ?? DEFAULT_CHART_LINE_CHAIKIN_OSC_SLOW_PERIOD,
    DEFAULT_CHART_LINE_CHAIKIN_OSC_SLOW_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      fastPeriod,
      slowPeriod,
      adl: [],
      fastEma: [],
      slowEma: [],
      oscillator: [],
      samples: [],
      oscFinal: NaN,
      oscMin: NaN,
      oscMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const closes = series.map((p) => p.close);
  const volumes = series.map((p) => p.volume);
  const { adl, fastEma, slowEma, oscillator } = computeLineChaikinOsc(
    highs,
    lows,
    closes,
    volumes,
    fastPeriod,
    slowPeriod,
  );

  const samples: ChartLineChaikinOscSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
    adl: adl[i]!,
    oscillator: oscillator[i] ?? null,
    sign: classifySign(oscillator[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let oscMin = NaN;
  let oscMax = NaN;
  let positiveCount = 0;
  let negativeCount = 0;
  for (const s of samples) {
    if (s.oscillator !== null) {
      if (Number.isNaN(oscMin) || s.oscillator < oscMin) {
        oscMin = s.oscillator;
      }
      if (Number.isNaN(oscMax) || s.oscillator > oscMax) {
        oscMax = s.oscillator;
      }
    }
    if (s.sign === 'positive') positiveCount += 1;
    if (s.sign === 'negative') negativeCount += 1;
  }

  return {
    series = [],
    fastPeriod,
    slowPeriod,
    adl,
    fastEma,
    slowEma,
    oscillator,
    samples,
    oscFinal: lastDefined(oscillator),
    oscMin,
    oscMax,
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

export function computeLineChaikinOscLayout(
  options: ComputeLineChaikinOscLayoutOptions,
): ChartLineChaikinOscLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_CHAIKIN_OSC_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_CHAIKIN_OSC_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_CHAIKIN_OSC_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineChaikinOscPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineChaikinOsc(data, {
    ...(isFiniteNumber(options.fastPeriod)
      ? { fastPeriod: options.fastPeriod }
      : {}),
    ...(isFiniteNumber(options.slowPeriod)
      ? { slowPeriod: options.slowPeriod }
      : {}),
  });
  const empty: ChartLineChaikinOscLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    oscPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    oscYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    oscYBound: 0,
    pricePath: '',
    priceDots: [],
    oscPath: '',
    markers: [],
    zeroY: 0,
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    oscFinal: NaN,
    oscMin: NaN,
    oscMax: NaN,
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
  const oscH = usableHeight - priceH;
  if (priceH <= 0 || oscH <= 0) return empty;

  const pricePanel: ChartLineChaikinOscPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const oscPanel: ChartLineChaikinOscPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: oscH,
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
    if (s.oscillator !== null && Math.abs(s.oscillator) > bound) {
      bound = Math.abs(s.oscillator);
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
  const projectOscY = (v: number): number =>
    oscPanel.y +
    oscPanel.height -
    ((v + bound) / (2 * bound)) * oscPanel.height;

  const priceDots: ChartLineChaikinOscPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    high: s.high,
    low: s.low,
    close: s.close,
    volume: s.volume,
    adl: s.adl,
    oscillator: s.oscillator,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.close),
  }));

  const oscPts: { px: number; py: number }[] = [];
  const markers: ChartLineChaikinOscMarker[] = [];
  for (const s of run.samples) {
    if (s.oscillator !== null) {
      const px = projectX(s.x);
      const py = projectOscY(s.oscillator);
      oscPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        oscillator: s.oscillator,
        sign: s.sign,
        px,
        py,
      });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    oscPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    oscYTicks: computeTicks(-bound, bound, tickCount).map((v) => ({
      value: v,
      py: projectOscY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    oscYBound: bound,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    oscPath: buildPath(oscPts),
    markers,
    zeroY: projectOscY(0),
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    oscFinal: run.oscFinal,
    oscMin: run.oscMin,
    oscMax: run.oscMax,
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

export function describeLineChaikinOscChart(
  data: readonly ChartLineChaikinOscPoint[] | null | undefined,
  options?: { fastPeriod?: number; slowPeriod?: number },
): string {
  const run = runLineChaikinOsc(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Chaikin Oscillator panel (EMA ${run.fastPeriod}/${run.slowPeriod}): the Chaikin Oscillator is the difference between a fast and a slow exponential moving average of the Accumulation Distribution Line, measuring the momentum of accumulation and distribution; it swings around zero. ${run.positiveCount} readings above and ${run.negativeCount} below the zero line across ${run.samples.length} periods.`;
}

const CHAIKIN_OSC_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineChaikinOsc = forwardRef<
  HTMLDivElement,
  ChartLineChaikinOscProps
>(function ChartLineChaikinOsc(
  props: ChartLineChaikinOscProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    fastPeriod,
    slowPeriod,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_CHAIKIN_OSC_WIDTH,
    height = DEFAULT_CHART_LINE_CHAIKIN_OSC_HEIGHT,
    padding = DEFAULT_CHART_LINE_CHAIKIN_OSC_PADDING,
    gap = DEFAULT_CHART_LINE_CHAIKIN_OSC_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_CHAIKIN_OSC_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_CHAIKIN_OSC_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CHAIKIN_OSC_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CHAIKIN_OSC_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CHAIKIN_OSC_PRICE_COLOR,
    oscColor = DEFAULT_CHART_LINE_CHAIKIN_OSC_OSC_COLOR,
    positiveColor = DEFAULT_CHART_LINE_CHAIKIN_OSC_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_CHAIKIN_OSC_NEGATIVE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_CHAIKIN_OSC_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_CHAIKIN_OSC_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CHAIKIN_OSC_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showOscillator = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a Chaikin Oscillator panel',
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
      computeLineChaikinOscLayout({
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        ...(isFiniteNumber(fastPeriod) ? { fastPeriod } : {}),
        ...(isFiniteNumber(slowPeriod) ? { slowPeriod } : {}),
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
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineChaikinOscChart(data, {
        ...(isFiniteNumber(fastPeriod) ? { fastPeriod } : {}),
        ...(isFiniteNumber(slowPeriod) ? { slowPeriod } : {}),
      }),
    [ariaDescription, data, fastPeriod, slowPeriod],
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
    (s: ChartLineChaikinOscSign): string =>
      s === 'positive'
        ? positiveColor
        : s === 'negative'
          ? negativeColor
          : oscColor,
    [positiveColor, negativeColor, oscColor],
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
        data-section="chart-line-chaikin-osc"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-chaikin-osc-aria-desc"
          style={CHAIKIN_OSC_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const op = layout.oscPanel;
  const priceVisible = !hiddenSet.has('price');
  const oscVisible = showOscillator && !hiddenSet.has('osc');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'osc', label: 'Chaikin', color: oscColor },
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
      data-section="chart-line-chaikin-osc"
      data-empty="false"
      data-fast-period={layout.fastPeriod}
      data-slow-period={layout.slowPeriod}
      data-osc-final={layout.oscFinal}
      data-positive-count={layout.positiveCount}
      data-negative-count={layout.negativeCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-chaikin-osc-aria-desc"
        style={CHAIKIN_OSC_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-chaikin-osc-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-chaikin-osc-badge"
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
              data-section="chart-line-chaikin-osc-badge-icon"
              aria-hidden="true"
              style={{ color: oscColor }}
            >
              CHAIKIN
            </span>
            <span data-section="chart-line-chaikin-osc-badge-ema">
              {layout.fastPeriod}/{layout.slowPeriod}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-chaikin-osc-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-chaikin-osc-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`pgy-${i}`}
                  data-section="chart-line-chaikin-osc-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.oscYTicks.map((t, i) => (
                <line
                  key={`ogy-${i}`}
                  data-section="chart-line-chaikin-osc-grid-line"
                  data-panel="osc"
                  x1={op.x}
                  x2={op.x + op.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-chaikin-osc-zero-line"
              x1={op.x}
              x2={op.x + op.width}
              y1={layout.zeroY}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-chaikin-osc-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              {[
                { panel: pp, name: 'price', yt: layout.priceYTicks },
                { panel: op, name: 'osc', yt: layout.oscYTicks },
              ].map((cfg) => (
                <g
                  key={`axis-${cfg.name}`}
                  data-section="chart-line-chaikin-osc-axis-group"
                  data-panel={cfg.name}
                >
                  <line
                    data-section="chart-line-chaikin-osc-axis"
                    data-panel={cfg.name}
                    data-axis="x"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y + cfg.panel.height}
                    x2={cfg.panel.x + cfg.panel.width}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  <line
                    data-section="chart-line-chaikin-osc-axis"
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
                      data-section="chart-line-chaikin-osc-tick"
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
                        data-section="chart-line-chaikin-osc-tick-label"
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
              <g data-section="chart-line-chaikin-osc-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`tx-${i}`}
                    data-section="chart-line-chaikin-osc-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={op.y + op.height}
                      y2={op.y + op.height + 4}
                    />
                    <text
                      data-section="chart-line-chaikin-osc-tick-label"
                      data-axis="x"
                      x={t.px}
                      y={op.y + op.height + 14}
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

          <g data-section="chart-line-chaikin-osc-panel-labels">
            <text
              data-section="chart-line-chaikin-osc-panel-label"
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
              data-section="chart-line-chaikin-osc-panel-label"
              data-panel="osc"
              x={op.x + op.width / 2}
              y={op.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Chaikin Oscillator
            </text>
          </g>

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-chaikin-osc-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-chaikin-osc-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                    data-section="chart-line-chaikin-osc-dot"
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

          {oscVisible && layout.oscPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Chaikin Oscillator line"
              data-section="chart-line-chaikin-osc-osc-line"
              d={layout.oscPath}
              fill="none"
              stroke={oscColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {oscVisible ? (
            <g data-section="chart-line-chaikin-osc-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Chaikin Oscillator at x ${formatX(m.x)}: ${formatValue(m.oscillator)} (${m.sign})`}
                    data-section="chart-line-chaikin-osc-marker"
                    data-point-index={m.index}
                    data-oscillator={m.oscillator}
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
                  data-section="chart-line-chaikin-osc-tooltip"
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
                  <div data-section="chart-line-chaikin-osc-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-chaikin-osc-tooltip-close"
                    style={{ fontWeight: 600 }}
                  >
                    close: {formatValue(d.close)}
                  </div>
                  <div data-section="chart-line-chaikin-osc-tooltip-adl">
                    adl: {formatValue(d.adl)}
                  </div>
                  <div data-section="chart-line-chaikin-osc-tooltip-osc">
                    chaikin:{' '}
                    {d.oscillator === null
                      ? 'n/a'
                      : formatValue(d.oscillator)}
                  </div>
                  <div data-section="chart-line-chaikin-osc-tooltip-sign">
                    sign: {d.sign}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-chaikin-osc-legend"
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
                data-section="chart-line-chaikin-osc-legend-item"
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
                  data-section="chart-line-chaikin-osc-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-chaikin-osc-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-chaikin-osc-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.positiveCount} above, {layout.negativeCount} below
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineChaikinOsc.displayName = 'ChartLineChaikinOsc';
