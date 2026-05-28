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
 * ChartLineMesaSine -- pure-SVG two-panel Ehlers MESA Sine Wave chart.
 *
 * John Ehlers' MESA Sine Wave plots the dominant cycle phase as a pair of
 * sine lines. The price is detrended against its moving average to leave
 * the cyclic swing; a quadrature companion -- the cycle delayed a quarter
 * period, a 90-degree phase shift -- pairs with it so the phase is
 * `atan2(quadrature, in-phase)`. The panel then plots:
 *
 *   sine     = sin(phase)
 *   leadSine = sin(phase + 45 degrees)
 *
 * The lead sine runs 45 degrees ahead of the sine; the two lines cross at
 * the cycle turning points, which is the signal the indicator names.
 * When the detrended cycle has no measurable amplitude (a flat market)
 * the phase is undefined and both lines drop out.
 *
 * The top panel plots the price; the bottom panel plots the sine and the
 * lead sine inside a fixed [-1, 1] band with a zero line.
 */

export interface ChartLineMesaSinePoint {
  x: number;
  value: number;
}

export type ChartLineMesaSineZone = 'up' | 'down' | 'flat' | 'none';

export type ChartLineMesaSineSeriesId = 'price' | 'sine' | 'leadSine';

export interface ChartLineMesaSinePair {
  sine: number | null;
  leadSine: number | null;
}

export interface ChartLineMesaSineComputed {
  sma: (number | null)[];
  cycle: (number | null)[];
  phase: (number | null)[];
  sine: (number | null)[];
  leadSine: (number | null)[];
}

export interface ChartLineMesaSineSample {
  index: number;
  x: number;
  value: number;
  phase: number | null;
  sine: number | null;
  leadSine: number | null;
  zone: ChartLineMesaSineZone;
}

export interface ChartLineMesaSineRun {
  series: ChartLineMesaSinePoint[];
  period: number;
  sma: (number | null)[];
  cycle: (number | null)[];
  phase: (number | null)[];
  sine: (number | null)[];
  leadSine: (number | null)[];
  samples: ChartLineMesaSineSample[];
  sineFinal: number | null;
  leadSineFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineMesaSineMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  sine: number;
  zone: ChartLineMesaSineZone;
}

export interface ChartLineMesaSineDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineMesaSineLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  sinePanelTop: number;
  sinePanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineMesaSineDot[];
  sinePath: string;
  leadSinePath: string;
  markers: ChartLineMesaSineMarker[];
  zeroY: number;
  priceMin: number;
  priceMax: number;
  sineMin: number;
  sineMax: number;
  run: ChartLineMesaSineRun;
}

export interface ChartLineMesaSineProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMesaSinePoint[];
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
  sineColor?: string;
  leadSineColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSine?: boolean;
  showLeadSine?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMesaSineSeriesId[];
  defaultHiddenSeries?: ChartLineMesaSineSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMesaSineSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineMesaSineSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_MESA_SINE_WIDTH = 720;
export const DEFAULT_CHART_LINE_MESA_SINE_HEIGHT = 400;
export const DEFAULT_CHART_LINE_MESA_SINE_PADDING = 44;
export const DEFAULT_CHART_LINE_MESA_SINE_GAP = 12;
export const DEFAULT_CHART_LINE_MESA_SINE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MESA_SINE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MESA_SINE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MESA_SINE_PERIOD = 20;
export const DEFAULT_CHART_LINE_MESA_SINE_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_MESA_SINE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MESA_SINE_SINE_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_MESA_SINE_LEAD_SINE_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_MESA_SINE_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MESA_SINE_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MESA_SINE_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_MESA_SINE_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MESA_SINE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MESA_SINE_AXIS_COLOR = '#94a3b8';

/** The lead sine runs this far -- 45 degrees -- ahead of the sine. */
export const MESA_SINE_LEAD = Math.PI / 4;

/** Cycle amplitudes below this floor are treated as no cycle at all. */
export const MESA_SINE_EPSILON = 1e-9;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineMesaSineFinitePoints(
  data: readonly ChartLineMesaSinePoint[] | null | undefined,
): ChartLineMesaSinePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMesaSinePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce the cycle period to an integer of at least 4, else fallback. */
export function normalizeLineMesaSinePeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 4) return Math.floor(period);
  return fallback;
}

/** The simple moving average used to detrend the price, null in the warm-up. */
export function computeLineMesaSineSma(
  values: readonly number[] | null | undefined,
  period: unknown,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineMesaSinePeriod(
    period,
    DEFAULT_CHART_LINE_MESA_SINE_PERIOD,
  );
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < p - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < p; j += 1) {
      const v = values[i - j];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / p : null);
  }
  return out;
}

