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
 * ChartLineHilbertInstant -- pure-SVG dual-panel chart with the
 * close on the top panel and a Hilbert-Transform-inspired
 * Instantaneous Trendline panel beneath. The trendline is the
 * weighted-moving-average smoothed close minus its lagged value
 * (the "InPhase smoothed close detrended by its lagged value"):
 *
 *   smoothed[i] = (4 * close[i] + 3 * close[i - 1] +
 *                  2 * close[i - 2] + close[i - 3]) / 10
 *                                                  (i >= 3)
 *   instant[i]  = smoothed[i] - smoothed[i - lag]   (i >= 3 + lag)
 *
 * Defaults: `lag = 6`. Bars before `i = 3 + lag` are warmup
 * (`instant = null`).
 *
 * Bit-exact anchors:
 *
 *   * **CONST close** (`close = K`): `smoothed = K` exactly at
 *     every bar (the WMA-4 weights sum to 10, so the
 *     coefficient on K is 10/10 = 1). `instant = K - K = 0`
 *     bit-exact past warmup.
 *   * **RAMP close** (`close = a * i` for integer `a != 0`):
 *
 *         smoothed[i] = (4*ai + 3*a(i-1) + 2*a(i-2) + a(i-3)) / 10
 *                     = a * (10i - 10) / 10
 *                     = a * (i - 1)                  (bit-exact)
 *
 *     so `instant[i] = a*(i-1) - a*(i-1-lag) = a*lag` bit-exact
 *     past warmup. The integration sweep verifies this across
 *     `a` in `{1, 2, 3, -1, -5}` and `lag` in `{2, 4, 6, 10}`.
 */

export interface ChartLineHilbertInstantPoint {
  x: number;
  close: number;
}

export type ChartLineHilbertInstantZone =
  | 'strong-up'
  | 'up'
  | 'flat'
  | 'down'
  | 'strong-down'
  | 'none';

export type ChartLineHilbertInstantSeriesId = 'price' | 'instant';

export interface ChartLineHilbertInstantSample {
  index: number;
  x: number;
  close: number;
  smoothed: number | null;
  instant: number | null;
  zone: ChartLineHilbertInstantZone;
}

export interface ChartLineHilbertInstantRun {
  series: ChartLineHilbertInstantPoint[];
  lag: number;
  smoothed: Array<number | null>;
  instant: Array<number | null>;
  samples: ChartLineHilbertInstantSample[];
  instantFinal: number | null;
  instantAbsMaxSeen: number;
  strongUpCount: number;
  upCount: number;
  flatCount: number;
  downCount: number;
  strongDownCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineHilbertInstantMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  instant: number;
  zone: ChartLineHilbertInstantZone;
}

export interface ChartLineHilbertInstantDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineHilbertInstantLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  instantTop: number;
  instantBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineHilbertInstantDot[];
  instantPath: string;
  markers: ChartLineHilbertInstantMarker[];
  priceMin: number;
  priceMax: number;
  instantMin: number;
  instantMax: number;
  zeroBaselineY: number;
  run: ChartLineHilbertInstantRun;
}

export interface ChartLineHilbertInstantProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineHilbertInstantPoint[];
  lag?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  instantColor?: string;
  strongUpColor?: string;
  upColor?: string;
  flatColor?: string;
  downColor?: string;
  strongDownColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  baselineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showInstant?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBaseline?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineHilbertInstantSeriesId[];
  defaultHiddenSeries?: ChartLineHilbertInstantSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineHilbertInstantSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineHilbertInstantSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatInstant?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_HILBERT_INSTANT_WIDTH = 720;
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_PADDING = 44;
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_LAG = 6;
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_INSTANT_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_STRONG_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_UP_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_FLAT_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_DOWN_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_STRONG_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_HILBERT_INSTANT_BASELINE_COLOR = '#64748b';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineHilbertInstantFinitePoints(
  data: readonly ChartLineHilbertInstantPoint[] | null | undefined,
): ChartLineHilbertInstantPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineHilbertInstantPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer lag (>= 1). */
export function normalizeLineHilbertInstantLag(
  lag: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(lag) && lag >= 1) return Math.floor(lag);
  return fallback;
}

/**
 * Compute the 4-bar weighted moving average smoothed close
 * (`(4*c + 3*c[-1] + 2*c[-2] + c[-3]) / 10`). Bars before
 * `i = 3` are `null`.
 */
