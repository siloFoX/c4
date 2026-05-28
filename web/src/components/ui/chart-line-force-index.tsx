import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_FORCE_INDEX_WIDTH = 560;
export const DEFAULT_CHART_LINE_FORCE_INDEX_HEIGHT = 360;
export const DEFAULT_CHART_LINE_FORCE_INDEX_PADDING = 40;
export const DEFAULT_CHART_LINE_FORCE_INDEX_GAP = 26;
export const DEFAULT_CHART_LINE_FORCE_INDEX_PRICE_PANEL_RATIO = 0.54;
export const DEFAULT_CHART_LINE_FORCE_INDEX_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FORCE_INDEX_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_FORCE_INDEX_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FORCE_INDEX_EMA_PERIOD = 13;
export const DEFAULT_CHART_LINE_FORCE_INDEX_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_FORCE_INDEX_FORCE_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_FORCE_INDEX_RAW_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_FORCE_INDEX_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_FORCE_INDEX_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_FORCE_INDEX_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_FORCE_INDEX_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_FORCE_INDEX_AXIS_COLOR = '#cbd5e1';

export type ChartLineForceIndexSign = 'positive' | 'negative' | 'zero';

export interface ChartLineForceIndexPoint {
  x: number;
  price: number;
  volume: number;
}

export interface ChartLineForceIndexSample {
  index: number;
  x: number;
  price: number;
  volume: number;
  rawForce: number | null;
  forceIndex: number | null;
  sign: ChartLineForceIndexSign;
}

