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
 * ChartLineKvo -- pure-SVG dual-panel chart with a Klinger
 * Volume Oscillator panel beneath the close.
 *
 * Definition (Stephen Klinger):
 *
 *   T[i]      = (high[i] + low[i] + close[i]) / 3       (typical price)
 *   trend[i]  = +1 if T[i] > T[i - 1]
 *               -1 if T[i] < T[i - 1]
 *               trend[i - 1] otherwise (carry forward)
 *   dm[i]     = high[i] - low[i]
 *   cm[i]     = cm[i - 1] + dm[i] when trend[i] == trend[i - 1]
 *               dm[i - 1] + dm[i] otherwise
 *   vf[i]     = volume[i] * |2 * (dm[i] / cm[i]) - 1|
 *               * trend[i] * 100
 *   KVO[i]    = EMA(vf, fast)[i] - EMA(vf, slow)[i]
 *
 * Defaults: `fast = 34`, `slow = 55`. The EMA uses
 * `alpha = 2 / (length + 1)` and seeds with the first value.
 * The first bar has no prior reference: `trend[0] = 0`,
 * `cm[0] = dm[0]`, `vf[0] = 0`. When `cm[i] == 0` (singular,
 * possible only when dm[i] == 0 throughout the trend run)
 * `vf[i] = 0`.
 *
 * Bit-exact anchor:
 *
 *   * **ZERO_VOLUME (volume == 0 at every bar)**: `vf = 0` at
 *     every bar regardless of price action, both EMAs of zero
 *     are zero, so `KVO = 0` bit-exact at every bar past the
 *     seed.
 *   * **CONST_OHLC (open = high = low = close = K)**: T is
 *     constant -> trend = 0 every bar after the seed; dm = 0;
 *     vf = 0; KVO = 0 bit-exact.
 *
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots the KVO with a zero
 * baseline.
 */

export interface ChartLineKvoPoint {
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartLineKvoZone = 'positive' | 'flat' | 'negative' | 'none';

export type ChartLineKvoSeriesId = 'price' | 'kvo';

export interface ChartLineKvoSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vf: number | null;
  kvo: number | null;
  zone: ChartLineKvoZone;
}

export interface ChartLineKvoRun {
  series: ChartLineKvoPoint[];
  fast: number;
  slow: number;
  vf: Array<number | null>;
  kvo: Array<number | null>;
  samples: ChartLineKvoSample[];
  kvoFinal: number | null;
  positiveCount: number;
  flatCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineKvoMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  kvo: number;
  zone: ChartLineKvoZone;
}

export interface ChartLineKvoDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineKvoLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  kvoTop: number;
  kvoBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineKvoDot[];
  kvoPath: string;
  markers: ChartLineKvoMarker[];
  priceMin: number;
  priceMax: number;
  kvoMin: number;
  kvoMax: number;
  zeroLineY: number;
  run: ChartLineKvoRun;
}

export interface ChartLineKvoProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineKvoPoint[];
  fast?: number;
  slow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kvoColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  flatColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showKvo?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZeroLine?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineKvoSeriesId[];
  defaultHiddenSeries?: ChartLineKvoSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineKvoSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineKvoSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatKvo?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_KVO_WIDTH = 720;
export const DEFAULT_CHART_LINE_KVO_HEIGHT = 460;
export const DEFAULT_CHART_LINE_KVO_PADDING = 44;
export const DEFAULT_CHART_LINE_KVO_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_KVO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KVO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KVO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KVO_FAST = 34;
export const DEFAULT_CHART_LINE_KVO_SLOW = 55;
export const DEFAULT_CHART_LINE_KVO_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KVO_KVO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_KVO_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_KVO_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_KVO_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_KVO_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_KVO_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KVO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_KVO_ZERO_LINE_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC and volume. */
export function getLineKvoFinitePoints(
  data: readonly ChartLineKvoPoint[] | null | undefined,
): ChartLineKvoPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineKvoPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume)
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: point.volume,
      });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineKvoLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * Compute the Klinger Volume Force per bar (full pipeline:
 * typical price, trend, dm/cm accumulation). The first bar has
 * `vf = 0` since there is no prior reference. Non-finite OHLC
 * or volume nulls the bar but preserves the prior state.
 */
