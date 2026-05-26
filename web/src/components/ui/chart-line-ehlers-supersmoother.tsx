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
 * ChartLineEhlersSupersmoother -- pure-SVG single-panel chart
 * with an Ehlers SuperSmoother overlay (two-pole Butterworth).
 *
 * The SuperSmoother is a recursive two-pole low-pass filter:
 *
 *   a   = exp(-sqrt(2) * PI / period)
 *   arg = sqrt(2) * PI / period
 *   c2  = 2 * a * cos(arg)
 *   c3  = -a * a
 *   c1  = 1 - c2 - c3
 *
 *   ss[i] = c1 * (close[i] + close[i - 1]) / 2
 *           + c2 * ss[i - 1] + c3 * ss[i - 2]
 *
 * Seeds: `ss[0] = close[0]`, `ss[1] = close[1]`.
 *
 * The coefficient relation `c1 = 1 - c2 - c3` is computed in
 * floating point so that `c1 + c2 + c3 = 1` is exact. With that,
 * a constant close passes through unchanged at every bar
 * (stationary fixed point).
 *
 * Bit-exact anchor on integer fixtures:
 *
 *   * `CONST_FLAT (close == K)` -> `ss[0] = ss[1] = K`. For `i
 *     >= 2`, `ss[i] = c1 * K + c2 * K + c3 * K = (c1 + c2 +
 *     c3) * K = K` exactly, since `c1 + c2 + c3` collapses to
 *     `1` by construction. So `ss = K` bit-exact at every bar
 *     for any period.
 *
 * The chart shares one panel: the close line plus the
 * SuperSmoother line.
 */

export interface ChartLineEhlersSupersmootherPoint {
  x: number;
  close: number;
}

export type ChartLineEhlersSupersmootherZone =
  | 'above'
  | 'at'
  | 'below'
  | 'none';

export type ChartLineEhlersSupersmootherSeriesId = 'price' | 'ss';

export interface ChartLineEhlersSupersmootherSample {
  index: number;
  x: number;
  close: number;
  ss: number | null;
  zone: ChartLineEhlersSupersmootherZone;
}

export interface ChartLineEhlersSupersmootherRun {
  series: ChartLineEhlersSupersmootherPoint[];
  period: number;
  ss: Array<number | null>;
  samples: ChartLineEhlersSupersmootherSample[];
  ssFinal: number | null;
  aboveCount: number;
  atCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineEhlersSupersmootherMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  ss: number;
  zone: ChartLineEhlersSupersmootherZone;
}

export interface ChartLineEhlersSupersmootherDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineEhlersSupersmootherLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineEhlersSupersmootherDot[];
  ssPath: string;
  markers: ChartLineEhlersSupersmootherMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineEhlersSupersmootherRun;
}

export interface ChartLineEhlersSupersmootherProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineEhlersSupersmootherPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  ssColor?: string;
  aboveColor?: string;
  belowColor?: string;
  atColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSs?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineEhlersSupersmootherSeriesId[];
  defaultHiddenSeries?: ChartLineEhlersSupersmootherSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineEhlersSupersmootherSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineEhlersSupersmootherSample;
  }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_WIDTH = 720;
export const DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_HEIGHT = 380;
export const DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_PADDING = 44;
export const DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_PERIOD = 10;
export const DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_SS_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_ABOVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_BELOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_AT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineEhlersSupersmootherFinitePoints(
  data: readonly ChartLineEhlersSupersmootherPoint[] | null | undefined,
): ChartLineEhlersSupersmootherPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineEhlersSupersmootherPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce the period to an integer of at least 2. */
export function normalizeLineEhlersSupersmootherPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/**
 * Compute the SuperSmoother coefficients from a period. `c1 = 1
 * - c2 - c3` is computed by subtraction so that `c1 + c2 + c3 =
 * 1` is bit-exact in IEEE 754.
 */
export function computeLineEhlersSupersmootherCoefficients(
  period: number,
): { c1: number; c2: number; c3: number } {
  const arg = (Math.SQRT2 * Math.PI) / period;
  const a = Math.exp(-arg);
  const c2 = 2 * a * Math.cos(arg);
  const c3 = -a * a;
  const c1 = 1 - c2 - c3;
  return { c1, c2, c3 };
}

/**
 * Compute the SuperSmoother series per bar. Seeds `ss[0] =
 * close[0]`, `ss[1] = close[1]`. Non-finite close nulls the bar
 * and resets the recurrence (a fresh seed kicks in on the next
 * finite close).
 */
