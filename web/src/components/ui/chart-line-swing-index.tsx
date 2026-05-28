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
 * ChartLineSwingIndex -- pure-SVG dual-panel chart with the
 * Wilder Swing Index oscillator panel beneath the close.
 *
 * Definition (Wilder 1978):
 *
 *   A  = |high - prevClose|
 *   B  = |low - prevClose|
 *   C  = |high - low|
 *   K  = max(A, B)
 *   N  = (close - prevClose) + (close - open) / 2
 *        + (prevClose - prevOpen) / 4
 *   R  = case A is largest of {A, B, C}:
 *          R = A - B / 2 + |prevClose - prevOpen| / 4
 *        case B is largest:
 *          R = B - A / 2 + |prevClose - prevOpen| / 4
 *        else:
 *          R = C + |prevClose - prevOpen| / 4
 *   SI = 50 * (N / R) * (K / T)
 *
 * `T` is the "limit move" -- a futures-specific constant. For
 * non-futures applications we default to `T = 1`. The seed bar
 * (no prior reference) is `null`. When `R == 0` (bar with no
 * range and no gap) the bar is `null`. When `K == 0` (close
 * neither moved above nor below the prior close range) `SI` is
 * zero by construction.
 *
 * Bit-exact anchors on integer / dyadic fixtures:
 *
 *   * **Seed bar (i == 0)**: `SI = null` (no prior reference).
 *   * **ALL_FLAT (open = high = low = close = K at every bar)**:
 *     all of A, B, C and the gap are zero, so R = 0 -> `null`.
 *   * **K = 0 (high = low = prevClose)**: regardless of N, R the
 *     factor `K / T = 0`, so `SI = 0` bit-exact.
 *   * **Worked dyadic anchor**: prev `{o: 2, h: 4, l: 2, c: 2}`,
 *     curr `{o: 2, h: 4, l: 2, c: 4}` with T = 1.
 *     - A = 2, B = 0, C = 2 -> else branch -> R = 2 + 0 = 2
 *     - K = 2
 *     - N = (4 - 2) + (4 - 2) / 2 + (2 - 2) / 4 = 2 + 1 + 0 = 3
 *     - SI = 50 * (3 / 2) * (2 / 1) = 150 bit-exact.
 *
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots the Swing Index with a
 * zero baseline.
 */

export interface ChartLineSwingIndexPoint {
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineSwingIndexZone =
  | 'positive'
  | 'flat'
  | 'negative'
  | 'none';

export type ChartLineSwingIndexSeriesId = 'price' | 'si';

export interface ChartLineSwingIndexSample {
  index: number;
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
  si: number | null;
  zone: ChartLineSwingIndexZone;
}

export interface ChartLineSwingIndexRun {
  series: ChartLineSwingIndexPoint[];
  limitMove: number;
  si: Array<number | null>;
  samples: ChartLineSwingIndexSample[];
  siFinal: number | null;
  positiveCount: number;
  flatCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineSwingIndexMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  si: number;
  zone: ChartLineSwingIndexZone;
}

export interface ChartLineSwingIndexDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSwingIndexLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  siTop: number;
  siBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineSwingIndexDot[];
  siPath: string;
  markers: ChartLineSwingIndexMarker[];
  priceMin: number;
  priceMax: number;
  siMin: number;
  siMax: number;
  zeroLineY: number;
  run: ChartLineSwingIndexRun;
}

export interface ChartLineSwingIndexProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSwingIndexPoint[];
  limitMove?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  siColor?: string;
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
  showSi?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZeroLine?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSwingIndexSeriesId[];
  defaultHiddenSeries?: ChartLineSwingIndexSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSwingIndexSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineSwingIndexSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatSi?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_SWING_INDEX_WIDTH = 720;
