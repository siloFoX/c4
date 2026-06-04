import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_RVI_WIDTH = 560;
export const DEFAULT_CHART_LINE_RVI_HEIGHT = 360;
export const DEFAULT_CHART_LINE_RVI_PADDING = 40;
export const DEFAULT_CHART_LINE_RVI_GAP = 26;
export const DEFAULT_CHART_LINE_RVI_PRICE_PANEL_RATIO = 0.52;
export const DEFAULT_CHART_LINE_RVI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RVI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RVI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RVI_PERIOD = 10;
export const DEFAULT_CHART_LINE_RVI_CLOSE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_RVI_BAND_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_RVI_RVI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_RVI_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_RVI_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RVI_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RVI_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_RVI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RVI_AXIS_COLOR = '#cbd5e1';

export type ChartLineRviSign = 'positive' | 'negative' | 'zero';

export interface ChartLineRviPoint {
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLineRviSample {
  index: number;
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
  rvi: number | null;
  signal: number | null;
  sign: ChartLineRviSign;
}

export interface ChartLineRviRun {
  series: ChartLineRviPoint[];
  period: number;
  co: number[];
  hl: number[];
  numerator: (number | null)[];
  denominator: (number | null)[];
  rvi: (number | null)[];
  signal: (number | null)[];
  samples: ChartLineRviSample[];
  rviFinal: number;
  signalFinal: number;
  rviMin: number;
  rviMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineRviPriceDot {
  index: number;
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
  rvi: number | null;
  signal: number | null;
  sign: ChartLineRviSign;
  px: number;
  py: number;
  highY: number;
  lowY: number;
}

export interface ChartLineRviMarker {
  index: number;
  x: number;
  rvi: number;
  sign: ChartLineRviSign;
  px: number;
  py: number;
}

export interface ChartLineRviPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineRviLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineRviPanel;
  rviPanel: ChartLineRviPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  rviYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  rviYBound: number;
  closePath: string;
  bandPath: string;
  priceDots: ChartLineRviPriceDot[];
  rviPath: string;
  signalPath: string;
  markers: ChartLineRviMarker[];
  zeroY: number;
  period: number;
  rviFinal: number;
  signalFinal: number;
  rviMin: number;
  rviMax: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineRviLayoutOptions {
  data: readonly ChartLineRviPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineRviProps {
  data: readonly ChartLineRviPoint[];
  period?: number;
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
  closeColor?: string;
  bandColor?: string;
  rviColor?: string;
  signalColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBand?: boolean;
  showRvi?: boolean;
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
  onPointClick?: (payload: { point: ChartLineRviPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineRviFinitePoints(
  points: readonly ChartLineRviPoint[] | null | undefined,
): ChartLineRviPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineRviPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.open) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineRviPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The Relative Vigor Index symmetric weighted moving average: a fixed
 * 4-bar average with weights 1/2/2/1 over 6, `(src[i] + 2*src[i-1] +
 * 2*src[i-2] + src[i-3]) / 6`. Indices before the fourth bar -- or
 * any window touching a null -- read null.
 */
export function computeLineRviSwma(
  src: readonly (number | null)[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 3; i < n; i += 1) {
    const a = src[i];
    const b = src[i - 1];
    const c = src[i - 2];
    const d = src[i - 3];
    if (isDefined(a) && isDefined(b) && isDefined(c) && isDefined(d)) {
      const w = (a + 2 * b + 2 * c + d) / 6;
      out[i] = w === 0 ? 0 : w;
    }
  }
  return out;
}

/**
 * A simple moving average over `period` values, tolerating leading
 * `null` placeholders. Each index whose window of `period` values is
 * fully defined reads their mean; the rest read null.
 */
export function computeLineRviSma(
  src: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const v = src[i - k];
      if (!isDefined(v)) {
        valid = false;
        break;
      }
      sum += v;
    }
    if (valid) {
      const mean = sum / p;
      out[i] = mean === 0 ? 0 : mean;
    }
  }
  return out;
}

/**
 * John Ehlers' Relative Vigor Index. Each bar's close-open move and
 * its high-low range are run through the 1/2/2/1 symmetric weighted
 * average, smoothed by an SMA, and divided -- conviction is high when
 * price closes far from where it opened relative to the bar's range.
 * The signal line is the symmetric weighted average of the RVI.
 */
export function computeLineRvi(
  opens: readonly number[] | null | undefined,
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
  period: number,
): {
  co: number[];
  hl: number[];
  numerator: (number | null)[];
  denominator: (number | null)[];
  rvi: (number | null)[];
  signal: (number | null)[];
} {
  if (
    !Array.isArray(opens) ||
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes)
  ) {
    return {
      co: [],
      hl: [],
      numerator: [],
      denominator: [],
      rvi: [],
      signal: [],
    };
  }
  const n = Math.min(opens.length, highs.length, lows.length, closes.length);
  const co: number[] = new Array(n);
  const hl: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    co[i] = closes[i]! - opens[i]!;
    hl[i] = highs[i]! - lows[i]!;
  }
  const numerator = computeLineRviSwma(co);
  const denominator = computeLineRviSwma(hl);
  const numSma = computeLineRviSma(numerator, period);
  const denSma = computeLineRviSma(denominator, period);
  const rvi: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const num = numSma[i];
    const den = denSma[i];
    if (isDefined(num) && isDefined(den)) {
      const raw = den === 0 ? 0 : num / den;
      rvi[i] = raw === 0 ? 0 : raw;
    }
  }
  const signal = computeLineRviSwma(rvi);
  return { co, hl, numerator, denominator, rvi, signal };
}

