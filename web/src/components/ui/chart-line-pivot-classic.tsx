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
 * ChartLinePivotClassic -- pure-SVG single-panel Classic Floor Pivot
 * chart.
 *
 * The classic floor pivot levels project from the PRIOR bar's
 * `(high, low, close)` with the close weighted once in the pivot
 * point:
 *
 *   range = high - low
 *   PP    = (high + low + close) / 3
 *   R1    = 2 * PP - low
 *   S1    = 2 * PP - high
 *   R2    = PP + range
 *   S2    = PP - range
 *
 * The first bar has no prior reference and is left null on every
 * level. Each defined bar's five levels render as bar-wide horizontal
 * stub segments.
 *
 * A bar's zone is the close's position relative to its own levels:
 * `above-r2`, `r1-to-r2`, `pp-to-r1`, `s1-to-pp`, `s2-to-s1`,
 * `below-s2`, or `none` for the warm-up first bar.
 */

export interface ChartLinePivotClassicPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLinePivotClassicZone =
  | 'above-r2'
  | 'r1-to-r2'
  | 'pp-to-r1'
  | 's1-to-pp'
  | 's2-to-s1'
  | 'below-s2'
  | 'none';

export type ChartLinePivotClassicSeriesId =
  | 'price'
  | 'pp'
  | 'r1'
  | 's1'
  | 'r2'
  | 's2';

export interface ChartLinePivotClassicLevels {
  range: number | null;
  pp: number | null;
  r1: number | null;
  s1: number | null;
  r2: number | null;
  s2: number | null;
}

export interface ChartLinePivotClassicSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  levels: ChartLinePivotClassicLevels;
  zone: ChartLinePivotClassicZone;
}

export interface ChartLinePivotClassicRun {
  series: ChartLinePivotClassicPoint[];
  levels: ChartLinePivotClassicLevels[];
  samples: ChartLinePivotClassicSample[];
  ppFinal: number | null;
  aboveCount: number;
  belowCount: number;
  betweenCount: number;
  ok: boolean;
}

export interface ChartLinePivotClassicSegment {
  index: number;
  seriesId: ChartLinePivotClassicSeriesId;
  fromCx: number;
  toCx: number;
  cy: number;
  value: number;
}

export interface ChartLinePivotClassicMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  zone: ChartLinePivotClassicZone;
}

export interface ChartLinePivotClassicDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLinePivotClassicLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLinePivotClassicDot[];
  segments: ChartLinePivotClassicSegment[];
  markers: ChartLinePivotClassicMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLinePivotClassicRun;
}

export interface ChartLinePivotClassicProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLinePivotClassicPoint[];
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  ppColor?: string;
  resistanceColor?: string;
  supportColor?: string;
  bullColor?: string;
  bearColor?: string;
  neutralColor?: string;
  noneColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPp?: boolean;
  showLevel1?: boolean;
  showLevel2?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLinePivotClassicSeriesId[];
  defaultHiddenSeries?: ChartLinePivotClassicSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLinePivotClassicSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLinePivotClassicSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_WIDTH = 720;
export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_HEIGHT = 380;
export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_PADDING = 44;
export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_PP_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_RESISTANCE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_SUPPORT_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_BULL_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_BEAR_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_NEUTRAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PIVOT_CLASSIC_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite x, high, low, close and `high >= low`. */
export function getLinePivotClassicFinitePoints(
  data: readonly ChartLinePivotClassicPoint[] | null | undefined,
): ChartLinePivotClassicPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLinePivotClassicPoint[] = [];
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

/**
 * Compute the Classic Floor Pivot levels for a single bar given the
 * PRIOR bar. Returns null fields when the prior bar is missing or has
 * a non-finite field.
 */
export function computeLinePivotClassicLevels(
  prev: ChartLinePivotClassicPoint | null,
): ChartLinePivotClassicLevels {
  if (
    !prev ||
    !isFiniteNumber(prev.high) ||
    !isFiniteNumber(prev.low) ||
    !isFiniteNumber(prev.close)
  ) {
    return {
      range: null,
      pp: null,
      r1: null,
      s1: null,
      r2: null,
      s2: null,
    };
  }
  const range = prev.high - prev.low;
  const pp = (prev.high + prev.low + prev.close) / 3;
  return {
    range,
    pp,
    r1: 2 * pp - prev.low,
    s1: 2 * pp - prev.high,
    r2: pp + range,
    s2: pp - range,
  };
}