export const DEFAULT_CHART_LINE_SWING_INDEX_HEIGHT = 460;
export const DEFAULT_CHART_LINE_SWING_INDEX_PADDING = 44;
export const DEFAULT_CHART_LINE_SWING_INDEX_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_SWING_INDEX_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SWING_INDEX_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SWING_INDEX_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SWING_INDEX_LIMIT_MOVE = 1;
export const DEFAULT_CHART_LINE_SWING_INDEX_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SWING_INDEX_SI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_SWING_INDEX_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SWING_INDEX_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SWING_INDEX_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_SWING_INDEX_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_SWING_INDEX_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SWING_INDEX_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SWING_INDEX_ZERO_LINE_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC and x. */
export function getLineSwingIndexFinitePoints(
  data: readonly ChartLineSwingIndexPoint[] | null | undefined,
): ChartLineSwingIndexPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSwingIndexPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.open) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
    ) {
      out.push({
        x: point.x,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
      });
    }
  }
  return out;
}

/** Normalize the limit move to a positive finite number, defaulting to 1. */
export function normalizeLineSwingIndexLimitMove(
  limitMove: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(limitMove) && limitMove > 0) return limitMove;
  return fallback;
}

/**
 * Compute the Wilder Swing Index for the current bar given the
 * previous bar. Returns `null` when `R` collapses to zero
 * (singular: bar with no range and no gap).
 */
export function computeLineSwingIndexBar(
  prev: { open: number; high: number; low: number; close: number },
  curr: { open: number; high: number; low: number; close: number },
  limitMove: number,
): number | null {
  const A = Math.abs(curr.high - prev.close);
  const B = Math.abs(curr.low - prev.close);
  const C = Math.abs(curr.high - curr.low);
  const gap = Math.abs(prev.close - prev.open);
  const K = Math.max(A, B);
  let R: number;
  if (A > B && A > C) {
    R = A - B / 2 + gap / 4;
  } else if (B > A && B > C) {
    R = B - A / 2 + gap / 4;
  } else {
    R = C + gap / 4;
  }
  if (R === 0) return null;
  const N =
    (curr.close - prev.close) +
    (curr.close - curr.open) / 2 +
    (prev.close - prev.open) / 4;
  return 50 * (N / R) * (K / limitMove);
}

/**
 * Compute the Swing Index per bar. The seed bar (`i = 0`) is
 * `null`. Non-finite OHLC nulls the bar and the recurrence
 * skips that bar (the next finite bar uses the most recent
 * finite bar as the prior reference).
 */
export function computeLineSwingIndex(
  bars: ReadonlyArray<{ open: number; high: number; low: number; close: number }> | null | undefined,
  limitMove: unknown,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const T = normalizeLineSwingIndexLimitMove(
    limitMove,
    DEFAULT_CHART_LINE_SWING_INDEX_LIMIT_MOVE,
  );
  const out: Array<number | null> = [];
  let prev: { open: number; high: number; low: number; close: number } | null =
    null;
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    if (
      !bar ||
      !isFiniteNumber(bar.open) ||
      !isFiniteNumber(bar.high) ||
      !isFiniteNumber(bar.low) ||
      !isFiniteNumber(bar.close)
    ) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      out.push(null);
      prev = bar;
      continue;
    }
    out.push(computeLineSwingIndexBar(prev, bar, T));
    prev = bar;
  }
  return out;
}

/** Classify a Swing Index reading. */
export function classifyLineSwingIndexZone(
  si: number | null,
): ChartLineSwingIndexZone {
  if (!isFiniteNumber(si)) return 'none';
  if (si > 0) return 'positive';
  if (si < 0) return 'negative';
  return 'flat';
}

export interface ChartLineSwingIndexOptions {
  limitMove?: number;
}

