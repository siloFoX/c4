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
 * ChartLineAtrTrail -- pure-SVG single-panel line chart that
 * overlays an ATR trailing stop on the close. The trail is the
 * Chandelier-style long-side stop with a monotonic ratchet:
 *
 *   TR[i]       = max(high - low, |high - prevClose|,
 *                     |low - prevClose|)    // TR[0] = high - low
 *   ATR[i]      = SMA(TR, length)[i]
 *   highest[i]  = max(close, [i - length + 1, i])
 *   candidate[i] = highest[i] - multiplier * ATR[i]
 *   trail[i]    = candidate[i]                 (first valid bar)
 *               = max(trail[i - 1], candidate[i])  (ratchet up)
 *
 * Defaults: `length = 14`, `multiplier = 2`. Bars before
 * `i = length - 1` are warmup (`trail = null`).
 *
 * The ratchet rule never lets the trail descend: once raised,
 * it stays put or rises. This is the long-side trailing-stop
 * convention; pairs with a corresponding short-side trail
 * (highest - multiplier * ATR) when used in a stop-and-reverse
 * system.
 *
 * Bit-exact anchors:
 *
 *   * **CONST_FLAT** (`high = low = close = K`): every TR is
 *     zero, ATR is zero, `highest = K`, `candidate = K - 0 = K`,
 *     and the trail equals `K` exactly past warmup. The trail
 *     coincides with the close.
 *   * **CONST_BAR with dyadic TR** (constant `high = K + r`,
 *     `low = K - r`, `close = C` with `2r` a power of 2 and `C`
 *     dyadic): every TR is `2r`, ATR = `2r` bit-exact, and:
 *
 *         candidate = C - multiplier * 2r       (bit-exact)
 *         trail     = C - multiplier * 2r       (ratchet has no
 *                                                effect because
 *                                                the candidate
 *                                                is constant)
 *
 *     for example `K = 10, r = 1, C = 10, multiplier = 2` gives
 *     `trail = 10 - 4 = 6` exactly past warmup.
 */

export interface ChartLineAtrTrailPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAtrTrailZone =
  | 'breakout'
  | 'above'
  | 'at'
  | 'broken'
  | 'none';

export type ChartLineAtrTrailSeriesId = 'price' | 'trail';

export interface ChartLineAtrTrailSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  atr: number | null;
  highest: number | null;
  candidate: number | null;
  trail: number | null;
  zone: ChartLineAtrTrailZone;
}

export interface ChartLineAtrTrailRun {
  series: ChartLineAtrTrailPoint[];
  length: number;
  multiplier: number;
  tr: Array<number | null>;
  atr: Array<number | null>;
  highest: Array<number | null>;
  candidate: Array<number | null>;
  trail: Array<number | null>;
  samples: ChartLineAtrTrailSample[];
  trailFinal: number | null;
  breakoutCount: number;
  aboveCount: number;
  atCount: number;
  brokenCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineAtrTrailMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  trail: number;
  zone: ChartLineAtrTrailZone;
}

export interface ChartLineAtrTrailDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAtrTrailLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineAtrTrailDot[];
  trailPath: string;
  markers: ChartLineAtrTrailMarker[];
  yMin: number;
  yMax: number;
  run: ChartLineAtrTrailRun;
}

export interface ChartLineAtrTrailProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAtrTrailPoint[];
  length?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  trailColor?: string;
  breakoutColor?: string;
  aboveColor?: string;
  atColor?: string;
  brokenColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTrail?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAtrTrailSeriesId[];
  defaultHiddenSeries?: ChartLineAtrTrailSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAtrTrailSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineAtrTrailSample }) => void;
  formatPrice?: (value: number) => string;
  formatTrail?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ATR_TRAIL_WIDTH = 720;
export const DEFAULT_CHART_LINE_ATR_TRAIL_HEIGHT = 400;
export const DEFAULT_CHART_LINE_ATR_TRAIL_PADDING = 44;
export const DEFAULT_CHART_LINE_ATR_TRAIL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ATR_TRAIL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ATR_TRAIL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ATR_TRAIL_LENGTH = 14;
export const DEFAULT_CHART_LINE_ATR_TRAIL_MULTIPLIER = 2;
export const DEFAULT_CHART_LINE_ATR_TRAIL_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ATR_TRAIL_TRAIL_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ATR_TRAIL_BREAKOUT_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ATR_TRAIL_ABOVE_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_ATR_TRAIL_AT_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_ATR_TRAIL_BROKEN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ATR_TRAIL_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ATR_TRAIL_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ATR_TRAIL_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineAtrTrailFinitePoints(
  data: readonly ChartLineAtrTrailPoint[] | null | undefined,
): ChartLineAtrTrailPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAtrTrailPoint[] = [];
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
export function normalizeLineAtrTrailLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive finite multiplier. */
export function normalizeLineAtrTrailMultiplier(
  multiplier: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(multiplier) && multiplier > 0) return multiplier;
  return fallback;
}

