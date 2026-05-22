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
 * ChartLineHighpass -- pure-SVG two-panel Ehlers Highpass Filter chart.
 *
 * John Ehlers' Highpass Filter removes the low-frequency trend component
 * of a price series, passing only the faster cyclic swings. It is a
 * two-pole filter whose coefficients come from a single cutoff `period`:
 *
 *   a1 = exp(-1.414*pi / period)
 *   b1 = 2*a1*cos(1.414*pi / period)
 *   c2 = b1,  c3 = -a1*a1,  c1 = (1 + c2 - c3) / 4
 *   hp[i] = c1*(price[i] - 2*price[i-1] + price[i-2])
 *         + c2*hp[i-1] + c3*hp[i-2]
 *
 * The filter is driven by the price's SECOND DIFFERENCE. The second
 * difference of any straight line is identically zero, so a constant
 * level and a linear trend are both driven to exactly zero -- that is
 * what makes this a highpass: the trend is removed and only the
 * curvature, the cyclic content, survives. A trigger line -- the
 * highpass delayed one bar -- accompanies it.
 *
 * The top panel plots the price; the bottom panel plots the highpass
 * and its trigger with a zero line.
 */

export interface ChartLineHighpassPoint {
  x: number;
  value: number;
}

export type ChartLineHighpassZone = 'up' | 'down' | 'flat' | 'none';

export type ChartLineHighpassSeriesId = 'price' | 'highpass' | 'trigger';

export interface ChartLineHighpassCoefficients {
  a1: number;
  b1: number;
  c1: number;
  c2: number;
  c3: number;
}

export interface ChartLineHighpassSample {
  index: number;
  x: number;
  value: number;
  hp: number | null;
  trigger: number | null;
  zone: ChartLineHighpassZone;
}

export interface ChartLineHighpassRun {
  series: ChartLineHighpassPoint[];
  period: number;
  a1: number;
  b1: number;
  c1: number;
  c2: number;
  c3: number;
  hp: number[];
  trigger: (number | null)[];
  samples: ChartLineHighpassSample[];
  hpFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineHighpassMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  hp: number;
  zone: ChartLineHighpassZone;
}

export interface ChartLineHighpassDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineHighpassLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  hpPanelTop: number;
  hpPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineHighpassDot[];
  highpassPath: string;
  triggerPath: string;
  markers: ChartLineHighpassMarker[];
  zeroY: number;
  priceMin: number;
  priceMax: number;
  hpMin: number;
  hpMax: number;
  run: ChartLineHighpassRun;
}

export interface ChartLineHighpassProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineHighpassPoint[];
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
  highpassColor?: string;
  triggerColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showHighpass?: boolean;
  showTrigger?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineHighpassSeriesId[];
  defaultHiddenSeries?: ChartLineHighpassSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineHighpassSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineHighpassSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_HIGHPASS_WIDTH = 720;
export const DEFAULT_CHART_LINE_HIGHPASS_HEIGHT = 400;
export const DEFAULT_CHART_LINE_HIGHPASS_PADDING = 44;
export const DEFAULT_CHART_LINE_HIGHPASS_GAP = 12;
export const DEFAULT_CHART_LINE_HIGHPASS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HIGHPASS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HIGHPASS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HIGHPASS_PERIOD = 20;
export const DEFAULT_CHART_LINE_HIGHPASS_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_HIGHPASS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_HIGHPASS_HIGHPASS_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_HIGHPASS_TRIGGER_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_HIGHPASS_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HIGHPASS_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HIGHPASS_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_HIGHPASS_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_HIGHPASS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_HIGHPASS_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineHighpassFinitePoints(
  data: readonly ChartLineHighpassPoint[] | null | undefined,
): ChartLineHighpassPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineHighpassPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce the cutoff period to an integer of at least 2, else fallback. */
export function normalizeLineHighpassPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/**
 * The two-pole Ehlers Highpass coefficients from a cutoff `period`:
 *   a1 = exp(-1.414*pi / period)
 *   b1 = 2*a1*cos(1.414*pi / period)
 *   c2 = b1,  c3 = -a1*a1,  c1 = (1 + c2 - c3) / 4
 */
