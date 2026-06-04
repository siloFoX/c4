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
 * ChartLineMacdCross -- pure-SVG dual-panel chart with the close on
 * top and the MACD line (EMA[fast] - EMA[slow]) plus its signal
 * line (EMA of MACD) on the bottom. Detects trend-change cross
 * events between MACD and signal, and tints them based on the
 * zero-line bias (whether MACD is positive or negative at the
 * cross bar):
 *
 *   ema1 = EMA(close, fastLength)
 *   ema2 = EMA(close, slowLength)
 *   macd = ema1 - ema2
 *   signal = EMA(macd, signalLength)
 *
 * Cross events are emitted at the bar where the strict inequality
 * between macd and signal newly flips (`up` for macd > signal,
 * `down` for macd < signal). The bias for a cross is `bullish` if
 * macd > 0, `bearish` if macd < 0, and `neutral` if exactly 0.
 *
 * Bit-exact anchors:
 * - **CONST close = K**: every EMA equals K, macd = 0, signal = 0.
 *   The relation never strictly flips so zero crosses fire.
 * - **LINEAR UP close = i + 1** (and **LINEAR DOWN close = N - i**):
 *   both EMAs converge to the same lag from the line; macd is a
 *   constant offset proportional to (slow - fast). Signal EMA of a
 *   constant input is the constant (min === max seed precision fix)
 *   so signal equals macd once seeded -- relation stays equal and
 *   zero crosses fire.
 */

export interface ChartLineMacdCrossPoint {
  x: number;
  close: number;
}

export type ChartLineMacdCrossRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLineMacdCrossCross = 'up' | 'down' | null;

export type ChartLineMacdCrossBias = 'bullish' | 'bearish' | 'neutral';

export type ChartLineMacdCrossSeriesId = 'price' | 'macd' | 'signal';

export interface ChartLineMacdCrossSample {
  index: number;
  x: number;
  close: number;
  macd: number | null;
  signal: number | null;
  relation: ChartLineMacdCrossRelation;
  crossed: ChartLineMacdCrossCross;
  bias: ChartLineMacdCrossBias | null;
}

export interface ChartLineMacdCrossRun {
  series: ChartLineMacdCrossPoint[];
  fastLength: number;
  slowLength: number;
  signalLength: number;
  macdValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineMacdCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  neutralCrossCount: number;
  ok: boolean;
}

export interface ChartLineMacdCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  macd: number;
  kind: 'up' | 'down';
  bias: ChartLineMacdCrossBias;
}

export interface ChartLineMacdCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMacdCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  oscTop: number;
  oscBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineMacdCrossDot[];
  macdPath: string;
  signalPath: string;
  markers: ChartLineMacdCrossMarker[];
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  run: ChartLineMacdCrossRun;
}

export interface ChartLineMacdCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMacdCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  macdColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  neutralColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMacd?: boolean;
  showSignal?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMacdCrossSeriesId[];
  defaultHiddenSeries?: ChartLineMacdCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMacdCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineMacdCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatMacd?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_MACD_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_MACD_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MACD_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_MACD_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MACD_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MACD_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MACD_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MACD_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_MACD_CROSS_FAST_LENGTH = 12;
export const DEFAULT_CHART_LINE_MACD_CROSS_SLOW_LENGTH = 26;
export const DEFAULT_CHART_LINE_MACD_CROSS_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_MACD_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MACD_CROSS_MACD_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_MACD_CROSS_SIGNAL_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_MACD_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MACD_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MACD_CROSS_NEUTRAL_COLOR = '#475569';
export const DEFAULT_CHART_LINE_MACD_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_MACD_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MACD_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x and close. */
export function getLineMacdCrossFinitePoints(
  data: readonly ChartLineMacdCrossPoint[] | null | undefined,
): ChartLineMacdCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMacdCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineMacdCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * SMA-seeded EMA with `min === max` precision fix and CONST short-
 * circuit so constant inputs land bit-exactly on the constant.
 */
