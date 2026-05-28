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
 * ChartLineUdRatio -- pure-SVG two-panel Up/Down Ratio chart.
 *
 * The Up/Down Ratio reads the bull share of total bar-to-bar change
 * across the lookback. Each bar's price change is signed into a gain on
 * up bars and an absolute loss on down bars; the rolling sums of the
 * two are then turned into the percent up-share:
 *
 *   upGain   = max(price - price[-1], 0)
 *   downLoss = max(price[-1] - price, 0)
 *   udRatio  = 100 * sum(upGain, period) / (sum(upGain, period) + sum(downLoss, period))
 *
 * A strictly rising series gives every change up so the ratio reads
 * exactly 100; a strictly falling one reads 0; a constant series has no
 * change at all and the ratio is null. The 50 line is the balanced
 * midline -- above is bull-led, below is bear-led.
 *
 * The top panel plots the close; the bottom panel plots the UD ratio in
 * a fixed 0..100 band with a horizontal midline.
 */

export interface ChartLineUdRatioPoint {
  x: number;
  value: number;
}

export type ChartLineUdRatioZone = 'up' | 'down' | 'flat' | 'none';

export type ChartLineUdRatioSeriesId = 'price' | 'udRatio';

export interface ChartLineUdRatioComputed {
  upGain: (number | null)[];
  downLoss: (number | null)[];
  udRatio: (number | null)[];
}

export interface ChartLineUdRatioSample {
  index: number;
  x: number;
  value: number;
  upGain: number | null;
  downLoss: number | null;
  udRatio: number | null;
  zone: ChartLineUdRatioZone;
}

export interface ChartLineUdRatioRun {
  series: ChartLineUdRatioPoint[];
  period: number;
  upGain: (number | null)[];
  downLoss: (number | null)[];
  udRatio: (number | null)[];
  samples: ChartLineUdRatioSample[];
  udRatioFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineUdRatioMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  udRatio: number;
  zone: ChartLineUdRatioZone;
}

export interface ChartLineUdRatioDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineUdRatioLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  udPanelTop: number;
  udPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineUdRatioDot[];
  udRatioPath: string;
  markers: ChartLineUdRatioMarker[];
  midlineY: number;
  priceMin: number;
  priceMax: number;
  udMin: number;
  udMax: number;
  run: ChartLineUdRatioRun;
}

export interface ChartLineUdRatioProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineUdRatioPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  udRatioColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  midlineColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showUdRatio?: boolean;
  showMidline?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineUdRatioSeriesId[];
  defaultHiddenSeries?: ChartLineUdRatioSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineUdRatioSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineUdRatioSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_UD_RATIO_WIDTH = 720;
export const DEFAULT_CHART_LINE_UD_RATIO_HEIGHT = 400;
export const DEFAULT_CHART_LINE_UD_RATIO_PADDING = 44;
export const DEFAULT_CHART_LINE_UD_RATIO_GAP = 12;
export const DEFAULT_CHART_LINE_UD_RATIO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_UD_RATIO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_UD_RATIO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_UD_RATIO_PERIOD = 14;
export const DEFAULT_CHART_LINE_UD_RATIO_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_UD_RATIO_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_UD_RATIO_UD_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_UD_RATIO_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_UD_RATIO_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_UD_RATIO_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_UD_RATIO_MIDLINE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_UD_RATIO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_UD_RATIO_AXIS_COLOR = '#94a3b8';

/** The balanced midline -- equal up and down change. */
export const CHART_LINE_UD_RATIO_MIDLINE = 50;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineUdRatioFinitePoints(
  data: readonly ChartLineUdRatioPoint[] | null | undefined,
): ChartLineUdRatioPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineUdRatioPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce the lookback period to an integer of at least 1, else fallback. */
export function normalizeLineUdRatioPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/**
 * Compute the Up/Down Ratio pipeline: per bar the split of the
 * bar-to-bar price change into upGain and downLoss, then the rolling
 * percent `100 * sum(upGain) / (sum(upGain) + sum(downLoss))` over the
 * lookback. A window with no change at all (sum equals zero) yields
 * null.
 */
