import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CHANDELIER_WIDTH = 560;
export const DEFAULT_CHART_LINE_CHANDELIER_HEIGHT = 360;
export const DEFAULT_CHART_LINE_CHANDELIER_PADDING = 40;
export const DEFAULT_CHART_LINE_CHANDELIER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CHANDELIER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CHANDELIER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CHANDELIER_PERIOD = 22;
export const DEFAULT_CHART_LINE_CHANDELIER_MULTIPLIER = 3;
export const DEFAULT_CHART_LINE_CHANDELIER_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_CHANDELIER_LONG_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CHANDELIER_SHORT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CHANDELIER_INSIDE_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_CHANDELIER_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CHANDELIER_AXIS_COLOR = '#cbd5e1';

export type ChartLineChandelierZone = 'above' | 'below' | 'inside' | 'none';

export interface ChartLineChandelierPoint {
  x: number;
  value: number;
}

export interface ChartLineChandelierSample {
  index: number;
  x: number;
  value: number;
  atr: number | null;
  longExit: number | null;
  shortExit: number | null;
  zone: ChartLineChandelierZone;
}

export interface ChartLineChandelierRun {
  series: ChartLineChandelierPoint[];
  period: number;
  multiplier: number;
  trueRange: (number | null)[];
  atr: (number | null)[];
  highestClose: (number | null)[];
  lowestClose: (number | null)[];
  longExit: (number | null)[];
  shortExit: (number | null)[];
  samples: ChartLineChandelierSample[];
  longExitFinal: number;
  shortExitFinal: number;
  aboveCount: number;
  belowCount: number;
  insideCount: number;
  ok: boolean;
}

export interface ChartLineChandelierDot {
  index: number;
  x: number;
  value: number;
  longExit: number | null;
  shortExit: number | null;
  zone: ChartLineChandelierZone;
  px: number;
  py: number;
}

export interface ChartLineChandelierMarker {
  index: number;
  x: number;
  value: number;
  zone: ChartLineChandelierZone;
  px: number;
  py: number;
}

export interface ChartLineChandelierPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineChandelierLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineChandelierPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  priceDots: ChartLineChandelierDot[];
  longExitPath: string;
  shortExitPath: string;
  markers: ChartLineChandelierMarker[];
  period: number;
  multiplier: number;
  longExitFinal: number;
  shortExitFinal: number;
  aboveCount: number;
  belowCount: number;
  insideCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineChandelierLayoutOptions {
  data: readonly ChartLineChandelierPoint[];
  period?: number;
  multiplier?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineChandelierProps {
  data: readonly ChartLineChandelierPoint[];
  period?: number;
  multiplier?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  longColor?: string;
  shortColor?: string;
  insideColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLongExit?: boolean;
  showShortExit?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineChandelierDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineChandelierFinitePoints(
  points: readonly ChartLineChandelierPoint[] | null | undefined,
): ChartLineChandelierPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineChandelierPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a Chandelier Exit lookback to an integer of at least 2.
 * A non-finite or sub-2 value falls back to `fallback`; a
 * fractional value floors.
 */
export function normalizeLineChandelierPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

/**
 * Coerce an ATR multiplier to a positive finite number. A
 * non-finite or non-positive value falls back to `fallback`.
 */
export function normalizeLineChandelierMultiplier(
  multiplier: number,
  fallback: number,
): number {
  if (!isFiniteNumber(multiplier) || multiplier <= 0) return fallback;
  return multiplier;
}

/**
 * The bar-to-bar true range of a close-only series -- the
 * absolute period-over-period change `|close[i] - close[i-1]|`.
 * Index 0 has no prior close and is null.
 */
export function computeLineChandelierTrueRanges(
  closes: readonly number[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i += 1) {
    const cur = closes[i];
    const prev = closes[i - 1];
    if (isFiniteNumber(cur) && isFiniteNumber(prev)) {
      out[i] = Math.abs(cur - prev);
    }
  }
  return out;
}

/**
 * Welles Wilder's Average True Range over the close-to-close true
 * range. The first ATR (at index `period`) is the simple mean of
 * the first `period` true ranges; subsequent values use Wilder
 * smoothing `(prev * (period - 1) + tr) / period`. Bars before
 * the window is full are null.
 */
export function computeLineChandelierAtr(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLineChandelierPeriod(
    period,
    DEFAULT_CHART_LINE_CHANDELIER_PERIOD,
  );
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p + 1) return out;
  let sum = 0;
  for (let i = 1; i <= p; i += 1) {
    const cur = closes[i];
    const prev = closes[i - 1];
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) return out;
    sum += Math.abs(cur - prev);
  }
  let atr = sum / p;
  out[p] = atr;
  for (let i = p + 1; i < n; i += 1) {
    const cur = closes[i];
    const prev = closes[i - 1];
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) return out;
    atr = (atr * (p - 1) + Math.abs(cur - prev)) / p;
    out[i] = atr;
  }
  return out;
}

