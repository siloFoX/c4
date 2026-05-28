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
 * ChartLineAccelerationBands -- pure-SVG single-panel Price Headley
 * Acceleration Bands chart.
 *
 * Per bar the raw upper / lower factors scale the high and the low
 * by the relative range of the bar:
 *
 *   ratio       = (high - low) / (high + low)
 *   upperFactor = high * (1 + 2 * ratio)
 *   lowerFactor = low  * (1 - 2 * ratio)
 *
 * The bands are then simple moving averages of length `period`:
 *
 *   upper  = SMA(upperFactor, period)
 *   middle = SMA(close,       period)
 *   lower  = SMA(lowerFactor, period)
 *
 * The first `period - 1` bars are null on every band. A degenerate
 * bar with `high + low <= 0` (or non-finite OHLC) yields a null
 * factor that propagates into the SMA -- the band stays null until
 * a full window of valid factors fills.
 *
 * The chart shares one panel: the close line plus three bar-wide
 * horizontal stub segments per defined bar for the upper, middle and
 * lower bands.
 */

export interface ChartLineAccelerationBandsPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAccelerationBandsZone =
  | 'above-upper'
  | 'middle-to-upper'
  | 'lower-to-middle'
  | 'below-lower'
  | 'none';

export type ChartLineAccelerationBandsSeriesId =
  | 'price'
  | 'upper'
  | 'middle'
  | 'lower';

export interface ChartLineAccelerationBandsLevels {
  upper: number | null;
  middle: number | null;
  lower: number | null;
}

export interface ChartLineAccelerationBandsSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  levels: ChartLineAccelerationBandsLevels;
  zone: ChartLineAccelerationBandsZone;
}

export interface ChartLineAccelerationBandsRun {
  series: ChartLineAccelerationBandsPoint[];
  period: number;
  levels: ChartLineAccelerationBandsLevels[];
  samples: ChartLineAccelerationBandsSample[];
  middleFinal: number | null;
  aboveCount: number;
  betweenCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineAccelerationBandsSegment {
  index: number;
  seriesId: ChartLineAccelerationBandsSeriesId;
  fromCx: number;
  toCx: number;
  cy: number;
  value: number;
}

export interface ChartLineAccelerationBandsMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  zone: ChartLineAccelerationBandsZone;
}

export interface ChartLineAccelerationBandsDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAccelerationBandsLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineAccelerationBandsDot[];
  segments: ChartLineAccelerationBandsSegment[];
  markers: ChartLineAccelerationBandsMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineAccelerationBandsRun;
}

export interface ChartLineAccelerationBandsProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAccelerationBandsPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  upperColor?: string;
  middleColor?: string;
  lowerColor?: string;
  aboveColor?: string;
  belowColor?: string;
  betweenColor?: string;
  noneColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showUpper?: boolean;
  showMiddle?: boolean;
  showLower?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAccelerationBandsSeriesId[];
  defaultHiddenSeries?: ChartLineAccelerationBandsSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAccelerationBandsSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineAccelerationBandsSample;
  }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_HEIGHT = 380;
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_PADDING = 44;
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_PERIOD = 20;
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_UPPER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_MIDDLE_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_LOWER_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_ABOVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_BELOW_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_BETWEEN_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ACCELERATION_BANDS_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC and `high >= low`. */
export function getLineAccelerationBandsFinitePoints(
  data: readonly ChartLineAccelerationBandsPoint[] | null | undefined,
): ChartLineAccelerationBandsPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAccelerationBandsPoint[] = [];
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

/** Coerce the lookback to an integer of at least 1. */
export function normalizeLineAccelerationBandsPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/**
 * The per-bar raw upper and lower factors:
 *   `ratio = (H - L) / (H + L)`
 *   `upperFactor = H * (1 + 2 * ratio)`
 *   `lowerFactor = L * (1 - 2 * ratio)`
 *
 * If `H + L <= 0` the ratio is undefined: the function returns `null`
 * for both factors. A zero range (`H == L`) yields `upperFactor =
 * lowerFactor = H = L`.
 */
export function computeLineAccelerationBandsFactors(
  bar: ChartLineAccelerationBandsPoint | null,
): {
  upperFactor: number | null;
  lowerFactor: number | null;
} {
  if (
    !bar ||
    !isFiniteNumber(bar.high) ||
    !isFiniteNumber(bar.low) ||
    !isFiniteNumber(bar.close)
  ) {
    return { upperFactor: null, lowerFactor: null };
  }
  const sum = bar.high + bar.low;
  if (sum <= 0) {
    return { upperFactor: null, lowerFactor: null };
  }
  const ratio = (bar.high - bar.low) / sum;
  return {
    upperFactor: bar.high * (1 + 2 * ratio),
    lowerFactor: bar.low * (1 - 2 * ratio),
  };
}

