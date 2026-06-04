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
 * ChartLineWilliamsVixFix -- pure-SVG two-panel Williams VIX Fix
 * chart (Larry Williams).
 *
 * The Williams VIX Fix mimics the volatility-spike profile of the
 * VIX from price data alone. For each bar `i >= period - 1`:
 *
 *   hh(close, period)[i] = max(close over [i - period + 1, i])
 *   WVF[i]               = 100 * (hh[i] - low[i]) / hh[i]
 *
 * The first `period - 1` bars are null; a bar with a non-positive
 * `hh` is also null.
 *
 * Three bit-exact anchors hold on integer fixtures:
 *
 *   * `CONST_FLAT (low == close == K)` -> `hh == K`, so `WVF =
 *     100 * (K - K) / K = 0` bit-exact at every defined bar.
 *   * `RISING (low == close == i + 10)` -> `hh = i + 10 = low`,
 *     so `WVF = 0` bit-exact at every defined bar.
 *   * `SPIKE_50 (close == 20 constant, low spikes to 10 at the
 *     last bar)` -> `hh = 20`, `low = 10`, `WVF = 100 * 10 / 20
 *     = 50` bit-exact at that bar.
 *
 * The top panel plots the close; the bottom panel plots the
 * WVF in a fixed `[0, max]` band with a `threshold` dashed line
 * that marks the typical "fear spike" zone.
 */

export interface ChartLineWilliamsVixFixPoint {
  x: number;
  low: number;
  close: number;
}

export type ChartLineWilliamsVixFixZone =
  | 'spike'
  | 'elevated'
  | 'normal'
  | 'zero'
  | 'none';

export type ChartLineWilliamsVixFixSeriesId = 'price' | 'wvf';

export interface ChartLineWilliamsVixFixSample {
  index: number;
  x: number;
  low: number;
  close: number;
  wvf: number | null;
  zone: ChartLineWilliamsVixFixZone;
}

export interface ChartLineWilliamsVixFixRun {
  series: ChartLineWilliamsVixFixPoint[];
  period: number;
  threshold: number;
  wvf: Array<number | null>;
  samples: ChartLineWilliamsVixFixSample[];
  wvfFinal: number | null;
  wvfMax: number | null;
  spikeCount: number;
  elevatedCount: number;
  normalCount: number;
  zeroCount: number;
  ok: boolean;
}

export interface ChartLineWilliamsVixFixMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  wvf: number;
  zone: ChartLineWilliamsVixFixZone;
}

export interface ChartLineWilliamsVixFixDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineWilliamsVixFixLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  wvfPanelTop: number;
  wvfPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineWilliamsVixFixDot[];
  wvfPath: string;
  markers: ChartLineWilliamsVixFixMarker[];
  thresholdY: number;
  zeroY: number;
  priceMin: number;
  priceMax: number;
  wvfMin: number;
  wvfMax: number;
  run: ChartLineWilliamsVixFixRun;
}

export interface ChartLineWilliamsVixFixProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineWilliamsVixFixPoint[];
  period?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  wvfColor?: string;
  spikeColor?: string;
  elevatedColor?: string;
  normalColor?: string;
  zeroColor?: string;
  noneColor?: string;
  thresholdColor?: string;
  axisZeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showWvf?: boolean;
  showThresholdLine?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineWilliamsVixFixSeriesId[];
  defaultHiddenSeries?: ChartLineWilliamsVixFixSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineWilliamsVixFixSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineWilliamsVixFixSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_WIDTH = 720;
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_HEIGHT = 400;
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_PADDING = 44;
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_GAP = 12;
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_PERIOD = 22;
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_THRESHOLD = 16;
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_WVF_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_SPIKE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_ELEVATED_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_NORMAL_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_ZERO_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_AXIS_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `low`, and `close`. */
export function getLineWilliamsVixFixFinitePoints(
  data: readonly ChartLineWilliamsVixFixPoint[] | null | undefined,
): ChartLineWilliamsVixFixPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineWilliamsVixFixPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
    ) {
      out.push({ x: point.x, low: point.low, close: point.close });
    }
  }
  return out;
}

/** Coerce the lookback period to an integer of at least 1. */
export function normalizeLineWilliamsVixFixPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/** Coerce the spike threshold to a positive finite. */
export function normalizeLineWilliamsVixFixThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0) return threshold;
  return fallback;
}

