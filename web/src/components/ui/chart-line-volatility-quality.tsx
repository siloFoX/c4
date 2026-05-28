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
 * ChartLineVolatilityQuality -- pure-SVG dual-panel chart with
 * the close on the top panel and a Volatility Quality Index
 * (VQI) oscillator beneath. VQI normalizes the EMA-smoothed
 * true range by the rolling ATR:
 *
 *   TR[i]  = max(high - low,
 *                |high - prevClose|,
 *                |low - prevClose|)        // TR[0] = high - low
 *   ATR[i] = SMA(TR, length)[i]
 *   EMA_TR[i] = EMA(TR, length)[i]
 *   VQI[i] = EMA_TR[i] / ATR[i]
 *
 * Defaults: `length = 14`. Bars before `i = length - 1` are
 * warmup (`VQI = null`) because ATR requires `length` TR
 * samples. When `ATR == 0` (singular: completely flat bars) VQI
 * is `null`.
 *
 * Bit-exact anchor: **CONST_BAR** (constant `high = H`, `low =
 * L`, `close = C` with `H > L` and `L <= C <= H`). Every TR is
 * `max(H - L, |H - C|, |L - C|) = H - L` (the gap legs are
 * bounded by the range when `C` lies in `[L, H]`), so:
 *
 *   EMA_TR = EMA(constant H - L) = H - L  (bit-exact in IEEE 754
 *                                          for any K via
 *                                          alpha*K + (1-alpha)*K = K)
 *   ATR    = SMA(constant H - L) = H - L  (bit-exact)
 *   VQI    = (H - L) / (H - L) = 1        (bit-exact)
 *
 * past warmup. The integration sweep verifies this across
 * `(H, L, C, length)`.
 *
 * CONST_FLAT (`H = L = C`) is the singular case: every TR is
 * zero, ATR is zero, and VQI is `null`.
 */

export interface ChartLineVolatilityQualityPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineVolatilityQualityZone =
  | 'expanding'
  | 'above'
  | 'below'
  | 'contracting'
  | 'at'
  | 'none';

export type ChartLineVolatilityQualitySeriesId = 'price' | 'vqi';

export interface ChartLineVolatilityQualitySample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  emaTr: number | null;
  atr: number | null;
  vqi: number | null;
  zone: ChartLineVolatilityQualityZone;
}

export interface ChartLineVolatilityQualityRun {
  series: ChartLineVolatilityQualityPoint[];
  length: number;
  tr: Array<number | null>;
  emaTr: Array<number | null>;
  atr: Array<number | null>;
  vqi: Array<number | null>;
  samples: ChartLineVolatilityQualitySample[];
  vqiFinal: number | null;
  expandingCount: number;
  aboveCount: number;
  belowCount: number;
  contractingCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineVolatilityQualityMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  vqi: number;
  zone: ChartLineVolatilityQualityZone;
}

export interface ChartLineVolatilityQualityDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVolatilityQualityLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  vqiTop: number;
  vqiBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineVolatilityQualityDot[];
  vqiPath: string;
  markers: ChartLineVolatilityQualityMarker[];
  priceMin: number;
  priceMax: number;
  vqiMin: number;
  vqiMax: number;
  unityLineY: number;
  run: ChartLineVolatilityQualityRun;
}

export interface ChartLineVolatilityQualityProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVolatilityQualityPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  vqiColor?: string;
  expandingColor?: string;
  aboveColor?: string;
  belowColor?: string;
  contractingColor?: string;
  atColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  unityLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showVqi?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showUnityLine?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVolatilityQualitySeriesId[];
  defaultHiddenSeries?: ChartLineVolatilityQualitySeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVolatilityQualitySeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineVolatilityQualitySample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatVqi?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_WIDTH = 720;
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_HEIGHT = 460;
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_PADDING = 44;
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_LENGTH = 14;
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_VQI_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_EXPANDING_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_ABOVE_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_BELOW_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_CONTRACTING_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_AT_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VOLATILITY_QUALITY_UNITY_LINE_COLOR = '#64748b';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineVolatilityQualityFinitePoints(
  data: readonly ChartLineVolatilityQualityPoint[] | null | undefined,
): ChartLineVolatilityQualityPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVolatilityQualityPoint[] = [];
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
export function normalizeLineVolatilityQualityLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Single-pass EMA seeded at the first finite value. */
export function applyLineVolatilityQualityEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const alpha = 2 / (length + 1);
  const out: Array<number | null> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || !isFiniteNumber(v)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev === null) {
      out.push(v);
      prev = v;
      continue;
    }
    const e: number = alpha * v + (1 - alpha) * prev;
    out.push(e);
    prev = e;
  }
  return out;
}

