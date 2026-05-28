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
 * ChartLineVortexViPlus -- pure-SVG dual-panel chart with a
 * Vortex Indicator +VI oscillator beneath the close. +VI
 * measures the positive vortex movement as a fraction of the
 * total true range over the lookback.
 *
 * Definition:
 *
 *   VM+[i] = |high[i] - low[i - 1]|      (i >= 1)
 *   TR[i]  = max(high[i] - low[i],
 *                |high[i] - close[i - 1]|,
 *                |low[i] - close[i - 1]|) (i >= 1)
 *   +VI[i] = sum(VM+, [i - length + 1, i]) /
 *            sum(TR,  [i - length + 1, i])
 *
 * Defaults: `length = 14`. The first bar's VM+ is `null` (no
 * prior low), so +VI is `null` for bars `0 .. length - 1` (the
 * sum window must lie entirely within bars `1 .. n`). When the
 * TR sum is zero (singular: completely flat bars) +VI is `null`.
 *
 * Bit-exact anchor: **CONST_BAR** with constant `high = H`,
 * `low = L`, `close = C` (with `H > L` and `L <= C <= H`).
 * Then `VM+[i] = H - L` and `TR[i] = H - L` at every `i >= 1`,
 * because `TR = max(H - L, |H - C|, |L - C|) = H - L`. The
 * numerator and denominator are both exactly `length * (H - L)`,
 * so `+VI = 1` **bit-exact** past the warmup. CONST_FLAT
 * (`H = L = C`) collapses the sums to zero and yields `null`.
 */

export interface ChartLineVortexViPlusPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineVortexViPlusZone =
  | 'strong-up'
  | 'above'
  | 'below'
  | 'weak'
  | 'none';

export type ChartLineVortexViPlusSeriesId = 'price' | 'viPlus';

export interface ChartLineVortexViPlusSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  viPlus: number | null;
  zone: ChartLineVortexViPlusZone;
}

export interface ChartLineVortexViPlusRun {
  series: ChartLineVortexViPlusPoint[];
  length: number;
  viPlus: Array<number | null>;
  samples: ChartLineVortexViPlusSample[];
  viPlusFinal: number | null;
  strongUpCount: number;
  aboveCount: number;
  belowCount: number;
  weakCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineVortexViPlusMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  viPlus: number;
  zone: ChartLineVortexViPlusZone;
}

export interface ChartLineVortexViPlusDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVortexViPlusLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  viTop: number;
  viBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineVortexViPlusDot[];
  viPlusPath: string;
  markers: ChartLineVortexViPlusMarker[];
  priceMin: number;
  priceMax: number;
  unityLineY: number;
  viMin: number;
  viMax: number;
  run: ChartLineVortexViPlusRun;
}

export interface ChartLineVortexViPlusProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVortexViPlusPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  viPlusColor?: string;
  strongUpColor?: string;
  aboveColor?: string;
  belowColor?: string;
  weakColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  unityLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showViPlus?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showUnityLine?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVortexViPlusSeriesId[];
  defaultHiddenSeries?: ChartLineVortexViPlusSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVortexViPlusSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineVortexViPlusSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatViPlus?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_WIDTH = 720;
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_PADDING = 44;
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_LENGTH = 14;
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_VI_PLUS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_STRONG_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_ABOVE_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_BELOW_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_WEAK_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_UNITY_LINE_COLOR = '#64748b';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineVortexViPlusFinitePoints(
  data: readonly ChartLineVortexViPlusPoint[] | null | undefined,
): ChartLineVortexViPlusPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVortexViPlusPoint[] = [];
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
export function normalizeLineVortexViPlusLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Compute VM+ per bar; `null` at bar 0 (no prior low). */
export function computeLineVortexViPlusVm(
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
      out.push(null);
      continue;
    }
    const prev = bars[i - 1];
    if (!prev || !isFiniteNumber(prev.low)) {
      out.push(null);
      continue;
    }
    out.push(Math.abs(bar.high - prev.low));
  }
  return out;
}

