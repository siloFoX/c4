import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ENTROPY_WIDTH = 560;
export const DEFAULT_CHART_LINE_ENTROPY_HEIGHT = 360;
export const DEFAULT_CHART_LINE_ENTROPY_PADDING = 40;
export const DEFAULT_CHART_LINE_ENTROPY_GAP = 12;
export const DEFAULT_CHART_LINE_ENTROPY_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ENTROPY_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ENTROPY_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ENTROPY_PERIOD = 20;
export const DEFAULT_CHART_LINE_ENTROPY_BINS = 8;
export const DEFAULT_CHART_LINE_ENTROPY_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_ENTROPY_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_ENTROPY_ENTROPY_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_ENTROPY_DISORDERED_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ENTROPY_ORDERED_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ENTROPY_NEUTRAL_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ENTROPY_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ENTROPY_AXIS_COLOR = '#cbd5e1';

export type ChartLineEntropyClass = 'disordered' | 'ordered' | 'neutral';

export interface ChartLineEntropyPoint {
  x: number;
  value: number;
}

export interface ChartLineEntropyHistogram {
  counts: number[];
  probabilities: number[];
}

export interface ChartLineEntropySeries {
  entropy: (number | null)[];
  normalized: (number | null)[];
}

export interface ChartLineEntropySample {
  index: number;
  x: number;
  value: number;
  entropy: number | null;
  normalized: number | null;
  classification: ChartLineEntropyClass;
}

export interface ChartLineEntropyRun {
  series: ChartLineEntropyPoint[];
  period: number;
  bins: number;
  entropy: (number | null)[];
  normalized: (number | null)[];
  samples: ChartLineEntropySample[];
  normalizedFinal: number;
  normalizedMin: number;
  normalizedMax: number;
  disorderedCount: number;
  orderedCount: number;
  ok: boolean;
}

export interface ChartLineEntropyPriceDot {
  index: number;
  x: number;
  value: number;
  entropy: number | null;
  normalized: number | null;
  classification: ChartLineEntropyClass;
  px: number;
  py: number;
}

export interface ChartLineEntropyMarker {
  index: number;
  x: number;
  normalized: number;
  classification: ChartLineEntropyClass;
  px: number;
  py: number;
}

