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
 * ChartLineTrendTrigger -- pure-SVG two-panel Trend Trigger Factor chart.
 *
 * M. H. Pee's Trend Trigger Factor pits buying power against selling
 * power across two adjacent lookback windows:
 *
 *   recentHigh / recentLow = max / min of the last `period` bars (the recent window)
 *   priorHigh  / priorLow  = max / min of the prior `period` bars before it
 *   BP = recentHigh - priorLow      -- how far the bulls extended
 *   SP = priorHigh  - recentLow     -- how far the bears extended
 *   TTF = 100 * (BP - SP) / ((BP + SP) / 2)
 *
 * A strong uptrend pushes BP positive and SP negative so the TTF rises
 * well above its +trigger level (default 100); a strong downtrend
 * mirrors it below the -trigger level. Crossing the +trigger / -trigger
 * lines is the trade signal Pee published in 2002.
 *
 * The top panel plots the bar midpoint; the bottom panel plots the TTF
 * with horizontal +trigger / -trigger reference lines and one marker
 * per bar coloured by zone.
 */

export interface ChartLineTrendTriggerPoint {
  x: number;
  high: number;
  low: number;
}

export type ChartLineTrendTriggerZone = 'up' | 'down' | 'neutral' | 'none';

export type ChartLineTrendTriggerSeriesId = 'price' | 'ttf';

export interface ChartLineTrendTriggerComputed {
  bp: (number | null)[];
  sp: (number | null)[];
  ttf: (number | null)[];
}

export interface ChartLineTrendTriggerSample {
  index: number;
  x: number;
  high: number;
  low: number;
  midpoint: number;
  bp: number | null;
  sp: number | null;
  ttf: number | null;
  zone: ChartLineTrendTriggerZone;
}

export interface ChartLineTrendTriggerRun {
  series: ChartLineTrendTriggerPoint[];
  period: number;
  triggerLevel: number;
  bp: (number | null)[];
  sp: (number | null)[];
  ttf: (number | null)[];
  samples: ChartLineTrendTriggerSample[];
  ttfFinal: number | null;
  upCount: number;
  downCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineTrendTriggerMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  ttf: number;
  zone: ChartLineTrendTriggerZone;
}

export interface ChartLineTrendTriggerDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  midpoint: number;
}

export interface ChartLineTrendTriggerLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  ttfPanelTop: number;
  ttfPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineTrendTriggerDot[];
  ttfPath: string;
  markers: ChartLineTrendTriggerMarker[];
  zeroY: number;
  upperY: number;
  lowerY: number;
  priceMin: number;
  priceMax: number;
  ttfMin: number;
  ttfMax: number;
  run: ChartLineTrendTriggerRun;
}

export interface ChartLineTrendTriggerProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTrendTriggerPoint[];
  period?: number;
  triggerLevel?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  ttfColor?: string;
  upColor?: string;
  downColor?: string;
  neutralColor?: string;
  zeroColor?: string;
  triggerColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTtf?: boolean;
  showZeroLine?: boolean;
  showTriggers?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTrendTriggerSeriesId[];
  defaultHiddenSeries?: ChartLineTrendTriggerSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTrendTriggerSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineTrendTriggerSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_TREND_TRIGGER_WIDTH = 720;
export const DEFAULT_CHART_LINE_TREND_TRIGGER_HEIGHT = 400;
export const DEFAULT_CHART_LINE_TREND_TRIGGER_PADDING = 44;
export const DEFAULT_CHART_LINE_TREND_TRIGGER_GAP = 12;
export const DEFAULT_CHART_LINE_TREND_TRIGGER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TREND_TRIGGER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TREND_TRIGGER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TREND_TRIGGER_PERIOD = 15;
export const DEFAULT_CHART_LINE_TREND_TRIGGER_TRIGGER_LEVEL = 100;
export const DEFAULT_CHART_LINE_TREND_TRIGGER_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_TREND_TRIGGER_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TREND_TRIGGER_TTF_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TREND_TRIGGER_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TREND_TRIGGER_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TREND_TRIGGER_NEUTRAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_TREND_TRIGGER_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TREND_TRIGGER_TRIGGER_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_TREND_TRIGGER_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TREND_TRIGGER_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only bars with a finite x, high and low. */
export function getLineTrendTriggerFinitePoints(
  data: readonly ChartLineTrendTriggerPoint[] | null | undefined,
): ChartLineTrendTriggerPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTrendTriggerPoint[] = [];
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
export function normalizeLineTrendTriggerPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/** Coerce the trigger level to a finite positive number, else fallback. */
export function normalizeLineTrendTriggerLevel(
  level: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(level) && level > 0) return level;
  return fallback;
}

