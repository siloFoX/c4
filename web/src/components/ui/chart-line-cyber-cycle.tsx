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
 * ChartLineCyberCycle -- pure-SVG two-panel Ehlers Cyber Cycle chart.
 *
 * John Ehlers' Cyber Cycle extracts the cyclic swing of the market. The
 * price is first run through a four-tap smoother; the SECOND DIFFERENCE of
 * that smoothed price (`smooth[i] - 2*smooth[i-1] + smooth[i-2]`) is fed
 * into a two-pole resonant filter, whose feedback turns the second-
 * difference impulse into an oscillation around zero. A trigger line --
 * the cycle delayed one bar -- accompanies it; their crossover is the
 * signal. While the smoother warms up the cycle uses the raw price second
 * difference, quartered.
 *
 * The top panel plots the price; the bottom panel plots the Cyber Cycle
 * and its trigger with a zero line.
 */

export interface ChartLineCyberCyclePoint {
  x: number;
  value: number;
}

export type ChartLineCyberCycleZone = 'up' | 'down' | 'flat' | 'none';

export type ChartLineCyberCycleSeriesId = 'price' | 'cycle' | 'trigger';

export interface ChartLineCyberCycleSample {
  index: number;
  x: number;
  value: number;
  cycle: number | null;
  trigger: number | null;
  zone: ChartLineCyberCycleZone;
}

export interface ChartLineCyberCycleRun {
  series: ChartLineCyberCyclePoint[];
  alpha: number;
  smooth: (number | null)[];
  cycle: (number | null)[];
  trigger: (number | null)[];
  samples: ChartLineCyberCycleSample[];
  cycleFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineCyberCycleMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  cycle: number;
  zone: ChartLineCyberCycleZone;
}

export interface ChartLineCyberCycleDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineCyberCycleLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  cyclePanelTop: number;
  cyclePanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineCyberCycleDot[];
  cyclePath: string;
  triggerPath: string;
  markers: ChartLineCyberCycleMarker[];
  zeroY: number;
  priceMin: number;
  priceMax: number;
  cycleMin: number;
  cycleMax: number;
  run: ChartLineCyberCycleRun;
}

export interface ChartLineCyberCycleProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCyberCyclePoint[];
  alpha?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  cycleColor?: string;
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
  showCycle?: boolean;
  showTrigger?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCyberCycleSeriesId[];
  defaultHiddenSeries?: ChartLineCyberCycleSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCyberCycleSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineCyberCycleSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_CYBER_CYCLE_WIDTH = 720;
export const DEFAULT_CHART_LINE_CYBER_CYCLE_HEIGHT = 400;
export const DEFAULT_CHART_LINE_CYBER_CYCLE_PADDING = 44;
export const DEFAULT_CHART_LINE_CYBER_CYCLE_GAP = 12;
export const DEFAULT_CHART_LINE_CYBER_CYCLE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CYBER_CYCLE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CYBER_CYCLE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CYBER_CYCLE_ALPHA = 0.07;
export const DEFAULT_CHART_LINE_CYBER_CYCLE_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_CYBER_CYCLE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CYBER_CYCLE_CYCLE_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CYBER_CYCLE_TRIGGER_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_CYBER_CYCLE_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CYBER_CYCLE_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CYBER_CYCLE_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_CYBER_CYCLE_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CYBER_CYCLE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CYBER_CYCLE_AXIS_COLOR = '#94a3b8';

/** The bar count below which the cycle uses the raw price second difference. */
export const CHART_LINE_CYBER_CYCLE_WARMUP = 7;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineCyberCycleFinitePoints(
  data: readonly ChartLineCyberCyclePoint[] | null | undefined,
): ChartLineCyberCyclePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCyberCyclePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce the smoothing constant alpha to a number in (0, 1), else fallback. */
export function normalizeLineCyberCycleAlpha(
  alpha: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(alpha) && alpha > 0 && alpha < 1) return alpha;
  return fallback;
}

/**
 * The four-tap Ehlers smoother:
 * `(value + 2*value[-1] + 2*value[-2] + value[-3]) / 6`. Defined from the
 * fourth bar.
 */
export function computeLineCyberCycleSmooth(
  values: readonly number[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < 3) {
      out.push(null);
      continue;
    }
    const v0 = values[i];
    const v1 = values[i - 1];
    const v2 = values[i - 2];
    const v3 = values[i - 3];
    if (
      isFiniteNumber(v0) &&
      isFiniteNumber(v1) &&
      isFiniteNumber(v2) &&
      isFiniteNumber(v3)
    ) {
      out.push((v0 + 2 * v1 + 2 * v2 + v3) / 6);
    } else {
      out.push(null);
    }
  }
  return out;
}

