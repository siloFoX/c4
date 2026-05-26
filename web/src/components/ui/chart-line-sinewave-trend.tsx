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
 * ChartLineSinewaveTrend -- pure-SVG dual-panel chart with the
 * Ehlers Sinewave Trend oscillator panel beneath the close.
 *
 * Definition (John Ehlers, MESA Sinewave Indicator):
 *
 *   detrender[i] = 0.0962 * close[i] + 0.5769 * close[i - 2]
 *                - 0.5769 * close[i - 4] - 0.0962 * close[i - 6]
 *   I[i]         = detrender[i - 3]                       (in-phase)
 *   Q[i]         = 0.0962 * detrender[i] + 0.5769 * detrender[i - 2]
 *                - 0.5769 * detrender[i - 4] - 0.0962 * detrender[i - 6]
 *   phase[i]     = atan2(Q[i], I[i])
 *   sine[i]      = sin(phase[i])
 *   leadSine[i]  = sin(phase[i] + pi / 4)
 *
 * The lead sine is the sine wave shifted forward by 45 degrees,
 * crossing the sine ahead of pivot points. The two lines act
 * as an early reversal signal: leadSine crossing above sine
 * marks a likely turn up, and leadSine crossing below sine
 * marks a likely turn down.
 *
 * Bars before `i = 10` (FIR + delay + 1 prior bar) are `null`
 * (warmup). When both `|I|` and `|Q|` are below
 * `PHASE_EPSILON = 1e-10` the phase is undefined and the bar
 * yields `null` (a singular trend).
 *
 * Bit-exact anchor:
 *
 *   * **CONST_FLAT (close == K, any K)**: the Hilbert FIR
 *     collapses to within a few ULPs of zero (bit-exact at
 *     K = 0); both `|I|` and `|Q|` are below the phase
 *     epsilon, so the bar is `null` at every position past
 *     the warmup.
 *
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots both sine and
 * leadSine on a `[-1, +1]` axis with a zero baseline.
 */

export interface ChartLineSinewaveTrendPoint {
  x: number;
  close: number;
}

export type ChartLineSinewaveTrendZone =
  | 'positive'
  | 'flat'
  | 'negative'
  | 'none';

export type ChartLineSinewaveTrendSeriesId = 'price' | 'sine' | 'leadsine';

export interface ChartLineSinewaveTrendSample {
  index: number;
  x: number;
  close: number;
  sine: number | null;
  leadSine: number | null;
  zone: ChartLineSinewaveTrendZone;
}

export interface ChartLineSinewaveTrendRun {
  series: ChartLineSinewaveTrendPoint[];
  sine: Array<number | null>;
  leadSine: Array<number | null>;
  samples: ChartLineSinewaveTrendSample[];
  sineFinal: number | null;
  leadSineFinal: number | null;
  positiveCount: number;
  flatCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineSinewaveTrendMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  sine: number;
  leadSine: number | null;
  zone: ChartLineSinewaveTrendZone;
}

export interface ChartLineSinewaveTrendDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSinewaveTrendLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  sineTop: number;
  sineBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineSinewaveTrendDot[];
  sinePath: string;
  leadSinePath: string;
  markers: ChartLineSinewaveTrendMarker[];
  priceMin: number;
  priceMax: number;
  zeroLineY: number;
  run: ChartLineSinewaveTrendRun;
}

export interface ChartLineSinewaveTrendProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSinewaveTrendPoint[];
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  sineColor?: string;
  leadSineColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  flatColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSine?: boolean;
  showLeadSine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZeroLine?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSinewaveTrendSeriesId[];
  defaultHiddenSeries?: ChartLineSinewaveTrendSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSinewaveTrendSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineSinewaveTrendSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatSine?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_SINEWAVE_TREND_WIDTH = 720;
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_HEIGHT = 460;
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_PADDING = 44;
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_SINE_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_LEAD_SINE_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SINEWAVE_TREND_ZERO_LINE_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const HILBERT_A1 = 0.0962;
const HILBERT_A2 = 0.5769;
const FIR_WARMUP = 10;
const PHASE_EPSILON = 1e-10;
const LEAD_SINE_OFFSET = Math.PI / 4;

/** Keep only points with finite `x` and `close`. */
export function getLineSinewaveTrendFinitePoints(
  data: readonly ChartLineSinewaveTrendPoint[] | null | undefined,
): ChartLineSinewaveTrendPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSinewaveTrendPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/**
 * Apply the 6-tap Hilbert FIR
 * `a1*x[i] + a2*x[i-2] - a2*x[i-4] - a1*x[i-6]`
 * to a series. Indices before `i = 6` (or with non-finite
 * neighbours) are `null`.
 */
