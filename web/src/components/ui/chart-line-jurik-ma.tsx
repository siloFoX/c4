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
 * ChartLineJurikMa -- pure-SVG single-panel chart with a Jurik
 * moving-average overlay (simplified open-source formulation).
 *
 * The JMA cascades three coupled recurrences with an adaptive
 * lag-reduction parameterisation:
 *
 *   beta        = 0.45 * (length - 1) / (0.45 * (length - 1) + 2)
 *   alpha       = beta ^ power
 *   phaseRatio  = phase / 100 + 1.5
 *
 *   e0[i] = (1 - alpha) * close[i] + alpha * e0[i - 1]
 *   e1[i] = (close[i] - e0[i]) * (1 - beta) + beta * e1[i - 1]
 *   e2[i] = (e0[i] + phaseRatio * e1[i] - jma[i - 1])
 *           * (1 - alpha)^2 + alpha^2 * e2[i - 1]
 *   jma[i] = jma[i - 1] + e2[i]
 *
 * Seeds: `e0[0] = close[0]`, `e1[0] = 0`, `e2[0] = 0`, `jma[0]
 * = close[0]`. With those seeds, a constant close passes
 * through unchanged at every bar (stationary fixed point).
 *
 * Bit-exact anchor on integer fixtures:
 *
 *   * `CONST_FLAT (close == K)` -> `e0[i] = (1 - alpha) * K +
 *     alpha * K = K`, so `e1[i] = (K - K) * (1 - beta) + 0 =
 *     0`, `e2[i] = (K + 0 - K) * (1 - alpha)^2 + 0 = 0`, and
 *     `jma[i] = jma[i - 1] + 0 = K`. So `jma = K` bit-exact at
 *     every bar, for any `(length, phase, power)` triple.
 *
 * The chart shares one panel: the close line plus the JMA line.
 */

export interface ChartLineJurikMaPoint {
  x: number;
  close: number;
}

export type ChartLineJurikMaZone = 'above' | 'at' | 'below' | 'none';

export type ChartLineJurikMaSeriesId = 'price' | 'jma';

export interface ChartLineJurikMaSample {
  index: number;
  x: number;
  close: number;
  jma: number | null;
  zone: ChartLineJurikMaZone;
}

export interface ChartLineJurikMaRun {
  series: ChartLineJurikMaPoint[];
  length: number;
  phase: number;
  power: number;
  jma: Array<number | null>;
  samples: ChartLineJurikMaSample[];
  jmaFinal: number | null;
  aboveCount: number;
  atCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineJurikMaMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  jma: number;
  zone: ChartLineJurikMaZone;
}

export interface ChartLineJurikMaDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineJurikMaLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineJurikMaDot[];
  jmaPath: string;
  markers: ChartLineJurikMaMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineJurikMaRun;
}

export interface ChartLineJurikMaProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineJurikMaPoint[];
  length?: number;
  phase?: number;
  power?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  jmaColor?: string;
  aboveColor?: string;
  belowColor?: string;
  atColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showJma?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineJurikMaSeriesId[];
  defaultHiddenSeries?: ChartLineJurikMaSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineJurikMaSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineJurikMaSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_JURIK_MA_WIDTH = 720;
export const DEFAULT_CHART_LINE_JURIK_MA_HEIGHT = 380;
export const DEFAULT_CHART_LINE_JURIK_MA_PADDING = 44;
export const DEFAULT_CHART_LINE_JURIK_MA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_JURIK_MA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_JURIK_MA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_JURIK_MA_LENGTH = 14;
export const DEFAULT_CHART_LINE_JURIK_MA_PHASE = 0;
export const DEFAULT_CHART_LINE_JURIK_MA_POWER = 2;
export const DEFAULT_CHART_LINE_JURIK_MA_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_JURIK_MA_JMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_JURIK_MA_ABOVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_JURIK_MA_BELOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_JURIK_MA_AT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_JURIK_MA_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_JURIK_MA_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_JURIK_MA_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineJurikMaFinitePoints(
  data: readonly ChartLineJurikMaPoint[] | null | undefined,
): ChartLineJurikMaPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineJurikMaPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce the length to an integer of at least 2. */
export function normalizeLineJurikMaLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce the phase parameter to a finite in `[-100, 100]`. */
export function normalizeLineJurikMaPhase(
  phase: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(phase) && phase >= -100 && phase <= 100) return phase;
  return fallback;
}

/** Coerce the power parameter to a finite in `[1, 4]`. */
export function normalizeLineJurikMaPower(
  power: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(power) && power >= 1 && power <= 4) return power;
  return fallback;
}

/**
 * Compute the Jurik MA per bar. Returns a `jma` array same
 * length as `closes`. Non-finite closes propagate by halting
 * the recurrence -- the bar is null and subsequent bars resume
 * from the next finite close (treated as a fresh seed).
 */
