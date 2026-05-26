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
 * ChartLineTemaCross -- pure-SVG single-panel chart with a
 * Triple-EMA (TEMA) **fast over slow** crossover overlay.
 *
 * For each lookback `L` the TEMA cascades three EMAs:
 *
 *   ema1 = EMA(close, L)
 *   ema2 = EMA(ema1, L)
 *   ema3 = EMA(ema2, L)
 *   TEMA = 3 * ema1 - 3 * ema2 + ema3
 *
 * The integer coefficients `(3, -3, 1)` sum to `1`, so a
 * constant close passes through every TEMA unchanged
 * (EMA-of-constant lemma). The chart plots two TEMA lines
 * (`fastLength` < `slowLength`) and marks crossover events:
 *
 *   upCross   at bar `i`: fast[i-1] <= slow[i-1] && fast[i] > slow[i]
 *   downCross at bar `i`: fast[i-1] >= slow[i-1] && fast[i] < slow[i]
 *
 * Bit-exact anchor on integer fixtures:
 *
 *   * `CONST_FLAT (close == K)` -> `ema1 = ema2 = ema3 = K` ->
 *     `TEMA = 3K - 3K + K = K` bit-exact at every bar (integer
 *     coefficient cancellation). With `fast == slow == K` the
 *     chart records zero crosses at every bar.
 *
 * The chart shares one panel: the close line plus the fast and
 * slow TEMA lines, with cross markers placed at the crossover
 * bars.
 */

export interface ChartLineTemaCrossPoint {
  x: number;
  close: number;
}

export type ChartLineTemaCrossZone =
  | 'up-cross'
  | 'down-cross'
  | 'above'
  | 'below'
  | 'at'
  | 'none';

export type ChartLineTemaCrossSeriesId = 'price' | 'fast' | 'slow';

export interface ChartLineTemaCrossSample {
  index: number;
  x: number;
  close: number;
  fast: number | null;
  slow: number | null;
  zone: ChartLineTemaCrossZone;
}

export interface ChartLineTemaCrossRun {
  series: ChartLineTemaCrossPoint[];
  fastLength: number;
  slowLength: number;
  fast: Array<number | null>;
  slow: Array<number | null>;
  samples: ChartLineTemaCrossSample[];
  fastFinal: number | null;
  slowFinal: number | null;
  upCrossCount: number;
  downCrossCount: number;
  aboveCount: number;
  belowCount: number;
  atCount: number;
  ok: boolean;
}

export interface ChartLineTemaCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  fast: number;
  slow: number;
  zone: ChartLineTemaCrossZone;
}

export interface ChartLineTemaCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTemaCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineTemaCrossDot[];
  fastPath: string;
  slowPath: string;
  markers: ChartLineTemaCrossMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineTemaCrossRun;
}

export interface ChartLineTemaCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTemaCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  fastColor?: string;
  slowColor?: string;
  upCrossColor?: string;
  downCrossColor?: string;
  aboveColor?: string;
  belowColor?: string;
  atColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFast?: boolean;
  showSlow?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTemaCrossSeriesId[];
  defaultHiddenSeries?: ChartLineTemaCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTemaCrossSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineTemaCrossSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_TEMA_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_TEMA_CROSS_HEIGHT = 380;
export const DEFAULT_CHART_LINE_TEMA_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_TEMA_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TEMA_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TEMA_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TEMA_CROSS_FAST_LENGTH = 8;
export const DEFAULT_CHART_LINE_TEMA_CROSS_SLOW_LENGTH = 21;
export const DEFAULT_CHART_LINE_TEMA_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TEMA_CROSS_FAST_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_TEMA_CROSS_SLOW_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_TEMA_CROSS_UP_CROSS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TEMA_CROSS_DOWN_CROSS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TEMA_CROSS_ABOVE_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_TEMA_CROSS_BELOW_COLOR = '#ef4444';
export const DEFAULT_CHART_LINE_TEMA_CROSS_AT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_TEMA_CROSS_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_TEMA_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TEMA_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineTemaCrossFinitePoints(
  data: readonly ChartLineTemaCrossPoint[] | null | undefined,
): ChartLineTemaCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTemaCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a length to an integer of at least 2. */
export function normalizeLineTemaCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * EMA over a nullable series. The first finite value seeds the
 * EMA; subsequent values use `alpha = 2 / (length + 1)`.
 */
export function computeLineTemaCrossEma(
  values: ReadonlyArray<number | null> | null | undefined,
  length: unknown,
): Array<number | null> {
  if (!Array.isArray(values)) return [];
  const n = normalizeLineTemaCrossLength(length, 2);
  const alpha = 2 / (n + 1);
  const out: Array<number | null> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!isFiniteNumber(v)) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      prev = v;
    } else {
      prev = prev + alpha * (v - prev);
    }
    out.push(prev);
  }
  return out;
}