export function applyLineSinewaveTrendHilbert(
  values: readonly (number | null)[],
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < 6) {
      out.push(null);
      continue;
    }
    const v0 = values[i];
    const v2 = values[i - 2];
    const v4 = values[i - 4];
    const v6 = values[i - 6];
    if (
      !isFiniteNumber(v0) ||
      !isFiniteNumber(v2) ||
      !isFiniteNumber(v4) ||
      !isFiniteNumber(v6)
    ) {
      out.push(null);
      continue;
    }
    out.push(
      HILBERT_A1 * v0 + HILBERT_A2 * v2 - HILBERT_A2 * v4 - HILBERT_A1 * v6,
    );
  }
  return out;
}

/**
 * Compute the Sinewave Trend per bar. Returns both `sine` and
 * `leadSine` series.
 *
 *   sine[i]     = sin(atan2(Q[i], I[i]))
 *   leadSine[i] = sin(atan2(Q[i], I[i]) + pi / 4)
 *
 * Bars before `i = FIR_WARMUP` are `null`. When both `|I|` and
 * `|Q|` are below `PHASE_EPSILON` the phase is undefined and
 * the bar is `null`.
 */
export function computeLineSinewaveTrend(
  closes: readonly number[] | null | undefined,
): { sine: Array<number | null>; leadSine: Array<number | null> } {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { sine: [], leadSine: [] };
  }
  const detrender = applyLineSinewaveTrendHilbert(closes);
  const I: Array<number | null> = closes.map((_, i) => {
    if (i < 3) return null;
    const v = detrender[i - 3];
    return v == null || !isFiniteNumber(v) ? null : v;
  });
  const Q = applyLineSinewaveTrendHilbert(detrender);
  const sine: Array<number | null> = [];
  const leadSine: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < FIR_WARMUP) {
      sine.push(null);
      leadSine.push(null);
      continue;
    }
    const Ii = I[i];
    const Qi = Q[i];
    if (
      Ii == null ||
      Qi == null ||
      !isFiniteNumber(Ii) ||
      !isFiniteNumber(Qi)
    ) {
      sine.push(null);
      leadSine.push(null);
      continue;
    }
    if (Math.abs(Ii) < PHASE_EPSILON && Math.abs(Qi) < PHASE_EPSILON) {
      sine.push(null);
      leadSine.push(null);
      continue;
    }
    const phase = Math.atan2(Qi, Ii);
    sine.push(Math.sin(phase));
    leadSine.push(Math.sin(phase + LEAD_SINE_OFFSET));
  }
  return { sine, leadSine };
}

/** Classify a sinewave trend reading. */
export function classifyLineSinewaveTrendZone(
  value: number | null,
): ChartLineSinewaveTrendZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'flat';
}

/** Run the full sinewave-trend pipeline plus sample classification. */
export function runLineSinewaveTrend(
  data: readonly ChartLineSinewaveTrendPoint[] | null | undefined,
): ChartLineSinewaveTrendRun {
  const series = getLineSinewaveTrendFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const closes = series.map((p) => p.close);
  const { sine, leadSine } = computeLineSinewaveTrend(closes);
  const samples: ChartLineSinewaveTrendSample[] = series.map(
    (point, index) => {
      const s = sine[index] ?? null;
      const ls = leadSine[index] ?? null;
      return {
        index,
        x: point.x,
        close: point.close,
        sine: s,
        leadSine: ls,
        zone: classifyLineSinewaveTrendZone(s),
      };
    },
  );
  let positiveCount = 0;
  let flatCount = 0;
  let negativeCount = 0;
  let sineFinal: number | null = null;
  let leadSineFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.sine)) sineFinal = sample.sine;
    if (isFiniteNumber(sample.leadSine)) leadSineFinal = sample.leadSine;
  }
  return {
    series,
    sine,
    leadSine,
    samples,
    sineFinal,
    leadSineFinal,
    positiveCount,
    flatCount,
    negativeCount,
    ok: series.length >= FIR_WARMUP + 1,
  };
}

export interface ChartLineSinewaveTrendLayoutOptions {
  data: readonly ChartLineSinewaveTrendPoint[] | null | undefined;
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
export function computeLineSinewaveTrendLayout(
  options: ChartLineSinewaveTrendLayoutOptions,
): ChartLineSinewaveTrendLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_SINEWAVE_TREND_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_SINEWAVE_TREND_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_SINEWAVE_TREND_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_SINEWAVE_TREND_PANEL_GAP;

