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
 * ChartLineUlcerIndex -- pure-SVG two-panel Ulcer Index chart
 * (Peter Martin).
 *
 * The Ulcer Index measures the root-mean-square percentage drawdown
 * across a lookback window. Drawdowns are measured against the
 * running peak inside the window, so a series that only goes up
 * reads zero.
 *
 * For each bar `i` with a filled lookback `period`:
 *
 *   For j in [i - period + 1, i]:
 *     peak[j] = max(close over [i - period + 1, j])
 *     ddPct[j] = 100 * (close[j] - peak[j]) / peak[j]   (<= 0)
 *
 *   ulcer[i] = sqrt(mean of ddPct[j]^2 over the window)
 *
 * The first `period - 1` bars are null. The reading is bounded
 * below by zero. Two bit-exact anchors hold on integer fixtures:
 *
 *   * `CONST_FLAT (close = K)` -> every drawdown is zero, so the
 *     UI is exactly zero.
 *   * `RISING (monotone increasing close)` -> every bar's peak is
 *     the bar itself, so every drawdown is zero, UI is exactly
 *     zero.
 *   * `DRAWDOWN_25 (close = [12, 6, 12, 12], period 4)` -> only
 *     bar j = 1 has a drawdown of -50% (squared = 2500), and the
 *     other three drawdowns are zero; sum / 4 = 625 = 25^2, so the
 *     UI is exactly 25.
 *
 * The top panel plots the close; the bottom panel plots the Ulcer
 * Index in an auto-scaled `[0, max(ulcer)]` band with a single
 * `threshold` reference line.
 */

export interface ChartLineUlcerIndexPoint {
  x: number;
  close: number;
}

export type ChartLineUlcerIndexZone = 'low' | 'medium' | 'high' | 'none';

export type ChartLineUlcerIndexSeriesId = 'price' | 'ulcer';

export interface ChartLineUlcerIndexSample {
  index: number;
  x: number;
  close: number;
  ulcer: number | null;
  zone: ChartLineUlcerIndexZone;
}

export interface ChartLineUlcerIndexRun {
  series: ChartLineUlcerIndexPoint[];
  period: number;
  threshold: number;
  ulcer: Array<number | null>;
  samples: ChartLineUlcerIndexSample[];
  ulcerFinal: number | null;
  ulcerMax: number | null;
  lowCount: number;
  mediumCount: number;
  highCount: number;
  ok: boolean;
}

export interface ChartLineUlcerIndexMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  ulcer: number;
  zone: ChartLineUlcerIndexZone;
}

export interface ChartLineUlcerIndexDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineUlcerIndexLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  ulcerPanelTop: number;
  ulcerPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineUlcerIndexDot[];
  ulcerPath: string;
  markers: ChartLineUlcerIndexMarker[];
  thresholdY: number;
  zeroY: number;
  priceMin: number;
  priceMax: number;
  ulcerMin: number;
  ulcerMax: number;
  run: ChartLineUlcerIndexRun;
}

export interface ChartLineUlcerIndexProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineUlcerIndexPoint[];
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
  ulcerColor?: string;
  lowColor?: string;
  mediumColor?: string;
  highColor?: string;
  noneColor?: string;
  thresholdColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showUlcer?: boolean;
  showThresholdLine?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineUlcerIndexSeriesId[];
  defaultHiddenSeries?: ChartLineUlcerIndexSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineUlcerIndexSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineUlcerIndexSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ULCER_INDEX_WIDTH = 720;
export const DEFAULT_CHART_LINE_ULCER_INDEX_HEIGHT = 400;
export const DEFAULT_CHART_LINE_ULCER_INDEX_PADDING = 44;
export const DEFAULT_CHART_LINE_ULCER_INDEX_GAP = 12;
export const DEFAULT_CHART_LINE_ULCER_INDEX_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ULCER_INDEX_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ULCER_INDEX_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ULCER_INDEX_PERIOD = 14;
export const DEFAULT_CHART_LINE_ULCER_INDEX_THRESHOLD = 5;
export const DEFAULT_CHART_LINE_ULCER_INDEX_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_ULCER_INDEX_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ULCER_INDEX_ULCER_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ULCER_INDEX_LOW_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ULCER_INDEX_MEDIUM_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_ULCER_INDEX_HIGH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ULCER_INDEX_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ULCER_INDEX_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ULCER_INDEX_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ULCER_INDEX_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ULCER_INDEX_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineUlcerIndexFinitePoints(
  data: readonly ChartLineUlcerIndexPoint[] | null | undefined,
): ChartLineUlcerIndexPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineUlcerIndexPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce the lookback period to an integer of at least 2. */
export function normalizeLineUlcerIndexPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** Coerce the high-stress threshold to a positive finite. */
export function normalizeLineUlcerIndexThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0) return threshold;
  return fallback;
}

