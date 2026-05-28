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
 * ChartLineAroonOsc -- pure-SVG two-panel Aroon Oscillator chart.
 *
 * The Aroon Oscillator is the spread between Aroon Up and Aroon Down.
 * For each bar, the recent `period + 1` bars are scanned: Aroon Up
 * scales the bars-since the highest high in that window to a 0..100
 * percent, and Aroon Down does the same for the lowest low:
 *
 *   barsSinceHigh = i - argmax(high over [i-period..i])
 *   barsSinceLow  = i - argmin(low  over [i-period..i])
 *   aroonUp   = 100 * (period - barsSinceHigh) / period
 *   aroonDown = 100 * (period - barsSinceLow) / period
 *   osc       = aroonUp - aroonDown
 *
 * A new high pushes Aroon Up to 100; a high made `period` bars ago
 * drops it to 0. The oscillator is therefore bounded to [-100, 100]:
 * a fresh high with an old low reads +100 (the bulls have the recency),
 * the mirror reads -100 (the bears do), 0 is balanced.
 *
 * The top panel plots the bar midpoint; the bottom panel plots the
 * oscillator inside a fixed [-100, 100] band with a zero line and one
 * marker per bar coloured by the sign of the reading.
 */

export interface ChartLineAroonOscPoint {
  x: number;
  high: number;
  low: number;
}

export type ChartLineAroonOscZone = 'up' | 'down' | 'flat' | 'none';

export type ChartLineAroonOscSeriesId = 'price' | 'osc';

export interface ChartLineAroonOscComputed {
  aroonUp: (number | null)[];
  aroonDown: (number | null)[];
  osc: (number | null)[];
}

export interface ChartLineAroonOscSample {
  index: number;
  x: number;
  high: number;
  low: number;
  midpoint: number;
  aroonUp: number | null;
  aroonDown: number | null;
  osc: number | null;
  zone: ChartLineAroonOscZone;
}

export interface ChartLineAroonOscRun {
  series: ChartLineAroonOscPoint[];
  period: number;
  aroonUp: (number | null)[];
  aroonDown: (number | null)[];
  osc: (number | null)[];
  samples: ChartLineAroonOscSample[];
  oscFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineAroonOscMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  osc: number;
  zone: ChartLineAroonOscZone;
}

export interface ChartLineAroonOscDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  midpoint: number;
}

export interface ChartLineAroonOscLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  oscPanelTop: number;
  oscPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineAroonOscDot[];
  oscPath: string;
  markers: ChartLineAroonOscMarker[];
  zeroY: number;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  run: ChartLineAroonOscRun;
}

export interface ChartLineAroonOscProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAroonOscPoint[];
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
  oscColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showOsc?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAroonOscSeriesId[];
  defaultHiddenSeries?: ChartLineAroonOscSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAroonOscSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineAroonOscSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_AROON_OSC_WIDTH = 720;
export const DEFAULT_CHART_LINE_AROON_OSC_HEIGHT = 400;
export const DEFAULT_CHART_LINE_AROON_OSC_PADDING = 44;
export const DEFAULT_CHART_LINE_AROON_OSC_GAP = 12;
export const DEFAULT_CHART_LINE_AROON_OSC_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_AROON_OSC_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_AROON_OSC_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_AROON_OSC_PERIOD = 25;
export const DEFAULT_CHART_LINE_AROON_OSC_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_AROON_OSC_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_AROON_OSC_OSC_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_AROON_OSC_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_AROON_OSC_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_AROON_OSC_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_AROON_OSC_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_AROON_OSC_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_AROON_OSC_AXIS_COLOR = '#94a3b8';

/** The Aroon Oscillator is bounded to this magnitude; the panel pads past it. */
export const CHART_LINE_AROON_OSC_BOUND = 100;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only bars with a finite x, high and low. */
export function getLineAroonOscFinitePoints(
  data: readonly ChartLineAroonOscPoint[] | null | undefined,
): ChartLineAroonOscPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAroonOscPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low)
    ) {
      out.push({ x: point.x, high: point.high, low: point.low });
    }
  }
  return out;
}

/** Coerce the lookback period to an integer of at least 1, else fallback. */
export function normalizeLineAroonOscPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/**
 * Aroon Up per bar: `100 * (period - barsSinceHighestHigh) / period`
 * over the window `[i-period .. i]` (period + 1 bars). The most-recent
 * bar wins on a tie. Warm-up bars and bars with a non-finite high yield
 * null.
 */
