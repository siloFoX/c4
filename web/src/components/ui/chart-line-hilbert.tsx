import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_HILBERT_WIDTH = 560;
export const DEFAULT_CHART_LINE_HILBERT_HEIGHT = 360;
export const DEFAULT_CHART_LINE_HILBERT_PADDING = 40;
export const DEFAULT_CHART_LINE_HILBERT_GAP = 12;
export const DEFAULT_CHART_LINE_HILBERT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HILBERT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HILBERT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HILBERT_MIN_PERIOD = 6;
export const DEFAULT_CHART_LINE_HILBERT_MAX_PERIOD = 50;
export const DEFAULT_CHART_LINE_HILBERT_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_HILBERT_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_HILBERT_FAST_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HILBERT_SLOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HILBERT_MID_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_HILBERT_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_HILBERT_AXIS_COLOR = '#cbd5e1';

const HILBERT_TWO_PI = 2 * Math.PI;
const HILBERT_PERIOD_ALPHA = 0.2;

export type ChartLineHilbertCycleClass = 'fast' | 'slow' | 'mid';

export interface ChartLineHilbertPoint {
  x: number;
  value: number;
}

export interface ChartLineHilbertSample {
  index: number;
  x: number;
  value: number;
  smooth: number;
  period: number;
  cycleClass: ChartLineHilbertCycleClass;
}

export interface ChartLineHilbertRun {
  series: ChartLineHilbertPoint[];
  minPeriod: number;
  maxPeriod: number;
  smooth: number[];
  period: number[];
  samples: ChartLineHilbertSample[];
  periodFinal: number;
  periodMin: number;
  periodMax: number;
  fastCount: number;
  slowCount: number;
  ok: boolean;
}

export interface ChartLineHilbertPriceDot {
  index: number;
  x: number;
  value: number;
  smooth: number;
  period: number;
  cycleClass: ChartLineHilbertCycleClass;
  px: number;
  py: number;
}

export interface ChartLineHilbertMarker {
  index: number;
  x: number;
  period: number;
  cycleClass: ChartLineHilbertCycleClass;
  px: number;
  py: number;
}

export interface ChartLineHilbertPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineHilbertLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineHilbertPanel;
  cyclePanel: ChartLineHilbertPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  cycleYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  cycleYMin: number;
  cycleYMax: number;
  pricePath: string;
  priceDots: ChartLineHilbertPriceDot[];
  cyclePath: string;
  cycleMarkers: ChartLineHilbertMarker[];
  midY: number;
  midInRange: boolean;
  minPeriod: number;
  maxPeriod: number;
  periodFinal: number;
  fastCount: number;
  slowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineHilbertLayoutOptions {
  data: readonly ChartLineHilbertPoint[];
  minPeriod?: number;
  maxPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineHilbertProps {
  data: readonly ChartLineHilbertPoint[];
  minPeriod?: number;
  maxPeriod?: number;
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
  cycleColor?: string;
  fastColor?: string;
  slowColor?: string;
  midColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCycle?: boolean;
  showMidline?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineHilbertPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineHilbertFinitePoints(
  points: readonly ChartLineHilbertPoint[] | null | undefined,
): ChartLineHilbertPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineHilbertPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a cycle-period bound to a positive integer. A non-finite
 * or sub-1 value falls back to `fallback`; a fractional value is
 * floored.
 */
export function normalizeLineHilbertPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Ehlers' 4-3-2-1 weighted pre-smoother:
 * `(4*p[i] + 3*p[i-1] + 2*p[i-2] + p[i-3]) / 10`. The first three
 * bars pass the raw price through.
 */
export function computeLineHilbertSmooth(
  values: readonly number[] | null | undefined,
): number[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    if (i < 3) {
      out[i] = values[i]!;
    } else {
      out[i] =
        (4 * values[i]! +
          3 * values[i - 1]! +
          2 * values[i - 2]! +
          values[i - 3]!) /
        10;
    }
  }
  return out;
}

/**
 * Ehlers' Hilbert transform filter, a 7-tap quadrature FIR:
 * `0.0962*(v[i] - v[i-6]) + 0.5769*(v[i-2] - v[i-4])`. It shifts
 * the signal 90 degrees and has no DC response, so it both
 * detrends and produces the quadrature component. The first six
 * bars are zero; a constant series transforms to zero exactly.
 */
export function computeLineHilbertTransform(
  values: readonly number[] | null | undefined,
): number[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    if (i < 6) {
      out[i] = 0;
    } else {
      out[i] =
        0.0962 * (values[i]! - values[i - 6]!) +
        0.5769 * (values[i - 2]! - values[i - 4]!);
    }
  }
  return out;
}