/** Compute true range per bar (bar 0 falls back to `high - low`). */
export function computeLineVortexViPlusTrueRange(
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

/**
 * Rolling sum: emits `null` at bar `i` if the window
 * `[i - length + 1, i]` contains any `null` / non-finite value.
 */
export function applyLineVortexViPlusRollingSum(
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
    out.push(ok ? sum : null);
  }
  return out;
}

export interface ChartLineVortexViPlusOptions {
  length?: number;
}

/**
 * Compute +VI per bar. Bars before `i = length` are `null` (the
 * VM+ sum window must lie in bars `1 .. n`). When the TR sum is
 * zero (singular: completely flat bars) +VI is `null`.
 */
export function computeLineVortexViPlus(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
  options: ChartLineVortexViPlusOptions = {},
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const length = normalizeLineVortexViPlusLength(
    options.length,
    DEFAULT_CHART_LINE_VORTEX_VI_PLUS_LENGTH,
  );
  const vm = computeLineVortexViPlusVm(bars);
  const tr = computeLineVortexViPlusTrueRange(bars);
  const vmSum = applyLineVortexViPlusRollingSum(vm, length);
  const trSum = applyLineVortexViPlusRollingSum(tr, length);
  const out: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const num = vmSum[i];
    const den = trSum[i];
    if (
      num == null ||
      den == null ||
      !isFiniteNumber(num) ||
      !isFiniteNumber(den) ||
      den === 0
    ) {
      out.push(null);
      continue;
    }
    out.push(num / den);
  }
  return out;
}

/** Classify a +VI reading. */
export function classifyLineVortexViPlusZone(
  value: number | null,
): ChartLineVortexViPlusZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= 1.1) return 'strong-up';
  if (value >= 1.0) return 'above';
  if (value > 0.9) return 'below';
  return 'weak';
}

/** Run the full +VI pipeline plus sample classification. */
export function runLineVortexViPlus(
  data: readonly ChartLineVortexViPlusPoint[] | null | undefined,
  options: ChartLineVortexViPlusOptions = {},
): ChartLineVortexViPlusRun {
  const series = getLineVortexViPlusFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineVortexViPlusLength(
    options.length,
    DEFAULT_CHART_LINE_VORTEX_VI_PLUS_LENGTH,
  );
  const viPlus = computeLineVortexViPlus(series, { length });
  const samples: ChartLineVortexViPlusSample[] = series.map((point, index) => {
    const value = viPlus[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      viPlus: value,
      zone: classifyLineVortexViPlusZone(value),
    };
  });
  let strongUpCount = 0;
  let aboveCount = 0;
  let belowCount = 0;
  let weakCount = 0;
  let noneCount = 0;
  let viPlusFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'strong-up') strongUpCount += 1;
    else if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    else if (sample.zone === 'weak') weakCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.viPlus)) viPlusFinal = sample.viPlus;
  }
  return {
    series = [],
    length,
    viPlus,
    samples,
    viPlusFinal,
    strongUpCount,
    aboveCount,
    belowCount,
    weakCount,
    noneCount,
    ok: series.length > length,
  };
}