/**
 * SMA of a nullable series over a window. The output at bar `i` is
 * null until the window has filled with finite values; a null inside
 * the window null-ifies the bar.
 */
export function computeLineAccelerationBandsSma(
  values: ReadonlyArray<number | null>,
  period: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0 || period < 1) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = i - period + 1; j <= i; j += 1) {
      const v = values[j];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / period : null);
  }
  return out;
}

/**
 * Per-bar Acceleration Bands (upper, middle, lower) over the lookback.
 * Bars before the lookback fills are null on every band; bars whose
 * factor is null or whose close is non-finite also null the bands.
 */
export function computeLineAccelerationBands(
  bars: readonly ChartLineAccelerationBandsPoint[] | null | undefined,
  period: unknown,
): ChartLineAccelerationBandsLevels[] {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const p = normalizeLineAccelerationBandsPeriod(
    period,
    DEFAULT_CHART_LINE_ACCELERATION_BANDS_PERIOD,
  );
  const upperFactors: Array<number | null> = [];
  const lowerFactors: Array<number | null> = [];
  const closes: Array<number | null> = [];
  for (const bar of bars) {
    const { upperFactor, lowerFactor } = computeLineAccelerationBandsFactors(
      bar,
    );
    upperFactors.push(upperFactor);
    lowerFactors.push(lowerFactor);
    closes.push(bar && isFiniteNumber(bar.close) ? bar.close : null);
  }
  const upper = computeLineAccelerationBandsSma(upperFactors, p);
  const middle = computeLineAccelerationBandsSma(closes, p);
  const lower = computeLineAccelerationBandsSma(lowerFactors, p);
  const out: ChartLineAccelerationBandsLevels[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    out.push({
      upper: upper[i] ?? null,
      middle: middle[i] ?? null,
      lower: lower[i] ?? null,
    });
  }
  return out;
}

/** Classify a close against its bar's bands. */
export function classifyLineAccelerationBandsZone(
  close: number | null,
  levels: ChartLineAccelerationBandsLevels,
): ChartLineAccelerationBandsZone {
  if (
    !isFiniteNumber(close) ||
    !isFiniteNumber(levels.upper) ||
    !isFiniteNumber(levels.middle) ||
    !isFiniteNumber(levels.lower)
  ) {
    return 'none';
  }
  if (close > levels.upper) return 'above-upper';
  if (close >= levels.middle) return 'middle-to-upper';
  if (close >= levels.lower) return 'lower-to-middle';
  return 'below-lower';
}

export interface ChartLineAccelerationBandsOptions {
  period?: number;
}