/**
 * The Hilbert Transform dominant cycle. The price is pre-smoothed
 * and detrended through the Hilbert transform; a second Hilbert
 * transform gives the quadrature component. The instantaneous
 * phase `atan2(quadrature, in-phase)` rotates once per cycle, so
 * the per-bar rate of phase change yields the dominant cycle
 * period `2*PI / deltaPhase`. The period is clamped to the
 * `[minPeriod, maxPeriod]` band and exponentially smoothed, so
 * every value stays inside that band. A flat series reports the
 * maximum period.
 */
export function computeLineHilbertCycle(
  values: readonly number[] | null | undefined,
  minPeriod: number,
  maxPeriod: number,
): number[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  if (n === 0) return [];
  const lo = normalizeLineHilbertPeriod(
    minPeriod,
    DEFAULT_CHART_LINE_HILBERT_MIN_PERIOD,
  );
  let hi = normalizeLineHilbertPeriod(
    maxPeriod,
    DEFAULT_CHART_LINE_HILBERT_MAX_PERIOD,
  );
  if (hi <= lo) hi = lo + 1;

  const smooth = computeLineHilbertSmooth(values);
  const detrender = computeLineHilbertTransform(smooth);
  const quadrature = computeLineHilbertTransform(detrender);

  const out: number[] = new Array(n);
  let prevPhase = 0;
  let dom = hi;
  for (let i = 0; i < n; i += 1) {
    const inPhase = i >= 3 ? detrender[i - 3]! : 0;
    const quad = quadrature[i]!;
    const phase = Math.atan2(quad, inPhase);
    let delta = prevPhase - phase;
    while (delta < 0) delta += HILBERT_TWO_PI;
    while (delta >= HILBERT_TWO_PI) delta -= HILBERT_TWO_PI;
    let p = delta > 1e-10 ? HILBERT_TWO_PI / delta : hi;
    if (p < lo) p = lo;
    if (p > hi) p = hi;
    dom =
      i === 0 ? p : HILBERT_PERIOD_ALPHA * p + (1 - HILBERT_PERIOD_ALPHA) * dom;
    out[i] = dom;
    prevPhase = phase;
  }
  return out;
}

function classifyCycle(
  period: number,
  mid: number,
): ChartLineHilbertCycleClass {
  if (period < mid) return 'fast';
  if (period > mid) return 'slow';
  return 'mid';
}