export function computeLineKvoVolumeForce(
  bars: ReadonlyArray<{ high: number; low: number; close: number; volume: number }> | null | undefined,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const out: Array<number | null> = [];
  let prevT: number | null = null;
  let prevDm = 0;
  let prevTrend = 0;
  let cm = 0;
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    if (
      !bar ||
      !isFiniteNumber(bar.high) ||
      !isFiniteNumber(bar.low) ||
      !isFiniteNumber(bar.close) ||
      !isFiniteNumber(bar.volume)
    ) {
      out.push(null);
      continue;
    }
    const T = (bar.high + bar.low + bar.close) / 3;
    const dm = bar.high - bar.low;
    let trend: number;
    if (prevT === null) {
      trend = 0;
      cm = dm;
    } else if (T > prevT) {
      trend = 1;
      if (trend === prevTrend) cm += dm;
      else cm = prevDm + dm;
    } else if (T < prevT) {
      trend = -1;
      if (trend === prevTrend) cm += dm;
      else cm = prevDm + dm;
    } else {
      trend = prevTrend;
      if (trend === prevTrend) cm += dm;
      else cm = prevDm + dm;
    }
    let vf: number;
    if (cm === 0 || !isFiniteNumber(cm)) {
      vf = 0;
    } else {
      vf = bar.volume * Math.abs(2 * (dm / cm) - 1) * trend * 100;
    }
    out.push(vf);
    prevT = T;
    prevDm = dm;
    prevTrend = trend;
  }
  return out;
}

/**
 * Single-pass EMA seeded at the first finite value.
 *
 *   alpha = 2 / (length + 1)
 *   ema[0] = x[0]
 *   ema[i] = alpha * x[i] + (1 - alpha) * ema[i - 1]
 */
export function computeLineKvoEma(
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

export interface ChartLineKvoOptions {
  fast?: number;
  slow?: number;
}

/**
 * Compute the Klinger Volume Oscillator per bar:
 * `KVO = EMA(vf, fast) - EMA(vf, slow)`.
 */
export function computeLineKvo(
  bars: ReadonlyArray<{ high: number; low: number; close: number; volume: number }> | null | undefined,
  options: ChartLineKvoOptions = {},
): { vf: Array<number | null>; kvo: Array<number | null> } {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { vf: [], kvo: [] };
  }
  const fast = normalizeLineKvoLength(options.fast, DEFAULT_CHART_LINE_KVO_FAST);
  const slow = normalizeLineKvoLength(options.slow, DEFAULT_CHART_LINE_KVO_SLOW);
  const vf = computeLineKvoVolumeForce(bars);
  const emaFast = computeLineKvoEma(vf, fast);
  const emaSlow = computeLineKvoEma(vf, slow);
  const kvo: Array<number | null> = vf.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (
      f === null ||
      f === undefined ||
      s === null ||
      s === undefined ||
      !isFiniteNumber(f) ||
      !isFiniteNumber(s)
    ) {
      return null;
    }
    return f - s;
  });
  return { vf, kvo };
}

/** Classify a KVO reading. */
export function classifyLineKvoZone(value: number | null): ChartLineKvoZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'flat';
}