/**
 * Run the Ulcer Index computation per bar. Returns `null` for the
 * warm-up bars and any bar whose window contains a non-finite or
 * non-positive close.
 */
export function computeLineUlcerIndex(
  closes: readonly number[] | null | undefined,
  period: unknown,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const p = normalizeLineUlcerIndexPeriod(
    period,
    DEFAULT_CHART_LINE_ULCER_INDEX_PERIOD,
  );
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < p - 1) {
      out.push(null);
      continue;
    }
    let peak = -Infinity;
    let sumSq = 0;
    let ok = true;
    for (let j = i - p + 1; j <= i; j += 1) {
      const c = closes[j];
      if (!isFiniteNumber(c) || c <= 0) {
        ok = false;
        break;
      }
      if (c > peak) peak = c;
      const ddPct = (100 * (c - peak)) / peak;
      sumSq += ddPct * ddPct;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    out.push(Math.sqrt(sumSq / p));
  }
  return out;
}

/** Classify an Ulcer reading against the threshold ladder. */
export function classifyLineUlcerIndexZone(
  value: number | null,
  threshold: number,
): ChartLineUlcerIndexZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= threshold * 2) return 'high';
  if (value >= threshold) return 'medium';
  return 'low';
}

export interface ChartLineUlcerIndexOptions {
  period?: number;
  threshold?: number;
}