export function runLineHilbert(
  points: readonly ChartLineHilbertPoint[] | null | undefined,
  options?: { minPeriod?: number; maxPeriod?: number },
): ChartLineHilbertRun {
  const finite = getLineHilbertFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const minPeriod = normalizeLineHilbertPeriod(
    options?.minPeriod ?? DEFAULT_CHART_LINE_HILBERT_MIN_PERIOD,
    DEFAULT_CHART_LINE_HILBERT_MIN_PERIOD,
  );
  let maxPeriod = normalizeLineHilbertPeriod(
    options?.maxPeriod ?? DEFAULT_CHART_LINE_HILBERT_MAX_PERIOD,
    DEFAULT_CHART_LINE_HILBERT_MAX_PERIOD,
  );
  if (maxPeriod <= minPeriod) maxPeriod = minPeriod + 1;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      minPeriod,
      maxPeriod,
      smooth: [],
      period: [],
      samples: [],
      periodFinal: NaN,
      periodMin: NaN,
      periodMax: NaN,
      fastCount: 0,
      slowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const smooth = computeLineHilbertSmooth(values);
  const period = computeLineHilbertCycle(values, minPeriod, maxPeriod);
  const mid = (minPeriod + maxPeriod) / 2;

  const samples: ChartLineHilbertSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    smooth: smooth[i]!,
    period: period[i]!,
    cycleClass: classifyCycle(period[i]!, mid),
  }));

  let periodMin = Number.POSITIVE_INFINITY;
  let periodMax = Number.NEGATIVE_INFINITY;
  let fastCount = 0;
  let slowCount = 0;
  for (const s of samples) {
    if (s.period < periodMin) periodMin = s.period;
    if (s.period > periodMax) periodMax = s.period;
    if (s.cycleClass === 'fast') fastCount += 1;
    if (s.cycleClass === 'slow') slowCount += 1;
  }

  return {
    series = [],
    minPeriod,
    maxPeriod,
    smooth,
    period,
    samples,
    periodFinal: period[period.length - 1]!,
    periodMin,
    periodMax,
    fastCount,
    slowCount,
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

export function computeLineHilbertLayout(
  options: ComputeLineHilbertLayoutOptions,
): ChartLineHilbertLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_HILBERT_GAP,
    tickCount = DEFAULT_CHART_LINE_HILBERT_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_HILBERT_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineHilbert(data, {
    ...(isFiniteNumber(options.minPeriod)
      ? { minPeriod: options.minPeriod }
      : {}),
    ...(isFiniteNumber(options.maxPeriod)
      ? { maxPeriod: options.maxPeriod }
      : {}),
  });

  const emptyPanel: ChartLineHilbertPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineHilbertLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    cyclePanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    cycleYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    cycleYMin: 0,
    cycleYMax: 0,
    pricePath: '',
    priceDots: [],
    cyclePath: '',
    cycleMarkers: [],
    midY: 0,
    midInRange: false,
    minPeriod: run.minPeriod,
    maxPeriod: run.maxPeriod,
    periodFinal: NaN,
    fastCount: 0,
    slowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const cycleHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineHilbertPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const cyclePanel: ChartLineHilbertPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: cycleHeight,
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
  // The cycle panel uses the fixed [minPeriod, maxPeriod] band, so
  // the fast/slow midline always sits at the panel centre.
  const cycleLo = run.minPeriod;
  const cycleHi = run.maxPeriod;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const cycleRange = cycleHi - cycleLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectCycleY = (v: number): number =>
    cyclePanel.y +
    cyclePanel.height -
    ((v - cycleLo) / cycleRange) * cyclePanel.height;

  const priceDots: ChartLineHilbertPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    smooth: s.smooth,
    period: s.period,
    cycleClass: s.cycleClass,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const cycleMarkers: ChartLineHilbertMarker[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    period: s.period,
    cycleClass: s.cycleClass,
    px: projectX(s.x),
    py: projectCycleY(s.period),
  }));

  const mid = (run.minPeriod + run.maxPeriod) / 2;
  const midInRange = mid >= cycleLo && mid <= cycleHi;

  return {
    ok: true,
    width,
    height,
    pricePanel,
    cyclePanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    cycleYTicks: computeTicks(cycleLo, cycleHi, tickCount).map((v) => ({
      value: v,
      py: projectCycleY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    cycleYMin: cycleLo,
    cycleYMax: cycleHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    cyclePath: buildPath(cycleMarkers.map((m) => ({ px: m.px, py: m.py }))),
    cycleMarkers,
    midY: projectCycleY(mid),
    midInRange,
    minPeriod: run.minPeriod,
    maxPeriod: run.maxPeriod,
    periodFinal: run.periodFinal,
    fastCount: run.fastCount,
    slowCount: run.slowCount,
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

export function describeLineHilbertChart(
  data: readonly ChartLineHilbertPoint[] | null | undefined,
  options?: { minPeriod?: number; maxPeriod?: number },
): string {
  const run = runLineHilbert(data, options);
  if (!run.ok) return 'No data';
  const mid = (run.minPeriod + run.maxPeriod) / 2;
  return `Two-panel chart with a Hilbert Transform dominant-cycle measurement (period bounds ${run.minPeriod} to ${run.maxPeriod}): the top panel plots the raw price; the bottom panel plots the dominant cycle period in bars. The price is pre-smoothed, detrended through the Ehlers Hilbert transform filter, and its quadrature component is taken with a second Hilbert transform. The instantaneous phase atan2(quadrature, in-phase) rotates once per cycle, so the rate of phase change gives the dominant cycle period, clamped to the band. The cycle reads fast (below the ${defaultFormatValue(mid)}-bar midpoint) on ${run.fastCount} bars and slow on ${run.slowCount} across ${run.samples.length} bars.`;
}

const HILBERT_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineHilbert = forwardRef<
  HTMLDivElement,
  ChartLineHilbertProps
>(function ChartLineHilbert(
  props: ChartLineHilbertProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    minPeriod,
    maxPeriod,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_HILBERT_WIDTH,
    height = DEFAULT_CHART_LINE_HILBERT_HEIGHT,
    padding = DEFAULT_CHART_LINE_HILBERT_PADDING,
    gap = DEFAULT_CHART_LINE_HILBERT_GAP,
    tickCount = DEFAULT_CHART_LINE_HILBERT_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_HILBERT_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_HILBERT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_HILBERT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_HILBERT_PRICE_COLOR,
    cycleColor = DEFAULT_CHART_LINE_HILBERT_CYCLE_COLOR,
    fastColor = DEFAULT_CHART_LINE_HILBERT_FAST_COLOR,
    slowColor = DEFAULT_CHART_LINE_HILBERT_SLOW_COLOR,
    midColor = DEFAULT_CHART_LINE_HILBERT_MID_COLOR,
    gridColor = DEFAULT_CHART_LINE_HILBERT_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_HILBERT_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCycle = true,
    showMidline = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Two-panel chart with a Hilbert Transform dominant-cycle measurement',
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
      computeLineHilbertLayout({
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        ...(isFiniteNumber(minPeriod) ? { minPeriod } : {}),
        ...(isFiniteNumber(maxPeriod) ? { maxPeriod } : {}),
      }),
    [data, width, height, padding, gap, tickCount, pricePanelRatio, minPeriod, maxPeriod],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineHilbertChart(data, {
        ...(isFiniteNumber(minPeriod) ? { minPeriod } : {}),
        ...(isFiniteNumber(maxPeriod) ? { maxPeriod } : {}),
      }),
    [ariaDescription, data, minPeriod, maxPeriod],
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
        data-section="chart-line-hilbert"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-hilbert-aria-desc"
          style={HILBERT_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const cp = layout.cyclePanel;
  const priceVisible = !hiddenSet.has('price');
  const cycleVisible = showCycle && !hiddenSet.has('cycle');

  const classColor = (c: ChartLineHilbertCycleClass): string =>
    c === 'fast' ? fastColor : c === 'slow' ? slowColor : midColor;

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'cycle', label: 'Cycle period', color: cycleColor },
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
      data-section="chart-line-hilbert"
      data-empty="false"
      data-min-period={layout.minPeriod}
      data-max-period={layout.maxPeriod}
      data-period-final={layout.periodFinal}
      data-fast-count={layout.fastCount}
      data-slow-count={layout.slowCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-hilbert-aria-desc"
        style={HILBERT_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-hilbert-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-hilbert-badge"
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
              data-section="chart-line-hilbert-badge-icon"
              aria-hidden="true"
              style={{ color: cycleColor }}
            >
              HILBERT
            </span>
            <span data-section="chart-line-hilbert-badge-range">
              {layout.minPeriod}-{layout.maxPeriod}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-hilbert-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-hilbert-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`gp-${i}`}
                  data-section="chart-line-hilbert-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.cycleYTicks.map((t, i) => (
                <line
                  key={`gc-${i}`}
                  data-section="chart-line-hilbert-grid-line"
                  data-panel="cycle"
                  x1={cp.x}
                  x2={cp.x + cp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-hilbert-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-hilbert-axis"
                data-panel="price"
                data-axis="y"
                x1={pp.x}
                y1={pp.y}
                x2={pp.x}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-hilbert-axis"
                data-panel="price"
                data-axis="x"
                x1={pp.x}
                y1={pp.y + pp.height}
                x2={pp.x + pp.width}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-hilbert-axis"
                data-panel="cycle"
                data-axis="y"
                x1={cp.x}
                y1={cp.y}
                x2={cp.x}
                y2={cp.y + cp.height}
              />
              <line
                data-section="chart-line-hilbert-axis"
                data-panel="cycle"
                data-axis="x"
                x1={cp.x}
                y1={cp.y + cp.height}
                x2={cp.x + cp.width}
                y2={cp.y + cp.height}
              />
              {layout.priceYTicks.map((t, i) => (
                <text
                  key={`pyt-${i}`}
                  data-section="chart-line-hilbert-tick-label"
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
              {layout.cycleYTicks.map((t, i) => (
                <text
                  key={`cyt-${i}`}
                  data-section="chart-line-hilbert-tick-label"
                  data-panel="cycle"
                  data-axis="y"
                  x={cp.x - 6}
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
                  data-section="chart-line-hilbert-tick-label"
                  data-axis="x"
                  x={t.px}
                  y={cp.y + cp.height + 14}
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
            data-section="chart-line-hilbert-panel-label"
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
            data-section="chart-line-hilbert-panel-label"
            data-panel="cycle"
            x={cp.x + 2}
            y={cp.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            Cycle period
          </text>

          {showMidline && layout.midInRange ? (
            <line
              data-section="chart-line-hilbert-midline"
              x1={cp.x}
              x2={cp.x + cp.width}
              y1={layout.midY}
              y2={layout.midY}
              stroke={midColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-hilbert-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-hilbert-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-hilbert-dot"
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

          {cycleVisible && layout.cyclePath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Dominant cycle period line"
              data-section="chart-line-hilbert-cycle-line"
              d={layout.cyclePath}
              fill="none"
              stroke={cycleColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {cycleVisible ? (
            <g data-section="chart-line-hilbert-markers">
              {layout.cycleMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Dominant cycle at x ${formatX(m.x)}: ${formatValue(m.period)} bars, ${m.cycleClass}`}
                    data-section="chart-line-hilbert-marker"
                    data-point-index={m.index}
                    data-period={m.period}
                    data-cycle-class={m.cycleClass}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={classColor(m.cycleClass)}
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
                  data-section="chart-line-hilbert-tooltip"
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
                  <div data-section="chart-line-hilbert-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-hilbert-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-hilbert-tooltip-smooth">
                    smooth: {formatValue(d.smooth)}
                  </div>
                  <div data-section="chart-line-hilbert-tooltip-period">
                    period: {formatValue(d.period)}
                  </div>
                  <div data-section="chart-line-hilbert-tooltip-class">
                    cycle: {d.cycleClass}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-hilbert-legend"
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
                data-section="chart-line-hilbert-legend-item"
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
                  data-section="chart-line-hilbert-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-hilbert-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-hilbert-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.fastCount} fast, {layout.slowCount} slow
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineHilbert.displayName = 'ChartLineHilbert';
