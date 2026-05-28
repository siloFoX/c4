import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_PMO_WIDTH = 560;
export const DEFAULT_CHART_LINE_PMO_HEIGHT = 360;
export const DEFAULT_CHART_LINE_PMO_PADDING = 40;
export const DEFAULT_CHART_LINE_PMO_GAP = 12;
export const DEFAULT_CHART_LINE_PMO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PMO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PMO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PMO_SMOOTH1_PERIOD = 35;
export const DEFAULT_CHART_LINE_PMO_SMOOTH2_PERIOD = 20;
export const DEFAULT_CHART_LINE_PMO_SIGNAL_PERIOD = 10;
export const DEFAULT_CHART_LINE_PMO_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_PMO_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_PMO_PMO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_PMO_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_PMO_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PMO_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PMO_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PMO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PMO_AXIS_COLOR = '#cbd5e1';

export type ChartLinePmoSign = 'positive' | 'negative' | 'zero';

export interface ChartLinePmoPoint {
  x: number;
  value: number;
}

export interface ChartLinePmoSeries {
  roc: (number | null)[];
  smoothedRoc: (number | null)[];
  pmo: (number | null)[];
  signal: (number | null)[];
}

export interface ChartLinePmoSample {
  index: number;
  x: number;
  value: number;
  roc: number | null;
  smoothedRoc: number | null;
  pmo: number | null;
  signal: number | null;
  sign: ChartLinePmoSign;
}