export function computeLineEhlersSupersmoother(
  closes: readonly number[] | null | undefined,
  period: unknown,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const p = normalizeLineEhlersSupersmootherPeriod(
    period,
    DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_PERIOD,
  );
  const { c1, c2, c3 } = computeLineEhlersSupersmootherCoefficients(p);
  const out: Array<number | null> = [];
  let ssPrev1: number | null = null;
  let ssPrev2: number | null = null;
  let prevClose: number | null = null;
  let seeded = 0;
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i];
    if (!isFiniteNumber(c)) {
      out.push(null);
      ssPrev1 = null;
      ssPrev2 = null;
      prevClose = null;
      seeded = 0;
      continue;
    }
    if (seeded < 2 || ssPrev1 === null || ssPrev2 === null || prevClose === null) {
      // Seed bars: ss = close.
      out.push(c);
      ssPrev2 = ssPrev1;
      ssPrev1 = c;
      prevClose = c;
      seeded += 1;
      continue;
    }
    const ss: number = c1 * ((c + prevClose) / 2) + c2 * ssPrev1 + c3 * ssPrev2;
    out.push(ss);
    ssPrev2 = ssPrev1;
    ssPrev1 = ss;
    prevClose = c;
  }
  return out;
}

/** Classify a close against the SuperSmoother line. */
export function classifyLineEhlersSupersmootherZone(
  close: number | null,
  ss: number | null,
): ChartLineEhlersSupersmootherZone {
  if (!isFiniteNumber(close) || !isFiniteNumber(ss)) return 'none';
  if (close > ss) return 'above';
  if (close < ss) return 'below';
  return 'at';
}

export interface ChartLineEhlersSupersmootherOptions {
  period?: number;
}

