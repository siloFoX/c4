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
 * ChartLineTilsonMa -- pure-SVG single-panel chart with a
 * Tillson T3 moving-average overlay.
 *
 * The T3 cascades six EMAs of the close and recombines the last
 * four with volume-factor-weighted coefficients:
 *
 *   EMA1 = EMA(close, period)
 *   EMA2 = EMA(EMA1, period)
 *   EMA3 = EMA(EMA2, period)
 *   EMA4 = EMA(EMA3, period)
 *   EMA5 = EMA(EMA4, period)
 *   EMA6 = EMA(EMA5, period)
 *
 *   c1 = -a^3
 *   c2 =  3 * a^2 + 3 * a^3
 *   c3 = -3 * a   - 6 * a^2 - 3 * a^3
 *   c4 =  1 + 3 * a + 3 * a^2 + a^3
 *
 *   T3 = c1 * EMA6 + c2 * EMA5 + c3 * EMA4 + c4 * EMA3
 *
 * The coefficients sum to `1` exactly (algebraic identity), so a
 * constant close passes through unchanged when the sum is
 * computed without rounding loss. EMAs seed at the first finite
 * input (`EMA[0] = input[0]`) and use `alpha = 2 / (length + 1)`.
 *
 * Two bit-exact anchors hold on integer fixtures:
 *
 *   * `CONST_FLAT (close == K)` with `a = 0` -> coefficients
 *     reduce to `c1 = c2 = c3 = 0`, `c4 = 1`, so `T3 = EMA3 =
 *     K` bit-exact at every defined bar (EMA-of-constant lemma
 *     applied three times).
 *   * `CONST_FLAT (close == K)` with `a = 1` -> integer
 *     coefficients `c1 = -1, c2 = 6, c3 = -12, c4 = 8` sum to
 *     exactly `1` in floating point. `EMA3 = EMA4 = EMA5 =
 *     EMA6 = K`, so `T3 = -K + 6K - 12K + 8K = K` bit-exact.
 *
 * The chart shares one panel: the close line plus the T3 line.
 */

export interface ChartLineTilsonMaPoint {
  x: number;
  close: number;
}

export type ChartLineTilsonMaZone = 'above' | 'at' | 'below' | 'none';

export type ChartLineTilsonMaSeriesId = 'price' | 't3';

export interface ChartLineTilsonMaSample {
  index: number;
  x: number;
  close: number;
  t3: number | null;
  zone: ChartLineTilsonMaZone;
}

export interface ChartLineTilsonMaRun {
  series: ChartLineTilsonMaPoint[];
  period: number;
  volumeFactor: number;
  t3: Array<number | null>;
  samples: ChartLineTilsonMaSample[];
  t3Final: number | null;
  aboveCount: number;
  atCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineTilsonMaMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  t3: number;
  zone: ChartLineTilsonMaZone;
}

export interface ChartLineTilsonMaDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTilsonMaLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineTilsonMaDot[];
  t3Path: string;
  markers: ChartLineTilsonMaMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineTilsonMaRun;
}

export interface ChartLineTilsonMaProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTilsonMaPoint[];
  period?: number;
  volumeFactor?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  t3Color?: string;
  aboveColor?: string;
  belowColor?: string;
  atColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showT3?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTilsonMaSeriesId[];
  defaultHiddenSeries?: ChartLineTilsonMaSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTilsonMaSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineTilsonMaSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_TILSON_MA_WIDTH = 720;
