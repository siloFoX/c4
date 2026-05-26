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
 * ChartLineStochSignal -- pure-SVG dual-panel chart with the
 * classic Stochastic Oscillator (%K) and its SMA signal line
 * (%D) beneath the close.
 *
 * Definition (George Lane):
 *
 *   HH[i]  = max(high[j], j = i - kPeriod + 1..i)
 *   LL[i]  = min(low[j],  j = i - kPeriod + 1..i)
 *   K[i]   = 100 * (close[i] - LL[i]) / (HH[i] - LL[i])
 *   D[i]   = SMA(K, dPeriod)[i]
 *
 * Defaults: `kPeriod = 14`, `dPeriod = 3`. When `HH == LL`
 * (singular: completely flat HL window) `K = null`. Bars before
 * `i = kPeriod - 1` are `null` (warmup); `D` adds another
 * `dPeriod - 1` bars of warmup.
 *
 * Bit-exact anchors:
 *
 *   * **Close at high (close == HH > LL)**: numerator = HH -
 *     LL = denominator -> `K = 100 * 1 = 100` bit-exact. SMA
 *     of 100 over any window = 100 bit-exact -> `D = 100`.
 *   * **Close at low (close == LL, HH > LL)**: numerator = 0
 *     -> `K = 0`, `D = 0` bit-exact.
 *   * **Close at midpoint (close = (HH + LL) / 2)** with
 *     dyadic HH - LL: `K = 50` bit-exact -> `D = 50`.
 *   * **CONST_HL (high == low at every bar)**: HH = LL ->
 *     singular -> `K = null` -> `D = null` (every window
 *     touching a null is null).
 *
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots K and D on a fixed
 * `[0, 100]` axis with overbought / oversold band lines.
 */

export interface ChartLineStochSignalPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineStochSignalZone =
  | 'overbought'
  | 'oversold'
  | 'neutral'
  | 'none';

export type ChartLineStochSignalSeriesId = 'price' | 'k' | 'd';

export interface ChartLineStochSignalSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  k: number | null;
  d: number | null;
  zone: ChartLineStochSignalZone;
}

export interface ChartLineStochSignalRun {
  series: ChartLineStochSignalPoint[];
  kPeriod: number;
  dPeriod: number;
  overboughtThreshold: number;
  oversoldThreshold: number;
  k: Array<number | null>;
  d: Array<number | null>;
  samples: ChartLineStochSignalSample[];
  kFinal: number | null;
  dFinal: number | null;
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineStochSignalMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  k: number;
  d: number | null;
  zone: ChartLineStochSignalZone;
}

export interface ChartLineStochSignalDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineStochSignalLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  stochTop: number;
  stochBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineStochSignalDot[];
  kPath: string;
  dPath: string;
  markers: ChartLineStochSignalMarker[];
  priceMin: number;
  priceMax: number;
  overboughtY: number;
  oversoldY: number;
  zeroLineY: number;
  run: ChartLineStochSignalRun;
}

export interface ChartLineStochSignalProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStochSignalPoint[];
  kPeriod?: number;
  dPeriod?: number;
  overboughtThreshold?: number;
  oversoldThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kColor?: string;
  dColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  neutralColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  bandColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showK?: boolean;
  showD?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStochSignalSeriesId[];
  defaultHiddenSeries?: ChartLineStochSignalSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStochSignalSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineStochSignalSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatStoch?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_STOCH_SIGNAL_WIDTH = 720;
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_HEIGHT = 460;
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_PADDING = 44;
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_K_PERIOD = 14;
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_D_PERIOD = 3;
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_OVERBOUGHT_THRESHOLD = 80;
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_OVERSOLD_THRESHOLD = 20;
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_K_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_D_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_NEUTRAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_STOCH_SIGNAL_BAND_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineStochSignalFinitePoints(
  data: readonly ChartLineStochSignalPoint[] | null | undefined,
): ChartLineStochSignalPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStochSignalPoint[] = [];
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

