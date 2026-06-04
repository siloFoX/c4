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
 * ChartLineKaufmanEfficiency -- pure-SVG two-panel Kaufman
 * Efficiency Ratio chart (Perry Kaufman).
 *
 * The ER measures the directional efficiency of a price move
 * across a lookback `period`. For each bar `i >= period`:
 *
 *   net      = abs(close[i] - close[i - period])
 *   volSum   = sum(abs(close[j] - close[j - 1])) for j in [i - period + 1, i]
 *   ER[i]    = net / volSum
 *
 * Bounded `[0, 1]`. A pure monotone move reads `+1` (net equals
 * volSum). A perfectly choppy series that returns to its start
 * reads `0` (net = 0 with non-zero volSum). A constant series
 * leaves the bar null (zero denominator).
 *
 * Four bit-exact anchors hold on integer fixtures:
 *
 *   * `CONST_FLAT (close == K)` -> `net = 0`, `volSum = 0`, so
 *     `ER` is null at every bar.
 *   * `RISING (close == i + 10, monotone increasing)` -> every
 *     delta `+1`, so `net = period`, `volSum = period`, `ER = 1`
 *     bit-exact.
 *   * `FALLING (close == 19 - i, monotone decreasing)` -> same
 *     `ER = 1` bit-exact (every delta is `-1`).
 *   * `ZIGZAG (close == [10, 11, 10, 11, ...])` period 4 -> at
 *     bar 4 `close[4] == close[0] = 10`, so `net = 0`, `volSum =
 *     4`, `ER = 0` bit-exact.
 *
 * The top panel plots the close; the bottom panel plots the ER
 * in a fixed `[0, 1]` band with a `threshold` dashed line.
 */

export interface ChartLineKaufmanEfficiencyPoint {
  x: number;
  close: number;
}

export type ChartLineKaufmanEfficiencyZone =
  | 'high'
  | 'medium'
  | 'low'
  | 'none';

export type ChartLineKaufmanEfficiencySeriesId = 'price' | 'er';

export interface ChartLineKaufmanEfficiencySample {
  index: number;
  x: number;
  close: number;
  er: number | null;
  zone: ChartLineKaufmanEfficiencyZone;
}

export interface ChartLineKaufmanEfficiencyRun {
  series: ChartLineKaufmanEfficiencyPoint[];
  period: number;
  threshold: number;
  er: Array<number | null>;
  samples: ChartLineKaufmanEfficiencySample[];
  erFinal: number | null;
  erMax: number | null;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  ok: boolean;
}

export interface ChartLineKaufmanEfficiencyMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  er: number;
  zone: ChartLineKaufmanEfficiencyZone;
}

export interface ChartLineKaufmanEfficiencyDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineKaufmanEfficiencyLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  erPanelTop: number;
  erPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineKaufmanEfficiencyDot[];
  erPath: string;
  markers: ChartLineKaufmanEfficiencyMarker[];
  thresholdY: number;
  zeroY: number;
  oneY: number;
  priceMin: number;
  priceMax: number;
  erMin: number;
  erMax: number;
  run: ChartLineKaufmanEfficiencyRun;
}

export interface ChartLineKaufmanEfficiencyProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineKaufmanEfficiencyPoint[];
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
  erColor?: string;
  highColor?: string;
  mediumColor?: string;
  lowColor?: string;
  noneColor?: string;
  thresholdColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showEr?: boolean;
  showThresholdLine?: boolean;
  showZeroLine?: boolean;
  showOneLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineKaufmanEfficiencySeriesId[];
  defaultHiddenSeries?: ChartLineKaufmanEfficiencySeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineKaufmanEfficiencySeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineKaufmanEfficiencySample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_WIDTH = 720;
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_HEIGHT = 400;
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_PADDING = 44;
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_GAP = 12;
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_PERIOD = 10;
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_THRESHOLD = 0.3;
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_ER_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_HIGH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_MEDIUM_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_LOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineKaufmanEfficiencyFinitePoints(
  data: readonly ChartLineKaufmanEfficiencyPoint[] | null | undefined,
): ChartLineKaufmanEfficiencyPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineKaufmanEfficiencyPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce the lookback period to an integer of at least 2. */
export function normalizeLineKaufmanEfficiencyPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** Coerce the threshold to a finite in `(0, 1)`. */
export function normalizeLineKaufmanEfficiencyThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0 && threshold < 1) {
    return threshold;
  }
  return fallback;
}

