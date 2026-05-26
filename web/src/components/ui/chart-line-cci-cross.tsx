import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
} from 'react';

/**
 * ChartLineCciCross -- pure-SVG dual-panel chart with the close on
 * top and a Commodity Channel Index (CCI) line on the bottom. Six
 * threshold-cross events surface the momentum extremes:
 *
 *   enter100   -- CCI newly exceeds +100 (overbought entry)
 *   exit100    -- CCI newly drops below +100
 *   enterN100  -- CCI newly drops below -100 (oversold entry)
 *   exitN100   -- CCI newly rises above -100
 *   zeroUp     -- CCI crosses 0 upward (bullish bias)
 *   zeroDown   -- CCI crosses 0 downward (bearish bias)
 *
 *   typical = (high + low + close) / 3
 *   sma     = SMA(typical, n)
 *   meanDev = average over the window of |typical - sma|
 *   CCI     = meanDev > 0 ? (typical - sma) / (0.015 * meanDev)
 *                         : null
 *
 * Bit-exact anchor (with the `min === max` window-constant precision
 * fix in the SMA helper):
 *
 * - **CONST h = l = close = K**: typical = K, SMA = K, meanDev = 0
 *   -- divide-by-zero leaves CCI permanently `null`. Zero events
 *   fire and the regime is `none` for every bar.
 *
 * Soft anchors for LINEAR UP / LINEAR DOWN (used in tests as
 * existence and sign checks, since the `0.015` constant in the
 * denominator is not a dyadic rational and produces 1-ULP drift):
 *
 * - **LINEAR UP h = l = close = i+1**: CCI converges to a positive
 *   constant once seeded (specifically `(n-1) / (0.015 * 2*(n-1)/n)`
 *   for an arithmetic series). Once the window is full the value
 *   stays constant, so the only transition is `null -> constant`
 *   which the cross detector skips (prev null). Zero events.
 * - **LINEAR DOWN h = l = close = N-i**: mirror image -- CCI sits
 *   at a negative constant. Zero events.
 */

export interface ChartLineCciCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineCciCrossRegime =
  | 'none'
  | 'overbought'
  | 'oversold'
  | 'bullish'
  | 'bearish'
  | 'neutral';

export type ChartLineCciCrossEvent =
  | 'enter100'
  | 'exit100'
  | 'enterN100'
  | 'exitN100'
  | 'zeroUp'
  | 'zeroDown'
  | null;

export type ChartLineCciCrossSeriesId = 'price' | 'cci';

export interface ChartLineCciCrossSample {
  index: number;
  x: number;
  close: number;
  cci: number | null;
  regime: ChartLineCciCrossRegime;
  event: ChartLineCciCrossEvent;
}

export interface ChartLineCciCrossRun {
  series: ChartLineCciCrossPoint[];
  length: number;
  cciValues: Array<number | null>;
  samples: ChartLineCciCrossSample[];
  enter100Count: number;
  exit100Count: number;
  enterN100Count: number;
  exitN100Count: number;
  zeroUpCount: number;
  zeroDownCount: number;
  overboughtCount: number;
  oversoldCount: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineCciCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  cci: number;
  event: NonNullable<ChartLineCciCrossEvent>;
}

export interface ChartLineCciCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCciCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  cciTop: number;
  cciBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineCciCrossDot[];
  cciPath: string;
  markers: ChartLineCciCrossMarker[];
  priceMin: number;
  priceMax: number;
  cciMin: number;
  cciMax: number;
  zeroY: number;
  upperY: number;
  lowerY: number;
  run: ChartLineCciCrossRun;
}

export interface ChartLineCciCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCciCrossPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  cciColor?: string;
  zeroColor?: string;
  upperColor?: string;
  lowerColor?: string;
  enterColor?: string;
  exitColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCci?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showUpperLine?: boolean;
  showLowerLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCciCrossSeriesId[];
  defaultHiddenSeries?: ChartLineCciCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCciCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineCciCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatCci?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_CCI_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_CCI_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CCI_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_CCI_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CCI_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CCI_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CCI_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CCI_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_CCI_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_CCI_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CCI_CROSS_CCI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CCI_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_CCI_CROSS_UPPER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CCI_CROSS_LOWER_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CCI_CROSS_ENTER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CCI_CROSS_EXIT_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_CCI_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CCI_CROSS_BEARISH_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_CCI_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CCI_CROSS_GRID_COLOR = '#e2e8f0';