export function computeLineAroonOscAroonUp(
  bars: readonly ChartLineAroonOscPoint[] | null | undefined,
  period: unknown,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const p = normalizeLineAroonOscPeriod(
    period,
    DEFAULT_CHART_LINE_AROON_OSC_PERIOD,
  );
  const out: (number | null)[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < p) {
      out.push(null);
      continue;
    }
    let highest = -Infinity;
    let highestIndex = i;
    let ok = true;
    for (let j = 0; j <= p; j += 1) {
      const bar = bars[i - j];
      if (!bar || !isFiniteNumber(bar.high)) {
        ok = false;
        break;
      }
      if (bar.high > highest) {
        highest = bar.high;
        highestIndex = i - j;
      }
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    const barsSince = i - highestIndex;
    out.push((100 * (p - barsSince)) / p);
  }
  return out;
}

/**
 * Aroon Down per bar: `100 * (period - barsSinceLowestLow) / period`
 * over the window `[i-period .. i]`. The most-recent bar wins on a tie.
 */
export function computeLineAroonOscAroonDown(
  bars: readonly ChartLineAroonOscPoint[] | null | undefined,
  period: unknown,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const p = normalizeLineAroonOscPeriod(
    period,
    DEFAULT_CHART_LINE_AROON_OSC_PERIOD,
  );
  const out: (number | null)[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < p) {
      out.push(null);
      continue;
    }
    let lowest = Infinity;
    let lowestIndex = i;
    let ok = true;
    for (let j = 0; j <= p; j += 1) {
      const bar = bars[i - j];
      if (!bar || !isFiniteNumber(bar.low)) {
        ok = false;
        break;
      }
      if (bar.low < lowest) {
        lowest = bar.low;
        lowestIndex = i - j;
      }
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    const barsSince = i - lowestIndex;
    out.push((100 * (p - barsSince)) / p);
  }
  return out;
}

/** Compute the Aroon Oscillator: Aroon Up minus Aroon Down. */
export function computeLineAroonOsc(
  bars: readonly ChartLineAroonOscPoint[] | null | undefined,
  period: unknown,
): ChartLineAroonOscComputed {
  if (!Array.isArray(bars)) {
    return { aroonUp: [], aroonDown: [], osc: [] };
  }
  const aroonUp = computeLineAroonOscAroonUp(bars, period);
  const aroonDown = computeLineAroonOscAroonDown(bars, period);
  const osc: (number | null)[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const u = aroonUp[i];
    const d = aroonDown[i];
    osc.push(isFiniteNumber(u) && isFiniteNumber(d) ? u - d : null);
  }
  return { aroonUp, aroonDown, osc };
}

/** Classify a bar by the sign of the Aroon Oscillator. */
export function classifyLineAroonOscZone(
  osc: number | null,
): ChartLineAroonOscZone {
  if (!isFiniteNumber(osc)) return 'none';
  if (osc > 0) return 'up';
  if (osc < 0) return 'down';
  return 'flat';
}

export interface ChartLineAroonOscOptions {
  period?: number;
}