/** Run the full SuperSmoother pipeline plus sample classification. */
export function runLineEhlersSupersmoother(
  data: readonly ChartLineEhlersSupersmootherPoint[] | null | undefined,
  options: ChartLineEhlersSupersmootherOptions = {},
): ChartLineEhlersSupersmootherRun {
  const series = getLineEhlersSupersmootherFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineEhlersSupersmootherPeriod(
    options.period,
    DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_PERIOD,
  );
  const closes = series.map((p) => p.close);
  const ss = computeLineEhlersSupersmoother(closes, period);
  const samples: ChartLineEhlersSupersmootherSample[] = series.map(
    (point, index) => {
      const value = ss[index] ?? null;
      return {
        index,
        x: point.x,
        close: point.close,
        ss: value,
        zone: classifyLineEhlersSupersmootherZone(point.close, value),
      };
    },
  );
  let aboveCount = 0;
  let atCount = 0;
  let belowCount = 0;
  let ssFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'at') atCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    if (isFiniteNumber(sample.ss)) ssFinal = sample.ss;
  }
  return {
    series,
    period,
    ss,
    samples,
    ssFinal,
    aboveCount,
    atCount,
    belowCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineEhlersSupersmootherLayoutOptions
  extends ChartLineEhlersSupersmootherOptions {
  data: readonly ChartLineEhlersSupersmootherPoint[] | null | undefined;
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
export function computeLineEhlersSupersmootherLayout(
  options: ChartLineEhlersSupersmootherLayoutOptions,
): ChartLineEhlersSupersmootherLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_PADDING;

  const run = runLineEhlersSupersmoother(options.data, {
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
    if (isFiniteNumber(sample.ss)) {
      if (sample.ss < valueMin) valueMin = sample.ss;
      if (sample.ss > valueMax) valueMax = sample.ss;
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
  const priceDots: ChartLineEhlersSupersmootherDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const ssLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineEhlersSupersmootherMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.ss)) return;
    const cx = xAt(index);
    ssLinePoints.push({ x: cx, y: yAt(sample.ss) });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yAt(sample.close),
      close: sample.close,
      ss: sample.ss,
      zone: sample.zone,
    });
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
    ssPath: buildLinePath(ssLinePoints),
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineEhlersSupersmootherChart(
  data: readonly ChartLineEhlersSupersmootherPoint[] | null | undefined,
  options: ChartLineEhlersSupersmootherOptions = {},
): string {
  const run = runLineEhlersSupersmoother(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.ssFinal === null ? 'n/a' : run.ssFinal.toFixed(4);
  return (
    `Single-panel chart with an Ehlers SuperSmoother overlay ` +
    `(period ${run.period}): the close line is plotted with the ` +
    `SuperSmoother, a two-pole Butterworth recursive low-pass ` +
    `filter ss[i] = c1 * (close[i] + close[i - 1]) / 2 + c2 * ` +
    `ss[i - 1] + c3 * ss[i - 2], where c1 = 1 - c2 - c3 so the ` +
    `coefficient sum is exactly one. A constant close passes ` +
    `through the SuperSmoother unchanged at every bar. Across ` +
    `${total} bars the close sits above the SuperSmoother on ` +
    `${run.aboveCount}, below on ${run.belowCount}, and exactly ` +
    `at the SuperSmoother on ${run.atCount}. The final reading ` +
    `is ${finalText}.`
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
  zone: ChartLineEhlersSupersmootherZone,
  aboveColor: string,
  belowColor: string,
  atColor: string,
  noneColor: string,
): string {
  if (zone === 'above') return aboveColor;
  if (zone === 'below') return belowColor;
  if (zone === 'at') return atColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineEhlersSupersmootherZone): string {
  if (zone === 'above') return 'Above SS';
  if (zone === 'below') return 'Below SS';
  if (zone === 'at') return 'At SS';
  return 'n/a';
}

/**
 * ChartLineEhlersSupersmoother -- single-panel pure-SVG Ehlers
 * SuperSmoother chart.
 */
export const ChartLineEhlersSupersmoother = forwardRef<
  HTMLDivElement,
  ChartLineEhlersSupersmootherProps
>(function ChartLineEhlersSupersmoother(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_PERIOD,
    width = DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_WIDTH,
    height = DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_HEIGHT,
    padding = DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_PADDING,
    tickCount = DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_PRICE_COLOR,
    ssColor = DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_SS_COLOR,
    aboveColor = DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_BELOW_COLOR,
    atColor = DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_AT_COLOR,
    noneColor = DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_EHLERS_SUPERSMOOTHER_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSs = true,
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
  const baseId = `chart-line-ehlers-supersmoother-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineEhlersSupersmootherSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineEhlersSupersmootherSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineEhlersSupersmootherLayout({
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
    ariaDescription ?? describeLineEhlersSupersmootherChart(data, { period });
  const resolvedLabel =
    ariaLabel ?? `Ehlers SuperSmoother chart, period ${run.period}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineEhlersSupersmootherSeriesId): void => {
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
    const tooltipW = 220;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    tooltip = (
      <g
        data-section="chart-line-ehlers-supersmoother-tooltip"
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
          data-section="chart-line-ehlers-supersmoother-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-ehlers-supersmoother-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-ehlers-supersmoother-tooltip-ss"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`SS: ${
            hoverSample.ss === null ? 'n/a' : hoverSample.ss.toFixed(4)
          }`}
        </text>
        <text
          data-section="chart-line-ehlers-supersmoother-tooltip-zone"
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
  const ssHidden = isHidden('ss') || !showSs;

  const legendItems: Array<{
    id: ChartLineEhlersSupersmootherSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'ss', label: 'SuperSmoother', color: ssColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-ehlers-supersmoother"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-ss-final={run.ssFinal === null ? '' : run.ssFinal}
      data-above-count={run.aboveCount}
      data-at-count={run.atCount}
      data-below-count={run.belowCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-ehlers-supersmoother-aria-desc"
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
          data-section="chart-line-ehlers-supersmoother-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-ehlers-supersmoother-empty"
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
          data-section="chart-line-ehlers-supersmoother-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-ehlers-supersmoother-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-ehlers-supersmoother-grid-line"
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
            <g data-section="chart-line-ehlers-supersmoother-axes">
              <line
                data-section="chart-line-ehlers-supersmoother-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ehlers-supersmoother-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-ehlers-supersmoother-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-ehlers-supersmoother-tick-label"
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

          {!priceHidden ? (
            <path
              data-section="chart-line-ehlers-supersmoother-price-path"
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
            <g data-section="chart-line-ehlers-supersmoother-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-ehlers-supersmoother-dot"
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

          {!ssHidden ? (
            <path
              data-section="chart-line-ehlers-supersmoother-line"
              d={layout.ssPath}
              fill="none"
              stroke={ssColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`SuperSmoother line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-ehlers-supersmoother-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-ehlers-supersmoother-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-ss={marker.ss}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    aboveColor,
                    belowColor,
                    atColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatValue(
                    marker.close,
                  )}, SS ${formatValue(marker.ss)}, ${zoneLabelOf(marker.zone)}`}
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
            <g data-section="chart-line-ehlers-supersmoother-badge">
              <rect
                data-section="chart-line-ehlers-supersmoother-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={108}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-ehlers-supersmoother-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`SuperSmoother ${run.period}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-ehlers-supersmoother-legend"
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
                data-section="chart-line-ehlers-supersmoother-legend-item"
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
                  data-section="chart-line-ehlers-supersmoother-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-ehlers-supersmoother-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-ehlers-supersmoother-legend-stats"
            style={{ color: axisColor }}
          >
            {`above ${run.aboveCount} / at ${run.atCount} / below ${run.belowCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineEhlersSupersmoother.displayName = 'ChartLineEhlersSupersmoother';