export const CCI_LAMBERT_CONSTANT = 0.015;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / high / low / close. */
export function getLineCciCrossFinitePoints(
  data: readonly ChartLineCciCrossPoint[] | null | undefined,
): ChartLineCciCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCciCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
      });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineCciCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** typical = (high + low + close) / 3 */
export function computeLineCciCrossTypical(
  data: readonly ChartLineCciCrossPoint[],
): number[] {
  const out: number[] = [];
  for (const p of data) {
    out.push(posZero((p.high + p.low + p.close) / 3));
  }
  return out;
}

/**
 * Rolling SMA with `min === max` window-constant precision fix
 * (so a constant window lands bit-exactly on its constant value).
 */
export function applyLineCciCrossSma(
  values: readonly number[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let k = i - length + 1; k <= i; k += 1) {
      const v = values[k];
      if (v == null) {
        sum = Number.NaN;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!Number.isFinite(sum)) continue;
    out[i] =
      winMin === winMax && Number.isFinite(winMin)
        ? winMin
        : posZero(sum / length);
  }
  return out;
}

/**
 * Rolling mean absolute deviation about the SMA.
 * Returns 0 (not null) for a constant window so callers can detect
 * the divide-by-zero scenario explicitly.
 */
export function applyLineCciCrossMad(
  values: readonly number[],
  smaValues: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  for (let i = length - 1; i < values.length; i += 1) {
    const sma = smaValues[i];
    if (sma == null) continue;
    let sum = 0;
    let ok = true;
    for (let k = i - length + 1; k <= i; k += 1) {
      const v = values[k];
      if (v == null) {
        ok = false;
        break;
      }
      sum += Math.abs(v - sma);
    }
    if (!ok) continue;
    out[i] = posZero(sum / length);
  }
  return out;
}

export interface LineCciCrossChannels {
  typical: number[];
  sma: Array<number | null>;
  mad: Array<number | null>;
  cci: Array<number | null>;
}

export function computeLineCciCross(
  series: readonly ChartLineCciCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineCciCrossChannels {
  const cleaned = getLineCciCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { typical: [], sma: [], mad: [], cci: [] };
  }
  const length = normalizeLineCciCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CCI_CROSS_LENGTH,
  );
  const typical = computeLineCciCrossTypical(cleaned);
  const sma = applyLineCciCrossSma(typical, length);
  const mad = applyLineCciCrossMad(typical, sma, length);
  const cci: Array<number | null> = new Array(typical.length).fill(null);
  for (let i = 0; i < typical.length; i += 1) {
    const tp = typical[i];
    const s = sma[i];
    const m = mad[i];
    if (tp == null || s == null || m == null) continue;
    if (m === 0) continue;
    cci[i] = posZero((tp - s) / (CCI_LAMBERT_CONSTANT * m));
  }
  return { typical, sma, mad, cci };
}

export function classifyLineCciCrossRegime(
  cci: number | null,
): ChartLineCciCrossRegime {
  if (cci == null) return 'none';
  if (cci > 100) return 'overbought';
  if (cci < -100) return 'oversold';
  if (cci > 0) return 'bullish';
  if (cci < 0) return 'bearish';
  return 'neutral';
}

export function detectLineCciCrossEvents(
  cciValues: readonly (number | null)[],
): ChartLineCciCrossEvent[] {
  const out: ChartLineCciCrossEvent[] = [];
  let prev: number | null = null;
  for (let i = 0; i < cciValues.length; i += 1) {
    const cur = cciValues[i];
    if (cur == null) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev == null) {
      out.push(null);
      prev = cur;
      continue;
    }
    let event: ChartLineCciCrossEvent = null;
    if (prev <= 100 && cur > 100) event = 'enter100';
    else if (prev >= 100 && cur < 100) event = 'exit100';
    else if (prev >= -100 && cur < -100) event = 'enterN100';
    else if (prev <= -100 && cur > -100) event = 'exitN100';
    else if (prev <= 0 && cur > 0) event = 'zeroUp';
    else if (prev >= 0 && cur < 0) event = 'zeroDown';
    out.push(event);
    prev = cur;
  }
  return out;
}