export function computeLineHighpassCoefficients(
  period: unknown,
): ChartLineHighpassCoefficients {
  const p = normalizeLineHighpassPeriod(period, DEFAULT_CHART_LINE_HIGHPASS_PERIOD);
  const a1 = Math.exp((-1.414 * Math.PI) / p);
  const b1 = 2 * a1 * Math.cos((1.414 * Math.PI) / p);
  const c2 = b1;
  const c3 = -(a1 * a1);
  const c1 = (1 + c2 - c3) / 4;
  return { a1, b1, c1, c2, c3 };
}

/**
 * Run the two-pole Ehlers Highpass Filter over a series of values. The
 * filter is driven by the price's second difference; the first two bars
 * are seeded at zero. Because the second difference of any straight line
 * is zero, a constant level and a linear trend are both driven to exactly
 * zero. A non-array input yields an empty array.
 */
export function computeLineHighpass(
  values: readonly number[] | null | undefined,
  period: unknown,
): number[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const { c1, c2, c3 } = computeLineHighpassCoefficients(period);
  const hp: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    if (i < 2) {
      hp[i] = 0;
      continue;
    }
    const v0 = values[i];
    const v1 = values[i - 1];
    const v2 = values[i - 2];
    const secondDiff =
      isFiniteNumber(v0) && isFiniteNumber(v1) && isFiniteNumber(v2)
        ? v0 - 2 * v1 + v2
        : 0;
    const prev1 = hp[i - 1] as number;
    const prev2 = hp[i - 2] as number;
    hp[i] = c1 * secondDiff + c2 * prev1 + c3 * prev2;
  }
  return hp;
}

/** Classify a bar by the sign of the highpass output. */
export function classifyLineHighpassZone(
  hp: number | null,
): ChartLineHighpassZone {
  if (!isFiniteNumber(hp)) return 'none';
  if (hp > 0) return 'up';
  if (hp < 0) return 'down';
  return 'flat';
}

export interface ChartLineHighpassOptions {
  period?: number;
}