/**
 * Run the WVF pipeline per bar. The first `period - 1` bars are
 * null; bars whose lookback contains a non-finite close, a
 * non-finite low, or whose highest close is non-positive are also
 * null.
 */
export function computeLineWilliamsVixFix(
  bars: readonly ChartLineWilliamsVixFixPoint[] | null | undefined,
  period: unknown,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const p = normalizeLineWilliamsVixFixPeriod(
    period,
    DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_PERIOD,
  );
  const out: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < p - 1) {
      out.push(null);
      continue;
    }
    const bar = bars[i];
    if (!bar || !isFiniteNumber(bar.low)) {
      out.push(null);
      continue;
    }
    let hh = -Infinity;
    let ok = true;
    for (let j = i - p + 1; j <= i; j += 1) {
      const b = bars[j];
      if (!b || !isFiniteNumber(b.close)) {
        ok = false;
        break;
      }
      if (b.close > hh) hh = b.close;
    }
    if (!ok || hh <= 0) {
      out.push(null);
      continue;
    }
    out.push((100 * (hh - bar.low)) / hh);
  }
  return out;
}

/** Classify a WVF reading against the threshold ladder. */
export function classifyLineWilliamsVixFixZone(
  value: number | null,
  threshold: number,
): ChartLineWilliamsVixFixZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value === 0) return 'zero';
  if (value >= threshold * 2) return 'spike';
  if (value >= threshold) return 'elevated';
  return 'normal';
}

export interface ChartLineWilliamsVixFixOptions {
  period?: number;
  threshold?: number;
}