export function runLineCciCross(
  data: ChartLineCciCrossPoint[],
  options: { length?: number } = {},
): ChartLineCciCrossRun {
  const cleaned = getLineCciCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineCciCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CCI_CROSS_LENGTH,
  );

  const channels = computeLineCciCross(series, { length });
  const events = detectLineCciCrossEvents(channels.cci);

  const samples: ChartLineCciCrossSample[] = series.map((p, i) => {
    const cci = channels.cci[i] ?? null;
    const regime = classifyLineCciCrossRegime(cci);
    const event = events[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      cci,
      regime,
      event,
    };
  });

  let enter100Count = 0;
  let exit100Count = 0;
  let enterN100Count = 0;
  let exitN100Count = 0;
  let zeroUpCount = 0;
  let zeroDownCount = 0;
  let overboughtCount = 0;
  let oversoldCount = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.event === 'enter100') enter100Count += 1;
    else if (s.event === 'exit100') exit100Count += 1;
    else if (s.event === 'enterN100') enterN100Count += 1;
    else if (s.event === 'exitN100') exitN100Count += 1;
    else if (s.event === 'zeroUp') zeroUpCount += 1;
    else if (s.event === 'zeroDown') zeroDownCount += 1;
    if (s.regime === 'overbought') overboughtCount += 1;
    else if (s.regime === 'oversold') oversoldCount += 1;
    else if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length;

  return {
    series,
    length,
    cciValues: channels.cci,
    samples,
    enter100Count,
    exit100Count,
    enterN100Count,
    exitN100Count,
    zeroUpCount,
    zeroDownCount,
    overboughtCount,
    oversoldCount,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineCciCrossLayoutOptions {
  data: ChartLineCciCrossPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineCciCrossLayout(
  opts: ComputeLineCciCrossLayoutOptions,
): ChartLineCciCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_CCI_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_CCI_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_CCI_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_CCI_CROSS_PANEL_GAP;

  const run = runLineCciCross(opts.data, {
    length: opts.length ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const cciTop = priceBottom + panelGap;
  const cciBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      cciTop,
      cciBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      cciPath: '',
      markers: [],
      priceMin: 0,
      priceMax: 0,
      cciMin: -100,
      cciMax: 100,
      zeroY: (cciTop + cciBottom) / 2,
      upperY: 0,
      lowerY: 0,
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  let cciMin = -100;
  let cciMax = 100;
  for (const s of run.samples) {
    if (s.cci == null) continue;
    if (s.cci < cciMin) cciMin = s.cci;
    if (s.cci > cciMax) cciMax = s.cci;
  }
  const pad = (cciMax - cciMin) * 0.05;
  cciMin -= pad;
  cciMax += pad;
  if (cciMin === cciMax) {
    cciMin -= 1;
    cciMax += 1;
  }

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syCci = (y: number): number =>
    cciBottom - ((y - cciMin) / (cciMax - cciMin)) * (cciBottom - cciTop);

  let pricePath = '';
  const priceDots: ChartLineCciCrossDot[] = [];
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = syPrice(s.close);
    pricePath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    priceDots.push({
      index: s.index,
      x: s.x,
      cx,
      cy,
      close: s.close,
    });
  }

  let cciPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.cci == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syCci(s.cci);
    cciPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  cciPath = cciPath.trim();

  const markers: ChartLineCciCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.event == null) continue;
    if (s.cci == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syCci(s.cci),
      cci: s.cci,
      event: s.event,
    });
  }

  return {
    ok: true,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    cciTop,
    cciBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    cciPath,
    markers,
    priceMin,
    priceMax,
    cciMin,
    cciMax,
    zeroY: syCci(0),
    upperY: syCci(100),
    lowerY: syCci(-100),
    run,
  };
}