export function computeLineJurikMa(
  closes: readonly number[] | null | undefined,
  length: unknown,
  phase: unknown,
  power: unknown,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const len = normalizeLineJurikMaLength(
    length,
    DEFAULT_CHART_LINE_JURIK_MA_LENGTH,
  );
  const ph = normalizeLineJurikMaPhase(phase, DEFAULT_CHART_LINE_JURIK_MA_PHASE);
  const pw = normalizeLineJurikMaPower(power, DEFAULT_CHART_LINE_JURIK_MA_POWER);
  const beta = (0.45 * (len - 1)) / (0.45 * (len - 1) + 2);
  const alpha = Math.pow(beta, pw);
  const phaseRatio = ph / 100 + 1.5;
  const oneMinusAlpha = 1 - alpha;
  const oneMinusAlphaSq = oneMinusAlpha * oneMinusAlpha;
  const alphaSq = alpha * alpha;
  const oneMinusBeta = 1 - beta;
  const out: Array<number | null> = [];
  let e0: number | null = null;
  let e1 = 0;
  let e2 = 0;
  let prevJma: number | null = null;
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i];
    if (!isFiniteNumber(c)) {
      out.push(null);
      // Halt the recurrence -- next finite close seeds a fresh
      // chain.
      e0 = null;
      e1 = 0;
      e2 = 0;
      prevJma = null;
      continue;
    }
    if (e0 === null || prevJma === null) {
      // Seed.
      e0 = c;
      e1 = 0;
      e2 = 0;
      prevJma = c;
      out.push(c);
      continue;
    }
    e0 = oneMinusAlpha * c + alpha * e0;
    e1 = (c - e0) * oneMinusBeta + beta * e1;
    e2 = (e0 + phaseRatio * e1 - prevJma) * oneMinusAlphaSq + alphaSq * e2;
    prevJma = prevJma + e2;
    out.push(prevJma);
  }
  return out;
}

/** Classify a close against the JMA line. */
export function classifyLineJurikMaZone(
  close: number | null,
  jma: number | null,
): ChartLineJurikMaZone {
  if (!isFiniteNumber(close) || !isFiniteNumber(jma)) return 'none';
  if (close > jma) return 'above';
  if (close < jma) return 'below';
  return 'at';
}

export interface ChartLineJurikMaOptions {
  length?: number;
  phase?: number;
  power?: number;
}

