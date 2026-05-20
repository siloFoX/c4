import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_TRENDFLEX_WIDTH = 560;
export const DEFAULT_CHART_LINE_TRENDFLEX_HEIGHT = 360;
export const DEFAULT_CHART_LINE_TRENDFLEX_PADDING = 40;
export const DEFAULT_CHART_LINE_TRENDFLEX_GAP = 12;
export const DEFAULT_CHART_LINE_TRENDFLEX_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TRENDFLEX_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TRENDFLEX_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TRENDFLEX_PERIOD = 20;
export const DEFAULT_CHART_LINE_TRENDFLEX_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_TRENDFLEX_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_TRENDFLEX_TRENDFLEX_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_TRENDFLEX_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TRENDFLEX_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TRENDFLEX_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TRENDFLEX_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TRENDFLEX_AXIS_COLOR = '#cbd5e1';

export type ChartLineTrendflexTrend = 'up' | 'down' | 'flat';

export interface ChartLineTrendflexPoint {
  x: number;
  value: number;
}

export interface ChartLineTrendflexCoefficients {
  a1: number;
  b1: number;
  c1: number;
  c2: number;
  c3: number;
}

export interface ChartLineTrendflexSeries {
  filt: number[];
  sum: (number | null)[];
  ms: (number | null)[];
  trendflex: (number | null)[];
}

export interface ChartLineTrendflexSample {
  index: number;
  x: number;
  value: number;
  filt: number;
  sum: number | null;
  ms: number | null;
  trendflex: number | null;
  trend: ChartLineTrendflexTrend;
}

export interface ChartLineTrendflexRun {
  series: ChartLineTrendflexPoint[];
  period: number;
  filt: number[];
  sum: (number | null)[];
  ms: (number | null)[];
  trendflex: (number | null)[];
  samples: ChartLineTrendflexSample[];
  trendflexFinal: number;
  trendflexMin: number;
  trendflexMax: number;
  upCount: number;
  downCount: number;
  ok: boolean;
}

export interface ChartLineTrendflexPriceDot {
  index: number;
  x: number;
  value: number;
  filt: number;
  sum: number | null;
  trendflex: number | null;
  trend: ChartLineTrendflexTrend;
  px: number;
  py: number;
}

export interface ChartLineTrendflexMarker {
  index: number;
  x: number;
  trendflex: number;
  trend: ChartLineTrendflexTrend;
  px: number;
  py: number;
}