  const run = runLineSinewaveTrend(options.data);

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const sineHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const sineTop = priceBottom + panelGap;
  const sineBottom = sineTop + sineHeight;

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

  // Sinewave panel spans the constant range [-1, +1].
  const sineMin = -1;
  const sineMax = 1;
  const sineY = (value: number): number =>
    sineBottom - ((value - sineMin) / (sineMax - sineMin)) * sineHeight;
  const zeroLineY = sineY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineSinewaveTrendDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const sineLinePoints: Array<{ x: number; y: number }> = [];
  const leadSineLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineSinewaveTrendMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (isFiniteNumber(sample.sine)) {
      const cx = xAt(index);
      const yc = sineY(sample.sine);
      sineLinePoints.push({ x: cx, y: yc });
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        sine: sample.sine,
        leadSine: sample.leadSine,
        zone: sample.zone,
      });
    }
    if (isFiniteNumber(sample.leadSine)) {
      const cx = xAt(index);
      leadSineLinePoints.push({ x: cx, y: sineY(sample.leadSine) });
    }
  });

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    sineTop,
    sineBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    sinePath: buildLinePath(sineLinePoints),
    leadSinePath: buildLinePath(leadSineLinePoints),
    markers,
    priceMin,
    priceMax,
    zeroLineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineSinewaveTrendChart(
  data: readonly ChartLineSinewaveTrendPoint[] | null | undefined,
): string {
  const run = runLineSinewaveTrend(data);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const sineText =
    run.sineFinal === null ? 'n/a' : run.sineFinal.toFixed(4);
  const leadText =
    run.leadSineFinal === null ? 'n/a' : run.leadSineFinal.toFixed(4);
  return (
    `Dual-panel chart with an Ehlers Sinewave Trend oscillator ` +
    `panel beneath the close. The bottom panel plots the sine and ` +
    `the lead sine, both derived from the dominant cycle phase: ` +
    `phase = atan2(Q, I) where I and Q are the in-phase and ` +
    `quadrature components of the detrended close, computed from ` +
    `the 6-tap Hilbert FIR. sine = sin(phase) and leadSine = ` +
    `sin(phase + pi / 4); leadSine crossing above sine marks an ` +
    `early turn up, and below marks an early turn down. Across ` +
    `${total} bars the sine is positive on ${run.positiveCount}, ` +
    `flat on ${run.flatCount}, and negative on ` +
    `${run.negativeCount}. The final sine is ${sineText} and the ` +
    `final lead sine is ${leadText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatSine(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineSinewaveTrendZone,
  positiveColor: string,
  negativeColor: string,
  flatColor: string,
  noneColor: string,
): string {
  if (zone === 'positive') return positiveColor;
  if (zone === 'negative') return negativeColor;
  if (zone === 'flat') return flatColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineSinewaveTrendZone): string {
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineSinewaveTrend -- dual-panel pure-SVG Ehlers Sinewave
 * Trend chart.
 */
export const ChartLineSinewaveTrend = forwardRef<
  HTMLDivElement,
  ChartLineSinewaveTrendProps
>(function ChartLineSinewaveTrend(props, ref) {
  const {
    data,
    width = DEFAULT_CHART_LINE_SINEWAVE_TREND_WIDTH,
    height = DEFAULT_CHART_LINE_SINEWAVE_TREND_HEIGHT,
    padding = DEFAULT_CHART_LINE_SINEWAVE_TREND_PADDING,
    panelGap = DEFAULT_CHART_LINE_SINEWAVE_TREND_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_SINEWAVE_TREND_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SINEWAVE_TREND_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SINEWAVE_TREND_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SINEWAVE_TREND_PRICE_COLOR,
    sineColor = DEFAULT_CHART_LINE_SINEWAVE_TREND_SINE_COLOR,
    leadSineColor = DEFAULT_CHART_LINE_SINEWAVE_TREND_LEAD_SINE_COLOR,
    positiveColor = DEFAULT_CHART_LINE_SINEWAVE_TREND_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_SINEWAVE_TREND_NEGATIVE_COLOR,
    flatColor = DEFAULT_CHART_LINE_SINEWAVE_TREND_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_SINEWAVE_TREND_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_SINEWAVE_TREND_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_SINEWAVE_TREND_GRID_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_SINEWAVE_TREND_ZERO_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSine = true,
    showLeadSine = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showZeroLine = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatSine = defaultFormatSine,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-sinewave-trend-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineSinewaveTrendSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineSinewaveTrendSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineSinewaveTrendLayout({
        data,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineSinewaveTrendChart(data);
  const resolvedLabel =
    ariaLabel ?? `Ehlers Sinewave Trend chart`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineSinewaveTrendSeriesId): void => {
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
        data-section="chart-line-sinewave-trend-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={102}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-sinewave-trend-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-sinewave-trend-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-sinewave-trend-tooltip-sine"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Sine: ${
            hoverSample.sine === null
              ? 'n/a'
              : formatSine(hoverSample.sine)
          }`}
        </text>
        <text
          data-section="chart-line-sinewave-trend-tooltip-leadsine"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`LeadSine: ${
            hoverSample.leadSine === null
              ? 'n/a'
              : formatSine(hoverSample.leadSine)
          }`}
        </text>
        <text
          data-section="chart-line-sinewave-trend-tooltip-zone"
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
  const sineHidden = isHidden('sine') || !showSine;
  const leadSineHidden = isHidden('leadsine') || !showLeadSine;

  const legendItems: Array<{
    id: ChartLineSinewaveTrendSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'sine', label: 'Sine', color: sineColor },
    { id: 'leadsine', label: 'LeadSine', color: leadSineColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-sinewave-trend"
      data-empty={isEmpty ? 'true' : 'false'}
      data-sine-final={run.sineFinal === null ? '' : run.sineFinal}
      data-leadsine-final={
        run.leadSineFinal === null ? '' : run.leadSineFinal
      }
      data-positive-count={run.positiveCount}
      data-flat-count={run.flatCount}
      data-negative-count={run.negativeCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-sinewave-trend-aria-desc"
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
          data-section="chart-line-sinewave-trend-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-sinewave-trend-empty"
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
          data-section="chart-line-sinewave-trend-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-sinewave-trend-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const ys =
                  layout.sineBottom -
                  t * (layout.sineBottom - layout.sineTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-sinewave-trend-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-sinewave-trend-grid-line"
                      data-panel="sine"
                      x1={layout.innerLeft}
                      y1={ys}
                      x2={layout.innerRight}
                      y2={ys}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-sinewave-trend-axes">
              <line
                data-section="chart-line-sinewave-trend-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-sinewave-trend-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-sinewave-trend-axis"
                data-panel="sine"
                x1={layout.innerLeft}
                y1={layout.sineTop}
                x2={layout.innerLeft}
                y2={layout.sineBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-sinewave-trend-axis"
                data-panel="sine"
                x1={layout.innerLeft}
                y1={layout.sineBottom}
                x2={layout.innerRight}
                y2={layout.sineBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-sinewave-trend-tick-label"
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
                data-section="chart-line-sinewave-trend-tick-label"
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
                data-section="chart-line-sinewave-trend-tick-label"
                data-panel="sine"
                x={layout.innerLeft - 6}
                y={layout.sineTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatSine(1)}
              </text>
              <text
                data-section="chart-line-sinewave-trend-tick-label"
                data-panel="sine"
                x={layout.innerLeft - 6}
                y={layout.sineBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatSine(-1)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-sinewave-trend-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroLineY}
              x2={layout.innerRight}
              y2={layout.zeroLineY}
              stroke={zeroLineColor}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-sinewave-trend-price-path"
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
            <g data-section="chart-line-sinewave-trend-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-sinewave-trend-dot"
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

          {!leadSineHidden ? (
            <path
              data-section="chart-line-sinewave-trend-leadsine"
              d={layout.leadSinePath}
              fill="none"
              stroke={leadSineColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="LeadSine line"
            />
          ) : null}

          {!sineHidden ? (
            <path
              data-section="chart-line-sinewave-trend-line"
              d={layout.sinePath}
              fill="none"
              stroke={sineColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Sine line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-sinewave-trend-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-sinewave-trend-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-sine={marker.sine}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    positiveColor,
                    negativeColor,
                    flatColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, Sine ${formatSine(marker.sine)}, ${zoneLabelOf(
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
            <g data-section="chart-line-sinewave-trend-badge">
              <rect
                data-section="chart-line-sinewave-trend-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={150}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-sinewave-trend-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Sinewave Trend`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-sinewave-trend-legend"
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
                data-section="chart-line-sinewave-trend-legend-item"
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
                  data-section="chart-line-sinewave-trend-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-sinewave-trend-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-sinewave-trend-legend-stats"
            style={{ color: axisColor }}
          >
            {`positive ${run.positiveCount} / flat ${run.flatCount} / negative ${run.negativeCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineSinewaveTrend.displayName = 'ChartLineSinewaveTrend';
