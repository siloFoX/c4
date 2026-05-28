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
 * ChartLineAroonUp -- pure-SVG two-panel Aroon Up chart.
 *
 * For each bar `i`, the window of `period + 1` bars `[i - period .. i]`
 * is scanned for the highest high. The most-recent bar wins on a tie
 * (strict `>`). The Aroon Up scales the bars-since-the-high to a
 * percent:
 *
 *   barsSinceHigh = i - argmax(high over [i - period .. i])
 *   aroonUp       = 100 * (period - barsSinceHigh) / period
 *
 * A new high pushes Aroon Up to 100; a high made `period` bars ago
 * drops it to 0. The reading is bounded to `[0, 100]`. Conventional
 * reference lines sit at 70 (strong uptrend) and 30 (weak uptrend).
 *
 * The top panel plots the bar high; the bottom panel plots the Aroon
 * Up reading with horizontal reference lines.
 */

export interface ChartLineAroonUpPoint {
  x: number;
  high: number;
}

export type ChartLineAroonUpZone = 'strong' | 'mid' | 'weak' | 'none';

export type ChartLineAroonUpSeriesId = 'price' | 'aroonUp';

export interface ChartLineAroonUpSample {
  index: number;
  x: number;
  high: number;
  aroonUp: number | null;
  zone: ChartLineAroonUpZone;
}

export interface ChartLineAroonUpRun {
  series: ChartLineAroonUpPoint[];
  period: number;
  thresholdHigh: number;
  thresholdLow: number;
  aroonUp: Array<number | null>;
  samples: ChartLineAroonUpSample[];
  aroonUpFinal: number | null;
  strongCount: number;
  midCount: number;
  weakCount: number;
  ok: boolean;
}

export interface ChartLineAroonUpMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  aroonUp: number;
  zone: ChartLineAroonUpZone;
}

export interface ChartLineAroonUpDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  high: number;
}

export interface ChartLineAroonUpLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  aroonPanelTop: number;
  aroonPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineAroonUpDot[];
  aroonPath: string;
  markers: ChartLineAroonUpMarker[];
  thresholdHighY: number;
  thresholdLowY: number;
  priceMin: number;
  priceMax: number;
  run: ChartLineAroonUpRun;
}

export interface ChartLineAroonUpProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAroonUpPoint[];
  period?: number;
  thresholdHigh?: number;
  thresholdLow?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  aroonColor?: string;
  strongColor?: string;
  midColor?: string;
  weakColor?: string;
  noneColor?: string;
  thresholdColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAroonUp?: boolean;
  showThresholdLines?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAroonUpSeriesId[];
  defaultHiddenSeries?: ChartLineAroonUpSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAroonUpSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineAroonUpSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_AROON_UP_WIDTH = 720;
export const DEFAULT_CHART_LINE_AROON_UP_HEIGHT = 400;
export const DEFAULT_CHART_LINE_AROON_UP_PADDING = 44;
export const DEFAULT_CHART_LINE_AROON_UP_GAP = 12;
export const DEFAULT_CHART_LINE_AROON_UP_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_AROON_UP_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_AROON_UP_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_AROON_UP_PERIOD = 25;
export const DEFAULT_CHART_LINE_AROON_UP_THRESHOLD_HIGH = 70;
export const DEFAULT_CHART_LINE_AROON_UP_THRESHOLD_LOW = 30;
export const DEFAULT_CHART_LINE_AROON_UP_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_AROON_UP_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_AROON_UP_AROON_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_AROON_UP_STRONG_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_AROON_UP_MID_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_AROON_UP_WEAK_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_AROON_UP_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_AROON_UP_THRESHOLD_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_AROON_UP_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_AROON_UP_AXIS_COLOR = '#94a3b8';

/** The Aroon Up panel is bounded to [0, 100]; the layout pads past it. */
export const CHART_LINE_AROON_UP_MIN = 0;
export const CHART_LINE_AROON_UP_MAX = 100;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite x and high. */
export function getLineAroonUpFinitePoints(
  data: readonly ChartLineAroonUpPoint[] | null | undefined,
): ChartLineAroonUpPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAroonUpPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.high)) {
      out.push({ x: point.x, high: point.high });
    }
  }
  return out;
}

/** Coerce the lookback period to an integer of at least 1. */
export function normalizeLineAroonUpPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/** Coerce a percent threshold to a finite value inside `[0, 100]`. */
export function normalizeLineAroonUpThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0 && threshold <= 100) {
    return threshold;
  }
  return fallback;
}

/**
 * Aroon Up per bar over the window `[i - period .. i]` (period + 1
 * bars). The most-recent bar wins on a tie (strict `>`). Warm-up
 * bars and bars with a non-finite high yield null.
 */