/** Per-bar Classic Floor Pivot levels; the first bar has no prior. */
export function computeLinePivotClassic(
  bars: readonly ChartLinePivotClassicPoint[] | null | undefined,
): ChartLinePivotClassicLevels[] {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const out: ChartLinePivotClassicLevels[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const prev = i > 0 ? (bars[i - 1] ?? null) : null;
    out.push(computeLinePivotClassicLevels(prev));
  }
  return out;
}

/** Classify a close against its bar's Classic levels. */
export function classifyLinePivotClassicZone(
  close: number | null,
  levels: ChartLinePivotClassicLevels,
): ChartLinePivotClassicZone {
  if (
    !isFiniteNumber(close) ||
    !isFiniteNumber(levels.pp) ||
    !isFiniteNumber(levels.r1) ||
    !isFiniteNumber(levels.s1) ||
    !isFiniteNumber(levels.r2) ||
    !isFiniteNumber(levels.s2)
  ) {
    return 'none';
  }
  if (close > levels.r2) return 'above-r2';
  if (close > levels.r1) return 'r1-to-r2';
  if (close >= levels.pp) return 'pp-to-r1';
  if (close >= levels.s1) return 's1-to-pp';
  if (close >= levels.s2) return 's2-to-s1';
  return 'below-s2';
}

/** Run the full Classic Floor Pivot pipeline. */
export function runLinePivotClassic(
  data: readonly ChartLinePivotClassicPoint[] | null | undefined,
): ChartLinePivotClassicRun {
  const series = getLinePivotClassicFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const levels = computeLinePivotClassic(series);
  const samples: ChartLinePivotClassicSample[] = series.map((point, index) => {
    const lv = levels[index]!;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      levels: lv,
      zone: classifyLinePivotClassicZone(point.close, lv),
    };
  });
  let aboveCount = 0;
  let belowCount = 0;
  let betweenCount = 0;
  let ppFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above-r2' || sample.zone === 'r1-to-r2') {
      aboveCount += 1;
    } else if (sample.zone === 'below-s2' || sample.zone === 's2-to-s1') {
      belowCount += 1;
    } else if (sample.zone === 'pp-to-r1' || sample.zone === 's1-to-pp') {
      betweenCount += 1;
    }
    if (isFiniteNumber(sample.levels.pp)) ppFinal = sample.levels.pp;
  }
  return {
    series,
    levels,
    samples,
    ppFinal,
    aboveCount,
    belowCount,
    betweenCount,
    ok: series.length >= 2,
  };
}

export interface ChartLinePivotClassicLayoutOptions {
  data: readonly ChartLinePivotClassicPoint[] | null | undefined;
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
export function computeLinePivotClassicLayout(
  options: ChartLinePivotClassicLayoutOptions,
): ChartLinePivotClassicLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_PIVOT_CLASSIC_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_PIVOT_CLASSIC_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_PIVOT_CLASSIC_PADDING;

