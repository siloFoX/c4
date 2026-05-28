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
 * ChartLineBbPercentB -- pure-SVG dual-panel chart with John
 * Bollinger's %B oscillator beneath the close. %B locates the
 * close within the Bollinger Band envelope.
 *
 * Definition:
 *
 *   middle[i] = SMA(close, length)[i]
 *   var[i]    = sum_{j = i - length + 1..i} (close[j] - middle[i])^2 / length
 *   std[i]    = sqrt(var[i])
 *   upper[i]  = middle[i] + numStd * std[i]
 *   lower[i]  = middle[i] - numStd * std[i]
 *   %B[i]     = (close[i] - lower[i]) / (upper[i] - lower[i])
 *
 * Defaults: `length = 20`, `numStd = 2`. Bars before
 * `i = length - 1` are `null` (warmup). When `std == 0`
 * (singular: completely flat close window) %B is `null`.
 *
 * Bit-exact anchors:
 *
 *   * **Worked anchor `[10, 12]` with `length = 2, numStd = 1`**:
 *     middle = 11, variance = 1, std = 1, upper = 12,
 *     lower = 10. close[1] = 12 = upper -> `%B = (12 - 10) /
 *     (12 - 10) = 1` **bit-exact**.
 *   * **Worked anchor `[12, 10]` with `length = 2, numStd = 1`**:
 *     middle = 11, std = 1, upper = 12, lower = 10.
 *     close[1] = 10 = lower -> `%B = 0 / 2 = 0` **bit-exact**.
 *   * **CONST_FLAT (close == K)**: std = 0 -> upper = lower
 *     -> `%B = null` at every bar past the warmup.
 *
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots %B with reference
 * lines at 0, 0.5, and 1.
 */

export interface ChartLineBbPercentBPoint {
  x: number;
  close: number;
}

export type ChartLineBbPercentBZone =
  | 'above-upper'
  | 'above-mid'
  | 'below-mid'
  | 'below-lower'
  | 'none';

export type ChartLineBbPercentBSeriesId = 'price' | 'percentB';

export interface ChartLineBbPercentBSample {
  index: number;
  x: number;
  close: number;
  percentB: number | null;
  zone: ChartLineBbPercentBZone;
}

export interface ChartLineBbPercentBRun {
  series: ChartLineBbPercentBPoint[];
  length: number;
  numStd: number;
  percentB: Array<number | null>;
  samples: ChartLineBbPercentBSample[];
  percentBFinal: number | null;
  aboveUpperCount: number;
  aboveMidCount: number;
  belowMidCount: number;
  belowLowerCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineBbPercentBMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  percentB: number;
  zone: ChartLineBbPercentBZone;
}

export interface ChartLineBbPercentBDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineBbPercentBLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  pbTop: number;
  pbBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineBbPercentBDot[];
  percentBPath: string;
  markers: ChartLineBbPercentBMarker[];
  priceMin: number;
  priceMax: number;
  upperBandY: number;
  midBandY: number;
  lowerBandY: number;
  pbMin: number;
  pbMax: number;
  run: ChartLineBbPercentBRun;
}

export interface ChartLineBbPercentBProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineBbPercentBPoint[];
  length?: number;
  numStd?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  percentBColor?: string;
  aboveUpperColor?: string;
  aboveMidColor?: string;
  belowMidColor?: string;
  belowLowerColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  bandColor?: string;
  midLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPercentB?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  showMidLine?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineBbPercentBSeriesId[];
  defaultHiddenSeries?: ChartLineBbPercentBSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineBbPercentBSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineBbPercentBSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatPercentB?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_BB_PERCENT_B_WIDTH = 720;
export const DEFAULT_CHART_LINE_BB_PERCENT_B_HEIGHT = 460;
export const DEFAULT_CHART_LINE_BB_PERCENT_B_PADDING = 44;
export const DEFAULT_CHART_LINE_BB_PERCENT_B_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_BB_PERCENT_B_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_BB_PERCENT_B_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_BB_PERCENT_B_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_BB_PERCENT_B_LENGTH = 20;
export const DEFAULT_CHART_LINE_BB_PERCENT_B_NUM_STD = 2;
export const DEFAULT_CHART_LINE_BB_PERCENT_B_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_BB_PERCENT_B_PERCENT_B_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_BB_PERCENT_B_ABOVE_UPPER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_BB_PERCENT_B_ABOVE_MID_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_BB_PERCENT_B_BELOW_MID_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_BB_PERCENT_B_BELOW_LOWER_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_BB_PERCENT_B_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_BB_PERCENT_B_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_BB_PERCENT_B_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_BB_PERCENT_B_BAND_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_BB_PERCENT_B_MID_LINE_COLOR = '#64748b';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineBbPercentBFinitePoints(
  data: readonly ChartLineBbPercentBPoint[] | null | undefined,
): ChartLineBbPercentBPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineBbPercentBPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineBbPercentBLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive finite num-std (> 0). */
export function normalizeLineBbPercentBNumStd(
  numStd: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(numStd) && numStd > 0) return numStd;
  return fallback;
}