/** Run the full KVO pipeline plus sample classification. */
export function runLineKvo(
  data: readonly ChartLineKvoPoint[] | null | undefined,
  options: ChartLineKvoOptions = {},
): ChartLineKvoRun {
  const series = getLineKvoFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const fast = normalizeLineKvoLength(options.fast, DEFAULT_CHART_LINE_KVO_FAST);
  const slow = normalizeLineKvoLength(options.slow, DEFAULT_CHART_LINE_KVO_SLOW);
  const { vf, kvo } = computeLineKvo(series, { fast, slow });
  const samples: ChartLineKvoSample[] = series.map((point, index) => {
    const kv = kvo[index] ?? null;
    const vfi = vf[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
      vf: vfi,
      kvo: kv,
      zone: classifyLineKvoZone(kv),
    };
  });
  let positiveCount = 0;
  let flatCount = 0;
  let negativeCount = 0;
  let kvoFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.kvo)) kvoFinal = sample.kvo;
  }
  return {
    series,
    fast,
    slow,
    vf,
    kvo,
    samples,
    kvoFinal,
    positiveCount,
    flatCount,
    negativeCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineKvoLayoutOptions extends ChartLineKvoOptions {
  data: readonly ChartLineKvoPoint[] | null | undefined;
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
export function computeLineKvoLayout(
  options: ChartLineKvoLayoutOptions,
): ChartLineKvoLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_KVO_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_KVO_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_KVO_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_KVO_PANEL_GAP;

  const run = runLineKvo(options.data, {
    ...(options.fast !== undefined ? { fast: options.fast } : {}),
    ...(options.slow !== undefined ? { slow: options.slow } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const kvoHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const kvoTop = priceBottom + panelGap;
  const kvoBottom = kvoTop + kvoHeight;

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

  let kvoMin = Infinity;
  let kvoMax = -Infinity;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.kvo)) {
      if (sample.kvo < kvoMin) kvoMin = sample.kvo;
      if (sample.kvo > kvoMax) kvoMax = sample.kvo;
    }
  }
  if (!Number.isFinite(kvoMin) || !Number.isFinite(kvoMax)) {
    kvoMin = -1;
    kvoMax = 1;
  }
  if (kvoMin === kvoMax) {
    kvoMin -= 1;
    kvoMax += 1;
  }
  if (kvoMin > 0) kvoMin = 0;
  if (kvoMax < 0) kvoMax = 0;
  const kvoY = (value: number): number =>
    kvoBottom - ((value - kvoMin) / (kvoMax - kvoMin)) * kvoHeight;
  const zeroLineY = kvoY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineKvoDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const kvoLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineKvoMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.kvo)) return;
    const cx = xAt(index);
    const yc = kvoY(sample.kvo);
    kvoLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      kvo: sample.kvo,
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
    kvoTop,
    kvoBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    kvoPath: buildLinePath(kvoLinePoints),
    markers,
    priceMin,
    priceMax,
    kvoMin,
    kvoMax,
    zeroLineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineKvoChart(
  data: readonly ChartLineKvoPoint[] | null | undefined,
  options: ChartLineKvoOptions = {},
): string {
  const run = runLineKvo(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.kvoFinal === null ? 'n/a' : run.kvoFinal.toFixed(4);
  return (
    `Dual-panel chart with a Klinger Volume Oscillator panel ` +
    `beneath the close (fast ${run.fast}, slow ${run.slow}). The ` +
    `KVO is the difference between two exponential moving ` +
    `averages of the signed volume force, where the volume force ` +
    `applies a trend-following sign to the volume scaled by the ` +
    `bar range relative to its cumulative range. Across ${total} ` +
    `bars the KVO is positive on ${run.positiveCount}, flat on ` +
    `${run.flatCount}, and negative on ${run.negativeCount}. The ` +
    `final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatKvo(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineKvoZone,
  positiveColor: string,
  negativeColor: string,
  flatColor: string,
  noneColor: string,
): string {
  if (zone === 'positive') return positiveColor;
  if (zone === 'negative') return negativeColor;
  if (zone === 'flat') return flatColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineKvoZone): string {
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineKvo -- dual-panel pure-SVG Klinger Volume Oscillator
 * chart.
 */
export const ChartLineKvo = forwardRef<HTMLDivElement, ChartLineKvoProps>(
  function ChartLineKvo(props, ref) {
    const {
      data,
      fast = DEFAULT_CHART_LINE_KVO_FAST,
      slow = DEFAULT_CHART_LINE_KVO_SLOW,
      width = DEFAULT_CHART_LINE_KVO_WIDTH,
      height = DEFAULT_CHART_LINE_KVO_HEIGHT,
      padding = DEFAULT_CHART_LINE_KVO_PADDING,
      panelGap = DEFAULT_CHART_LINE_KVO_PANEL_GAP,
      tickCount = DEFAULT_CHART_LINE_KVO_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_KVO_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_KVO_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_KVO_PRICE_COLOR,
      kvoColor = DEFAULT_CHART_LINE_KVO_KVO_COLOR,
      positiveColor = DEFAULT_CHART_LINE_KVO_POSITIVE_COLOR,
      negativeColor = DEFAULT_CHART_LINE_KVO_NEGATIVE_COLOR,
      flatColor = DEFAULT_CHART_LINE_KVO_FLAT_COLOR,
      noneColor = DEFAULT_CHART_LINE_KVO_NONE_COLOR,
      axisColor = DEFAULT_CHART_LINE_KVO_AXIS_COLOR,
      gridColor = DEFAULT_CHART_LINE_KVO_GRID_COLOR,
      zeroLineColor = DEFAULT_CHART_LINE_KVO_ZERO_LINE_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showKvo = true,
      showMarkers = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      showZeroLine = true,
      animate = true,
      hiddenSeries,
      defaultHiddenSeries,
      onSeriesToggle,
      onPointClick,
      formatPrice = defaultFormatPrice,
      formatKvo = defaultFormatKvo,
      formatX = defaultFormatX,
      ariaLabel,
      ariaDescription,
      className,
      style,
      ...svgProps
    } = props;

    const reactId = useId();
    const baseId = `chart-line-kvo-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<
      ChartLineKvoSeriesId[]
    >(defaultHiddenSeries ?? []);
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineKvoSeriesId): boolean =>
      hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineKvoLayout({
          data,
          fast,
          slow,
          width,
          height,
          padding,
          panelGap,
        }),
      [data, fast, slow, width, height, padding, panelGap],
    );

    const run = layout.run;
    const description =
      ariaDescription ?? describeLineKvoChart(data, { fast, slow });
    const resolvedLabel =
      ariaLabel ??
      `Klinger Volume Oscillator chart, fast ${run.fast}, slow ${run.slow}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineKvoSeriesId): void => {
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
      const anchorX = dot
        ? dot.cx
        : (layout.innerLeft + layout.innerRight) / 2;
      const tooltipW = 240;
      const rawX = anchorX + 12;
      const tx = Math.min(rawX, layout.width - tooltipW - 4);
      const ty = layout.priceTop + 6;
      tooltip = (
        <g data-section="chart-line-kvo-tooltip" pointerEvents="none">
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
            data-section="chart-line-kvo-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-kvo-tooltip-close"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Close: ${formatPrice(hoverSample.close)}`}
          </text>
          <text
            data-section="chart-line-kvo-tooltip-volume"
            x={tx + 10}
            y={ty + 51}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Volume: ${formatKvo(hoverSample.volume)}`}
          </text>
          <text
            data-section="chart-line-kvo-tooltip-kvo"
            x={tx + 10}
            y={ty + 67}
            fill="#c4b5fd"
            fontSize={11}
            fontWeight={600}
          >
            {`KVO: ${
              hoverSample.kvo === null ? 'n/a' : formatKvo(hoverSample.kvo)
            }`}
          </text>
          <text
            data-section="chart-line-kvo-tooltip-zone"
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
    const kvoHidden = isHidden('kvo') || !showKvo;

    const legendItems: Array<{
      id: ChartLineKvoSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Close', color: priceColor },
      { id: 'kvo', label: 'KVO', color: kvoColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-kvo"
        data-empty={isEmpty ? 'true' : 'false'}
        data-fast={run.fast}
        data-slow={run.slow}
        data-kvo-final={run.kvoFinal === null ? '' : run.kvoFinal}
        data-positive-count={run.positiveCount}
        data-flat-count={run.flatCount}
        data-negative-count={run.negativeCount}
        data-total-points={run.series.length}
        data-animate={animate ? 'true' : 'false'}
        role="region"
        aria-label={resolvedLabel}
        aria-describedby={descId}
      >
        <span
          id={descId}
          data-section="chart-line-kvo-aria-desc"
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
            data-section="chart-line-kvo-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-kvo-empty"
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
            data-section="chart-line-kvo-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-kvo-grid">
                {tickValues.map((t, i) => {
                  const yp =
                    layout.priceBottom -
                    t * (layout.priceBottom - layout.priceTop);
                  const yk =
                    layout.kvoBottom - t * (layout.kvoBottom - layout.kvoTop);
                  return (
                    <g key={`g-${i}`}>
                      <line
                        data-section="chart-line-kvo-grid-line"
                        data-panel="price"
                        x1={layout.innerLeft}
                        y1={yp}
                        x2={layout.innerRight}
                        y2={yp}
                        stroke={gridColor}
                        strokeWidth={1}
                      />
                      <line
                        data-section="chart-line-kvo-grid-line"
                        data-panel="kvo"
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
              <g data-section="chart-line-kvo-axes">
                <line
                  data-section="chart-line-kvo-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.priceTop}
                  x2={layout.innerLeft}
                  y2={layout.priceBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-kvo-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.priceBottom}
                  x2={layout.innerRight}
                  y2={layout.priceBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-kvo-axis"
                  data-panel="kvo"
                  x1={layout.innerLeft}
                  y1={layout.kvoTop}
                  x2={layout.innerLeft}
                  y2={layout.kvoBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-kvo-axis"
                  data-panel="kvo"
                  x1={layout.innerLeft}
                  y1={layout.kvoBottom}
                  x2={layout.innerRight}
                  y2={layout.kvoBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-kvo-tick-label"
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
                  data-section="chart-line-kvo-tick-label"
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
                  data-section="chart-line-kvo-tick-label"
                  data-panel="kvo"
                  x={layout.innerLeft - 6}
                  y={layout.kvoTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatKvo(layout.kvoMax)}
                </text>
                <text
                  data-section="chart-line-kvo-tick-label"
                  data-panel="kvo"
                  x={layout.innerLeft - 6}
                  y={layout.kvoBottom}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatKvo(layout.kvoMin)}
                </text>
              </g>
            ) : null}

            {showZeroLine ? (
              <line
                data-section="chart-line-kvo-zero-line"
                x1={layout.innerLeft}
                y1={layout.zeroLineY}
                x2={layout.innerRight}
                y2={layout.zeroLineY}
                stroke={zeroLineColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ) : null}

            {!priceHidden ? (
              <path
                data-section="chart-line-kvo-price-path"
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
              <g data-section="chart-line-kvo-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-kvo-dot"
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

            {!kvoHidden ? (
              <path
                data-section="chart-line-kvo-line"
                d={layout.kvoPath}
                fill="none"
                stroke={kvoColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`KVO line, ${layout.markers.length} points`}
              />
            ) : null}

            {showMarkers ? (
              <g data-section="chart-line-kvo-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-kvo-marker"
                    data-zone={marker.zone}
                    data-close={marker.close}
                    data-kvo={marker.kvo}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={zoneColorOf(
                      marker.zone,
                      positiveColor,
                      negativeColor,
                      flatColor,
                      noneColor,
                    )}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                      marker.close,
                    )}, KVO ${formatKvo(marker.kvo)}, ${zoneLabelOf(
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
              <g data-section="chart-line-kvo-badge">
                <rect
                  data-section="chart-line-kvo-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.priceTop + 4}
                  width={130}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-kvo-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.priceTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`KVO ${run.fast}/${run.slow}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-kvo-legend"
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
                  data-section="chart-line-kvo-legend-item"
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
                    data-section="chart-line-kvo-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-kvo-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-kvo-legend-stats"
              style={{ color: axisColor }}
            >
              {`positive ${run.positiveCount} / flat ${run.flatCount} / negative ${run.negativeCount}`}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineKvo.displayName = 'ChartLineKvo';