export interface ChartLineVortexViPlusLayoutOptions
  extends ChartLineVortexViPlusOptions {
  data: readonly ChartLineVortexViPlusPoint[] | null | undefined;
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
export function computeLineVortexViPlusLayout(
  options: ChartLineVortexViPlusLayoutOptions,
): ChartLineVortexViPlusLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_VORTEX_VI_PLUS_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_VORTEX_VI_PLUS_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_VORTEX_VI_PLUS_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_VORTEX_VI_PLUS_PANEL_GAP;

  const run = runLineVortexViPlus(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const viHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const viTop = priceBottom + panelGap;
  const viBottom = viTop + viHeight;

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

  // +VI is naturally non-negative, typically oscillating around 1.
  // Pad to at least [0, 2] for visual context.
  let viMin = 0;
  let viMax = 2;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.viPlus)) {
      if (sample.viPlus < viMin) viMin = sample.viPlus;
      if (sample.viPlus > viMax) viMax = sample.viPlus;
    }
  }
  if (viMin === viMax) {
    viMin -= 1;
    viMax += 1;
  }
  const viY = (value: number): number =>
    viBottom - ((value - viMin) / (viMax - viMin)) * viHeight;
  const unityLineY = viY(1);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineVortexViPlusDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const viLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineVortexViPlusMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.viPlus)) return;
    const cx = xAt(index);
    const yc = viY(sample.viPlus);
    viLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      viPlus: sample.viPlus,
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
    viTop,
    viBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    viPlusPath: buildLinePath(viLinePoints),
    markers,
    priceMin,
    priceMax,
    unityLineY,
    viMin,
    viMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineVortexViPlusChart(
  data: readonly ChartLineVortexViPlusPoint[] | null | undefined,
  options: ChartLineVortexViPlusOptions = {},
): string {
  const run = runLineVortexViPlus(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.viPlusFinal === null ? 'n/a' : run.viPlusFinal.toFixed(4);
  return (
    `Dual-panel chart with a Vortex Indicator +VI oscillator panel ` +
    `beneath the close (length ${run.length}). +VI = ` +
    `sum(|high - prevLow|, length) / sum(trueRange, length), where ` +
    `true range is max(high - low, |high - prevClose|, |low - ` +
    `prevClose|). Across ${total} bars +VI is strongly above the ` +
    `unity line on ${run.strongUpCount}, mildly above unity on ` +
    `${run.aboveCount}, mildly below unity on ${run.belowCount}, ` +
    `weak on ${run.weakCount}, and undefined on ${run.noneCount}. ` +
    `The final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatViPlus(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineVortexViPlusZone,
  strongUpColor: string,
  aboveColor: string,
  belowColor: string,
  weakColor: string,
  noneColor: string,
): string {
  if (zone === 'strong-up') return strongUpColor;
  if (zone === 'above') return aboveColor;
  if (zone === 'below') return belowColor;
  if (zone === 'weak') return weakColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineVortexViPlusZone): string {
  if (zone === 'strong-up') return 'Strong Up';
  if (zone === 'above') return 'Above Unity';
  if (zone === 'below') return 'Below Unity';
  if (zone === 'weak') return 'Weak';
  return 'n/a';
}

/**
 * ChartLineVortexViPlus -- dual-panel pure-SVG Vortex +VI
 * chart.
 */
export const ChartLineVortexViPlus = forwardRef<
  HTMLDivElement,
  ChartLineVortexViPlusProps
>(function ChartLineVortexViPlus(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_LENGTH,
    width = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_WIDTH,
    height = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_HEIGHT,
    padding = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_PADDING,
    panelGap = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_PRICE_COLOR,
    viPlusColor = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_VI_PLUS_COLOR,
    strongUpColor = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_STRONG_UP_COLOR,
    aboveColor = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_BELOW_COLOR,
    weakColor = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_WEAK_COLOR,
    noneColor = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_GRID_COLOR,
    unityLineColor = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_UNITY_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showViPlus = true,
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
    formatViPlus = defaultFormatViPlus,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-vortex-vi-plus-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineVortexViPlusSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineVortexViPlusSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineVortexViPlusLayout({
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
    ariaDescription ?? describeLineVortexViPlusChart(data, { length });
  const resolvedLabel =
    ariaLabel ?? `Vortex +VI chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineVortexViPlusSeriesId): void => {
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
        data-section="chart-line-vortex-vi-plus-tooltip"
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
          data-section="chart-line-vortex-vi-plus-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-vortex-vi-plus-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-vortex-vi-plus-tooltip-range"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatPrice(hoverSample.high)} / ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-vortex-vi-plus-tooltip-vi-plus"
          x={tx + 10}
          y={ty + 67}
          fill="#86efac"
          fontSize={11}
          fontWeight={600}
        >
          {`+VI: ${
            hoverSample.viPlus === null
              ? 'n/a'
              : formatViPlus(hoverSample.viPlus)
          }`}
        </text>
        <text
          data-section="chart-line-vortex-vi-plus-tooltip-zone"
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
  const viPlusHidden = isHidden('viPlus') || !showViPlus;

  const legendItems: Array<{
    id: ChartLineVortexViPlusSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'viPlus', label: '+VI (Vortex)', color: viPlusColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-vortex-vi-plus"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-vi-plus-final={run.viPlusFinal === null ? '' : run.viPlusFinal}
      data-strong-up-count={run.strongUpCount}
      data-above-count={run.aboveCount}
      data-below-count={run.belowCount}
      data-weak-count={run.weakCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-vortex-vi-plus-aria-desc"
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
          data-section="chart-line-vortex-vi-plus-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-vortex-vi-plus-empty"
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
          data-section="chart-line-vortex-vi-plus-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-vortex-vi-plus-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.viBottom - t * (layout.viBottom - layout.viTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-vortex-vi-plus-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-vortex-vi-plus-grid-line"
                      data-panel="vi-plus"
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
            <g data-section="chart-line-vortex-vi-plus-axes">
              <line
                data-section="chart-line-vortex-vi-plus-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-vortex-vi-plus-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-vortex-vi-plus-axis"
                data-panel="vi-plus"
                x1={layout.innerLeft}
                y1={layout.viTop}
                x2={layout.innerLeft}
                y2={layout.viBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-vortex-vi-plus-axis"
                data-panel="vi-plus"
                x1={layout.innerLeft}
                y1={layout.viBottom}
                x2={layout.innerRight}
                y2={layout.viBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-vortex-vi-plus-tick-label"
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
                data-section="chart-line-vortex-vi-plus-tick-label"
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
                data-section="chart-line-vortex-vi-plus-tick-label"
                data-panel="vi-plus"
                x={layout.innerLeft - 6}
                y={layout.viTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatViPlus(layout.viMax)}
              </text>
              <text
                data-section="chart-line-vortex-vi-plus-tick-label"
                data-panel="vi-plus"
                x={layout.innerLeft - 6}
                y={layout.viBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatViPlus(layout.viMin)}
              </text>
            </g>
          ) : null}

          {showUnityLine ? (
            <line
              data-section="chart-line-vortex-vi-plus-unity-line"
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
              data-section="chart-line-vortex-vi-plus-price-path"
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
            <g data-section="chart-line-vortex-vi-plus-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-vortex-vi-plus-dot"
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

          {!viPlusHidden ? (
            <path
              data-section="chart-line-vortex-vi-plus-line"
              d={layout.viPlusPath}
              fill="none"
              stroke={viPlusColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`+VI line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-vortex-vi-plus-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-vortex-vi-plus-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-vi-plus={marker.viPlus}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    strongUpColor,
                    aboveColor,
                    belowColor,
                    weakColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, +VI ${formatViPlus(marker.viPlus)}, ${zoneLabelOf(
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
            <g data-section="chart-line-vortex-vi-plus-badge">
              <rect
                data-section="chart-line-vortex-vi-plus-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={160}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-vortex-vi-plus-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Vortex +VI ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-vortex-vi-plus-legend"
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
                data-section="chart-line-vortex-vi-plus-legend-item"
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
                  data-section="chart-line-vortex-vi-plus-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-vortex-vi-plus-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-vortex-vi-plus-legend-stats"
            style={{ color: axisColor }}
          >
            {`strong ${run.strongUpCount} / above ${run.aboveCount} / below ${run.belowCount} / weak ${run.weakCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineVortexViPlus.displayName = 'ChartLineVortexViPlus';