/** SMA; nulls in the window null the bar. */
export function applyLineAtrTrailSma(
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

/** Rolling max of `length` close samples. */
export function applyLineAtrTrailRollingMaxClose(
  closes: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let m = -Infinity;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = closes[i - j];
      if (v === null || v === undefined || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      if (v > m) m = v;
    }
    out.push(ok ? m : null);
  }
  return out;
}

/** True range per bar; bar 0 falls back to `high - low`. */
export function computeLineAtrTrailTrueRange(
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

export interface ChartLineAtrTrailOptions {
  length?: number;
  multiplier?: number;
}

export interface ChartLineAtrTrailChannels {
  tr: Array<number | null>;
  atr: Array<number | null>;
  highest: Array<number | null>;
  candidate: Array<number | null>;
  trail: Array<number | null>;
}

/**
 * Compute the ATR trail pipeline per bar. Bars before
 * `i = length - 1` are `null`. The ratchet rule lifts the trail
 * monotonically.
 */
export function computeLineAtrTrail(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
  options: ChartLineAtrTrailOptions = {},
): ChartLineAtrTrailChannels {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { tr: [], atr: [], highest: [], candidate: [], trail: [] };
  }
  const length = normalizeLineAtrTrailLength(
    options.length,
    DEFAULT_CHART_LINE_ATR_TRAIL_LENGTH,
  );
  const multiplier = normalizeLineAtrTrailMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_ATR_TRAIL_MULTIPLIER,
  );
  const tr = computeLineAtrTrailTrueRange(bars);
  const atr = applyLineAtrTrailSma(tr, length);
  const closes: Array<number | null> = bars.map((bar) =>
    !bar || !isFiniteNumber(bar.close) ? null : bar.close,
  );
  const highest = applyLineAtrTrailRollingMaxClose(closes, length);
  const candidate: Array<number | null> = [];
  const trail: Array<number | null> = [];
  let lastTrail: number | null = null;
  for (let i = 0; i < bars.length; i += 1) {
    const a = atr[i];
    const h = highest[i];
    if (
      a == null ||
      h == null ||
      !isFiniteNumber(a) ||
      !isFiniteNumber(h)
    ) {
      candidate.push(null);
      trail.push(null);
      lastTrail = null;
      continue;
    }
    const cand = h - multiplier * a;
    candidate.push(cand);
    const nextTrail: number =
      lastTrail === null ? cand : Math.max(lastTrail, cand);
    trail.push(nextTrail);
    lastTrail = nextTrail;
  }
  return { tr, atr, highest, candidate, trail };
}

/** Classify the close relative to the trail. */
export function classifyLineAtrTrailZone(
  close: number,
  trail: number | null,
  prevTrail: number | null,
): ChartLineAtrTrailZone {
  if (trail == null || !isFiniteNumber(trail) || !isFiniteNumber(close)) {
    return 'none';
  }
  if (close > trail) {
    if (
      prevTrail != null &&
      isFiniteNumber(prevTrail) &&
      trail > prevTrail
    ) {
      return 'breakout';
    }
    return 'above';
  }
  if (close === trail) return 'at';
  return 'broken';
}

/** Run the full pipeline plus sample classification. */
export function runLineAtrTrail(
  data: readonly ChartLineAtrTrailPoint[] | null | undefined,
  options: ChartLineAtrTrailOptions = {},
): ChartLineAtrTrailRun {
  const series = getLineAtrTrailFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineAtrTrailLength(
    options.length,
    DEFAULT_CHART_LINE_ATR_TRAIL_LENGTH,
  );
  const multiplier = normalizeLineAtrTrailMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_ATR_TRAIL_MULTIPLIER,
  );
  const channels = computeLineAtrTrail(series, { length, multiplier });
  const samples: ChartLineAtrTrailSample[] = series.map((point, index) => {
    const trail = channels.trail[index] ?? null;
    const prevTrail = index > 0 ? (channels.trail[index - 1] ?? null) : null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      atr: channels.atr[index] ?? null,
      highest: channels.highest[index] ?? null,
      candidate: channels.candidate[index] ?? null,
      trail,
      zone: classifyLineAtrTrailZone(point.close, trail, prevTrail),
    };
  });
  let breakoutCount = 0;
  let aboveCount = 0;
  let atCount = 0;
  let brokenCount = 0;
  let noneCount = 0;
  let trailFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'breakout') breakoutCount += 1;
    else if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'at') atCount += 1;
    else if (sample.zone === 'broken') brokenCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.trail)) trailFinal = sample.trail;
  }
  return {
    series,
    length,
    multiplier,
    tr: channels.tr,
    atr: channels.atr,
    highest: channels.highest,
    candidate: channels.candidate,
    trail: channels.trail,
    samples,
    trailFinal,
    breakoutCount,
    aboveCount,
    atCount,
    brokenCount,
    noneCount,
    ok: series.length >= length,
  };
}

