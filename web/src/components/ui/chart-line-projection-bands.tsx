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
 * ChartLineProjectionBands -- pure-SVG single-panel Projection Bands
 * chart (Mel Widner).
 *
 * For each bar `i` with a filled lookback `period`:
 *
 *   slope_h = OLS slope of `high[i-period+1..i]` against j = 0..period-1
 *   slope_l = OLS slope of `low[i-period+1..i]`  against j = 0..period-1
 *
 * Each bar inside the lookback is then "projected" forward to bar `i`
 * by extending its own slope-of-the-window line:
 *
 *   hPrime[j] = high[j] + slope_h * (i - j)
 *   lPrime[j] = low[j]  + slope_l * (i - j)
 *
 *   upperBand[i] = max(hPrime[j] for j in [i-period+1, i])
 *   lowerBand[i] = min(lPrime[j] for j in [i-period+1, i])
 *
 * The first `period - 1` bars are null on both bands. A perfectly
 * linear high/low ramp (`high = low = c + j`) collapses the bands to
 * the close itself and the width is exactly zero (the slope cancels
 * the within-window distance, see the patch doc for the algebra).
 *
 * The chart shares one panel: the close line plus three bar-wide
 * horizontal stub segments per defined bar for the upper / lower
 * projection bands.
 */

export interface ChartLineProjectionBandsPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineProjectionBandsZone =
  | 'above-upper'
  | 'inside'
  | 'below-lower'
  | 'none';

export type ChartLineProjectionBandsSeriesId = 'price' | 'upper' | 'lower';

export interface ChartLineProjectionBandsLevels {
  upper: number | null;
  lower: number | null;
}

export interface ChartLineProjectionBandsSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  levels: ChartLineProjectionBandsLevels;
  zone: ChartLineProjectionBandsZone;
}

export interface ChartLineProjectionBandsRun {
  series: ChartLineProjectionBandsPoint[];
  period: number;
  levels: ChartLineProjectionBandsLevels[];
  samples: ChartLineProjectionBandsSample[];
  upperFinal: number | null;
  lowerFinal: number | null;
  aboveCount: number;
  insideCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineProjectionBandsSegment {
  index: number;
  seriesId: ChartLineProjectionBandsSeriesId;
  fromCx: number;
  toCx: number;
  cy: number;
  value: number;
}

export interface ChartLineProjectionBandsMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  zone: ChartLineProjectionBandsZone;
}

export interface ChartLineProjectionBandsDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineProjectionBandsLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineProjectionBandsDot[];
  segments: ChartLineProjectionBandsSegment[];
  markers: ChartLineProjectionBandsMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineProjectionBandsRun;
}

export interface ChartLineProjectionBandsProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineProjectionBandsPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  upperColor?: string;
  lowerColor?: string;
  aboveColor?: string;
  belowColor?: string;
  insideColor?: string;
  noneColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showUpper?: boolean;
  showLower?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineProjectionBandsSeriesId[];
  defaultHiddenSeries?: ChartLineProjectionBandsSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineProjectionBandsSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineProjectionBandsSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_PROJECTION_BANDS_WIDTH = 720;
export const DEFAULT_CHART_LINE_PROJECTION_BANDS_HEIGHT = 380;
export const DEFAULT_CHART_LINE_PROJECTION_BANDS_PADDING = 44;
export const DEFAULT_CHART_LINE_PROJECTION_BANDS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PROJECTION_BANDS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PROJECTION_BANDS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PROJECTION_BANDS_PERIOD = 14;
export const DEFAULT_CHART_LINE_PROJECTION_BANDS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_PROJECTION_BANDS_UPPER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PROJECTION_BANDS_LOWER_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PROJECTION_BANDS_ABOVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PROJECTION_BANDS_BELOW_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PROJECTION_BANDS_INSIDE_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_PROJECTION_BANDS_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_PROJECTION_BANDS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PROJECTION_BANDS_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC and `high >= low`. */
export function getLineProjectionBandsFinitePoints(
  data: readonly ChartLineProjectionBandsPoint[] | null | undefined,
): ChartLineProjectionBandsPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineProjectionBandsPoint[] = [];
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