export function applyLineMacdCrossEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);
  let smoothed: number | null = null;
  let sum = 0;
  let count = 0;
  let seedMin = Infinity;
  let seedMax = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      smoothed = null;
      sum = 0;
      count = 0;
      seedMin = Infinity;
      seedMax = -Infinity;
      continue;
    }
    if (smoothed == null) {
      sum += v;
      count += 1;
      if (v < seedMin) seedMin = v;
      if (v > seedMax) seedMax = v;
      if (count >= length) {
        smoothed = seedMin === seedMax ? seedMin : sum / length;
        out[i] = posZero(smoothed);
      }
    } else {
      const next =
        v === smoothed ? v : alpha * v + (1 - alpha) * smoothed;
      smoothed = next;
      out[i] = posZero(next);
    }
  }
  return out;
}

export interface LineMacdCrossChannels {
  macd: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineMacdCross(
  series: readonly ChartLineMacdCrossPoint[] | null | undefined,
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): LineMacdCrossChannels {
  const cleaned = getLineMacdCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { macd: [], signal: [] };
  }
  const fastLength = normalizeLineMacdCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_MACD_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineMacdCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_MACD_CROSS_SLOW_LENGTH,
  );
  const signalLength = normalizeLineMacdCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MACD_CROSS_SIGNAL_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const fastEma = applyLineMacdCrossEma(closes, fastLength);
  const slowEma = applyLineMacdCrossEma(closes, slowLength);
  const macd: Array<number | null> = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const f = fastEma[i];
    const s = slowEma[i];
    if (f == null || s == null) {
      macd.push(null);
      continue;
    }
    macd.push(posZero(f - s));
  }
  const signal = applyLineMacdCrossEma(macd, signalLength);
  return { macd, signal };
}

export function classifyLineMacdCrossRelation(
  macd: number | null,
  signal: number | null,
): ChartLineMacdCrossRelation {
  if (macd == null || signal == null) return 'none';
  if (macd > signal) return 'bullish';
  if (macd < signal) return 'bearish';
  return 'equal';
}

export function classifyLineMacdCrossBias(
  macd: number | null,
): ChartLineMacdCrossBias | null {
  if (macd == null) return null;
  if (macd > 0) return 'bullish';
  if (macd < 0) return 'bearish';
  return 'neutral';
}