/**
 * Compute %B per bar. Bars before `i = length - 1` are `null`
 * (warmup). When `std == 0` (singular: flat window) %B is
 * `null`.
 */
export function computeLineBbPercentB(
  closes: readonly number[] | null | undefined,
  options: { length?: number; numStd?: number } = {},
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const length = normalizeLineBbPercentBLength(
    options.length,
    DEFAULT_CHART_LINE_BB_PERCENT_B_LENGTH,
  );
  const numStd = normalizeLineBbPercentBNumStd(
    options.numStd,
    DEFAULT_CHART_LINE_BB_PERCENT_B_NUM_STD,
  );
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    const ci = closes[i];
    if (!isFiniteNumber(ci)) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = closes[i - j];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    const mean = sum / length;
    let varSum = 0;
    for (let j = 0; j < length; j += 1) {
      const v = closes[i - j]!;
      const dv = v - mean;
      varSum += dv * dv;
    }
    const variance = varSum / length;
    const std = Math.sqrt(variance);
    if (std === 0) {
      out.push(null);
      continue;
    }
    const upper = mean + numStd * std;
    const lower = mean - numStd * std;
    out.push((ci - lower) / (upper - lower));
  }
  return out;
}

/** Classify a %B reading. */
export function classifyLineBbPercentBZone(
  value: number | null,
): ChartLineBbPercentBZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= 1) return 'above-upper';
  if (value > 0.5) return 'above-mid';
  if (value > 0) return 'below-mid';
  return 'below-lower';
}

export interface ChartLineBbPercentBOptions {
  length?: number;
  numStd?: number;
}

/** Run the full %B pipeline plus sample classification. */
export function runLineBbPercentB(
  data: readonly ChartLineBbPercentBPoint[] | null | undefined,
  options: ChartLineBbPercentBOptions = {},
): ChartLineBbPercentBRun {
  const series = getLineBbPercentBFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineBbPercentBLength(
    options.length,
    DEFAULT_CHART_LINE_BB_PERCENT_B_LENGTH,
  );
  const numStd = normalizeLineBbPercentBNumStd(
    options.numStd,
    DEFAULT_CHART_LINE_BB_PERCENT_B_NUM_STD,
  );
  const closes = series.map((p) => p.close);
  const percentB = computeLineBbPercentB(closes, { length, numStd });
  const samples: ChartLineBbPercentBSample[] = series.map((point, index) => {
    const value = percentB[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      percentB: value,
      zone: classifyLineBbPercentBZone(value),
    };
  });
  let aboveUpperCount = 0;
  let aboveMidCount = 0;
  let belowMidCount = 0;
  let belowLowerCount = 0;
  let noneCount = 0;
  let percentBFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above-upper') aboveUpperCount += 1;
    else if (sample.zone === 'above-mid') aboveMidCount += 1;
    else if (sample.zone === 'below-mid') belowMidCount += 1;
    else if (sample.zone === 'below-lower') belowLowerCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.percentB)) percentBFinal = sample.percentB;
  }
  return {
    series = [],
    length,
    numStd,
    percentB,
    samples,
    percentBFinal,
    aboveUpperCount,
    aboveMidCount,
    belowMidCount,
    belowLowerCount,
    noneCount,
    ok: series.length >= length,
  };
}

