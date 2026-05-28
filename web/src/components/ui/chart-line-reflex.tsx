import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_REFLEX_WIDTH = 560;
export const DEFAULT_CHART_LINE_REFLEX_HEIGHT = 360;
export const DEFAULT_CHART_LINE_REFLEX_PADDING = 40;
export const DEFAULT_CHART_LINE_REFLEX_GAP = 12;
export const DEFAULT_CHART_LINE_REFLEX_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_REFLEX_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_REFLEX_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_REFLEX_PERIOD = 20;
export const DEFAULT_CHART_LINE_REFLEX_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_REFLEX_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_REFLEX_REFLEX_COLOR = '#4f46e5';
export const DEFAULT_CHART_LINE_REFLEX_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_REFLEX_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_REFLEX_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_REFLEX_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_REFLEX_AXIS_COLOR = '#cbd5e1';

export type ChartLineReflexSign = 'positive' | 'negative' | 'zero';

export interface ChartLineReflexPoint {
  x: number;
  value: number;
}

export interface ChartLineReflexCoefficients {
  a1: number;
  b1: number;
  c1: number;
  c2: number;
  c3: number;
}

export interface ChartLineReflexSeries {
  filt: number[];
  sum: (number | null)[];
  ms: (number | null)[];
  reflex: (number | null)[];
}

export interface ChartLineReflexSample {
  index: number;
  x: number;
  value: number;
  filt: number;
  sum: number | null;
  ms: number | null;
  reflex: number | null;
  sign: ChartLineReflexSign;
}