/** Run the full Ehlers Highpass pipeline over a set of points. */
export function runLineHighpass(
  data: readonly ChartLineHighpassPoint[] | null | undefined,
  options: ChartLineHighpassOptions = {},
): ChartLineHighpassRun {
  const series = getLineHighpassFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineHighpassPeriod(
    options.period,
    DEFAULT_CHART_LINE_HIGHPASS_PERIOD,
  );
  const { a1, b1, c1, c2, c3 } = computeLineHighpassCoefficients(period);
  const values = series.map((point) => point.value);
  const hp = computeLineHighpass(values, period);
  const trigger: (number | null)[] = hp.map((_, i) =>
    i > 0 ? (hp[i - 1] as number) : null,
  );

  const samples: ChartLineHighpassSample[] = series.map((point, index) => {
    const hpValue = hp[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      hp: hpValue,
      trigger: trigger[index] ?? null,
      zone: classifyLineHighpassZone(hpValue),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let hpFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.hp)) hpFinal = sample.hp;
  }

  return {
    series,
    period,
    a1,
    b1,
    c1,
    c2,
    c3,
    hp,
    trigger,
    samples,
    hpFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineHighpassLayoutOptions
  extends ChartLineHighpassOptions {
  data: readonly ChartLineHighpassPoint[] | null | undefined;
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
export function computeLineHighpassLayout(
  options: ChartLineHighpassLayoutOptions,
): ChartLineHighpassLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_HIGHPASS_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_HIGHPASS_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_HIGHPASS_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_HIGHPASS_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_HIGHPASS_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineHighpass(options.data, {
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
  const hpPanelTop = pricePanelBottom + gap;
  const hpPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 && pricePanelHeight > 0 && hpPanelBottom - hpPanelTop > 0;
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

  let hpMin = 0;
  let hpMax = 0;
  for (const value of run.hp) {
    if (!isFiniteNumber(value)) continue;
    if (value < hpMin) hpMin = value;
    if (value > hpMax) hpMax = value;
  }
  for (const value of run.trigger) {
    if (!isFiniteNumber(value)) continue;
    if (value < hpMin) hpMin = value;
    if (value > hpMax) hpMax = value;
  }
  if (hpMin === hpMax) {
    hpMin -= 1;
    hpMax += 1;
  }
  const hpPanelHeight = hpPanelBottom - hpPanelTop;
  const hpYAt = (value: number): number =>
    hpPanelBottom - ((value - hpMin) / (hpMax - hpMin)) * hpPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineHighpassDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = priceYAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const highpassLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineHighpassMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.hp)) return;
    const cx = xAt(index);
    const cy = hpYAt(sample.hp);
    highpassLinePoints.push({ x: cx, y: cy });
    markers.push({ index, x: sample.x, cx, cy, hp: sample.hp, zone: sample.zone });
  });

  const triggerLinePoints: Array<{ x: number; y: number }> = [];
  run.trigger.forEach((value, index) => {
    if (isFiniteNumber(value)) {
      triggerLinePoints.push({ x: xAt(index), y: hpYAt(value) });
    }
  });

  return {
    ok,
    width,
    height,
    padding,
    gap,
    pricePanelTop,
    pricePanelBottom,
    hpPanelTop,
    hpPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    highpassPath: buildLinePath(highpassLinePoints),
    triggerPath: buildLinePath(triggerLinePoints),
    markers,
    zeroY: hpYAt(0),
    priceMin,
    priceMax,
    hpMin,
    hpMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineHighpassChart(
  data: readonly ChartLineHighpassPoint[] | null | undefined,
  options: ChartLineHighpassOptions = {},
): string {
  const run = runLineHighpass(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.hpFinal === null ? 'n/a' : run.hpFinal.toFixed(3);
  return (
    `Two-panel chart with the Ehlers Highpass Filter (period ` +
    `${run.period}): the top panel plots the price, the bottom panel ` +
    `plots the highpass and its trigger. The Highpass Filter is a ` +
    `two-pole filter that removes the low-frequency trend component of ` +
    `the price, passing only the faster cyclic swings -- a constant ` +
    `level and a straight-line trend are both driven to zero. Across ` +
    `${total} bars the highpass is above zero on ${run.upCount}, below ` +
    `zero on ${run.downCount} and at zero on ${run.flatCount}. The final ` +
    `highpass reading is ${finalText}.`
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
  zone: ChartLineHighpassZone,
  upColor: string,
  downColor: string,
  flatColor: string,
): string {
  if (zone === 'up') return upColor;
  if (zone === 'down') return downColor;
  return flatColor;
}

function zoneLabelOf(zone: ChartLineHighpassZone): string {
  if (zone === 'up') return 'Above zero';
  if (zone === 'down') return 'Below zero';
  if (zone === 'flat') return 'At zero';
  return 'n/a';
}

/**
 * ChartLineHighpass -- two-panel pure-SVG Ehlers Highpass Filter chart.
 */
export const ChartLineHighpass = forwardRef<
  HTMLDivElement,
  ChartLineHighpassProps
>(function ChartLineHighpass(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_HIGHPASS_PERIOD,
    width = DEFAULT_CHART_LINE_HIGHPASS_WIDTH,
    height = DEFAULT_CHART_LINE_HIGHPASS_HEIGHT,
    padding = DEFAULT_CHART_LINE_HIGHPASS_PADDING,
    gap = DEFAULT_CHART_LINE_HIGHPASS_GAP,
    tickCount = DEFAULT_CHART_LINE_HIGHPASS_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_HIGHPASS_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_HIGHPASS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_HIGHPASS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_HIGHPASS_PRICE_COLOR,
    highpassColor = DEFAULT_CHART_LINE_HIGHPASS_HIGHPASS_COLOR,
    triggerColor = DEFAULT_CHART_LINE_HIGHPASS_TRIGGER_COLOR,
    upColor = DEFAULT_CHART_LINE_HIGHPASS_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_HIGHPASS_DOWN_COLOR,
    flatColor = DEFAULT_CHART_LINE_HIGHPASS_FLAT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_HIGHPASS_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_HIGHPASS_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_HIGHPASS_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showHighpass = true,
    showTrigger = true,
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
  const baseId = `chart-line-highpass-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineHighpassSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineHighpassSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineHighpassLayout({
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
    ariaDescription ?? describeLineHighpassChart(data, { period });
  const resolvedLabel =
    ariaLabel ?? `Ehlers Highpass Filter chart, period ${run.period}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineHighpassSeriesId): void => {
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
    const tooltipW = 176;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.pricePanelTop + 6;
    tooltip = (
      <g data-section="chart-line-highpass-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={96}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-highpass-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-highpass-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Price: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-highpass-tooltip-highpass"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Highpass: ${
            hoverSample.hp === null ? 'n/a' : formatValue(hoverSample.hp)
          }`}
        </text>
        <text
          data-section="chart-line-highpass-tooltip-trigger"
          x={tx + 10}
          y={ty + 67}
          fill="#fcd34d"
          fontSize={11}
        >
          {`Trigger: ${
            hoverSample.trigger === null
              ? 'n/a'
              : formatValue(hoverSample.trigger)
          }`}
        </text>
        <text
          data-section="chart-line-highpass-tooltip-zone"
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
  const highpassHidden = isHidden('highpass') || !showHighpass;
  const triggerHidden = isHidden('trigger') || !showTrigger;

  const legendItems: Array<{
    id: ChartLineHighpassSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'highpass', label: 'Highpass', color: highpassColor },
    { id: 'trigger', label: 'Trigger', color: triggerColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-highpass"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-hp-final={run.hpFinal === null ? '' : run.hpFinal}
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
        data-section="chart-line-highpass-aria-desc"
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
          data-section="chart-line-highpass-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-highpass-empty"
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
          data-section="chart-line-highpass-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-highpass-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-highpass-grid-line"
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
                const cy =
                  layout.hpPanelBottom -
                  t * (layout.hpPanelBottom - layout.hpPanelTop);
                return (
                  <line
                    key={`hg-${i}`}
                    data-section="chart-line-highpass-grid-line"
                    data-panel="highpass"
                    x1={layout.innerLeft}
                    y1={cy}
                    x2={layout.innerRight}
                    y2={cy}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-highpass-axes">
              <line
                data-section="chart-line-highpass-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-highpass-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-highpass-axis"
                data-panel="highpass"
                x1={layout.innerLeft}
                y1={layout.hpPanelTop}
                x2={layout.innerLeft}
                y2={layout.hpPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-highpass-axis"
                data-panel="highpass"
                x1={layout.innerLeft}
                y1={layout.hpPanelBottom}
                x2={layout.innerRight}
                y2={layout.hpPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-highpass-tick-label"
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
                data-section="chart-line-highpass-tick-label"
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
                data-section="chart-line-highpass-tick-label"
                data-panel="highpass"
                x={layout.innerLeft - 6}
                y={layout.hpPanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.hpMax)}
              </text>
              <text
                data-section="chart-line-highpass-tick-label"
                data-panel="highpass"
                x={layout.innerLeft - 6}
                y={layout.hpPanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.hpMin)}
              </text>
            </g>
          ) : null}

          <text
            data-section="chart-line-highpass-panel-label"
            data-panel="price"
            x={layout.innerRight}
            y={layout.pricePanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Price
          </text>
          <text
            data-section="chart-line-highpass-panel-label"
            data-panel="highpass"
            x={layout.innerRight}
            y={layout.hpPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Ehlers Highpass Filter
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-highpass-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-highpass-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Price line, ${run.series.length} bars`}
            />
          ) : null}

          {!priceHidden && showDots ? (
            <g data-section="chart-line-highpass-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-highpass-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, price ${formatValue(
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

          {!triggerHidden ? (
            <path
              data-section="chart-line-highpass-trigger-line"
              d={layout.triggerPath}
              fill="none"
              stroke={triggerColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="5 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Highpass trigger line"
            />
          ) : null}

          {!highpassHidden ? (
            <path
              data-section="chart-line-highpass-highpass-line"
              d={layout.highpassPath}
              fill="none"
              stroke={highpassColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Highpass line, ${layout.markers.length} points`}
            />
          ) : null}

          {!highpassHidden && showMarkers ? (
            <g data-section="chart-line-highpass-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-highpass-marker"
                  data-zone={marker.zone}
                  data-hp={marker.hp}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(marker.zone, upColor, downColor, flatColor)}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, highpass ${formatValue(
                    marker.hp,
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
            <g data-section="chart-line-highpass-badge">
              <rect
                data-section="chart-line-highpass-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={56}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-highpass-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`HP ${run.period}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-highpass-legend"
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
                data-section="chart-line-highpass-legend-item"
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
                  data-section="chart-line-highpass-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-highpass-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-highpass-legend-stats"
            style={{ color: axisColor }}
          >
            {`up ${run.upCount} / down ${run.downCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineHighpass.displayName = 'ChartLineHighpass';