/**
 * Compute the TEMA series at a single lookback length:
 *
 *   ema1 = EMA(close, L)
 *   ema2 = EMA(ema1, L)
 *   ema3 = EMA(ema2, L)
 *   TEMA = 3 * ema1 - 3 * ema2 + ema3
 *
 * Integer coefficients sum to `1`, so a constant input passes
 * through unchanged.
 */
export function computeLineTemaCrossTema(
  closes: readonly number[] | null | undefined,
  length: unknown,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const closeNullable: Array<number | null> = closes.map((c) =>
    isFiniteNumber(c) ? c : null,
  );
  const ema1 = computeLineTemaCrossEma(closeNullable, length);
  const ema2 = computeLineTemaCrossEma(ema1, length);
  const ema3 = computeLineTemaCrossEma(ema2, length);
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    const e1 = ema1[i];
    const e2 = ema2[i];
    const e3 = ema3[i];
    if (!isFiniteNumber(e1) || !isFiniteNumber(e2) || !isFiniteNumber(e3)) {
      out.push(null);
      continue;
    }
    out.push(3 * e1 - 3 * e2 + e3);
  }
  return out;
}

/**
 * Classify a bar's TEMA-cross zone. The `prev` arguments are
 * the previous bar's `fast` and `slow` values used to detect
 * crossovers; pass `null` on the first bar.
 */
export function classifyLineTemaCrossZone(
  fast: number | null,
  slow: number | null,
  prevFast: number | null,
  prevSlow: number | null,
): ChartLineTemaCrossZone {
  if (!isFiniteNumber(fast) || !isFiniteNumber(slow)) return 'none';
  if (isFiniteNumber(prevFast) && isFiniteNumber(prevSlow)) {
    if (prevFast <= prevSlow && fast > slow) return 'up-cross';
    if (prevFast >= prevSlow && fast < slow) return 'down-cross';
  }
  if (fast > slow) return 'above';
  if (fast < slow) return 'below';
  return 'at';
}

export interface ChartLineTemaCrossOptions {
  fastLength?: number;
  slowLength?: number;
}