export interface ChartLineReflexRun {
  series: ChartLineReflexPoint[];
  period: number;
  filt: number[];
  sum: (number | null)[];
  ms: (number | null)[];
  reflex: (number | null)[];
  samples: ChartLineReflexSample[];
  reflexFinal: number;
  reflexMin: number;
  reflexMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineReflexPriceDot {
  index: number;
  x: number;
  value: number;
  filt: number;
  sum: number | null;
  reflex: number | null;
  sign: ChartLineReflexSign;
  px: number;
  py: number;
}

export interface ChartLineReflexMarker {
  index: number;
  x: number;
  reflex: number;
  sign: ChartLineReflexSign;
  px: number;
  py: number;
}

export interface ChartLineReflexPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineReflexLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineReflexPanel;
  reflexPanel: ChartLineReflexPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  reflexYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  reflexYMin: number;
  reflexYMax: number;
  pricePath: string;
  priceDots: ChartLineReflexPriceDot[];
  reflexPath: string;
  reflexMarkers: ChartLineReflexMarker[];
  zeroY: number;
  period: number;
  reflexFinal: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineReflexLayoutOptions {
  data: readonly ChartLineReflexPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineReflexProps {
  data: readonly ChartLineReflexPoint[];
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
  reflexColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showReflex?: boolean;
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
  onPointClick?: (payload: { point: ChartLineReflexPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineReflexFinitePoints(
  points: readonly ChartLineReflexPoint[] | null | undefined,
): ChartLineReflexPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineReflexPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce the Reflex period to an integer of at least 2. A non-finite
 * or sub-2 value falls back to `fallback`; a fractional value floors.
 * The period drives both the Super Smoother (which uses half the
 * period) and the deviation lookback length.
 */
export function normalizeLineReflexPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

/**
 * The coefficients of the Super Smoother stage -- a two-pole
 * low-pass filter. The Reflex runs the smoother at half the period;
 * with `arg = 1.414 * PI / (0.5 * period)`: `a1 = exp(-arg)`,
 * `b1 = 2*a1*cos(arg)`, `c2 = b1`, `c3 = -(a1*a1)`,
 * `c1 = 1 - c2 - c3`.
 */
export function computeLineReflexSmootherCoefficients(
  period: number,
): ChartLineReflexCoefficients {
  const p = normalizeLineReflexPeriod(period, DEFAULT_CHART_LINE_REFLEX_PERIOD);
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
export function computeLineReflexSmoother(
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
  const { c1, c2, c3 } = computeLineReflexSmootherCoefficients(period);
  for (let i = 2; i < n; i += 1) {
    out[i] =
      (c1 * (values[i]! + values[i - 1]!)) / 2 +
      c2 * out[i - 1]! +
      c3 * out[i - 2]!;
  }
  return out;
}

/**
 * The Reflex sum -- the deviation of the Super Smoother from a
 * straight line drawn across the lookback window. The trendline
 * runs from `filt[i]` back to `filt[i-period]` with
 * `slope = (filt[i-period] - filt[i]) / period`:
 *
 *   sum[i] = (1 / period)
 *          * SUM[count=1..period] (filt[i] + count*slope - filt[i-count])
 *
 * Each term is the trendline value `count` bars back minus the
 * actual filtered value there. Because the trendline is subtracted,
 * the Reflex has no trend response: a perfectly linear filter
 * returns zero. It reacts only to the cyclic swings away from the
 * line. Bars before the window is full are null.
 */
export function computeLineReflexSum(
  filt: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(filt)) return [];
  const p = normalizeLineReflexPeriod(period, DEFAULT_CHART_LINE_REFLEX_PERIOD);
  const n = filt.length;
  const out: (number | null)[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    if (i < p) {
      out[i] = null;
      continue;
    }
    const slope = (filt[i - p]! - filt[i]!) / p;
    let acc = 0;
    for (let count = 1; count <= p; count += 1) {
      acc += filt[i]! + count * slope - filt[i - count]!;
    }
    out[i] = acc / p;
  }
  return out;
}

/**
 * The full Ehlers Reflex pipeline. The price is run through a Super
 * Smoother; the Reflex sum measures the smoother's deviation from a
 * straight trendline across the lookback window; that sum is
 * normalized by the square root of an adaptively accumulated mean
 * square:
 *
 *   ms[i]     = 0.04 * sum[i]^2 + 0.96 * ms[i-1]
 *   reflex[i] = ms[i] != 0 ? sum[i] / sqrt(ms[i]) : 0
 *
 * The result is a zero-centred oscillator with no trend lag: it
 * crosses zero at cycle turning points, spiking positive and
 * negative as the price swings.
 */
export function computeLineReflex(
  values: readonly number[] | null | undefined,
  period: number,
): ChartLineReflexSeries {
  if (!Array.isArray(values)) {
    return { filt: [], sum: [], ms: [], reflex: [] };
  }
  const filt = computeLineReflexSmoother(values, period);
  const sum = computeLineReflexSum(filt, period);
  const n = sum.length;
  const ms: (number | null)[] = new Array(n);
  const reflex: (number | null)[] = new Array(n);
  let prevMs = 0;
  for (let i = 0; i < n; i += 1) {
    const s = sum[i];
    if (!isFiniteNumber(s)) {
      ms[i] = null;
      reflex[i] = null;
      continue;
    }
    const msVal: number = 0.04 * s * s + 0.96 * prevMs;
    ms[i] = msVal;
    prevMs = msVal;
    reflex[i] = msVal !== 0 ? s / Math.sqrt(msVal) : 0;
  }
  return { filt, sum, ms, reflex };
}

function classifySign(v: number | null): ChartLineReflexSign {
  if (v === null || v === 0) return 'zero';
  return v > 0 ? 'positive' : 'negative';
}

export function runLineReflex(
  points: readonly ChartLineReflexPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineReflexRun {
  const finite = getLineReflexFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineReflexPeriod(
    options?.period ?? DEFAULT_CHART_LINE_REFLEX_PERIOD,
    DEFAULT_CHART_LINE_REFLEX_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      filt: [],
      sum: [],
      ms: [],
      reflex: [],
      samples: [],
      reflexFinal: NaN,
      reflexMin: NaN,
      reflexMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { filt, sum, ms, reflex } = computeLineReflex(values, period);

  const samples: ChartLineReflexSample[] = series.map((p, i) => {
    const rf = reflex[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      filt: filt[i]!,
      sum: sum[i] ?? null,
      ms: ms[i] ?? null,
      reflex: rf,
      sign: classifySign(rf),
    };
  });

  let rfMin = Number.POSITIVE_INFINITY;
  let rfMax = Number.NEGATIVE_INFINITY;
  let positiveCount = 0;
  let negativeCount = 0;
  for (const s of samples) {
    if (s.reflex !== null) {
      if (s.reflex < rfMin) rfMin = s.reflex;
      if (s.reflex > rfMax) rfMax = s.reflex;
    }
    if (s.sign === 'positive') positiveCount += 1;
    else if (s.sign === 'negative') negativeCount += 1;
  }

  const lastSample = samples[n - 1]!;

  return {
    series = [],
    period,
    filt,
    sum,
    ms,
    reflex,
    samples,
    reflexFinal: lastSample.reflex ?? NaN,
    reflexMin: isFiniteNumber(rfMin) ? rfMin : NaN,
    reflexMax: isFiniteNumber(rfMax) ? rfMax : NaN,
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

export function computeLineReflexLayout(
  options: ComputeLineReflexLayoutOptions,
): ChartLineReflexLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_REFLEX_GAP,
    tickCount = DEFAULT_CHART_LINE_REFLEX_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_REFLEX_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineReflex(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });

  const emptyPanel: ChartLineReflexPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineReflexLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    reflexPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    reflexYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    reflexYMin: 0,
    reflexYMax: 0,
    pricePath: '',
    priceDots: [],
    reflexPath: '',
    reflexMarkers: [],
    zeroY: 0,
    period: run.period,
    reflexFinal: NaN,
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
  const reflexHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineReflexPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const reflexPanel: ChartLineReflexPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: reflexHeight,
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

  let bound = Math.max(Math.abs(run.reflexMin), Math.abs(run.reflexMax));
  if (!isFiniteNumber(bound) || bound <= 0) bound = 1;
  const reflexLo = -bound;
  const reflexHi = bound;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const reflexRange = reflexHi - reflexLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectReflexY = (v: number): number =>
    reflexPanel.y +
    reflexPanel.height -
    ((v - reflexLo) / reflexRange) * reflexPanel.height;

  const priceDots: ChartLineReflexPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    filt: s.filt,
    sum: s.sum,
    reflex: s.reflex,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const reflexMarkers: ChartLineReflexMarker[] = run.samples
    .filter((s) => s.reflex !== null)
    .map((s) => {
      const rf = s.reflex!;
      return {
        index: s.index,
        x: s.x,
        reflex: rf,
        sign: s.sign,
        px: projectX(s.x),
        py: projectReflexY(rf),
      };
    });

  return {
    ok: true,
    width,
    height,
    pricePanel,
    reflexPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    reflexYTicks: computeTicks(reflexLo, reflexHi, tickCount).map((v) => ({
      value: v,
      py: projectReflexY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    reflexYMin: reflexLo,
    reflexYMax: reflexHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    reflexPath: buildPath(reflexMarkers.map((m) => ({ px: m.px, py: m.py }))),
    reflexMarkers,
    zeroY: projectReflexY(0),
    period: run.period,
    reflexFinal: run.reflexFinal,
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

export function describeLineReflexChart(
  data: readonly ChartLineReflexPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineReflex(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with an Ehlers Reflex indicator (period ${run.period}): the top panel plots the raw price; the bottom panel plots the Reflex, a zero-centred oscillator detecting cycle turning points. The price is run through a Super Smoother; the Reflex measures the deviation of the smoother from a straight trendline drawn across the lookback window, so it carries no trend lag and reacts only to the cyclic swings; that deviation is normalized by the root mean square of its recent history. The Reflex reads positive on ${run.positiveCount} bars and negative on ${run.negativeCount} across ${run.samples.length} bars.`;
}

const REFLEX_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineReflex = forwardRef<HTMLDivElement, ChartLineReflexProps>(
  function ChartLineReflex(
    props: ChartLineReflexProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_REFLEX_WIDTH,
      height = DEFAULT_CHART_LINE_REFLEX_HEIGHT,
      padding = DEFAULT_CHART_LINE_REFLEX_PADDING,
      gap = DEFAULT_CHART_LINE_REFLEX_GAP,
      tickCount = DEFAULT_CHART_LINE_REFLEX_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_REFLEX_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_REFLEX_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_REFLEX_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_REFLEX_PRICE_COLOR,
      reflexColor = DEFAULT_CHART_LINE_REFLEX_REFLEX_COLOR,
      positiveColor = DEFAULT_CHART_LINE_REFLEX_POSITIVE_COLOR,
      negativeColor = DEFAULT_CHART_LINE_REFLEX_NEGATIVE_COLOR,
      zeroColor = DEFAULT_CHART_LINE_REFLEX_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_REFLEX_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_REFLEX_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showReflex = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with an Ehlers Reflex indicator',
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
        computeLineReflexLayout({
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
        describeLineReflexChart(data, {
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
          data-section="chart-line-reflex"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-reflex-aria-desc"
            style={REFLEX_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const rp = layout.reflexPanel;
    const priceVisible = !hiddenSet.has('price');
    const reflexVisible = showReflex && !hiddenSet.has('reflex');

    const signColor = (sign: ChartLineReflexSign): string =>
      sign === 'positive'
        ? positiveColor
        : sign === 'negative'
          ? negativeColor
          : zeroColor;

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'reflex', label: 'Reflex', color: reflexColor },
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
        data-section="chart-line-reflex"
        data-empty="false"
        data-period={layout.period}
        data-reflex-final={layout.reflexFinal}
        data-positive-count={layout.positiveCount}
        data-negative-count={layout.negativeCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-reflex-aria-desc"
          style={REFLEX_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-reflex-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-reflex-badge"
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
                data-section="chart-line-reflex-badge-icon"
                aria-hidden="true"
                style={{ color: reflexColor }}
              >
                REFLEX
              </span>
              <span data-section="chart-line-reflex-badge-period">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-reflex-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-reflex-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-reflex-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.reflexYTicks.map((t, i) => (
                  <line
                    key={`gr-${i}`}
                    data-section="chart-line-reflex-grid-line"
                    data-panel="reflex"
                    x1={rp.x}
                    x2={rp.x + rp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-reflex-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-reflex-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-reflex-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-reflex-axis"
                  data-panel="reflex"
                  data-axis="y"
                  x1={rp.x}
                  y1={rp.y}
                  x2={rp.x}
                  y2={rp.y + rp.height}
                />
                <line
                  data-section="chart-line-reflex-axis"
                  data-panel="reflex"
                  data-axis="x"
                  x1={rp.x}
                  y1={rp.y + rp.height}
                  x2={rp.x + rp.width}
                  y2={rp.y + rp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-reflex-tick-label"
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
                {layout.reflexYTicks.map((t, i) => (
                  <text
                    key={`ryt-${i}`}
                    data-section="chart-line-reflex-tick-label"
                    data-panel="reflex"
                    data-axis="y"
                    x={rp.x - 6}
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
                    data-section="chart-line-reflex-tick-label"
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
                ))}
              </g>
            ) : null}

            <text
              data-section="chart-line-reflex-panel-label"
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
              data-section="chart-line-reflex-panel-label"
              data-panel="reflex"
              x={rp.x + 2}
              y={rp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Reflex
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-reflex-zero-line"
                x1={rp.x}
                x2={rp.x + rp.width}
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
                data-section="chart-line-reflex-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-reflex-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-reflex-dot"
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

            {reflexVisible && layout.reflexPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Ehlers Reflex line"
                data-section="chart-line-reflex-reflex-line"
                d={layout.reflexPath}
                fill="none"
                stroke={reflexColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {reflexVisible ? (
              <g data-section="chart-line-reflex-markers">
                {layout.reflexMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Reflex at x ${formatX(m.x)}: ${formatValue(m.reflex)}, ${m.sign}`}
                      data-section="chart-line-reflex-marker"
                      data-point-index={m.index}
                      data-reflex={m.reflex}
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
                    data-section="chart-line-reflex-tooltip"
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
                    <div data-section="chart-line-reflex-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-reflex-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-reflex-tooltip-filt">
                      filt: {formatValue(d.filt)}
                    </div>
                    <div data-section="chart-line-reflex-tooltip-sum">
                      sum: {fmtNullable(d.sum)}
                    </div>
                    <div data-section="chart-line-reflex-tooltip-reflex">
                      reflex: {fmtNullable(d.reflex)}
                    </div>
                    <div data-section="chart-line-reflex-tooltip-sign">
                      sign: {d.sign}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-reflex-legend"
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
                  data-section="chart-line-reflex-legend-item"
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
                    data-section="chart-line-reflex-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-reflex-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-reflex-legend-stats"
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

ChartLineReflex.displayName = 'ChartLineReflex';