export interface ChartLineForceIndexRun {
  series: ChartLineForceIndexPoint[];
  emaPeriod: number;
  rawForce: (number | null)[];
  forceIndex: (number | null)[];
  samples: ChartLineForceIndexSample[];
  forceFinal: number;
  rawFinal: number;
  forceMin: number;
  forceMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineForceIndexPriceDot {
  index: number;
  x: number;
  price: number;
  volume: number;
  rawForce: number | null;
  forceIndex: number | null;
  sign: ChartLineForceIndexSign;
  px: number;
  py: number;
}

export interface ChartLineForceIndexMarker {
  index: number;
  x: number;
  forceIndex: number;
  sign: ChartLineForceIndexSign;
  px: number;
  py: number;
}

export interface ChartLineForceIndexPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineForceIndexLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineForceIndexPanel;
  forcePanel: ChartLineForceIndexPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  forceYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  forceYBound: number;
  pricePath: string;
  priceDots: ChartLineForceIndexPriceDot[];
  rawPath: string;
  forcePath: string;
  markers: ChartLineForceIndexMarker[];
  zeroY: number;
  emaPeriod: number;
  forceFinal: number;
  rawFinal: number;
  forceMin: number;
  forceMax: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineForceIndexLayoutOptions {
  data: readonly ChartLineForceIndexPoint[];
  emaPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineForceIndexProps {
  data: readonly ChartLineForceIndexPoint[];
  emaPeriod?: number;
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
  forceColor?: string;
  rawColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showForce?: boolean;
  showRaw?: boolean;
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
  onPointClick?: (payload: { point: ChartLineForceIndexPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineForceIndexFinitePoints(
  points: readonly ChartLineForceIndexPoint[] | null | undefined,
): ChartLineForceIndexPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineForceIndexPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.price) &&
      isFiniteNumber(p.volume),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineForceIndexPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * An exponential moving average over `period` values, tolerating the
 * leading `null` of the raw Force Index series. The seed is the
 * simple mean of the first `period` defined values placed at that
 * value's index; each later defined value folds in at weight
 * `2 / (period + 1)`. Indices before the seed read null.
 */
export function computeLineForceIndexEma(
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
 * The raw Force Index: each bar's price change multiplied by its
 * volume, `(price[i] - price[i-1]) * volume[i]`. Index 0 has no
 * prior price so it reads null.
 */
export function computeLineForceIndexRaw(
  prices: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(prices) || !Array.isArray(volumes)) return [];
  const n = Math.min(prices.length, volumes.length);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const raw = (prices[i]! - prices[i - 1]!) * volumes[i]!;
    out[i] = raw === 0 ? 0 : raw;
  }
  return out;
}

/**
 * Alexander Elder's Force Index. The raw Force Index combines the
 * direction and extent of each price change with its volume; the
 * smoothed Force Index is an exponential moving average of the raw
 * series, measuring the power behind a move.
 */
export function computeLineForceIndex(
  prices: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
  emaPeriod: number,
): { rawForce: (number | null)[]; forceIndex: (number | null)[] } {
  const rawForce = computeLineForceIndexRaw(prices, volumes);
  const forceIndex = computeLineForceIndexEma(rawForce, emaPeriod);
  return { rawForce, forceIndex };
}

function classifySign(v: number | null): ChartLineForceIndexSign {
  if (v === null) return 'zero';
  if (v > 0) return 'positive';
  if (v < 0) return 'negative';
  return 'zero';
}

export function runLineForceIndex(
  points: readonly ChartLineForceIndexPoint[] | null | undefined,
  options?: { emaPeriod?: number },
): ChartLineForceIndexRun {
  const finite = getLineForceIndexFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const emaPeriod = normalizeLineForceIndexPeriod(
    options?.emaPeriod ?? DEFAULT_CHART_LINE_FORCE_INDEX_EMA_PERIOD,
    DEFAULT_CHART_LINE_FORCE_INDEX_EMA_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      emaPeriod,
      rawForce: [],
      forceIndex: [],
      samples: [],
      forceFinal: NaN,
      rawFinal: NaN,
      forceMin: NaN,
      forceMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const prices = series.map((p) => p.price);
  const volumes = series.map((p) => p.volume);
  const { rawForce, forceIndex } = computeLineForceIndex(
    prices,
    volumes,
    emaPeriod,
  );

  const samples: ChartLineForceIndexSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    price: p.price,
    volume: p.volume,
    rawForce: rawForce[i] ?? null,
    forceIndex: forceIndex[i] ?? null,
    sign: classifySign(forceIndex[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (arr[i] !== null && arr[i] !== undefined) return arr[i] as number;
    }
    return NaN;
  };

  let forceMin = NaN;
  let forceMax = NaN;
  let positiveCount = 0;
  let negativeCount = 0;
  for (const s of samples) {
    if (s.forceIndex !== null) {
      if (Number.isNaN(forceMin) || s.forceIndex < forceMin) {
        forceMin = s.forceIndex;
      }
      if (Number.isNaN(forceMax) || s.forceIndex > forceMax) {
        forceMax = s.forceIndex;
      }
    }
    if (s.sign === 'positive') positiveCount += 1;
    if (s.sign === 'negative') negativeCount += 1;
  }

  return {
    series = [],
    emaPeriod,
    rawForce,
    forceIndex,
    samples,
    forceFinal: lastDefined(forceIndex),
    rawFinal: lastDefined(rawForce),
    forceMin,
    forceMax,
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

export function computeLineForceIndexLayout(
  options: ComputeLineForceIndexLayoutOptions,
): ChartLineForceIndexLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_FORCE_INDEX_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_FORCE_INDEX_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_FORCE_INDEX_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineForceIndexPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineForceIndex(data, {
    ...(isFiniteNumber(options.emaPeriod)
      ? { emaPeriod: options.emaPeriod }
      : {}),
  });
  const empty: ChartLineForceIndexLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    forcePanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    forceYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    forceYBound: 0,
    pricePath: '',
    priceDots: [],
    rawPath: '',
    forcePath: '',
    markers: [],
    zeroY: 0,
    emaPeriod: run.emaPeriod,
    forceFinal: NaN,
    rawFinal: NaN,
    forceMin: NaN,
    forceMax: NaN,
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
  const forceH = usableHeight - priceH;
  if (priceH <= 0 || forceH <= 0) return empty;

  const pricePanel: ChartLineForceIndexPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const forcePanel: ChartLineForceIndexPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: forceH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let bound = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.price < pyLo) pyLo = s.price;
    if (s.price > pyHi) pyHi = s.price;
    if (s.rawForce !== null && Math.abs(s.rawForce) > bound) {
      bound = Math.abs(s.rawForce);
    }
    if (s.forceIndex !== null && Math.abs(s.forceIndex) > bound) {
      bound = Math.abs(s.forceIndex);
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
  const projectForceY = (v: number): number =>
    forcePanel.y +
    forcePanel.height -
    ((v + bound) / (2 * bound)) * forcePanel.height;

  const priceDots: ChartLineForceIndexPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    price: s.price,
    volume: s.volume,
    rawForce: s.rawForce,
    forceIndex: s.forceIndex,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.price),
  }));

  const rawPts: { px: number; py: number }[] = [];
  const forcePts: { px: number; py: number }[] = [];
  const markers: ChartLineForceIndexMarker[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    if (s.rawForce !== null) {
      rawPts.push({ px, py: projectForceY(s.rawForce) });
    }
    if (s.forceIndex !== null) {
      const py = projectForceY(s.forceIndex);
      forcePts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        forceIndex: s.forceIndex,
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
    forcePanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    forceYTicks: computeTicks(-bound, bound, tickCount).map((v) => ({
      value: v,
      py: projectForceY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    forceYBound: bound,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    rawPath: buildPath(rawPts),
    forcePath: buildPath(forcePts),
    markers,
    zeroY: projectForceY(0),
    emaPeriod: run.emaPeriod,
    forceFinal: run.forceFinal,
    rawFinal: run.rawFinal,
    forceMin: run.forceMin,
    forceMax: run.forceMax,
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

export function describeLineForceIndexChart(
  data: readonly ChartLineForceIndexPoint[] | null | undefined,
  options?: { emaPeriod?: number },
): string {
  const run = runLineForceIndex(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with an Elder Force Index panel (EMA ${run.emaPeriod}): the Force Index multiplies each bar's price change by its volume and smooths the result with an exponential moving average, measuring the power behind a move; it swings around zero, positive when buyers dominate and negative when sellers do. ${run.positiveCount} readings above and ${run.negativeCount} below the zero line across ${run.samples.length} periods.`;
}

const FORCE_INDEX_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineForceIndex = forwardRef<
  HTMLDivElement,
  ChartLineForceIndexProps
>(function ChartLineForceIndex(
  props: ChartLineForceIndexProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    emaPeriod,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_FORCE_INDEX_WIDTH,
    height = DEFAULT_CHART_LINE_FORCE_INDEX_HEIGHT,
    padding = DEFAULT_CHART_LINE_FORCE_INDEX_PADDING,
    gap = DEFAULT_CHART_LINE_FORCE_INDEX_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_FORCE_INDEX_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_FORCE_INDEX_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_FORCE_INDEX_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_FORCE_INDEX_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_FORCE_INDEX_PRICE_COLOR,
    forceColor = DEFAULT_CHART_LINE_FORCE_INDEX_FORCE_COLOR,
    rawColor = DEFAULT_CHART_LINE_FORCE_INDEX_RAW_COLOR,
    positiveColor = DEFAULT_CHART_LINE_FORCE_INDEX_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_FORCE_INDEX_NEGATIVE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_FORCE_INDEX_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_FORCE_INDEX_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_FORCE_INDEX_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showForce = true,
    showRaw = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with an Elder Force Index panel',
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
      computeLineForceIndexLayout({
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        ...(isFiniteNumber(emaPeriod) ? { emaPeriod } : {}),
      }),
    [data, width, height, padding, gap, pricePanelRatio, tickCount, emaPeriod],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineForceIndexChart(data, {
        ...(isFiniteNumber(emaPeriod) ? { emaPeriod } : {}),
      }),
    [ariaDescription, data, emaPeriod],
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
    (s: ChartLineForceIndexSign): string =>
      s === 'positive'
        ? positiveColor
        : s === 'negative'
          ? negativeColor
          : forceColor,
    [positiveColor, negativeColor, forceColor],
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
        data-section="chart-line-force-index"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-force-index-aria-desc"
          style={FORCE_INDEX_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const fp = layout.forcePanel;
  const priceVisible = !hiddenSet.has('price');
  const forceVisible = showForce && !hiddenSet.has('force');
  const rawVisible = showRaw && !hiddenSet.has('raw');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'force', label: 'Force Index', color: forceColor },
    { id: 'raw', label: 'Raw Force', color: rawColor },
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
      data-section="chart-line-force-index"
      data-empty="false"
      data-ema-period={layout.emaPeriod}
      data-force-final={layout.forceFinal}
      data-raw-final={layout.rawFinal}
      data-positive-count={layout.positiveCount}
      data-negative-count={layout.negativeCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-force-index-aria-desc"
        style={FORCE_INDEX_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-force-index-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-force-index-badge"
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
              data-section="chart-line-force-index-badge-icon"
              aria-hidden="true"
              style={{ color: forceColor }}
            >
              FORCE
            </span>
            <span data-section="chart-line-force-index-badge-ema">
              ema={layout.emaPeriod}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-force-index-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-force-index-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`pgy-${i}`}
                  data-section="chart-line-force-index-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.forceYTicks.map((t, i) => (
                <line
                  key={`fgy-${i}`}
                  data-section="chart-line-force-index-grid-line"
                  data-panel="force"
                  x1={fp.x}
                  x2={fp.x + fp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-force-index-zero-line"
              x1={fp.x}
              x2={fp.x + fp.width}
              y1={layout.zeroY}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-force-index-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              {[
                { panel: pp, name: 'price', yt: layout.priceYTicks },
                { panel: fp, name: 'force', yt: layout.forceYTicks },
              ].map((cfg) => (
                <g
                  key={`axis-${cfg.name}`}
                  data-section="chart-line-force-index-axis-group"
                  data-panel={cfg.name}
                >
                  <line
                    data-section="chart-line-force-index-axis"
                    data-panel={cfg.name}
                    data-axis="x"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y + cfg.panel.height}
                    x2={cfg.panel.x + cfg.panel.width}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  <line
                    data-section="chart-line-force-index-axis"
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
                      data-section="chart-line-force-index-tick"
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
                        data-section="chart-line-force-index-tick-label"
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
              <g data-section="chart-line-force-index-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`tx-${i}`}
                    data-section="chart-line-force-index-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={fp.y + fp.height}
                      y2={fp.y + fp.height + 4}
                    />
                    <text
                      data-section="chart-line-force-index-tick-label"
                      data-axis="x"
                      x={t.px}
                      y={fp.y + fp.height + 14}
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

          <g data-section="chart-line-force-index-panel-labels">
            <text
              data-section="chart-line-force-index-panel-label"
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
              data-section="chart-line-force-index-panel-label"
              data-panel="force"
              x={fp.x + fp.width / 2}
              y={fp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Force Index
            </text>
          </g>

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-force-index-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-force-index-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, price ${formatValue(d.price)}`}
                    data-section="chart-line-force-index-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-value={d.price}
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

          {rawVisible && layout.rawPath ? (
            <path
              data-section="chart-line-force-index-raw-line"
              d={layout.rawPath}
              fill="none"
              stroke={rawColor}
              strokeWidth={1.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {forceVisible && layout.forcePath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Force Index line"
              data-section="chart-line-force-index-force-line"
              d={layout.forcePath}
              fill="none"
              stroke={forceColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {forceVisible ? (
            <g data-section="chart-line-force-index-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Force Index at x ${formatX(m.x)}: ${formatValue(m.forceIndex)} (${m.sign})`}
                    data-section="chart-line-force-index-marker"
                    data-point-index={m.index}
                    data-force={m.forceIndex}
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
                  data-section="chart-line-force-index-tooltip"
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
                  <div data-section="chart-line-force-index-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-force-index-tooltip-price"
                    style={{ fontWeight: 600 }}
                  >
                    price: {formatValue(d.price)}
                  </div>
                  <div data-section="chart-line-force-index-tooltip-volume">
                    volume: {formatValue(d.volume)}
                  </div>
                  <div data-section="chart-line-force-index-tooltip-raw">
                    raw:{' '}
                    {d.rawForce === null ? 'n/a' : formatValue(d.rawForce)}
                  </div>
                  <div data-section="chart-line-force-index-tooltip-force">
                    force:{' '}
                    {d.forceIndex === null
                      ? 'n/a'
                      : formatValue(d.forceIndex)}
                  </div>
                  <div data-section="chart-line-force-index-tooltip-sign">
                    sign: {d.sign}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-force-index-legend"
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
                data-section="chart-line-force-index-legend-item"
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
                  data-section="chart-line-force-index-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-force-index-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-force-index-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.positiveCount} above, {layout.negativeCount} below
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineForceIndex.displayName = 'ChartLineForceIndex';