export const DEFAULT_CHART_LINE_TILSON_MA_HEIGHT = 380;
export const DEFAULT_CHART_LINE_TILSON_MA_PADDING = 44;
export const DEFAULT_CHART_LINE_TILSON_MA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TILSON_MA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TILSON_MA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TILSON_MA_PERIOD = 8;
export const DEFAULT_CHART_LINE_TILSON_MA_VOLUME_FACTOR = 0.7;
export const DEFAULT_CHART_LINE_TILSON_MA_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TILSON_MA_T3_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TILSON_MA_ABOVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TILSON_MA_BELOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TILSON_MA_AT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_TILSON_MA_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_TILSON_MA_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TILSON_MA_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineTilsonMaFinitePoints(
  data: readonly ChartLineTilsonMaPoint[] | null | undefined,
): ChartLineTilsonMaPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTilsonMaPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce the lookback period to an integer of at least 2. */
export function normalizeLineTilsonMaPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** Coerce the volume factor to a finite in `[0, 1]`. */
export function normalizeLineTilsonMaVolumeFactor(
  factor: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(factor) && factor >= 0 && factor <= 1) return factor;
  return fallback;
}

/**
 * EMA over a nullable series. The first finite value seeds the
 * EMA; subsequent values use `alpha = 2 / (length + 1)`.
 */
export function computeLineTilsonMaEma(
  values: ReadonlyArray<number | null> | null | undefined,
  length: unknown,
): Array<number | null> {
  if (!Array.isArray(values)) return [];
  const n = normalizeLineTilsonMaPeriod(length, 2);
  const alpha = 2 / (n + 1);
  const out: Array<number | null> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!isFiniteNumber(v)) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      prev = v;
    } else {
      prev = prev + alpha * (v - prev);
    }
    out.push(prev);
  }
  return out;
}

/**
 * Compute the four Tillson T3 coefficients from the volume
 * factor. The coefficients sum to `1` exactly (algebraic
 * identity), so a constant input passes through unchanged when
 * the EMAs collapse to the constant.
 */
export function computeLineTilsonMaCoefficients(
  volumeFactor: number,
): {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
} {
  const a = volumeFactor;
  const a2 = a * a;
  const a3 = a2 * a;
  return {
    c1: -a3,
    c2: 3 * a2 + 3 * a3,
    c3: -3 * a - 6 * a2 - 3 * a3,
    c4: 1 + 3 * a + 3 * a2 + a3,
  };
}

/**
 * Run the full Tillson T3 pipeline. Returns a `t3` array same
 * length as `closes`.
 */
export function computeLineTilsonMa(
  closes: readonly number[] | null | undefined,
  period: unknown,
  volumeFactor: unknown,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const p = normalizeLineTilsonMaPeriod(
    period,
    DEFAULT_CHART_LINE_TILSON_MA_PERIOD,
  );
  const a = normalizeLineTilsonMaVolumeFactor(
    volumeFactor,
    DEFAULT_CHART_LINE_TILSON_MA_VOLUME_FACTOR,
  );
  const closeNullable: Array<number | null> = closes.map((c) =>
    isFiniteNumber(c) ? c : null,
  );
  const ema1 = computeLineTilsonMaEma(closeNullable, p);
  const ema2 = computeLineTilsonMaEma(ema1, p);
  const ema3 = computeLineTilsonMaEma(ema2, p);
  const ema4 = computeLineTilsonMaEma(ema3, p);
  const ema5 = computeLineTilsonMaEma(ema4, p);
  const ema6 = computeLineTilsonMaEma(ema5, p);
  const { c1, c2, c3, c4 } = computeLineTilsonMaCoefficients(a);
  const t3: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    const e3 = ema3[i];
    const e4 = ema4[i];
    const e5 = ema5[i];
    const e6 = ema6[i];
    if (
      !isFiniteNumber(e3) ||
      !isFiniteNumber(e4) ||
      !isFiniteNumber(e5) ||
      !isFiniteNumber(e6)
    ) {
      t3.push(null);
      continue;
    }
    t3.push(c1 * e6 + c2 * e5 + c3 * e4 + c4 * e3);
  }
  return t3;
}

/** Classify a close against the T3 line. */
export function classifyLineTilsonMaZone(
  close: number | null,
  t3: number | null,
): ChartLineTilsonMaZone {
  if (!isFiniteNumber(close) || !isFiniteNumber(t3)) return 'none';
  if (close > t3) return 'above';
  if (close < t3) return 'below';
  return 'at';
}

