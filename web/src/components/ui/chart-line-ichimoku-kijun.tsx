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
 * ChartLineIchimokuKijun -- pure-SVG single-panel chart with an
 * Ichimoku Kinko Hyo **Kijun-sen** (base-line) overlay.
 *
 * The Kijun-sen is the midpoint of the highest high and the lowest
 * low across the lookback `period` (typically 26):
 *
 *   HH        = max(high over [i - period + 1, i])
 *   LL        = min(low  over [i - period + 1, i])
 *   kijun[i]  = (HH + LL) / 2
 *
 * The first `period - 1` bars are null. Three bit-exact anchors
 * hold on integer fixtures:
 *
 *   * `CONST_FLAT (high == low == K)` -> `HH == LL == K`, so the
 *     Kijun-sen is exactly `K` at every defined bar.
 *   * `RISING (high == low == i + 10)` period 4 -> `HH = i + 10`,
 *     `LL = i + 7`, `kijun[i] = (HH + LL) / 2 = i + 8.5` exactly
 *     dyadic (integer sum divided by two).
 *   * `FALLING (high == low == 19 - i)` period 4 -> `HH = 22 - i`,
 *     `LL = 19 - i`, `kijun[i] = (HH + LL) / 2 = 20.5 - i` exactly
 *     dyadic.
 *
 * The chart shares one panel: the close line plus the Kijun-sen as
 * a continuous line, with markers placed at the close colour-coded
 * by whether the close is above, below, or at the Kijun-sen.
 */

export interface ChartLineIchimokuKijunPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineIchimokuKijunZone =
  | 'above-kijun'
  | 'at-kijun'
  | 'below-kijun'
  | 'none';

export type ChartLineIchimokuKijunSeriesId = 'price' | 'kijun';

export interface ChartLineIchimokuKijunSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  kijun: number | null;
  zone: ChartLineIchimokuKijunZone;
}

export interface ChartLineIchimokuKijunRun {
  series: ChartLineIchimokuKijunPoint[];
  period: number;
  kijun: Array<number | null>;
  samples: ChartLineIchimokuKijunSample[];
  kijunFinal: number | null;
  aboveCount: number;
  atCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineIchimokuKijunMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  kijun: number;
  zone: ChartLineIchimokuKijunZone;
}

export interface ChartLineIchimokuKijunDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineIchimokuKijunLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineIchimokuKijunDot[];
  kijunPath: string;
  markers: ChartLineIchimokuKijunMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineIchimokuKijunRun;
}

export interface ChartLineIchimokuKijunProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineIchimokuKijunPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kijunColor?: string;
  aboveColor?: string;
  belowColor?: string;
  atColor?: string;
  noneColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showKijun?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineIchimokuKijunSeriesId[];
  defaultHiddenSeries?: ChartLineIchimokuKijunSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineIchimokuKijunSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineIchimokuKijunSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_WIDTH = 720;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_HEIGHT = 380;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_PADDING = 44;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_PERIOD = 26;
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_KIJUN_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_ABOVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_BELOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_AT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC and `high >= low`. */
export function getLineIchimokuKijunFinitePoints(
  data: readonly ChartLineIchimokuKijunPoint[] | null | undefined,
): ChartLineIchimokuKijunPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineIchimokuKijunPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      point.high >= point.low
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

/** Coerce the lookback period to an integer of at least 1. */
export function normalizeLineIchimokuKijunPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/**
 * Run the Kijun-sen pipeline per bar. The first `period - 1` bars
 * are null; a non-finite high or low inside the window also nulls
 * the bar.
 */
export function computeLineIchimokuKijun(
  bars: readonly ChartLineIchimokuKijunPoint[] | null | undefined,
  period: unknown,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const p = normalizeLineIchimokuKijunPeriod(
    period,
    DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_PERIOD,
  );
  const out: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < p - 1) {
      out.push(null);
      continue;
    }
    let hh = -Infinity;
    let ll = Infinity;
    let ok = true;
    for (let j = i - p + 1; j <= i; j += 1) {
      const bar = bars[j];
      if (!bar || !isFiniteNumber(bar.high) || !isFiniteNumber(bar.low)) {
        ok = false;
        break;
      }
      if (bar.high > hh) hh = bar.high;
      if (bar.low < ll) ll = bar.low;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    out.push((hh + ll) / 2);
  }
  return out;
}