export interface ChartLineEntropyPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineEntropyLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineEntropyPanel;
  entropyPanel: ChartLineEntropyPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  entropyYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  entropyYMin: number;
  entropyYMax: number;
  pricePath: string;
  priceDots: ChartLineEntropyPriceDot[];
  entropyPath: string;
  entropyMarkers: ChartLineEntropyMarker[];
  refY: number;
  period: number;
  bins: number;
  normalizedFinal: number;
  disorderedCount: number;
  orderedCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineEntropyLayoutOptions {
  data: readonly ChartLineEntropyPoint[];
  period?: number;
  bins?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineEntropyProps {
  data: readonly ChartLineEntropyPoint[];
  period?: number;
  bins?: number;
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
  entropyColor?: string;
  disorderedColor?: string;
  orderedColor?: string;
  neutralColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showEntropy?: boolean;
  showRefLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineEntropyPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function getLineEntropyFinitePoints(
  points: readonly ChartLineEntropyPoint[] | null | undefined,
): ChartLineEntropyPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineEntropyPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce the entropy window length to an integer of at least 2. A
 * non-finite or sub-2 value falls back to `fallback`; a fractional
 * value floors.
 */
export function normalizeLineEntropyPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

/**
 * Coerce the histogram bin count to an integer of at least 2. A
 * non-finite or sub-2 value falls back to `fallback`; a fractional
 * value floors. At least 2 bins keeps `log2(bins)` (the entropy
 * normalizer) above zero.
 */
export function normalizeLineEntropyBins(
  bins: number,
  fallback: number,
): number {
  if (!isFiniteNumber(bins)) return fallback;
  const b = Math.floor(bins);
  return b < 2 ? fallback : b;
}

/**
 * Bin a window of values into an equal-width histogram. The window
 * range `[min, max]` is split into `bins` buckets; each value is
 * counted into its bucket (the maximum lands in the last bucket). A
 * flat window collapses into the first bucket. The `probabilities`
 * are the counts divided by the window length.
 */
export function computeLineEntropyHistogram(
  window: readonly number[] | null | undefined,
  bins: number,
): ChartLineEntropyHistogram {
  if (!Array.isArray(window) || window.length === 0) {
    return { counts: [], probabilities: [] };
  }
  const b = normalizeLineEntropyBins(bins, DEFAULT_CHART_LINE_ENTROPY_BINS);
  const n = window.length;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of window) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  const counts: number[] = new Array(b).fill(0);
  for (const v of window) {
    let idx = 0;
    if (range > 0) {
      idx = Math.floor(((v - min) / range) * b);
      if (idx >= b) idx = b - 1;
      if (idx < 0) idx = 0;
    }
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  const probabilities = counts.map((c) => c / n);
  return { counts, probabilities };
}

/**
 * The Shannon entropy of a probability distribution, in bits:
 *
 *   H = - SUM[p > 0] p * log2(p)
 *
 * Zero-probability bins are skipped (the `0 * log(0) = 0`
 * convention). The result is accumulated as a sum of non-negative
 * terms so a certain outcome returns a positive zero.
 */
export function computeLineEntropyValue(
  probabilities: readonly number[] | null | undefined,
): number {
  if (!Array.isArray(probabilities)) return 0;
  let h = 0;
  for (const p of probabilities) {
    if (isFiniteNumber(p) && p > 0) h -= p * Math.log2(p);
  }
  return h;
}

/**
 * The rolling Shannon entropy of the signal. For each bar the
 * trailing window of `period` values is binned into a `bins`-bucket
 * histogram and the Shannon entropy of that distribution is taken.
 * `entropy` is the raw entropy in bits; `normalized` divides it by
 * `log2(bins)` -- the entropy of a uniform distribution -- so it
 * lands in `[0, 1]`. A normalized entropy near 1 marks a disordered
 * (noisy) window, near 0 an ordered (concentrated) window. Bars
 * before the window is full are null.
 */
export function computeLineEntropy(
  values: readonly number[] | null | undefined,
  period: number,
  bins: number,
): ChartLineEntropySeries {
  if (!Array.isArray(values)) return { entropy: [], normalized: [] };
  const p = normalizeLineEntropyPeriod(
    period,
    DEFAULT_CHART_LINE_ENTROPY_PERIOD,
  );
  const b = normalizeLineEntropyBins(bins, DEFAULT_CHART_LINE_ENTROPY_BINS);
  const n = values.length;
  const entropy: (number | null)[] = new Array(n);
  const normalized: (number | null)[] = new Array(n);
  const logB = Math.log2(b);
  for (let i = 0; i < n; i += 1) {
    if (i < p - 1) {
      entropy[i] = null;
      normalized[i] = null;
      continue;
    }
    const window = values.slice(i - p + 1, i + 1);
    const { probabilities } = computeLineEntropyHistogram(window, b);
    const h = computeLineEntropyValue(probabilities);
    entropy[i] = h;
    normalized[i] = logB > 0 ? clamp(h / logB, 0, 1) : 0;
  }
  return { entropy, normalized };
}

function classifyEntropy(v: number | null): ChartLineEntropyClass {
  if (v === null || v === 0.5) return 'neutral';
  return v > 0.5 ? 'disordered' : 'ordered';
}

export function runLineEntropy(
  points: readonly ChartLineEntropyPoint[] | null | undefined,
  options?: { period?: number; bins?: number },
): ChartLineEntropyRun {
  const finite = getLineEntropyFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineEntropyPeriod(
    options?.period ?? DEFAULT_CHART_LINE_ENTROPY_PERIOD,
    DEFAULT_CHART_LINE_ENTROPY_PERIOD,
  );
  const bins = normalizeLineEntropyBins(
    options?.bins ?? DEFAULT_CHART_LINE_ENTROPY_BINS,
    DEFAULT_CHART_LINE_ENTROPY_BINS,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      bins,
      entropy: [],
      normalized: [],
      samples: [],
      normalizedFinal: NaN,
      normalizedMin: NaN,
      normalizedMax: NaN,
      disorderedCount: 0,
      orderedCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { entropy, normalized } = computeLineEntropy(values, period, bins);

  const samples: ChartLineEntropySample[] = series.map((p, i) => {
    const norm = normalized[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      entropy: entropy[i] ?? null,
      normalized: norm,
      classification: classifyEntropy(norm),
    };
  });

  let nMin = Number.POSITIVE_INFINITY;
  let nMax = Number.NEGATIVE_INFINITY;
  let disorderedCount = 0;
  let orderedCount = 0;
  for (const s of samples) {
    if (s.normalized !== null) {
      if (s.normalized < nMin) nMin = s.normalized;
      if (s.normalized > nMax) nMax = s.normalized;
    }
    if (s.classification === 'disordered') disorderedCount += 1;
    else if (s.classification === 'ordered') orderedCount += 1;
  }

  const lastSample = samples[n - 1]!;

  return {
    series,
    period,
    bins,
    entropy,
    normalized,
    samples,
    normalizedFinal: lastSample.normalized ?? NaN,
    normalizedMin: isFiniteNumber(nMin) ? nMin : NaN,
    normalizedMax: isFiniteNumber(nMax) ? nMax : NaN,
    disorderedCount,
    orderedCount,
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

export function computeLineEntropyLayout(
  options: ComputeLineEntropyLayoutOptions,
): ChartLineEntropyLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_ENTROPY_GAP,
    tickCount = DEFAULT_CHART_LINE_ENTROPY_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_ENTROPY_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineEntropy(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.bins) ? { bins: options.bins } : {}),
  });

  const emptyPanel: ChartLineEntropyPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineEntropyLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    entropyPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    entropyYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    entropyYMin: 0,
    entropyYMax: 1,
    pricePath: '',
    priceDots: [],
    entropyPath: '',
    entropyMarkers: [],
    refY: 0,
    period: run.period,
    bins: run.bins,
    normalizedFinal: NaN,
    disorderedCount: 0,
    orderedCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const entropyHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineEntropyPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const entropyPanel: ChartLineEntropyPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: entropyHeight,
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

  // The normalized entropy is bounded to the unit interval, so the
  // bottom panel uses a fixed [0, 1] domain with a 0.5 reference.
  const entropyLo = 0;
  const entropyHi = 1;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const entropyRange = entropyHi - entropyLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectEntropyY = (v: number): number =>
    entropyPanel.y +
    entropyPanel.height -
    ((v - entropyLo) / entropyRange) * entropyPanel.height;

  const priceDots: ChartLineEntropyPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    entropy: s.entropy,
    normalized: s.normalized,
    classification: s.classification,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const entropyMarkers: ChartLineEntropyMarker[] = run.samples
    .filter((s) => s.normalized !== null)
    .map((s) => {
      const norm = s.normalized!;
      return {
        index: s.index,
        x: s.x,
        normalized: norm,
        classification: s.classification,
        px: projectX(s.x),
        py: projectEntropyY(norm),
      };
    });

  return {
    ok: true,
    width,
    height,
    pricePanel,
    entropyPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    entropyYTicks: computeTicks(entropyLo, entropyHi, tickCount).map((v) => ({
      value: v,
      py: projectEntropyY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    entropyYMin: entropyLo,
    entropyYMax: entropyHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    entropyPath: buildPath(
      entropyMarkers.map((m) => ({ px: m.px, py: m.py })),
    ),
    entropyMarkers,
    refY: projectEntropyY(0.5),
    period: run.period,
    bins: run.bins,
    normalizedFinal: run.normalizedFinal,
    disorderedCount: run.disorderedCount,
    orderedCount: run.orderedCount,
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

export function describeLineEntropyChart(
  data: readonly ChartLineEntropyPoint[] | null | undefined,
  options?: { period?: number; bins?: number },
): string {
  const run = runLineEntropy(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a rolling Shannon entropy (period ${run.period}, bins ${run.bins}): the top panel plots the raw price; the bottom panel plots the normalized Shannon entropy of the trailing window. Each window is binned into a histogram and the Shannon entropy of that distribution measures the local disorder of the signal, normalized to the unit interval. A normalized entropy near 1 marks a disordered (noisy) window, near 0 an ordered (concentrated) window. The signal reads disordered on ${run.disorderedCount} bars and ordered on ${run.orderedCount} across ${run.samples.length} bars.`;
}

const ENTROPY_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineEntropy = forwardRef<
  HTMLDivElement,
  ChartLineEntropyProps
>(function ChartLineEntropy(
  props: ChartLineEntropyProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    bins,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_ENTROPY_WIDTH,
    height = DEFAULT_CHART_LINE_ENTROPY_HEIGHT,
    padding = DEFAULT_CHART_LINE_ENTROPY_PADDING,
    gap = DEFAULT_CHART_LINE_ENTROPY_GAP,
    tickCount = DEFAULT_CHART_LINE_ENTROPY_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_ENTROPY_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_ENTROPY_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ENTROPY_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ENTROPY_PRICE_COLOR,
    entropyColor = DEFAULT_CHART_LINE_ENTROPY_ENTROPY_COLOR,
    disorderedColor = DEFAULT_CHART_LINE_ENTROPY_DISORDERED_COLOR,
    orderedColor = DEFAULT_CHART_LINE_ENTROPY_ORDERED_COLOR,
    neutralColor = DEFAULT_CHART_LINE_ENTROPY_NEUTRAL_COLOR,
    gridColor = DEFAULT_CHART_LINE_ENTROPY_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ENTROPY_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showEntropy = true,
    showRefLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Two-panel chart with a rolling Shannon entropy',
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
      computeLineEntropyLayout({
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(bins) ? { bins } : {}),
      }),
    [data, width, height, padding, gap, tickCount, pricePanelRatio, period, bins],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineEntropyChart(data, {
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(bins) ? { bins } : {}),
      }),
    [ariaDescription, data, period, bins],
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
        data-section="chart-line-entropy"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-entropy-aria-desc"
          style={ENTROPY_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const ep = layout.entropyPanel;
  const priceVisible = !hiddenSet.has('price');
  const entropyVisible = showEntropy && !hiddenSet.has('entropy');

  const classColor = (c: ChartLineEntropyClass): string =>
    c === 'disordered'
      ? disorderedColor
      : c === 'ordered'
        ? orderedColor
        : neutralColor;

  const fmtNullable = (v: number | null): string =>
    v === null ? 'n/a' : formatValue(v);

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'entropy', label: 'Entropy', color: entropyColor },
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
      data-section="chart-line-entropy"
      data-empty="false"
      data-period={layout.period}
      data-bins={layout.bins}
      data-normalized-final={layout.normalizedFinal}
      data-disordered-count={layout.disorderedCount}
      data-ordered-count={layout.orderedCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-entropy-aria-desc"
        style={ENTROPY_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-entropy-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-entropy-badge"
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
              data-section="chart-line-entropy-badge-icon"
              aria-hidden="true"
              style={{ color: entropyColor }}
            >
              ENTROPY
            </span>
            <span data-section="chart-line-entropy-badge-config">
              {layout.period}/{layout.bins}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-entropy-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-entropy-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`gp-${i}`}
                  data-section="chart-line-entropy-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.entropyYTicks.map((t, i) => (
                <line
                  key={`ge-${i}`}
                  data-section="chart-line-entropy-grid-line"
                  data-panel="entropy"
                  x1={ep.x}
                  x2={ep.x + ep.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-entropy-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-entropy-axis"
                data-panel="price"
                data-axis="y"
                x1={pp.x}
                y1={pp.y}
                x2={pp.x}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-entropy-axis"
                data-panel="price"
                data-axis="x"
                x1={pp.x}
                y1={pp.y + pp.height}
                x2={pp.x + pp.width}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-entropy-axis"
                data-panel="entropy"
                data-axis="y"
                x1={ep.x}
                y1={ep.y}
                x2={ep.x}
                y2={ep.y + ep.height}
              />
              <line
                data-section="chart-line-entropy-axis"
                data-panel="entropy"
                data-axis="x"
                x1={ep.x}
                y1={ep.y + ep.height}
                x2={ep.x + ep.width}
                y2={ep.y + ep.height}
              />
              {layout.priceYTicks.map((t, i) => (
                <text
                  key={`pyt-${i}`}
                  data-section="chart-line-entropy-tick-label"
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
              {layout.entropyYTicks.map((t, i) => (
                <text
                  key={`eyt-${i}`}
                  data-section="chart-line-entropy-tick-label"
                  data-panel="entropy"
                  data-axis="y"
                  x={ep.x - 6}
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
                  data-section="chart-line-entropy-tick-label"
                  data-axis="x"
                  x={t.px}
                  y={ep.y + ep.height + 14}
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
            data-section="chart-line-entropy-panel-label"
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
            data-section="chart-line-entropy-panel-label"
            data-panel="entropy"
            x={ep.x + 2}
            y={ep.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            Entropy
          </text>

          {showRefLine ? (
            <line
              data-section="chart-line-entropy-ref-line"
              x1={ep.x}
              x2={ep.x + ep.width}
              y1={layout.refY}
              y2={layout.refY}
              stroke={neutralColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-entropy-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-entropy-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-entropy-dot"
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

          {entropyVisible && layout.entropyPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Rolling Shannon entropy line"
              data-section="chart-line-entropy-entropy-line"
              d={layout.entropyPath}
              fill="none"
              stroke={entropyColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {entropyVisible ? (
            <g data-section="chart-line-entropy-markers">
              {layout.entropyMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Entropy at x ${formatX(m.x)}: ${formatValue(m.normalized)}, ${m.classification}`}
                    data-section="chart-line-entropy-marker"
                    data-point-index={m.index}
                    data-normalized={m.normalized}
                    data-class={m.classification}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={classColor(m.classification)}
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
                  data-section="chart-line-entropy-tooltip"
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
                  <div data-section="chart-line-entropy-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-entropy-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-entropy-tooltip-entropy">
                    entropy: {fmtNullable(d.entropy)}
                  </div>
                  <div data-section="chart-line-entropy-tooltip-normalized">
                    normalized: {fmtNullable(d.normalized)}
                  </div>
                  <div data-section="chart-line-entropy-tooltip-class">
                    class: {d.classification}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-entropy-legend"
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
                data-section="chart-line-entropy-legend-item"
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
                  data-section="chart-line-entropy-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-entropy-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-entropy-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.disorderedCount} disordered, {layout.orderedCount} ordered
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineEntropy.displayName = 'ChartLineEntropy';
