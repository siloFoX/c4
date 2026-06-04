import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_RWI_WIDTH = 560;
export const DEFAULT_CHART_LINE_RWI_HEIGHT = 360;
export const DEFAULT_CHART_LINE_RWI_PADDING = 40;
export const DEFAULT_CHART_LINE_RWI_GAP = 26;
export const DEFAULT_CHART_LINE_RWI_PRICE_PANEL_RATIO = 0.54;
export const DEFAULT_CHART_LINE_RWI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RWI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RWI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RWI_PERIOD = 8;
export const DEFAULT_CHART_LINE_RWI_TREND_THRESHOLD = 1;
export const DEFAULT_CHART_LINE_RWI_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_RWI_HIGH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RWI_LOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RWI_THRESHOLD_COLOR = '#475569';
export const DEFAULT_CHART_LINE_RWI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RWI_AXIS_COLOR = '#cbd5e1';

export type ChartLineRwiState = 'uptrend' | 'downtrend' | 'ranging';

export interface ChartLineRwiPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLineRwiSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  trueRange: number;
  rwiHigh: number | null;
  rwiLow: number | null;
  state: ChartLineRwiState;
}

export interface ChartLineRwiRun {
  series: ChartLineRwiPoint[];
  period: number;
  trendThreshold: number;
  trueRange: number[];
  rwiHigh: (number | null)[];
  rwiLow: (number | null)[];
  samples: ChartLineRwiSample[];
  rwiHighFinal: number;
  rwiLowFinal: number;
  uptrendCount: number;
  downtrendCount: number;
  ok: boolean;
}

export interface ChartLineRwiPriceDot {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  trueRange: number;
  rwiHigh: number | null;
  rwiLow: number | null;
  state: ChartLineRwiState;
  px: number;
  py: number;
}

export interface ChartLineRwiMarker {
  index: number;
  x: number;
  value: number;
  px: number;
  py: number;
}