export function computeLineUdRatio(
  values: readonly number[] | null | undefined,
  period: unknown,
): ChartLineUdRatioComputed {
  if (!Array.isArray(values)) {
    return { upGain: [], downLoss: [], udRatio: [] };
  }
  const p = normalizeLineUdRatioPeriod(
    period,
    DEFAULT_CHART_LINE_UD_RATIO_PERIOD,
  );
  const n = values.length;
  const upGain: (number | null)[] = [];
  const downLoss: (number | null)[] = [];
  for (let i = 0; i < n; i += 1) {
    if (i === 0) {
      upGain.push(null);
      downLoss.push(null);
      continue;
    }
    const v0 = values[i];
    const v1 = values[i - 1];
    if (!isFiniteNumber(v0) || !isFiniteNumber(v1)) {
      upGain.push(null);
      downLoss.push(null);
      continue;
    }
    const delta = v0 - v1;
    upGain.push(delta > 0 ? delta : 0);
    downLoss.push(delta < 0 ? -delta : 0);
  }
  const udRatio: (number | null)[] = [];
  for (let i = 0; i < n; i += 1) {
    if (i < p) {
      udRatio.push(null);
      continue;
    }
    let sumUp = 0;
    let sumDown = 0;
    let ok = true;
    for (let j = 0; j < p; j += 1) {
      const u = upGain[i - j];
      const d = downLoss[i - j];
      if (u == null || d == null) {
        ok = false;
        break;
      }
      sumUp += u;
      sumDown += d;
    }
    if (!ok) {
      udRatio.push(null);
      continue;
    }
    const total = sumUp + sumDown;
    udRatio.push(total > 0 ? (100 * sumUp) / total : null);
  }
  return { upGain, downLoss, udRatio };
}

/** Classify a bar by the UD ratio against the 50 midline. */
export function classifyLineUdRatioZone(
  udRatio: number | null,
): ChartLineUdRatioZone {
  if (!isFiniteNumber(udRatio)) return 'none';
  if (udRatio > CHART_LINE_UD_RATIO_MIDLINE) return 'up';
  if (udRatio < CHART_LINE_UD_RATIO_MIDLINE) return 'down';
  return 'flat';
}

export interface ChartLineUdRatioOptions {
  period?: number;
}