/** Run the full JMA pipeline plus sample classification. */
export function runLineJurikMa(
  data: readonly ChartLineJurikMaPoint[] | null | undefined,
  options: ChartLineJurikMaOptions = {},
): ChartLineJurikMaRun {
  const series = getLineJurikMaFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineJurikMaLength(
    options.length,
    DEFAULT_CHART_LINE_JURIK_MA_LENGTH,
  );
  const phase = normalizeLineJurikMaPhase(
    options.phase,
    DEFAULT_CHART_LINE_JURIK_MA_PHASE,
  );
  const power = normalizeLineJurikMaPower(
    options.power,
    DEFAULT_CHART_LINE_JURIK_MA_POWER,
  );
  const closes = series.map((p) => p.close);
  const jma = computeLineJurikMa(closes, length, phase, power);
  const samples: ChartLineJurikMaSample[] = series.map((point, index) => {
    const value = jma[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      jma: value,
      zone: classifyLineJurikMaZone(point.close, value),
    };
  });
  let aboveCount = 0;
  let atCount = 0;
  let belowCount = 0;
  let jmaFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'at') atCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    if (isFiniteNumber(sample.jma)) jmaFinal = sample.jma;
  }
  return {
    series,
    length,
    phase,
    power,
    jma,
    samples,
    jmaFinal,
    aboveCount,
    atCount,
    belowCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineJurikMaLayoutOptions extends ChartLineJurikMaOptions {
  data: readonly ChartLineJurikMaPoint[] | null | undefined;
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
export function computeLineJurikMaLayout(
  options: ChartLineJurikMaLayoutOptions,
): ChartLineJurikMaLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_JURIK_MA_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_JURIK_MA_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_JURIK_MA_PADDING;

  const run = runLineJurikMa(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.phase !== undefined ? { phase: options.phase } : {}),
    ...(options.power !== undefined ? { power: options.power } : {}),
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
    if (isFiniteNumber(sample.jma)) {
      if (sample.jma < valueMin) valueMin = sample.jma;
      if (sample.jma > valueMax) valueMax = sample.jma;
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
  const priceDots: ChartLineJurikMaDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const jmaLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineJurikMaMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.jma)) return;
    const cx = xAt(index);
    jmaLinePoints.push({ x: cx, y: yAt(sample.jma) });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yAt(sample.close),
      close: sample.close,
      jma: sample.jma,
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
    jmaPath: buildLinePath(jmaLinePoints),
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineJurikMaChart(
  data: readonly ChartLineJurikMaPoint[] | null | undefined,
  options: ChartLineJurikMaOptions = {},
): string {
  const run = runLineJurikMa(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.jmaFinal === null ? 'n/a' : run.jmaFinal.toFixed(4);
  return (
    `Single-panel chart with a Jurik moving-average overlay ` +
    `(length ${run.length}, phase ${run.phase}, power ` +
    `${run.power}): the close line is plotted with the JMA, ` +
    `which cascades three coupled recurrences with an adaptive ` +
    `lag-reduction parameterisation (beta + alpha + phaseRatio). ` +
    `A constant close passes through the JMA unchanged at every ` +
    `bar (stationary fixed point). Across ${total} bars the ` +
    `close sits above the JMA on ${run.aboveCount}, below on ` +
    `${run.belowCount}, and exactly at the JMA on ${run.atCount}. ` +
    `The final JMA reading is ${finalText}.`
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
  zone: ChartLineJurikMaZone,
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

function zoneLabelOf(zone: ChartLineJurikMaZone): string {
  if (zone === 'above') return 'Above JMA';
  if (zone === 'below') return 'Below JMA';
  if (zone === 'at') return 'At JMA';
  return 'n/a';
}

/**
 * ChartLineJurikMa -- single-panel pure-SVG Jurik moving-average
 * chart.
 */
export const ChartLineJurikMa = forwardRef<
  HTMLDivElement,
  ChartLineJurikMaProps
>(function ChartLineJurikMa(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_JURIK_MA_LENGTH,
    phase = DEFAULT_CHART_LINE_JURIK_MA_PHASE,
    power = DEFAULT_CHART_LINE_JURIK_MA_POWER,
    width = DEFAULT_CHART_LINE_JURIK_MA_WIDTH,
    height = DEFAULT_CHART_LINE_JURIK_MA_HEIGHT,
    padding = DEFAULT_CHART_LINE_JURIK_MA_PADDING,
    tickCount = DEFAULT_CHART_LINE_JURIK_MA_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_JURIK_MA_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_JURIK_MA_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_JURIK_MA_PRICE_COLOR,
    jmaColor = DEFAULT_CHART_LINE_JURIK_MA_JMA_COLOR,
    aboveColor = DEFAULT_CHART_LINE_JURIK_MA_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_JURIK_MA_BELOW_COLOR,
    atColor = DEFAULT_CHART_LINE_JURIK_MA_AT_COLOR,
    noneColor = DEFAULT_CHART_LINE_JURIK_MA_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_JURIK_MA_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_JURIK_MA_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showJma = true,
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
  const baseId = `chart-line-jurik-ma-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineJurikMaSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineJurikMaSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineJurikMaLayout({
        data,
        length,
        phase,
        power,
        width,
        height,
        padding,
      }),
    [data, length, phase, power, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineJurikMaChart(data, { length, phase, power });
  const resolvedLabel =
    ariaLabel ??
    `Jurik MA chart, length ${run.length}, phase ${run.phase}, power ${run.power}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineJurikMaSeriesId): void => {
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
      <g data-section="chart-line-jurik-ma-tooltip" pointerEvents="none">
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
          data-section="chart-line-jurik-ma-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-jurik-ma-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-jurik-ma-tooltip-jma"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`JMA: ${
            hoverSample.jma === null ? 'n/a' : hoverSample.jma.toFixed(4)
          }`}
        </text>
        <text
          data-section="chart-line-jurik-ma-tooltip-zone"
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
  const jmaHidden = isHidden('jma') || !showJma;

  const legendItems: Array<{
    id: ChartLineJurikMaSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'jma', label: 'JMA', color: jmaColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-jurik-ma"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-phase={run.phase}
      data-power={run.power}
      data-jma-final={run.jmaFinal === null ? '' : run.jmaFinal}
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
        data-section="chart-line-jurik-ma-aria-desc"
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
          data-section="chart-line-jurik-ma-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-jurik-ma-empty"
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
          data-section="chart-line-jurik-ma-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-jurik-ma-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-jurik-ma-grid-line"
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
            <g data-section="chart-line-jurik-ma-axes">
              <line
                data-section="chart-line-jurik-ma-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-jurik-ma-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-jurik-ma-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-jurik-ma-tick-label"
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
              data-section="chart-line-jurik-ma-price-path"
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
            <g data-section="chart-line-jurik-ma-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-jurik-ma-dot"
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

          {!jmaHidden ? (
            <path
              data-section="chart-line-jurik-ma-line"
              d={layout.jmaPath}
              fill="none"
              stroke={jmaColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`JMA line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-jurik-ma-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-jurik-ma-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-jma={marker.jma}
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
                  )}, JMA ${formatValue(marker.jma)}, ${zoneLabelOf(
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
            <g data-section="chart-line-jurik-ma-badge">
              <rect
                data-section="chart-line-jurik-ma-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={140}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-jurik-ma-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`JMA ${run.length}/${run.phase}/${run.power}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-jurik-ma-legend"
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
                data-section="chart-line-jurik-ma-legend-item"
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
                  data-section="chart-line-jurik-ma-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-jurik-ma-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-jurik-ma-legend-stats"
            style={{ color: axisColor }}
          >
            {`above ${run.aboveCount} / at ${run.atCount} / below ${run.belowCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineJurikMa.displayName = 'ChartLineJurikMa';