export interface ChartLineCyberCycleComputed {
  smooth: (number | null)[];
  cycle: (number | null)[];
  trigger: (number | null)[];
}

/**
 * Compute the Ehlers Cyber Cycle: the smoother, the resonant cycle line
 * and the trigger (the cycle delayed one bar). While the smoother warms
 * up the cycle uses the raw price second difference, quartered.
 */
export function computeLineCyberCycle(
  values: readonly number[] | null | undefined,
  alpha: number,
): ChartLineCyberCycleComputed {
  if (!Array.isArray(values)) return { smooth: [], cycle: [], trigger: [] };
  const a = normalizeLineCyberCycleAlpha(alpha, DEFAULT_CHART_LINE_CYBER_CYCLE_ALPHA);
  const n = values.length;
  const smooth = computeLineCyberCycleSmooth(values);
  const k = 1 - 0.5 * a;
  const c0 = k * k;
  const c1 = 2 * (1 - a);
  const c2 = (1 - a) * (1 - a);
  const cycle: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    if (i < 2) {
      cycle[i] = 0;
      continue;
    }
    const v0 = values[i];
    const v1 = values[i - 1];
    const v2 = values[i - 2];
    const rawSecondDiff =
      isFiniteNumber(v0) && isFiniteNumber(v1) && isFiniteNumber(v2)
        ? (v0 - 2 * v1 + v2) / 4
        : 0;
    if (i < CHART_LINE_CYBER_CYCLE_WARMUP) {
      cycle[i] = rawSecondDiff;
      continue;
    }
    const s0 = smooth[i];
    const s1 = smooth[i - 1];
    const s2 = smooth[i - 2];
    if (isFiniteNumber(s0) && isFiniteNumber(s1) && isFiniteNumber(s2)) {
      const sd = s0 - 2 * s1 + s2;
      cycle[i] =
        c0 * sd + c1 * (cycle[i - 1] as number) - c2 * (cycle[i - 2] as number);
    } else {
      cycle[i] = rawSecondDiff;
    }
  }
  const trigger: (number | null)[] = cycle.map((_, i) =>
    i > 0 ? (cycle[i - 1] as number) : null,
  );
  return { smooth, cycle: cycle.slice(), trigger };
}

/** Classify a bar by the sign of the Cyber Cycle. */
export function classifyLineCyberCycleZone(
  cycle: number | null,
): ChartLineCyberCycleZone {
  if (!isFiniteNumber(cycle)) return 'none';
  if (cycle > 0) return 'up';
  if (cycle < 0) return 'down';
  return 'flat';
}

export interface ChartLineCyberCycleOptions {
  alpha?: number;
}