/**
 * The rolling highest close over the trailing `period` bars
 * (inclusive). Bars before the window is full are null.
 */
export function computeLineChandelierRollingMax(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLineChandelierPeriod(
    period,
    DEFAULT_CHART_LINE_CHANDELIER_PERIOD,
  );
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let mx = Number.NEGATIVE_INFINITY;
    let valid = true;
    for (let k = i - p + 1; k <= i; k += 1) {
      const c = closes[k];
      if (!isFiniteNumber(c)) {
        valid = false;
        break;
      }
      if (c > mx) mx = c;
    }
    if (valid) out[i] = mx;
  }
  return out;
}

/**
 * The rolling lowest close over the trailing `period` bars
 * (inclusive). Bars before the window is full are null.
 */
export function computeLineChandelierRollingMin(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLineChandelierPeriod(
    period,
    DEFAULT_CHART_LINE_CHANDELIER_PERIOD,
  );
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let mn = Number.POSITIVE_INFINITY;
    let valid = true;
    for (let k = i - p + 1; k <= i; k += 1) {
      const c = closes[k];
      if (!isFiniteNumber(c)) {
        valid = false;
        break;
      }
      if (c < mn) mn = c;
    }
    if (valid) out[i] = mn;
  }
  return out;
}

/**
 * The Chandelier Exit pair. The long exit hangs a trailing stop
 * `multiplier` average true ranges below the highest close of the
 * lookback; the short exit places the mirror stop the same
 * multiple of the ATR above the lowest close. Both are null until
 * the ATR window is full.
 */
export function computeLineChandelierExit(
  closes: readonly number[] | null | undefined,
  period: number,
  multiplier: number,
): { long: (number | null)[]; short: (number | null)[] } {
  if (!Array.isArray(closes)) return { long: [], short: [] };
  const p = normalizeLineChandelierPeriod(
    period,
    DEFAULT_CHART_LINE_CHANDELIER_PERIOD,
  );
  const m = normalizeLineChandelierMultiplier(
    multiplier,
    DEFAULT_CHART_LINE_CHANDELIER_MULTIPLIER,
  );
  const atr = computeLineChandelierAtr(closes, p);
  const hi = computeLineChandelierRollingMax(closes, p);
  const lo = computeLineChandelierRollingMin(closes, p);
  const n = closes.length;
  const long: (number | null)[] = new Array(n).fill(null);
  const short: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const a = atr[i];
    const h = hi[i];
    const l = lo[i];
    if (a === null || a === undefined) continue;
    if (h === null || h === undefined) continue;
    if (l === null || l === undefined) continue;
    long[i] = h - a * m;
    short[i] = l + a * m;
  }
  return { long, short };
}

function classifyZone(
  close: number,
  longExit: number | null,
  shortExit: number | null,
): ChartLineChandelierZone {
  if (longExit === null || shortExit === null) return 'none';
  if (close < longExit) return 'below';
  if (close > shortExit) return 'above';
  return 'inside';
}