/**
 * Compute the Trend Trigger Factor pipeline: per bar the recent and
 * prior windows' highs and lows, the BP = recentHigh - priorLow and
 * SP = priorHigh - recentLow ranges, and the TTF = 100 * (BP - SP) /
 * ((BP + SP) / 2). A zero denominator (a flat market) yields null.
 */
export function computeLineTrendTrigger(
  bars: readonly ChartLineTrendTriggerPoint[] | null | undefined,
  period: unknown,
): ChartLineTrendTriggerComputed {
  if (!Array.isArray(bars)) return { bp: [], sp: [], ttf: [] };
  const p = normalizeLineTrendTriggerPeriod(
    period,
    DEFAULT_CHART_LINE_TREND_TRIGGER_PERIOD,
  );
  const n = bars.length;
  const bp: (number | null)[] = [];
  const sp: (number | null)[] = [];
  const ttf: (number | null)[] = [];
  for (let i = 0; i < n; i += 1) {
    if (i < 2 * p - 1) {
      bp.push(null);
      sp.push(null);
      ttf.push(null);
      continue;
    }
    let recentHigh = -Infinity;
    let recentLow = Infinity;
    let priorHigh = -Infinity;
    let priorLow = Infinity;
    let ok = true;
    for (let j = 0; j < p; j += 1) {
      const recent = bars[i - j];
      if (
        !recent ||
        !isFiniteNumber(recent.high) ||
        !isFiniteNumber(recent.low)
      ) {
        ok = false;
        break;
      }
      if (recent.high > recentHigh) recentHigh = recent.high;
      if (recent.low < recentLow) recentLow = recent.low;
    }
    if (ok) {
      for (let j = 0; j < p; j += 1) {
        const prior = bars[i - p - j];
        if (
          !prior ||
          !isFiniteNumber(prior.high) ||
          !isFiniteNumber(prior.low)
        ) {
          ok = false;
          break;
        }
        if (prior.high > priorHigh) priorHigh = prior.high;
        if (prior.low < priorLow) priorLow = prior.low;
      }
    }
    if (!ok) {
      bp.push(null);
      sp.push(null);
      ttf.push(null);
      continue;
    }
    const bpVal = recentHigh - priorLow;
    const spVal = priorHigh - recentLow;
    const denom = (bpVal + spVal) / 2;
    bp.push(bpVal);
    sp.push(spVal);
    ttf.push(denom !== 0 ? (100 * (bpVal - spVal)) / denom : null);
  }
  return { bp, sp, ttf };
}

/** Classify a bar by the TTF against the +/- trigger level. */
export function classifyLineTrendTriggerZone(
  ttf: number | null,
  triggerLevel: number,
): ChartLineTrendTriggerZone {
  if (!isFiniteNumber(ttf)) return 'none';
  if (ttf >= triggerLevel) return 'up';
  if (ttf <= -triggerLevel) return 'down';
  return 'neutral';
}

export interface ChartLineTrendTriggerOptions {
  period?: number;
  triggerLevel?: number;
}