/** Coerce a positive integer length (>= 1). */
export function normalizeLineStochSignalLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Simple Moving Average; nulls inside the window null the bar. */
export function applyLineStochSignalSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v === null || v === undefined || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    out.push(sum / length);
  }
  return out;
}

export interface ChartLineStochSignalOptions {
  kPeriod?: number;
  dPeriod?: number;
}

/**
 * Compute %K and %D per bar. `K` warmup is `kPeriod - 1` bars;
 * `D` adds `dPeriod - 1` extra bars on top. Singular windows
 * (HH == LL) null %K.
 */
export function computeLineStochSignal(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
  options: ChartLineStochSignalOptions = {},
): { k: Array<number | null>; d: Array<number | null> } {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { k: [], d: [] };
  }
  const kPeriod = normalizeLineStochSignalLength(
    options.kPeriod,
    DEFAULT_CHART_LINE_STOCH_SIGNAL_K_PERIOD,
  );
  const dPeriod = normalizeLineStochSignalLength(
    options.dPeriod,
    DEFAULT_CHART_LINE_STOCH_SIGNAL_D_PERIOD,
  );
  const k: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < kPeriod - 1) {
      k.push(null);
      continue;
    }
    let hh = -Infinity;
    let ll = Infinity;
    let ok = true;
    for (let j = 0; j < kPeriod; j += 1) {
      const bar = bars[i - j];
      if (
        !bar ||
        !isFiniteNumber(bar.high) ||
        !isFiniteNumber(bar.low)
      ) {
        ok = false;
        break;
      }
      if (bar.high > hh) hh = bar.high;
      if (bar.low < ll) ll = bar.low;
    }
    const bar = bars[i];
    if (
      !ok ||
      !bar ||
      !isFiniteNumber(bar.close) ||
      hh === ll
    ) {
      k.push(null);
      continue;
    }
    k.push((100 * (bar.close - ll)) / (hh - ll));
  }
  const d = applyLineStochSignalSma(k, dPeriod);
  return { k, d };
}

/** Classify a stochastic %K reading. */
export function classifyLineStochSignalZone(
  value: number | null,
  overbought: number,
  oversold: number,
): ChartLineStochSignalZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= overbought) return 'overbought';
  if (value <= oversold) return 'oversold';
  return 'neutral';
}

/** Run the full Stochastic pipeline plus sample classification. */
export function runLineStochSignal(
  data: readonly ChartLineStochSignalPoint[] | null | undefined,
  options: ChartLineStochSignalOptions & {
    overboughtThreshold?: number;
    oversoldThreshold?: number;
  } = {},
): ChartLineStochSignalRun {
  const series = getLineStochSignalFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const kPeriod = normalizeLineStochSignalLength(
    options.kPeriod,
    DEFAULT_CHART_LINE_STOCH_SIGNAL_K_PERIOD,
  );
  const dPeriod = normalizeLineStochSignalLength(
    options.dPeriod,
    DEFAULT_CHART_LINE_STOCH_SIGNAL_D_PERIOD,
  );
  const overboughtThreshold = isFiniteNumber(options.overboughtThreshold)
    ? options.overboughtThreshold
    : DEFAULT_CHART_LINE_STOCH_SIGNAL_OVERBOUGHT_THRESHOLD;
  const oversoldThreshold = isFiniteNumber(options.oversoldThreshold)
    ? options.oversoldThreshold
    : DEFAULT_CHART_LINE_STOCH_SIGNAL_OVERSOLD_THRESHOLD;
  const { k, d } = computeLineStochSignal(series, {
    kPeriod,
    dPeriod,
  });
  const samples: ChartLineStochSignalSample[] = series.map((point, index) => {
    const kVal = k[index] ?? null;
    const dVal = d[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      k: kVal,
      d: dVal,
      zone: classifyLineStochSignalZone(
        kVal,
        overboughtThreshold,
        oversoldThreshold,
      ),
    };
  });
  let overboughtCount = 0;
  let oversoldCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  let kFinal: number | null = null;
  let dFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'overbought') overboughtCount += 1;
    else if (sample.zone === 'oversold') oversoldCount += 1;
    else if (sample.zone === 'neutral') neutralCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.k)) kFinal = sample.k;
    if (isFiniteNumber(sample.d)) dFinal = sample.d;
  }
  return {
    series,
    kPeriod,
    dPeriod,
    overboughtThreshold,
    oversoldThreshold,
    k,
    d,
    samples,
    kFinal,
    dFinal,
    overboughtCount,
    oversoldCount,
    neutralCount,
    noneCount,
    ok: series.length >= kPeriod + dPeriod - 1,
  };
}