/** Run the full WVF pipeline plus sample classification. */
export function runLineWilliamsVixFix(
  data: readonly ChartLineWilliamsVixFixPoint[] | null | undefined,
  options: ChartLineWilliamsVixFixOptions = {},
): ChartLineWilliamsVixFixRun {
  const series = getLineWilliamsVixFixFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineWilliamsVixFixPeriod(
    options.period,
    DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_PERIOD,
  );
  const threshold = normalizeLineWilliamsVixFixThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_THRESHOLD,
  );
  const wvf = computeLineWilliamsVixFix(series, period);
  const samples: ChartLineWilliamsVixFixSample[] = series.map((point, index) => {
    const value = wvf[index] ?? null;
    return {
      index,
      x: point.x,
      low: point.low,
      close: point.close,
      wvf: value,
      zone: classifyLineWilliamsVixFixZone(value, threshold),
    };
  });
  let spikeCount = 0;
  let elevatedCount = 0;
  let normalCount = 0;
  let zeroCount = 0;
  let wvfFinal: number | null = null;
  let wvfMax: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'spike') spikeCount += 1;
    else if (sample.zone === 'elevated') elevatedCount += 1;
    else if (sample.zone === 'normal') normalCount += 1;
    else if (sample.zone === 'zero') zeroCount += 1;
    if (isFiniteNumber(sample.wvf)) {
      wvfFinal = sample.wvf;
      if (wvfMax === null || sample.wvf > wvfMax) wvfMax = sample.wvf;
    }
  }
  return {
    series,
    period,
    threshold,
    wvf,
    samples,
    wvfFinal,
    wvfMax,
    spikeCount,
    elevatedCount,
    normalCount,
    zeroCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineWilliamsVixFixLayoutOptions
  extends ChartLineWilliamsVixFixOptions {
  data: readonly ChartLineWilliamsVixFixPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
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

/** Project the run into a two-panel SVG layout. */
export function computeLineWilliamsVixFixLayout(
  options: ChartLineWilliamsVixFixLayoutOptions,
): ChartLineWilliamsVixFixLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineWilliamsVixFix(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.threshold !== undefined
      ? { threshold: options.threshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;
  const innerWidth = innerRight - innerLeft;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const wvfPanelTop = pricePanelBottom + gap;
  const wvfPanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    wvfPanelBottom - wvfPanelTop > 0;
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
  const priceYAt = (value: number): number =>
    pricePanelBottom -
    ((value - priceMin) / (priceMax - priceMin)) * pricePanelHeight;

  const wvfMin = 0;
  const wvfCeiling = Math.max(
    run.threshold * 2,
    run.wvfMax === null ? run.threshold * 2 : run.wvfMax,
  );
  const wvfMax = wvfCeiling > 0 ? wvfCeiling : 1;
  const wvfPanelHeight = wvfPanelBottom - wvfPanelTop;
  const wvfYAt = (value: number): number =>
    wvfPanelBottom - ((value - wvfMin) / (wvfMax - wvfMin)) * wvfPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineWilliamsVixFixDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const wvfLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineWilliamsVixFixMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.wvf)) return;
    const cx = xAt(index);
    const cy = wvfYAt(sample.wvf);
    wvfLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      wvf: sample.wvf,
      zone: sample.zone,
    });
  });

  return {
    ok,
    width,
    height,
    padding,
    gap,
    pricePanelTop,
    pricePanelBottom,
    wvfPanelTop,
    wvfPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    wvfPath: buildLinePath(wvfLinePoints),
    markers,
    thresholdY: wvfYAt(run.threshold),
    zeroY: wvfYAt(0),
    priceMin,
    priceMax,
    wvfMin,
    wvfMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineWilliamsVixFixChart(
  data: readonly ChartLineWilliamsVixFixPoint[] | null | undefined,
  options: ChartLineWilliamsVixFixOptions = {},
): string {
  const run = runLineWilliamsVixFix(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.wvfFinal === null ? 'n/a' : run.wvfFinal.toFixed(3);
  return (
    `Two-panel chart with a Larry Williams VIX Fix panel (period ` +
    `${run.period}, threshold ${run.threshold}): the top panel ` +
    `plots the close, the bottom panel plots the WVF as 100 * ` +
    `(highest close in the lookback - low) / highest close. A ` +
    `constant series reads zero (the highest close equals the ` +
    `bar low). A bar low that drops to half the highest close ` +
    `reads 50. Across ${total} bars the WVF spikes ` +
    `(>= ${run.threshold * 2}) on ${run.spikeCount}, reads ` +
    `elevated (>= ${run.threshold}) on ${run.elevatedCount}, ` +
    `normal (> 0) on ${run.normalCount}, and exactly zero on ` +
    `${run.zeroCount}. The final reading is ${finalText}.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineWilliamsVixFixZone,
  spikeColor: string,
  elevatedColor: string,
  normalColor: string,
  zeroColor: string,
  noneColor: string,
): string {
  if (zone === 'spike') return spikeColor;
  if (zone === 'elevated') return elevatedColor;
  if (zone === 'normal') return normalColor;
  if (zone === 'zero') return zeroColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineWilliamsVixFixZone): string {
  if (zone === 'spike') return 'Spike';
  if (zone === 'elevated') return 'Elevated';
  if (zone === 'normal') return 'Normal';
  if (zone === 'zero') return 'Zero';
  return 'n/a';
}

/**
 * ChartLineWilliamsVixFix -- two-panel pure-SVG Williams VIX Fix
 * chart.
 */
export const ChartLineWilliamsVixFix = forwardRef<
  HTMLDivElement,
  ChartLineWilliamsVixFixProps
>(function ChartLineWilliamsVixFix(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_PERIOD,
    threshold = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_THRESHOLD,
    width = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_WIDTH,
    height = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_HEIGHT,
    padding = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_PADDING,
    gap = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_GAP,
    tickCount = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_PRICE_COLOR,
    wvfColor = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_WVF_COLOR,
    spikeColor = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_SPIKE_COLOR,
    elevatedColor = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_ELEVATED_COLOR,
    normalColor = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_NORMAL_COLOR,
    zeroColor = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_ZERO_COLOR,
    noneColor = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_NONE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_THRESHOLD_COLOR,
    axisZeroColor = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_AXIS_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showWvf = true,
    showThresholdLine = true,
    showZeroLine = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatValue = defaultFormatValue,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-williams-vix-fix-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineWilliamsVixFixSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineWilliamsVixFixSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineWilliamsVixFixLayout({
        data,
        period,
        threshold,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [data, period, threshold, width, height, padding, gap, pricePanelRatio],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineWilliamsVixFixChart(data, { period, threshold });
  const resolvedLabel =
    ariaLabel ??
    `Williams VIX Fix chart, period ${run.period}, threshold ${run.threshold}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineWilliamsVixFixSeriesId): void => {
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
    const tooltipW = 200;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.pricePanelTop + 6;
    tooltip = (
      <g
        data-section="chart-line-williams-vix-fix-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={104}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-williams-vix-fix-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-williams-vix-fix-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-williams-vix-fix-tooltip-low"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Low: ${formatValue(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-williams-vix-fix-tooltip-wvf"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`WVF: ${
            hoverSample.wvf === null ? 'n/a' : hoverSample.wvf.toFixed(3)
          }`}
        </text>
        <text
          data-section="chart-line-williams-vix-fix-tooltip-zone"
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
  const wvfHidden = isHidden('wvf') || !showWvf;

  const legendItems: Array<{
    id: ChartLineWilliamsVixFixSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'wvf', label: 'WVF', color: wvfColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-williams-vix-fix"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-threshold={run.threshold}
      data-wvf-final={run.wvfFinal === null ? '' : run.wvfFinal}
      data-spike-count={run.spikeCount}
      data-elevated-count={run.elevatedCount}
      data-normal-count={run.normalCount}
      data-zero-count={run.zeroCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-williams-vix-fix-aria-desc"
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
          data-section="chart-line-williams-vix-fix-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-williams-vix-fix-empty"
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
          data-section="chart-line-williams-vix-fix-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-williams-vix-fix-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-williams-vix-fix-grid-line"
                    data-panel="price"
                    x1={layout.innerLeft}
                    y1={py}
                    x2={layout.innerRight}
                    y2={py}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
              {tickValues.map((t, i) => {
                const py =
                  layout.wvfPanelBottom -
                  t * (layout.wvfPanelBottom - layout.wvfPanelTop);
                return (
                  <line
                    key={`wg-${i}`}
                    data-section="chart-line-williams-vix-fix-grid-line"
                    data-panel="wvf"
                    x1={layout.innerLeft}
                    y1={py}
                    x2={layout.innerRight}
                    y2={py}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-williams-vix-fix-axes">
              <line
                data-section="chart-line-williams-vix-fix-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-williams-vix-fix-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-williams-vix-fix-axis"
                data-panel="wvf"
                x1={layout.innerLeft}
                y1={layout.wvfPanelTop}
                x2={layout.innerLeft}
                y2={layout.wvfPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-williams-vix-fix-axis"
                data-panel="wvf"
                x1={layout.innerLeft}
                y1={layout.wvfPanelBottom}
                x2={layout.innerRight}
                y2={layout.wvfPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
            </g>
          ) : null}

          <text
            data-section="chart-line-williams-vix-fix-panel-label"
            data-panel="price"
            x={layout.innerRight}
            y={layout.pricePanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Close
          </text>
          <text
            data-section="chart-line-williams-vix-fix-panel-label"
            data-panel="wvf"
            x={layout.innerRight}
            y={layout.wvfPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            WVF
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-williams-vix-fix-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={axisZeroColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholdLine ? (
            <line
              data-section="chart-line-williams-vix-fix-threshold-line"
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={thresholdColor}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-williams-vix-fix-price-path"
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
            <g data-section="chart-line-williams-vix-fix-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-williams-vix-fix-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, close ${formatValue(
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

          {!wvfHidden ? (
            <path
              data-section="chart-line-williams-vix-fix-line"
              d={layout.wvfPath}
              fill="none"
              stroke={wvfColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Williams VIX Fix line, ${layout.markers.length} points`}
            />
          ) : null}

          {!wvfHidden && showMarkers ? (
            <g data-section="chart-line-williams-vix-fix-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-williams-vix-fix-marker"
                  data-zone={marker.zone}
                  data-wvf={marker.wvf}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    spikeColor,
                    elevatedColor,
                    normalColor,
                    zeroColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, WVF ${formatValue(
                    marker.wvf,
                  )}, ${zoneLabelOf(marker.zone)}`}
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
            <g data-section="chart-line-williams-vix-fix-badge">
              <rect
                data-section="chart-line-williams-vix-fix-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={120}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-williams-vix-fix-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`WVF ${run.period} thr ${run.threshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-williams-vix-fix-legend"
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
                data-section="chart-line-williams-vix-fix-legend-item"
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
                  data-section="chart-line-williams-vix-fix-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-williams-vix-fix-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-williams-vix-fix-legend-stats"
            style={{ color: axisColor }}
          >
            {`spike ${run.spikeCount} / elevated ${run.elevatedCount} / normal ${run.normalCount} / zero ${run.zeroCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineWilliamsVixFix.displayName = 'ChartLineWilliamsVixFix';