/** Run the full Aroon Oscillator pipeline over a set of bars. */
export function runLineAroonOsc(
  data: readonly ChartLineAroonOscPoint[] | null | undefined,
  options: ChartLineAroonOscOptions = {},
): ChartLineAroonOscRun {
  const series = getLineAroonOscFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineAroonOscPeriod(
    options.period,
    DEFAULT_CHART_LINE_AROON_OSC_PERIOD,
  );
  const { aroonUp, aroonDown, osc } = computeLineAroonOsc(series, period);

  const samples: ChartLineAroonOscSample[] = series.map((bar, index) => {
    const oscValue = osc[index] ?? null;
    return {
      index,
      x: bar.x,
      high: bar.high,
      low: bar.low,
      midpoint: (bar.high + bar.low) / 2,
      aroonUp: aroonUp[index] ?? null,
      aroonDown: aroonDown[index] ?? null,
      osc: oscValue,
      zone: classifyLineAroonOscZone(oscValue),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let oscFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.osc)) oscFinal = sample.osc;
  }

  return {
    series = [],
    period,
    aroonUp,
    aroonDown,
    osc,
    samples,
    oscFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineAroonOscLayoutOptions
  extends ChartLineAroonOscOptions {
  data: readonly ChartLineAroonOscPoint[] | null | undefined;
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
export function computeLineAroonOscLayout(
  options: ChartLineAroonOscLayoutOptions,
): ChartLineAroonOscLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_AROON_OSC_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_AROON_OSC_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_AROON_OSC_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_AROON_OSC_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_AROON_OSC_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineAroonOsc(options.data, {
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
  const oscPanelTop = pricePanelBottom + gap;
  const oscPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    oscPanelBottom - oscPanelTop > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.midpoint < priceMin) priceMin = sample.midpoint;
    if (sample.midpoint > priceMax) priceMax = sample.midpoint;
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

  const oscMin = -(CHART_LINE_AROON_OSC_BOUND + 10);
  const oscMax = CHART_LINE_AROON_OSC_BOUND + 10;
  const oscPanelHeight = oscPanelBottom - oscPanelTop;
  const oscYAt = (value: number): number =>
    oscPanelBottom - ((value - oscMin) / (oscMax - oscMin)) * oscPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineAroonOscDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.midpoint);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, midpoint: sample.midpoint });
  });

  const oscLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineAroonOscMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.osc)) return;
    const cx = xAt(index);
    const cy = oscYAt(sample.osc);
    oscLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      osc: sample.osc,
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
    oscPanelTop,
    oscPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    oscPath: buildLinePath(oscLinePoints),
    markers,
    zeroY: oscYAt(0),
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineAroonOscChart(
  data: readonly ChartLineAroonOscPoint[] | null | undefined,
  options: ChartLineAroonOscOptions = {},
): string {
  const run = runLineAroonOsc(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.oscFinal === null ? 'n/a' : run.oscFinal.toFixed(2);
  return (
    `Two-panel chart with the Aroon Oscillator (period ${run.period}): ` +
    `the top panel plots the bar midpoint, the bottom panel plots the ` +
    `spread between Aroon Up and Aroon Down. Aroon Up scales the bars ` +
    `since the highest high in the lookback to a 0..100 percent and ` +
    `Aroon Down does the same for the lowest low; the oscillator is ` +
    `their difference, bounded to [-100, 100]. Across ${total} bars ` +
    `the oscillator is positive on ${run.upCount}, negative on ` +
    `${run.downCount} and flat on ${run.flatCount}. The final ` +
    `oscillator reading is ${finalText}.`
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
  zone: ChartLineAroonOscZone,
  upColor: string,
  downColor: string,
  flatColor: string,
): string {
  if (zone === 'up') return upColor;
  if (zone === 'down') return downColor;
  return flatColor;
}

function zoneLabelOf(zone: ChartLineAroonOscZone): string {
  if (zone === 'up') return 'Bull bias';
  if (zone === 'down') return 'Bear bias';
  if (zone === 'flat') return 'Balanced';
  return 'n/a';
}

/**
 * ChartLineAroonOsc -- two-panel pure-SVG Aroon Oscillator chart.
 */
export const ChartLineAroonOsc = forwardRef<
  HTMLDivElement,
  ChartLineAroonOscProps
>(function ChartLineAroonOsc(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_AROON_OSC_PERIOD,
    width = DEFAULT_CHART_LINE_AROON_OSC_WIDTH,
    height = DEFAULT_CHART_LINE_AROON_OSC_HEIGHT,
    padding = DEFAULT_CHART_LINE_AROON_OSC_PADDING,
    gap = DEFAULT_CHART_LINE_AROON_OSC_GAP,
    tickCount = DEFAULT_CHART_LINE_AROON_OSC_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_AROON_OSC_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_AROON_OSC_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_AROON_OSC_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_AROON_OSC_PRICE_COLOR,
    oscColor = DEFAULT_CHART_LINE_AROON_OSC_OSC_COLOR,
    upColor = DEFAULT_CHART_LINE_AROON_OSC_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_AROON_OSC_DOWN_COLOR,
    flatColor = DEFAULT_CHART_LINE_AROON_OSC_FLAT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_AROON_OSC_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_AROON_OSC_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_AROON_OSC_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showOsc = true,
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
  const baseId = `chart-line-aroon-osc-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineAroonOscSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineAroonOscSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineAroonOscLayout({
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
    ariaDescription ?? describeLineAroonOscChart(data, { period });
  const resolvedLabel =
    ariaLabel ?? `Aroon Oscillator chart, period ${run.period}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineAroonOscSeriesId): void => {
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
      <g data-section="chart-line-aroon-osc-tooltip" pointerEvents="none">
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
          data-section="chart-line-aroon-osc-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-aroon-osc-tooltip-high"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`High: ${formatValue(hoverSample.high)}`}
        </text>
        <text
          data-section="chart-line-aroon-osc-tooltip-low"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Low: ${formatValue(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-aroon-osc-tooltip-aroon"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Aroon: ${
            hoverSample.aroonUp === null
              ? 'n/a'
              : formatValue(hoverSample.aroonUp)
          } / ${
            hoverSample.aroonDown === null
              ? 'n/a'
              : formatValue(hoverSample.aroonDown)
          }`}
        </text>
        <text
          data-section="chart-line-aroon-osc-tooltip-osc"
          x={tx + 10}
          y={ty + 83}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Osc: ${
            hoverSample.osc === null ? 'n/a' : formatValue(hoverSample.osc)
          }`}
        </text>
        <text
          data-section="chart-line-aroon-osc-tooltip-zone"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Bias: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const oscHidden = isHidden('osc') || !showOsc;

  const legendItems: Array<{
    id: ChartLineAroonOscSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Midpoint', color: priceColor },
    { id: 'osc', label: 'Aroon Osc', color: oscColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-aroon-osc"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-osc-final={run.oscFinal === null ? '' : run.oscFinal}
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
        data-section="chart-line-aroon-osc-aria-desc"
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
          data-section="chart-line-aroon-osc-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-aroon-osc-empty"
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
          data-section="chart-line-aroon-osc-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-aroon-osc-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-aroon-osc-grid-line"
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
                const oy =
                  layout.oscPanelBottom -
                  t * (layout.oscPanelBottom - layout.oscPanelTop);
                return (
                  <line
                    key={`og-${i}`}
                    data-section="chart-line-aroon-osc-grid-line"
                    data-panel="osc"
                    x1={layout.innerLeft}
                    y1={oy}
                    x2={layout.innerRight}
                    y2={oy}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-aroon-osc-axes">
              <line
                data-section="chart-line-aroon-osc-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-aroon-osc-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-aroon-osc-axis"
                data-panel="osc"
                x1={layout.innerLeft}
                y1={layout.oscPanelTop}
                x2={layout.innerLeft}
                y2={layout.oscPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-aroon-osc-axis"
                data-panel="osc"
                x1={layout.innerLeft}
                y1={layout.oscPanelBottom}
                x2={layout.innerRight}
                y2={layout.oscPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-aroon-osc-tick-label"
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
                data-section="chart-line-aroon-osc-tick-label"
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
                data-section="chart-line-aroon-osc-tick-label"
                data-panel="osc"
                x={layout.innerLeft - 6}
                y={layout.oscPanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                100
              </text>
              <text
                data-section="chart-line-aroon-osc-tick-label"
                data-panel="osc"
                x={layout.innerLeft - 6}
                y={layout.oscPanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                -100
              </text>
            </g>
          ) : null}

          <text
            data-section="chart-line-aroon-osc-panel-label"
            data-panel="price"
            x={layout.innerRight}
            y={layout.pricePanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Midpoint
          </text>
          <text
            data-section="chart-line-aroon-osc-panel-label"
            data-panel="osc"
            x={layout.innerRight}
            y={layout.oscPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Aroon Oscillator
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-aroon-osc-zero-line"
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
              data-section="chart-line-aroon-osc-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Bar midpoint line, ${run.series.length} bars`}
            />
          ) : null}

          {!priceHidden && showDots ? (
            <g data-section="chart-line-aroon-osc-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-aroon-osc-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, midpoint ${formatValue(
                    dot.midpoint,
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

          {!oscHidden ? (
            <path
              data-section="chart-line-aroon-osc-osc-line"
              d={layout.oscPath}
              fill="none"
              stroke={oscColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Aroon Oscillator line, ${layout.markers.length} points`}
            />
          ) : null}

          {!oscHidden && showMarkers ? (
            <g data-section="chart-line-aroon-osc-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-aroon-osc-marker"
                  data-zone={marker.zone}
                  data-osc={marker.osc}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(marker.zone, upColor, downColor, flatColor)}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, osc ${formatValue(
                    marker.osc,
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
            <g data-section="chart-line-aroon-osc-badge">
              <rect
                data-section="chart-line-aroon-osc-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={68}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-aroon-osc-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`AROON ${run.period}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-aroon-osc-legend"
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
                data-section="chart-line-aroon-osc-legend-item"
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
                  data-section="chart-line-aroon-osc-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-aroon-osc-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-aroon-osc-legend-stats"
            style={{ color: axisColor }}
          >
            {`up ${run.upCount} / down ${run.downCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineAroonOsc.displayName = 'ChartLineAroonOsc';