/**
 * The MESA Sine Wave pair for a phase angle: `sin(phase)` and the lead
 * sine `sin(phase + 45 degrees)`. A non-finite phase yields a null pair.
 */
export function computeLineMesaSinePair(phase: unknown): ChartLineMesaSinePair {
  if (!isFiniteNumber(phase)) return { sine: null, leadSine: null };
  return {
    sine: Math.sin(phase),
    leadSine: Math.sin(phase + MESA_SINE_LEAD),
  };
}

/**
 * Compute the MESA Sine Wave: detrend the price against its moving
 * average, pair the cycle with a quarter-period-delayed quadrature, take
 * the phase as `atan2(quadrature, in-phase)`, and plot the sine and the
 * lead sine of that phase. Bars with no measurable cycle amplitude leave
 * the phase, sine and lead sine null.
 */
export function computeLineMesaSine(
  values: readonly number[] | null | undefined,
  period: unknown,
): ChartLineMesaSineComputed {
  if (!Array.isArray(values)) {
    return { sma: [], cycle: [], phase: [], sine: [], leadSine: [] };
  }
  const p = normalizeLineMesaSinePeriod(
    period,
    DEFAULT_CHART_LINE_MESA_SINE_PERIOD,
  );
  const quarter = Math.max(1, Math.round(p / 4));
  const n = values.length;
  const sma = computeLineMesaSineSma(values, p);
  const cycle: (number | null)[] = [];
  for (let i = 0; i < n; i += 1) {
    const s = sma[i];
    const v = values[i];
    cycle.push(isFiniteNumber(s) && isFiniteNumber(v) ? v - s : null);
  }
  const phase: (number | null)[] = [];
  const sine: (number | null)[] = [];
  const leadSine: (number | null)[] = [];
  for (let i = 0; i < n; i += 1) {
    const ip = cycle[i] ?? null;
    const q = i - quarter >= 0 ? cycle[i - quarter] ?? null : null;
    if (!isFiniteNumber(ip) || !isFiniteNumber(q)) {
      phase.push(null);
      sine.push(null);
      leadSine.push(null);
      continue;
    }
    const amplitude = Math.hypot(ip, q);
    if (amplitude < MESA_SINE_EPSILON) {
      phase.push(null);
      sine.push(null);
      leadSine.push(null);
      continue;
    }
    const ph = Math.atan2(q, ip);
    const pair = computeLineMesaSinePair(ph);
    phase.push(ph);
    sine.push(pair.sine);
    leadSine.push(pair.leadSine);
  }
  return { sma, cycle, phase, sine, leadSine };
}

/** Classify a bar by the lead sine relative to the sine. */
export function classifyLineMesaSineZone(
  sine: number | null,
  leadSine: number | null,
): ChartLineMesaSineZone {
  if (!isFiniteNumber(sine) || !isFiniteNumber(leadSine)) return 'none';
  if (leadSine > sine) return 'up';
  if (leadSine < sine) return 'down';
  return 'flat';
}

export interface ChartLineMesaSineOptions {
  period?: number;
}