export interface ChartLineTilsonMaOptions {
  period?: number;
  volumeFactor?: number;
}

/** Run the full T3 pipeline plus sample classification. */
export function runLineTilsonMa(
  data: readonly ChartLineTilsonMaPoint[] | null | undefined,
  options: ChartLineTilsonMaOptions = {},
): ChartLineTilsonMaRun {
  const series = getLineTilsonMaFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineTilsonMaPeriod(
    options.period,
    DEFAULT_CHART_LINE_TILSON_MA_PERIOD,
  );
  const volumeFactor = normalizeLineTilsonMaVolumeFactor(
    options.volumeFactor,
    DEFAULT_CHART_LINE_TILSON_MA_VOLUME_FACTOR,
  );
  const closes = series.map((p) => p.close);
  const t3 = computeLineTilsonMa(closes, period, volumeFactor);
  const samples: ChartLineTilsonMaSample[] = series.map((point, index) => {
    const value = t3[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      t3: value,
      zone: classifyLineTilsonMaZone(point.close, value),
    };
  });
  let aboveCount = 0;
  let atCount = 0;
  let belowCount = 0;
  let t3Final: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'at') atCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    if (isFiniteNumber(sample.t3)) t3Final = sample.t3;
  }
  return {
    series = [],
    period,
    volumeFactor,
    t3,
    samples,
    t3Final,
    aboveCount,
    atCount,
    belowCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineTilsonMaLayoutOptions
  extends ChartLineTilsonMaOptions {
  data: readonly ChartLineTilsonMaPoint[] | null | undefined;
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
export function computeLineTilsonMaLayout(
  options: ChartLineTilsonMaLayoutOptions,
): ChartLineTilsonMaLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_TILSON_MA_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_TILSON_MA_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_TILSON_MA_PADDING;

  const run = runLineTilsonMa(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.volumeFactor !== undefined
      ? { volumeFactor: options.volumeFactor }
      : {}),
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
    if (isFiniteNumber(sample.t3)) {
      if (sample.t3 < valueMin) valueMin = sample.t3;
      if (sample.t3 > valueMax) valueMax = sample.t3;
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
  const priceDots: ChartLineTilsonMaDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const t3LinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineTilsonMaMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.t3)) return;
    const cx = xAt(index);
    t3LinePoints.push({ x: cx, y: yAt(sample.t3) });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yAt(sample.close),
      close: sample.close,
      t3: sample.t3,
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
    t3Path: buildLinePath(t3LinePoints),
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineTilsonMaChart(
  data: readonly ChartLineTilsonMaPoint[] | null | undefined,
  options: ChartLineTilsonMaOptions = {},
): string {
  const run = runLineTilsonMa(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.t3Final === null ? 'n/a' : run.t3Final.toFixed(4);
  return (
    `Single-panel chart with a Tillson T3 moving-average overlay ` +
    `(period ${run.period}, volume factor ${run.volumeFactor}): ` +
    `the close line is plotted with the T3, which cascades six ` +
    `EMAs of the close and recombines the last four with volume-` +
    `factor weighted coefficients summing to one. A constant ` +
    `close passes through the T3 unchanged. Across ${total} bars ` +
    `the close sits above the T3 on ${run.aboveCount}, below on ` +
    `${run.belowCount}, and exactly at the T3 on ${run.atCount}. ` +
    `The final T3 reading is ${finalText}.`
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
  zone: ChartLineTilsonMaZone,
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

function zoneLabelOf(zone: ChartLineTilsonMaZone): string {
  if (zone === 'above') return 'Above T3';
  if (zone === 'below') return 'Below T3';
  if (zone === 'at') return 'At T3';
  return 'n/a';
}

/**
 * ChartLineTilsonMa -- single-panel pure-SVG Tillson T3 moving
 * average chart.
 */
export const ChartLineTilsonMa = forwardRef<
  HTMLDivElement,
  ChartLineTilsonMaProps
>(function ChartLineTilsonMa(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_TILSON_MA_PERIOD,
    volumeFactor = DEFAULT_CHART_LINE_TILSON_MA_VOLUME_FACTOR,
    width = DEFAULT_CHART_LINE_TILSON_MA_WIDTH,
    height = DEFAULT_CHART_LINE_TILSON_MA_HEIGHT,
    padding = DEFAULT_CHART_LINE_TILSON_MA_PADDING,
    tickCount = DEFAULT_CHART_LINE_TILSON_MA_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TILSON_MA_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TILSON_MA_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TILSON_MA_PRICE_COLOR,
    t3Color = DEFAULT_CHART_LINE_TILSON_MA_T3_COLOR,
    aboveColor = DEFAULT_CHART_LINE_TILSON_MA_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_TILSON_MA_BELOW_COLOR,
    atColor = DEFAULT_CHART_LINE_TILSON_MA_AT_COLOR,
    noneColor = DEFAULT_CHART_LINE_TILSON_MA_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_TILSON_MA_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TILSON_MA_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showT3 = true,
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
  const baseId = `chart-line-tilson-ma-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineTilsonMaSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineTilsonMaSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineTilsonMaLayout({
        data,
        period,
        volumeFactor,
        width,
        height,
        padding,
      }),
    [data, period, volumeFactor, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineTilsonMaChart(data, { period, volumeFactor });
  const resolvedLabel =
    ariaLabel ??
    `Tillson T3 chart, period ${run.period}, volume factor ${run.volumeFactor}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineTilsonMaSeriesId): void => {
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
      <g data-section="chart-line-tilson-ma-tooltip" pointerEvents="none">
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
          data-section="chart-line-tilson-ma-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-tilson-ma-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-tilson-ma-tooltip-t3"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`T3: ${
            hoverSample.t3 === null ? 'n/a' : hoverSample.t3.toFixed(4)
          }`}
        </text>
        <text
          data-section="chart-line-tilson-ma-tooltip-zone"
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
  const t3Hidden = isHidden('t3') || !showT3;

  const legendItems: Array<{
    id: ChartLineTilsonMaSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 't3', label: 'T3', color: t3Color },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-tilson-ma"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-volume-factor={run.volumeFactor}
      data-t3-final={run.t3Final === null ? '' : run.t3Final}
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
        data-section="chart-line-tilson-ma-aria-desc"
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
          data-section="chart-line-tilson-ma-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-tilson-ma-empty"
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
          data-section="chart-line-tilson-ma-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-tilson-ma-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-tilson-ma-grid-line"
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
            <g data-section="chart-line-tilson-ma-axes">
              <line
                data-section="chart-line-tilson-ma-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-tilson-ma-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-tilson-ma-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-tilson-ma-tick-label"
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
              data-section="chart-line-tilson-ma-price-path"
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
            <g data-section="chart-line-tilson-ma-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-tilson-ma-dot"
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

          {!t3Hidden ? (
            <path
              data-section="chart-line-tilson-ma-line"
              d={layout.t3Path}
              fill="none"
              stroke={t3Color}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`T3 line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-tilson-ma-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-tilson-ma-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-t3={marker.t3}
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
                  )}, T3 ${formatValue(marker.t3)}, ${zoneLabelOf(
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
            <g data-section="chart-line-tilson-ma-badge">
              <rect
                data-section="chart-line-tilson-ma-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={120}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-tilson-ma-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`T3 ${run.period} a${run.volumeFactor}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-tilson-ma-legend"
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
                data-section="chart-line-tilson-ma-legend-item"
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
                  data-section="chart-line-tilson-ma-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-tilson-ma-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-tilson-ma-legend-stats"
            style={{ color: axisColor }}
          >
            {`above ${run.aboveCount} / at ${run.atCount} / below ${run.belowCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineTilsonMa.displayName = 'ChartLineTilsonMa';