export interface ChartLineRwiPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineRwiLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineRwiPanel;
  rwiPanel: ChartLineRwiPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  rwiYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  rwiYMin: number;
  rwiYMax: number;
  pricePath: string;
  priceDots: ChartLineRwiPriceDot[];
  rwiHighPath: string;
  rwiLowPath: string;
  rwiHighMarkers: ChartLineRwiMarker[];
  rwiLowMarkers: ChartLineRwiMarker[];
  thresholdValue: number;
  thresholdY: number;
  period: number;
  rwiHighFinal: number;
  rwiLowFinal: number;
  uptrendCount: number;
  downtrendCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineRwiLayoutOptions {
  data: readonly ChartLineRwiPoint[];
  period?: number;
  trendThreshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineRwiProps {
  data: readonly ChartLineRwiPoint[];
  period?: number;
  trendThreshold?: number;
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
  rwiHighColor?: string;
  rwiLowColor?: string;
  thresholdColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRwiHigh?: boolean;
  showRwiLow?: boolean;
  showThreshold?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineRwiPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineRwiFinitePoints(
  points: readonly ChartLineRwiPoint[] | null | undefined,
): ChartLineRwiPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineRwiPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineRwiPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Welles Wilder's True Range. For each bar the True Range is the
 * greatest of the bar's own high-low span, the gap from the prior
 * close up to this high, and the gap from the prior close down to
 * this low. The first bar has no prior close so its True Range is
 * simply the high-low span.
 */
export function computeLineRwiTrueRange(
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
    if (i === 0) {
      out[i] = range;
    } else {
      const prevClose = closes[i - 1]!;
      const hc = Math.abs(highs[i]! - prevClose);
      const lc = Math.abs(lows[i]! - prevClose);
      out[i] = Math.max(range, hc, lc);
    }
  }
  return out;
}

/**
 * E. Michael Poulos's Random Walk Index. For each bar and each
 * lookback `k` from 2 to `period` the index compares the high-low
 * displacement over the lookback against what a random walk of the
 * same volatility would be expected to cover -- the average True
 * Range across the `k` bars scaled by `sqrt(k)` (a random walk's
 * expected travel grows as the square root of time). The RWI-high
 * line is the largest `(high[i] - low[i-k]) / (atr(k) * sqrt(k))`
 * across all `k`; the RWI-low line is the largest
 * `(high[i-k] - low[i]) / (atr(k) * sqrt(k))`. A reading above 1
 * means the price has travelled further than random noise would
 * explain -- a real trend. Both lines are clamped to be
 * non-negative and are defined from index `period` onward; a period
 * below 2 leaves the index undefined.
 */
export function computeLineRwi(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
  period: number,
): {
  trueRange: number[];
  rwiHigh: (number | null)[];
  rwiLow: (number | null)[];
} {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes)
  ) {
    return { trueRange: [], rwiHigh: [], rwiLow: [] };
  }
  const n = Math.min(highs.length, lows.length, closes.length);
  const p = period < 1 ? 1 : Math.floor(period);
  const trueRange = computeLineRwiTrueRange(highs, lows, closes);
  const rwiHigh: (number | null)[] = new Array(n).fill(null);
  const rwiLow: (number | null)[] = new Array(n).fill(null);
  if (p < 2) return { trueRange, rwiHigh, rwiLow };
  for (let i = p; i < n; i += 1) {
    let bestHigh = 0;
    let bestLow = 0;
    for (let k = 2; k <= p; k += 1) {
      let sumTr = 0;
      for (let j = i - k + 1; j <= i; j += 1) sumTr += trueRange[j]!;
      const atrK = sumTr / k;
      const denom = atrK * Math.sqrt(k);
      if (denom > 0) {
        const hi = (highs[i]! - lows[i - k]!) / denom;
        const lo = (highs[i - k]! - lows[i]!) / denom;
        if (hi > bestHigh) bestHigh = hi;
        if (lo > bestLow) bestLow = lo;
      }
    }
    rwiHigh[i] = bestHigh;
    rwiLow[i] = bestLow;
  }
  return { trueRange, rwiHigh, rwiLow };
}

function classifyState(
  rwiHigh: number | null,
  rwiLow: number | null,
  threshold: number,
): ChartLineRwiState {
  if (rwiHigh === null || rwiLow === null) return 'ranging';
  if (rwiHigh > threshold && rwiHigh >= rwiLow) return 'uptrend';
  if (rwiLow > threshold && rwiLow > rwiHigh) return 'downtrend';
  return 'ranging';
}