/** SMA; nulls in the window null the bar. */
export function applyLineVolatilityQualitySma(
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
    out.push(ok ? sum / length : null);
  }
  return out;
}

/** True range per bar; bar 0 falls back to `high - low`. */
export function computeLineVolatilityQualityTrueRange(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    if (
      !bar ||
      !isFiniteNumber(bar.high) ||
      !isFiniteNumber(bar.low) ||
      !isFiniteNumber(bar.close)
    ) {
      out.push(null);
      continue;
    }
    if (i === 0) {
      out.push(bar.high - bar.low);
      continue;
    }
    const prev = bars[i - 1];
    if (!prev || !isFiniteNumber(prev.close)) {
      out.push(bar.high - bar.low);
      continue;
    }
    const a = bar.high - bar.low;
    const b = Math.abs(bar.high - prev.close);
    const c = Math.abs(bar.low - prev.close);
    out.push(Math.max(a, b, c));
  }
  return out;
}

export interface ChartLineVolatilityQualityOptions {
  length?: number;
}

export interface ChartLineVolatilityQualityChannels {
  tr: Array<number | null>;
  emaTr: Array<number | null>;
  atr: Array<number | null>;
  vqi: Array<number | null>;
}

/**
 * Compute the VQI pipeline per bar. Bars before
 * `i = length - 1` are `null`. When ATR is zero (singular: all
 * bars in the window have zero range) VQI is `null`.
 */
export function computeLineVolatilityQuality(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
  options: ChartLineVolatilityQualityOptions = {},
): ChartLineVolatilityQualityChannels {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { tr: [], emaTr: [], atr: [], vqi: [] };
  }
  const length = normalizeLineVolatilityQualityLength(
    options.length,
    DEFAULT_CHART_LINE_VOLATILITY_QUALITY_LENGTH,
  );
  const tr = computeLineVolatilityQualityTrueRange(bars);
  const emaTr = applyLineVolatilityQualityEma(tr, length);
  const atr = applyLineVolatilityQualitySma(tr, length);
  const vqi: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const e = emaTr[i];
    const a = atr[i];
    if (
      e == null ||
      a == null ||
      !isFiniteNumber(e) ||
      !isFiniteNumber(a) ||
      a === 0
    ) {
      vqi.push(null);
      continue;
    }
    const raw = e / a;
    // Normalize -0 (which would arise from 0 / negative_atr, but
    // ATR is non-negative so this is mostly defensive) to +0.
    vqi.push(raw === 0 ? 0 : raw);
  }
  return { tr, emaTr, atr, vqi };
}

/** Classify a VQI reading relative to the unity baseline. */
export function classifyLineVolatilityQualityZone(
  value: number | null,
): ChartLineVolatilityQualityZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= 1.1) return 'expanding';
  if (value > 1.0) return 'above';
  if (value === 1.0) return 'at';
  if (value > 0.9) return 'below';
  return 'contracting';
}

/** Run the full pipeline plus sample classification. */
export function runLineVolatilityQuality(
  data: readonly ChartLineVolatilityQualityPoint[] | null | undefined,
  options: ChartLineVolatilityQualityOptions = {},
): ChartLineVolatilityQualityRun {
  const series = getLineVolatilityQualityFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineVolatilityQualityLength(
    options.length,
    DEFAULT_CHART_LINE_VOLATILITY_QUALITY_LENGTH,
  );
  const channels = computeLineVolatilityQuality(series, { length });
  const samples: ChartLineVolatilityQualitySample[] = series.map((point, index) => {
    const value = channels.vqi[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      emaTr: channels.emaTr[index] ?? null,
      atr: channels.atr[index] ?? null,
      vqi: value,
      zone: classifyLineVolatilityQualityZone(value),
    };
  });
  let expandingCount = 0;
  let aboveCount = 0;
  let belowCount = 0;
  let contractingCount = 0;
  let atCount = 0;
  let noneCount = 0;
  let vqiFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'expanding') expandingCount += 1;
    else if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    else if (sample.zone === 'contracting') contractingCount += 1;
    else if (sample.zone === 'at') atCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.vqi)) vqiFinal = sample.vqi;
  }
  return {
    series = [],
    length,
    tr: channels.tr,
    emaTr: channels.emaTr,
    atr: channels.atr,
    vqi: channels.vqi,
    samples,
    vqiFinal,
    expandingCount,
    aboveCount,
    belowCount,
    contractingCount,
    atCount,
    noneCount,
    ok: series.length >= length,
  };
}