export interface ChartLineStochSignalLayoutOptions
  extends ChartLineStochSignalOptions {
  data: readonly ChartLineStochSignalPoint[] | null | undefined;
  overboughtThreshold?: number;
  oversoldThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

function buildLinePath(
  points: ReadonlyArray<{ x: number; y: number }>,
): string {
  if (points.length === 0) return '';
  let d = '';
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    if (i < points.length - 1) d += ' ';
  }
  return d;
}

/** Project the run into a dual-panel SVG layout. */
export function computeLineStochSignalLayout(
  options: ChartLineStochSignalLayoutOptions,
): ChartLineStochSignalLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_STOCH_SIGNAL_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_STOCH_SIGNAL_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_STOCH_SIGNAL_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_STOCH_SIGNAL_PANEL_GAP;

  const run = runLineStochSignal(options.data, {
    ...(options.kPeriod !== undefined ? { kPeriod: options.kPeriod } : {}),
    ...(options.dPeriod !== undefined ? { dPeriod: options.dPeriod } : {}),
    ...(options.overboughtThreshold !== undefined
      ? { overboughtThreshold: options.overboughtThreshold }
      : {}),
    ...(options.oversoldThreshold !== undefined
      ? { oversoldThreshold: options.oversoldThreshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const stochHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const stochTop = priceBottom + panelGap;
  const stochBottom = stochTop + stochHeight;

  const okGeom = innerWidth > 0 && innerHeight > panelGap;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.close < priceMin) priceMin = sample.close;
    if (sample.close > priceMax) priceMax = sample.close;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }
  const priceY = (value: number): number =>
    priceBottom - ((value - priceMin) / (priceMax - priceMin)) * priceHeight;

  // Stochastic panel spans the constant range [0, 100].
  const stochMin = 0;
  const stochMax = 100;
  const stochY = (value: number): number =>
    stochBottom -
    ((value - stochMin) / (stochMax - stochMin)) * stochHeight;
  const overboughtY = stochY(run.overboughtThreshold);
  const oversoldY = stochY(run.oversoldThreshold);
  const zeroLineY = stochY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineStochSignalDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const kLinePoints: Array<{ x: number; y: number }> = [];
  const dLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineStochSignalMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (isFiniteNumber(sample.k)) {
      const cx = xAt(index);
      const yc = stochY(sample.k);
      kLinePoints.push({ x: cx, y: yc });
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        k: sample.k,
        d: sample.d,
        zone: sample.zone,
      });
    }
    if (isFiniteNumber(sample.d)) {
      const cx = xAt(index);
      dLinePoints.push({ x: cx, y: stochY(sample.d) });
    }
  });

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    stochTop,
    stochBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    kPath: buildLinePath(kLinePoints),
    dPath: buildLinePath(dLinePoints),
    markers,
    priceMin,
    priceMax,
    overboughtY,
    oversoldY,
    zeroLineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineStochSignalChart(
  data: readonly ChartLineStochSignalPoint[] | null | undefined,
  options: ChartLineStochSignalOptions & {
    overboughtThreshold?: number;
    oversoldThreshold?: number;
  } = {},
): string {
  const run = runLineStochSignal(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const kText = run.kFinal === null ? 'n/a' : run.kFinal.toFixed(4);
  const dText = run.dFinal === null ? 'n/a' : run.dFinal.toFixed(4);
  return (
    `Dual-panel chart with a Stochastic Oscillator and its SMA ` +
    `signal line beneath the close (kPeriod ${run.kPeriod}, ` +
    `dPeriod ${run.dPeriod}, overbought ${run.overboughtThreshold}, ` +
    `oversold ${run.oversoldThreshold}). %K = 100 * (close - ` +
    `lowest low) / (highest high - lowest low) over kPeriod bars, ` +
    `and %D is a simple moving average of %K over dPeriod bars. ` +
    `Across ${total} bars %K is overbought on ${run.overboughtCount}, ` +
    `neutral on ${run.neutralCount}, oversold on ${run.oversoldCount}, ` +
    `and undefined on ${run.noneCount}. The final %K is ${kText} ` +
    `and the final %D is ${dText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatStoch(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(2);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineStochSignalZone,
  overboughtColor: string,
  neutralColor: string,
  oversoldColor: string,
  noneColor: string,
): string {
  if (zone === 'overbought') return overboughtColor;
  if (zone === 'oversold') return oversoldColor;
  if (zone === 'neutral') return neutralColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineStochSignalZone): string {
  if (zone === 'overbought') return 'Overbought';
  if (zone === 'oversold') return 'Oversold';
  if (zone === 'neutral') return 'Neutral';
  return 'n/a';
}

/**
 * ChartLineStochSignal -- dual-panel pure-SVG Stochastic
 * Oscillator + signal line chart.
 */
export const ChartLineStochSignal = forwardRef<
  HTMLDivElement,
  ChartLineStochSignalProps
>(function ChartLineStochSignal(props, ref) {
  const {
    data,
    kPeriod = DEFAULT_CHART_LINE_STOCH_SIGNAL_K_PERIOD,
    dPeriod = DEFAULT_CHART_LINE_STOCH_SIGNAL_D_PERIOD,
    overboughtThreshold = DEFAULT_CHART_LINE_STOCH_SIGNAL_OVERBOUGHT_THRESHOLD,
    oversoldThreshold = DEFAULT_CHART_LINE_STOCH_SIGNAL_OVERSOLD_THRESHOLD,
    width = DEFAULT_CHART_LINE_STOCH_SIGNAL_WIDTH,
    height = DEFAULT_CHART_LINE_STOCH_SIGNAL_HEIGHT,
    padding = DEFAULT_CHART_LINE_STOCH_SIGNAL_PADDING,
    panelGap = DEFAULT_CHART_LINE_STOCH_SIGNAL_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_STOCH_SIGNAL_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_STOCH_SIGNAL_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STOCH_SIGNAL_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STOCH_SIGNAL_PRICE_COLOR,
    kColor = DEFAULT_CHART_LINE_STOCH_SIGNAL_K_COLOR,
    dColor = DEFAULT_CHART_LINE_STOCH_SIGNAL_D_COLOR,
    overboughtColor = DEFAULT_CHART_LINE_STOCH_SIGNAL_OVERBOUGHT_COLOR,
    oversoldColor = DEFAULT_CHART_LINE_STOCH_SIGNAL_OVERSOLD_COLOR,
    neutralColor = DEFAULT_CHART_LINE_STOCH_SIGNAL_NEUTRAL_COLOR,
    noneColor = DEFAULT_CHART_LINE_STOCH_SIGNAL_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_STOCH_SIGNAL_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_STOCH_SIGNAL_GRID_COLOR,
    bandColor = DEFAULT_CHART_LINE_STOCH_SIGNAL_BAND_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showK = true,
    showD = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBands = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatStoch = defaultFormatStoch,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-stoch-signal-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineStochSignalSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineStochSignalSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineStochSignalLayout({
        data,
        kPeriod,
        dPeriod,
        overboughtThreshold,
        oversoldThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      data,
      kPeriod,
      dPeriod,
      overboughtThreshold,
      oversoldThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineStochSignalChart(data, {
      kPeriod,
      dPeriod,
      overboughtThreshold,
      oversoldThreshold,
    });
  const resolvedLabel =
    ariaLabel ??
    `Stochastic Oscillator chart, kPeriod ${run.kPeriod}, dPeriod ${run.dPeriod}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineStochSignalSeriesId): void => {
    const next = isHidden(id);
    if (hiddenSeries === undefined) {
      setInternalHidden((prev) =>
        prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
      );
    }
    onSeriesToggle?.({ seriesId: id, hidden: !next });
  };

  const handleActivate = (sampleIndex: number): void => {
    const sample = run.samples[sampleIndex];
    if (sample) onPointClick?.({ point: sample });
  };

  const handleKey = (
    event: KeyboardEvent<SVGElement>,
    sampleIndex: number,
  ): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleActivate(sampleIndex);
    }
  };

  const tickValues: number[] = [];
  if (tickCount > 1) {
    for (let i = 0; i < tickCount; i += 1) {
      tickValues.push(i / (tickCount - 1));
    }
  }

  const containerStyle: CSSProperties = {
    display: 'inline-block',
    fontFamily:
      'var(--font-sans, ui-sans-serif, system-ui, -apple-system, sans-serif)',
    ...style,
  };

  const hoverSample =
    hover !== null && run.samples[hover] ? run.samples[hover]! : null;

  let tooltip: ReactNode = null;
  if (showTooltip && hoverSample && !isEmpty) {
    const dot = layout.priceDots[hoverSample.index];
    const anchorX = dot ? dot.cx : (layout.innerLeft + layout.innerRight) / 2;
    const tooltipW = 240;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-stoch-signal-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={102}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-stoch-signal-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-stoch-signal-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-stoch-signal-tooltip-k"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`%K: ${
            hoverSample.k === null ? 'n/a' : formatStoch(hoverSample.k)
          }`}
        </text>
        <text
          data-section="chart-line-stoch-signal-tooltip-d"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`%D: ${
            hoverSample.d === null ? 'n/a' : formatStoch(hoverSample.d)
          }`}
        </text>
        <text
          data-section="chart-line-stoch-signal-tooltip-zone"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const kHidden = isHidden('k') || !showK;
  const dHidden = isHidden('d') || !showD;

  const legendItems: Array<{
    id: ChartLineStochSignalSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'k', label: '%K', color: kColor },
    { id: 'd', label: '%D Signal', color: dColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-stoch-signal"
      data-empty={isEmpty ? 'true' : 'false'}
      data-k-period={run.kPeriod}
      data-d-period={run.dPeriod}
      data-k-final={run.kFinal === null ? '' : run.kFinal}
      data-d-final={run.dFinal === null ? '' : run.dFinal}
      data-overbought-count={run.overboughtCount}
      data-oversold-count={run.oversoldCount}
      data-neutral-count={run.neutralCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-stoch-signal-aria-desc"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {description}
      </span>

      {isEmpty ? (
        <svg
          data-section="chart-line-stoch-signal-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-stoch-signal-empty"
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            fill={axisColor}
            fontSize={13}
          >
            No data
          </text>
        </svg>
      ) : (
        <svg
          data-section="chart-line-stoch-signal-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-stoch-signal-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const ys =
                  layout.stochBottom -
                  t * (layout.stochBottom - layout.stochTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-stoch-signal-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-stoch-signal-grid-line"
                      data-panel="stoch"
                      x1={layout.innerLeft}
                      y1={ys}
                      x2={layout.innerRight}
                      y2={ys}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-stoch-signal-axes">
              <line
                data-section="chart-line-stoch-signal-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stoch-signal-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stoch-signal-axis"
                data-panel="stoch"
                x1={layout.innerLeft}
                y1={layout.stochTop}
                x2={layout.innerLeft}
                y2={layout.stochBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stoch-signal-axis"
                data-panel="stoch"
                x1={layout.innerLeft}
                y1={layout.stochBottom}
                x2={layout.innerRight}
                y2={layout.stochBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-stoch-signal-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.priceTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.priceMax)}
              </text>
              <text
                data-section="chart-line-stoch-signal-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.priceBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.priceMin)}
              </text>
              <text
                data-section="chart-line-stoch-signal-tick-label"
                data-panel="stoch"
                x={layout.innerLeft - 6}
                y={layout.stochTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatStoch(100)}
              </text>
              <text
                data-section="chart-line-stoch-signal-tick-label"
                data-panel="stoch"
                x={layout.innerLeft - 6}
                y={layout.stochBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatStoch(0)}
              </text>
            </g>
          ) : null}

          {showBands ? (
            <g data-section="chart-line-stoch-signal-bands">
              <line
                data-section="chart-line-stoch-signal-overbought-band"
                x1={layout.innerLeft}
                y1={layout.overboughtY}
                x2={layout.innerRight}
                y2={layout.overboughtY}
                stroke={bandColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line
                data-section="chart-line-stoch-signal-oversold-band"
                x1={layout.innerLeft}
                y1={layout.oversoldY}
                x2={layout.innerRight}
                y2={layout.oversoldY}
                stroke={bandColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-stoch-signal-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Close line, ${run.series.length} bars`}
            />
          ) : null}

          {!priceHidden && showDots ? (
            <g data-section="chart-line-stoch-signal-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-stoch-signal-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, close ${formatPrice(
                    dot.close,
                  )}`}
                  onMouseEnter={() => setHover(dot.index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(dot.index)}
                  onBlur={() => setHover(null)}
                  onClick={() => handleActivate(dot.index)}
                  onKeyDown={(e) => handleKey(e, dot.index)}
                />
              ))}
            </g>
          ) : null}

          {!dHidden ? (
            <path
              data-section="chart-line-stoch-signal-d"
              d={layout.dPath}
              fill="none"
              stroke={dColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="D signal line"
            />
          ) : null}

          {!kHidden ? (
            <path
              data-section="chart-line-stoch-signal-line"
              d={layout.kPath}
              fill="none"
              stroke={kColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`%K line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-stoch-signal-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-stoch-signal-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-k={marker.k}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    overboughtColor,
                    neutralColor,
                    oversoldColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, %K ${formatStoch(marker.k)}, ${zoneLabelOf(
                    marker.zone,
                  )}`}
                  onMouseEnter={() => setHover(marker.index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(marker.index)}
                  onBlur={() => setHover(null)}
                  onClick={() => handleActivate(marker.index)}
                  onKeyDown={(e) => handleKey(e, marker.index)}
                />
              ))}
            </g>
          ) : null}

          {showConfigBadge ? (
            <g data-section="chart-line-stoch-signal-badge">
              <rect
                data-section="chart-line-stoch-signal-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={150}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-stoch-signal-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Stochastic ${run.kPeriod}/${run.dPeriod}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-stoch-signal-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            fontSize: 12,
          }}
        >
          {legendItems.map((item) => {
            const hidden = isHidden(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-section="chart-line-stoch-signal-legend-item"
                data-series-id={item.id}
                data-hidden={hidden ? 'true' : 'false'}
                onClick={() => toggleSeries(item.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  opacity: hidden ? 0.4 : 1,
                  color: 'inherit',
                  font: 'inherit',
                }}
                aria-pressed={!hidden}
              >
                <span
                  data-section="chart-line-stoch-signal-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-stoch-signal-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-stoch-signal-legend-stats"
            style={{ color: axisColor }}
          >
            {`overbought ${run.overboughtCount} / neutral ${run.neutralCount} / oversold ${run.oversoldCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineStochSignal.displayName = 'ChartLineStochSignal';