/** Run the full Ulcer Index pipeline. */
export function runLineUlcerIndex(
  data: readonly ChartLineUlcerIndexPoint[] | null | undefined,
  options: ChartLineUlcerIndexOptions = {},
): ChartLineUlcerIndexRun {
  const series = getLineUlcerIndexFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineUlcerIndexPeriod(
    options.period,
    DEFAULT_CHART_LINE_ULCER_INDEX_PERIOD,
  );
  const threshold = normalizeLineUlcerIndexThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_ULCER_INDEX_THRESHOLD,
  );
  const closes = series.map((p) => p.close);
  const ulcer = computeLineUlcerIndex(closes, period);
  const samples: ChartLineUlcerIndexSample[] = series.map((point, index) => {
    const value = ulcer[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      ulcer: value,
      zone: classifyLineUlcerIndexZone(value, threshold),
    };
  });
  let lowCount = 0;
  let mediumCount = 0;
  let highCount = 0;
  let ulcerFinal: number | null = null;
  let ulcerMax: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'low') lowCount += 1;
    else if (sample.zone === 'medium') mediumCount += 1;
    else if (sample.zone === 'high') highCount += 1;
    if (isFiniteNumber(sample.ulcer)) {
      ulcerFinal = sample.ulcer;
      if (ulcerMax === null || sample.ulcer > ulcerMax) {
        ulcerMax = sample.ulcer;
      }
    }
  }
  return {
    series,
    period,
    threshold,
    ulcer,
    samples,
    ulcerFinal,
    ulcerMax,
    lowCount,
    mediumCount,
    highCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineUlcerIndexLayoutOptions
  extends ChartLineUlcerIndexOptions {
  data: readonly ChartLineUlcerIndexPoint[] | null | undefined;
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
export function computeLineUlcerIndexLayout(
  options: ChartLineUlcerIndexLayoutOptions,
): ChartLineUlcerIndexLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ULCER_INDEX_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ULCER_INDEX_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ULCER_INDEX_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_ULCER_INDEX_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_ULCER_INDEX_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineUlcerIndex(options.data, {
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
  const ulcerPanelTop = pricePanelBottom + gap;
  const ulcerPanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    ulcerPanelBottom - ulcerPanelTop > 0;
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

  const ulcerMin = 0;
  const ulcerCeiling = Math.max(
    run.threshold * 2,
    run.ulcerMax === null ? run.threshold * 2 : run.ulcerMax,
  );
  const ulcerMax = ulcerCeiling > 0 ? ulcerCeiling : 1;
  const ulcerPanelHeight = ulcerPanelBottom - ulcerPanelTop;
  const ulcerYAt = (value: number): number =>
    ulcerPanelBottom -
    ((value - ulcerMin) / (ulcerMax - ulcerMin)) * ulcerPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineUlcerIndexDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const ulcerLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineUlcerIndexMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.ulcer)) return;
    const cx = xAt(index);
    const cy = ulcerYAt(sample.ulcer);
    ulcerLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      ulcer: sample.ulcer,
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
    ulcerPanelTop,
    ulcerPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    ulcerPath: buildLinePath(ulcerLinePoints),
    markers,
    thresholdY: ulcerYAt(run.threshold),
    zeroY: ulcerYAt(0),
    priceMin,
    priceMax,
    ulcerMin,
    ulcerMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineUlcerIndexChart(
  data: readonly ChartLineUlcerIndexPoint[] | null | undefined,
  options: ChartLineUlcerIndexOptions = {},
): string {
  const run = runLineUlcerIndex(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.ulcerFinal === null ? 'n/a' : run.ulcerFinal.toFixed(3);
  return (
    `Two-panel chart with a Peter Martin Ulcer Index panel (period ` +
    `${run.period}, threshold ${run.threshold}): the top panel ` +
    `plots the close, the bottom panel plots the Ulcer Index. The ` +
    `Ulcer Index is the root-mean-square of the percentage drawdowns ` +
    `against the running peak inside the lookback window, so a ` +
    `monotone-rising series reads exactly zero. Across ${total} bars ` +
    `the Ulcer Index reads low (< ${run.threshold}) on ${run.lowCount}, ` +
    `medium ([${run.threshold}, ${run.threshold * 2})) on ` +
    `${run.mediumCount}, and high (>= ${run.threshold * 2}) on ` +
    `${run.highCount}. The final reading is ${finalText}.`
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
  zone: ChartLineUlcerIndexZone,
  lowColor: string,
  mediumColor: string,
  highColor: string,
  noneColor: string,
): string {
  if (zone === 'low') return lowColor;
  if (zone === 'medium') return mediumColor;
  if (zone === 'high') return highColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineUlcerIndexZone): string {
  if (zone === 'low') return 'Low';
  if (zone === 'medium') return 'Medium';
  if (zone === 'high') return 'High';
  return 'n/a';
}

/**
 * ChartLineUlcerIndex -- two-panel pure-SVG Ulcer Index chart.
 */
export const ChartLineUlcerIndex = forwardRef<
  HTMLDivElement,
  ChartLineUlcerIndexProps
>(function ChartLineUlcerIndex(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_ULCER_INDEX_PERIOD,
    threshold = DEFAULT_CHART_LINE_ULCER_INDEX_THRESHOLD,
    width = DEFAULT_CHART_LINE_ULCER_INDEX_WIDTH,
    height = DEFAULT_CHART_LINE_ULCER_INDEX_HEIGHT,
    padding = DEFAULT_CHART_LINE_ULCER_INDEX_PADDING,
    gap = DEFAULT_CHART_LINE_ULCER_INDEX_GAP,
    tickCount = DEFAULT_CHART_LINE_ULCER_INDEX_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_ULCER_INDEX_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_ULCER_INDEX_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ULCER_INDEX_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ULCER_INDEX_PRICE_COLOR,
    ulcerColor = DEFAULT_CHART_LINE_ULCER_INDEX_ULCER_COLOR,
    lowColor = DEFAULT_CHART_LINE_ULCER_INDEX_LOW_COLOR,
    mediumColor = DEFAULT_CHART_LINE_ULCER_INDEX_MEDIUM_COLOR,
    highColor = DEFAULT_CHART_LINE_ULCER_INDEX_HIGH_COLOR,
    noneColor = DEFAULT_CHART_LINE_ULCER_INDEX_NONE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_ULCER_INDEX_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_ULCER_INDEX_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_ULCER_INDEX_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ULCER_INDEX_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showUlcer = true,
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
  const baseId = `chart-line-ulcer-index-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineUlcerIndexSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineUlcerIndexSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineUlcerIndexLayout({
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
    describeLineUlcerIndexChart(data, { period, threshold });
  const resolvedLabel =
    ariaLabel ??
    `Ulcer Index chart, period ${run.period}, threshold ${run.threshold}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineUlcerIndexSeriesId): void => {
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
      <g data-section="chart-line-ulcer-index-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={88}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-ulcer-index-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-ulcer-index-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-ulcer-index-tooltip-ulcer"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Ulcer: ${
            hoverSample.ulcer === null
              ? 'n/a'
              : hoverSample.ulcer.toFixed(4)
          }`}
        </text>
        <text
          data-section="chart-line-ulcer-index-tooltip-zone"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const ulcerHidden = isHidden('ulcer') || !showUlcer;

  const legendItems: Array<{
    id: ChartLineUlcerIndexSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'ulcer', label: 'Ulcer Index', color: ulcerColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-ulcer-index"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-threshold={run.threshold}
      data-ulcer-final={run.ulcerFinal === null ? '' : run.ulcerFinal}
      data-low-count={run.lowCount}
      data-medium-count={run.mediumCount}
      data-high-count={run.highCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-ulcer-index-aria-desc"
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
          data-section="chart-line-ulcer-index-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-ulcer-index-empty"
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
          data-section="chart-line-ulcer-index-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-ulcer-index-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-ulcer-index-grid-line"
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
                  layout.ulcerPanelBottom -
                  t * (layout.ulcerPanelBottom - layout.ulcerPanelTop);
                return (
                  <line
                    key={`ug-${i}`}
                    data-section="chart-line-ulcer-index-grid-line"
                    data-panel="ulcer"
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
            <g data-section="chart-line-ulcer-index-axes">
              <line
                data-section="chart-line-ulcer-index-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ulcer-index-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ulcer-index-axis"
                data-panel="ulcer"
                x1={layout.innerLeft}
                y1={layout.ulcerPanelTop}
                x2={layout.innerLeft}
                y2={layout.ulcerPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ulcer-index-axis"
                data-panel="ulcer"
                x1={layout.innerLeft}
                y1={layout.ulcerPanelBottom}
                x2={layout.innerRight}
                y2={layout.ulcerPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
            </g>
          ) : null}

          <text
            data-section="chart-line-ulcer-index-panel-label"
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
            data-section="chart-line-ulcer-index-panel-label"
            data-panel="ulcer"
            x={layout.innerRight}
            y={layout.ulcerPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Ulcer
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-ulcer-index-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholdLine ? (
            <line
              data-section="chart-line-ulcer-index-threshold-line"
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
              data-section="chart-line-ulcer-index-price-path"
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
            <g data-section="chart-line-ulcer-index-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-ulcer-index-dot"
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

          {!ulcerHidden ? (
            <path
              data-section="chart-line-ulcer-index-line"
              d={layout.ulcerPath}
              fill="none"
              stroke={ulcerColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Ulcer Index line, ${layout.markers.length} points`}
            />
          ) : null}

          {!ulcerHidden && showMarkers ? (
            <g data-section="chart-line-ulcer-index-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-ulcer-index-marker"
                  data-zone={marker.zone}
                  data-ulcer={marker.ulcer}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    lowColor,
                    mediumColor,
                    highColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, ulcer ${formatValue(
                    marker.ulcer,
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
            <g data-section="chart-line-ulcer-index-badge">
              <rect
                data-section="chart-line-ulcer-index-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={108}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-ulcer-index-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`UI ${run.period} thr ${run.threshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-ulcer-index-legend"
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
                data-section="chart-line-ulcer-index-legend-item"
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
                  data-section="chart-line-ulcer-index-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-ulcer-index-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-ulcer-index-legend-stats"
            style={{ color: axisColor }}
          >
            {`low ${run.lowCount} / medium ${run.mediumCount} / high ${run.highCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineUlcerIndex.displayName = 'ChartLineUlcerIndex';