export function computeLineAroonUp(
  bars: readonly ChartLineAroonUpPoint[] | null | undefined,
  period: unknown,
): Array<number | null> {
  if (!Array.isArray(bars)) return [];
  const p = normalizeLineAroonUpPeriod(
    period,
    DEFAULT_CHART_LINE_AROON_UP_PERIOD,
  );
  const out: Array<number | null> = [];
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

/** Classify an Aroon Up reading against the threshold band. */
export function classifyLineAroonUpZone(
  value: number | null,
  thresholdHigh: number,
  thresholdLow: number,
): ChartLineAroonUpZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= thresholdHigh) return 'strong';
  if (value <= thresholdLow) return 'weak';
  return 'mid';
}

export interface ChartLineAroonUpOptions {
  period?: number;
  thresholdHigh?: number;
  thresholdLow?: number;
}

/** Run the full Aroon Up pipeline. */
export function runLineAroonUp(
  data: readonly ChartLineAroonUpPoint[] | null | undefined,
  options: ChartLineAroonUpOptions = {},
): ChartLineAroonUpRun {
  const series = getLineAroonUpFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineAroonUpPeriod(
    options.period,
    DEFAULT_CHART_LINE_AROON_UP_PERIOD,
  );
  const thresholdHigh = normalizeLineAroonUpThreshold(
    options.thresholdHigh,
    DEFAULT_CHART_LINE_AROON_UP_THRESHOLD_HIGH,
  );
  const thresholdLow = normalizeLineAroonUpThreshold(
    options.thresholdLow,
    DEFAULT_CHART_LINE_AROON_UP_THRESHOLD_LOW,
  );
  const aroonUp = computeLineAroonUp(series, period);
  const samples: ChartLineAroonUpSample[] = series.map((point, index) => {
    const value = aroonUp[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      aroonUp: value,
      zone: classifyLineAroonUpZone(value, thresholdHigh, thresholdLow),
    };
  });
  let strongCount = 0;
  let midCount = 0;
  let weakCount = 0;
  let aroonUpFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'strong') strongCount += 1;
    else if (sample.zone === 'mid') midCount += 1;
    else if (sample.zone === 'weak') weakCount += 1;
    if (isFiniteNumber(sample.aroonUp)) aroonUpFinal = sample.aroonUp;
  }
  return {
    series = [],
    period,
    thresholdHigh,
    thresholdLow,
    aroonUp,
    samples,
    aroonUpFinal,
    strongCount,
    midCount,
    weakCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineAroonUpLayoutOptions
  extends ChartLineAroonUpOptions {
  data: readonly ChartLineAroonUpPoint[] | null | undefined;
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
export function computeLineAroonUpLayout(
  options: ChartLineAroonUpLayoutOptions,
): ChartLineAroonUpLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_AROON_UP_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_AROON_UP_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_AROON_UP_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_AROON_UP_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_AROON_UP_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineAroonUp(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.thresholdHigh !== undefined
      ? { thresholdHigh: options.thresholdHigh }
      : {}),
    ...(options.thresholdLow !== undefined
      ? { thresholdLow: options.thresholdLow }
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
  const aroonPanelTop = pricePanelBottom + gap;
  const aroonPanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    aroonPanelBottom - aroonPanelTop > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.high < priceMin) priceMin = sample.high;
    if (sample.high > priceMax) priceMax = sample.high;
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

  const aroonMin = -5;
  const aroonMax = 105;
  const aroonPanelHeight = aroonPanelBottom - aroonPanelTop;
  const aroonYAt = (value: number): number =>
    aroonPanelBottom -
    ((value - aroonMin) / (aroonMax - aroonMin)) * aroonPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineAroonUpDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.high);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, high: sample.high });
  });

  const aroonLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineAroonUpMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.aroonUp)) return;
    const cx = xAt(index);
    const cy = aroonYAt(sample.aroonUp);
    aroonLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      aroonUp: sample.aroonUp,
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
    aroonPanelTop,
    aroonPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    aroonPath: buildLinePath(aroonLinePoints),
    markers,
    thresholdHighY: aroonYAt(run.thresholdHigh),
    thresholdLowY: aroonYAt(run.thresholdLow),
    priceMin,
    priceMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineAroonUpChart(
  data: readonly ChartLineAroonUpPoint[] | null | undefined,
  options: ChartLineAroonUpOptions = {},
): string {
  const run = runLineAroonUp(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.aroonUpFinal === null ? 'n/a' : run.aroonUpFinal.toFixed(2);
  return (
    `Two-panel chart with the Aroon Up indicator (period ${run.period}, ` +
    `thresholds ${run.thresholdLow} / ${run.thresholdHigh}): the top ` +
    `panel plots the bar high, the bottom panel plots the Aroon Up ` +
    `reading. Aroon Up scales the bars since the highest high in the ` +
    `lookback to a 0..100 percent; a new high pushes it to 100, a high ` +
    `made `+run.period+` bars ago drops it to 0. Across ${total} bars ` +
    `the reading is strong (>= ${run.thresholdHigh}) on ${run.strongCount}, ` +
    `weak (<= ${run.thresholdLow}) on ${run.weakCount}, and in the ` +
    `mid band on ${run.midCount}. The final reading is ${finalText}.`
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
  zone: ChartLineAroonUpZone,
  strongColor: string,
  midColor: string,
  weakColor: string,
  noneColor: string,
): string {
  if (zone === 'strong') return strongColor;
  if (zone === 'weak') return weakColor;
  if (zone === 'mid') return midColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineAroonUpZone): string {
  if (zone === 'strong') return 'Strong uptrend';
  if (zone === 'mid') return 'Mid band';
  if (zone === 'weak') return 'Weak';
  return 'n/a';
}

/**
 * ChartLineAroonUp -- two-panel pure-SVG Aroon Up chart.
 */
export const ChartLineAroonUp = forwardRef<HTMLDivElement, ChartLineAroonUpProps>(
  function ChartLineAroonUp(props, ref) {
    const {
      data,
      period = DEFAULT_CHART_LINE_AROON_UP_PERIOD,
      thresholdHigh = DEFAULT_CHART_LINE_AROON_UP_THRESHOLD_HIGH,
      thresholdLow = DEFAULT_CHART_LINE_AROON_UP_THRESHOLD_LOW,
      width = DEFAULT_CHART_LINE_AROON_UP_WIDTH,
      height = DEFAULT_CHART_LINE_AROON_UP_HEIGHT,
      padding = DEFAULT_CHART_LINE_AROON_UP_PADDING,
      gap = DEFAULT_CHART_LINE_AROON_UP_GAP,
      tickCount = DEFAULT_CHART_LINE_AROON_UP_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_AROON_UP_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_AROON_UP_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_AROON_UP_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_AROON_UP_PRICE_COLOR,
      aroonColor = DEFAULT_CHART_LINE_AROON_UP_AROON_COLOR,
      strongColor = DEFAULT_CHART_LINE_AROON_UP_STRONG_COLOR,
      midColor = DEFAULT_CHART_LINE_AROON_UP_MID_COLOR,
      weakColor = DEFAULT_CHART_LINE_AROON_UP_WEAK_COLOR,
      noneColor = DEFAULT_CHART_LINE_AROON_UP_NONE_COLOR,
      thresholdColor = DEFAULT_CHART_LINE_AROON_UP_THRESHOLD_COLOR,
      gridColor = DEFAULT_CHART_LINE_AROON_UP_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_AROON_UP_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showAroonUp = true,
      showThresholdLines = true,
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
    const baseId = `chart-line-aroon-up-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<
      ChartLineAroonUpSeriesId[]
    >(defaultHiddenSeries ?? []);
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineAroonUpSeriesId): boolean =>
      hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineAroonUpLayout({
          data,
          period,
          thresholdHigh,
          thresholdLow,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
        }),
      [
        data,
        period,
        thresholdHigh,
        thresholdLow,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      ],
    );

    const run = layout.run;
    const description =
      ariaDescription ??
      describeLineAroonUpChart(data, {
        period,
        thresholdHigh,
        thresholdLow,
      });
    const resolvedLabel =
      ariaLabel ?? `Aroon Up chart, period ${run.period}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineAroonUpSeriesId): void => {
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
      const tooltipW = 196;
      const rawX = anchorX + 12;
      const tx = Math.min(rawX, layout.width - tooltipW - 4);
      const ty = layout.pricePanelTop + 6;
      tooltip = (
        <g data-section="chart-line-aroon-up-tooltip" pointerEvents="none">
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
            data-section="chart-line-aroon-up-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-aroon-up-tooltip-high"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`High: ${formatValue(hoverSample.high)}`}
          </text>
          <text
            data-section="chart-line-aroon-up-tooltip-aroon"
            x={tx + 10}
            y={ty + 51}
            fill="#86efac"
            fontSize={11}
            fontWeight={600}
          >
            {`Aroon Up: ${
              hoverSample.aroonUp === null
                ? 'n/a'
                : hoverSample.aroonUp.toFixed(2)
            }`}
          </text>
          <text
            data-section="chart-line-aroon-up-tooltip-zone"
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
    const aroonHidden = isHidden('aroonUp') || !showAroonUp;

    const legendItems: Array<{
      id: ChartLineAroonUpSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'High', color: priceColor },
      { id: 'aroonUp', label: 'Aroon Up', color: aroonColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-aroon-up"
        data-empty={isEmpty ? 'true' : 'false'}
        data-period={run.period}
        data-threshold-high={run.thresholdHigh}
        data-threshold-low={run.thresholdLow}
        data-aroon-up-final={
          run.aroonUpFinal === null ? '' : run.aroonUpFinal
        }
        data-strong-count={run.strongCount}
        data-mid-count={run.midCount}
        data-weak-count={run.weakCount}
        data-total-points={run.series.length}
        data-animate={animate ? 'true' : 'false'}
        role="region"
        aria-label={resolvedLabel}
        aria-describedby={descId}
      >
        <span
          id={descId}
          data-section="chart-line-aroon-up-aria-desc"
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
            data-section="chart-line-aroon-up-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-aroon-up-empty"
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
            data-section="chart-line-aroon-up-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-aroon-up-grid">
                {tickValues.map((t, i) => {
                  const py =
                    layout.pricePanelBottom -
                    t * (layout.pricePanelBottom - layout.pricePanelTop);
                  return (
                    <line
                      key={`pg-${i}`}
                      data-section="chart-line-aroon-up-grid-line"
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
                    layout.aroonPanelBottom -
                    t * (layout.aroonPanelBottom - layout.aroonPanelTop);
                  return (
                    <line
                      key={`ag-${i}`}
                      data-section="chart-line-aroon-up-grid-line"
                      data-panel="aroon"
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
              <g data-section="chart-line-aroon-up-axes">
                <line
                  data-section="chart-line-aroon-up-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelTop}
                  x2={layout.innerLeft}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-aroon-up-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelBottom}
                  x2={layout.innerRight}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-aroon-up-axis"
                  data-panel="aroon"
                  x1={layout.innerLeft}
                  y1={layout.aroonPanelTop}
                  x2={layout.innerLeft}
                  y2={layout.aroonPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-aroon-up-axis"
                  data-panel="aroon"
                  x1={layout.innerLeft}
                  y1={layout.aroonPanelBottom}
                  x2={layout.innerRight}
                  y2={layout.aroonPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
              </g>
            ) : null}

            <text
              data-section="chart-line-aroon-up-panel-label"
              data-panel="price"
              x={layout.innerRight}
              y={layout.pricePanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              High
            </text>
            <text
              data-section="chart-line-aroon-up-panel-label"
              data-panel="aroon"
              x={layout.innerRight}
              y={layout.aroonPanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              Aroon Up
            </text>

            {showThresholdLines ? (
              <g data-section="chart-line-aroon-up-threshold-lines">
                <line
                  data-section="chart-line-aroon-up-threshold-line"
                  data-direction="high"
                  x1={layout.innerLeft}
                  y1={layout.thresholdHighY}
                  x2={layout.innerRight}
                  y2={layout.thresholdHighY}
                  stroke={thresholdColor}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <line
                  data-section="chart-line-aroon-up-threshold-line"
                  data-direction="low"
                  x1={layout.innerLeft}
                  y1={layout.thresholdLowY}
                  x2={layout.innerRight}
                  y2={layout.thresholdLowY}
                  stroke={thresholdColor}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
              </g>
            ) : null}

            {!priceHidden ? (
              <path
                data-section="chart-line-aroon-up-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`High line, ${run.series.length} bars`}
              />
            ) : null}

            {!priceHidden && showDots ? (
              <g data-section="chart-line-aroon-up-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-aroon-up-dot"
                    cx={dot.cx}
                    cy={dot.cy}
                    r={dotRadius}
                    fill={priceColor}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(dot.x)}, high ${formatValue(
                      dot.high,
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

            {!aroonHidden ? (
              <path
                data-section="chart-line-aroon-up-aroon-line"
                d={layout.aroonPath}
                fill="none"
                stroke={aroonColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Aroon Up line, ${layout.markers.length} points`}
              />
            ) : null}

            {!aroonHidden && showMarkers ? (
              <g data-section="chart-line-aroon-up-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-aroon-up-marker"
                    data-zone={marker.zone}
                    data-aroon-up={marker.aroonUp}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={zoneColorOf(
                      marker.zone,
                      strongColor,
                      midColor,
                      weakColor,
                      noneColor,
                    )}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, Aroon Up ${formatValue(
                      marker.aroonUp,
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
              <g data-section="chart-line-aroon-up-badge">
                <rect
                  data-section="chart-line-aroon-up-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.pricePanelTop + 4}
                  width={112}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-aroon-up-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.pricePanelTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`AROON UP ${run.period}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-aroon-up-legend"
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
                  data-section="chart-line-aroon-up-legend-item"
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
                    data-section="chart-line-aroon-up-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-aroon-up-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-aroon-up-legend-stats"
              style={{ color: axisColor }}
            >
              {`strong ${run.strongCount} / mid ${run.midCount} / weak ${run.weakCount}`}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineAroonUp.displayName = 'ChartLineAroonUp';