export interface ChartLineBbPercentBLayoutOptions
  extends ChartLineBbPercentBOptions {
  data: readonly ChartLineBbPercentBPoint[] | null | undefined;
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
export function computeLineBbPercentBLayout(
  options: ChartLineBbPercentBLayoutOptions,
): ChartLineBbPercentBLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_BB_PERCENT_B_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_BB_PERCENT_B_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_BB_PERCENT_B_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_BB_PERCENT_B_PANEL_GAP;

  const run = runLineBbPercentB(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.numStd !== undefined ? { numStd: options.numStd } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const pbHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const pbTop = priceBottom + panelGap;
  const pbBottom = pbTop + pbHeight;

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

  // %B can excursion outside [0, 1] for prices outside the bands.
  // Pad the panel range so all observed values fit, with a
  // minimum range of [-0.2, 1.2] for visual context.
  let pbMin = -0.2;
  let pbMax = 1.2;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.percentB)) {
      if (sample.percentB < pbMin) pbMin = sample.percentB;
      if (sample.percentB > pbMax) pbMax = sample.percentB;
    }
  }
  if (pbMin === pbMax) {
    pbMin -= 1;
    pbMax += 1;
  }
  const pbY = (value: number): number =>
    pbBottom - ((value - pbMin) / (pbMax - pbMin)) * pbHeight;
  const upperBandY = pbY(1);
  const midBandY = pbY(0.5);
  const lowerBandY = pbY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineBbPercentBDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const pbLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineBbPercentBMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.percentB)) return;
    const cx = xAt(index);
    const yc = pbY(sample.percentB);
    pbLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      percentB: sample.percentB,
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
    pbTop,
    pbBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    percentBPath: buildLinePath(pbLinePoints),
    markers,
    priceMin,
    priceMax,
    upperBandY,
    midBandY,
    lowerBandY,
    pbMin,
    pbMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineBbPercentBChart(
  data: readonly ChartLineBbPercentBPoint[] | null | undefined,
  options: ChartLineBbPercentBOptions = {},
): string {
  const run = runLineBbPercentB(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.percentBFinal === null ? 'n/a' : run.percentBFinal.toFixed(4);
  return (
    `Dual-panel chart with a Bollinger Bands %B oscillator panel ` +
    `beneath the close (length ${run.length}, numStd ${run.numStd}). ` +
    `%B = (close - lowerBand) / (upperBand - lowerBand), where ` +
    `lowerBand = SMA - numStd * std and upperBand = SMA + numStd * ` +
    `std over the lookback. Across ${total} bars %B is above the ` +
    `upper band on ${run.aboveUpperCount}, between the middle and ` +
    `upper bands on ${run.aboveMidCount}, between the lower and ` +
    `middle bands on ${run.belowMidCount}, below the lower band on ` +
    `${run.belowLowerCount}, and undefined on ${run.noneCount}. ` +
    `The final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatPercentB(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineBbPercentBZone,
  aboveUpperColor: string,
  aboveMidColor: string,
  belowMidColor: string,
  belowLowerColor: string,
  noneColor: string,
): string {
  if (zone === 'above-upper') return aboveUpperColor;
  if (zone === 'above-mid') return aboveMidColor;
  if (zone === 'below-mid') return belowMidColor;
  if (zone === 'below-lower') return belowLowerColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineBbPercentBZone): string {
  if (zone === 'above-upper') return 'Above Upper';
  if (zone === 'above-mid') return 'Above Mid';
  if (zone === 'below-mid') return 'Below Mid';
  if (zone === 'below-lower') return 'Below Lower';
  return 'n/a';
}

/**
 * ChartLineBbPercentB -- dual-panel pure-SVG Bollinger Bands %B
 * chart.
 */
export const ChartLineBbPercentB = forwardRef<
  HTMLDivElement,
  ChartLineBbPercentBProps
>(function ChartLineBbPercentB(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_BB_PERCENT_B_LENGTH,
    numStd = DEFAULT_CHART_LINE_BB_PERCENT_B_NUM_STD,
    width = DEFAULT_CHART_LINE_BB_PERCENT_B_WIDTH,
    height = DEFAULT_CHART_LINE_BB_PERCENT_B_HEIGHT,
    padding = DEFAULT_CHART_LINE_BB_PERCENT_B_PADDING,
    panelGap = DEFAULT_CHART_LINE_BB_PERCENT_B_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_BB_PERCENT_B_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_BB_PERCENT_B_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_BB_PERCENT_B_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_BB_PERCENT_B_PRICE_COLOR,
    percentBColor = DEFAULT_CHART_LINE_BB_PERCENT_B_PERCENT_B_COLOR,
    aboveUpperColor = DEFAULT_CHART_LINE_BB_PERCENT_B_ABOVE_UPPER_COLOR,
    aboveMidColor = DEFAULT_CHART_LINE_BB_PERCENT_B_ABOVE_MID_COLOR,
    belowMidColor = DEFAULT_CHART_LINE_BB_PERCENT_B_BELOW_MID_COLOR,
    belowLowerColor = DEFAULT_CHART_LINE_BB_PERCENT_B_BELOW_LOWER_COLOR,
    noneColor = DEFAULT_CHART_LINE_BB_PERCENT_B_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_BB_PERCENT_B_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_BB_PERCENT_B_GRID_COLOR,
    bandColor = DEFAULT_CHART_LINE_BB_PERCENT_B_BAND_COLOR,
    midLineColor = DEFAULT_CHART_LINE_BB_PERCENT_B_MID_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPercentB = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBands = true,
    showMidLine = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatPercentB = defaultFormatPercentB,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-bb-percent-b-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineBbPercentBSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineBbPercentBSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineBbPercentBLayout({
        data,
        length,
        numStd,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, length, numStd, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineBbPercentBChart(data, { length, numStd });
  const resolvedLabel =
    ariaLabel ??
    `Bollinger Bands %B chart, length ${run.length}, numStd ${run.numStd}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineBbPercentBSeriesId): void => {
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
        data-section="chart-line-bb-percent-b-tooltip"
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
          data-section="chart-line-bb-percent-b-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-bb-percent-b-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-bb-percent-b-tooltip-percent-b"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`%B: ${
            hoverSample.percentB === null
              ? 'n/a'
              : formatPercentB(hoverSample.percentB)
          }`}
        </text>
        <text
          data-section="chart-line-bb-percent-b-tooltip-zone"
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
  const percentBHidden = isHidden('percentB') || !showPercentB;

  const legendItems: Array<{
    id: ChartLineBbPercentBSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'percentB', label: '%B', color: percentBColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-bb-percent-b"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-num-std={run.numStd}
      data-percent-b-final={
        run.percentBFinal === null ? '' : run.percentBFinal
      }
      data-above-upper-count={run.aboveUpperCount}
      data-above-mid-count={run.aboveMidCount}
      data-below-mid-count={run.belowMidCount}
      data-below-lower-count={run.belowLowerCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-bb-percent-b-aria-desc"
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
          data-section="chart-line-bb-percent-b-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-bb-percent-b-empty"
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
          data-section="chart-line-bb-percent-b-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-bb-percent-b-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yb =
                  layout.pbBottom -
                  t * (layout.pbBottom - layout.pbTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-bb-percent-b-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-bb-percent-b-grid-line"
                      data-panel="percent-b"
                      x1={layout.innerLeft}
                      y1={yb}
                      x2={layout.innerRight}
                      y2={yb}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-bb-percent-b-axes">
              <line
                data-section="chart-line-bb-percent-b-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-bb-percent-b-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-bb-percent-b-axis"
                data-panel="percent-b"
                x1={layout.innerLeft}
                y1={layout.pbTop}
                x2={layout.innerLeft}
                y2={layout.pbBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-bb-percent-b-axis"
                data-panel="percent-b"
                x1={layout.innerLeft}
                y1={layout.pbBottom}
                x2={layout.innerRight}
                y2={layout.pbBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-bb-percent-b-tick-label"
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
                data-section="chart-line-bb-percent-b-tick-label"
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
                data-section="chart-line-bb-percent-b-tick-label"
                data-panel="percent-b"
                x={layout.innerLeft - 6}
                y={layout.pbTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPercentB(layout.pbMax)}
              </text>
              <text
                data-section="chart-line-bb-percent-b-tick-label"
                data-panel="percent-b"
                x={layout.innerLeft - 6}
                y={layout.pbBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPercentB(layout.pbMin)}
              </text>
            </g>
          ) : null}

          {showBands ? (
            <g data-section="chart-line-bb-percent-b-bands">
              <line
                data-section="chart-line-bb-percent-b-upper-band"
                x1={layout.innerLeft}
                y1={layout.upperBandY}
                x2={layout.innerRight}
                y2={layout.upperBandY}
                stroke={bandColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line
                data-section="chart-line-bb-percent-b-lower-band"
                x1={layout.innerLeft}
                y1={layout.lowerBandY}
                x2={layout.innerRight}
                y2={layout.lowerBandY}
                stroke={bandColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          ) : null}

          {showMidLine ? (
            <line
              data-section="chart-line-bb-percent-b-mid-line"
              x1={layout.innerLeft}
              y1={layout.midBandY}
              x2={layout.innerRight}
              y2={layout.midBandY}
              stroke={midLineColor}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-bb-percent-b-price-path"
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
            <g data-section="chart-line-bb-percent-b-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-bb-percent-b-dot"
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

          {!percentBHidden ? (
            <path
              data-section="chart-line-bb-percent-b-line"
              d={layout.percentBPath}
              fill="none"
              stroke={percentBColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`%B line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-bb-percent-b-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-bb-percent-b-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-percent-b={marker.percentB}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    aboveUpperColor,
                    aboveMidColor,
                    belowMidColor,
                    belowLowerColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, %B ${formatPercentB(marker.percentB)}, ${zoneLabelOf(
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
            <g data-section="chart-line-bb-percent-b-badge">
              <rect
                data-section="chart-line-bb-percent-b-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={150}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-bb-percent-b-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`%B ${run.length}/${run.numStd}sigma`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-bb-percent-b-legend"
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
                data-section="chart-line-bb-percent-b-legend-item"
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
                  data-section="chart-line-bb-percent-b-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-bb-percent-b-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-bb-percent-b-legend-stats"
            style={{ color: axisColor }}
          >
            {`>=upper ${run.aboveUpperCount} / above-mid ${run.aboveMidCount} / below-mid ${run.belowMidCount} / <=lower ${run.belowLowerCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineBbPercentB.displayName = 'ChartLineBbPercentB';
