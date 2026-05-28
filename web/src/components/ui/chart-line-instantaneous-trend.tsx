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
 * ChartLineInstantaneousTrend -- pure-SVG single-panel Ehlers
 * Instantaneous Trendline chart.
 *
 * John Ehlers' Instantaneous Trendline is a low-lag trend follower. It
 * tracks the trend of the price with far less lag than a moving average
 * by feeding the price through a recursive smoother whose coefficients
 * come from a single smoothing constant `alpha`:
 *
 *   c1 = alpha - alpha^2/4,  c2 = alpha^2/2,  c3 = alpha - 0.75*alpha^2
 *   c4 = 2*(1 - alpha),      c5 = (1 - alpha)^2
 *   ITrend[i] = c1*price[i] + c2*price[i-1] - c3*price[i-2]
 *             + c4*ITrend[i-1] - c5*ITrend[i-2]
 *
 * Those coefficients are arranged so that, for a constant input, they
 * sum to exactly one and the trendline reproduces the constant. For the
 * first seven bars -- before the recursion has enough history -- the
 * trendline uses a short averaging seed `(price + 2*price[-1] +
 * price[-2]) / 4`. A trigger line, `2*ITrend - ITrend[-2]`, extrapolates
 * the trendline's recent slope to lead it.
 *
 * This primitive overlays the Instantaneous Trendline and its trigger on
 * the price line in a single panel, with one marker per bar coloured by
 * whether the trendline is rising, falling or flat.
 */

export interface ChartLineInstantaneousTrendPoint {
  x: number;
  value: number;
}

export type ChartLineInstantaneousTrendZone = 'up' | 'down' | 'flat' | 'none';

export type ChartLineInstantaneousTrendSeriesId =
  | 'price'
  | 'itrend'
  | 'trigger';

export interface ChartLineInstantaneousTrendCoefficients {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
}

export interface ChartLineInstantaneousTrendComputed {
  itrend: number[];
  trigger: (number | null)[];
}

export interface ChartLineInstantaneousTrendSample {
  index: number;
  x: number;
  value: number;
  itrend: number | null;
  trigger: number | null;
  zone: ChartLineInstantaneousTrendZone;
}

export interface ChartLineInstantaneousTrendRun {
  series: ChartLineInstantaneousTrendPoint[];
  alpha: number;
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
  itrend: number[];
  trigger: (number | null)[];
  samples: ChartLineInstantaneousTrendSample[];
  itrendFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineInstantaneousTrendMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  itrend: number;
  zone: ChartLineInstantaneousTrendZone;
}

export interface ChartLineInstantaneousTrendDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineInstantaneousTrendLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineInstantaneousTrendDot[];
  itrendPath: string;
  triggerPath: string;
  markers: ChartLineInstantaneousTrendMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineInstantaneousTrendRun;
}

export interface ChartLineInstantaneousTrendProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineInstantaneousTrendPoint[];
  alpha?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  itrendColor?: string;
  triggerColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showItrend?: boolean;
  showTrigger?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineInstantaneousTrendSeriesId[];
  defaultHiddenSeries?: ChartLineInstantaneousTrendSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineInstantaneousTrendSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineInstantaneousTrendSample;
  }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_WIDTH = 720;
export const DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_HEIGHT = 320;
export const DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_PADDING = 44;
export const DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_ALPHA = 0.07;
export const DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_PRICE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_ITREND_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_TRIGGER_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_AXIS_COLOR = '#94a3b8';

/** The bar count below which the trendline uses the short averaging seed. */
export const CHART_LINE_INSTANTANEOUS_TREND_WARMUP = 7;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineInstantaneousTrendFinitePoints(
  data: readonly ChartLineInstantaneousTrendPoint[] | null | undefined,
): ChartLineInstantaneousTrendPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineInstantaneousTrendPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce the smoothing constant alpha to a number in (0, 1), else fallback. */
export function normalizeLineInstantaneousTrendAlpha(
  alpha: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(alpha) && alpha > 0 && alpha < 1) return alpha;
  return fallback;
}