/**
 * Run the Efficiency Ratio pipeline per bar. The first `period`
 * bars are null. A bar with a zero volSum (every delta in the
 * window is zero) is also null.
 */
export function computeLineKaufmanEfficiency(
  closes: readonly number[] | null | undefined,
  period: unknown,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const p = normalizeLineKaufmanEfficiencyPeriod(
    period,
    DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_PERIOD,
  );
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < p) {
      out.push(null);
      continue;
    }
    const start = closes[i - p];
    const end = closes[i];
    if (!isFiniteNumber(start) || !isFiniteNumber(end)) {
      out.push(null);
      continue;
    }
    const net = Math.abs(end - start);
    let volSum = 0;
    let ok = true;
    for (let j = i - p + 1; j <= i; j += 1) {
      const c = closes[j];
      const cPrev = closes[j - 1];
      if (!isFiniteNumber(c) || !isFiniteNumber(cPrev)) {
        ok = false;
        break;
      }
      volSum += Math.abs(c - cPrev);
    }
    if (!ok || volSum === 0) {
      out.push(null);
      continue;
    }
    out.push(net / volSum);
  }
  return out;
}

/** Classify an ER reading against the threshold ladder. */
export function classifyLineKaufmanEfficiencyZone(
  value: number | null,
  threshold: number,
): ChartLineKaufmanEfficiencyZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= threshold * 2) return 'high';
  if (value >= threshold) return 'medium';
  return 'low';
}

export interface ChartLineKaufmanEfficiencyOptions {
  period?: number;
  threshold?: number;
}