export interface ChartLineAtrTrailLayoutOptions
  extends ChartLineAtrTrailOptions {
  data: readonly ChartLineAtrTrailPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
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

/** Project the run into a single-panel SVG layout. */
export function computeLineAtrTrailLayout(
  options: ChartLineAtrTrailLayoutOptions,
): ChartLineAtrTrailLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ATR_TRAIL_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ATR_TRAIL_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ATR_TRAIL_PADDING;

  const run = runLineAtrTrail(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.multiplier !== undefined
      ? { multiplier: options.multiplier }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const okGeom = innerWidth > 0 && innerHeight > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  // y-range covers close and the trail.
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.close < yMin) yMin = sample.close;
    if (sample.close > yMax) yMax = sample.close;
    if (sample.trail != null && isFiniteNumber(sample.trail)) {
      if (sample.trail < yMin) yMin = sample.trail;
      if (sample.trail > yMax) yMax = sample.trail;
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0;
    yMax = 1;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yAt = (value: number): number =>
    innerBottom - ((value - yMin) / (yMax - yMin)) * innerHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineAtrTrailDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const trailLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineAtrTrailMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.trail)) return;
    const cx = xAt(index);
    const yc = yAt(sample.trail);
    trailLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      trail: sample.trail,
      zone: sample.zone,
    });
  });

  return {
    ok,
    width,
    height,
    padding,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    trailPath: buildLinePath(trailLinePoints),
    markers,
    yMin,
    yMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineAtrTrailChart(
  data: readonly ChartLineAtrTrailPoint[] | null | undefined,
  options: ChartLineAtrTrailOptions = {},
): string {
  const run = runLineAtrTrail(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.trailFinal === null ? 'n/a' : run.trailFinal.toFixed(4);
  return (
    `Single-panel chart with an ATR trailing stop overlay on the ` +
    `close (length ${run.length}, multiplier ${run.multiplier}). ` +
    `The trail is the highest close over the lookback minus ` +
    `multiplier * ATR, lifted monotonically (ratchet rule). ` +
    `Across ${total} bars the close breaks out above a freshly ` +
    `lifted trail on ${run.breakoutCount}, sits above the trail ` +
    `on ${run.aboveCount}, is at the trail on ${run.atCount}, ` +
    `breaks below the trail on ${run.brokenCount}, and is ` +
    `undefined on ${run.noneCount}. The final trail value is ` +
    `${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatTrail(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineAtrTrailZone,
  breakoutColor: string,
  aboveColor: string,
  atColor: string,
  brokenColor: string,
  noneColor: string,
): string {
  if (zone === 'breakout') return breakoutColor;
  if (zone === 'above') return aboveColor;
  if (zone === 'at') return atColor;
  if (zone === 'broken') return brokenColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineAtrTrailZone): string {
  if (zone === 'breakout') return 'Breakout (trail rose)';
  if (zone === 'above') return 'Above Trail';
  if (zone === 'at') return 'At Trail';
  if (zone === 'broken') return 'Broken (below trail)';
  return 'n/a';
}

/** ChartLineAtrTrail -- single-panel pure-SVG chart. */
export const ChartLineAtrTrail = forwardRef<
  HTMLDivElement,
  ChartLineAtrTrailProps
>(function ChartLineAtrTrail(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_ATR_TRAIL_LENGTH,
    multiplier = DEFAULT_CHART_LINE_ATR_TRAIL_MULTIPLIER,
    width = DEFAULT_CHART_LINE_ATR_TRAIL_WIDTH,
    height = DEFAULT_CHART_LINE_ATR_TRAIL_HEIGHT,
    padding = DEFAULT_CHART_LINE_ATR_TRAIL_PADDING,
    tickCount = DEFAULT_CHART_LINE_ATR_TRAIL_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ATR_TRAIL_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ATR_TRAIL_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ATR_TRAIL_PRICE_COLOR,
    trailColor = DEFAULT_CHART_LINE_ATR_TRAIL_TRAIL_COLOR,
    breakoutColor = DEFAULT_CHART_LINE_ATR_TRAIL_BREAKOUT_COLOR,
    aboveColor = DEFAULT_CHART_LINE_ATR_TRAIL_ABOVE_COLOR,
    atColor = DEFAULT_CHART_LINE_ATR_TRAIL_AT_COLOR,
    brokenColor = DEFAULT_CHART_LINE_ATR_TRAIL_BROKEN_COLOR,
    noneColor = DEFAULT_CHART_LINE_ATR_TRAIL_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_ATR_TRAIL_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ATR_TRAIL_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTrail = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatTrail = defaultFormatTrail,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-atr-trail-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineAtrTrailSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineAtrTrailSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineAtrTrailLayout({
        data,
        length,
        multiplier,
        width,
        height,
        padding,
      }),
    [data, length, multiplier, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineAtrTrailChart(data, { length, multiplier });
  const resolvedLabel =
    ariaLabel ??
    `ATR trailing stop chart, length ${run.length}, multiplier ${run.multiplier}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineAtrTrailSeriesId): void => {
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
    const tooltipW = 260;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    tooltip = (
      <g
        data-section="chart-line-atr-trail-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={134}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-atr-trail-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-atr-trail-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-atr-trail-tooltip-range"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatPrice(hoverSample.high)} / ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-atr-trail-tooltip-atr"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`ATR: ${
            hoverSample.atr === null
              ? 'n/a'
              : formatTrail(hoverSample.atr)
          }`}
        </text>
        <text
          data-section="chart-line-atr-trail-tooltip-highest"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Highest: ${
            hoverSample.highest === null
              ? 'n/a'
              : formatPrice(hoverSample.highest)
          }`}
        </text>
        <text
          data-section="chart-line-atr-trail-tooltip-trail"
          x={tx + 10}
          y={ty + 99}
          fill="#fca5a5"
          fontSize={11}
          fontWeight={600}
        >
          {`Trail: ${
            hoverSample.trail === null
              ? 'n/a'
              : formatTrail(hoverSample.trail)
          }`}
        </text>
        <text
          data-section="chart-line-atr-trail-tooltip-zone"
          x={tx + 10}
          y={ty + 115}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const trailHidden = isHidden('trail') || !showTrail;

  const legendItems: Array<{
    id: ChartLineAtrTrailSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'trail', label: 'ATR Trail', color: trailColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-atr-trail"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-multiplier={run.multiplier}
      data-trail-final={run.trailFinal === null ? '' : run.trailFinal}
      data-breakout-count={run.breakoutCount}
      data-above-count={run.aboveCount}
      data-at-count={run.atCount}
      data-broken-count={run.brokenCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-atr-trail-aria-desc"
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
          data-section="chart-line-atr-trail-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-atr-trail-empty"
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
          data-section="chart-line-atr-trail-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-atr-trail-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-atr-trail-grid-line"
                    x1={layout.innerLeft}
                    y1={yp}
                    x2={layout.innerRight}
                    y2={yp}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-atr-trail-axes">
              <line
                data-section="chart-line-atr-trail-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-atr-trail-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-atr-trail-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.yMax)}
              </text>
              <text
                data-section="chart-line-atr-trail-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.yMin)}
              </text>
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-atr-trail-price-path"
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
            <g data-section="chart-line-atr-trail-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-atr-trail-dot"
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

          {!trailHidden ? (
            <path
              data-section="chart-line-atr-trail-trail-path"
              d={layout.trailPath}
              fill="none"
              stroke={trailColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`ATR trail line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-atr-trail-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-atr-trail-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-trail={marker.trail}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    breakoutColor,
                    aboveColor,
                    atColor,
                    brokenColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, trail ${formatTrail(marker.trail)}, ${zoneLabelOf(
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
            <g data-section="chart-line-atr-trail-badge">
              <rect
                data-section="chart-line-atr-trail-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={170}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-atr-trail-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`ATR Trail ${run.length}/${run.multiplier}x`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-atr-trail-legend"
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
                data-section="chart-line-atr-trail-legend-item"
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
                  data-section="chart-line-atr-trail-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-atr-trail-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-atr-trail-legend-stats"
            style={{ color: axisColor }}
          >
            {`breakout ${run.breakoutCount} / above ${run.aboveCount} / broken ${run.brokenCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineAtrTrail.displayName = 'ChartLineAtrTrail';