export interface ChartLineVolatilityQualityLayoutOptions
  extends ChartLineVolatilityQualityOptions {
  data: readonly ChartLineVolatilityQualityPoint[] | null | undefined;
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
export function computeLineVolatilityQualityLayout(
  options: ChartLineVolatilityQualityLayoutOptions,
): ChartLineVolatilityQualityLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_VOLATILITY_QUALITY_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_VOLATILITY_QUALITY_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_VOLATILITY_QUALITY_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_VOLATILITY_QUALITY_PANEL_GAP;

  const run = runLineVolatilityQuality(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const vqiHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const vqiTop = priceBottom + panelGap;
  const vqiBottom = vqiTop + vqiHeight;

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

  // VQI is non-negative and oscillates around 1.
  let vqiMin = 0;
  let vqiMax = 2;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.vqi)) {
      if (sample.vqi < vqiMin) vqiMin = sample.vqi;
      if (sample.vqi > vqiMax) vqiMax = sample.vqi;
    }
  }
  if (vqiMin === vqiMax) {
    vqiMax += 1;
  }
  const vqiY = (value: number): number =>
    vqiBottom - ((value - vqiMin) / (vqiMax - vqiMin)) * vqiHeight;
  const unityLineY = vqiY(1);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineVolatilityQualityDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const vqiLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineVolatilityQualityMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.vqi)) return;
    const cx = xAt(index);
    const yc = vqiY(sample.vqi);
    vqiLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      vqi: sample.vqi,
      zone: sample.zone,
    });
  });

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    vqiTop,
    vqiBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    vqiPath: buildLinePath(vqiLinePoints),
    markers,
    priceMin,
    priceMax,
    vqiMin,
    vqiMax,
    unityLineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineVolatilityQualityChart(
  data: readonly ChartLineVolatilityQualityPoint[] | null | undefined,
  options: ChartLineVolatilityQualityOptions = {},
): string {
  const run = runLineVolatilityQuality(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.vqiFinal === null ? 'n/a' : run.vqiFinal.toFixed(4);
  return (
    `Dual-panel chart with a Volatility Quality Index oscillator ` +
    `panel beneath the close (length ${run.length}). VQI = ` +
    `EMA(trueRange, length) / SMA(trueRange, length). Across ` +
    `${total} bars VQI is expanding (>= 1.1) on ` +
    `${run.expandingCount}, mildly above unity on ${run.aboveCount}, ` +
    `at unity on ${run.atCount}, mildly below unity on ` +
    `${run.belowCount}, contracting (<= 0.9) on ` +
    `${run.contractingCount}, and undefined on ${run.noneCount}. ` +
    `The final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatVqi(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineVolatilityQualityZone,
  expandingColor: string,
  aboveColor: string,
  belowColor: string,
  contractingColor: string,
  atColor: string,
  noneColor: string,
): string {
  if (zone === 'expanding') return expandingColor;
  if (zone === 'above') return aboveColor;
  if (zone === 'below') return belowColor;
  if (zone === 'contracting') return contractingColor;
  if (zone === 'at') return atColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineVolatilityQualityZone): string {
  if (zone === 'expanding') return 'Expanding';
  if (zone === 'above') return 'Above Unity';
  if (zone === 'below') return 'Below Unity';
  if (zone === 'contracting') return 'Contracting';
  if (zone === 'at') return 'At Unity';
  return 'n/a';
}

/** ChartLineVolatilityQuality -- dual-panel pure-SVG chart. */
export const ChartLineVolatilityQuality = forwardRef<
  HTMLDivElement,
  ChartLineVolatilityQualityProps
>(function ChartLineVolatilityQuality(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_LENGTH,
    width = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_WIDTH,
    height = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_HEIGHT,
    padding = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_PADDING,
    panelGap = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_PRICE_COLOR,
    vqiColor = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_VQI_COLOR,
    expandingColor = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_EXPANDING_COLOR,
    aboveColor = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_BELOW_COLOR,
    contractingColor = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_CONTRACTING_COLOR,
    atColor = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_AT_COLOR,
    noneColor = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_GRID_COLOR,
    unityLineColor = DEFAULT_CHART_LINE_VOLATILITY_QUALITY_UNITY_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showVqi = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showUnityLine = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatVqi = defaultFormatVqi,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-volatility-quality-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineVolatilityQualitySeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineVolatilityQualitySeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineVolatilityQualityLayout({
        data,
        length,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, length, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineVolatilityQualityChart(data, { length });
  const resolvedLabel =
    ariaLabel ?? `Volatility Quality Index chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineVolatilityQualitySeriesId): void => {
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
        data-section="chart-line-volatility-quality-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={118}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-volatility-quality-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-volatility-quality-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-volatility-quality-tooltip-range"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatPrice(hoverSample.high)} / ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-volatility-quality-tooltip-vqi"
          x={tx + 10}
          y={ty + 67}
          fill="#7dd3fc"
          fontSize={11}
          fontWeight={600}
        >
          {`VQI: ${
            hoverSample.vqi === null
              ? 'n/a'
              : formatVqi(hoverSample.vqi)
          }`}
        </text>
        <text
          data-section="chart-line-volatility-quality-tooltip-atr"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`emaTR/ATR: ${
            hoverSample.emaTr === null
              ? 'n/a'
              : formatVqi(hoverSample.emaTr)
          } / ${
            hoverSample.atr === null
              ? 'n/a'
              : formatVqi(hoverSample.atr)
          }`}
        </text>
        <text
          data-section="chart-line-volatility-quality-tooltip-zone"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const vqiHidden = isHidden('vqi') || !showVqi;

  const legendItems: Array<{
    id: ChartLineVolatilityQualitySeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'vqi', label: 'VQI', color: vqiColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-volatility-quality"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-vqi-final={run.vqiFinal === null ? '' : run.vqiFinal}
      data-expanding-count={run.expandingCount}
      data-above-count={run.aboveCount}
      data-at-count={run.atCount}
      data-below-count={run.belowCount}
      data-contracting-count={run.contractingCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-volatility-quality-aria-desc"
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
          data-section="chart-line-volatility-quality-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-volatility-quality-empty"
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
          data-section="chart-line-volatility-quality-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-volatility-quality-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.vqiBottom -
                  t * (layout.vqiBottom - layout.vqiTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-volatility-quality-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-volatility-quality-grid-line"
                      data-panel="vqi"
                      x1={layout.innerLeft}
                      y1={yk}
                      x2={layout.innerRight}
                      y2={yk}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-volatility-quality-axes">
              <line
                data-section="chart-line-volatility-quality-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-volatility-quality-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-volatility-quality-axis"
                data-panel="vqi"
                x1={layout.innerLeft}
                y1={layout.vqiTop}
                x2={layout.innerLeft}
                y2={layout.vqiBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-volatility-quality-axis"
                data-panel="vqi"
                x1={layout.innerLeft}
                y1={layout.vqiBottom}
                x2={layout.innerRight}
                y2={layout.vqiBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-volatility-quality-tick-label"
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
                data-section="chart-line-volatility-quality-tick-label"
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
                data-section="chart-line-volatility-quality-tick-label"
                data-panel="vqi"
                x={layout.innerLeft - 6}
                y={layout.vqiTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatVqi(layout.vqiMax)}
              </text>
              <text
                data-section="chart-line-volatility-quality-tick-label"
                data-panel="vqi"
                x={layout.innerLeft - 6}
                y={layout.vqiBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatVqi(layout.vqiMin)}
              </text>
            </g>
          ) : null}

          {showUnityLine ? (
            <line
              data-section="chart-line-volatility-quality-unity-line"
              x1={layout.innerLeft}
              y1={layout.unityLineY}
              x2={layout.innerRight}
              y2={layout.unityLineY}
              stroke={unityLineColor}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-volatility-quality-price-path"
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
            <g data-section="chart-line-volatility-quality-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-volatility-quality-dot"
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

          {!vqiHidden ? (
            <path
              data-section="chart-line-volatility-quality-line"
              d={layout.vqiPath}
              fill="none"
              stroke={vqiColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`VQI line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-volatility-quality-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-volatility-quality-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-vqi={marker.vqi}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    expandingColor,
                    aboveColor,
                    belowColor,
                    contractingColor,
                    atColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, VQI ${formatVqi(marker.vqi)}, ${zoneLabelOf(
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
            <g data-section="chart-line-volatility-quality-badge">
              <rect
                data-section="chart-line-volatility-quality-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={160}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-volatility-quality-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`VQI ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-volatility-quality-legend"
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
                data-section="chart-line-volatility-quality-legend-item"
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
                  data-section="chart-line-volatility-quality-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-volatility-quality-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-volatility-quality-legend-stats"
            style={{ color: axisColor }}
          >
            {`expanding ${run.expandingCount} / above ${run.aboveCount} / below ${run.belowCount} / contracting ${run.contractingCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineVolatilityQuality.displayName = 'ChartLineVolatilityQuality';