/** Run the full ER pipeline. */
export function runLineKaufmanEfficiency(
  data: readonly ChartLineKaufmanEfficiencyPoint[] | null | undefined,
  options: ChartLineKaufmanEfficiencyOptions = {},
): ChartLineKaufmanEfficiencyRun {
  const series = getLineKaufmanEfficiencyFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineKaufmanEfficiencyPeriod(
    options.period,
    DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_PERIOD,
  );
  const threshold = normalizeLineKaufmanEfficiencyThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_THRESHOLD,
  );
  const closes = series.map((p) => p.close);
  const er = computeLineKaufmanEfficiency(closes, period);
  const samples: ChartLineKaufmanEfficiencySample[] = series.map(
    (point, index) => {
      const value = er[index] ?? null;
      return {
        index,
        x: point.x,
        close: point.close,
        er: value,
        zone: classifyLineKaufmanEfficiencyZone(value, threshold),
      };
    },
  );
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let erFinal: number | null = null;
  let erMax: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'high') highCount += 1;
    else if (sample.zone === 'medium') mediumCount += 1;
    else if (sample.zone === 'low') lowCount += 1;
    if (isFiniteNumber(sample.er)) {
      erFinal = sample.er;
      if (erMax === null || sample.er > erMax) erMax = sample.er;
    }
  }
  return {
    series,
    period,
    threshold,
    er,
    samples,
    erFinal,
    erMax,
    highCount,
    mediumCount,
    lowCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineKaufmanEfficiencyLayoutOptions
  extends ChartLineKaufmanEfficiencyOptions {
  data: readonly ChartLineKaufmanEfficiencyPoint[] | null | undefined;
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
export function computeLineKaufmanEfficiencyLayout(
  options: ChartLineKaufmanEfficiencyLayoutOptions,
): ChartLineKaufmanEfficiencyLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineKaufmanEfficiency(options.data, {
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
  const erPanelTop = pricePanelBottom + gap;
  const erPanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    erPanelBottom - erPanelTop > 0;
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

  const erMin = 0;
  const erMax = 1.05;
  const erPanelHeight = erPanelBottom - erPanelTop;
  const erYAt = (value: number): number =>
    erPanelBottom - ((value - erMin) / (erMax - erMin)) * erPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineKaufmanEfficiencyDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const erLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineKaufmanEfficiencyMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.er)) return;
    const cx = xAt(index);
    const cy = erYAt(sample.er);
    erLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      er: sample.er,
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
    erPanelTop,
    erPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    erPath: buildLinePath(erLinePoints),
    markers,
    thresholdY: erYAt(run.threshold),
    zeroY: erYAt(0),
    oneY: erYAt(1),
    priceMin,
    priceMax,
    erMin,
    erMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineKaufmanEfficiencyChart(
  data: readonly ChartLineKaufmanEfficiencyPoint[] | null | undefined,
  options: ChartLineKaufmanEfficiencyOptions = {},
): string {
  const run = runLineKaufmanEfficiency(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.erFinal === null ? 'n/a' : run.erFinal.toFixed(4);
  return (
    `Two-panel chart with a Perry Kaufman Efficiency Ratio panel ` +
    `(period ${run.period}, threshold ${run.threshold}): the top ` +
    `panel plots the close, the bottom panel plots the ER in the ` +
    `[0, 1] band. The ER is net price change over the sum of ` +
    `absolute single-bar changes across the lookback. A pure ` +
    `monotone trend reads +1; a perfectly choppy series that ` +
    `returns to its start reads 0; a constant series leaves the ` +
    `bar null. Across ${total} bars the ER reads high ` +
    `(>= ${run.threshold * 2}) on ${run.highCount}, medium ` +
    `(>= ${run.threshold}) on ${run.mediumCount}, and low ` +
    `(< ${run.threshold}) on ${run.lowCount}. The final reading ` +
    `is ${finalText}.`
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
  zone: ChartLineKaufmanEfficiencyZone,
  highColor: string,
  mediumColor: string,
  lowColor: string,
  noneColor: string,
): string {
  if (zone === 'high') return highColor;
  if (zone === 'medium') return mediumColor;
  if (zone === 'low') return lowColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineKaufmanEfficiencyZone): string {
  if (zone === 'high') return 'High';
  if (zone === 'medium') return 'Medium';
  if (zone === 'low') return 'Low';
  return 'n/a';
}

/**
 * ChartLineKaufmanEfficiency -- two-panel pure-SVG Kaufman
 * Efficiency Ratio chart.
 */
export const ChartLineKaufmanEfficiency = forwardRef<
  HTMLDivElement,
  ChartLineKaufmanEfficiencyProps
>(function ChartLineKaufmanEfficiency(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_PERIOD,
    threshold = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_THRESHOLD,
    width = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_WIDTH,
    height = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_HEIGHT,
    padding = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_PADDING,
    gap = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_GAP,
    tickCount = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_PRICE_COLOR,
    erColor = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_ER_COLOR,
    highColor = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_HIGH_COLOR,
    mediumColor = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_MEDIUM_COLOR,
    lowColor = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_LOW_COLOR,
    noneColor = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_NONE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showEr = true,
    showThresholdLine = true,
    showZeroLine = true,
    showOneLine = true,
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
  const baseId = `chart-line-kaufman-efficiency-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineKaufmanEfficiencySeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineKaufmanEfficiencySeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineKaufmanEfficiencyLayout({
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
    describeLineKaufmanEfficiencyChart(data, { period, threshold });
  const resolvedLabel =
    ariaLabel ??
    `Kaufman Efficiency Ratio chart, period ${run.period}, threshold ${run.threshold}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineKaufmanEfficiencySeriesId): void => {
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
        data-section="chart-line-kaufman-efficiency-tooltip"
        pointerEvents="none"
      >
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
          data-section="chart-line-kaufman-efficiency-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-kaufman-efficiency-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-kaufman-efficiency-tooltip-er"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`ER: ${
            hoverSample.er === null ? 'n/a' : hoverSample.er.toFixed(4)
          }`}
        </text>
        <text
          data-section="chart-line-kaufman-efficiency-tooltip-zone"
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
  const erHidden = isHidden('er') || !showEr;

  const legendItems: Array<{
    id: ChartLineKaufmanEfficiencySeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'er', label: 'Efficiency', color: erColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-kaufman-efficiency"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-threshold={run.threshold}
      data-er-final={run.erFinal === null ? '' : run.erFinal}
      data-high-count={run.highCount}
      data-medium-count={run.mediumCount}
      data-low-count={run.lowCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-kaufman-efficiency-aria-desc"
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
          data-section="chart-line-kaufman-efficiency-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-kaufman-efficiency-empty"
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
          data-section="chart-line-kaufman-efficiency-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-kaufman-efficiency-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-kaufman-efficiency-grid-line"
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
                  layout.erPanelBottom -
                  t * (layout.erPanelBottom - layout.erPanelTop);
                return (
                  <line
                    key={`eg-${i}`}
                    data-section="chart-line-kaufman-efficiency-grid-line"
                    data-panel="er"
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
            <g data-section="chart-line-kaufman-efficiency-axes">
              <line
                data-section="chart-line-kaufman-efficiency-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-kaufman-efficiency-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-kaufman-efficiency-axis"
                data-panel="er"
                x1={layout.innerLeft}
                y1={layout.erPanelTop}
                x2={layout.innerLeft}
                y2={layout.erPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-kaufman-efficiency-axis"
                data-panel="er"
                x1={layout.innerLeft}
                y1={layout.erPanelBottom}
                x2={layout.innerRight}
                y2={layout.erPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
            </g>
          ) : null}

          <text
            data-section="chart-line-kaufman-efficiency-panel-label"
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
            data-section="chart-line-kaufman-efficiency-panel-label"
            data-panel="er"
            x={layout.innerRight}
            y={layout.erPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            ER
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-kaufman-efficiency-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
            />
          ) : null}

          {showOneLine ? (
            <line
              data-section="chart-line-kaufman-efficiency-one-line"
              x1={layout.innerLeft}
              y1={layout.oneY}
              x2={layout.innerRight}
              y2={layout.oneY}
              stroke={zeroColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholdLine ? (
            <line
              data-section="chart-line-kaufman-efficiency-threshold-line"
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
              data-section="chart-line-kaufman-efficiency-price-path"
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
            <g data-section="chart-line-kaufman-efficiency-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-kaufman-efficiency-dot"
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

          {!erHidden ? (
            <path
              data-section="chart-line-kaufman-efficiency-line"
              d={layout.erPath}
              fill="none"
              stroke={erColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Efficiency Ratio line, ${layout.markers.length} points`}
            />
          ) : null}

          {!erHidden && showMarkers ? (
            <g data-section="chart-line-kaufman-efficiency-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-kaufman-efficiency-marker"
                  data-zone={marker.zone}
                  data-er={marker.er}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    highColor,
                    mediumColor,
                    lowColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, ER ${formatValue(
                    marker.er,
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
            <g data-section="chart-line-kaufman-efficiency-badge">
              <rect
                data-section="chart-line-kaufman-efficiency-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={108}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-kaufman-efficiency-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`ER ${run.period} thr ${run.threshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-kaufman-efficiency-legend"
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
                data-section="chart-line-kaufman-efficiency-legend-item"
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
                  data-section="chart-line-kaufman-efficiency-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-kaufman-efficiency-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-kaufman-efficiency-legend-stats"
            style={{ color: axisColor }}
          >
            {`high ${run.highCount} / medium ${run.mediumCount} / low ${run.lowCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineKaufmanEfficiency.displayName = 'ChartLineKaufmanEfficiency';