function classifySign(v: number | null): ChartLineRviSign {
  if (v === null) return 'zero';
  if (v > 0) return 'positive';
  if (v < 0) return 'negative';
  return 'zero';
}

export function runLineRvi(
  points: readonly ChartLineRviPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineRviRun {
  const finite = getLineRviFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineRviPeriod(
    options?.period ?? DEFAULT_CHART_LINE_RVI_PERIOD,
    DEFAULT_CHART_LINE_RVI_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      co: [],
      hl: [],
      numerator: [],
      denominator: [],
      rvi: [],
      signal: [],
      samples: [],
      rviFinal: NaN,
      signalFinal: NaN,
      rviMin: NaN,
      rviMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const opens = series.map((p) => p.open);
  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const closes = series.map((p) => p.close);
  const { co, hl, numerator, denominator, rvi, signal } = computeLineRvi(
    opens,
    highs,
    lows,
    closes,
    period,
  );

  const samples: ChartLineRviSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    rvi: rvi[i] ?? null,
    signal: signal[i] ?? null,
    sign: classifySign(rvi[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let rviMin = NaN;
  let rviMax = NaN;
  let positiveCount = 0;
  let negativeCount = 0;
  for (const s of samples) {
    if (s.rvi !== null) {
      if (Number.isNaN(rviMin) || s.rvi < rviMin) rviMin = s.rvi;
      if (Number.isNaN(rviMax) || s.rvi > rviMax) rviMax = s.rvi;
    }
    if (s.sign === 'positive') positiveCount += 1;
    if (s.sign === 'negative') negativeCount += 1;
  }

  return {
    series,
    period,
    co,
    hl,
    numerator,
    denominator,
    rvi,
    signal,
    samples,
    rviFinal: lastDefined(rvi),
    signalFinal: lastDefined(signal),
    rviMin,
    rviMax,
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

function buildBandPath(
  highPts: readonly { px: number; py: number }[],
  lowPts: readonly { px: number; py: number }[],
): string {
  if (highPts.length === 0 || lowPts.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < highPts.length; i += 1) {
    const p = highPts[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  for (let i = lowPts.length - 1; i >= 0; i -= 1) {
    const p = lowPts[i]!;
    parts.push(`L ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  parts.push('Z');
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

export function computeLineRviLayout(
  options: ComputeLineRviLayoutOptions,
): ChartLineRviLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_RVI_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_RVI_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_RVI_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineRviPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineRvi(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineRviLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    rviPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    rviYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    rviYBound: 0,
    closePath: '',
    bandPath: '',
    priceDots: [],
    rviPath: '',
    signalPath: '',
    markers: [],
    zeroY: 0,
    period: run.period,
    rviFinal: NaN,
    signalFinal: NaN,
    rviMin: NaN,
    rviMax: NaN,
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
  const rviH = usableHeight - priceH;
  if (priceH <= 0 || rviH <= 0) return empty;

  const pricePanel: ChartLineRviPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const rviPanel: ChartLineRviPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: rviH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let bound = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.low < pyLo) pyLo = s.low;
    if (s.high > pyHi) pyHi = s.high;
    if (s.rvi !== null && Math.abs(s.rvi) > bound) bound = Math.abs(s.rvi);
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
  const projectRviY = (v: number): number =>
    rviPanel.y +
    rviPanel.height -
    ((v + bound) / (2 * bound)) * rviPanel.height;

  const priceDots: ChartLineRviPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    open: s.open,
    high: s.high,
    low: s.low,
    close: s.close,
    rvi: s.rvi,
    signal: s.signal,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.close),
    highY: projectPriceY(s.high),
    lowY: projectPriceY(s.low),
  }));

  const highPts = priceDots.map((d) => ({ px: d.px, py: d.highY }));
  const lowPts = priceDots.map((d) => ({ px: d.px, py: d.lowY }));

  const rviPts: { px: number; py: number }[] = [];
  const signalPts: { px: number; py: number }[] = [];
  const markers: ChartLineRviMarker[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    if (s.rvi !== null) {
      const py = projectRviY(s.rvi);
      rviPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        rvi: s.rvi,
        sign: s.sign,
        px,
        py,
      });
    }
    if (s.signal !== null) {
      signalPts.push({ px, py: projectRviY(s.signal) });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    rviPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    rviYTicks: computeTicks(-bound, bound, tickCount).map((v) => ({
      value: v,
      py: projectRviY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    rviYBound: bound,
    closePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    bandPath: buildBandPath(highPts, lowPts),
    priceDots,
    rviPath: buildPath(rviPts),
    signalPath: buildPath(signalPts),
    markers,
    zeroY: projectRviY(0),
    period: run.period,
    rviFinal: run.rviFinal,
    signalFinal: run.signalFinal,
    rviMin: run.rviMin,
    rviMax: run.rviMax,
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

export function describeLineRviChart(
  data: readonly ChartLineRviPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineRvi(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Relative Vigor Index (RVI) oscillator panel (period ${run.period}): the RVI compares each bar's close-open move to its high-low range -- conviction is high when price closes far from where it opened -- and smooths the ratio into an oscillator around zero; the signal line is a symmetric weighted average of the RVI, and a cross of the two marks a vigor shift. ${run.positiveCount} readings above and ${run.negativeCount} below the zero line across ${run.samples.length} periods.`;
}

const RVI_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineRvi = forwardRef<HTMLDivElement, ChartLineRviProps>(
  function ChartLineRvi(
    props: ChartLineRviProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_RVI_WIDTH,
      height = DEFAULT_CHART_LINE_RVI_HEIGHT,
      padding = DEFAULT_CHART_LINE_RVI_PADDING,
      gap = DEFAULT_CHART_LINE_RVI_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_RVI_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_RVI_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_RVI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_RVI_DOT_RADIUS,
      closeColor = DEFAULT_CHART_LINE_RVI_CLOSE_COLOR,
      bandColor = DEFAULT_CHART_LINE_RVI_BAND_COLOR,
      rviColor = DEFAULT_CHART_LINE_RVI_RVI_COLOR,
      signalColor = DEFAULT_CHART_LINE_RVI_SIGNAL_COLOR,
      positiveColor = DEFAULT_CHART_LINE_RVI_POSITIVE_COLOR,
      negativeColor = DEFAULT_CHART_LINE_RVI_NEGATIVE_COLOR,
      zeroColor = DEFAULT_CHART_LINE_RVI_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_RVI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_RVI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showBand = true,
      showRvi = true,
      showSignal = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Relative Vigor Index panel',
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
        computeLineRviLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
        }),
      [data, width, height, padding, gap, pricePanelRatio, tickCount, period],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineRviChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
        }),
      [ariaDescription, data, period],
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
      (s: ChartLineRviSign): string =>
        s === 'positive'
          ? positiveColor
          : s === 'negative'
            ? negativeColor
            : rviColor,
      [positiveColor, negativeColor, rviColor],
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
          data-section="chart-line-rvi"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-rvi-aria-desc"
            style={RVI_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const rp = layout.rviPanel;
    const closeVisible = !hiddenSet.has('close');
    const rviVisible = showRvi && !hiddenSet.has('rvi');
    const signalVisible = showSignal && !hiddenSet.has('signal');
    const bandVisible = showBand && closeVisible;

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'close', label: 'Close', color: closeColor },
      { id: 'rvi', label: 'RVI', color: rviColor },
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
        data-section="chart-line-rvi"
        data-empty="false"
        data-period={layout.period}
        data-rvi-final={layout.rviFinal}
        data-signal-final={layout.signalFinal}
        data-positive-count={layout.positiveCount}
        data-negative-count={layout.negativeCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-rvi-aria-desc"
          style={RVI_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-rvi-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-rvi-badge"
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
                data-section="chart-line-rvi-badge-icon"
                aria-hidden="true"
                style={{ color: rviColor }}
              >
                RVI
              </span>
              <span data-section="chart-line-rvi-badge-period">
                n={layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-rvi-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-rvi-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-rvi-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.rviYTicks.map((t, i) => (
                  <line
                    key={`rgy-${i}`}
                    data-section="chart-line-rvi-grid-line"
                    data-panel="rvi"
                    x1={rp.x}
                    x2={rp.x + rp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showZeroLine ? (
              <line
                data-section="chart-line-rvi-zero-line"
                x1={rp.x}
                x2={rp.x + rp.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-rvi-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: rp, name: 'rvi', yt: layout.rviYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-rvi-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-rvi-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-rvi-axis"
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
                        data-section="chart-line-rvi-tick"
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
                          data-section="chart-line-rvi-tick-label"
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
                <g data-section="chart-line-rvi-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-rvi-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={rp.y + rp.height}
                        y2={rp.y + rp.height + 4}
                      />
                      <text
                        data-section="chart-line-rvi-tick-label"
                        data-axis="x"
                        x={t.px}
                        y={rp.y + rp.height + 14}
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

            <g data-section="chart-line-rvi-panel-labels">
              <text
                data-section="chart-line-rvi-panel-label"
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
                data-section="chart-line-rvi-panel-label"
                data-panel="rvi"
                x={rp.x + rp.width / 2}
                y={rp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Relative Vigor Index
              </text>
            </g>

            {bandVisible ? (
              <path
                data-section="chart-line-rvi-band"
                d={layout.bandPath}
                fill={bandColor}
                fillOpacity={0.45}
                stroke="none"
              />
            ) : null}

            {closeVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Close line"
                data-section="chart-line-rvi-close-path"
                d={layout.closePath}
                fill="none"
                stroke={closeColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {closeVisible && showDots ? (
              <g data-section="chart-line-rvi-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                      data-section="chart-line-rvi-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.close}
                      cx={d.px}
                      cy={d.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={closeColor}
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
                data-section="chart-line-rvi-signal-line"
                d={layout.signalPath}
                fill="none"
                stroke={signalColor}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {rviVisible && layout.rviPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Relative Vigor Index line"
                data-section="chart-line-rvi-rvi-line"
                d={layout.rviPath}
                fill="none"
                stroke={rviColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {rviVisible ? (
              <g data-section="chart-line-rvi-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`RVI at x ${formatX(m.x)}: ${formatValue(m.rvi)} (${m.sign})`}
                      data-section="chart-line-rvi-marker"
                      data-point-index={m.index}
                      data-rvi={m.rvi}
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
                    data-section="chart-line-rvi-tooltip"
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
                    <div data-section="chart-line-rvi-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div data-section="chart-line-rvi-tooltip-open">
                      open: {formatValue(d.open)}
                    </div>
                    <div data-section="chart-line-rvi-tooltip-high">
                      high: {formatValue(d.high)}
                    </div>
                    <div data-section="chart-line-rvi-tooltip-low">
                      low: {formatValue(d.low)}
                    </div>
                    <div
                      data-section="chart-line-rvi-tooltip-close"
                      style={{ fontWeight: 600 }}
                    >
                      close: {formatValue(d.close)}
                    </div>
                    <div data-section="chart-line-rvi-tooltip-rvi">
                      rvi: {d.rvi === null ? 'n/a' : formatValue(d.rvi)}
                    </div>
                    <div data-section="chart-line-rvi-tooltip-signal">
                      signal:{' '}
                      {d.signal === null ? 'n/a' : formatValue(d.signal)}
                    </div>
                    <div data-section="chart-line-rvi-tooltip-sign">
                      sign: {d.sign}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-rvi-legend"
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
                  data-section="chart-line-rvi-legend-item"
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
                    data-section="chart-line-rvi-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-rvi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-rvi-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.positiveCount} above, {layout.negativeCount} below
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineRvi.displayName = 'ChartLineRvi';