export function computeLineHilbertInstantSmoothed(
  closes: readonly (number | null)[] | null | undefined,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < 3) {
      out.push(null);
      continue;
    }
    const c0 = closes[i];
    const c1 = closes[i - 1];
    const c2 = closes[i - 2];
    const c3 = closes[i - 3];
    if (
      c0 == null ||
      c1 == null ||
      c2 == null ||
      c3 == null ||
      !isFiniteNumber(c0) ||
      !isFiniteNumber(c1) ||
      !isFiniteNumber(c2) ||
      !isFiniteNumber(c3)
    ) {
      out.push(null);
      continue;
    }
    out.push((4 * c0 + 3 * c1 + 2 * c2 + c3) / 10);
  }
  return out;
}

export interface ChartLineHilbertInstantOptions {
  lag?: number;
}

/**
 * Compute the Instantaneous Trendline pipeline per bar. Bars
 * before `i = 3 + lag` are `null`.
 */
export function computeLineHilbertInstant(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineHilbertInstantOptions = {},
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const lag = normalizeLineHilbertInstantLag(
    options.lag,
    DEFAULT_CHART_LINE_HILBERT_INSTANT_LAG,
  );
  const smoothed = computeLineHilbertInstantSmoothed(closes);
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < 3 + lag) {
      out.push(null);
      continue;
    }
    const curr = smoothed[i];
    const past = smoothed[i - lag];
    if (
      curr == null ||
      past == null ||
      !isFiniteNumber(curr) ||
      !isFiniteNumber(past)
    ) {
      out.push(null);
      continue;
    }
    const diff = curr - past;
    // Normalize -0 (which can arise when smoothed values are
    // equal but signs flip via subtraction) to +0.
    out.push(diff === 0 ? 0 : diff);
  }
  return out;
}

/** Classify an instantaneous trendline reading by abs-max ratio. */
export function classifyLineHilbertInstantZone(
  value: number | null,
  instantAbsMaxSeen: number,
): ChartLineHilbertInstantZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value === 0) return 'flat';
  if (!isFiniteNumber(instantAbsMaxSeen) || instantAbsMaxSeen <= 0) {
    return value > 0 ? 'up' : 'down';
  }
  const ratio = value / instantAbsMaxSeen;
  if (ratio >= 0.5) return 'strong-up';
  if (ratio > 0) return 'up';
  if (ratio > -0.5) return 'down';
  return 'strong-down';
}

/** Run the full pipeline plus sample classification. */
export function runLineHilbertInstant(
  data: readonly ChartLineHilbertInstantPoint[] | null | undefined,
  options: ChartLineHilbertInstantOptions = {},
): ChartLineHilbertInstantRun {
  const series = getLineHilbertInstantFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const lag = normalizeLineHilbertInstantLag(
    options.lag,
    DEFAULT_CHART_LINE_HILBERT_INSTANT_LAG,
  );
  const closes = series.map((p) => p.close);
  const smoothed = computeLineHilbertInstantSmoothed(closes);
  const instant = computeLineHilbertInstant(closes, { lag });
  let instantAbsMaxSeen = 0;
  for (const v of instant) {
    if (v != null && isFiniteNumber(v)) {
      const abs = Math.abs(v);
      if (abs > instantAbsMaxSeen) instantAbsMaxSeen = abs;
    }
  }
  const samples: ChartLineHilbertInstantSample[] = series.map((point, index) => {
    const value = instant[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      smoothed: smoothed[index] ?? null,
      instant: value,
      zone: classifyLineHilbertInstantZone(value, instantAbsMaxSeen),
    };
  });
  let strongUpCount = 0;
  let upCount = 0;
  let flatCount = 0;
  let downCount = 0;
  let strongDownCount = 0;
  let noneCount = 0;
  let instantFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'strong-up') strongUpCount += 1;
    else if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    else if (sample.zone === 'strong-down') strongDownCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.instant)) instantFinal = sample.instant;
  }
  return {
    series = [],
    lag,
    smoothed,
    instant,
    samples,
    instantFinal,
    instantAbsMaxSeen,
    strongUpCount,
    upCount,
    flatCount,
    downCount,
    strongDownCount,
    noneCount,
    ok: series.length > 3 + lag,
  };
}