export interface ChartLineTrendflexPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineTrendflexLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineTrendflexPanel;
  trendflexPanel: ChartLineTrendflexPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  trendflexYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  trendflexYMin: number;
  trendflexYMax: number;
  pricePath: string;
  priceDots: ChartLineTrendflexPriceDot[];
  trendflexPath: string;
  trendflexMarkers: ChartLineTrendflexMarker[];
  zeroY: number;
  period: number;
  trendflexFinal: number;
  upCount: number;
  downCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineTrendflexLayoutOptions {
  data: readonly ChartLineTrendflexPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineTrendflexProps {
  data: readonly ChartLineTrendflexPoint[];
  period?: number;
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
  trendflexColor?: string;
  upColor?: string;
  downColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTrendflex?: boolean;
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
  onPointClick?: (payload: { point: ChartLineTrendflexPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineTrendflexFinitePoints(
  points: readonly ChartLineTrendflexPoint[] | null | undefined,
): ChartLineTrendflexPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineTrendflexPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce the Trendflex period to an integer of at least 2. A
 * non-finite or sub-2 value falls back to `fallback`; a fractional
 * value floors. The period drives both the Super Smoother (which
 * uses half the period) and the trend-sum lookback length.
 */
export function normalizeLineTrendflexPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

/**
 * The coefficients of the Super Smoother stage -- a two-pole
 * low-pass filter. The Trendflex runs the smoother at half the
 * period; with `arg = 1.414 * PI / (0.5 * period)`:
 * `a1 = exp(-arg)`, `b1 = 2*a1*cos(arg)`, `c2 = b1`,
 * `c3 = -(a1*a1)`, `c1 = 1 - c2 - c3`.
 */
export function computeLineTrendflexSmootherCoefficients(
  period: number,
): ChartLineTrendflexCoefficients {
  const p = normalizeLineTrendflexPeriod(
    period,
    DEFAULT_CHART_LINE_TRENDFLEX_PERIOD,
  );
  const arg = (1.414 * Math.PI) / (0.5 * p);
  const a1 = Math.exp(-arg);
  const b1 = 2 * a1 * Math.cos(arg);
  const c2 = b1;
  const c3 = -(a1 * a1);
  const c1 = 1 - c2 - c3;
  return { a1, b1, c1, c2, c3 };
}

/**
 * The Ehlers Super Smoother of the price -- a two-pole low-pass
 * filter that strips the high-frequency noise. The first two bars
 * seed straight from the input; an all-zero series stays at zero.
 */
export function computeLineTrendflexSmoother(
  values: readonly number[] | null | undefined,
  period: number,
): number[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  if (n === 0) return [];
  const out: number[] = new Array(n);
  out[0] = values[0]!;
  if (n === 1) return out;
  out[1] = values[1]!;
  const { c1, c2, c3 } = computeLineTrendflexSmootherCoefficients(period);
  for (let i = 2; i < n; i += 1) {
    out[i] =
      (c1 * (values[i]! + values[i - 1]!)) / 2 +
      c2 * out[i - 1]! +
      c3 * out[i - 2]!;
  }
  return out;
}

/**
 * The Trendflex sum -- the average bar-to-bar displacement of the
 * Super Smoother over the lookback window:
 *
 *   sum[i] = (1 / period) * SUM[count=1..period] (filt[i] - filt[i-count])
 *
 * Equivalently, the filtered value minus the mean of the previous
 * `period` filtered values: positive while the smoother is rising,
 * negative while it is falling. Bars before the window is full are
 * null.
 */
export function computeLineTrendflexSum(
  filt: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(filt)) return [];
  const p = normalizeLineTrendflexPeriod(
    period,
    DEFAULT_CHART_LINE_TRENDFLEX_PERIOD,
  );
  const n = filt.length;
  const out: (number | null)[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    if (i < p) {
      out[i] = null;
      continue;
    }
    let acc = 0;
    for (let count = 1; count <= p; count += 1) {
      acc += filt[i]! - filt[i - count]!;
    }
    out[i] = acc / p;
  }
  return out;
}

/**
 * The full Ehlers Trendflex pipeline. The price is run through a
 * Super Smoother; the trend sum measures the smoother's average
 * displacement over the lookback window; that sum is normalized by
 * the square root of an adaptively accumulated mean square:
 *
 *   ms[i]        = 0.04 * sum[i]^2 + 0.96 * ms[i-1]
 *   trendflex[i] = ms[i] != 0 ? sum[i] / sqrt(ms[i]) : 0
 *
 * The result is a zero-centred oscillator: a large positive reading
 * marks a strong uptrend, a large negative reading a strong
 * downtrend, a reading near zero no trend.
 */
export function computeLineTrendflex(
  values: readonly number[] | null | undefined,
  period: number,
): ChartLineTrendflexSeries {
  if (!Array.isArray(values)) {
    return { filt: [], sum: [], ms: [], trendflex: [] };
  }
  const filt = computeLineTrendflexSmoother(values, period);
  const sum = computeLineTrendflexSum(filt, period);
  const n = sum.length;
  const ms: (number | null)[] = new Array(n);
  const trendflex: (number | null)[] = new Array(n);
  let prevMs = 0;
  for (let i = 0; i < n; i += 1) {
    const s = sum[i];
    if (!isFiniteNumber(s)) {
      ms[i] = null;
      trendflex[i] = null;
      continue;
    }
    const msVal: number = 0.04 * s * s + 0.96 * prevMs;
    ms[i] = msVal;
    prevMs = msVal;
    trendflex[i] = msVal !== 0 ? s / Math.sqrt(msVal) : 0;
  }
  return { filt, sum, ms, trendflex };
}

function classifyTrend(v: number | null): ChartLineTrendflexTrend {
  if (v === null || v === 0) return 'flat';
  return v > 0 ? 'up' : 'down';
}

export function runLineTrendflex(
  points: readonly ChartLineTrendflexPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineTrendflexRun {
  const finite = getLineTrendflexFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineTrendflexPeriod(
    options?.period ?? DEFAULT_CHART_LINE_TRENDFLEX_PERIOD,
    DEFAULT_CHART_LINE_TRENDFLEX_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      filt: [],
      sum: [],
      ms: [],
      trendflex: [],
      samples: [],
      trendflexFinal: NaN,
      trendflexMin: NaN,
      trendflexMax: NaN,
      upCount: 0,
      downCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { filt, sum, ms, trendflex } = computeLineTrendflex(values, period);

  const samples: ChartLineTrendflexSample[] = series.map((p, i) => {
    const tf = trendflex[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      filt: filt[i]!,
      sum: sum[i] ?? null,
      ms: ms[i] ?? null,
      trendflex: tf,
      trend: classifyTrend(tf),
    };
  });

  let tfMin = Number.POSITIVE_INFINITY;
  let tfMax = Number.NEGATIVE_INFINITY;
  let upCount = 0;
  let downCount = 0;
  for (const s of samples) {
    if (s.trendflex !== null) {
      if (s.trendflex < tfMin) tfMin = s.trendflex;
      if (s.trendflex > tfMax) tfMax = s.trendflex;
    }
    if (s.trend === 'up') upCount += 1;
    else if (s.trend === 'down') downCount += 1;
  }

  const lastSample = samples[n - 1]!;

  return {
    series,
    period,
    filt,
    sum,
    ms,
    trendflex,
    samples,
    trendflexFinal: lastSample.trendflex ?? NaN,
    trendflexMin: isFiniteNumber(tfMin) ? tfMin : NaN,
    trendflexMax: isFiniteNumber(tfMax) ? tfMax : NaN,
    upCount,
    downCount,
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

export function computeLineTrendflexLayout(
  options: ComputeLineTrendflexLayoutOptions,
): ChartLineTrendflexLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_TRENDFLEX_GAP,
    tickCount = DEFAULT_CHART_LINE_TRENDFLEX_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_TRENDFLEX_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineTrendflex(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });

  const emptyPanel: ChartLineTrendflexPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineTrendflexLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    trendflexPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    trendflexYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    trendflexYMin: 0,
    trendflexYMax: 0,
    pricePath: '',
    priceDots: [],
    trendflexPath: '',
    trendflexMarkers: [],
    zeroY: 0,
    period: run.period,
    trendflexFinal: NaN,
    upCount: 0,
    downCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const trendflexHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineTrendflexPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const trendflexPanel: ChartLineTrendflexPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: trendflexHeight,
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

  let bound = Math.max(
    Math.abs(run.trendflexMin),
    Math.abs(run.trendflexMax),
  );
  if (!isFiniteNumber(bound) || bound <= 0) bound = 1;
  const trendflexLo = -bound;
  const trendflexHi = bound;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const trendflexRange = trendflexHi - trendflexLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectTrendflexY = (v: number): number =>
    trendflexPanel.y +
    trendflexPanel.height -
    ((v - trendflexLo) / trendflexRange) * trendflexPanel.height;

  const priceDots: ChartLineTrendflexPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    filt: s.filt,
    sum: s.sum,
    trendflex: s.trendflex,
    trend: s.trend,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const trendflexMarkers: ChartLineTrendflexMarker[] = run.samples
    .filter((s) => s.trendflex !== null)
    .map((s) => {
      const tf = s.trendflex!;
      return {
        index: s.index,
        x: s.x,
        trendflex: tf,
        trend: s.trend,
        px: projectX(s.x),
        py: projectTrendflexY(tf),
      };
    });

  return {
    ok: true,
    width,
    height,
    pricePanel,
    trendflexPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    trendflexYTicks: computeTicks(trendflexLo, trendflexHi, tickCount).map(
      (v) => ({
        value: v,
        py: projectTrendflexY(v),
      }),
    ),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    trendflexYMin: trendflexLo,
    trendflexYMax: trendflexHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    trendflexPath: buildPath(
      trendflexMarkers.map((m) => ({ px: m.px, py: m.py })),
    ),
    trendflexMarkers,
    zeroY: projectTrendflexY(0),
    period: run.period,
    trendflexFinal: run.trendflexFinal,
    upCount: run.upCount,
    downCount: run.downCount,
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

export function describeLineTrendflexChart(
  data: readonly ChartLineTrendflexPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineTrendflex(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with an Ehlers Trendflex indicator (period ${run.period}): the top panel plots the raw price; the bottom panel plots the Trendflex, a zero-centred oscillator measuring trend strength. The price is run through a Super Smoother; the trend sum measures the smoother's average displacement over the lookback window; that sum is normalized by the root mean square of its recent history. A large positive reading marks a strong uptrend, a large negative reading a strong downtrend. The Trendflex reads up on ${run.upCount} bars and down on ${run.downCount} across ${run.samples.length} bars.`;
}

const TRENDFLEX_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineTrendflex = forwardRef<
  HTMLDivElement,
  ChartLineTrendflexProps
>(function ChartLineTrendflex(
  props: ChartLineTrendflexProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_TRENDFLEX_WIDTH,
    height = DEFAULT_CHART_LINE_TRENDFLEX_HEIGHT,
    padding = DEFAULT_CHART_LINE_TRENDFLEX_PADDING,
    gap = DEFAULT_CHART_LINE_TRENDFLEX_GAP,
    tickCount = DEFAULT_CHART_LINE_TRENDFLEX_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_TRENDFLEX_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_TRENDFLEX_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TRENDFLEX_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TRENDFLEX_PRICE_COLOR,
    trendflexColor = DEFAULT_CHART_LINE_TRENDFLEX_TRENDFLEX_COLOR,
    upColor = DEFAULT_CHART_LINE_TRENDFLEX_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_TRENDFLEX_DOWN_COLOR,
    zeroColor = DEFAULT_CHART_LINE_TRENDFLEX_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_TRENDFLEX_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_TRENDFLEX_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTrendflex = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Two-panel chart with an Ehlers Trendflex indicator',
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
      computeLineTrendflexLayout({
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        ...(isFiniteNumber(period) ? { period } : {}),
      }),
    [data, width, height, padding, gap, tickCount, pricePanelRatio, period],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineTrendflexChart(data, {
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
        data-section="chart-line-trendflex"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-trendflex-aria-desc"
          style={TRENDFLEX_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const tp = layout.trendflexPanel;
  const priceVisible = !hiddenSet.has('price');
  const trendflexVisible = showTrendflex && !hiddenSet.has('trendflex');

  const trendColor = (trend: ChartLineTrendflexTrend): string =>
    trend === 'up' ? upColor : trend === 'down' ? downColor : zeroColor;

  const fmtNullable = (v: number | null): string =>
    v === null ? 'n/a' : formatValue(v);

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'trendflex', label: 'Trendflex', color: trendflexColor },
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
      data-section="chart-line-trendflex"
      data-empty="false"
      data-period={layout.period}
      data-trendflex-final={layout.trendflexFinal}
      data-up-count={layout.upCount}
      data-down-count={layout.downCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-trendflex-aria-desc"
        style={TRENDFLEX_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-trendflex-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-trendflex-badge"
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
              data-section="chart-line-trendflex-badge-icon"
              aria-hidden="true"
              style={{ color: trendflexColor }}
            >
              TRENDFLEX
            </span>
            <span data-section="chart-line-trendflex-badge-period">
              {layout.period}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-trendflex-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-trendflex-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`gp-${i}`}
                  data-section="chart-line-trendflex-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.trendflexYTicks.map((t, i) => (
                <line
                  key={`gt-${i}`}
                  data-section="chart-line-trendflex-grid-line"
                  data-panel="trendflex"
                  x1={tp.x}
                  x2={tp.x + tp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-trendflex-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-trendflex-axis"
                data-panel="price"
                data-axis="y"
                x1={pp.x}
                y1={pp.y}
                x2={pp.x}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-trendflex-axis"
                data-panel="price"
                data-axis="x"
                x1={pp.x}
                y1={pp.y + pp.height}
                x2={pp.x + pp.width}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-trendflex-axis"
                data-panel="trendflex"
                data-axis="y"
                x1={tp.x}
                y1={tp.y}
                x2={tp.x}
                y2={tp.y + tp.height}
              />
              <line
                data-section="chart-line-trendflex-axis"
                data-panel="trendflex"
                data-axis="x"
                x1={tp.x}
                y1={tp.y + tp.height}
                x2={tp.x + tp.width}
                y2={tp.y + tp.height}
              />
              {layout.priceYTicks.map((t, i) => (
                <text
                  key={`pyt-${i}`}
                  data-section="chart-line-trendflex-tick-label"
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
              {layout.trendflexYTicks.map((t, i) => (
                <text
                  key={`tyt-${i}`}
                  data-section="chart-line-trendflex-tick-label"
                  data-panel="trendflex"
                  data-axis="y"
                  x={tp.x - 6}
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
                  data-section="chart-line-trendflex-tick-label"
                  data-axis="x"
                  x={t.px}
                  y={tp.y + tp.height + 14}
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
            data-section="chart-line-trendflex-panel-label"
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
            data-section="chart-line-trendflex-panel-label"
            data-panel="trendflex"
            x={tp.x + 2}
            y={tp.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            Trendflex
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-trendflex-zero-line"
              x1={tp.x}
              x2={tp.x + tp.width}
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
              data-section="chart-line-trendflex-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-trendflex-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-trendflex-dot"
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

          {trendflexVisible && layout.trendflexPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Ehlers Trendflex line"
              data-section="chart-line-trendflex-trendflex-line"
              d={layout.trendflexPath}
              fill="none"
              stroke={trendflexColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {trendflexVisible ? (
            <g data-section="chart-line-trendflex-markers">
              {layout.trendflexMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Trendflex at x ${formatX(m.x)}: ${formatValue(m.trendflex)}, ${m.trend}`}
                    data-section="chart-line-trendflex-marker"
                    data-point-index={m.index}
                    data-trendflex={m.trendflex}
                    data-trend={m.trend}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={trendColor(m.trend)}
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
                  data-section="chart-line-trendflex-tooltip"
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
                  <div data-section="chart-line-trendflex-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-trendflex-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-trendflex-tooltip-filt">
                    filt: {formatValue(d.filt)}
                  </div>
                  <div data-section="chart-line-trendflex-tooltip-sum">
                    sum: {fmtNullable(d.sum)}
                  </div>
                  <div data-section="chart-line-trendflex-tooltip-trendflex">
                    trendflex: {fmtNullable(d.trendflex)}
                  </div>
                  <div data-section="chart-line-trendflex-tooltip-trend">
                    trend: {d.trend}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-trendflex-legend"
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
                data-section="chart-line-trendflex-legend-item"
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
                  data-section="chart-line-trendflex-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-trendflex-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-trendflex-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.upCount} up, {layout.downCount} down
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineTrendflex.displayName = 'ChartLineTrendflex';