/** Run the full TEMA-cross pipeline plus sample classification. */
export function runLineTemaCross(
  data: readonly ChartLineTemaCrossPoint[] | null | undefined,
  options: ChartLineTemaCrossOptions = {},
): ChartLineTemaCrossRun {
  const series = getLineTemaCrossFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineTemaCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_TEMA_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineTemaCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_TEMA_CROSS_SLOW_LENGTH,
  );
  const closes = series.map((p) => p.close);
  const fast = computeLineTemaCrossTema(closes, fastLength);
  const slow = computeLineTemaCrossTema(closes, slowLength);
  const samples: ChartLineTemaCrossSample[] = series.map((point, index) => {
    const f = fast[index] ?? null;
    const s = slow[index] ?? null;
    const pf = index > 0 ? fast[index - 1] ?? null : null;
    const ps = index > 0 ? slow[index - 1] ?? null : null;
    return {
      index,
      x: point.x,
      close: point.close,
      fast: f,
      slow: s,
      zone: classifyLineTemaCrossZone(f, s, pf, ps),
    };
  });
  let upCrossCount = 0;
  let downCrossCount = 0;
  let aboveCount = 0;
  let belowCount = 0;
  let atCount = 0;
  let fastFinal: number | null = null;
  let slowFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'up-cross') upCrossCount += 1;
    else if (sample.zone === 'down-cross') downCrossCount += 1;
    else if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    else if (sample.zone === 'at') atCount += 1;
    if (isFiniteNumber(sample.fast)) fastFinal = sample.fast;
    if (isFiniteNumber(sample.slow)) slowFinal = sample.slow;
  }
  return {
    series,
    fastLength,
    slowLength,
    fast,
    slow,
    samples,
    fastFinal,
    slowFinal,
    upCrossCount,
    downCrossCount,
    aboveCount,
    belowCount,
    atCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineTemaCrossLayoutOptions
  extends ChartLineTemaCrossOptions {
  data: readonly ChartLineTemaCrossPoint[] | null | undefined;
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
export function computeLineTemaCrossLayout(
  options: ChartLineTemaCrossLayoutOptions,
): ChartLineTemaCrossLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_TEMA_CROSS_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_TEMA_CROSS_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_TEMA_CROSS_PADDING;

  const run = runLineTemaCross(options.data, {
    ...(options.fastLength !== undefined
      ? { fastLength: options.fastLength }
      : {}),
    ...(options.slowLength !== undefined
      ? { slowLength: options.slowLength }
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

  let valueMin = Infinity;
  let valueMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.close < valueMin) valueMin = sample.close;
    if (sample.close > valueMax) valueMax = sample.close;
    if (isFiniteNumber(sample.fast)) {
      if (sample.fast < valueMin) valueMin = sample.fast;
      if (sample.fast > valueMax) valueMax = sample.fast;
    }
    if (isFiniteNumber(sample.slow)) {
      if (sample.slow < valueMin) valueMin = sample.slow;
      if (sample.slow > valueMax) valueMax = sample.slow;
    }
  }
  if (!Number.isFinite(valueMin) || !Number.isFinite(valueMax)) {
    valueMin = 0;
    valueMax = 1;
  }
  if (valueMin === valueMax) {
    valueMin -= 1;
    valueMax += 1;
  }
  const yAt = (value: number): number =>
    innerBottom - ((value - valueMin) / (valueMax - valueMin)) * innerHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineTemaCrossDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const fastLinePoints: Array<{ x: number; y: number }> = [];
  const slowLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineTemaCrossMarker[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    if (isFiniteNumber(sample.fast)) {
      fastLinePoints.push({ x: cx, y: yAt(sample.fast) });
    }
    if (isFiniteNumber(sample.slow)) {
      slowLinePoints.push({ x: cx, y: yAt(sample.slow) });
    }
    if (
      (sample.zone === 'up-cross' || sample.zone === 'down-cross') &&
      isFiniteNumber(sample.fast) &&
      isFiniteNumber(sample.slow)
    ) {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yAt((sample.fast + sample.slow) / 2),
        close: sample.close,
        fast: sample.fast,
        slow: sample.slow,
        zone: sample.zone,
      });
    }
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
    fastPath: buildLinePath(fastLinePoints),
    slowPath: buildLinePath(slowLinePoints),
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineTemaCrossChart(
  data: readonly ChartLineTemaCrossPoint[] | null | undefined,
  options: ChartLineTemaCrossOptions = {},
): string {
  const run = runLineTemaCross(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const fText = run.fastFinal === null ? 'n/a' : run.fastFinal.toFixed(3);
  const sText = run.slowFinal === null ? 'n/a' : run.slowFinal.toFixed(3);
  return (
    `Single-panel chart with a Triple-EMA fast-over-slow crossover ` +
    `overlay (fast length ${run.fastLength}, slow length ` +
    `${run.slowLength}): the close line is plotted with both TEMA ` +
    `lines. Crosses are marked when the fast TEMA crosses the slow ` +
    `TEMA: an up-cross when fast moves from <= slow to > slow, and ` +
    `a down-cross when fast moves from >= slow to < slow. A ` +
    `constant close keeps both TEMA lines at the close (no ` +
    `crosses). Across ${total} bars the run records ` +
    `${run.upCrossCount} up-crosses and ${run.downCrossCount} ` +
    `down-crosses. The final fast / slow TEMA reads ${fText} / ` +
    `${sText}.`
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
  zone: ChartLineTemaCrossZone,
  upCrossColor: string,
  downCrossColor: string,
  aboveColor: string,
  belowColor: string,
  atColor: string,
  noneColor: string,
): string {
  if (zone === 'up-cross') return upCrossColor;
  if (zone === 'down-cross') return downCrossColor;
  if (zone === 'above') return aboveColor;
  if (zone === 'below') return belowColor;
  if (zone === 'at') return atColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineTemaCrossZone): string {
  if (zone === 'up-cross') return 'Up cross';
  if (zone === 'down-cross') return 'Down cross';
  if (zone === 'above') return 'Fast above slow';
  if (zone === 'below') return 'Fast below slow';
  if (zone === 'at') return 'Fast at slow';
  return 'n/a';
}

/**
 * ChartLineTemaCross -- single-panel pure-SVG Triple-EMA fast /
 * slow crossover chart.
 */
export const ChartLineTemaCross = forwardRef<
  HTMLDivElement,
  ChartLineTemaCrossProps
>(function ChartLineTemaCross(props, ref) {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_TEMA_CROSS_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_TEMA_CROSS_SLOW_LENGTH,
    width = DEFAULT_CHART_LINE_TEMA_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_TEMA_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_TEMA_CROSS_PADDING,
    tickCount = DEFAULT_CHART_LINE_TEMA_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TEMA_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TEMA_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TEMA_CROSS_PRICE_COLOR,
    fastColor = DEFAULT_CHART_LINE_TEMA_CROSS_FAST_COLOR,
    slowColor = DEFAULT_CHART_LINE_TEMA_CROSS_SLOW_COLOR,
    upCrossColor = DEFAULT_CHART_LINE_TEMA_CROSS_UP_CROSS_COLOR,
    downCrossColor = DEFAULT_CHART_LINE_TEMA_CROSS_DOWN_CROSS_COLOR,
    aboveColor = DEFAULT_CHART_LINE_TEMA_CROSS_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_TEMA_CROSS_BELOW_COLOR,
    atColor = DEFAULT_CHART_LINE_TEMA_CROSS_AT_COLOR,
    noneColor = DEFAULT_CHART_LINE_TEMA_CROSS_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_TEMA_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TEMA_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showFast = true,
    showSlow = true,
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
  const baseId = `chart-line-tema-cross-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineTemaCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineTemaCrossSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineTemaCrossLayout({
        data,
        fastLength,
        slowLength,
        width,
        height,
        padding,
      }),
    [data, fastLength, slowLength, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineTemaCrossChart(data, { fastLength, slowLength });
  const resolvedLabel =
    ariaLabel ??
    `TEMA cross chart, fast ${run.fastLength}, slow ${run.slowLength}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineTemaCrossSeriesId): void => {
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
    const tooltipW = 220;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    tooltip = (
      <g data-section="chart-line-tema-cross-tooltip" pointerEvents="none">
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
          data-section="chart-line-tema-cross-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-tema-cross-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-tema-cross-tooltip-fast"
          x={tx + 10}
          y={ty + 51}
          fill="#fcd34d"
          fontSize={11}
          fontWeight={600}
        >
          {`Fast: ${
            hoverSample.fast === null ? 'n/a' : hoverSample.fast.toFixed(4)
          }`}
        </text>
        <text
          data-section="chart-line-tema-cross-tooltip-slow"
          x={tx + 10}
          y={ty + 67}
          fill="#7dd3fc"
          fontSize={11}
          fontWeight={600}
        >
          {`Slow: ${
            hoverSample.slow === null ? 'n/a' : hoverSample.slow.toFixed(4)
          }`}
        </text>
        <text
          data-section="chart-line-tema-cross-tooltip-zone"
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
  const fastHidden = isHidden('fast') || !showFast;
  const slowHidden = isHidden('slow') || !showSlow;

  const legendItems: Array<{
    id: ChartLineTemaCrossSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'fast', label: 'Fast TEMA', color: fastColor },
    { id: 'slow', label: 'Slow TEMA', color: slowColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-tema-cross"
      data-empty={isEmpty ? 'true' : 'false'}
      data-fast-length={run.fastLength}
      data-slow-length={run.slowLength}
      data-up-cross-count={run.upCrossCount}
      data-down-cross-count={run.downCrossCount}
      data-above-count={run.aboveCount}
      data-below-count={run.belowCount}
      data-at-count={run.atCount}
      data-fast-final={run.fastFinal === null ? '' : run.fastFinal}
      data-slow-final={run.slowFinal === null ? '' : run.slowFinal}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-tema-cross-aria-desc"
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
          data-section="chart-line-tema-cross-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-tema-cross-empty"
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
          data-section="chart-line-tema-cross-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-tema-cross-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-tema-cross-grid-line"
                    x1={layout.innerLeft}
                    y1={y}
                    x2={layout.innerRight}
                    y2={y}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-tema-cross-axes">
              <line
                data-section="chart-line-tema-cross-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-tema-cross-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-tema-cross-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-tema-cross-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMin)}
              </text>
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-tema-cross-price-path"
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
            <g data-section="chart-line-tema-cross-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-tema-cross-dot"
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

          {!fastHidden ? (
            <path
              data-section="chart-line-tema-cross-fast-line"
              d={layout.fastPath}
              fill="none"
              stroke={fastColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {!slowHidden ? (
            <path
              data-section="chart-line-tema-cross-slow-line"
              d={layout.slowPath}
              fill="none"
              stroke={slowColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-tema-cross-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-tema-cross-marker"
                  data-zone={marker.zone}
                  data-fast={marker.fast}
                  data-slow={marker.slow}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 1}
                  fill={zoneColorOf(
                    marker.zone,
                    upCrossColor,
                    downCrossColor,
                    aboveColor,
                    belowColor,
                    atColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, ${zoneLabelOf(
                    marker.zone,
                  )} at fast ${formatValue(marker.fast)} / slow ${formatValue(
                    marker.slow,
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
            <g data-section="chart-line-tema-cross-badge">
              <rect
                data-section="chart-line-tema-cross-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={132}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-tema-cross-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`TEMA ${run.fastLength}/${run.slowLength}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-tema-cross-legend"
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
                data-section="chart-line-tema-cross-legend-item"
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
                  data-section="chart-line-tema-cross-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-tema-cross-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-tema-cross-legend-stats"
            style={{ color: axisColor }}
          >
            {`up ${run.upCrossCount} / down ${run.downCrossCount} / above ${run.aboveCount} / below ${run.belowCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineTemaCross.displayName = 'ChartLineTemaCross';