/** Run the full Acceleration Bands pipeline. */
export function runLineAccelerationBands(
  data: readonly ChartLineAccelerationBandsPoint[] | null | undefined,
  options: ChartLineAccelerationBandsOptions = {},
): ChartLineAccelerationBandsRun {
  const series = getLineAccelerationBandsFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineAccelerationBandsPeriod(
    options.period,
    DEFAULT_CHART_LINE_ACCELERATION_BANDS_PERIOD,
  );
  const levels = computeLineAccelerationBands(series, period);
  const samples: ChartLineAccelerationBandsSample[] = series.map(
    (point, index) => {
      const lv = levels[index]!;
      return {
        index,
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        levels: lv,
        zone: classifyLineAccelerationBandsZone(point.close, lv),
      };
    },
  );
  let aboveCount = 0;
  let betweenCount = 0;
  let belowCount = 0;
  let middleFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above-upper') aboveCount += 1;
    else if (sample.zone === 'below-lower') belowCount += 1;
    else if (
      sample.zone === 'middle-to-upper' ||
      sample.zone === 'lower-to-middle'
    ) {
      betweenCount += 1;
    }
    if (isFiniteNumber(sample.levels.middle)) middleFinal = sample.levels.middle;
  }
  return {
    series = [],
    period,
    levels,
    samples,
    middleFinal,
    aboveCount,
    betweenCount,
    belowCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineAccelerationBandsLayoutOptions
  extends ChartLineAccelerationBandsOptions {
  data: readonly ChartLineAccelerationBandsPoint[] | null | undefined;
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
export function computeLineAccelerationBandsLayout(
  options: ChartLineAccelerationBandsLayoutOptions,
): ChartLineAccelerationBandsLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ACCELERATION_BANDS_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ACCELERATION_BANDS_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ACCELERATION_BANDS_PADDING;

  const run = runLineAccelerationBands(options.data, {
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
    const ls = sample.levels;
    for (const v of [ls.upper, ls.middle, ls.lower]) {
      if (isFiniteNumber(v)) {
        if (v < valueMin) valueMin = v;
        if (v > valueMax) valueMax = v;
      }
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
  const priceDots: ChartLineAccelerationBandsDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const segments: ChartLineAccelerationBandsSegment[] = [];
  const markers: ChartLineAccelerationBandsMarker[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    if (sample.zone !== 'none') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yAt(sample.close),
        close: sample.close,
        zone: sample.zone,
      });
    }
    const halfStep = stepX / 2;
    const from = Math.max(innerLeft, cx - halfStep);
    const to = Math.min(innerRight, cx + halfStep);
    const levelEntries: Array<{
      seriesId: ChartLineAccelerationBandsSeriesId;
      value: number | null;
    }> = [
      { seriesId: 'upper', value: sample.levels.upper },
      { seriesId: 'middle', value: sample.levels.middle },
      { seriesId: 'lower', value: sample.levels.lower },
    ];
    for (const entry of levelEntries) {
      if (!isFiniteNumber(entry.value)) continue;
      segments.push({
        index,
        seriesId: entry.seriesId,
        fromCx: from,
        toCx: to,
        cy: yAt(entry.value),
        value: entry.value,
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
    segments,
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineAccelerationBandsChart(
  data: readonly ChartLineAccelerationBandsPoint[] | null | undefined,
  options: ChartLineAccelerationBandsOptions = {},
): string {
  const run = runLineAccelerationBands(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.middleFinal === null ? 'n/a' : run.middleFinal.toFixed(3);
  return (
    `Single-panel chart with Acceleration Bands envelope overlays ` +
    `(period ${run.period}): each bar carries upper, middle and lower ` +
    `bands. The middle is the SMA of close; the upper and lower bands ` +
    `are the SMA of high * (1 + 2*(H-L)/(H+L)) and low * (1 - ` +
    `2*(H-L)/(H+L)) respectively. The first ${run.period - 1} bars ` +
    `are null on every band. Across ${total} bars the close sits above ` +
    `the upper band on ${run.aboveCount}, below the lower on ` +
    `${run.belowCount}, and inside the envelope on ${run.betweenCount}. ` +
    `The final middle band is ${finalText}.`
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
  zone: ChartLineAccelerationBandsZone,
  aboveColor: string,
  belowColor: string,
  betweenColor: string,
  noneColor: string,
): string {
  if (zone === 'above-upper') return aboveColor;
  if (zone === 'below-lower') return belowColor;
  if (zone === 'middle-to-upper' || zone === 'lower-to-middle')
    return betweenColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineAccelerationBandsZone): string {
  if (zone === 'above-upper') return 'Above upper';
  if (zone === 'middle-to-upper') return 'Middle to upper';
  if (zone === 'lower-to-middle') return 'Lower to middle';
  if (zone === 'below-lower') return 'Below lower';
  return 'n/a';
}

function segmentColorOf(
  seriesId: ChartLineAccelerationBandsSeriesId,
  upperColor: string,
  middleColor: string,
  lowerColor: string,
  defaultColor: string,
): string {
  if (seriesId === 'upper') return upperColor;
  if (seriesId === 'middle') return middleColor;
  if (seriesId === 'lower') return lowerColor;
  return defaultColor;
}

/**
 * ChartLineAccelerationBands -- single-panel pure-SVG Acceleration
 * Bands chart.
 */
export const ChartLineAccelerationBands = forwardRef<
  HTMLDivElement,
  ChartLineAccelerationBandsProps
>(function ChartLineAccelerationBands(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_ACCELERATION_BANDS_PERIOD,
    width = DEFAULT_CHART_LINE_ACCELERATION_BANDS_WIDTH,
    height = DEFAULT_CHART_LINE_ACCELERATION_BANDS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ACCELERATION_BANDS_PADDING,
    tickCount = DEFAULT_CHART_LINE_ACCELERATION_BANDS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ACCELERATION_BANDS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ACCELERATION_BANDS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ACCELERATION_BANDS_PRICE_COLOR,
    upperColor = DEFAULT_CHART_LINE_ACCELERATION_BANDS_UPPER_COLOR,
    middleColor = DEFAULT_CHART_LINE_ACCELERATION_BANDS_MIDDLE_COLOR,
    lowerColor = DEFAULT_CHART_LINE_ACCELERATION_BANDS_LOWER_COLOR,
    aboveColor = DEFAULT_CHART_LINE_ACCELERATION_BANDS_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_ACCELERATION_BANDS_BELOW_COLOR,
    betweenColor = DEFAULT_CHART_LINE_ACCELERATION_BANDS_BETWEEN_COLOR,
    noneColor = DEFAULT_CHART_LINE_ACCELERATION_BANDS_NONE_COLOR,
    gridColor = DEFAULT_CHART_LINE_ACCELERATION_BANDS_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ACCELERATION_BANDS_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showUpper = true,
    showMiddle = true,
    showLower = true,
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
  const baseId = `chart-line-acceleration-bands-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineAccelerationBandsSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineAccelerationBandsSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineAccelerationBandsLayout({
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
    ariaDescription ?? describeLineAccelerationBandsChart(data, { period });
  const resolvedLabel =
    ariaLabel ?? `Acceleration Bands chart, period ${run.period}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineAccelerationBandsSeriesId): void => {
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

  const showSeries = (id: ChartLineAccelerationBandsSeriesId): boolean => {
    if (isHidden(id)) return false;
    if (id === 'upper') return showUpper;
    if (id === 'middle') return showMiddle;
    if (id === 'lower') return showLower;
    return true;
  };

  let tooltip: ReactNode = null;
  if (showTooltip && hoverSample && !isEmpty) {
    const dot = layout.priceDots[hoverSample.index];
    const anchorX = dot ? dot.cx : (layout.innerLeft + layout.innerRight) / 2;
    const tooltipW = 220;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    const levels = hoverSample.levels;
    const fmt = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);
    tooltip = (
      <g
        data-section="chart-line-acceleration-bands-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={124}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-acceleration-bands-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-acceleration-bands-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-acceleration-bands-tooltip-upper"
          x={tx + 10}
          y={ty + 51}
          fill="#fca5a5"
          fontSize={11}
        >
          {`Upper: ${fmt(levels.upper)}`}
        </text>
        <text
          data-section="chart-line-acceleration-bands-tooltip-middle"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Middle: ${fmt(levels.middle)}`}
        </text>
        <text
          data-section="chart-line-acceleration-bands-tooltip-lower"
          x={tx + 10}
          y={ty + 83}
          fill="#86efac"
          fontSize={11}
        >
          {`Lower: ${fmt(levels.lower)}`}
        </text>
        <text
          data-section="chart-line-acceleration-bands-tooltip-zone"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');

  const legendItems: Array<{
    id: ChartLineAccelerationBandsSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'upper', label: 'Upper', color: upperColor },
    { id: 'middle', label: 'Middle', color: middleColor },
    { id: 'lower', label: 'Lower', color: lowerColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-acceleration-bands"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-middle-final={run.middleFinal === null ? '' : run.middleFinal}
      data-above-count={run.aboveCount}
      data-between-count={run.betweenCount}
      data-below-count={run.belowCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-acceleration-bands-aria-desc"
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
          data-section="chart-line-acceleration-bands-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-acceleration-bands-empty"
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
          data-section="chart-line-acceleration-bands-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-acceleration-bands-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-acceleration-bands-grid-line"
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
            <g data-section="chart-line-acceleration-bands-axes">
              <line
                data-section="chart-line-acceleration-bands-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-acceleration-bands-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-acceleration-bands-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-acceleration-bands-tick-label"
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

          <g data-section="chart-line-acceleration-bands-segments">
            {layout.segments
              .filter((seg) => showSeries(seg.seriesId))
              .map((seg, i) => (
                <line
                  key={`seg-${seg.index}-${seg.seriesId}-${i}`}
                  data-section="chart-line-acceleration-bands-segment"
                  data-series-id={seg.seriesId}
                  data-value={seg.value}
                  x1={seg.fromCx}
                  y1={seg.cy}
                  x2={seg.toCx}
                  y2={seg.cy}
                  stroke={segmentColorOf(
                    seg.seriesId,
                    upperColor,
                    middleColor,
                    lowerColor,
                    betweenColor,
                  )}
                  strokeWidth={1.5}
                  strokeOpacity={seg.seriesId === 'middle' ? 1 : 0.85}
                />
              ))}
          </g>

          {!priceHidden ? (
            <path
              data-section="chart-line-acceleration-bands-price-path"
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
            <g data-section="chart-line-acceleration-bands-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-acceleration-bands-dot"
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

          {showMarkers ? (
            <g data-section="chart-line-acceleration-bands-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-acceleration-bands-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    aboveColor,
                    belowColor,
                    betweenColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatValue(
                    marker.close,
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
            <g data-section="chart-line-acceleration-bands-badge">
              <rect
                data-section="chart-line-acceleration-bands-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={104}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-acceleration-bands-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`ACCEL ${run.period}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-acceleration-bands-legend"
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
                data-section="chart-line-acceleration-bands-legend-item"
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
                  data-section="chart-line-acceleration-bands-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-acceleration-bands-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-acceleration-bands-legend-stats"
            style={{ color: axisColor }}
          >
            {`above ${run.aboveCount} / between ${run.betweenCount} / below ${run.belowCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineAccelerationBands.displayName = 'ChartLineAccelerationBands';