/** Coerce the lookback period to an integer of at least 2. */
export function normalizeLineProjectionBandsPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/**
 * The OLS slope of a window of `n` finite values against `j = 0..n-1`.
 * Returns null when `n < 2` or the X-variance is zero (impossible
 * for `n >= 2` since `0..n-1` always has a positive variance, but
 * kept for safety).
 */
export function computeLineProjectionBandsSlope(
  values: readonly number[],
): number | null {
  const n = values.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (let j = 0; j < n; j += 1) {
    const y = values[j]!;
    if (!isFiniteNumber(y)) return null;
    sumX += j;
    sumY += y;
    sumXX += j * j;
    sumXY += j * y;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Per-bar Projection Bands (`upper`, `lower`) over the lookback.
 * Bars before the lookback fills are null on both bands.
 */
export function computeLineProjectionBands(
  bars: readonly ChartLineProjectionBandsPoint[] | null | undefined,
  period: unknown,
): ChartLineProjectionBandsLevels[] {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const p = normalizeLineProjectionBandsPeriod(
    period,
    DEFAULT_CHART_LINE_PROJECTION_BANDS_PERIOD,
  );
  const out: ChartLineProjectionBandsLevels[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < p - 1) {
      out.push({ upper: null, lower: null });
      continue;
    }
    const winHigh: number[] = [];
    const winLow: number[] = [];
    let ok = true;
    for (let j = i - p + 1; j <= i; j += 1) {
      const bar = bars[j];
      if (!bar || !isFiniteNumber(bar.high) || !isFiniteNumber(bar.low)) {
        ok = false;
        break;
      }
      winHigh.push(bar.high);
      winLow.push(bar.low);
    }
    if (!ok) {
      out.push({ upper: null, lower: null });
      continue;
    }
    const slopeH = computeLineProjectionBandsSlope(winHigh);
    const slopeL = computeLineProjectionBandsSlope(winLow);
    if (slopeH === null || slopeL === null) {
      out.push({ upper: null, lower: null });
      continue;
    }
    let upper = -Infinity;
    let lower = Infinity;
    for (let k = 0; k < p; k += 1) {
      // j index inside the lookback window: k = j - (i - p + 1)
      // distance to project to bar i:        i - j = (p - 1) - k
      const dist = p - 1 - k;
      const projH = winHigh[k]! + slopeH * dist;
      const projL = winLow[k]! + slopeL * dist;
      if (projH > upper) upper = projH;
      if (projL < lower) lower = projL;
    }
    out.push({ upper, lower });
  }
  return out;
}

/** Classify a close against its bar's projection bands. */
export function classifyLineProjectionBandsZone(
  close: number | null,
  levels: ChartLineProjectionBandsLevels,
): ChartLineProjectionBandsZone {
  if (
    !isFiniteNumber(close) ||
    !isFiniteNumber(levels.upper) ||
    !isFiniteNumber(levels.lower)
  ) {
    return 'none';
  }
  if (close > levels.upper) return 'above-upper';
  if (close < levels.lower) return 'below-lower';
  return 'inside';
}

export interface ChartLineProjectionBandsOptions {
  period?: number;
}

/** Run the full Projection Bands pipeline. */
export function runLineProjectionBands(
  data: readonly ChartLineProjectionBandsPoint[] | null | undefined,
  options: ChartLineProjectionBandsOptions = {},
): ChartLineProjectionBandsRun {
  const series = getLineProjectionBandsFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineProjectionBandsPeriod(
    options.period,
    DEFAULT_CHART_LINE_PROJECTION_BANDS_PERIOD,
  );
  const levels = computeLineProjectionBands(series, period);
  const samples: ChartLineProjectionBandsSample[] = series.map(
    (point, index) => {
      const lv = levels[index]!;
      return {
        index,
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        levels: lv,
        zone: classifyLineProjectionBandsZone(point.close, lv),
      };
    },
  );
  let aboveCount = 0;
  let insideCount = 0;
  let belowCount = 0;
  let upperFinal: number | null = null;
  let lowerFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above-upper') aboveCount += 1;
    else if (sample.zone === 'inside') insideCount += 1;
    else if (sample.zone === 'below-lower') belowCount += 1;
    if (isFiniteNumber(sample.levels.upper)) upperFinal = sample.levels.upper;
    if (isFiniteNumber(sample.levels.lower)) lowerFinal = sample.levels.lower;
  }
  return {
    series,
    period,
    levels,
    samples,
    upperFinal,
    lowerFinal,
    aboveCount,
    insideCount,
    belowCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineProjectionBandsLayoutOptions
  extends ChartLineProjectionBandsOptions {
  data: readonly ChartLineProjectionBandsPoint[] | null | undefined;
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
export function computeLineProjectionBandsLayout(
  options: ChartLineProjectionBandsLayoutOptions,
): ChartLineProjectionBandsLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_PROJECTION_BANDS_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_PROJECTION_BANDS_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_PROJECTION_BANDS_PADDING;

  const run = runLineProjectionBands(options.data, {
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
    if (isFiniteNumber(ls.upper)) {
      if (ls.upper < valueMin) valueMin = ls.upper;
      if (ls.upper > valueMax) valueMax = ls.upper;
    }
    if (isFiniteNumber(ls.lower)) {
      if (ls.lower < valueMin) valueMin = ls.lower;
      if (ls.lower > valueMax) valueMax = ls.lower;
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
  const priceDots: ChartLineProjectionBandsDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const segments: ChartLineProjectionBandsSegment[] = [];
  const markers: ChartLineProjectionBandsMarker[] = [];
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
      seriesId: ChartLineProjectionBandsSeriesId;
      value: number | null;
    }> = [
      { seriesId: 'upper', value: sample.levels.upper },
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
export function describeLineProjectionBandsChart(
  data: readonly ChartLineProjectionBandsPoint[] | null | undefined,
  options: ChartLineProjectionBandsOptions = {},
): string {
  const run = runLineProjectionBands(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const upperText =
    run.upperFinal === null ? 'n/a' : run.upperFinal.toFixed(3);
  const lowerText =
    run.lowerFinal === null ? 'n/a' : run.lowerFinal.toFixed(3);
  return (
    `Single-panel chart with Mel Widner Projection Bands envelope ` +
    `overlays (period ${run.period}): each defined bar carries the ` +
    `upper and lower projection bands. The upper band is the maximum ` +
    `of the linear-regression-projected highs across the lookback ` +
    `window, and the lower band is the minimum of the projected lows. ` +
    `Each bar inside the window is shifted by its window slope times ` +
    `the distance to bar i. A perfectly linear high/low ramp collapses ` +
    `the bands to the price itself (width = 0). The first ` +
    `${run.period - 1} bars are null on both bands. Across ${total} ` +
    `bars the close sits above the upper band on ${run.aboveCount}, ` +
    `below the lower on ${run.belowCount}, and inside the envelope ` +
    `on ${run.insideCount}. The final upper / lower are ${upperText} ` +
    `/ ${lowerText}.`
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
  zone: ChartLineProjectionBandsZone,
  aboveColor: string,
  belowColor: string,
  insideColor: string,
  noneColor: string,
): string {
  if (zone === 'above-upper') return aboveColor;
  if (zone === 'below-lower') return belowColor;
  if (zone === 'inside') return insideColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineProjectionBandsZone): string {
  if (zone === 'above-upper') return 'Above upper';
  if (zone === 'below-lower') return 'Below lower';
  if (zone === 'inside') return 'Inside';
  return 'n/a';
}

function segmentColorOf(
  seriesId: ChartLineProjectionBandsSeriesId,
  upperColor: string,
  lowerColor: string,
  defaultColor: string,
): string {
  if (seriesId === 'upper') return upperColor;
  if (seriesId === 'lower') return lowerColor;
  return defaultColor;
}

/**
 * ChartLineProjectionBands -- single-panel pure-SVG Mel Widner
 * Projection Bands chart.
 */
export const ChartLineProjectionBands = forwardRef<
  HTMLDivElement,
  ChartLineProjectionBandsProps
>(function ChartLineProjectionBands(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_PROJECTION_BANDS_PERIOD,
    width = DEFAULT_CHART_LINE_PROJECTION_BANDS_WIDTH,
    height = DEFAULT_CHART_LINE_PROJECTION_BANDS_HEIGHT,
    padding = DEFAULT_CHART_LINE_PROJECTION_BANDS_PADDING,
    tickCount = DEFAULT_CHART_LINE_PROJECTION_BANDS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_PROJECTION_BANDS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_PROJECTION_BANDS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_PROJECTION_BANDS_PRICE_COLOR,
    upperColor = DEFAULT_CHART_LINE_PROJECTION_BANDS_UPPER_COLOR,
    lowerColor = DEFAULT_CHART_LINE_PROJECTION_BANDS_LOWER_COLOR,
    aboveColor = DEFAULT_CHART_LINE_PROJECTION_BANDS_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_PROJECTION_BANDS_BELOW_COLOR,
    insideColor = DEFAULT_CHART_LINE_PROJECTION_BANDS_INSIDE_COLOR,
    noneColor = DEFAULT_CHART_LINE_PROJECTION_BANDS_NONE_COLOR,
    gridColor = DEFAULT_CHART_LINE_PROJECTION_BANDS_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_PROJECTION_BANDS_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showUpper = true,
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
  const baseId = `chart-line-projection-bands-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineProjectionBandsSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineProjectionBandsSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineProjectionBandsLayout({
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
    ariaDescription ?? describeLineProjectionBandsChart(data, { period });
  const resolvedLabel =
    ariaLabel ?? `Projection Bands chart, period ${run.period}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineProjectionBandsSeriesId): void => {
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

  const showSeries = (id: ChartLineProjectionBandsSeriesId): boolean => {
    if (isHidden(id)) return false;
    if (id === 'upper') return showUpper;
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
      <g data-section="chart-line-projection-bands-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={108}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-projection-bands-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-projection-bands-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-projection-bands-tooltip-upper"
          x={tx + 10}
          y={ty + 51}
          fill="#fca5a5"
          fontSize={11}
        >
          {`Upper: ${fmt(levels.upper)}`}
        </text>
        <text
          data-section="chart-line-projection-bands-tooltip-lower"
          x={tx + 10}
          y={ty + 67}
          fill="#86efac"
          fontSize={11}
        >
          {`Lower: ${fmt(levels.lower)}`}
        </text>
        <text
          data-section="chart-line-projection-bands-tooltip-zone"
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

  const legendItems: Array<{
    id: ChartLineProjectionBandsSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'upper', label: 'Upper', color: upperColor },
    { id: 'lower', label: 'Lower', color: lowerColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-projection-bands"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-upper-final={run.upperFinal === null ? '' : run.upperFinal}
      data-lower-final={run.lowerFinal === null ? '' : run.lowerFinal}
      data-above-count={run.aboveCount}
      data-inside-count={run.insideCount}
      data-below-count={run.belowCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-projection-bands-aria-desc"
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
          data-section="chart-line-projection-bands-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-projection-bands-empty"
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
          data-section="chart-line-projection-bands-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-projection-bands-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-projection-bands-grid-line"
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
            <g data-section="chart-line-projection-bands-axes">
              <line
                data-section="chart-line-projection-bands-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-projection-bands-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-projection-bands-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-projection-bands-tick-label"
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

          <g data-section="chart-line-projection-bands-segments">
            {layout.segments
              .filter((seg) => showSeries(seg.seriesId))
              .map((seg, i) => (
                <line
                  key={`seg-${seg.index}-${seg.seriesId}-${i}`}
                  data-section="chart-line-projection-bands-segment"
                  data-series-id={seg.seriesId}
                  data-value={seg.value}
                  x1={seg.fromCx}
                  y1={seg.cy}
                  x2={seg.toCx}
                  y2={seg.cy}
                  stroke={segmentColorOf(
                    seg.seriesId,
                    upperColor,
                    lowerColor,
                    insideColor,
                  )}
                  strokeWidth={1.5}
                  strokeOpacity={0.85}
                />
              ))}
          </g>

          {!priceHidden ? (
            <path
              data-section="chart-line-projection-bands-price-path"
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
            <g data-section="chart-line-projection-bands-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-projection-bands-dot"
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
            <g data-section="chart-line-projection-bands-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-projection-bands-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    aboveColor,
                    belowColor,
                    insideColor,
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
            <g data-section="chart-line-projection-bands-badge">
              <rect
                data-section="chart-line-projection-bands-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={104}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-projection-bands-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`PROJ ${run.period}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-projection-bands-legend"
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
                data-section="chart-line-projection-bands-legend-item"
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
                  data-section="chart-line-projection-bands-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-projection-bands-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-projection-bands-legend-stats"
            style={{ color: axisColor }}
          >
            {`above ${run.aboveCount} / inside ${run.insideCount} / below ${run.belowCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineProjectionBands.displayName = 'ChartLineProjectionBands';