export function runLineRwi(
  points: readonly ChartLineRwiPoint[] | null | undefined,
  options?: { period?: number; trendThreshold?: number },
): ChartLineRwiRun {
  const finite = getLineRwiFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineRwiPeriod(
    options?.period ?? DEFAULT_CHART_LINE_RWI_PERIOD,
    DEFAULT_CHART_LINE_RWI_PERIOD,
  );
  const trendThreshold = isFiniteNumber(options?.trendThreshold)
    ? options.trendThreshold
    : DEFAULT_CHART_LINE_RWI_TREND_THRESHOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      trendThreshold,
      trueRange: [],
      rwiHigh: [],
      rwiLow: [],
      samples: [],
      rwiHighFinal: NaN,
      rwiLowFinal: NaN,
      uptrendCount: 0,
      downtrendCount: 0,
      ok: false,
    };
  }

  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const closes = series.map((p) => p.close);
  const { trueRange, rwiHigh, rwiLow } = computeLineRwi(
    highs,
    lows,
    closes,
    period,
  );

  const samples: ChartLineRwiSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    high: p.high,
    low: p.low,
    close: p.close,
    trueRange: trueRange[i]!,
    rwiHigh: rwiHigh[i] ?? null,
    rwiLow: rwiLow[i] ?? null,
    state: classifyState(
      rwiHigh[i] ?? null,
      rwiLow[i] ?? null,
      trendThreshold,
    ),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (arr[i] !== null && arr[i] !== undefined) return arr[i] as number;
    }
    return NaN;
  };

  let uptrendCount = 0;
  let downtrendCount = 0;
  for (const s of samples) {
    if (s.state === 'uptrend') uptrendCount += 1;
    if (s.state === 'downtrend') downtrendCount += 1;
  }

  return {
    series,
    period,
    trendThreshold,
    trueRange,
    rwiHigh,
    rwiLow,
    samples,
    rwiHighFinal: lastDefined(rwiHigh),
    rwiLowFinal: lastDefined(rwiLow),
    uptrendCount,
    downtrendCount,
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

export function computeLineRwiLayout(
  options: ComputeLineRwiLayoutOptions,
): ChartLineRwiLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_RWI_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_RWI_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_RWI_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineRwiPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineRwi(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.trendThreshold)
      ? { trendThreshold: options.trendThreshold }
      : {}),
  });
  const empty: ChartLineRwiLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    rwiPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    rwiYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    rwiYMin: 0,
    rwiYMax: 0,
    pricePath: '',
    priceDots: [],
    rwiHighPath: '',
    rwiLowPath: '',
    rwiHighMarkers: [],
    rwiLowMarkers: [],
    thresholdValue: run.trendThreshold,
    thresholdY: 0,
    period: run.period,
    rwiHighFinal: NaN,
    rwiLowFinal: NaN,
    uptrendCount: 0,
    downtrendCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const rwiH = usableHeight - priceH;
  if (priceH <= 0 || rwiH <= 0) return empty;

  const pricePanel: ChartLineRwiPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const rwiPanel: ChartLineRwiPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: rwiH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let rwiMax = run.trendThreshold;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.close < pyLo) pyLo = s.close;
    if (s.close > pyHi) pyHi = s.close;
    if (s.rwiHigh !== null && s.rwiHigh > rwiMax) rwiMax = s.rwiHigh;
    if (s.rwiLow !== null && s.rwiLow > rwiMax) rwiMax = s.rwiLow;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }
  const rwiYMin = 0;
  const rwiYMax = rwiMax > 0 ? rwiMax : 1;

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectRwiY = (v: number): number =>
    rwiPanel.y +
    rwiPanel.height -
    ((v - rwiYMin) / (rwiYMax - rwiYMin)) * rwiPanel.height;

  const priceDots: ChartLineRwiPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    high: s.high,
    low: s.low,
    close: s.close,
    trueRange: s.trueRange,
    rwiHigh: s.rwiHigh,
    rwiLow: s.rwiLow,
    state: s.state,
    px: projectX(s.x),
    py: projectPriceY(s.close),
  }));

  const rwiHighPts: { px: number; py: number }[] = [];
  const rwiLowPts: { px: number; py: number }[] = [];
  const rwiHighMarkers: ChartLineRwiMarker[] = [];
  const rwiLowMarkers: ChartLineRwiMarker[] = [];
  for (const s of run.samples) {
    if (s.rwiHigh !== null) {
      const px = projectX(s.x);
      const py = projectRwiY(s.rwiHigh);
      rwiHighPts.push({ px, py });
      rwiHighMarkers.push({
        index: s.index,
        x: s.x,
        value: s.rwiHigh,
        px,
        py,
      });
    }
    if (s.rwiLow !== null) {
      const px = projectX(s.x);
      const py = projectRwiY(s.rwiLow);
      rwiLowPts.push({ px, py });
      rwiLowMarkers.push({ index: s.index, x: s.x, value: s.rwiLow, px, py });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    rwiPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    rwiYTicks: computeTicks(rwiYMin, rwiYMax, tickCount).map((v) => ({
      value: v,
      py: projectRwiY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    rwiYMin,
    rwiYMax,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    rwiHighPath: buildPath(rwiHighPts),
    rwiLowPath: buildPath(rwiLowPts),
    rwiHighMarkers,
    rwiLowMarkers,
    thresholdValue: run.trendThreshold,
    thresholdY: projectRwiY(run.trendThreshold),
    period: run.period,
    rwiHighFinal: run.rwiHighFinal,
    rwiLowFinal: run.rwiLowFinal,
    uptrendCount: run.uptrendCount,
    downtrendCount: run.downtrendCount,
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

export function describeLineRwiChart(
  data: readonly ChartLineRwiPoint[] | null | undefined,
  options?: { period?: number; trendThreshold?: number },
): string {
  const run = runLineRwi(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Random Walk Index panel (period ${run.period}): the Random Walk Index measures how far the price has travelled relative to what a random walk of the same volatility would cover, comparing the high-low displacement over each lookback against the average true range scaled by the square root of the lookback. A reading above ${run.trendThreshold} marks a real trend; the RWI-high line leads in an uptrend and the RWI-low line in a downtrend. ${run.uptrendCount} uptrend and ${run.downtrendCount} downtrend across ${run.samples.length} periods.`;
}

const RWI_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineRwi = forwardRef<HTMLDivElement, ChartLineRwiProps>(
  function ChartLineRwi(
    props: ChartLineRwiProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      trendThreshold,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_RWI_WIDTH,
      height = DEFAULT_CHART_LINE_RWI_HEIGHT,
      padding = DEFAULT_CHART_LINE_RWI_PADDING,
      gap = DEFAULT_CHART_LINE_RWI_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_RWI_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_RWI_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_RWI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_RWI_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_RWI_PRICE_COLOR,
      rwiHighColor = DEFAULT_CHART_LINE_RWI_HIGH_COLOR,
      rwiLowColor = DEFAULT_CHART_LINE_RWI_LOW_COLOR,
      thresholdColor = DEFAULT_CHART_LINE_RWI_THRESHOLD_COLOR,
      gridColor = DEFAULT_CHART_LINE_RWI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_RWI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showRwiHigh = true,
      showRwiLow = true,
      showThreshold = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Random Walk Index panel',
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
        computeLineRwiLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(trendThreshold) ? { trendThreshold } : {}),
        }),
      [
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        period,
        trendThreshold,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineRwiChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(trendThreshold) ? { trendThreshold } : {}),
        }),
      [ariaDescription, data, period, trendThreshold],
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
          data-section="chart-line-rwi"
          data-empty="true"
          data-period={layout.period}
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-rwi-aria-desc"
            style={RWI_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const rp = layout.rwiPanel;
    const priceVisible = !hiddenSet.has('price');
    const rwiHighVisible = showRwiHigh && !hiddenSet.has('rwiHigh');
    const rwiLowVisible = showRwiLow && !hiddenSet.has('rwiLow');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'rwiHigh', label: 'RWI-H', color: rwiHighColor },
      { id: 'rwiLow', label: 'RWI-L', color: rwiLowColor },
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
        data-section="chart-line-rwi"
        data-empty="false"
        data-period={layout.period}
        data-rwi-high-final={layout.rwiHighFinal}
        data-rwi-low-final={layout.rwiLowFinal}
        data-uptrend-count={layout.uptrendCount}
        data-downtrend-count={layout.downtrendCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-rwi-aria-desc"
          style={RWI_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-rwi-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-rwi-badge"
              data-period={layout.period}
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
                data-section="chart-line-rwi-badge-icon"
                aria-hidden="true"
                style={{ color: rwiHighColor }}
              >
                RWI
              </span>
              <span data-section="chart-line-rwi-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-rwi-badge-states">
                up={layout.uptrendCount} down={layout.downtrendCount}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-rwi-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-rwi-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-rwi-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.rwiYTicks.map((t, i) => (
                  <line
                    key={`rgy-${i}`}
                    data-section="chart-line-rwi-grid-line"
                    data-panel="rwi"
                    x1={rp.x}
                    x2={rp.x + rp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showThreshold ? (
              <g data-section="chart-line-rwi-threshold">
                <line
                  data-section="chart-line-rwi-threshold-line"
                  x1={rp.x}
                  x2={rp.x + rp.width}
                  y1={layout.thresholdY}
                  y2={layout.thresholdY}
                  stroke={thresholdColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <text
                  data-section="chart-line-rwi-threshold-label"
                  x={rp.x + rp.width - 2}
                  y={layout.thresholdY - 3}
                  textAnchor="end"
                  fontSize={9}
                  fill={thresholdColor}
                  stroke="none"
                >
                  {formatValue(layout.thresholdValue)}
                </text>
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-rwi-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: rp, name: 'rwi', yt: layout.rwiYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-rwi-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-rwi-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-rwi-axis"
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
                        data-section="chart-line-rwi-tick"
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
                          data-section="chart-line-rwi-tick-label"
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
                <g data-section="chart-line-rwi-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-rwi-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={rp.y + rp.height}
                        y2={rp.y + rp.height + 4}
                      />
                      <text
                        data-section="chart-line-rwi-tick-label"
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

            <g data-section="chart-line-rwi-panel-labels">
              <text
                data-section="chart-line-rwi-panel-label"
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
                data-section="chart-line-rwi-panel-label"
                data-panel="rwi"
                x={rp.x + rp.width / 2}
                y={rp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Random Walk Index
              </text>
            </g>

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-rwi-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-rwi-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                      data-section="chart-line-rwi-dot"
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

            {rwiLowVisible && layout.rwiLowPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="RWI-low line"
                data-section="chart-line-rwi-low-line"
                d={layout.rwiLowPath}
                fill="none"
                stroke={rwiLowColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {rwiHighVisible && layout.rwiHighPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="RWI-high line"
                data-section="chart-line-rwi-high-line"
                d={layout.rwiHighPath}
                fill="none"
                stroke={rwiHighColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {rwiLowVisible ? (
              <g data-section="chart-line-rwi-low-markers">
                {layout.rwiLowMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`ml-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`RWI-low at x ${formatX(m.x)}: ${formatValue(m.value)}`}
                      data-section="chart-line-rwi-marker"
                      data-line="low"
                      data-point-index={m.index}
                      data-value={m.value}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={rwiLowColor}
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

            {rwiHighVisible ? (
              <g data-section="chart-line-rwi-high-markers">
                {layout.rwiHighMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`mh-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`RWI-high at x ${formatX(m.x)}: ${formatValue(m.value)}`}
                      data-section="chart-line-rwi-marker"
                      data-line="high"
                      data-point-index={m.index}
                      data-value={m.value}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={rwiHighColor}
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
                    data-section="chart-line-rwi-tooltip"
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
                    <div data-section="chart-line-rwi-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div data-section="chart-line-rwi-tooltip-close">
                      close: {formatValue(d.close)}
                    </div>
                    <div data-section="chart-line-rwi-tooltip-high">
                      rwi-high:{' '}
                      {d.rwiHigh === null ? 'n/a' : formatValue(d.rwiHigh)}
                    </div>
                    <div data-section="chart-line-rwi-tooltip-low">
                      rwi-low:{' '}
                      {d.rwiLow === null ? 'n/a' : formatValue(d.rwiLow)}
                    </div>
                    <div
                      data-section="chart-line-rwi-tooltip-state"
                      style={{ fontWeight: 600 }}
                    >
                      state: {d.state}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-rwi-legend"
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
                  data-section="chart-line-rwi-legend-item"
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
                    data-section="chart-line-rwi-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-rwi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-rwi-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.uptrendCount} uptrend, {layout.downtrendCount} downtrend
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineRwi.displayName = 'ChartLineRwi';
