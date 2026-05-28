import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_GMMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_GMMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_GMMA_PADDING = 40;
export const DEFAULT_CHART_LINE_GMMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_GMMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_GMMA_EMA_STROKE_WIDTH = 1.25;
export const DEFAULT_CHART_LINE_GMMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_GMMA_SHORT_PERIODS: readonly number[] = [
  3, 5, 8, 10, 12, 15,
];
export const DEFAULT_CHART_LINE_GMMA_LONG_PERIODS: readonly number[] = [
  30, 35, 40, 45, 50, 60,
];
export const DEFAULT_CHART_LINE_GMMA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_GMMA_SHORT_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_GMMA_LONG_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_GMMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_GMMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineGmmaState =
  | 'bullish'
  | 'bearish'
  | 'crossing'
  | 'forming';

export interface ChartLineGmmaPoint {
  x: number;
  value: number;
}

export interface ChartLineGmmaSample {
  index: number;
  x: number;
  value: number;
  shortMin: number | null;
  shortMax: number | null;
  longMin: number | null;
  longMax: number | null;
  state: ChartLineGmmaState;
}

export interface ChartLineGmmaRun {
  series: ChartLineGmmaPoint[];
  shortPeriods: number[];
  longPeriods: number[];
  short: (number | null)[][];
  long: (number | null)[][];
  samples: ChartLineGmmaSample[];
  bullishCount: number;
  bearishCount: number;
  crossingCount: number;
  ok: boolean;
}

export interface ChartLineGmmaPriceDot {
  index: number;
  x: number;
  value: number;
  shortMin: number | null;
  shortMax: number | null;
  longMin: number | null;
  longMax: number | null;
  state: ChartLineGmmaState;
  px: number;
  py: number;
}

export interface ChartLineGmmaLine {
  period: number;
  path: string;
}