export interface ChartLineHilbertInstantLayoutOptions
  extends ChartLineHilbertInstantOptions {
  data: readonly ChartLineHilbertInstantPoint[] | null | undefined;
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
export function computeLineHilbertInstantLayout(
  options: ChartLineHilbertInstantLayoutOptions,
): ChartLineHilbertInstantLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_HILBERT_INSTANT_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_HILBERT_INSTANT_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_HILBERT_INSTANT_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_HILBERT_INSTANT_PANEL_GAP;

  const run = runLineHilbertInstant(options.data, {
    ...(options.lag !== undefined ? { lag: options.lag } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const instantHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const instantTop = priceBottom + panelGap;
  const instantBottom = instantTop + instantHeight;

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

  // Instantaneous trendline is centered at 0 and can take any
  // sign; pad symmetrically.
  let instantMin = -1;
  let instantMax = 1;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.instant)) {
      if (sample.instant < instantMin) instantMin = sample.instant;
      if (sample.instant > instantMax) instantMax = sample.instant;
    }
  }
  if (instantMin === instantMax) {
    instantMin -= 1;
    instantMax += 1;
  }
  const instantY = (value: number): number =>
    instantBottom - ((value - instantMin) / (instantMax - instantMin)) * instantHeight;
  const zeroBaselineY = instantY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineHilbertInstantDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const instantLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineHilbertInstantMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.instant)) return;
    const cx = xAt(index);
    const yc = instantY(sample.instant);
    instantLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      instant: sample.instant,
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
    instantTop,
    instantBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    instantPath: buildLinePath(instantLinePoints),
    markers,
    priceMin,
    priceMax,
    instantMin,
    instantMax,
    zeroBaselineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineHilbertInstantChart(
  data: readonly ChartLineHilbertInstantPoint[] | null | undefined,
  options: ChartLineHilbertInstantOptions = {},
): string {
  const run = runLineHilbertInstant(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.instantFinal === null ? 'n/a' : run.instantFinal.toFixed(4);
  return (
    `Dual-panel chart with a Hilbert Transform Instantaneous ` +
    `Trendline panel beneath the close (lag ${run.lag}). The ` +
    `trendline is the 4-bar WMA-smoothed close minus its lagged ` +
    `value: instant = smoothed[i] - smoothed[i - lag], where ` +
    `smoothed[i] = (4*c[i] + 3*c[i-1] + 2*c[i-2] + c[i-3]) / 10. ` +
    `Across ${total} bars the trendline is strong-up (>= 50% of ` +
    `abs max) on ${run.strongUpCount}, mildly up on ${run.upCount}, ` +
    `at zero on ${run.flatCount}, mildly down on ${run.downCount}, ` +
    `strong-down (<= -50%) on ${run.strongDownCount}, and ` +
    `undefined on ${run.noneCount}. The final reading is ` +
    `${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatInstant(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineHilbertInstantZone,
  strongUpColor: string,
  upColor: string,
  flatColor: string,
  downColor: string,
  strongDownColor: string,
  noneColor: string,
): string {
  if (zone === 'strong-up') return strongUpColor;
  if (zone === 'up') return upColor;
  if (zone === 'flat') return flatColor;
  if (zone === 'down') return downColor;
  if (zone === 'strong-down') return strongDownColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineHilbertInstantZone): string {
  if (zone === 'strong-up') return 'Strong Up';
  if (zone === 'up') return 'Up';
  if (zone === 'flat') return 'Flat';
  if (zone === 'down') return 'Down';
  if (zone === 'strong-down') return 'Strong Down';
  return 'n/a';
}

/** ChartLineHilbertInstant -- dual-panel pure-SVG chart. */
export const ChartLineHilbertInstant = forwardRef<
  HTMLDivElement,
  ChartLineHilbertInstantProps
>(function ChartLineHilbertInstant(props, ref) {
  const {
    data,
    lag = DEFAULT_CHART_LINE_HILBERT_INSTANT_LAG,
    width = DEFAULT_CHART_LINE_HILBERT_INSTANT_WIDTH,
    height = DEFAULT_CHART_LINE_HILBERT_INSTANT_HEIGHT,
    padding = DEFAULT_CHART_LINE_HILBERT_INSTANT_PADDING,
    panelGap = DEFAULT_CHART_LINE_HILBERT_INSTANT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_HILBERT_INSTANT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_HILBERT_INSTANT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_HILBERT_INSTANT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_HILBERT_INSTANT_PRICE_COLOR,
    instantColor = DEFAULT_CHART_LINE_HILBERT_INSTANT_INSTANT_COLOR,
    strongUpColor = DEFAULT_CHART_LINE_HILBERT_INSTANT_STRONG_UP_COLOR,
    upColor = DEFAULT_CHART_LINE_HILBERT_INSTANT_UP_COLOR,
    flatColor = DEFAULT_CHART_LINE_HILBERT_INSTANT_FLAT_COLOR,
    downColor = DEFAULT_CHART_LINE_HILBERT_INSTANT_DOWN_COLOR,
    strongDownColor = DEFAULT_CHART_LINE_HILBERT_INSTANT_STRONG_DOWN_COLOR,
    noneColor = DEFAULT_CHART_LINE_HILBERT_INSTANT_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_HILBERT_INSTANT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_HILBERT_INSTANT_GRID_COLOR,
    baselineColor = DEFAULT_CHART_LINE_HILBERT_INSTANT_BASELINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showInstant = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBaseline = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatInstant = defaultFormatInstant,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-hilbert-instant-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineHilbertInstantSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineHilbertInstantSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineHilbertInstantLayout({
        data,
        lag,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, lag, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineHilbertInstantChart(data, { lag });
  const resolvedLabel =
    ariaLabel ?? `Hilbert Instantaneous Trendline chart, lag ${run.lag}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineHilbertInstantSeriesId): void => {
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
    const tooltipW = 250;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-hilbert-instant-tooltip"
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
          data-section="chart-line-hilbert-instant-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-hilbert-instant-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-hilbert-instant-tooltip-smoothed"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Smoothed: ${
            hoverSample.smoothed === null
              ? 'n/a'
              : formatPrice(hoverSample.smoothed)
          }`}
        </text>
        <text
          data-section="chart-line-hilbert-instant-tooltip-instant"
          x={tx + 10}
          y={ty + 67}
          fill="#7dd3fc"
          fontSize={11}
          fontWeight={600}
        >
          {`Instant: ${
            hoverSample.instant === null
              ? 'n/a'
              : formatInstant(hoverSample.instant)
          }`}
        </text>
        <text
          data-section="chart-line-hilbert-instant-tooltip-zone"
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
  const instantHidden = isHidden('instant') || !showInstant;

  const legendItems: Array<{
    id: ChartLineHilbertInstantSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'instant', label: 'Hilbert Instant', color: instantColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-hilbert-instant"
      data-empty={isEmpty ? 'true' : 'false'}
      data-lag={run.lag}
      data-instant-final={
        run.instantFinal === null ? '' : run.instantFinal
      }
      data-instant-abs-max-seen={run.instantAbsMaxSeen}
      data-strong-up-count={run.strongUpCount}
      data-up-count={run.upCount}
      data-flat-count={run.flatCount}
      data-down-count={run.downCount}
      data-strong-down-count={run.strongDownCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-hilbert-instant-aria-desc"
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
          data-section="chart-line-hilbert-instant-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-hilbert-instant-empty"
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
          data-section="chart-line-hilbert-instant-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-hilbert-instant-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.instantBottom -
                  t * (layout.instantBottom - layout.instantTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-hilbert-instant-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-hilbert-instant-grid-line"
                      data-panel="instant"
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
            <g data-section="chart-line-hilbert-instant-axes">
              <line
                data-section="chart-line-hilbert-instant-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-hilbert-instant-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-hilbert-instant-axis"
                data-panel="instant"
                x1={layout.innerLeft}
                y1={layout.instantTop}
                x2={layout.innerLeft}
                y2={layout.instantBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-hilbert-instant-axis"
                data-panel="instant"
                x1={layout.innerLeft}
                y1={layout.instantBottom}
                x2={layout.innerRight}
                y2={layout.instantBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-hilbert-instant-tick-label"
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
                data-section="chart-line-hilbert-instant-tick-label"
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
                data-section="chart-line-hilbert-instant-tick-label"
                data-panel="instant"
                x={layout.innerLeft - 6}
                y={layout.instantTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatInstant(layout.instantMax)}
              </text>
              <text
                data-section="chart-line-hilbert-instant-tick-label"
                data-panel="instant"
                x={layout.innerLeft - 6}
                y={layout.instantBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatInstant(layout.instantMin)}
              </text>
            </g>
          ) : null}

          {showBaseline ? (
            <line
              data-section="chart-line-hilbert-instant-baseline"
              x1={layout.innerLeft}
              y1={layout.zeroBaselineY}
              x2={layout.innerRight}
              y2={layout.zeroBaselineY}
              stroke={baselineColor}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-hilbert-instant-price-path"
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
            <g data-section="chart-line-hilbert-instant-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-hilbert-instant-dot"
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

          {!instantHidden ? (
            <path
              data-section="chart-line-hilbert-instant-line"
              d={layout.instantPath}
              fill="none"
              stroke={instantColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Hilbert instant trendline, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-hilbert-instant-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-hilbert-instant-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-instant={marker.instant}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    strongUpColor,
                    upColor,
                    flatColor,
                    downColor,
                    strongDownColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, instant ${formatInstant(marker.instant)}, ${zoneLabelOf(
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
            <g data-section="chart-line-hilbert-instant-badge">
              <rect
                data-section="chart-line-hilbert-instant-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={170}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-hilbert-instant-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Hilbert Instant lag=${run.lag}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-hilbert-instant-legend"
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
                data-section="chart-line-hilbert-instant-legend-item"
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
                  data-section="chart-line-hilbert-instant-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-hilbert-instant-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-hilbert-instant-legend-stats"
            style={{ color: axisColor }}
          >
            {`strong-up ${run.strongUpCount} / up ${run.upCount} / down ${run.downCount} / strong-down ${run.strongDownCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineHilbertInstant.displayName = 'ChartLineHilbertInstant';