/**
 * The five Instantaneous Trendline coefficients from the smoothing
 * constant `alpha`. They are arranged so that the price-side weights
 * `c1 + c2 - c3` collapse to `alpha^2` and the feedback weights
 * `c4 - c5` collapse to `1 - alpha^2`, summing to one -- which is why a
 * constant input is reproduced unchanged.
 */
export function computeLineInstantaneousTrendCoefficients(
  alpha: unknown,
): ChartLineInstantaneousTrendCoefficients {
  const a = normalizeLineInstantaneousTrendAlpha(
    alpha,
    DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_ALPHA,
  );
  const a2 = a * a;
  return {
    c1: a - a2 / 4,
    c2: a2 / 2,
    c3: a - 0.75 * a2,
    c4: 2 * (1 - a),
    c5: (1 - a) * (1 - a),
  };
}

/**
 * Run the Ehlers Instantaneous Trendline over a series of values. The
 * first bar seeds with the price, the second with the midpoint of the
 * first two prices, and bars two through six use the short averaging
 * seed `(price + 2*price[-1] + price[-2]) / 4`; from the seventh bar the
 * recursive low-lag formula takes over. The trigger is the two-bar
 * extrapolation `2*ITrend - ITrend[-2]`. A non-array input yields empty
 * arrays.
 */
export function computeLineInstantaneousTrend(
  values: readonly number[] | null | undefined,
  alpha: unknown,
): ChartLineInstantaneousTrendComputed {
  if (!Array.isArray(values)) return { itrend: [], trigger: [] };
  const { c1, c2, c3, c4, c5 } =
    computeLineInstantaneousTrendCoefficients(alpha);
  const n = values.length;
  const itrend: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const v0 = values[i];
    if (i === 0) {
      itrend[i] = isFiniteNumber(v0) ? v0 : 0;
      continue;
    }
    const v1 = values[i - 1];
    if (i === 1) {
      if (isFiniteNumber(v0) && isFiniteNumber(v1)) itrend[i] = (v0 + v1) / 2;
      else if (isFiniteNumber(v0)) itrend[i] = v0;
      else itrend[i] = 0;
      continue;
    }
    const v2 = values[i - 2];
    const allFinite =
      isFiniteNumber(v0) && isFiniteNumber(v1) && isFiniteNumber(v2);
    const seed = allFinite ? (v0 + 2 * v1 + v2) / 4 : 0;
    if (i < CHART_LINE_INSTANTANEOUS_TREND_WARMUP || !allFinite) {
      itrend[i] = seed;
      continue;
    }
    const it1 = itrend[i - 1] as number;
    const it2 = itrend[i - 2] as number;
    itrend[i] = c1 * v0 + c2 * v1 - c3 * v2 + c4 * it1 - c5 * it2;
  }
  const trigger: (number | null)[] = itrend.map((_, i) =>
    i >= 2 ? 2 * (itrend[i] as number) - (itrend[i - 2] as number) : null,
  );
  return { itrend, trigger };
}

/** Classify a bar by the trigger relative to the trendline. */
export function classifyLineInstantaneousTrendZone(
  itrend: number | null,
  trigger: number | null,
): ChartLineInstantaneousTrendZone {
  if (!isFiniteNumber(itrend) || !isFiniteNumber(trigger)) return 'none';
  if (trigger > itrend) return 'up';
  if (trigger < itrend) return 'down';
  return 'flat';
}

export interface ChartLineInstantaneousTrendOptions {
  alpha?: number;
}