export function describeLineCciCrossChart(
  data: ChartLineCciCrossPoint[],
  options: { length?: number } = {},
): string {
  const cleaned = getLineCciCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineCciCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CCI_CROSS_LENGTH,
  );
  return (
    `CCI Cross chart over ${cleaned.length} bars (length ${length}). ` +
    `Top panel renders the close; bottom panel renders the ` +
    `Commodity Channel Index with markers at every crossover of ` +
    `+100, -100, and the zero line (enter100 / exit100 / ` +
    `enterN100 / exitN100 / zeroUp / zeroDown).`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultCciFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineCciCross = forwardRef<
  HTMLDivElement,
  ChartLineCciCrossProps
>(function ChartLineCciCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_CCI_CROSS_LENGTH,
    width = DEFAULT_CHART_LINE_CCI_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_CCI_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_CCI_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_CCI_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CCI_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CCI_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CCI_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_CCI_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CCI_CROSS_PRICE_COLOR,
    cciColor = DEFAULT_CHART_LINE_CCI_CROSS_CCI_COLOR,
    zeroColor = DEFAULT_CHART_LINE_CCI_CROSS_ZERO_COLOR,
    upperColor = DEFAULT_CHART_LINE_CCI_CROSS_UPPER_COLOR,
    lowerColor = DEFAULT_CHART_LINE_CCI_CROSS_LOWER_COLOR,
    enterColor = DEFAULT_CHART_LINE_CCI_CROSS_ENTER_COLOR,
    exitColor = DEFAULT_CHART_LINE_CCI_CROSS_EXIT_COLOR,
    bullishColor = DEFAULT_CHART_LINE_CCI_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_CCI_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_CCI_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CCI_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCci = true,
    showMarkers = true,
    showZeroLine = true,
    showUpperLine = true,
    showLowerLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onCrossClick,
    formatPrice = defaultPriceFormatter,
    formatCci = defaultCciFormatter,
    formatX = defaultXFormatter,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...rest
  } = props;

  const reactId = useId();
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  const cleaned = useMemo(
    () => getLineCciCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineCciCrossLayout({
        data: cleaned,
        length,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineCciCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineCciCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineCciCrossSeriesId,
  ): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLegendClick(seriesId);
    }
  };

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (cleaned.length === 0) {
    return (
      <div
        ref={ref}
        className={className}
        style={style}
        data-section="chart-line-cci-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineCciCrossChart(cleaned, { length });

  const showPrice = !hidden.has('price');
  const showCciLine = !hidden.has('cci') && showCci;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickCciValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickCciValues.push(
      layout.cciMin + ((layout.cciMax - layout.cciMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  const markerColor = (
    event: NonNullable<ChartLineCciCrossEvent>,
  ): string => {
    if (event === 'enter100' || event === 'enterN100') return enterColor;
    if (event === 'exit100' || event === 'exitN100') return exitColor;
    if (event === 'zeroUp') return bullishColor;
    return bearishColor;
  };

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'CCI Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-cci-cross"
      data-length={length}
      data-total-points={cleaned.length}
      data-enter100-count={layout.run.enter100Count}
      data-exit100-count={layout.run.exit100Count}
      data-enter-n100-count={layout.run.enterN100Count}
      data-exit-n100-count={layout.run.exitN100Count}
      data-zero-up-count={layout.run.zeroUpCount}
      data-zero-down-count={layout.run.zeroDownCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-cci-cross-title"
      >
        {ariaLabel ?? 'CCI Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-cci-cross-aria-desc"
      >
        {desc}
      </span>
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={0}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={animate ? 'motion-safe:animate-fade-in' : undefined}
        data-section="chart-line-cci-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-cci-cross-grid">
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <line
                  key={`grid-price-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-cci-cross-grid-line-price"
                />
              );
            })}
            {tickCciValues.map((v, i) => {
              const y =
                layout.cciBottom -
                ((v - layout.cciMin) /
                  (layout.cciMax - layout.cciMin)) *
                  (layout.cciBottom - layout.cciTop);
              return (
                <line
                  key={`grid-cci-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-cci-cross-grid-line-cci"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-cci-cross-axes">
            <line
              x1={layout.innerLeft}
              y1={layout.priceTop}
              x2={layout.innerLeft}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.priceBottom}
              x2={layout.innerRight}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.cciTop}
              x2={layout.innerLeft}
              y2={layout.cciBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.cciBottom}
              x2={layout.innerRight}
              y2={layout.cciBottom}
              stroke={axisColor}
            />
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <text
                  key={`tick-price-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-cci-cross-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickCciValues.map((v, i) => {
              const y =
                layout.cciBottom -
                ((v - layout.cciMin) /
                  (layout.cciMax - layout.cciMin)) *
                  (layout.cciBottom - layout.cciTop);
              return (
                <text
                  key={`tick-cci-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-cci-cross-tick-cci"
                >
                  {formatCci(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showUpperLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.upperY}
            x2={layout.innerRight}
            y2={layout.upperY}
            stroke={upperColor}
            strokeDasharray="3 3"
            data-section="chart-line-cci-cross-upper"
          />
        ) : null}

        {showLowerLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.lowerY}
            x2={layout.innerRight}
            y2={layout.lowerY}
            stroke={lowerColor}
            strokeDasharray="3 3"
            data-section="chart-line-cci-cross-lower"
          />
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroY}
            x2={layout.innerRight}
            y2={layout.zeroY}
            stroke={zeroColor}
            strokeDasharray="2 4"
            data-section="chart-line-cci-cross-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-cci-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-cci-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-cci-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showCciLine ? (
          <path
            d={layout.cciPath}
            stroke={cciColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-cci-cross-cci-path"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-cci-cross-markers">
            {layout.markers.map((m) => (
              <circle
                key={`marker-${m.index}-${m.event}`}
                cx={m.cx}
                cy={m.cy}
                r={markerRadius}
                fill={markerColor(m.event)}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onCrossClick?.({ point: sample });
                }}
                data-section="chart-line-cci-cross-marker"
                data-event={m.event}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-cci-cross-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.cciBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-cci-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-cci-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={196}
                  height={138}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-cross-tooltip-cci"
                >
                  cci{' '}
                  {tooltipSample.cci == null
                    ? '--'
                    : formatCci(tooltipSample.cci)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-cross-tooltip-event"
                >
                  event {tooltipSample.event ?? '--'}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-cross-tooltip-100"
                >
                  +100 in {layout.run.enter100Count} | out{' '}
                  {layout.run.exit100Count}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-cross-tooltip-n100"
                >
                  -100 in {layout.run.enterN100Count} | out{' '}
                  {layout.run.exitN100Count}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-cross-tooltip-zero"
                >
                  zero up {layout.run.zeroUpCount} | down{' '}
                  {layout.run.zeroDownCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-cci-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | +100 in {layout.run.enter100Count} | out{' '}
          {layout.run.exit100Count} | -100 in{' '}
          {layout.run.enterN100Count} | out{' '}
          {layout.run.exitN100Count} | zero up {layout.run.zeroUpCount} |
          down {layout.run.zeroDownCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-cci-cross-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              { id: 'price' as const, color: priceColor, label: 'close' },
              { id: 'cci' as const, color: cciColor, label: 'cci' },
            ] satisfies Array<{
              id: ChartLineCciCrossSeriesId;
              color: string;
              label: string;
            }>
          ).map(({ id, color, label }) => (
            <button
              key={id}
              type="button"
              data-series-id={id}
              aria-pressed={!hidden.has(id)}
              onClick={() => handleLegendClick(id)}
              onKeyDown={(e) => handleLegendKey(e, id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                fontSize: 11,
                opacity: hidden.has(id) ? 0.4 : 1,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  background: color,
                  borderRadius: 2,
                }}
              />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

ChartLineCciCross.displayName = 'ChartLineCciCross';