/** Run the full Ehlers MESA Sine Wave pipeline over a set of points. */
export function runLineMesaSine(
  data: readonly ChartLineMesaSinePoint[] | null | undefined,
  options: ChartLineMesaSineOptions = {},
): ChartLineMesaSineRun {
  const series = getLineMesaSineFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineMesaSinePeriod(
    options.period,
    DEFAULT_CHART_LINE_MESA_SINE_PERIOD,
  );
  const values = series.map((point) => point.value);
  const { sma, cycle, phase, sine, leadSine } = computeLineMesaSine(
    values,
    period,
  );

  const samples: ChartLineMesaSineSample[] = series.map((point, index) => {
    const sineValue = sine[index] ?? null;
    const leadSineValue = leadSine[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      phase: phase[index] ?? null,
      sine: sineValue,
      leadSine: leadSineValue,
      zone: classifyLineMesaSineZone(sineValue, leadSineValue),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let sineFinal: number | null = null;
  let leadSineFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.sine)) sineFinal = sample.sine;
    if (isFiniteNumber(sample.leadSine)) leadSineFinal = sample.leadSine;
  }

  return {
    series = [],
    period,
    sma,
    cycle,
    phase,
    sine,
    leadSine,
    samples,
    sineFinal,
    leadSineFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineMesaSineLayoutOptions
  extends ChartLineMesaSineOptions {
  data: readonly ChartLineMesaSinePoint[] | null | undefined;
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
export function computeLineMesaSineLayout(
  options: ChartLineMesaSineLayoutOptions,
): ChartLineMesaSineLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_MESA_SINE_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_MESA_SINE_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_MESA_SINE_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_MESA_SINE_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_MESA_SINE_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineMesaSine(options.data, {
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
  const sinePanelTop = pricePanelBottom + gap;
  const sinePanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    sinePanelBottom - sinePanelTop > 0;
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

  const sineMin = -1.1;
  const sineMax = 1.1;
  const sinePanelHeight = sinePanelBottom - sinePanelTop;
  const sineYAt = (value: number): number =>
    sinePanelBottom -
    ((value - sineMin) / (sineMax - sineMin)) * sinePanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineMesaSineDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = priceYAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const sineLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineMesaSineMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.sine)) return;
    const cx = xAt(index);
    const cy = sineYAt(sample.sine);
    sineLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      sine: sample.sine,
      zone: sample.zone,
    });
  });

  const leadSineLinePoints: Array<{ x: number; y: number }> = [];
  run.leadSine.forEach((value, index) => {
    if (isFiniteNumber(value)) {
      leadSineLinePoints.push({ x: xAt(index), y: sineYAt(value) });
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
    sinePanelTop,
    sinePanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    sinePath: buildLinePath(sineLinePoints),
    leadSinePath: buildLinePath(leadSineLinePoints),
    markers,
    zeroY: sineYAt(0),
    priceMin,
    priceMax,
    sineMin,
    sineMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineMesaSineChart(
  data: readonly ChartLineMesaSinePoint[] | null | undefined,
  options: ChartLineMesaSineOptions = {},
): string {
  const run = runLineMesaSine(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.sineFinal === null ? 'n/a' : run.sineFinal.toFixed(3);
  return (
    `Two-panel chart with the Ehlers MESA Sine Wave (period ` +
    `${run.period}): the top panel plots the price, the bottom panel ` +
    `plots the cycle phase sine and the lead sine. The MESA Sine Wave ` +
    `detrends the price, derives the dominant cycle phase from a ` +
    `quadrature pair, and plots the sine of that phase together with the ` +
    `lead sine -- the phase advanced 45 degrees -- whose crossover marks ` +
    `the cycle turning points. Across ${total} bars the lead sine leads ` +
    `the sine on ${run.upCount}, lags on ${run.downCount} and matches on ` +
    `${run.flatCount}. The final sine reading is ${finalText}.`
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
  zone: ChartLineMesaSineZone,
  upColor: string,
  downColor: string,
  flatColor: string,
): string {
  if (zone === 'up') return upColor;
  if (zone === 'down') return downColor;
  return flatColor;
}

function zoneLabelOf(zone: ChartLineMesaSineZone): string {
  if (zone === 'up') return 'Lead above';
  if (zone === 'down') return 'Lead below';
  if (zone === 'flat') return 'Lines level';
  return 'n/a';
}

/**
 * ChartLineMesaSine -- two-panel pure-SVG Ehlers MESA Sine Wave chart.
 */
export const ChartLineMesaSine = forwardRef<
  HTMLDivElement,
  ChartLineMesaSineProps
>(function ChartLineMesaSine(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_MESA_SINE_PERIOD,
    width = DEFAULT_CHART_LINE_MESA_SINE_WIDTH,
    height = DEFAULT_CHART_LINE_MESA_SINE_HEIGHT,
    padding = DEFAULT_CHART_LINE_MESA_SINE_PADDING,
    gap = DEFAULT_CHART_LINE_MESA_SINE_GAP,
    tickCount = DEFAULT_CHART_LINE_MESA_SINE_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_MESA_SINE_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_MESA_SINE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MESA_SINE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MESA_SINE_PRICE_COLOR,
    sineColor = DEFAULT_CHART_LINE_MESA_SINE_SINE_COLOR,
    leadSineColor = DEFAULT_CHART_LINE_MESA_SINE_LEAD_SINE_COLOR,
    upColor = DEFAULT_CHART_LINE_MESA_SINE_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_MESA_SINE_DOWN_COLOR,
    flatColor = DEFAULT_CHART_LINE_MESA_SINE_FLAT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_MESA_SINE_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_MESA_SINE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_MESA_SINE_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSine = true,
    showLeadSine = true,
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
  const baseId = `chart-line-mesa-sine-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineMesaSineSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineMesaSineSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineMesaSineLayout({
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
    ariaDescription ?? describeLineMesaSineChart(data, { period });
  const resolvedLabel =
    ariaLabel ?? `Ehlers MESA Sine Wave chart, period ${run.period}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineMesaSineSeriesId): void => {
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
    const tooltipW = 180;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.pricePanelTop + 6;
    tooltip = (
      <g data-section="chart-line-mesa-sine-tooltip" pointerEvents="none">
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
          data-section="chart-line-mesa-sine-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-mesa-sine-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Price: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-mesa-sine-tooltip-sine"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Sine: ${
            hoverSample.sine === null ? 'n/a' : formatValue(hoverSample.sine)
          }`}
        </text>
        <text
          data-section="chart-line-mesa-sine-tooltip-lead-sine"
          x={tx + 10}
          y={ty + 67}
          fill="#fcd34d"
          fontSize={11}
        >
          {`Lead Sine: ${
            hoverSample.leadSine === null
              ? 'n/a'
              : formatValue(hoverSample.leadSine)
          }`}
        </text>
        <text
          data-section="chart-line-mesa-sine-tooltip-zone"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Phase: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const sineHidden = isHidden('sine') || !showSine;
  const leadSineHidden = isHidden('leadSine') || !showLeadSine;

  const legendItems: Array<{
    id: ChartLineMesaSineSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'sine', label: 'Sine', color: sineColor },
    { id: 'leadSine', label: 'Lead Sine', color: leadSineColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-mesa-sine"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-sine-final={run.sineFinal === null ? '' : run.sineFinal}
      data-lead-sine-final={
        run.leadSineFinal === null ? '' : run.leadSineFinal
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
        data-section="chart-line-mesa-sine-aria-desc"
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
          data-section="chart-line-mesa-sine-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-mesa-sine-empty"
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
          data-section="chart-line-mesa-sine-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-mesa-sine-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-mesa-sine-grid-line"
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
                const sy =
                  layout.sinePanelBottom -
                  t * (layout.sinePanelBottom - layout.sinePanelTop);
                return (
                  <line
                    key={`sg-${i}`}
                    data-section="chart-line-mesa-sine-grid-line"
                    data-panel="sine"
                    x1={layout.innerLeft}
                    y1={sy}
                    x2={layout.innerRight}
                    y2={sy}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-mesa-sine-axes">
              <line
                data-section="chart-line-mesa-sine-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-mesa-sine-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-mesa-sine-axis"
                data-panel="sine"
                x1={layout.innerLeft}
                y1={layout.sinePanelTop}
                x2={layout.innerLeft}
                y2={layout.sinePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-mesa-sine-axis"
                data-panel="sine"
                x1={layout.innerLeft}
                y1={layout.sinePanelBottom}
                x2={layout.innerRight}
                y2={layout.sinePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-mesa-sine-tick-label"
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
                data-section="chart-line-mesa-sine-tick-label"
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
                data-section="chart-line-mesa-sine-tick-label"
                data-panel="sine"
                x={layout.innerLeft - 6}
                y={layout.sinePanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                1
              </text>
              <text
                data-section="chart-line-mesa-sine-tick-label"
                data-panel="sine"
                x={layout.innerLeft - 6}
                y={layout.sinePanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                -1
              </text>
            </g>
          ) : null}

          <text
            data-section="chart-line-mesa-sine-panel-label"
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
            data-section="chart-line-mesa-sine-panel-label"
            data-panel="sine"
            x={layout.innerRight}
            y={layout.sinePanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Ehlers MESA Sine Wave
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-mesa-sine-zero-line"
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
              data-section="chart-line-mesa-sine-price-path"
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
            <g data-section="chart-line-mesa-sine-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-mesa-sine-dot"
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

          {!leadSineHidden ? (
            <path
              data-section="chart-line-mesa-sine-lead-sine-line"
              d={layout.leadSinePath}
              fill="none"
              stroke={leadSineColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="5 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Lead sine line"
            />
          ) : null}

          {!sineHidden ? (
            <path
              data-section="chart-line-mesa-sine-sine-line"
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

          {!sineHidden && showMarkers ? (
            <g data-section="chart-line-mesa-sine-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-mesa-sine-marker"
                  data-zone={marker.zone}
                  data-sine={marker.sine}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(marker.zone, upColor, downColor, flatColor)}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, sine ${formatValue(
                    marker.sine,
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
            <g data-section="chart-line-mesa-sine-badge">
              <rect
                data-section="chart-line-mesa-sine-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={68}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-mesa-sine-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`MESA ${run.period}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-mesa-sine-legend"
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
                data-section="chart-line-mesa-sine-legend-item"
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
                  data-section="chart-line-mesa-sine-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-mesa-sine-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-mesa-sine-legend-stats"
            style={{ color: axisColor }}
          >
            {`up ${run.upCount} / down ${run.downCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineMesaSine.displayName = 'ChartLineMesaSine';
