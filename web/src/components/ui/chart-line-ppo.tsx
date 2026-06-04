import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_PPO_WIDTH = 560;
export const DEFAULT_CHART_LINE_PPO_HEIGHT = 360;
export const DEFAULT_CHART_LINE_PPO_PADDING = 40;
export const DEFAULT_CHART_LINE_PPO_GAP = 26;
export const DEFAULT_CHART_LINE_PPO_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_PPO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PPO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PPO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PPO_FAST_PERIOD = 12;
export const DEFAULT_CHART_LINE_PPO_SLOW_PERIOD = 26;
export const DEFAULT_CHART_LINE_PPO_SIGNAL_PERIOD = 9;
export const DEFAULT_CHART_LINE_PPO_VALUE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_PPO_PPO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_PPO_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_PPO_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PPO_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PPO_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_PPO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PPO_AXIS_COLOR = '#cbd5e1';

export type ChartLinePpoSign = 'positive' | 'negative' | 'zero';

export interface ChartLinePpoPoint {
  x: number;
  value: number;
}

export interface ChartLinePpoSample {
  index: number;
  x: number;
  value: number;
  ppo: number | null;
  signal: number | null;
  histogram: number | null;
  sign: ChartLinePpoSign;
}

export interface ChartLinePpoRun {
  series: ChartLinePpoPoint[];
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  ppo: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
  samples: ChartLinePpoSample[];
  ppoFinal: number;
  signalFinal: number;
  histogramFinal: number;
  ppoMin: number;
  ppoMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLinePpoPriceDot {
  index: number;
  x: number;
  value: number;
  ppo: number | null;
  signal: number | null;
  histogram: number | null;
  sign: ChartLinePpoSign;
  px: number;
  py: number;
}

export interface ChartLinePpoMarker {
  index: number;
  x: number;
  ppo: number;
  sign: ChartLinePpoSign;
  px: number;
  py: number;
}

export interface ChartLinePpoBar {
  index: number;
  x: number;
  histogram: number;
  sign: ChartLinePpoSign;
  bx: number;
  by: number;
  bw: number;
  bh: number;
}

export interface ChartLinePpoPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLinePpoLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLinePpoPanel;
  ppoPanel: ChartLinePpoPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  ppoYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  ppoYBound: number;
  pricePath: string;
  priceDots: ChartLinePpoPriceDot[];
  ppoPath: string;
  signalPath: string;
  histogramBars: ChartLinePpoBar[];
  markers: ChartLinePpoMarker[];
  zeroY: number;
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  ppoFinal: number;
  signalFinal: number;
  histogramFinal: number;
  ppoMin: number;
  ppoMax: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLinePpoLayoutOptions {
  data: readonly ChartLinePpoPoint[];
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

export interface ChartLinePpoProps {
  data: readonly ChartLinePpoPoint[];
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
  valueColor?: string;
  ppoColor?: string;
  signalColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPpo?: boolean;
  showSignal?: boolean;
  showHistogram?: boolean;
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
  onPointClick?: (payload: { point: ChartLinePpoPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLinePpoFinitePoints(
  points: readonly ChartLinePpoPoint[] | null | undefined,
): ChartLinePpoPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLinePpoPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLinePpoPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * An exponential moving average over `period` values. The series may
 * contain leading `null` placeholders (the PPO line does): the seed
 * is the simple mean of the first `period` defined values and is
 * placed at that value's index, then each later defined value folds
 * in at weight `2 / (period + 1)`. Indices before the seed read null.
 */
export function computeLinePpoEma(
  src: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  const idx: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const v = src[i];
    if (v !== null && v !== undefined) idx.push(i);
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
 * The Percentage Price Oscillator. The PPO line is the percentage gap
 * between a fast and a slow EMA, `100 * (fastEMA - slowEMA) / slowEMA`;
 * the signal line is an EMA of the PPO line; the histogram is their
 * difference. Normalising by the slow EMA -- the step MACD omits --
 * makes the reading comparable across price levels and instruments.
 */
export function computeLinePpo(
  values: readonly number[] | null | undefined,
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number,
): {
  ppo: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
} {
  if (!Array.isArray(values)) return { ppo: [], signal: [], histogram: [] };
  const n = values.length;
  const fast = computeLinePpoEma(values, fastPeriod);
  const slow = computeLinePpoEma(values, slowPeriod);
  const ppo: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const f = fast[i];
    const s = slow[i];
    if (f !== null && f !== undefined && s !== null && s !== undefined) {
      const raw = s === 0 ? 0 : (100 * (f - s)) / s;
      ppo[i] = raw === 0 ? 0 : raw;
    }
  }
  const signal = computeLinePpoEma(ppo, signalPeriod);
  const histogram: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const pv = ppo[i];
    const sv = signal[i];
    if (pv !== null && pv !== undefined && sv !== null && sv !== undefined) {
      const raw = pv - sv;
      histogram[i] = raw === 0 ? 0 : raw;
    }
  }
  return { ppo, signal, histogram };
}

function classifySign(v: number | null): ChartLinePpoSign {
  if (v === null) return 'zero';
  if (v > 0) return 'positive';
  if (v < 0) return 'negative';
  return 'zero';
}

export function runLinePpo(
  points: readonly ChartLinePpoPoint[] | null | undefined,
  options?: {
    fastPeriod?: number;
    slowPeriod?: number;
    signalPeriod?: number;
  },
): ChartLinePpoRun {
  const finite = getLinePpoFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const fastPeriod = normalizeLinePpoPeriod(
    options?.fastPeriod ?? DEFAULT_CHART_LINE_PPO_FAST_PERIOD,
    DEFAULT_CHART_LINE_PPO_FAST_PERIOD,
  );
  const slowPeriod = normalizeLinePpoPeriod(
    options?.slowPeriod ?? DEFAULT_CHART_LINE_PPO_SLOW_PERIOD,
    DEFAULT_CHART_LINE_PPO_SLOW_PERIOD,
  );
  const signalPeriod = normalizeLinePpoPeriod(
    options?.signalPeriod ?? DEFAULT_CHART_LINE_PPO_SIGNAL_PERIOD,
    DEFAULT_CHART_LINE_PPO_SIGNAL_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      fastPeriod,
      slowPeriod,
      signalPeriod,
      ppo: [],
      signal: [],
      histogram: [],
      samples: [],
      ppoFinal: NaN,
      signalFinal: NaN,
      histogramFinal: NaN,
      ppoMin: NaN,
      ppoMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { ppo, signal, histogram } = computeLinePpo(
    values,
    fastPeriod,
    slowPeriod,
    signalPeriod,
  );
  const samples: ChartLinePpoSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    ppo: ppo[i] ?? null,
    signal: signal[i] ?? null,
    histogram: histogram[i] ?? null,
    sign: classifySign(histogram[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (arr[i] !== null && arr[i] !== undefined) return arr[i] as number;
    }
    return NaN;
  };

  let ppoMin = NaN;
  let ppoMax = NaN;
  let positiveCount = 0;
  let negativeCount = 0;
  for (const s of samples) {
    if (s.ppo !== null) {
      if (Number.isNaN(ppoMin) || s.ppo < ppoMin) ppoMin = s.ppo;
      if (Number.isNaN(ppoMax) || s.ppo > ppoMax) ppoMax = s.ppo;
    }
    if (s.sign === 'positive') positiveCount += 1;
    if (s.sign === 'negative') negativeCount += 1;
  }

  return {
    series,
    fastPeriod,
    slowPeriod,
    signalPeriod,
    ppo,
    signal,
    histogram,
    samples,
    ppoFinal: lastDefined(ppo),
    signalFinal: lastDefined(signal),
    histogramFinal: lastDefined(histogram),
    ppoMin,
    ppoMax,
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

export function computeLinePpoLayout(
  options: ComputeLinePpoLayoutOptions,
): ChartLinePpoLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_PPO_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_PPO_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_PPO_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLinePpoPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLinePpo(data, {
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
  const empty: ChartLinePpoLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    ppoPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    ppoYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    ppoYBound: 0,
    pricePath: '',
    priceDots: [],
    ppoPath: '',
    signalPath: '',
    histogramBars: [],
    markers: [],
    zeroY: 0,
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    signalPeriod: run.signalPeriod,
    ppoFinal: NaN,
    signalFinal: NaN,
    histogramFinal: NaN,
    ppoMin: NaN,
    ppoMax: NaN,
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
  const ppoH = usableHeight - priceH;
  if (priceH <= 0 || ppoH <= 0) return empty;

  const pricePanel: ChartLinePpoPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const ppoPanel: ChartLinePpoPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: ppoH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let bound = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < pyLo) pyLo = s.value;
    if (s.value > pyHi) pyHi = s.value;
    if (s.ppo !== null && Math.abs(s.ppo) > bound) bound = Math.abs(s.ppo);
    if (s.signal !== null && Math.abs(s.signal) > bound) {
      bound = Math.abs(s.signal);
    }
    if (s.histogram !== null && Math.abs(s.histogram) > bound) {
      bound = Math.abs(s.histogram);
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
  const projectPpoY = (v: number): number =>
    ppoPanel.y +
    ppoPanel.height -
    ((v + bound) / (2 * bound)) * ppoPanel.height;

  const zeroY = projectPpoY(0);

  const priceDots: ChartLinePpoPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    ppo: s.ppo,
    signal: s.signal,
    histogram: s.histogram,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const barW = Math.max(2, (ppoPanel.width / Math.max(run.samples.length, 1)) * 0.55);
  const histogramBars: ChartLinePpoBar[] = [];
  const ppoPts: { px: number; py: number }[] = [];
  const signalPts: { px: number; py: number }[] = [];
  const markers: ChartLinePpoMarker[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    if (s.histogram !== null) {
      const by = projectPpoY(s.histogram);
      histogramBars.push({
        index: s.index,
        x: s.x,
        histogram: s.histogram,
        sign: classifySign(s.histogram),
        bx: px - barW / 2,
        by: Math.min(by, zeroY),
        bw: barW,
        bh: Math.abs(by - zeroY),
      });
    }
    if (s.ppo !== null) {
      const py = projectPpoY(s.ppo);
      ppoPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        ppo: s.ppo,
        sign: s.sign,
        px,
        py,
      });
    }
    if (s.signal !== null) {
      signalPts.push({ px, py: projectPpoY(s.signal) });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    ppoPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    ppoYTicks: computeTicks(-bound, bound, tickCount).map((v) => ({
      value: v,
      py: projectPpoY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    ppoYBound: bound,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    ppoPath: buildPath(ppoPts),
    signalPath: buildPath(signalPts),
    histogramBars,
    markers,
    zeroY,
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    signalPeriod: run.signalPeriod,
    ppoFinal: run.ppoFinal,
    signalFinal: run.signalFinal,
    histogramFinal: run.histogramFinal,
    ppoMin: run.ppoMin,
    ppoMax: run.ppoMax,
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

export function describeLinePpoChart(
  data: readonly ChartLinePpoPoint[] | null | undefined,
  options?: {
    fastPeriod?: number;
    slowPeriod?: number;
    signalPeriod?: number;
  },
): string {
  const run = runLinePpo(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Percentage Price Oscillator panel (EMA ${run.fastPeriod}/${run.slowPeriod}, signal ${run.signalPeriod}): the PPO line is the percentage gap between a fast and a slow exponential moving average, the signal line is its EMA, and the histogram is their difference; a histogram cross through zero marks a momentum turn. ${run.positiveCount} histogram readings above and ${run.negativeCount} below the zero line across ${run.samples.length} periods.`;
}

const PPO_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLinePpo = forwardRef<HTMLDivElement, ChartLinePpoProps>(
  function ChartLinePpo(
    props: ChartLinePpoProps,
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
      width = DEFAULT_CHART_LINE_PPO_WIDTH,
      height = DEFAULT_CHART_LINE_PPO_HEIGHT,
      padding = DEFAULT_CHART_LINE_PPO_PADDING,
      gap = DEFAULT_CHART_LINE_PPO_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_PPO_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_PPO_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_PPO_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_PPO_DOT_RADIUS,
      valueColor = DEFAULT_CHART_LINE_PPO_VALUE_COLOR,
      ppoColor = DEFAULT_CHART_LINE_PPO_PPO_COLOR,
      signalColor = DEFAULT_CHART_LINE_PPO_SIGNAL_COLOR,
      positiveColor = DEFAULT_CHART_LINE_PPO_POSITIVE_COLOR,
      negativeColor = DEFAULT_CHART_LINE_PPO_NEGATIVE_COLOR,
      zeroColor = DEFAULT_CHART_LINE_PPO_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_PPO_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_PPO_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showPpo = true,
      showSignal = true,
      showHistogram = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Percentage Price Oscillator panel',
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
        computeLinePpoLayout({
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
        describeLinePpoChart(data, {
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
      (s: ChartLinePpoSign): string =>
        s === 'positive'
          ? positiveColor
          : s === 'negative'
            ? negativeColor
            : ppoColor,
      [positiveColor, negativeColor, ppoColor],
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
          data-section="chart-line-ppo"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-ppo-aria-desc"
            style={PPO_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const op = layout.ppoPanel;
    const valueVisible = !hiddenSet.has('value');
    const ppoVisible = showPpo && !hiddenSet.has('ppo');
    const signalVisible = showSignal && !hiddenSet.has('signal');
    const histogramVisible = showHistogram && !hiddenSet.has('histogram');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'value', label: 'Value', color: valueColor },
      { id: 'ppo', label: 'PPO', color: ppoColor },
      { id: 'signal', label: 'Signal', color: signalColor },
      { id: 'histogram', label: 'Histogram', color: positiveColor },
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
        data-section="chart-line-ppo"
        data-empty="false"
        data-fast-period={layout.fastPeriod}
        data-slow-period={layout.slowPeriod}
        data-signal-period={layout.signalPeriod}
        data-ppo-final={layout.ppoFinal}
        data-histogram-final={layout.histogramFinal}
        data-positive-count={layout.positiveCount}
        data-negative-count={layout.negativeCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-ppo-aria-desc"
          style={PPO_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-ppo-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-ppo-badge"
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
                data-section="chart-line-ppo-badge-icon"
                aria-hidden="true"
                style={{ color: ppoColor }}
              >
                PPO
              </span>
              <span data-section="chart-line-ppo-badge-ema">
                {layout.fastPeriod}/{layout.slowPeriod}
              </span>
              <span data-section="chart-line-ppo-badge-signal">
                s={layout.signalPeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-ppo-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-ppo-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-ppo-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.ppoYTicks.map((t, i) => (
                  <line
                    key={`ogy-${i}`}
                    data-section="chart-line-ppo-grid-line"
                    data-panel="ppo"
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
                data-section="chart-line-ppo-zero-line"
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
                data-section="chart-line-ppo-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: op, name: 'ppo', yt: layout.ppoYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-ppo-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-ppo-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-ppo-axis"
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
                        data-section="chart-line-ppo-tick"
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
                          data-section="chart-line-ppo-tick-label"
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
                <g data-section="chart-line-ppo-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-ppo-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={op.y + op.height}
                        y2={op.y + op.height + 4}
                      />
                      <text
                        data-section="chart-line-ppo-tick-label"
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

            <g data-section="chart-line-ppo-panel-labels">
              <text
                data-section="chart-line-ppo-panel-label"
                data-panel="price"
                x={pp.x + pp.width / 2}
                y={pp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Value
              </text>
              <text
                data-section="chart-line-ppo-panel-label"
                data-panel="ppo"
                x={op.x + op.width / 2}
                y={op.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                PPO
              </text>
            </g>

            {valueVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Value line"
                data-section="chart-line-ppo-value-path"
                d={layout.pricePath}
                fill="none"
                stroke={valueColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {valueVisible && showDots ? (
              <g data-section="chart-line-ppo-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-ppo-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.value}
                      cx={d.px}
                      cy={d.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={valueColor}
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

            {histogramVisible ? (
              <g data-section="chart-line-ppo-histogram">
                {layout.histogramBars.map((b) => (
                  <rect
                    key={`h-${b.index}`}
                    data-section="chart-line-ppo-histogram-bar"
                    data-point-index={b.index}
                    data-histogram={b.histogram}
                    data-sign={b.sign}
                    x={b.bx}
                    y={b.by}
                    width={b.bw}
                    height={b.bh}
                    fill={signColor(b.sign)}
                    opacity={0.55}
                  />
                ))}
              </g>
            ) : null}

            {ppoVisible && layout.ppoPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="PPO line"
                data-section="chart-line-ppo-ppo-line"
                d={layout.ppoPath}
                fill="none"
                stroke={ppoColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {signalVisible && layout.signalPath ? (
              <path
                data-section="chart-line-ppo-signal-line"
                d={layout.signalPath}
                fill="none"
                stroke={signalColor}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {ppoVisible ? (
              <g data-section="chart-line-ppo-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`PPO at x ${formatX(m.x)}: ${formatValue(m.ppo)} (${m.sign})`}
                      data-section="chart-line-ppo-marker"
                      data-point-index={m.index}
                      data-ppo={m.ppo}
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
                    data-section="chart-line-ppo-tooltip"
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
                    <div data-section="chart-line-ppo-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-ppo-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-ppo-tooltip-ppo">
                      ppo: {d.ppo === null ? 'n/a' : formatValue(d.ppo)}
                    </div>
                    <div data-section="chart-line-ppo-tooltip-signal">
                      signal:{' '}
                      {d.signal === null ? 'n/a' : formatValue(d.signal)}
                    </div>
                    <div data-section="chart-line-ppo-tooltip-histogram">
                      histogram:{' '}
                      {d.histogram === null
                        ? 'n/a'
                        : formatValue(d.histogram)}
                    </div>
                    <div data-section="chart-line-ppo-tooltip-sign">
                      sign: {d.sign}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-ppo-legend"
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
                  data-section="chart-line-ppo-legend-item"
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
                    data-section="chart-line-ppo-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-ppo-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-ppo-legend-stats"
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

ChartLinePpo.displayName = 'ChartLinePpo';