/** Run the full Trend Trigger Factor pipeline over a set of bars. */
export function runLineTrendTrigger(
  data: readonly ChartLineTrendTriggerPoint[] | null | undefined,
  options: ChartLineTrendTriggerOptions = {},
): ChartLineTrendTriggerRun {
  const series = getLineTrendTriggerFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineTrendTriggerPeriod(
    options.period,
    DEFAULT_CHART_LINE_TREND_TRIGGER_PERIOD,
  );
  const triggerLevel = normalizeLineTrendTriggerLevel(
    options.triggerLevel,
    DEFAULT_CHART_LINE_TREND_TRIGGER_TRIGGER_LEVEL,
  );
  const { bp, sp, ttf } = computeLineTrendTrigger(series, period);

  const samples: ChartLineTrendTriggerSample[] = series.map((bar, index) => {
    const ttfValue = ttf[index] ?? null;
    return {
      index,
      x: bar.x,
      high: bar.high,
      low: bar.low,
      midpoint: (bar.high + bar.low) / 2,
      bp: bp[index] ?? null,
      sp: sp[index] ?? null,
      ttf: ttfValue,
      zone: classifyLineTrendTriggerZone(ttfValue, triggerLevel),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let neutralCount = 0;
  let ttfFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    else if (sample.zone === 'neutral') neutralCount += 1;
    if (isFiniteNumber(sample.ttf)) ttfFinal = sample.ttf;
  }

  return {
    series,
    period,
    triggerLevel,
    bp,
    sp,
    ttf,
    samples,
    ttfFinal,
    upCount,
    downCount,
    neutralCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineTrendTriggerLayoutOptions
  extends ChartLineTrendTriggerOptions {
  data: readonly ChartLineTrendTriggerPoint[] | null | undefined;
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
export function computeLineTrendTriggerLayout(
  options: ChartLineTrendTriggerLayoutOptions,
): ChartLineTrendTriggerLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_TREND_TRIGGER_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_TREND_TRIGGER_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_TREND_TRIGGER_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_TREND_TRIGGER_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_TREND_TRIGGER_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineTrendTrigger(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.triggerLevel !== undefined
      ? { triggerLevel: options.triggerLevel }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const ttfPanelTop = pricePanelBottom + gap;
  const ttfPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 && pricePanelHeight > 0 && ttfPanelBottom - ttfPanelTop > 0;
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

  let ttfMin = -run.triggerLevel;
  let ttfMax = run.triggerLevel;
  for (const v of run.ttf) {
    if (!isFiniteNumber(v)) continue;
    if (v < ttfMin) ttfMin = v;
    if (v > ttfMax) ttfMax = v;
  }
  const range = ttfMax - ttfMin;
  ttfMin -= range * 0.05;
  ttfMax += range * 0.05;
  const ttfPanelHeight = ttfPanelBottom - ttfPanelTop;
  const ttfYAt = (value: number): number =>
    ttfPanelBottom - ((value - ttfMin) / (ttfMax - ttfMin)) * ttfPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineTrendTriggerDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.midpoint);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, midpoint: sample.midpoint });
  });

  const ttfLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineTrendTriggerMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.ttf)) return;
    const cx = xAt(index);
    const cy = ttfYAt(sample.ttf);
    ttfLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      ttf: sample.ttf,
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
    ttfPanelTop,
    ttfPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    ttfPath: buildLinePath(ttfLinePoints),
    markers,
    zeroY: ttfYAt(0),
    upperY: ttfYAt(run.triggerLevel),
    lowerY: ttfYAt(-run.triggerLevel),
    priceMin,
    priceMax,
    ttfMin,
    ttfMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineTrendTriggerChart(
  data: readonly ChartLineTrendTriggerPoint[] | null | undefined,
  options: ChartLineTrendTriggerOptions = {},
): string {
  const run = runLineTrendTrigger(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.ttfFinal === null ? 'n/a' : run.ttfFinal.toFixed(2);
  return (
    `Two-panel chart with the Trend Trigger Factor (period ` +
    `${run.period}): the top panel plots the bar midpoint, the bottom ` +
    `panel plots the TTF. The Trend Trigger Factor compares buying ` +
    `power against selling power across two adjacent lookback windows ` +
    `-- buying power is the recent high minus the prior low, selling ` +
    `power is the prior high minus the recent low, and the TTF is ` +
    `100 * (BP - SP) divided by the average of BP and SP. A reading ` +
    `above the +trigger level marks a strong uptrend; below the ` +
    `-trigger level marks a strong downtrend. Across ${total} bars the ` +
    `TTF is above +${run.triggerLevel} on ${run.upCount}, below ` +
    `-${run.triggerLevel} on ${run.downCount} and neutral on ` +
    `${run.neutralCount}. The final TTF reading is ${finalText}.`
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
  zone: ChartLineTrendTriggerZone,
  upColor: string,
  downColor: string,
  neutralColor: string,
): string {
  if (zone === 'up') return upColor;
  if (zone === 'down') return downColor;
  return neutralColor;
}

function zoneLabelOf(zone: ChartLineTrendTriggerZone): string {
  if (zone === 'up') return 'Strong up';
  if (zone === 'down') return 'Strong down';
  if (zone === 'neutral') return 'Neutral';
  return 'n/a';
}

/**
 * ChartLineTrendTrigger -- two-panel pure-SVG Trend Trigger Factor chart.
 */
export const ChartLineTrendTrigger = forwardRef<
  HTMLDivElement,
  ChartLineTrendTriggerProps
>(function ChartLineTrendTrigger(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_TREND_TRIGGER_PERIOD,
    triggerLevel = DEFAULT_CHART_LINE_TREND_TRIGGER_TRIGGER_LEVEL,
    width = DEFAULT_CHART_LINE_TREND_TRIGGER_WIDTH,
    height = DEFAULT_CHART_LINE_TREND_TRIGGER_HEIGHT,
    padding = DEFAULT_CHART_LINE_TREND_TRIGGER_PADDING,
    gap = DEFAULT_CHART_LINE_TREND_TRIGGER_GAP,
    tickCount = DEFAULT_CHART_LINE_TREND_TRIGGER_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_TREND_TRIGGER_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_TREND_TRIGGER_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TREND_TRIGGER_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TREND_TRIGGER_PRICE_COLOR,
    ttfColor = DEFAULT_CHART_LINE_TREND_TRIGGER_TTF_COLOR,
    upColor = DEFAULT_CHART_LINE_TREND_TRIGGER_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_TREND_TRIGGER_DOWN_COLOR,
    neutralColor = DEFAULT_CHART_LINE_TREND_TRIGGER_NEUTRAL_COLOR,
    zeroColor = DEFAULT_CHART_LINE_TREND_TRIGGER_ZERO_COLOR,
    triggerColor = DEFAULT_CHART_LINE_TREND_TRIGGER_TRIGGER_COLOR,
    gridColor = DEFAULT_CHART_LINE_TREND_TRIGGER_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_TREND_TRIGGER_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTtf = true,
    showZeroLine = true,
    showTriggers = true,
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
  const baseId = `chart-line-trend-trigger-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineTrendTriggerSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineTrendTriggerSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineTrendTriggerLayout({
        data,
        period,
        triggerLevel,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [
      data,
      period,
      triggerLevel,
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
    describeLineTrendTriggerChart(data, { period, triggerLevel });
  const resolvedLabel =
    ariaLabel ?? `Trend Trigger Factor chart, period ${run.period}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineTrendTriggerSeriesId): void => {
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
      <g data-section="chart-line-trend-trigger-tooltip" pointerEvents="none">
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
          data-section="chart-line-trend-trigger-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-trend-trigger-tooltip-high"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`High: ${formatValue(hoverSample.high)}`}
        </text>
        <text
          data-section="chart-line-trend-trigger-tooltip-low"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Low: ${formatValue(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-trend-trigger-tooltip-bp"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`BP: ${
            hoverSample.bp === null ? 'n/a' : formatValue(hoverSample.bp)
          } / SP: ${
            hoverSample.sp === null ? 'n/a' : formatValue(hoverSample.sp)
          }`}
        </text>
        <text
          data-section="chart-line-trend-trigger-tooltip-ttf"
          x={tx + 10}
          y={ty + 83}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`TTF: ${
            hoverSample.ttf === null ? 'n/a' : formatValue(hoverSample.ttf)
          }`}
        </text>
        <text
          data-section="chart-line-trend-trigger-tooltip-zone"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Trend: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const ttfHidden = isHidden('ttf') || !showTtf;

  const legendItems: Array<{
    id: ChartLineTrendTriggerSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Midpoint', color: priceColor },
    { id: 'ttf', label: 'TTF', color: ttfColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-trend-trigger"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-trigger-level={run.triggerLevel}
      data-ttf-final={run.ttfFinal === null ? '' : run.ttfFinal}
      data-up-count={run.upCount}
      data-down-count={run.downCount}
      data-neutral-count={run.neutralCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-trend-trigger-aria-desc"
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
          data-section="chart-line-trend-trigger-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-trend-trigger-empty"
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
          data-section="chart-line-trend-trigger-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-trend-trigger-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-trend-trigger-grid-line"
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
                const ty =
                  layout.ttfPanelBottom -
                  t * (layout.ttfPanelBottom - layout.ttfPanelTop);
                return (
                  <line
                    key={`tg-${i}`}
                    data-section="chart-line-trend-trigger-grid-line"
                    data-panel="ttf"
                    x1={layout.innerLeft}
                    y1={ty}
                    x2={layout.innerRight}
                    y2={ty}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-trend-trigger-axes">
              <line
                data-section="chart-line-trend-trigger-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trend-trigger-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trend-trigger-axis"
                data-panel="ttf"
                x1={layout.innerLeft}
                y1={layout.ttfPanelTop}
                x2={layout.innerLeft}
                y2={layout.ttfPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trend-trigger-axis"
                data-panel="ttf"
                x1={layout.innerLeft}
                y1={layout.ttfPanelBottom}
                x2={layout.innerRight}
                y2={layout.ttfPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-trend-trigger-tick-label"
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
                data-section="chart-line-trend-trigger-tick-label"
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
                data-section="chart-line-trend-trigger-tick-label"
                data-panel="ttf"
                x={layout.innerLeft - 6}
                y={layout.ttfPanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.ttfMax)}
              </text>
              <text
                data-section="chart-line-trend-trigger-tick-label"
                data-panel="ttf"
                x={layout.innerLeft - 6}
                y={layout.ttfPanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.ttfMin)}
              </text>
            </g>
          ) : null}

          <text
            data-section="chart-line-trend-trigger-panel-label"
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
            data-section="chart-line-trend-trigger-panel-label"
            data-panel="ttf"
            x={layout.innerRight}
            y={layout.ttfPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Trend Trigger Factor
          </text>

          {showTriggers ? (
            <g data-section="chart-line-trend-trigger-triggers">
              <line
                data-section="chart-line-trend-trigger-trigger-line"
                data-level="upper"
                x1={layout.innerLeft}
                y1={layout.upperY}
                x2={layout.innerRight}
                y2={layout.upperY}
                stroke={triggerColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                data-section="chart-line-trend-trigger-trigger-line"
                data-level="lower"
                x1={layout.innerLeft}
                y1={layout.lowerY}
                x2={layout.innerRight}
                y2={layout.lowerY}
                stroke={triggerColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-trend-trigger-zero-line"
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
              data-section="chart-line-trend-trigger-price-path"
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
            <g data-section="chart-line-trend-trigger-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-trend-trigger-dot"
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

          {!ttfHidden ? (
            <path
              data-section="chart-line-trend-trigger-ttf-line"
              d={layout.ttfPath}
              fill="none"
              stroke={ttfColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`TTF line, ${layout.markers.length} points`}
            />
          ) : null}

          {!ttfHidden && showMarkers ? (
            <g data-section="chart-line-trend-trigger-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-trend-trigger-marker"
                  data-zone={marker.zone}
                  data-ttf={marker.ttf}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(marker.zone, upColor, downColor, neutralColor)}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, ttf ${formatValue(
                    marker.ttf,
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
            <g data-section="chart-line-trend-trigger-badge">
              <rect
                data-section="chart-line-trend-trigger-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={80}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-trend-trigger-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`TTF ${run.period}/${run.triggerLevel}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-trend-trigger-legend"
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
                data-section="chart-line-trend-trigger-legend-item"
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
                  data-section="chart-line-trend-trigger-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-trend-trigger-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-trend-trigger-legend-stats"
            style={{ color: axisColor }}
          >
            {`up ${run.upCount} / down ${run.downCount} / neutral ${run.neutralCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineTrendTrigger.displayName = 'ChartLineTrendTrigger';