  const run = runLinePivotClassic(options.data);

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
    for (const v of [ls.r2, ls.r1, ls.pp, ls.s1, ls.s2]) {
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
  const priceDots: ChartLinePivotClassicDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const segments: ChartLinePivotClassicSegment[] = [];
  const markers: ChartLinePivotClassicMarker[] = [];
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
      seriesId: ChartLinePivotClassicSeriesId;
      value: number | null;
    }> = [
      { seriesId: 'pp', value: sample.levels.pp },
      { seriesId: 'r1', value: sample.levels.r1 },
      { seriesId: 's1', value: sample.levels.s1 },
      { seriesId: 'r2', value: sample.levels.r2 },
      { seriesId: 's2', value: sample.levels.s2 },
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
export function describeLinePivotClassicChart(
  data: readonly ChartLinePivotClassicPoint[] | null | undefined,
): string {
  const run = runLinePivotClassic(data);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.ppFinal === null ? 'n/a' : run.ppFinal.toFixed(3);
  return (
    `Single-panel chart with Classic Floor Pivot levels: each bar ` +
    `carries levels projected from the prior bar's high, low, and ` +
    `close. PP = (H + L + C) / 3, R1 = 2*PP - L, S1 = 2*PP - H, ` +
    `R2 = PP + (H - L), S2 = PP - (H - L). The first bar has no ` +
    `prior and carries no levels. Across ${total} bars the close ` +
    `sits above the PP on ${run.aboveCount} bars, below on ` +
    `${run.belowCount}, and inside the inner band on ${run.betweenCount}. ` +
    `The final pivot point is ${finalText}.`
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
  zone: ChartLinePivotClassicZone,
  bullColor: string,
  bearColor: string,
  neutralColor: string,
  noneColor: string,
): string {
  if (zone === 'above-r2' || zone === 'r1-to-r2') return bullColor;
  if (zone === 'below-s2' || zone === 's2-to-s1') return bearColor;
  if (zone === 'pp-to-r1' || zone === 's1-to-pp') return neutralColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLinePivotClassicZone): string {
  if (zone === 'above-r2') return 'Above R2';
  if (zone === 'r1-to-r2') return 'R1 to R2';
  if (zone === 'pp-to-r1') return 'PP to R1';
  if (zone === 's1-to-pp') return 'S1 to PP';
  if (zone === 's2-to-s1') return 'S2 to S1';
  if (zone === 'below-s2') return 'Below S2';
  return 'n/a';
}

function segmentColorOf(
  seriesId: ChartLinePivotClassicSeriesId,
  ppColor: string,
  resistanceColor: string,
  supportColor: string,
  defaultColor: string,
): string {
  if (seriesId === 'pp') return ppColor;
  if (seriesId === 'r1' || seriesId === 'r2') return resistanceColor;
  if (seriesId === 's1' || seriesId === 's2') return supportColor;
  return defaultColor;
}

/**
 * ChartLinePivotClassic -- single-panel pure-SVG Classic Floor Pivot
 * chart.
 */
export const ChartLinePivotClassic = forwardRef<
  HTMLDivElement,
  ChartLinePivotClassicProps
>(function ChartLinePivotClassic(props, ref) {
  const {
    data,
    width = DEFAULT_CHART_LINE_PIVOT_CLASSIC_WIDTH,
    height = DEFAULT_CHART_LINE_PIVOT_CLASSIC_HEIGHT,
    padding = DEFAULT_CHART_LINE_PIVOT_CLASSIC_PADDING,
    tickCount = DEFAULT_CHART_LINE_PIVOT_CLASSIC_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_PIVOT_CLASSIC_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_PIVOT_CLASSIC_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_PIVOT_CLASSIC_PRICE_COLOR,
    ppColor = DEFAULT_CHART_LINE_PIVOT_CLASSIC_PP_COLOR,
    resistanceColor = DEFAULT_CHART_LINE_PIVOT_CLASSIC_RESISTANCE_COLOR,
    supportColor = DEFAULT_CHART_LINE_PIVOT_CLASSIC_SUPPORT_COLOR,
    bullColor = DEFAULT_CHART_LINE_PIVOT_CLASSIC_BULL_COLOR,
    bearColor = DEFAULT_CHART_LINE_PIVOT_CLASSIC_BEAR_COLOR,
    neutralColor = DEFAULT_CHART_LINE_PIVOT_CLASSIC_NEUTRAL_COLOR,
    noneColor = DEFAULT_CHART_LINE_PIVOT_CLASSIC_NONE_COLOR,
    gridColor = DEFAULT_CHART_LINE_PIVOT_CLASSIC_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_PIVOT_CLASSIC_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPp = true,
    showLevel1 = true,
    showLevel2 = true,
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
  const baseId = `chart-line-pivot-classic-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLinePivotClassicSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLinePivotClassicSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLinePivotClassicLayout({
        data,
        width,
        height,
        padding,
      }),
    [data, width, height, padding],
  );

  const run = layout.run;
  const description = ariaDescription ?? describeLinePivotClassicChart(data);
  const resolvedLabel = ariaLabel ?? 'Classic Floor Pivot chart';

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLinePivotClassicSeriesId): void => {
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

  const showSeries = (id: ChartLinePivotClassicSeriesId): boolean => {
    if (isHidden(id)) return false;
    if (id === 'pp') return showPp;
    if (id === 'r1' || id === 's1') return showLevel1;
    if (id === 'r2' || id === 's2') return showLevel2;
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
      <g data-section="chart-line-pivot-classic-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={140}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-pivot-classic-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-pivot-classic-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-pivot-classic-tooltip-r2"
          x={tx + 10}
          y={ty + 51}
          fill="#fca5a5"
          fontSize={11}
        >
          {`R2: ${fmt(levels.r2)}`}
        </text>
        <text
          data-section="chart-line-pivot-classic-tooltip-r1"
          x={tx + 10}
          y={ty + 67}
          fill="#fca5a5"
          fontSize={11}
        >
          {`R1: ${fmt(levels.r1)}`}
        </text>
        <text
          data-section="chart-line-pivot-classic-tooltip-pp"
          x={tx + 10}
          y={ty + 83}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`PP: ${fmt(levels.pp)}`}
        </text>
        <text
          data-section="chart-line-pivot-classic-tooltip-s1"
          x={tx + 10}
          y={ty + 99}
          fill="#86efac"
          fontSize={11}
        >
          {`S1: ${fmt(levels.s1)}`}
        </text>
        <text
          data-section="chart-line-pivot-classic-tooltip-zone"
          x={tx + 10}
          y={ty + 115}
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
    id: ChartLinePivotClassicSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'pp', label: 'PP', color: ppColor },
    { id: 'r1', label: 'R1 / S1', color: resistanceColor },
    { id: 'r2', label: 'R2 / S2', color: resistanceColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-pivot-classic"
      data-empty={isEmpty ? 'true' : 'false'}
      data-pp-final={run.ppFinal === null ? '' : run.ppFinal}
      data-above-count={run.aboveCount}
      data-below-count={run.belowCount}
      data-between-count={run.betweenCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-pivot-classic-aria-desc"
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
          data-section="chart-line-pivot-classic-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-pivot-classic-empty"
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
          data-section="chart-line-pivot-classic-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-pivot-classic-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-pivot-classic-grid-line"
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
            <g data-section="chart-line-pivot-classic-axes">
              <line
                data-section="chart-line-pivot-classic-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-pivot-classic-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-pivot-classic-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-pivot-classic-tick-label"
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

          <g data-section="chart-line-pivot-classic-segments">
            {layout.segments
              .filter((seg) => showSeries(seg.seriesId))
              .map((seg, i) => (
                <line
                  key={`seg-${seg.index}-${seg.seriesId}-${i}`}
                  data-section="chart-line-pivot-classic-segment"
                  data-series-id={seg.seriesId}
                  data-value={seg.value}
                  x1={seg.fromCx}
                  y1={seg.cy}
                  x2={seg.toCx}
                  y2={seg.cy}
                  stroke={segmentColorOf(
                    seg.seriesId,
                    ppColor,
                    resistanceColor,
                    supportColor,
                    neutralColor,
                  )}
                  strokeWidth={1.5}
                  strokeOpacity={
                    seg.seriesId === 'pp'
                      ? 1
                      : seg.seriesId === 'r2' || seg.seriesId === 's2'
                        ? 0.6
                        : 0.85
                  }
                />
              ))}
          </g>

          {!priceHidden ? (
            <path
              data-section="chart-line-pivot-classic-price-path"
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
            <g data-section="chart-line-pivot-classic-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-pivot-classic-dot"
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
            <g data-section="chart-line-pivot-classic-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-pivot-classic-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    bullColor,
                    bearColor,
                    neutralColor,
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
            <g data-section="chart-line-pivot-classic-badge">
              <rect
                data-section="chart-line-pivot-classic-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={128}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-pivot-classic-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                CLASSIC PIVOT
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-pivot-classic-legend"
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
                data-section="chart-line-pivot-classic-legend-item"
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
                  data-section="chart-line-pivot-classic-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-pivot-classic-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-pivot-classic-legend-stats"
            style={{ color: axisColor }}
          >
            {`above ${run.aboveCount} / below ${run.belowCount} / between ${run.betweenCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLinePivotClassic.displayName = 'ChartLinePivotClassic';