/** Run the full Swing Index pipeline plus sample classification. */
export function runLineSwingIndex(
  data: readonly ChartLineSwingIndexPoint[] | null | undefined,
  options: ChartLineSwingIndexOptions = {},
): ChartLineSwingIndexRun {
  const series = getLineSwingIndexFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const limitMove = normalizeLineSwingIndexLimitMove(
    options.limitMove,
    DEFAULT_CHART_LINE_SWING_INDEX_LIMIT_MOVE,
  );
  const si = computeLineSwingIndex(series, limitMove);
  const samples: ChartLineSwingIndexSample[] = series.map((point, index) => {
    const value = si[index] ?? null;
    return {
      index,
      x: point.x,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      si: value,
      zone: classifyLineSwingIndexZone(value),
    };
  });
  let positiveCount = 0;
  let flatCount = 0;
  let negativeCount = 0;
  let siFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.si)) siFinal = sample.si;
  }
  return {
    series = [],
    limitMove,
    si,
    samples,
    siFinal,
    positiveCount,
    flatCount,
    negativeCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineSwingIndexLayoutOptions
  extends ChartLineSwingIndexOptions {
  data: readonly ChartLineSwingIndexPoint[] | null | undefined;
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
export function computeLineSwingIndexLayout(
  options: ChartLineSwingIndexLayoutOptions,
): ChartLineSwingIndexLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_SWING_INDEX_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_SWING_INDEX_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_SWING_INDEX_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_SWING_INDEX_PANEL_GAP;

  const run = runLineSwingIndex(options.data, {
    ...(options.limitMove !== undefined ? { limitMove: options.limitMove } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const siHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const siTop = priceBottom + panelGap;
  const siBottom = siTop + siHeight;

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

  let siMin = Infinity;
  let siMax = -Infinity;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.si)) {
      if (sample.si < siMin) siMin = sample.si;
      if (sample.si > siMax) siMax = sample.si;
    }
  }
  if (!Number.isFinite(siMin) || !Number.isFinite(siMax)) {
    siMin = -1;
    siMax = 1;
  }
  if (siMin === siMax) {
    siMin -= 1;
    siMax += 1;
  }
  if (siMin > 0) siMin = 0;
  if (siMax < 0) siMax = 0;
  const siY = (value: number): number =>
    siBottom - ((value - siMin) / (siMax - siMin)) * siHeight;
  const zeroLineY = siY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineSwingIndexDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const siLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineSwingIndexMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.si)) return;
    const cx = xAt(index);
    const yc = siY(sample.si);
    siLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      si: sample.si,
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
    siTop,
    siBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    siPath: buildLinePath(siLinePoints),
    markers,
    priceMin,
    priceMax,
    siMin,
    siMax,
    zeroLineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineSwingIndexChart(
  data: readonly ChartLineSwingIndexPoint[] | null | undefined,
  options: ChartLineSwingIndexOptions = {},
): string {
  const run = runLineSwingIndex(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.siFinal === null ? 'n/a' : run.siFinal.toFixed(2);
  return (
    `Dual-panel chart with a Wilder Swing Index oscillator panel ` +
    `beneath the close (limit move ${run.limitMove}). The Swing ` +
    `Index measures the directional bar pressure as 50 * (N / R) * ` +
    `(K / T), where N is the directional pressure built from the ` +
    `today close minus prior close, the today close-to-open ` +
    `imbalance, and the prior close-to-open imbalance; R is the ` +
    `larger of the true range and the absolute gap-adjusted move; ` +
    `K is the larger gap from the prior close; T is the limit ` +
    `move. Across ${total} bars the Swing Index is positive on ` +
    `${run.positiveCount}, flat on ${run.flatCount}, and negative ` +
    `on ${run.negativeCount}. The final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatSi(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(2);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineSwingIndexZone,
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

function zoneLabelOf(zone: ChartLineSwingIndexZone): string {
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineSwingIndex -- dual-panel pure-SVG Wilder Swing Index
 * chart.
 */
export const ChartLineSwingIndex = forwardRef<
  HTMLDivElement,
  ChartLineSwingIndexProps
>(function ChartLineSwingIndex(props, ref) {
  const {
    data,
    limitMove = DEFAULT_CHART_LINE_SWING_INDEX_LIMIT_MOVE,
    width = DEFAULT_CHART_LINE_SWING_INDEX_WIDTH,
    height = DEFAULT_CHART_LINE_SWING_INDEX_HEIGHT,
    padding = DEFAULT_CHART_LINE_SWING_INDEX_PADDING,
    panelGap = DEFAULT_CHART_LINE_SWING_INDEX_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_SWING_INDEX_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SWING_INDEX_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SWING_INDEX_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SWING_INDEX_PRICE_COLOR,
    siColor = DEFAULT_CHART_LINE_SWING_INDEX_SI_COLOR,
    positiveColor = DEFAULT_CHART_LINE_SWING_INDEX_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_SWING_INDEX_NEGATIVE_COLOR,
    flatColor = DEFAULT_CHART_LINE_SWING_INDEX_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_SWING_INDEX_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_SWING_INDEX_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_SWING_INDEX_GRID_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_SWING_INDEX_ZERO_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSi = true,
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
    formatSi = defaultFormatSi,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-swing-index-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineSwingIndexSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineSwingIndexSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineSwingIndexLayout({
        data,
        limitMove,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, limitMove, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineSwingIndexChart(data, { limitMove });
  const resolvedLabel =
    ariaLabel ?? `Wilder Swing Index chart, limit move ${run.limitMove}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineSwingIndexSeriesId): void => {
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
        data-section="chart-line-swing-index-tooltip"
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
          data-section="chart-line-swing-index-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-swing-index-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-swing-index-tooltip-range"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatPrice(hoverSample.high)} / ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-swing-index-tooltip-si"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`SI: ${
            hoverSample.si === null ? 'n/a' : formatSi(hoverSample.si)
          }`}
        </text>
        <text
          data-section="chart-line-swing-index-tooltip-zone"
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
  const siHidden = isHidden('si') || !showSi;

  const legendItems: Array<{
    id: ChartLineSwingIndexSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'si', label: 'Swing Index', color: siColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-swing-index"
      data-empty={isEmpty ? 'true' : 'false'}
      data-limit-move={run.limitMove}
      data-si-final={run.siFinal === null ? '' : run.siFinal}
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
        data-section="chart-line-swing-index-aria-desc"
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
          data-section="chart-line-swing-index-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-swing-index-empty"
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
          data-section="chart-line-swing-index-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-swing-index-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const ys =
                  layout.siBottom -
                  t * (layout.siBottom - layout.siTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-swing-index-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-swing-index-grid-line"
                      data-panel="si"
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
            <g data-section="chart-line-swing-index-axes">
              <line
                data-section="chart-line-swing-index-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-swing-index-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-swing-index-axis"
                data-panel="si"
                x1={layout.innerLeft}
                y1={layout.siTop}
                x2={layout.innerLeft}
                y2={layout.siBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-swing-index-axis"
                data-panel="si"
                x1={layout.innerLeft}
                y1={layout.siBottom}
                x2={layout.innerRight}
                y2={layout.siBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-swing-index-tick-label"
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
                data-section="chart-line-swing-index-tick-label"
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
                data-section="chart-line-swing-index-tick-label"
                data-panel="si"
                x={layout.innerLeft - 6}
                y={layout.siTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatSi(layout.siMax)}
              </text>
              <text
                data-section="chart-line-swing-index-tick-label"
                data-panel="si"
                x={layout.innerLeft - 6}
                y={layout.siBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatSi(layout.siMin)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-swing-index-zero-line"
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
              data-section="chart-line-swing-index-price-path"
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
            <g data-section="chart-line-swing-index-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-swing-index-dot"
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

          {!siHidden ? (
            <path
              data-section="chart-line-swing-index-line"
              d={layout.siPath}
              fill="none"
              stroke={siColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Swing Index line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-swing-index-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-swing-index-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-si={marker.si}
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
                  )}, SI ${formatSi(marker.si)}, ${zoneLabelOf(marker.zone)}`}
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
            <g data-section="chart-line-swing-index-badge">
              <rect
                data-section="chart-line-swing-index-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={130}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-swing-index-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Swing Index T=${run.limitMove}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-swing-index-legend"
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
                data-section="chart-line-swing-index-legend-item"
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
                  data-section="chart-line-swing-index-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-swing-index-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-swing-index-legend-stats"
            style={{ color: axisColor }}
          >
            {`positive ${run.positiveCount} / flat ${run.flatCount} / negative ${run.negativeCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineSwingIndex.displayName = 'ChartLineSwingIndex';
