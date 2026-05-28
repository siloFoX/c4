import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CHOPPINESS_WIDTH = 560;
export const DEFAULT_CHART_LINE_CHOPPINESS_HEIGHT = 360;
export const DEFAULT_CHART_LINE_CHOPPINESS_PADDING = 40;
export const DEFAULT_CHART_LINE_CHOPPINESS_GAP = 26;
export const DEFAULT_CHART_LINE_CHOPPINESS_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_CHOPPINESS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CHOPPINESS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CHOPPINESS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CHOPPINESS_PERIOD = 14;
export const DEFAULT_CHART_LINE_CHOPPINESS_CHOPPY_THRESHOLD = 61.8;
export const DEFAULT_CHART_LINE_CHOPPINESS_TRENDING_THRESHOLD = 38.2;
export const DEFAULT_CHART_LINE_CHOPPINESS_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_CHOPPINESS_CHOP_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CHOPPINESS_CHOPPY_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CHOPPINESS_TRENDING_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CHOPPINESS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CHOPPINESS_AXIS_COLOR = '#cbd5e1';

export type ChartLineChoppinessState = 'choppy' | 'trending' | 'neutral';

export interface ChartLineChoppinessPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLineChoppinessSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  trueRange: number;
  chop: number | null;
  state: ChartLineChoppinessState;
}

export interface ChartLineChoppinessRun {
  series: ChartLineChoppinessPoint[];
  period: number;
  choppyThreshold: number;
  trendingThreshold: number;
  trueRange: number[];
  chop: (number | null)[];
  samples: ChartLineChoppinessSample[];
  chopFinal: number;
  choppyCount: number;
  trendingCount: number;
  ok: boolean;
}

export interface ChartLineChoppinessPriceDot {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  trueRange: number;
  chop: number | null;
  state: ChartLineChoppinessState;
  px: number;
  py: number;
}

export interface ChartLineChoppinessMarker {
  index: number;
  x: number;
  chop: number;
  state: ChartLineChoppinessState;
  px: number;
  py: number;
}