/** Run the full Ehlers Cyber Cycle pipeline over a set of points. */
export function runLineCyberCycle(
  data: readonly ChartLineCyberCyclePoint[] | null | undefined,
  options: ChartLineCyberCycleOptions = {},
): ChartLineCyberCycleRun {
  const series = getLineCyberCycleFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const alpha = normalizeLineCyberCycleAlpha(
    options.alpha,
    DEFAULT_CHART_LINE_CYBER_CYCLE_ALPHA,
  );
  const values = series.map((point) => point.value);
  const { smooth, cycle, trigger } = computeLineCyberCycle(values, alpha);

  const samples: ChartLineCyberCycleSample[] = series.map((point, index) => {
    const cycleValue = cycle[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      cycle: cycleValue,
      trigger: trigger[index] ?? null,
      zone: classifyLineCyberCycleZone(cycleValue),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let cycleFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.cycle)) cycleFinal = sample.cycle;
  }

  return {
    series,
    alpha,
    smooth,
    cycle,
    trigger,
    samples,
    cycleFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineCyberCycleLayoutOptions
  extends ChartLineCyberCycleOptions {
  data: readonly ChartLineCyberCyclePoint[] | null | undefined;
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
export function computeLineCyberCycleLayout(
  options: ChartLineCyberCycleLayoutOptions,
): ChartLineCyberCycleLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_CYBER_CYCLE_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_CYBER_CYCLE_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_CYBER_CYCLE_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_CYBER_CYCLE_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_CYBER_CYCLE_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineCyberCycle(options.data, {
    ...(options.alpha !== undefined ? { alpha: options.alpha } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const cyclePanelTop = pricePanelBottom + gap;
  const cyclePanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 && pricePanelHeight > 0 && cyclePanelBottom - cyclePanelTop > 0;
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

  let cycleMin = 0;
  let cycleMax = 0;
  for (const value of run.cycle) {
    if (!isFiniteNumber(value)) continue;
    if (value < cycleMin) cycleMin = value;
    if (value > cycleMax) cycleMax = value;
  }
  for (const value of run.trigger) {
    if (!isFiniteNumber(value)) continue;
    if (value < cycleMin) cycleMin = value;
    if (value > cycleMax) cycleMax = value;
  }
  if (cycleMin === cycleMax) {
    cycleMin -= 1;
    cycleMax += 1;
  }
  const cyclePanelHeight = cyclePanelBottom - cyclePanelTop;
  const cycleYAt = (value: number): number =>
    cyclePanelBottom -
    ((value - cycleMin) / (cycleMax - cycleMin)) * cyclePanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineCyberCycleDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = priceYAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const cycleLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineCyberCycleMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.cycle)) return;
    const cx = xAt(index);
    const cy = cycleYAt(sample.cycle);
    cycleLinePoints.push({ x: cx, y: cy });
    markers.push({ index, x: sample.x, cx, cy, cycle: sample.cycle, zone: sample.zone });
  });

  const triggerLinePoints: Array<{ x: number; y: number }> = [];
  run.trigger.forEach((value, index) => {
    if (isFiniteNumber(value)) {
      triggerLinePoints.push({ x: xAt(index), y: cycleYAt(value) });
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
    cyclePanelTop,
    cyclePanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    cyclePath: buildLinePath(cycleLinePoints),
    triggerPath: buildLinePath(triggerLinePoints),
    markers,
    zeroY: cycleYAt(0),
    priceMin,
    priceMax,
    cycleMin,
    cycleMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineCyberCycleChart(
  data: readonly ChartLineCyberCyclePoint[] | null | undefined,
  options: ChartLineCyberCycleOptions = {},
): string {
  const run = runLineCyberCycle(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.cycleFinal === null ? 'n/a' : run.cycleFinal.toFixed(3);
  return (
    `Two-panel chart with the Ehlers Cyber Cycle oscillator (alpha ` +
    `${run.alpha}): the top panel plots the price, the bottom panel plots ` +
    `the Cyber Cycle and its trigger. The Cyber Cycle runs a resonant ` +
    `filter on the smoothed second difference of the price, extracting the ` +
    `cyclic swing of the market around zero. Across ${total} bars the ` +
    `cycle is above zero on ${run.upCount}, below zero on ${run.downCount} ` +
    `and at zero on ${run.flatCount}. The final cycle reading is ` +
    `${finalText}.`
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
  zone: ChartLineCyberCycleZone,
  upColor: string,
  downColor: string,
  flatColor: string,
): string {
  if (zone === 'up') return upColor;
  if (zone === 'down') return downColor;
  return flatColor;
}

function zoneLabelOf(zone: ChartLineCyberCycleZone): string {
  if (zone === 'up') return 'Above zero';
  if (zone === 'down') return 'Below zero';
  if (zone === 'flat') return 'At zero';
  return 'n/a';
}

/**
 * ChartLineCyberCycle -- two-panel pure-SVG Ehlers Cyber Cycle chart.
 */
export const ChartLineCyberCycle = forwardRef<
  HTMLDivElement,
  ChartLineCyberCycleProps
>(function ChartLineCyberCycle(props, ref) {
  const {
    data,
    alpha = DEFAULT_CHART_LINE_CYBER_CYCLE_ALPHA,
    width = DEFAULT_CHART_LINE_CYBER_CYCLE_WIDTH,
    height = DEFAULT_CHART_LINE_CYBER_CYCLE_HEIGHT,
    padding = DEFAULT_CHART_LINE_CYBER_CYCLE_PADDING,
    gap = DEFAULT_CHART_LINE_CYBER_CYCLE_GAP,
    tickCount = DEFAULT_CHART_LINE_CYBER_CYCLE_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_CYBER_CYCLE_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_CYBER_CYCLE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CYBER_CYCLE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CYBER_CYCLE_PRICE_COLOR,
    cycleColor = DEFAULT_CHART_LINE_CYBER_CYCLE_CYCLE_COLOR,
    triggerColor = DEFAULT_CHART_LINE_CYBER_CYCLE_TRIGGER_COLOR,
    upColor = DEFAULT_CHART_LINE_CYBER_CYCLE_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_CYBER_CYCLE_DOWN_COLOR,
    flatColor = DEFAULT_CHART_LINE_CYBER_CYCLE_FLAT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_CYBER_CYCLE_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_CYBER_CYCLE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CYBER_CYCLE_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCycle = true,
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
  const baseId = `chart-line-cyber-cycle-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineCyberCycleSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineCyberCycleSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineCyberCycleLayout({
        data,
        alpha,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [data, alpha, width, height, padding, gap, pricePanelRatio],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineCyberCycleChart(data, { alpha });
  const resolvedLabel =
    ariaLabel ?? `Ehlers Cyber Cycle chart, alpha ${run.alpha}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineCyberCycleSeriesId): void => {
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
      <g data-section="chart-line-cyber-cycle-tooltip" pointerEvents="none">
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
          data-section="chart-line-cyber-cycle-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-cyber-cycle-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Price: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-cyber-cycle-tooltip-cycle"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Cycle: ${
            hoverSample.cycle === null
              ? 'n/a'
              : formatValue(hoverSample.cycle)
          }`}
        </text>
        <text
          data-section="chart-line-cyber-cycle-tooltip-trigger"
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
          data-section="chart-line-cyber-cycle-tooltip-zone"
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
  const cycleHidden = isHidden('cycle') || !showCycle;
  const triggerHidden = isHidden('trigger') || !showTrigger;

  const legendItems: Array<{
    id: ChartLineCyberCycleSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'cycle', label: 'Cyber Cycle', color: cycleColor },
    { id: 'trigger', label: 'Trigger', color: triggerColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-cyber-cycle"
      data-empty={isEmpty ? 'true' : 'false'}
      data-alpha={run.alpha}
      data-cycle-final={run.cycleFinal === null ? '' : run.cycleFinal}
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
        data-section="chart-line-cyber-cycle-aria-desc"
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
          data-section="chart-line-cyber-cycle-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-cyber-cycle-empty"
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
          data-section="chart-line-cyber-cycle-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-cyber-cycle-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-cyber-cycle-grid-line"
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
                  layout.cyclePanelBottom -
                  t * (layout.cyclePanelBottom - layout.cyclePanelTop);
                return (
                  <line
                    key={`cg-${i}`}
                    data-section="chart-line-cyber-cycle-grid-line"
                    data-panel="cycle"
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
            <g data-section="chart-line-cyber-cycle-axes">
              <line
                data-section="chart-line-cyber-cycle-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cyber-cycle-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cyber-cycle-axis"
                data-panel="cycle"
                x1={layout.innerLeft}
                y1={layout.cyclePanelTop}
                x2={layout.innerLeft}
                y2={layout.cyclePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cyber-cycle-axis"
                data-panel="cycle"
                x1={layout.innerLeft}
                y1={layout.cyclePanelBottom}
                x2={layout.innerRight}
                y2={layout.cyclePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-cyber-cycle-tick-label"
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
                data-section="chart-line-cyber-cycle-tick-label"
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
                data-section="chart-line-cyber-cycle-tick-label"
                data-panel="cycle"
                x={layout.innerLeft - 6}
                y={layout.cyclePanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.cycleMax)}
              </text>
              <text
                data-section="chart-line-cyber-cycle-tick-label"
                data-panel="cycle"
                x={layout.innerLeft - 6}
                y={layout.cyclePanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.cycleMin)}
              </text>
            </g>
          ) : null}

          <text
            data-section="chart-line-cyber-cycle-panel-label"
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
            data-section="chart-line-cyber-cycle-panel-label"
            data-panel="cycle"
            x={layout.innerRight}
            y={layout.cyclePanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Ehlers Cyber Cycle
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-cyber-cycle-zero-line"
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
              data-section="chart-line-cyber-cycle-price-path"
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
            <g data-section="chart-line-cyber-cycle-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-cyber-cycle-dot"
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
              data-section="chart-line-cyber-cycle-trigger-line"
              d={layout.triggerPath}
              fill="none"
              stroke={triggerColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="5 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Cyber Cycle trigger line"
            />
          ) : null}

          {!cycleHidden ? (
            <path
              data-section="chart-line-cyber-cycle-cycle-line"
              d={layout.cyclePath}
              fill="none"
              stroke={cycleColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Cyber Cycle line, ${layout.markers.length} points`}
            />
          ) : null}

          {!cycleHidden && showMarkers ? (
            <g data-section="chart-line-cyber-cycle-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-cyber-cycle-marker"
                  data-zone={marker.zone}
                  data-cycle={marker.cycle}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(marker.zone, upColor, downColor, flatColor)}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, cycle ${formatValue(
                    marker.cycle,
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
            <g data-section="chart-line-cyber-cycle-badge">
              <rect
                data-section="chart-line-cyber-cycle-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={64}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-cyber-cycle-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`CC ${run.alpha}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-cyber-cycle-legend"
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
                data-section="chart-line-cyber-cycle-legend-item"
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
                  data-section="chart-line-cyber-cycle-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-cyber-cycle-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-cyber-cycle-legend-stats"
            style={{ color: axisColor }}
          >
            {`up ${run.upCount} / down ${run.downCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineCyberCycle.displayName = 'ChartLineCyberCycle';