/** Classify a close against its bar's Kijun-sen value. */
export function classifyLineIchimokuKijunZone(
  close: number | null,
  kijun: number | null,
): ChartLineIchimokuKijunZone {
  if (!isFiniteNumber(close) || !isFiniteNumber(kijun)) return 'none';
  if (close > kijun) return 'above-kijun';
  if (close < kijun) return 'below-kijun';
  return 'at-kijun';
}

export interface ChartLineIchimokuKijunOptions {
  period?: number;
}

/** Run the full Kijun-sen pipeline. */
export function runLineIchimokuKijun(
  data: readonly ChartLineIchimokuKijunPoint[] | null | undefined,
  options: ChartLineIchimokuKijunOptions = {},
): ChartLineIchimokuKijunRun {
  const series = getLineIchimokuKijunFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineIchimokuKijunPeriod(
    options.period,
    DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_PERIOD,
  );
  const kijun = computeLineIchimokuKijun(series, period);
  const samples: ChartLineIchimokuKijunSample[] = series.map((point, index) => {
    const value = kijun[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      kijun: value,
      zone: classifyLineIchimokuKijunZone(point.close, value),
    };
  });
  let aboveCount = 0;
  let atCount = 0;
  let belowCount = 0;
  let kijunFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above-kijun') aboveCount += 1;
    else if (sample.zone === 'at-kijun') atCount += 1;
    else if (sample.zone === 'below-kijun') belowCount += 1;
    if (isFiniteNumber(sample.kijun)) kijunFinal = sample.kijun;
  }
  return {
    series = [],
    period,
    kijun,
    samples,
    kijunFinal,
    aboveCount,
    atCount,
    belowCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineIchimokuKijunLayoutOptions
  extends ChartLineIchimokuKijunOptions {
  data: readonly ChartLineIchimokuKijunPoint[] | null | undefined;
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
export function computeLineIchimokuKijunLayout(
  options: ChartLineIchimokuKijunLayoutOptions,
): ChartLineIchimokuKijunLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_PADDING;

  const run = runLineIchimokuKijun(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
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
    if (sample.low < valueMin) valueMin = sample.low;
    if (sample.high > valueMax) valueMax = sample.high;
    if (isFiniteNumber(sample.kijun)) {
      if (sample.kijun < valueMin) valueMin = sample.kijun;
      if (sample.kijun > valueMax) valueMax = sample.kijun;
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
  const priceDots: ChartLineIchimokuKijunDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const kijunLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineIchimokuKijunMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.kijun)) return;
    const cx = xAt(index);
    kijunLinePoints.push({ x: cx, y: yAt(sample.kijun) });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yAt(sample.close),
      close: sample.close,
      kijun: sample.kijun,
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
    kijunPath: buildLinePath(kijunLinePoints),
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineIchimokuKijunChart(
  data: readonly ChartLineIchimokuKijunPoint[] | null | undefined,
  options: ChartLineIchimokuKijunOptions = {},
): string {
  const run = runLineIchimokuKijun(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.kijunFinal === null ? 'n/a' : run.kijunFinal.toFixed(3);
  return (
    `Single-panel chart with an Ichimoku Kinko Hyo Kijun-sen ` +
    `base-line overlay (period ${run.period}): the close line is ` +
    `plotted with the Kijun-sen, which is the midpoint of the ` +
    `highest high and the lowest low across the lookback. A constant ` +
    `bar series (high == low) collapses the Kijun-sen to that ` +
    `constant. The first ${run.period - 1} bars are null on the ` +
    `Kijun-sen. Across ${total} bars the close sits above the ` +
    `Kijun-sen on ${run.aboveCount}, below on ${run.belowCount}, ` +
    `and exactly at the Kijun-sen on ${run.atCount}. The final ` +
    `Kijun-sen reading is ${finalText}.`
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
  zone: ChartLineIchimokuKijunZone,
  aboveColor: string,
  belowColor: string,
  atColor: string,
  noneColor: string,
): string {
  if (zone === 'above-kijun') return aboveColor;
  if (zone === 'below-kijun') return belowColor;
  if (zone === 'at-kijun') return atColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineIchimokuKijunZone): string {
  if (zone === 'above-kijun') return 'Above Kijun';
  if (zone === 'below-kijun') return 'Below Kijun';
  if (zone === 'at-kijun') return 'At Kijun';
  return 'n/a';
}

/**
 * ChartLineIchimokuKijun -- single-panel pure-SVG Ichimoku
 * Kijun-sen base-line chart.
 */
export const ChartLineIchimokuKijun = forwardRef<
  HTMLDivElement,
  ChartLineIchimokuKijunProps
>(function ChartLineIchimokuKijun(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_PERIOD,
    width = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_WIDTH,
    height = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_HEIGHT,
    padding = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_PADDING,
    tickCount = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_PRICE_COLOR,
    kijunColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_KIJUN_COLOR,
    aboveColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_BELOW_COLOR,
    atColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_AT_COLOR,
    noneColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_NONE_COLOR,
    gridColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showKijun = true,
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
  const baseId = `chart-line-ichimoku-kijun-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineIchimokuKijunSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineIchimokuKijunSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineIchimokuKijunLayout({
        data,
        period,
        width,
        height,
        padding,
      }),
    [data, period, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineIchimokuKijunChart(data, { period });
  const resolvedLabel =
    ariaLabel ?? `Ichimoku Kijun-sen chart, period ${run.period}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineIchimokuKijunSeriesId): void => {
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
      <g
        data-section="chart-line-ichimoku-kijun-tooltip"
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
          data-section="chart-line-ichimoku-kijun-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-ichimoku-kijun-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-ichimoku-kijun-tooltip-hl"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatValue(hoverSample.high)} / ${formatValue(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-ichimoku-kijun-tooltip-kijun"
          x={tx + 10}
          y={ty + 67}
          fill="#7dd3fc"
          fontSize={11}
          fontWeight={600}
        >
          {`Kijun: ${
            hoverSample.kijun === null
              ? 'n/a'
              : hoverSample.kijun.toFixed(4)
          }`}
        </text>
        <text
          data-section="chart-line-ichimoku-kijun-tooltip-zone"
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
  const kijunHidden = isHidden('kijun') || !showKijun;

  const legendItems: Array<{
    id: ChartLineIchimokuKijunSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'kijun', label: 'Kijun-sen', color: kijunColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-ichimoku-kijun"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-kijun-final={run.kijunFinal === null ? '' : run.kijunFinal}
      data-above-count={run.aboveCount}
      data-at-count={run.atCount}
      data-below-count={run.belowCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-ichimoku-kijun-aria-desc"
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
          data-section="chart-line-ichimoku-kijun-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-ichimoku-kijun-empty"
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
          data-section="chart-line-ichimoku-kijun-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-ichimoku-kijun-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-ichimoku-kijun-grid-line"
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
            <g data-section="chart-line-ichimoku-kijun-axes">
              <line
                data-section="chart-line-ichimoku-kijun-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ichimoku-kijun-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-ichimoku-kijun-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-ichimoku-kijun-tick-label"
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
              data-section="chart-line-ichimoku-kijun-price-path"
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
            <g data-section="chart-line-ichimoku-kijun-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-ichimoku-kijun-dot"
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

          {!kijunHidden ? (
            <path
              data-section="chart-line-ichimoku-kijun-line"
              d={layout.kijunPath}
              fill="none"
              stroke={kijunColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Kijun-sen line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-ichimoku-kijun-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-ichimoku-kijun-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-kijun={marker.kijun}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    aboveColor,
                    belowColor,
                    atColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatValue(
                    marker.close,
                  )}, Kijun ${formatValue(marker.kijun)}, ${zoneLabelOf(
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
            <g data-section="chart-line-ichimoku-kijun-badge">
              <rect
                data-section="chart-line-ichimoku-kijun-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={108}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-ichimoku-kijun-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Kijun ${run.period}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-ichimoku-kijun-legend"
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
                data-section="chart-line-ichimoku-kijun-legend-item"
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
                  data-section="chart-line-ichimoku-kijun-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-ichimoku-kijun-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-ichimoku-kijun-legend-stats"
            style={{ color: axisColor }}
          >
            {`above ${run.aboveCount} / at ${run.atCount} / below ${run.belowCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineIchimokuKijun.displayName = 'ChartLineIchimokuKijun';