/** Run the full Ehlers Instantaneous Trendline pipeline over a set of points. */
export function runLineInstantaneousTrend(
  data: readonly ChartLineInstantaneousTrendPoint[] | null | undefined,
  options: ChartLineInstantaneousTrendOptions = {},
): ChartLineInstantaneousTrendRun {
  const series = getLineInstantaneousTrendFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const alpha = normalizeLineInstantaneousTrendAlpha(
    options.alpha,
    DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_ALPHA,
  );
  const { c1, c2, c3, c4, c5 } =
    computeLineInstantaneousTrendCoefficients(alpha);
  const values = series.map((point) => point.value);
  const { itrend, trigger } = computeLineInstantaneousTrend(values, alpha);

  const samples: ChartLineInstantaneousTrendSample[] = series.map(
    (point, index) => {
      const itrendValue = itrend[index] ?? null;
      const triggerValue = trigger[index] ?? null;
      return {
        index,
        x: point.x,
        value: point.value,
        itrend: itrendValue,
        trigger: triggerValue,
        zone: classifyLineInstantaneousTrendZone(itrendValue, triggerValue),
      };
    },
  );

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let itrendFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.itrend)) itrendFinal = sample.itrend;
  }

  return {
    series = [],
    alpha,
    c1,
    c2,
    c3,
    c4,
    c5,
    itrend,
    trigger,
    samples,
    itrendFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineInstantaneousTrendLayoutOptions
  extends ChartLineInstantaneousTrendOptions {
  data: readonly ChartLineInstantaneousTrendPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
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

/** Project the run into a single-panel SVG layout. */
export function computeLineInstantaneousTrendLayout(
  options: ChartLineInstantaneousTrendLayoutOptions,
): ChartLineInstantaneousTrendLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_PADDING;

  const run = runLineInstantaneousTrend(options.data, {
    ...(options.alpha !== undefined ? { alpha: options.alpha } : {}),
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
  run.series.forEach((point, index) => {
    if (point.value < valueMin) valueMin = point.value;
    if (point.value > valueMax) valueMax = point.value;
    const it = run.itrend[index];
    if (isFiniteNumber(it)) {
      if (it < valueMin) valueMin = it;
      if (it > valueMax) valueMax = it;
    }
    const tr = run.trigger[index];
    if (isFiniteNumber(tr)) {
      if (tr < valueMin) valueMin = tr;
      if (tr > valueMax) valueMax = tr;
    }
  });
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
  const priceDots: ChartLineInstantaneousTrendDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = yAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const itrendLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineInstantaneousTrendMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.itrend)) return;
    const cx = xAt(index);
    const cy = yAt(sample.itrend);
    itrendLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      itrend: sample.itrend,
      zone: sample.zone,
    });
  });

  const triggerLinePoints: Array<{ x: number; y: number }> = [];
  run.trigger.forEach((value, index) => {
    if (isFiniteNumber(value)) {
      triggerLinePoints.push({ x: xAt(index), y: yAt(value) });
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
    itrendPath: buildLinePath(itrendLinePoints),
    triggerPath: buildLinePath(triggerLinePoints),
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineInstantaneousTrendChart(
  data: readonly ChartLineInstantaneousTrendPoint[] | null | undefined,
  options: ChartLineInstantaneousTrendOptions = {},
): string {
  const run = runLineInstantaneousTrend(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.itrendFinal === null ? 'n/a' : run.itrendFinal.toFixed(2);
  return (
    `Line chart with the Ehlers Instantaneous Trendline overlay (alpha ` +
    `${run.alpha}): the price with a low-lag Instantaneous Trendline and ` +
    `its trigger overlaid. The Instantaneous Trendline is a low-lag ` +
    `recursive smoother that tracks the trend of the price with far less ` +
    `lag than a moving average; the trigger leads it by extrapolating ` +
    `its recent slope. Across ${total} bars the trendline is rising on ` +
    `${run.upCount}, falling on ${run.downCount} and flat on ` +
    `${run.flatCount}. The final trendline reading is ${finalText}.`
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
  zone: ChartLineInstantaneousTrendZone,
  upColor: string,
  downColor: string,
  flatColor: string,
): string {
  if (zone === 'up') return upColor;
  if (zone === 'down') return downColor;
  return flatColor;
}

function zoneLabelOf(zone: ChartLineInstantaneousTrendZone): string {
  if (zone === 'up') return 'Rising';
  if (zone === 'down') return 'Falling';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineInstantaneousTrend -- single-panel pure-SVG Ehlers
 * Instantaneous Trendline chart.
 */
export const ChartLineInstantaneousTrend = forwardRef<
  HTMLDivElement,
  ChartLineInstantaneousTrendProps
>(function ChartLineInstantaneousTrend(props, ref) {
  const {
    data,
    alpha = DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_ALPHA,
    width = DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_WIDTH,
    height = DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_HEIGHT,
    padding = DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_PADDING,
    tickCount = DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_PRICE_COLOR,
    itrendColor = DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_ITREND_COLOR,
    triggerColor = DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_TRIGGER_COLOR,
    upColor = DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_DOWN_COLOR,
    flatColor = DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_FLAT_COLOR,
    gridColor = DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showItrend = true,
    showTrigger = true,
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
  const baseId = `chart-line-instantaneous-trend-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineInstantaneousTrendSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineInstantaneousTrendSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineInstantaneousTrendLayout({
        data,
        alpha,
        width,
        height,
        padding,
      }),
    [data, alpha, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineInstantaneousTrendChart(data, { alpha });
  const resolvedLabel =
    ariaLabel ?? `Ehlers Instantaneous Trendline chart, alpha ${run.alpha}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineInstantaneousTrendSeriesId): void => {
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
    const tooltipW = 184;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    tooltip = (
      <g
        data-section="chart-line-instantaneous-trend-tooltip"
        pointerEvents="none"
      >
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
          data-section="chart-line-instantaneous-trend-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-instantaneous-trend-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Price: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-instantaneous-trend-tooltip-itrend"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Trendline: ${
            hoverSample.itrend === null
              ? 'n/a'
              : formatValue(hoverSample.itrend)
          }`}
        </text>
        <text
          data-section="chart-line-instantaneous-trend-tooltip-trigger"
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
          data-section="chart-line-instantaneous-trend-tooltip-zone"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Trend: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const itrendHidden = isHidden('itrend') || !showItrend;
  const triggerHidden = isHidden('trigger') || !showTrigger;

  const legendItems: Array<{
    id: ChartLineInstantaneousTrendSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'itrend', label: 'Instantaneous Trendline', color: itrendColor },
    { id: 'trigger', label: 'Trigger', color: triggerColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-instantaneous-trend"
      data-empty={isEmpty ? 'true' : 'false'}
      data-alpha={run.alpha}
      data-itrend-final={run.itrendFinal === null ? '' : run.itrendFinal}
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
        data-section="chart-line-instantaneous-trend-aria-desc"
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
          data-section="chart-line-instantaneous-trend-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-instantaneous-trend-empty"
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
          data-section="chart-line-instantaneous-trend-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-instantaneous-trend-grid">
              {tickValues.map((t, i) => {
                const gy =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-instantaneous-trend-grid-line"
                    x1={layout.innerLeft}
                    y1={gy}
                    x2={layout.innerRight}
                    y2={gy}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-instantaneous-trend-axes">
              <line
                data-section="chart-line-instantaneous-trend-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-instantaneous-trend-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-instantaneous-trend-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-instantaneous-trend-tick-label"
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
              data-section="chart-line-instantaneous-trend-price-path"
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
            <g data-section="chart-line-instantaneous-trend-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-instantaneous-trend-dot"
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
              data-section="chart-line-instantaneous-trend-trigger-line"
              d={layout.triggerPath}
              fill="none"
              stroke={triggerColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="5 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Instantaneous Trendline trigger line"
            />
          ) : null}

          {!itrendHidden ? (
            <path
              data-section="chart-line-instantaneous-trend-itrend-line"
              d={layout.itrendPath}
              fill="none"
              stroke={itrendColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Instantaneous Trendline, ${layout.markers.length} points`}
            />
          ) : null}

          {!itrendHidden && showMarkers ? (
            <g data-section="chart-line-instantaneous-trend-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-instantaneous-trend-marker"
                  data-zone={marker.zone}
                  data-itrend={marker.itrend}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(marker.zone, upColor, downColor, flatColor)}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, trendline ${formatValue(
                    marker.itrend,
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
            <g data-section="chart-line-instantaneous-trend-badge">
              <rect
                data-section="chart-line-instantaneous-trend-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={84}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-instantaneous-trend-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`ITrend ${run.alpha}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-instantaneous-trend-legend"
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
                data-section="chart-line-instantaneous-trend-legend-item"
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
                  data-section="chart-line-instantaneous-trend-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-instantaneous-trend-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-instantaneous-trend-legend-stats"
            style={{ color: axisColor }}
          >
            {`up ${run.upCount} / down ${run.downCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineInstantaneousTrend.displayName = 'ChartLineInstantaneousTrend';