export interface ChartLinePmoRun {
  series: ChartLinePmoPoint[];
  smooth1Period: number;
  smooth2Period: number;
  signalPeriod: number;
  roc: (number | null)[];
  smoothedRoc: (number | null)[];
  pmo: (number | null)[];
  signal: (number | null)[];
  samples: ChartLinePmoSample[];
  pmoFinal: number;
  signalFinal: number;
  pmoMin: number;
  pmoMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLinePmoPriceDot {
  index: number;
  x: number;
  value: number;
  roc: number | null;
  pmo: number | null;
  signal: number | null;
  sign: ChartLinePmoSign;
  px: number;
  py: number;
}

export interface ChartLinePmoMarker {
  index: number;
  x: number;
  pmo: number;
  sign: ChartLinePmoSign;
  px: number;
  py: number;
}

export interface ChartLinePmoPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLinePmoLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLinePmoPanel;
  pmoPanel: ChartLinePmoPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  pmoYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pmoYMin: number;
  pmoYMax: number;
  pricePath: string;
  priceDots: ChartLinePmoPriceDot[];
  pmoPath: string;
  pmoMarkers: ChartLinePmoMarker[];
  signalPath: string;
  zeroY: number;
  smooth1Period: number;
  smooth2Period: number;
  signalPeriod: number;
  pmoFinal: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLinePmoLayoutOptions {
  data: readonly ChartLinePmoPoint[];
  smooth1Period?: number;
  smooth2Period?: number;
  signalPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLinePmoProps {
  data: readonly ChartLinePmoPoint[];
  smooth1Period?: number;
  smooth2Period?: number;
  signalPeriod?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  pmoColor?: string;
  signalColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPmo?: boolean;
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
  onPointClick?: (payload: { point: ChartLinePmoPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLinePmoFinitePoints(
  points: readonly ChartLinePmoPoint[] | null | undefined,
): ChartLinePmoPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLinePmoPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a smoothing period to an integer of at least 2. A non-finite
 * or sub-2 value falls back to `fallback`; a fractional value floors.
 * The custom EMA constant is `2 / period`, so a period of at least 2
 * keeps the constant inside `(0, 1]`.
 */
export function normalizeLinePmoPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

/**
 * The DecisionPoint custom-EMA smoothing constant for a period:
 * `2 / period`. A non-finite or sub-2 period falls back.
 */
export function computeLinePmoSmoothingConstant(
  period: number,
  fallback: number = DEFAULT_CHART_LINE_PMO_SMOOTH1_PERIOD,
): number {
  return 2 / normalizeLinePmoPeriod(period, fallback);
}

/**
 * The 1-period Rate of Change, expressed as a percentage:
 *
 *   ROC[i] = 100 * (price[i] / price[i-1] - 1)
 *
 * The first bar has no prior price, so it is null. A zero or
 * non-finite prior price (which would divide by zero) also yields a
 * null reading.
 */
export function computeLinePmoRoc(
  values: readonly number[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  if (n === 0) return [];
  const out: (number | null)[] = new Array(n);
  out[0] = null;
  for (let i = 1; i < n; i += 1) {
    const prev = values[i - 1];
    const cur = values[i];
    if (!isFiniteNumber(prev) || !isFiniteNumber(cur) || prev === 0) {
      out[i] = null;
      continue;
    }
    const roc = 100 * (cur / prev - 1);
    out[i] = isFiniteNumber(roc) ? roc : null;
  }
  return out;
}

/**
 * The DecisionPoint custom exponential moving average with constant
 * `2 / period`. Leading nulls pass through untouched; the average is
 * seeded with the first defined value and runs the recursion
 *
 *   ema[i] = k * input[i] + (1 - k) * ema[i-1]
 *
 * from there on. A null encountered after the seed carries the prior
 * average forward.
 */
export function computeLinePmoCustomEma(
  values: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  if (n === 0) return [];
  const k = computeLinePmoSmoothingConstant(period);
  const out: (number | null)[] = new Array(n);
  let prev: number | null = null;
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (!isFiniteNumber(v)) {
      out[i] = prev;
    } else if (prev === null) {
      out[i] = v;
      prev = v;
    } else {
      const next: number = k * v + (1 - k) * prev;
      out[i] = next;
      prev = next;
    }
  }
  return out;
}

function scaleLinePmoNullable(
  values: readonly (number | null)[],
  factor: number,
): (number | null)[] {
  return values.map((v) => (v === null ? null : v * factor));
}

/**
 * The full DecisionPoint Price Momentum Oscillator pipeline. The
 * 1-period ROC is smoothed twice with custom EMAs, then a signal line
 * smooths the result once more:
 *
 *   roc         = 100 * (price / prevPrice - 1)
 *   smoothedRoc = customEMA(roc, smooth1Period) * 10
 *   pmo         = customEMA(smoothedRoc, smooth2Period)
 *   signal      = customEMA(pmo, signalPeriod)
 *
 * A double-smoothed rate of change: the ROC carries the raw
 * momentum, the two custom EMAs strip its noise, and the `* 10`
 * rescales it into a readable oscillator centred on zero.
 */
export function computeLinePmo(
  values: readonly number[] | null | undefined,
  smooth1Period: number,
  smooth2Period: number,
  signalPeriod: number,
): ChartLinePmoSeries {
  if (!Array.isArray(values)) {
    return { roc: [], smoothedRoc: [], pmo: [], signal: [] };
  }
  const roc = computeLinePmoRoc(values);
  const ema1 = computeLinePmoCustomEma(roc, smooth1Period);
  const smoothedRoc = scaleLinePmoNullable(ema1, 10);
  const pmo = computeLinePmoCustomEma(smoothedRoc, smooth2Period);
  const signal = computeLinePmoCustomEma(pmo, signalPeriod);
  return { roc, smoothedRoc, pmo, signal };
}

function classifySign(v: number | null): ChartLinePmoSign {
  if (v === null || v === 0) return 'zero';
  return v > 0 ? 'positive' : 'negative';
}

export function runLinePmo(
  points: readonly ChartLinePmoPoint[] | null | undefined,
  options?: {
    smooth1Period?: number;
    smooth2Period?: number;
    signalPeriod?: number;
  },
): ChartLinePmoRun {
  const finite = getLinePmoFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const smooth1Period = normalizeLinePmoPeriod(
    options?.smooth1Period ?? DEFAULT_CHART_LINE_PMO_SMOOTH1_PERIOD,
    DEFAULT_CHART_LINE_PMO_SMOOTH1_PERIOD,
  );
  const smooth2Period = normalizeLinePmoPeriod(
    options?.smooth2Period ?? DEFAULT_CHART_LINE_PMO_SMOOTH2_PERIOD,
    DEFAULT_CHART_LINE_PMO_SMOOTH2_PERIOD,
  );
  const signalPeriod = normalizeLinePmoPeriod(
    options?.signalPeriod ?? DEFAULT_CHART_LINE_PMO_SIGNAL_PERIOD,
    DEFAULT_CHART_LINE_PMO_SIGNAL_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      smooth1Period,
      smooth2Period,
      signalPeriod,
      roc: [],
      smoothedRoc: [],
      pmo: [],
      signal: [],
      samples: [],
      pmoFinal: NaN,
      signalFinal: NaN,
      pmoMin: NaN,
      pmoMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { roc, smoothedRoc, pmo, signal } = computeLinePmo(
    values,
    smooth1Period,
    smooth2Period,
    signalPeriod,
  );

  const samples: ChartLinePmoSample[] = series.map((p, i) => {
    const pmoValue = pmo[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      roc: roc[i] ?? null,
      smoothedRoc: smoothedRoc[i] ?? null,
      pmo: pmoValue,
      signal: signal[i] ?? null,
      sign: classifySign(pmoValue),
    };
  });

  let pmoMin = Number.POSITIVE_INFINITY;
  let pmoMax = Number.NEGATIVE_INFINITY;
  let positiveCount = 0;
  let negativeCount = 0;
  for (const s of samples) {
    if (s.pmo !== null) {
      if (s.pmo < pmoMin) pmoMin = s.pmo;
      if (s.pmo > pmoMax) pmoMax = s.pmo;
    }
    if (s.sign === 'positive') positiveCount += 1;
    else if (s.sign === 'negative') negativeCount += 1;
  }

  const lastSample = samples[n - 1]!;

  return {
    series = [],
    smooth1Period,
    smooth2Period,
    signalPeriod,
    roc,
    smoothedRoc,
    pmo,
    signal,
    samples,
    pmoFinal: lastSample.pmo ?? NaN,
    signalFinal: lastSample.signal ?? NaN,
    pmoMin,
    pmoMax,
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

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function computeLinePmoLayout(
  options: ComputeLinePmoLayoutOptions,
): ChartLinePmoLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_PMO_GAP,
    tickCount = DEFAULT_CHART_LINE_PMO_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_PMO_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLinePmo(data, {
    ...(isFiniteNumber(options.smooth1Period)
      ? { smooth1Period: options.smooth1Period }
      : {}),
    ...(isFiniteNumber(options.smooth2Period)
      ? { smooth2Period: options.smooth2Period }
      : {}),
    ...(isFiniteNumber(options.signalPeriod)
      ? { signalPeriod: options.signalPeriod }
      : {}),
  });

  const emptyPanel: ChartLinePmoPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLinePmoLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    pmoPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    pmoYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pmoYMin: 0,
    pmoYMax: 0,
    pricePath: '',
    priceDots: [],
    pmoPath: '',
    pmoMarkers: [],
    signalPath: '',
    zeroY: 0,
    smooth1Period: run.smooth1Period,
    smooth2Period: run.smooth2Period,
    signalPeriod: run.signalPeriod,
    pmoFinal: NaN,
    positiveCount: 0,
    negativeCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const pmoHeight = usableHeight - priceHeight;

  const pricePanel: ChartLinePmoPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const pmoPanel: ChartLinePmoPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: pmoHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < priceLo) priceLo = s.value;
    if (s.value > priceHi) priceHi = s.value;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }

  let bound = 0;
  for (const s of run.samples) {
    if (s.pmo !== null) bound = Math.max(bound, Math.abs(s.pmo));
    if (s.signal !== null) bound = Math.max(bound, Math.abs(s.signal));
  }
  if (!isFiniteNumber(bound) || bound <= 0) bound = 1;
  const pmoLo = -bound;
  const pmoHi = bound;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const pmoRange = pmoHi - pmoLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectPmoY = (v: number): number =>
    pmoPanel.y + pmoPanel.height - ((v - pmoLo) / pmoRange) * pmoPanel.height;

  const priceDots: ChartLinePmoPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    roc: s.roc,
    pmo: s.pmo,
    signal: s.signal,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const pmoMarkers: ChartLinePmoMarker[] = run.samples
    .filter((s) => s.pmo !== null)
    .map((s) => {
      const pmoValue = s.pmo!;
      return {
        index: s.index,
        x: s.x,
        pmo: pmoValue,
        sign: s.sign,
        px: projectX(s.x),
        py: projectPmoY(pmoValue),
      };
    });

  const signalPoints = run.samples
    .filter((s) => s.signal !== null)
    .map((s) => ({
      px: projectX(s.x),
      py: projectPmoY(s.signal!),
    }));

  return {
    ok: true,
    width,
    height,
    pricePanel,
    pmoPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    pmoYTicks: computeTicks(pmoLo, pmoHi, tickCount).map((v) => ({
      value: v,
      py: projectPmoY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    pmoYMin: pmoLo,
    pmoYMax: pmoHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    pmoPath: buildPath(pmoMarkers.map((m) => ({ px: m.px, py: m.py }))),
    pmoMarkers,
    signalPath: buildPath(signalPoints),
    zeroY: projectPmoY(0),
    smooth1Period: run.smooth1Period,
    smooth2Period: run.smooth2Period,
    signalPeriod: run.signalPeriod,
    pmoFinal: run.pmoFinal,
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

export function describeLinePmoChart(
  data: readonly ChartLinePmoPoint[] | null | undefined,
  options?: {
    smooth1Period?: number;
    smooth2Period?: number;
    signalPeriod?: number;
  },
): string {
  const run = runLinePmo(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a DecisionPoint Price Momentum Oscillator (smoothing ${run.smooth1Period}/${run.smooth2Period}, signal ${run.signalPeriod}): the top panel plots the raw price; the bottom panel plots the PMO, a double-smoothed rate of change. The 1-period rate of change carries the raw momentum; two custom exponential moving averages strip its noise; a signal line smooths the result once more. The PMO reads positive on ${run.positiveCount} bars and negative on ${run.negativeCount} across ${run.samples.length} bars.`;
}

const PMO_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLinePmo = forwardRef<HTMLDivElement, ChartLinePmoProps>(
  function ChartLinePmo(
    props: ChartLinePmoProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      smooth1Period,
      smooth2Period,
      signalPeriod,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_PMO_WIDTH,
      height = DEFAULT_CHART_LINE_PMO_HEIGHT,
      padding = DEFAULT_CHART_LINE_PMO_PADDING,
      gap = DEFAULT_CHART_LINE_PMO_GAP,
      tickCount = DEFAULT_CHART_LINE_PMO_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_PMO_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_PMO_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_PMO_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_PMO_PRICE_COLOR,
      pmoColor = DEFAULT_CHART_LINE_PMO_PMO_COLOR,
      signalColor = DEFAULT_CHART_LINE_PMO_SIGNAL_COLOR,
      positiveColor = DEFAULT_CHART_LINE_PMO_POSITIVE_COLOR,
      negativeColor = DEFAULT_CHART_LINE_PMO_NEGATIVE_COLOR,
      zeroColor = DEFAULT_CHART_LINE_PMO_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_PMO_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_PMO_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showPmo = true,
      showSignal = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a DecisionPoint Price Momentum Oscillator',
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
        computeLinePmoLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
          ...(isFiniteNumber(smooth1Period) ? { smooth1Period } : {}),
          ...(isFiniteNumber(smooth2Period) ? { smooth2Period } : {}),
          ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
        }),
      [
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        smooth1Period,
        smooth2Period,
        signalPeriod,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLinePmoChart(data, {
          ...(isFiniteNumber(smooth1Period) ? { smooth1Period } : {}),
          ...(isFiniteNumber(smooth2Period) ? { smooth2Period } : {}),
          ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
        }),
      [ariaDescription, data, smooth1Period, smooth2Period, signalPeriod],
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
          data-section="chart-line-pmo"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-pmo-aria-desc"
            style={PMO_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const op = layout.pmoPanel;
    const priceVisible = !hiddenSet.has('price');
    const pmoVisible = showPmo && !hiddenSet.has('pmo');
    const signalVisible = showSignal && !hiddenSet.has('signal');

    const signColor = (sign: ChartLinePmoSign): string =>
      sign === 'positive'
        ? positiveColor
        : sign === 'negative'
          ? negativeColor
          : zeroColor;

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'pmo', label: 'PMO', color: pmoColor },
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
        data-section="chart-line-pmo"
        data-empty="false"
        data-smooth1-period={layout.smooth1Period}
        data-smooth2-period={layout.smooth2Period}
        data-signal-period={layout.signalPeriod}
        data-pmo-final={layout.pmoFinal}
        data-positive-count={layout.positiveCount}
        data-negative-count={layout.negativeCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-pmo-aria-desc"
          style={PMO_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-pmo-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-pmo-badge"
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
                data-section="chart-line-pmo-badge-icon"
                aria-hidden="true"
                style={{ color: pmoColor }}
              >
                PMO
              </span>
              <span data-section="chart-line-pmo-badge-periods">
                {layout.smooth1Period}/{layout.smooth2Period}/
                {layout.signalPeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-pmo-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-pmo-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-pmo-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.pmoYTicks.map((t, i) => (
                  <line
                    key={`go-${i}`}
                    data-section="chart-line-pmo-grid-line"
                    data-panel="pmo"
                    x1={op.x}
                    x2={op.x + op.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-pmo-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-pmo-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-pmo-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-pmo-axis"
                  data-panel="pmo"
                  data-axis="y"
                  x1={op.x}
                  y1={op.y}
                  x2={op.x}
                  y2={op.y + op.height}
                />
                <line
                  data-section="chart-line-pmo-axis"
                  data-panel="pmo"
                  data-axis="x"
                  x1={op.x}
                  y1={op.y + op.height}
                  x2={op.x + op.width}
                  y2={op.y + op.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-pmo-tick-label"
                    data-panel="price"
                    data-axis="y"
                    x={pp.x - 6}
                    y={t.py + 3}
                    textAnchor="end"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatValue(t.value)}
                  </text>
                ))}
                {layout.pmoYTicks.map((t, i) => (
                  <text
                    key={`oyt-${i}`}
                    data-section="chart-line-pmo-tick-label"
                    data-panel="pmo"
                    data-axis="y"
                    x={op.x - 6}
                    y={t.py + 3}
                    textAnchor="end"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatValue(t.value)}
                  </text>
                ))}
                {layout.xTicks.map((t, i) => (
                  <text
                    key={`xt-${i}`}
                    data-section="chart-line-pmo-tick-label"
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
                ))}
              </g>
            ) : null}

            <text
              data-section="chart-line-pmo-panel-label"
              data-panel="price"
              x={pp.x + 2}
              y={pp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Price
            </text>
            <text
              data-section="chart-line-pmo-panel-label"
              data-panel="pmo"
              x={op.x + 2}
              y={op.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              PMO
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-pmo-zero-line"
                x1={op.x}
                x2={op.x + op.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-pmo-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-pmo-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-pmo-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.value}
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
                role="graphics-symbol"
                tabIndex={0}
                aria-label="PMO signal line"
                data-section="chart-line-pmo-signal-line"
                d={layout.signalPath}
                fill="none"
                stroke={signalColor}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="5 3"
              />
            ) : null}

            {pmoVisible && layout.pmoPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price Momentum Oscillator line"
                data-section="chart-line-pmo-pmo-line"
                d={layout.pmoPath}
                fill="none"
                stroke={pmoColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {pmoVisible ? (
              <g data-section="chart-line-pmo-markers">
                {layout.pmoMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`PMO at x ${formatX(m.x)}: ${formatValue(m.pmo)}, ${m.sign}`}
                      data-section="chart-line-pmo-marker"
                      data-point-index={m.index}
                      data-pmo={m.pmo}
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
                    data-section="chart-line-pmo-tooltip"
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
                    <div data-section="chart-line-pmo-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-pmo-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-pmo-tooltip-roc">
                      roc: {fmtNullable(d.roc)}
                    </div>
                    <div data-section="chart-line-pmo-tooltip-pmo">
                      pmo: {fmtNullable(d.pmo)}
                    </div>
                    <div data-section="chart-line-pmo-tooltip-signal">
                      signal: {fmtNullable(d.signal)}
                    </div>
                    <div data-section="chart-line-pmo-tooltip-sign">
                      sign: {d.sign}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-pmo-legend"
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
                  data-section="chart-line-pmo-legend-item"
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
                    data-section="chart-line-pmo-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-pmo-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-pmo-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.positiveCount} positive, {layout.negativeCount} negative
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLinePmo.displayName = 'ChartLinePmo';