export function detectLineMacdCrossCrosses(
  macdValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineMacdCrossCross[] {
  const out: ChartLineMacdCrossCross[] = [];
  let prevMacd: number | null = null;
  let prevSignal: number | null = null;
  for (let i = 0; i < macdValues.length; i += 1) {
    const m = macdValues[i];
    const s = signalValues[i];
    if (m == null || s == null) {
      out.push(null);
      prevMacd = null;
      prevSignal = null;
      continue;
    }
    if (prevMacd == null || prevSignal == null) {
      out.push(null);
      prevMacd = m;
      prevSignal = s;
      continue;
    }
    if (prevMacd <= prevSignal && m > s) {
      out.push('up');
    } else if (prevMacd >= prevSignal && m < s) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevMacd = m;
    prevSignal = s;
  }
  return out;
}

export function runLineMacdCross(
  data: ChartLineMacdCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): ChartLineMacdCrossRun {
  const cleaned = getLineMacdCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineMacdCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_MACD_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineMacdCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_MACD_CROSS_SLOW_LENGTH,
  );
  const signalLength = normalizeLineMacdCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MACD_CROSS_SIGNAL_LENGTH,
  );

  const channels = computeLineMacdCross(series, {
    fastLength,
    slowLength,
    signalLength,
  });
  const crosses = detectLineMacdCrossCrosses(
    channels.macd,
    channels.signal,
  );

  const samples: ChartLineMacdCrossSample[] = series.map((p, i) => {
    const macd = channels.macd[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const relation = classifyLineMacdCrossRelation(macd, signal);
    const crossed = crosses[i] ?? null;
    const bias = classifyLineMacdCrossBias(macd);
    return {
      index: i,
      x: p.x,
      close: p.close,
      macd,
      signal,
      relation,
      crossed,
      bias,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  let neutralCrossCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.crossed != null) {
      if (s.bias === 'bullish') bullishCrossCount += 1;
      else if (s.bias === 'bearish') bearishCrossCount += 1;
      else neutralCrossCount += 1;
    }
  }

  const ok = series.length > slowLength + signalLength;

  return {
    series,
    fastLength,
    slowLength,
    signalLength,
    macdValues: channels.macd,
    signalValues: channels.signal,
    samples,
    upCrossCount,
    downCrossCount,
    bullishCrossCount,
    bearishCrossCount,
    neutralCrossCount,
    ok,
  };
}

export interface ComputeLineMacdCrossLayoutOptions {
  data: ChartLineMacdCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineMacdCrossLayout(
  opts: ComputeLineMacdCrossLayoutOptions,
): ChartLineMacdCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_MACD_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_MACD_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_MACD_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_MACD_CROSS_PANEL_GAP;

  const run = runLineMacdCross(opts.data, {
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
    signalLength: opts.signalLength ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      oscTop,
      oscBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      macdPath: '',
      signalPath: '',
      markers: [],
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
      zeroY: (oscTop + oscBottom) / 2,
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

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const s of run.samples) {
    if (s.macd != null) {
      if (s.macd < oscMin) oscMin = s.macd;
      if (s.macd > oscMax) oscMax = s.macd;
    }
    if (s.signal != null) {
      if (s.signal < oscMin) oscMin = s.signal;
      if (s.signal > oscMax) oscMax = s.signal;
    }
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = -1;
    oscMax = 1;
  }
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }
  if (oscMin > 0) oscMin = 0;
  if (oscMax < 0) oscMax = 0;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syOsc = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

  let pricePath = '';
  const priceDots: ChartLineMacdCrossDot[] = [];
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

  const buildPath = (key: 'macd' | 'signal'): string => {
    let p = '';
    let first = true;
    for (const s of run.samples) {
      const v = s[key];
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = syOsc(v);
      p += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return p.trim();
  };

  const macdPath = buildPath('macd');
  const signalPath = buildPath('signal');

  const markers: ChartLineMacdCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.macd == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syOsc(s.macd),
      macd: s.macd,
      kind: s.crossed,
      bias: s.bias ?? 'neutral',
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
    oscTop,
    oscBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    macdPath,
    signalPath,
    markers,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY: syOsc(0),
    run,
  };
}

export function describeLineMacdCrossChart(
  data: ChartLineMacdCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): string {
  const cleaned = getLineMacdCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fastLength = normalizeLineMacdCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_MACD_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineMacdCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_MACD_CROSS_SLOW_LENGTH,
  );
  const signalLength = normalizeLineMacdCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MACD_CROSS_SIGNAL_LENGTH,
  );
  return (
    `MACD Cross chart over ${cleaned.length} bars ` +
    `(fastLength ${fastLength}, slowLength ${slowLength}, ` +
    `signalLength ${signalLength}). Top panel renders the close; ` +
    `bottom panel renders the MACD and signal lines with markers at ` +
    `every signal cross (tinted by zero-line bias -- bullish when ` +
    `MACD > 0, bearish when MACD < 0, neutral when exactly 0).`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultMacdFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineMacdCross = forwardRef<
  HTMLDivElement,
  ChartLineMacdCrossProps
>(function ChartLineMacdCross(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_MACD_CROSS_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_MACD_CROSS_SLOW_LENGTH,
    signalLength = DEFAULT_CHART_LINE_MACD_CROSS_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_MACD_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_MACD_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_MACD_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_MACD_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MACD_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MACD_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MACD_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_MACD_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MACD_CROSS_PRICE_COLOR,
    macdColor = DEFAULT_CHART_LINE_MACD_CROSS_MACD_COLOR,
    signalColor = DEFAULT_CHART_LINE_MACD_CROSS_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_MACD_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_MACD_CROSS_BEARISH_COLOR,
    neutralColor = DEFAULT_CHART_LINE_MACD_CROSS_NEUTRAL_COLOR,
    zeroColor = DEFAULT_CHART_LINE_MACD_CROSS_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_MACD_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MACD_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMacd = true,
    showSignal = true,
    showMarkers = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onCrossClick,
    formatPrice = defaultPriceFormatter,
    formatMacd = defaultMacdFormatter,
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
    () => getLineMacdCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineMacdCrossLayout({
        data: cleaned,
        fastLength,
        slowLength,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      fastLength,
      slowLength,
      signalLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineMacdCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineMacdCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineMacdCrossSeriesId,
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
        data-section="chart-line-macd-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineMacdCrossChart(cleaned, {
      fastLength,
      slowLength,
      signalLength,
    });

  const showPrice = !hidden.has('price');
  const showMacdLine = !hidden.has('macd') && showMacd;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickOscValues.push(
      layout.oscMin + ((layout.oscMax - layout.oscMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  const markerColor = (bias: ChartLineMacdCrossBias): string => {
    if (bias === 'bullish') return bullishColor;
    if (bias === 'bearish') return bearishColor;
    return neutralColor;
  };

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'MACD Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-macd-cross"
      data-fast-length={fastLength}
      data-slow-length={slowLength}
      data-signal-length={signalLength}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-macd-cross-title"
      >
        {ariaLabel ?? 'MACD Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-macd-cross-aria-desc"
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
        data-section="chart-line-macd-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-macd-cross-grid">
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
                  data-section="chart-line-macd-cross-grid-line-price"
                />
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <line
                  key={`grid-osc-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-macd-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-macd-cross-axes">
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
              y1={layout.oscTop}
              x2={layout.innerLeft}
              y2={layout.oscBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oscBottom}
              x2={layout.innerRight}
              y2={layout.oscBottom}
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
                  data-section="chart-line-macd-cross-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <text
                  key={`tick-osc-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-macd-cross-tick-osc"
                >
                  {formatMacd(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroY}
            x2={layout.innerRight}
            y2={layout.zeroY}
            stroke={zeroColor}
            strokeDasharray="2 4"
            data-section="chart-line-macd-cross-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-macd-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-macd-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-macd-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-macd-cross-signal"
          />
        ) : null}

        {showMacdLine ? (
          <path
            d={layout.macdPath}
            stroke={macdColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-macd-cross-macd"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-macd-cross-markers">
            {layout.markers.map((m) => (
              <circle
                key={`marker-${m.index}-${m.kind}`}
                cx={m.cx}
                cy={m.cy}
                r={markerRadius}
                fill={markerColor(m.bias)}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onCrossClick?.({ point: sample });
                }}
                data-section="chart-line-macd-cross-marker"
                data-kind={m.kind}
                data-bias={m.bias}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-macd-cross-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.oscBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-macd-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-macd-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={188}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-cross-tooltip-macd"
                >
                  macd{' '}
                  {tooltipSample.macd == null
                    ? '--'
                    : formatMacd(tooltipSample.macd)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-cross-tooltip-signal"
                >
                  signal{' '}
                  {tooltipSample.signal == null
                    ? '--'
                    : formatMacd(tooltipSample.signal)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias ?? '--'}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-cross-tooltip-counts"
                >
                  up {layout.run.upCrossCount} | down{' '}
                  {layout.run.downCrossCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-macd-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          fast {fastLength} | slow {slowLength} | signal {signalLength} |
          up {layout.run.upCrossCount} | down {layout.run.downCrossCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-macd-cross-legend"
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
              { id: 'macd' as const, color: macdColor, label: 'macd' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineMacdCrossSeriesId;
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

ChartLineMacdCross.displayName = 'ChartLineMacdCross';