export interface ChartLineChoppinessPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineChoppinessLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineChoppinessPanel;
  chopPanel: ChartLineChoppinessPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  chopYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineChoppinessPriceDot[];
  chopPath: string;
  markers: ChartLineChoppinessMarker[];
  choppyThreshold: number;
  trendingThreshold: number;
  choppyY: number;
  trendingY: number;
  choppyZone: ChartLineChoppinessPanel;
  trendingZone: ChartLineChoppinessPanel;
  period: number;
  chopFinal: number;
  choppyCount: number;
  trendingCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineChoppinessLayoutOptions {
  data: readonly ChartLineChoppinessPoint[];
  period?: number;
  choppyThreshold?: number;
  trendingThreshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineChoppinessProps {
  data: readonly ChartLineChoppinessPoint[];
  period?: number;
  choppyThreshold?: number;
  trendingThreshold?: number;
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
  chopColor?: string;
  choppyColor?: string;
  trendingColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showChop?: boolean;
  showZones?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineChoppinessPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineChoppinessFinitePoints(
  points: readonly ChartLineChoppinessPoint[] | null | undefined,
): ChartLineChoppinessPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineChoppinessPoint =>
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
export function normalizeLineChoppinessPeriod(
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
export function computeLineChoppinessTrueRange(
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
 * E.W. Dreiss's Choppiness Index. Over a trailing window of `period`
 * bars the summed True Range (the total distance the price travelled
 * bar by bar) is divided by the window's high-low extent (the net
 * ground covered), and the ratio is rescaled by
 * `100 * log10(ratio) / log10(period)` onto a 0 to 100 scale. A
 * strong trend travels little more than its net extent so the index
 * sits near 0; a choppy range retraces constantly so the summed
 * range dwarfs the extent and the index climbs toward 100. The index
 * is defined from index `period - 1` onward; a zero-extent window
 * reads 0, and the result is clamped to 0..100. A period below 2
 * leaves the index undefined.
 */
export function computeLineChoppiness(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
  period: number,
): { trueRange: number[]; chop: (number | null)[] } {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes)
  ) {
    return { trueRange: [], chop: [] };
  }
  const n = Math.min(highs.length, lows.length, closes.length);
  const p = period < 1 ? 1 : Math.floor(period);
  const trueRange = computeLineChoppinessTrueRange(highs, lows, closes);
  const chop: (number | null)[] = new Array(n).fill(null);
  if (p < 2) return { trueRange, chop };
  const logP = Math.log10(p);
  for (let i = p - 1; i < n; i += 1) {
    let sumTr = 0;
    let maxHigh = Number.NEGATIVE_INFINITY;
    let minLow = Number.POSITIVE_INFINITY;
    for (let j = i - p + 1; j <= i; j += 1) {
      sumTr += trueRange[j]!;
      if (highs[j]! > maxHigh) maxHigh = highs[j]!;
      if (lows[j]! < minLow) minLow = lows[j]!;
    }
    const extent = maxHigh - minLow;
    if (extent <= 0) {
      chop[i] = 0;
    } else {
      const raw = (100 * Math.log10(sumTr / extent)) / logP;
      chop[i] = Math.max(0, Math.min(100, raw));
    }
  }
  return { trueRange, chop };
}

function classifyState(
  chop: number | null,
  choppyThreshold: number,
  trendingThreshold: number,
): ChartLineChoppinessState {
  if (chop === null) return 'neutral';
  if (chop > choppyThreshold) return 'choppy';
  if (chop < trendingThreshold) return 'trending';
  return 'neutral';
}

export function runLineChoppiness(
  points: readonly ChartLineChoppinessPoint[] | null | undefined,
  options?: {
    period?: number;
    choppyThreshold?: number;
    trendingThreshold?: number;
  },
): ChartLineChoppinessRun {
  const finite = getLineChoppinessFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineChoppinessPeriod(
    options?.period ?? DEFAULT_CHART_LINE_CHOPPINESS_PERIOD,
    DEFAULT_CHART_LINE_CHOPPINESS_PERIOD,
  );
  const choppyThreshold = isFiniteNumber(options?.choppyThreshold)
    ? options.choppyThreshold
    : DEFAULT_CHART_LINE_CHOPPINESS_CHOPPY_THRESHOLD;
  const trendingThreshold = isFiniteNumber(options?.trendingThreshold)
    ? options.trendingThreshold
    : DEFAULT_CHART_LINE_CHOPPINESS_TRENDING_THRESHOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      choppyThreshold,
      trendingThreshold,
      trueRange: [],
      chop: [],
      samples: [],
      chopFinal: NaN,
      choppyCount: 0,
      trendingCount: 0,
      ok: false,
    };
  }

  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const closes = series.map((p) => p.close);
  const { trueRange, chop } = computeLineChoppiness(
    highs,
    lows,
    closes,
    period,
  );

  const samples: ChartLineChoppinessSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    high: p.high,
    low: p.low,
    close: p.close,
    trueRange: trueRange[i]!,
    chop: chop[i] ?? null,
    state: classifyState(chop[i] ?? null, choppyThreshold, trendingThreshold),
  }));

  let chopFinal = NaN;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (chop[i] !== null && chop[i] !== undefined) {
      chopFinal = chop[i] as number;
      break;
    }
  }
  let choppyCount = 0;
  let trendingCount = 0;
  for (const s of samples) {
    if (s.state === 'choppy') choppyCount += 1;
    if (s.state === 'trending') trendingCount += 1;
  }

  return {
    series = [],
    period,
    choppyThreshold,
    trendingThreshold,
    trueRange,
    chop,
    samples,
    chopFinal,
    choppyCount,
    trendingCount,
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

export function computeLineChoppinessLayout(
  options: ComputeLineChoppinessLayoutOptions,
): ChartLineChoppinessLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_CHOPPINESS_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_CHOPPINESS_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_CHOPPINESS_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineChoppinessPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineChoppiness(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.choppyThreshold)
      ? { choppyThreshold: options.choppyThreshold }
      : {}),
    ...(isFiniteNumber(options.trendingThreshold)
      ? { trendingThreshold: options.trendingThreshold }
      : {}),
  });
  const empty: ChartLineChoppinessLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    chopPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    chopYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    chopPath: '',
    markers: [],
    choppyThreshold: run.choppyThreshold,
    trendingThreshold: run.trendingThreshold,
    choppyY: 0,
    trendingY: 0,
    choppyZone: emptyPanel,
    trendingZone: emptyPanel,
    period: run.period,
    chopFinal: NaN,
    choppyCount: 0,
    trendingCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const chopH = usableHeight - priceH;
  if (priceH <= 0 || chopH <= 0) return empty;

  const pricePanel: ChartLineChoppinessPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const chopPanel: ChartLineChoppinessPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: chopH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.close < pyLo) pyLo = s.close;
    if (s.close > pyHi) pyHi = s.close;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  // The Choppiness Index is bounded to 0..100.
  const projectChopY = (v: number): number =>
    chopPanel.y + chopPanel.height - (v / 100) * chopPanel.height;

  const priceDots: ChartLineChoppinessPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    high: s.high,
    low: s.low,
    close: s.close,
    trueRange: s.trueRange,
    chop: s.chop,
    state: s.state,
    px: projectX(s.x),
    py: projectPriceY(s.close),
  }));

  const markers: ChartLineChoppinessMarker[] = [];
  const chopPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.chop !== null) {
      const px = projectX(s.x);
      const py = projectChopY(s.chop);
      chopPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        chop: s.chop,
        state: s.state,
        px,
        py,
      });
    }
  }

  const choppyY = projectChopY(run.choppyThreshold);
  const trendingY = projectChopY(run.trendingThreshold);

  return {
    ok: true,
    width,
    height,
    pricePanel,
    chopPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    chopYTicks: computeTicks(0, 100, tickCount).map((v) => ({
      value: v,
      py: projectChopY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    chopPath: buildPath(chopPts),
    markers,
    choppyThreshold: run.choppyThreshold,
    trendingThreshold: run.trendingThreshold,
    choppyY,
    trendingY,
    choppyZone: {
      x: chopPanel.x,
      y: chopPanel.y,
      width: chopPanel.width,
      height: Math.max(0, choppyY - chopPanel.y),
    },
    trendingZone: {
      x: chopPanel.x,
      y: trendingY,
      width: chopPanel.width,
      height: Math.max(0, chopPanel.y + chopPanel.height - trendingY),
    },
    period: run.period,
    chopFinal: run.chopFinal,
    choppyCount: run.choppyCount,
    trendingCount: run.trendingCount,
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

export function describeLineChoppinessChart(
  data: readonly ChartLineChoppinessPoint[] | null | undefined,
  options?: {
    period?: number;
    choppyThreshold?: number;
    trendingThreshold?: number;
  },
): string {
  const run = runLineChoppiness(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Choppiness Index panel (period ${run.period}): the Choppiness Index rates whether the market is trending or ranging by comparing the summed true range over the window against the window's high-low extent, on a 0 to 100 scale; readings above ${run.choppyThreshold} mark a choppy ranging market and below ${run.trendingThreshold} a directional trend. ${run.choppyCount} choppy and ${run.trendingCount} trending across ${run.samples.length} periods.`;
}

const CHOPPINESS_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineChoppiness = forwardRef<
  HTMLDivElement,
  ChartLineChoppinessProps
>(function ChartLineChoppiness(
  props: ChartLineChoppinessProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    choppyThreshold,
    trendingThreshold,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_CHOPPINESS_WIDTH,
    height = DEFAULT_CHART_LINE_CHOPPINESS_HEIGHT,
    padding = DEFAULT_CHART_LINE_CHOPPINESS_PADDING,
    gap = DEFAULT_CHART_LINE_CHOPPINESS_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_CHOPPINESS_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_CHOPPINESS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CHOPPINESS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CHOPPINESS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CHOPPINESS_PRICE_COLOR,
    chopColor = DEFAULT_CHART_LINE_CHOPPINESS_CHOP_COLOR,
    choppyColor = DEFAULT_CHART_LINE_CHOPPINESS_CHOPPY_COLOR,
    trendingColor = DEFAULT_CHART_LINE_CHOPPINESS_TRENDING_COLOR,
    gridColor = DEFAULT_CHART_LINE_CHOPPINESS_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CHOPPINESS_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showChop = true,
    showZones = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a Choppiness Index panel',
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
      computeLineChoppinessLayout({
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(choppyThreshold) ? { choppyThreshold } : {}),
        ...(isFiniteNumber(trendingThreshold) ? { trendingThreshold } : {}),
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
      choppyThreshold,
      trendingThreshold,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineChoppinessChart(data, {
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(choppyThreshold) ? { choppyThreshold } : {}),
        ...(isFiniteNumber(trendingThreshold) ? { trendingThreshold } : {}),
      }),
    [ariaDescription, data, period, choppyThreshold, trendingThreshold],
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

  const stateColor = useCallback(
    (s: ChartLineChoppinessState): string =>
      s === 'choppy'
        ? choppyColor
        : s === 'trending'
          ? trendingColor
          : chopColor,
    [choppyColor, trendingColor, chopColor],
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
        data-section="chart-line-choppiness"
        data-empty="true"
        data-period={layout.period}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-choppiness-aria-desc"
          style={CHOPPINESS_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const cp = layout.chopPanel;
  const priceVisible = !hiddenSet.has('price');
  const chopVisible = showChop && !hiddenSet.has('chop');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'chop', label: 'CHOP', color: chopColor },
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
      data-section="chart-line-choppiness"
      data-empty="false"
      data-period={layout.period}
      data-chop-final={layout.chopFinal}
      data-choppy-count={layout.choppyCount}
      data-trending-count={layout.trendingCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-choppiness-aria-desc"
        style={CHOPPINESS_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-choppiness-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-choppiness-badge"
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
              data-section="chart-line-choppiness-badge-icon"
              aria-hidden="true"
              style={{ color: chopColor }}
            >
              CHOP
            </span>
            <span data-section="chart-line-choppiness-badge-period">
              p={layout.period}
            </span>
            <span data-section="chart-line-choppiness-badge-states">
              chop={layout.choppyCount} trend={layout.trendingCount}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-choppiness-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showZones ? (
            <g data-section="chart-line-choppiness-zones">
              <rect
                data-section="chart-line-choppiness-zone"
                data-zone="choppy"
                x={layout.choppyZone.x}
                y={layout.choppyZone.y}
                width={layout.choppyZone.width}
                height={layout.choppyZone.height}
                fill={choppyColor}
                fillOpacity={0.12}
              />
              <rect
                data-section="chart-line-choppiness-zone"
                data-zone="trending"
                x={layout.trendingZone.x}
                y={layout.trendingZone.y}
                width={layout.trendingZone.width}
                height={layout.trendingZone.height}
                fill={trendingColor}
                fillOpacity={0.12}
              />
            </g>
          ) : null}

          {showGrid ? (
            <g
              data-section="chart-line-choppiness-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`pgy-${i}`}
                  data-section="chart-line-choppiness-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.chopYTicks.map((t, i) => (
                <line
                  key={`cgy-${i}`}
                  data-section="chart-line-choppiness-grid-line"
                  data-panel="chop"
                  x1={cp.x}
                  x2={cp.x + cp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showZones ? (
            <g data-section="chart-line-choppiness-levels">
              {[
                {
                  name: 'choppy',
                  y: layout.choppyY,
                  level: layout.choppyThreshold,
                },
                {
                  name: 'trending',
                  y: layout.trendingY,
                  level: layout.trendingThreshold,
                },
              ].map((lv) => (
                <g
                  key={`lv-${lv.name}`}
                  data-section="chart-line-choppiness-level"
                  data-level={lv.name}
                >
                  <line
                    data-section="chart-line-choppiness-level-line"
                    data-level={lv.name}
                    x1={cp.x}
                    x2={cp.x + cp.width}
                    y1={lv.y}
                    y2={lv.y}
                    stroke={
                      lv.name === 'choppy' ? choppyColor : trendingColor
                    }
                    strokeWidth={1}
                    strokeDasharray="4 3"
                  />
                  <text
                    data-section="chart-line-choppiness-level-label"
                    data-level={lv.name}
                    x={cp.x + cp.width - 2}
                    y={lv.y - 3}
                    textAnchor="end"
                    fontSize={9}
                    fill={lv.name === 'choppy' ? choppyColor : trendingColor}
                    stroke="none"
                  >
                    {formatValue(lv.level)}
                  </text>
                </g>
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-choppiness-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              {[
                { panel: pp, name: 'price', yt: layout.priceYTicks },
                { panel: cp, name: 'chop', yt: layout.chopYTicks },
              ].map((cfg) => (
                <g
                  key={`axis-${cfg.name}`}
                  data-section="chart-line-choppiness-axis-group"
                  data-panel={cfg.name}
                >
                  <line
                    data-section="chart-line-choppiness-axis"
                    data-panel={cfg.name}
                    data-axis="x"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y + cfg.panel.height}
                    x2={cfg.panel.x + cfg.panel.width}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  <line
                    data-section="chart-line-choppiness-axis"
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
                      data-section="chart-line-choppiness-tick"
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
                        data-section="chart-line-choppiness-tick-label"
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
              <g data-section="chart-line-choppiness-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`tx-${i}`}
                    data-section="chart-line-choppiness-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-choppiness-tick-label"
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
                  </g>
                ))}
              </g>
            </g>
          ) : null}

          <g data-section="chart-line-choppiness-panel-labels">
            <text
              data-section="chart-line-choppiness-panel-label"
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
              data-section="chart-line-choppiness-panel-label"
              data-panel="chop"
              x={cp.x + cp.width / 2}
              y={cp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Choppiness Index
            </text>
          </g>

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-choppiness-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-choppiness-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                    data-section="chart-line-choppiness-dot"
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

          {chopVisible && layout.chopPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Choppiness Index line"
              data-section="chart-line-choppiness-chop-line"
              d={layout.chopPath}
              fill="none"
              stroke={chopColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {chopVisible ? (
            <g data-section="chart-line-choppiness-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Choppiness Index at x ${formatX(m.x)}: ${formatValue(m.chop)} (${m.state})`}
                    data-section="chart-line-choppiness-marker"
                    data-point-index={m.index}
                    data-chop={m.chop}
                    data-state={m.state}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={stateColor(m.state)}
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
                  data-section="chart-line-choppiness-tooltip"
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
                  <div data-section="chart-line-choppiness-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div data-section="chart-line-choppiness-tooltip-high">
                    high: {formatValue(d.high)}
                  </div>
                  <div data-section="chart-line-choppiness-tooltip-low">
                    low: {formatValue(d.low)}
                  </div>
                  <div data-section="chart-line-choppiness-tooltip-close">
                    close: {formatValue(d.close)}
                  </div>
                  <div data-section="chart-line-choppiness-tooltip-tr">
                    true range: {formatValue(d.trueRange)}
                  </div>
                  <div
                    data-section="chart-line-choppiness-tooltip-chop"
                    style={{ fontWeight: 600 }}
                  >
                    chop: {d.chop === null ? 'n/a' : formatValue(d.chop)}
                  </div>
                  <div data-section="chart-line-choppiness-tooltip-state">
                    state: {d.state}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-choppiness-legend"
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
                data-section="chart-line-choppiness-legend-item"
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
                  data-section="chart-line-choppiness-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-choppiness-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-choppiness-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.choppyCount} choppy, {layout.trendingCount} trending
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineChoppiness.displayName = 'ChartLineChoppiness';