export interface ChartLineGmmaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineGmmaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineGmmaPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  priceDots: ChartLineGmmaPriceDot[];
  shortLines: ChartLineGmmaLine[];
  longLines: ChartLineGmmaLine[];
  shortPeriods: number[];
  longPeriods: number[];
  bullishCount: number;
  bearishCount: number;
  crossingCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineGmmaLayoutOptions {
  data: readonly ChartLineGmmaPoint[];
  shortPeriods?: readonly number[];
  longPeriods?: readonly number[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineGmmaProps {
  data: readonly ChartLineGmmaPoint[];
  shortPeriods?: readonly number[];
  longPeriods?: readonly number[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  emaStrokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  shortColor?: string;
  longColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showShort?: boolean;
  showLong?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineGmmaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineGmmaFinitePoints(
  points: readonly ChartLineGmmaPoint[] | null | undefined,
): ChartLineGmmaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineGmmaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a list of EMA periods to ascending, deduped positive
 * integers. Non-finite or sub-1 entries are dropped and fractional
 * entries floored; an empty result falls back to `fallback`.
 */
export function normalizeLineGmmaPeriods(
  periods: readonly number[] | null | undefined,
  fallback: readonly number[],
): number[] {
  if (!Array.isArray(periods)) return [...fallback];
  const cleaned: number[] = [];
  for (const p of periods) {
    if (!isFiniteNumber(p)) continue;
    const floored = Math.floor(p);
    if (floored >= 1) cleaned.push(floored);
  }
  if (cleaned.length === 0) return [...fallback];
  const unique = Array.from(new Set(cleaned));
  unique.sort((a, b) => a - b);
  return unique;
}

/**
 * An exponential moving average over `period` values. The seed is
 * the simple mean of the first `period` defined values placed at
 * that value's index; each later defined value folds in at weight
 * `2 / (period + 1)`.
 */
export function computeLineGmmaEma(
  src: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  const idx: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (isDefined(src[i])) idx.push(i);
  }
  if (idx.length < p) return out;
  const mult = 2 / (p + 1);
  let sum = 0;
  for (let k = 0; k < p; k += 1) sum += src[idx[k]!] as number;
  let ema = sum / p;
  out[idx[p - 1]!] = ema;
  for (let k = p; k < idx.length; k += 1) {
    const i = idx[k]!;
    ema = (src[i] as number) * mult + ema * (1 - mult);
    out[i] = ema;
  }
  return out;
}

/**
 * Daryl Guppy's Multiple Moving Average. The price is run through a
 * fast trader group of short-period exponential moving averages and
 * a slow investor group of long-period ones, producing a ribbon of
 * EMA lines. The relationship between the two ribbons -- not any one
 * line -- is the signal: a clear separation marks a sustained trend,
 * a tangle marks a trend change.
 */
export function computeLineGmma(
  values: readonly number[] | null | undefined,
  shortPeriods: readonly number[],
  longPeriods: readonly number[],
): { short: (number | null)[][]; long: (number | null)[][] } {
  if (!Array.isArray(values)) return { short: [], long: [] };
  const shorts = Array.isArray(shortPeriods) ? shortPeriods : [];
  const longs = Array.isArray(longPeriods) ? longPeriods : [];
  return {
    short: shorts.map((p) => computeLineGmmaEma(values, p)),
    long: longs.map((p) => computeLineGmmaEma(values, p)),
  };
}

function bandOf(vals: readonly (number | null)[]): {
  min: number | null;
  max: number | null;
  allDefined: boolean;
} {
  let min: number | null = null;
  let max: number | null = null;
  let defined = 0;
  for (const v of vals) {
    if (isDefined(v)) {
      defined += 1;
      if (min === null || v < min) min = v;
      if (max === null || v > max) max = v;
    }
  }
  return { min, max, allDefined: vals.length > 0 && defined === vals.length };
}

function classifyState(
  shortMin: number | null,
  shortMax: number | null,
  longMin: number | null,
  longMax: number | null,
  shortAllDefined: boolean,
  longAllDefined: boolean,
): ChartLineGmmaState {
  if (
    !shortAllDefined ||
    !longAllDefined ||
    shortMin === null ||
    shortMax === null ||
    longMin === null ||
    longMax === null
  ) {
    return 'forming';
  }
  if (shortMin > longMax) return 'bullish';
  if (shortMax < longMin) return 'bearish';
  return 'crossing';
}

export function runLineGmma(
  points: readonly ChartLineGmmaPoint[] | null | undefined,
  options?: {
    shortPeriods?: readonly number[];
    longPeriods?: readonly number[];
  },
): ChartLineGmmaRun {
  const finite = getLineGmmaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const shortPeriods = normalizeLineGmmaPeriods(
    options?.shortPeriods,
    DEFAULT_CHART_LINE_GMMA_SHORT_PERIODS,
  );
  const longPeriods = normalizeLineGmmaPeriods(
    options?.longPeriods,
    DEFAULT_CHART_LINE_GMMA_LONG_PERIODS,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      shortPeriods,
      longPeriods,
      short: [],
      long: [],
      samples: [],
      bullishCount: 0,
      bearishCount: 0,
      crossingCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { short, long } = computeLineGmma(values, shortPeriods, longPeriods);

  const samples: ChartLineGmmaSample[] = series.map((p, i) => {
    const shortAtI = short.map((s) => s[i] ?? null);
    const longAtI = long.map((l) => l[i] ?? null);
    const sBand = bandOf(shortAtI);
    const lBand = bandOf(longAtI);
    return {
      index: i,
      x: p.x,
      value: p.value,
      shortMin: sBand.min,
      shortMax: sBand.max,
      longMin: lBand.min,
      longMax: lBand.max,
      state: classifyState(
        sBand.min,
        sBand.max,
        lBand.min,
        lBand.max,
        sBand.allDefined,
        lBand.allDefined,
      ),
    };
  });

  let bullishCount = 0;
  let bearishCount = 0;
  let crossingCount = 0;
  for (const s of samples) {
    if (s.state === 'bullish') bullishCount += 1;
    if (s.state === 'bearish') bearishCount += 1;
    if (s.state === 'crossing') crossingCount += 1;
  }

  return {
    series = [],
    shortPeriods,
    longPeriods,
    short,
    long,
    samples,
    bullishCount,
    bearishCount,
    crossingCount,
    ok: true,
  };
}

function buildPath(points: readonly { px: number; py: number }[]): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  return parts.join(' ');
}

function normaliseHidden(
  hidden: ReadonlySet<string> | readonly string[] | null | undefined,
): Set<string> {
  if (!hidden) return new Set();
  if (hidden instanceof Set) return new Set(hidden);
  if (Array.isArray(hidden)) return new Set(hidden);
  return new Set();
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineGmmaLayout(
  options: ComputeLineGmmaLayoutOptions,
): ChartLineGmmaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_GMMA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineGmmaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineGmma(data, {
    ...(Array.isArray(options.shortPeriods)
      ? { shortPeriods: options.shortPeriods }
      : {}),
    ...(Array.isArray(options.longPeriods)
      ? { longPeriods: options.longPeriods }
      : {}),
  });
  const empty: ChartLineGmmaLayout = {
    ok: false,
    width,
    height,
    panel: emptyPanel,
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    pricePath: '',
    priceDots: [],
    shortLines: [],
    longLines: [],
    shortPeriods: run.shortPeriods,
    longPeriods: run.longPeriods,
    bullishCount: 0,
    bearishCount: 0,
    crossingCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineGmmaPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < yLo) yLo = s.value;
    if (s.value > yHi) yHi = s.value;
  }
  for (const line of [...run.short, ...run.long]) {
    for (const v of line) {
      if (isDefined(v)) {
        if (v < yLo) yLo = v;
        if (v > yHi) yHi = v;
      }
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;
  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const priceDots: ChartLineGmmaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    shortMin: s.shortMin,
    shortMax: s.shortMax,
    longMin: s.longMin,
    longMax: s.longMax,
    state: s.state,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const lineFor = (
    periods: number[],
    emaSeries: (number | null)[][],
  ): ChartLineGmmaLine[] =>
    periods.map((period, gi) => {
      const ema = emaSeries[gi] ?? [];
      const pts: { px: number; py: number }[] = [];
      for (let i = 0; i < ema.length; i += 1) {
        const v = ema[i];
        if (isDefined(v)) {
          const sample = run.samples[i];
          if (sample) pts.push({ px: projectX(sample.x), py: projectY(v) });
        }
      }
      return { period, path: buildPath(pts) };
    });

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    yTicks: computeTicks(yLo, yHi, tickCount).map((v) => ({
      value: v,
      py: projectY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    shortLines: lineFor(run.shortPeriods, run.short),
    longLines: lineFor(run.longPeriods, run.long),
    shortPeriods: run.shortPeriods,
    longPeriods: run.longPeriods,
    bullishCount: run.bullishCount,
    bearishCount: run.bearishCount,
    crossingCount: run.crossingCount,
    totalPoints: run.samples.length,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineGmmaChart(
  data: readonly ChartLineGmmaPoint[] | null | undefined,
  options?: {
    shortPeriods?: readonly number[];
    longPeriods?: readonly number[];
  },
): string {
  const run = runLineGmma(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Guppy Multiple Moving Average ribbon (${run.shortPeriods.length} short EMAs, ${run.longPeriods.length} long EMAs): the GMMA plots a fast trader group of short-period exponential moving averages and a slow investor group of long-period ones. When the short ribbon holds clear above the long ribbon the trend is bullish; clear below, bearish; when the two ribbons tangle the trend is changing. ${run.bullishCount} bullish, ${run.bearishCount} bearish and ${run.crossingCount} crossing across ${run.samples.length} periods.`;
}

const GMMA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineGmma = forwardRef<HTMLDivElement, ChartLineGmmaProps>(
  function ChartLineGmma(
    props: ChartLineGmmaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      shortPeriods,
      longPeriods,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_GMMA_WIDTH,
      height = DEFAULT_CHART_LINE_GMMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_GMMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_GMMA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_GMMA_STROKE_WIDTH,
      emaStrokeWidth = DEFAULT_CHART_LINE_GMMA_EMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_GMMA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_GMMA_PRICE_COLOR,
      shortColor = DEFAULT_CHART_LINE_GMMA_SHORT_COLOR,
      longColor = DEFAULT_CHART_LINE_GMMA_LONG_COLOR,
      gridColor = DEFAULT_CHART_LINE_GMMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_GMMA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showShort = true,
      showLong = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Guppy Multiple Moving Average ribbon',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      onPointClick,
      onSeriesToggle,
      style,
    } = props;

    const reactId = useId();
    const descId = `${reactId}-desc`;

    const isControlled = controlledHidden !== undefined;
    const [uncontrolled, setUncontrolled] = useState<Set<string>>(() =>
      normaliseHidden(defaultHiddenSeries),
    );
    const hiddenSet = isControlled
      ? normaliseHidden(controlledHidden)
      : uncontrolled;

    const layout = useMemo(
      () =>
        computeLineGmmaLayout({
          data,
          width,
          height,
          padding,
          tickCount,
          ...(Array.isArray(shortPeriods) ? { shortPeriods } : {}),
          ...(Array.isArray(longPeriods) ? { longPeriods } : {}),
        }),
      [data, width, height, padding, tickCount, shortPeriods, longPeriods],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineGmmaChart(data, {
          ...(Array.isArray(shortPeriods) ? { shortPeriods } : {}),
          ...(Array.isArray(longPeriods) ? { longPeriods } : {}),
        }),
      [ariaDescription, data, shortPeriods, longPeriods],
    );

    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{
      px: number;
      py: number;
    } | null>(null);

    const clearHover = useCallback(() => {
      setHoverIndex(null);
      setTooltipPos(null);
    }, []);

    const handleToggle = useCallback(
      (seriesId: string) => {
        const next = new Set(hiddenSet);
        const willHide = !next.has(seriesId);
        if (willHide) next.add(seriesId);
        else next.delete(seriesId);
        if (!isControlled) setUncontrolled(next);
        onHiddenSeriesChange?.(next);
        onSeriesToggle?.({ seriesId, hidden: willHide });
      },
      [hiddenSet, isControlled, onHiddenSeriesChange, onSeriesToggle],
    );

    const containerStyle: CSSProperties = {
      width,
      height,
      position: 'relative',
      ...(style ?? {}),
    };

    if (!layout.ok) {
      return (
        <div
          ref={ref}
          role="region"
          aria-label={ariaLabel}
          aria-describedby={descId}
          className={className}
          style={containerStyle}
          data-section="chart-line-gmma"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-gmma-aria-desc"
            style={GMMA_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const shortVisible = showShort && !hiddenSet.has('short');
    const longVisible = showLong && !hiddenSet.has('long');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'short', label: 'Short', color: shortColor },
      { id: 'long', label: 'Long', color: longColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={
          [className, animateClass].filter(Boolean).join(' ') || undefined
        }
        style={containerStyle}
        data-section="chart-line-gmma"
        data-empty="false"
        data-short-count={layout.shortPeriods.length}
        data-long-count={layout.longPeriods.length}
        data-bullish-count={layout.bullishCount}
        data-bearish-count={layout.bearishCount}
        data-crossing-count={layout.crossingCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-gmma-aria-desc"
          style={GMMA_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-gmma-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-gmma-badge"
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                padding: '2px 6px',
                borderRadius: 4,
                background: '#ffffffd9',
                color: '#0f172a',
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                gap: 4,
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <span
                data-section="chart-line-gmma-badge-icon"
                aria-hidden="true"
                style={{ color: shortColor }}
              >
                GMMA
              </span>
              <span data-section="chart-line-gmma-badge-groups">
                s={layout.shortPeriods.length} l={layout.longPeriods.length}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-gmma-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-gmma-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-gmma-grid-line"
                    x1={cp.x}
                    x2={cp.x + cp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-gmma-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-gmma-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-gmma-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-gmma-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-gmma-tick-label"
                      data-axis="y"
                      x={cp.x - 6}
                      y={t.py + 3}
                      textAnchor="end"
                      fontSize={10}
                      fill={axisColor}
                      stroke="none"
                    >
                      {formatValue(t.value)}
                    </text>
                  </g>
                ))}
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`xt-${i}`}
                    data-section="chart-line-gmma-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-gmma-tick-label"
                      data-axis="x"
                      x={t.px}
                      y={cp.y + cp.height + 14}
                      textAnchor="middle"
                      fontSize={10}
                      fill={axisColor}
                      stroke="none"
                    >
                      {formatX(t.value)}
                    </text>
                  </g>
                ))}
              </g>
            ) : null}

            {longVisible ? (
              <g data-section="chart-line-gmma-long-group">
                {layout.longLines.map((line) =>
                  line.path ? (
                    <path
                      key={`long-${line.period}`}
                      data-section="chart-line-gmma-long-line"
                      data-period={line.period}
                      d={line.path}
                      fill="none"
                      stroke={longColor}
                      strokeWidth={emaStrokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.85}
                    />
                  ) : null,
                )}
              </g>
            ) : null}

            {shortVisible ? (
              <g data-section="chart-line-gmma-short-group">
                {layout.shortLines.map((line) =>
                  line.path ? (
                    <path
                      key={`short-${line.period}`}
                      data-section="chart-line-gmma-short-line"
                      data-period={line.period}
                      d={line.path}
                      fill="none"
                      stroke={shortColor}
                      strokeWidth={emaStrokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.85}
                    />
                  ) : null,
                )}
              </g>
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-gmma-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-gmma-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-gmma-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.value}
                      data-state={d.state}
                      cx={d.px}
                      cy={d.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={priceColor}
                      stroke="#ffffff"
                      strokeWidth={1}
                      onMouseEnter={() => {
                        setHoverIndex(d.index);
                        setTooltipPos({ px: d.px, py: d.py });
                      }}
                      onMouseLeave={clearHover}
                      onFocus={() => {
                        setHoverIndex(d.index);
                        setTooltipPos({ px: d.px, py: d.py });
                      }}
                      onBlur={clearHover}
                      onClick={() => onPointClick?.({ point: d })}
                    />
                  );
                })}
              </g>
            ) : null}
          </svg>

          {showTooltip && hoverIndex !== null && tooltipPos
            ? (() => {
                const d = layout.priceDots.find((x) => x.index === hoverIndex);
                if (!d) return null;
                const band = (
                  min: number | null,
                  max: number | null,
                ): string =>
                  min === null || max === null
                    ? 'n/a'
                    : `${formatValue(min)} - ${formatValue(max)}`;
                return (
                  <div
                    data-section="chart-line-gmma-tooltip"
                    data-point-index={d.index}
                    style={{
                      position: 'absolute',
                      left: tooltipPos.px + 8,
                      top: tooltipPos.py + 8,
                      background: '#0f172a',
                      color: '#f8fafc',
                      padding: '6px 8px',
                      fontSize: 11,
                      borderRadius: 4,
                      pointerEvents: 'none',
                      minWidth: 150,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div data-section="chart-line-gmma-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-gmma-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-gmma-tooltip-short">
                      short: {band(d.shortMin, d.shortMax)}
                    </div>
                    <div data-section="chart-line-gmma-tooltip-long">
                      long: {band(d.longMin, d.longMax)}
                    </div>
                    <div data-section="chart-line-gmma-tooltip-state">
                      state: {d.state}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-gmma-legend"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 8,
              alignItems: 'center',
            }}
          >
            {legendItems.map((item) => {
              const isHidden = hiddenSet.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  data-section="chart-line-gmma-legend-item"
                  data-series-id={item.id}
                  data-hidden={isHidden ? 'true' : 'false'}
                  onClick={() => handleToggle(item.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    opacity: isHidden ? 0.5 : 1,
                  }}
                >
                  <span
                    data-section="chart-line-gmma-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-gmma-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-gmma-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.bullishCount} bullish, {layout.bearishCount} bearish,{' '}
              {layout.crossingCount} crossing
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineGmma.displayName = 'ChartLineGmma';