export function runLineChandelier(
  points: readonly ChartLineChandelierPoint[] | null | undefined,
  options?: { period?: number; multiplier?: number },
): ChartLineChandelierRun {
  const finite = getLineChandelierFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineChandelierPeriod(
    options?.period ?? DEFAULT_CHART_LINE_CHANDELIER_PERIOD,
    DEFAULT_CHART_LINE_CHANDELIER_PERIOD,
  );
  const multiplier = normalizeLineChandelierMultiplier(
    options?.multiplier ?? DEFAULT_CHART_LINE_CHANDELIER_MULTIPLIER,
    DEFAULT_CHART_LINE_CHANDELIER_MULTIPLIER,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      multiplier,
      trueRange: [],
      atr: [],
      highestClose: [],
      lowestClose: [],
      longExit: [],
      shortExit: [],
      samples: [],
      longExitFinal: NaN,
      shortExitFinal: NaN,
      aboveCount: 0,
      belowCount: 0,
      insideCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const trueRange = computeLineChandelierTrueRanges(closes);
  const atr = computeLineChandelierAtr(closes, period);
  const highestClose = computeLineChandelierRollingMax(closes, period);
  const lowestClose = computeLineChandelierRollingMin(closes, period);
  const { long: longExit, short: shortExit } = computeLineChandelierExit(
    closes,
    period,
    multiplier,
  );

  const samples: ChartLineChandelierSample[] = series.map((p, i) => {
    const le = longExit[i] ?? null;
    const se = shortExit[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      atr: atr[i] ?? null,
      longExit: le,
      shortExit: se,
      zone: classifyZone(p.value, le, se),
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let insideCount = 0;
  let longExitFinal = NaN;
  let shortExitFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'above') aboveCount += 1;
    else if (s.zone === 'below') belowCount += 1;
    else if (s.zone === 'inside') insideCount += 1;
    if (s.longExit !== null) longExitFinal = s.longExit;
    if (s.shortExit !== null) shortExitFinal = s.shortExit;
  }

  return {
    series,
    period,
    multiplier,
    trueRange,
    atr,
    highestClose,
    lowestClose,
    longExit,
    shortExit,
    samples,
    longExitFinal,
    shortExitFinal,
    aboveCount,
    belowCount,
    insideCount,
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

export function computeLineChandelierLayout(
  options: ComputeLineChandelierLayoutOptions,
): ChartLineChandelierLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_CHANDELIER_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineChandelier(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.multiplier)
      ? { multiplier: options.multiplier }
      : {}),
  });

  const emptyPanel: ChartLineChandelierPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineChandelierLayout = {
    ok: false,
    width,
    height,
    panel: emptyPanel,
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    pricePath: '',
    priceDots: [],
    longExitPath: '',
    shortExitPath: '',
    markers: [],
    period: run.period,
    multiplier: run.multiplier,
    longExitFinal: NaN,
    shortExitFinal: NaN,
    aboveCount: 0,
    belowCount: 0,
    insideCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineChandelierPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < yLo) yLo = s.value;
    if (s.value > yHi) yHi = s.value;
    if (s.longExit !== null) {
      if (s.longExit < yLo) yLo = s.longExit;
      if (s.longExit > yHi) yHi = s.longExit;
    }
    if (s.shortExit !== null) {
      if (s.shortExit < yLo) yLo = s.shortExit;
      if (s.shortExit > yHi) yHi = s.shortExit;
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;
  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const priceDots: ChartLineChandelierDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    longExit: s.longExit,
    shortExit: s.shortExit,
    zone: s.zone,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const longPts: { px: number; py: number }[] = [];
  const shortPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.longExit !== null) {
      longPts.push({ px: projectX(s.x), py: projectY(s.longExit) });
    }
    if (s.shortExit !== null) {
      shortPts.push({ px: projectX(s.x), py: projectY(s.shortExit) });
    }
  }

  const markers: ChartLineChandelierMarker[] = run.samples
    .filter((s) => s.zone !== 'none')
    .map((s) => ({
      index: s.index,
      x: s.x,
      value: s.value,
      zone: s.zone,
      px: projectX(s.x),
      py: projectY(s.value),
    }));

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    yTicks: computeTicks(yLo, yHi, tickCount).map((v) => ({
      value: v,
      py: projectY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    longExitPath: buildPath(longPts),
    shortExitPath: buildPath(shortPts),
    markers,
    period: run.period,
    multiplier: run.multiplier,
    longExitFinal: run.longExitFinal,
    shortExitFinal: run.shortExitFinal,
    aboveCount: run.aboveCount,
    belowCount: run.belowCount,
    insideCount: run.insideCount,
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

export function describeLineChandelierChart(
  data: readonly ChartLineChandelierPoint[] | null | undefined,
  options?: { period?: number; multiplier?: number },
): string {
  const run = runLineChandelier(data, options);
  if (!run.ok) return 'No data';
  return `Single-panel line chart with a Chandelier Exit (period ${run.period}, multiplier ${run.multiplier}): the price line carries two volatility-based trailing stops. The long Chandelier Exit hangs a stop ${run.multiplier} times the average true range below the highest close of the trailing window -- it rises under an advancing market and a long trade is stopped when the price closes beneath it. The short Chandelier Exit places the mirror stop the same multiple of the ATR above the lowest close. The price sits above the short stop on ${run.aboveCount} bars, below the long stop on ${run.belowCount} and inside the channel on ${run.insideCount} across ${run.samples.length} bars.`;
}

const CHANDELIER_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineChandelier = forwardRef<
  HTMLDivElement,
  ChartLineChandelierProps
>(function ChartLineChandelier(
  props: ChartLineChandelierProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    multiplier,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_CHANDELIER_WIDTH,
    height = DEFAULT_CHART_LINE_CHANDELIER_HEIGHT,
    padding = DEFAULT_CHART_LINE_CHANDELIER_PADDING,
    tickCount = DEFAULT_CHART_LINE_CHANDELIER_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CHANDELIER_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CHANDELIER_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CHANDELIER_PRICE_COLOR,
    longColor = DEFAULT_CHART_LINE_CHANDELIER_LONG_COLOR,
    shortColor = DEFAULT_CHART_LINE_CHANDELIER_SHORT_COLOR,
    insideColor = DEFAULT_CHART_LINE_CHANDELIER_INSIDE_COLOR,
    gridColor = DEFAULT_CHART_LINE_CHANDELIER_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CHANDELIER_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showLongExit = true,
    showShortExit = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a Chandelier Exit overlay',
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
      computeLineChandelierLayout({
        data,
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(multiplier) ? { multiplier } : {}),
      }),
    [data, width, height, padding, tickCount, period, multiplier],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineChandelierChart(data, {
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(multiplier) ? { multiplier } : {}),
      }),
    [ariaDescription, data, period, multiplier],
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
        data-section="chart-line-chandelier"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-chandelier-aria-desc"
          style={CHANDELIER_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const panel = layout.panel;
  const priceVisible = !hiddenSet.has('price');
  const longVisible = showLongExit && !hiddenSet.has('long');
  const shortVisible = showShortExit && !hiddenSet.has('short');
  const markersVisible = showMarkers && priceVisible;

  const fmtNullable = (v: number | null): string =>
    v === null ? 'n/a' : formatValue(v);

  const zoneColor = (zone: ChartLineChandelierZone): string => {
    if (zone === 'above') return longColor;
    if (zone === 'below') return shortColor;
    return insideColor;
  };

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'long', label: 'Long Exit', color: longColor },
    { id: 'short', label: 'Short Exit', color: shortColor },
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
      data-section="chart-line-chandelier"
      data-empty="false"
      data-period={layout.period}
      data-multiplier={layout.multiplier}
      data-long-exit-final={layout.longExitFinal}
      data-short-exit-final={layout.shortExitFinal}
      data-above-count={layout.aboveCount}
      data-below-count={layout.belowCount}
      data-inside-count={layout.insideCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-chandelier-aria-desc"
        style={CHANDELIER_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-chandelier-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-chandelier-badge"
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
              data-section="chart-line-chandelier-badge-icon"
              aria-hidden="true"
              style={{ color: longColor }}
            >
              CE
            </span>
            <span data-section="chart-line-chandelier-badge-config">
              {layout.period}x{layout.multiplier}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-chandelier-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-chandelier-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => (
                <line
                  key={`gy-${i}`}
                  data-section="chart-line-chandelier-grid-line"
                  x1={panel.x}
                  x2={panel.x + panel.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-chandelier-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-chandelier-axis"
                data-axis="y"
                x1={panel.x}
                y1={panel.y}
                x2={panel.x}
                y2={panel.y + panel.height}
              />
              <line
                data-section="chart-line-chandelier-axis"
                data-axis="x"
                x1={panel.x}
                y1={panel.y + panel.height}
                x2={panel.x + panel.width}
                y2={panel.y + panel.height}
              />
              {layout.yTicks.map((t, i) => (
                <text
                  key={`yt-${i}`}
                  data-section="chart-line-chandelier-tick-label"
                  data-axis="y"
                  x={panel.x - 6}
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
                  data-section="chart-line-chandelier-tick-label"
                  data-axis="x"
                  x={t.px}
                  y={panel.y + panel.height + 14}
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

          {longVisible && layout.longExitPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Long Chandelier Exit"
              data-section="chart-line-chandelier-long-exit-path"
              d={layout.longExitPath}
              fill="none"
              stroke={longColor}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {shortVisible && layout.shortExitPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Short Chandelier Exit"
              data-section="chart-line-chandelier-short-exit-path"
              d={layout.shortExitPath}
              fill="none"
              stroke={shortColor}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-chandelier-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-chandelier-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-chandelier-dot"
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

          {markersVisible ? (
            <g data-section="chart-line-chandelier-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${m.index + 1} at x ${formatX(m.x)}: ${m.zone} the Chandelier channel`}
                    data-section="chart-line-chandelier-marker"
                    data-point-index={m.index}
                    data-zone={m.zone}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={zoneColor(m.zone)}
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
                  data-section="chart-line-chandelier-tooltip"
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
                  <div data-section="chart-line-chandelier-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-chandelier-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-chandelier-tooltip-long">
                    long: {fmtNullable(d.longExit)}
                  </div>
                  <div data-section="chart-line-chandelier-tooltip-short">
                    short: {fmtNullable(d.shortExit)}
                  </div>
                  <div data-section="chart-line-chandelier-tooltip-zone">
                    zone: {d.zone}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-chandelier-legend"
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
                data-section="chart-line-chandelier-legend-item"
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
                  data-section="chart-line-chandelier-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-chandelier-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-chandelier-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.aboveCount} above, {layout.belowCount} below,{' '}
            {layout.insideCount} inside
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineChandelier.displayName = 'ChartLineChandelier';