/** Run the full UD Ratio pipeline over a set of points. */
export function runLineUdRatio(
  data: readonly ChartLineUdRatioPoint[] | null | undefined,
  options: ChartLineUdRatioOptions = {},
): ChartLineUdRatioRun {
  const series = getLineUdRatioFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineUdRatioPeriod(
    options.period,
    DEFAULT_CHART_LINE_UD_RATIO_PERIOD,
  );
  const values = series.map((p) => p.value);
  const { upGain, downLoss, udRatio } = computeLineUdRatio(values, period);

  const samples: ChartLineUdRatioSample[] = series.map((point, index) => {
    const udValue = udRatio[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      upGain: upGain[index] ?? null,
      downLoss: downLoss[index] ?? null,
      udRatio: udValue,
      zone: classifyLineUdRatioZone(udValue),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let udRatioFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.udRatio)) udRatioFinal = sample.udRatio;
  }

  return {
    series = [],
    period,
    upGain,
    downLoss,
    udRatio,
    samples,
    udRatioFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineUdRatioLayoutOptions extends ChartLineUdRatioOptions {
  data: readonly ChartLineUdRatioPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
}

function buildLinePath(points: ReadonlyArray<{ x: number; y: number }>): string {
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
export function computeLineUdRatioLayout(
  options: ChartLineUdRatioLayoutOptions,
): ChartLineUdRatioLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_UD_RATIO_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_UD_RATIO_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_UD_RATIO_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_UD_RATIO_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_UD_RATIO_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineUdRatio(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const udPanelTop = pricePanelBottom + gap;
  const udPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 && pricePanelHeight > 0 && udPanelBottom - udPanelTop > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const point of run.series) {
    if (point.value < priceMin) priceMin = point.value;
    if (point.value > priceMax) priceMax = point.value;
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

  const udMin = -5;
  const udMax = 105;
  const udPanelHeight = udPanelBottom - udPanelTop;
  const udYAt = (value: number): number =>
    udPanelBottom - ((value - udMin) / (udMax - udMin)) * udPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineUdRatioDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = priceYAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const udLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineUdRatioMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.udRatio)) return;
    const cx = xAt(index);
    const cy = udYAt(sample.udRatio);
    udLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      udRatio: sample.udRatio,
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
    udPanelTop,
    udPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    udRatioPath: buildLinePath(udLinePoints),
    markers,
    midlineY: udYAt(CHART_LINE_UD_RATIO_MIDLINE),
    priceMin,
    priceMax,
    udMin,
    udMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineUdRatioChart(
  data: readonly ChartLineUdRatioPoint[] | null | undefined,
  options: ChartLineUdRatioOptions = {},
): string {
  const run = runLineUdRatio(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.udRatioFinal === null ? 'n/a' : run.udRatioFinal.toFixed(2);
  return (
    `Two-panel chart with the Up/Down Ratio (period ${run.period}): ` +
    `the top panel plots the close, the bottom panel plots the ratio of ` +
    `total up-bar change to total down-bar change as a 0..100 ` +
    `percentage. A bar's change is split into upGain on up bars and ` +
    `downLoss on down bars; the UD ratio is ` +
    `100 * sum(upGain) / (sum(upGain) + sum(downLoss)) across the ` +
    `lookback. Above the 50 midline the bull side leads, below it the ` +
    `bear side leads. Across ${total} bars the ratio is above the ` +
    `midline on ${run.upCount}, below on ${run.downCount} and at the ` +
    `midline on ${run.flatCount}. The final UD ratio reading is ` +
    `${finalText}.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineUdRatioZone,
  upColor: string,
  downColor: string,
  flatColor: string,
): string {
  if (zone === 'up') return upColor;
  if (zone === 'down') return downColor;
  return flatColor;
}

function zoneLabelOf(zone: ChartLineUdRatioZone): string {
  if (zone === 'up') return 'Bull-led';
  if (zone === 'down') return 'Bear-led';
  if (zone === 'flat') return 'Balanced';
  return 'n/a';
}

/**
 * ChartLineUdRatio -- two-panel pure-SVG Up/Down Ratio chart.
 */
export const ChartLineUdRatio = forwardRef<
  HTMLDivElement,
  ChartLineUdRatioProps
>(function ChartLineUdRatio(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_UD_RATIO_PERIOD,
    width = DEFAULT_CHART_LINE_UD_RATIO_WIDTH,
    height = DEFAULT_CHART_LINE_UD_RATIO_HEIGHT,
    padding = DEFAULT_CHART_LINE_UD_RATIO_PADDING,
    gap = DEFAULT_CHART_LINE_UD_RATIO_GAP,
    tickCount = DEFAULT_CHART_LINE_UD_RATIO_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_UD_RATIO_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_UD_RATIO_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_UD_RATIO_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_UD_RATIO_PRICE_COLOR,
    udRatioColor = DEFAULT_CHART_LINE_UD_RATIO_UD_COLOR,
    upColor = DEFAULT_CHART_LINE_UD_RATIO_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_UD_RATIO_DOWN_COLOR,
    flatColor = DEFAULT_CHART_LINE_UD_RATIO_FLAT_COLOR,
    midlineColor = DEFAULT_CHART_LINE_UD_RATIO_MIDLINE_COLOR,
    gridColor = DEFAULT_CHART_LINE_UD_RATIO_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_UD_RATIO_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showUdRatio = true,
    showMidline = true,
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
  const baseId = `chart-line-ud-ratio-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineUdRatioSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineUdRatioSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineUdRatioLayout({
        data,
        period,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [data, period, width, height, padding, gap, pricePanelRatio],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineUdRatioChart(data, { period });
  const resolvedLabel =
    ariaLabel ?? `Up/Down Ratio chart, period ${run.period}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineUdRatioSeriesId): void => {
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
    const tooltipW = 192;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.pricePanelTop + 6;
    tooltip = (
      <g data-section="chart-line-ud-ratio-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={112}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-ud-ratio-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-ud-ratio-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-ud-ratio-tooltip-up-gain"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Up gain: ${
            hoverSample.upGain === null
              ? 'n/a'
              : formatValue(hoverSample.upGain)
          }`}
        </text>
        <text
          data-section="chart-line-ud-ratio-tooltip-down-loss"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Down loss: ${
            hoverSample.downLoss === null
              ? 'n/a'
              : formatValue(hoverSample.downLoss)
          }`}
        </text>
        <text
          data-section="chart-line-ud-ratio-tooltip-ud-ratio"
          x={tx + 10}
          y={ty + 83}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`UD ratio: ${
            hoverSample.udRatio === null
              ? 'n/a'
              : formatValue(hoverSample.udRatio)
          }`}
        </text>
        <text
          data-section="chart-line-ud-ratio-tooltip-zone"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Balance: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const udHidden = isHidden('udRatio') || !showUdRatio;

  const legendItems: Array<{
    id: ChartLineUdRatioSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'udRatio', label: 'UD Ratio', color: udRatioColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-ud-ratio"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-ud-ratio-final={
        run.udRatioFinal === null ? '' : run.udRatioFinal
      }
      data-up-count={run.upCount}
      data-down-count={run.downCount}
      data-flat-count={run.flatCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-ud-ratio-aria-desc"
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
          data-section="chart-line-ud-ratio-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-ud-ratio-empty"
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
          data-section="chart-line-ud-ratio-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-ud-ratio-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-ud-ratio-grid-line"
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
                const uy =
                  layout.udPanelBottom -
                  t * (layout.udPanelBottom - layout.udPanelTop);
                return (
                  <line
                    key={`ug-${i}`}
                    data-section="chart-line-ud-ratio-grid-line"
                    data-panel="ud"
                    x1={layout.innerLeft}
                    y1={uy}
                    x2={layout.innerRight}
                    y2={uy}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-ud-ratio-axes">
              <line
                data-section="chart-line-ud-ratio-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ud-ratio-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ud-ratio-axis"
                data-panel="ud"
                x1={layout.innerLeft}
                y1={layout.udPanelTop}
                x2={layout.innerLeft}
                y2={layout.udPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ud-ratio-axis"
                data-panel="ud"
                x1={layout.innerLeft}
                y1={layout.udPanelBottom}
                x2={layout.innerRight}
                y2={layout.udPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-ud-ratio-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.pricePanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.priceMax)}
              </text>
              <text
                data-section="chart-line-ud-ratio-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.pricePanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.priceMin)}
              </text>
              <text
                data-section="chart-line-ud-ratio-tick-label"
                data-panel="ud"
                x={layout.innerLeft - 6}
                y={layout.udPanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                100
              </text>
              <text
                data-section="chart-line-ud-ratio-tick-label"
                data-panel="ud"
                x={layout.innerLeft - 6}
                y={layout.udPanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                0
              </text>
            </g>
          ) : null}

          <text
            data-section="chart-line-ud-ratio-panel-label"
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
            data-section="chart-line-ud-ratio-panel-label"
            data-panel="ud"
            x={layout.innerRight}
            y={layout.udPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Up/Down Ratio
          </text>

          {showMidline ? (
            <line
              data-section="chart-line-ud-ratio-midline"
              x1={layout.innerLeft}
              y1={layout.midlineY}
              x2={layout.innerRight}
              y2={layout.midlineY}
              stroke={midlineColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-ud-ratio-price-path"
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
            <g data-section="chart-line-ud-ratio-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-ud-ratio-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, close ${formatValue(
                    dot.value,
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

          {!udHidden ? (
            <path
              data-section="chart-line-ud-ratio-ud-line"
              d={layout.udRatioPath}
              fill="none"
              stroke={udRatioColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`UD Ratio line, ${layout.markers.length} points`}
            />
          ) : null}

          {!udHidden && showMarkers ? (
            <g data-section="chart-line-ud-ratio-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-ud-ratio-marker"
                  data-zone={marker.zone}
                  data-ud-ratio={marker.udRatio}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(marker.zone, upColor, downColor, flatColor)}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, ud ratio ${formatValue(
                    marker.udRatio,
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
            <g data-section="chart-line-ud-ratio-badge">
              <rect
                data-section="chart-line-ud-ratio-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={56}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-ud-ratio-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`UD ${run.period}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-ud-ratio-legend"
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
                data-section="chart-line-ud-ratio-legend-item"
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
                  data-section="chart-line-ud-ratio-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-ud-ratio-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-ud-ratio-legend-stats"
            style={{ color: axisColor }}
          >
            {`up ${run.upCount} / down ${run.downCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineUdRatio.displayName = 'ChartLineUdRatio';
