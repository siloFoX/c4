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
 * ChartLineChaikinMf -- pure-SVG dual-panel chart with a Chaikin
 * Money Flow oscillator panel beneath the close.
 *
 * Definition (Marc Chaikin):
 *
 *   MFM[i] = ((close - low) - (high - close)) / (high - low)
 *          = (2 * close - high - low) / (high - low)
 *   MFV[i] = MFM[i] * volume[i]
 *   CMF[i] = sum(MFV[i - n + 1..i]) / sum(volume[i - n + 1..i])
 *
 * `n` is the lookback (default 20). When `high == low` the Money
 * Flow Multiplier is undefined and treated as zero (the bar
 * contributes no money flow). Bars before the lookback window
 * are nulled (warmup). When `sum(volume) == 0` over the window
 * the result is `null` (singular).
 *
 * Bit-exact anchors on integer / dyadic fixtures:
 *
 *   * **Close at high (close = high, high > low)** with constant
 *     positive volume: MFM = 1 at every bar -> MFV = volume,
 *     so `CMF = sum(volume) / sum(volume) = 1` bit-exact.
 *   * **Close at low (close = low, high > low)** with constant
 *     positive volume: MFM = -1 -> MFV = -volume,
 *     `CMF = -sum(volume) / sum(volume) = -1` bit-exact.
 *   * **Close at midpoint (close = (high + low) / 2)**: MFM = 0
 *     -> MFV = 0, `CMF = 0 / sum(volume) = 0` bit-exact.
 *   * **Flat bar (high == low)**: MFM is treated as 0 -> CMF
 *     contributes zero numerator while still adding volume to
 *     the denominator; for an all-flat window with non-zero
 *     volume, `CMF = 0 / sum(volume) = 0` bit-exact.
 *   * **ZERO_VOLUME window**: denominator = 0 -> `null`.
 *
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots the CMF with a zero
 * baseline.
 */

export interface ChartLineChaikinMfPoint {
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartLineChaikinMfZone =
  | 'positive'
  | 'flat'
  | 'negative'
  | 'none';

export type ChartLineChaikinMfSeriesId = 'price' | 'cmf';

export interface ChartLineChaikinMfSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  mfm: number;
  cmf: number | null;
  zone: ChartLineChaikinMfZone;
}

export interface ChartLineChaikinMfRun {
  series: ChartLineChaikinMfPoint[];
  length: number;
  cmf: Array<number | null>;
  samples: ChartLineChaikinMfSample[];
  cmfFinal: number | null;
  positiveCount: number;
  flatCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineChaikinMfMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  cmf: number;
  zone: ChartLineChaikinMfZone;
}

export interface ChartLineChaikinMfDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineChaikinMfLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  cmfTop: number;
  cmfBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineChaikinMfDot[];
  cmfPath: string;
  markers: ChartLineChaikinMfMarker[];
  priceMin: number;
  priceMax: number;
  cmfMin: number;
  cmfMax: number;
  zeroLineY: number;
  run: ChartLineChaikinMfRun;
}

export interface ChartLineChaikinMfProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineChaikinMfPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  cmfColor?: string;
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
  showCmf?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZeroLine?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineChaikinMfSeriesId[];
  defaultHiddenSeries?: ChartLineChaikinMfSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineChaikinMfSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineChaikinMfSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatCmf?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_CHAIKIN_MF_WIDTH = 720;
export const DEFAULT_CHART_LINE_CHAIKIN_MF_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CHAIKIN_MF_PADDING = 44;
export const DEFAULT_CHART_LINE_CHAIKIN_MF_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CHAIKIN_MF_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CHAIKIN_MF_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CHAIKIN_MF_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CHAIKIN_MF_LENGTH = 20;
export const DEFAULT_CHART_LINE_CHAIKIN_MF_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CHAIKIN_MF_CMF_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CHAIKIN_MF_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CHAIKIN_MF_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CHAIKIN_MF_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_CHAIKIN_MF_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CHAIKIN_MF_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CHAIKIN_MF_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CHAIKIN_MF_ZERO_LINE_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC and volume. */
export function getLineChaikinMfFinitePoints(
  data: readonly ChartLineChaikinMfPoint[] | null | undefined,
): ChartLineChaikinMfPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineChaikinMfPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume)
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: point.volume,
      });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineChaikinMfLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Compute the Money Flow Multiplier for one bar. */
export function computeLineChaikinMfMultiplier(
  high: number,
  low: number,
  close: number,
): number {
  const range = high - low;
  if (range === 0) return 0;
  return ((close - low) - (high - close)) / range;
}

/**
 * Compute the Chaikin Money Flow per bar. Bars before
 * `i = length - 1` are `null` (warmup). When the volume sum
 * over the window is zero the bar is `null` (singular). When a
 * bar's high == low, the MFM is treated as zero (the bar
 * contributes no money flow but still counts in the volume
 * denominator).
 */
export function computeLineChaikinMf(
  bars: ReadonlyArray<{ high: number; low: number; close: number; volume: number }> | null | undefined,
  length: unknown,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const L = normalizeLineChaikinMfLength(
    length,
    DEFAULT_CHART_LINE_CHAIKIN_MF_LENGTH,
  );
  const out: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < L - 1) {
      out.push(null);
      continue;
    }
    let numer = 0;
    let denom = 0;
    let ok = true;
    for (let j = 0; j < L; j += 1) {
      const bar = bars[i - j];
      if (
        !bar ||
        !isFiniteNumber(bar.high) ||
        !isFiniteNumber(bar.low) ||
        !isFiniteNumber(bar.close) ||
        !isFiniteNumber(bar.volume)
      ) {
        ok = false;
        break;
      }
      const mfm = computeLineChaikinMfMultiplier(
        bar.high,
        bar.low,
        bar.close,
      );
      numer += mfm * bar.volume;
      denom += bar.volume;
    }
    if (!ok || denom === 0) {
      out.push(null);
      continue;
    }
    out.push(numer / denom);
  }
  return out;
}

/** Classify a CMF reading. */
export function classifyLineChaikinMfZone(
  value: number | null,
): ChartLineChaikinMfZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'flat';
}

export interface ChartLineChaikinMfOptions {
  length?: number;
}

/** Run the full CMF pipeline plus sample classification. */
export function runLineChaikinMf(
  data: readonly ChartLineChaikinMfPoint[] | null | undefined,
  options: ChartLineChaikinMfOptions = {},
): ChartLineChaikinMfRun {
  const series = getLineChaikinMfFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineChaikinMfLength(
    options.length,
    DEFAULT_CHART_LINE_CHAIKIN_MF_LENGTH,
  );
  const cmf = computeLineChaikinMf(series, length);
  const samples: ChartLineChaikinMfSample[] = series.map((point, index) => {
    const value = cmf[index] ?? null;
    const mfm = computeLineChaikinMfMultiplier(
      point.high,
      point.low,
      point.close,
    );
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
      mfm,
      cmf: value,
      zone: classifyLineChaikinMfZone(value),
    };
  });
  let positiveCount = 0;
  let flatCount = 0;
  let negativeCount = 0;
  let cmfFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.cmf)) cmfFinal = sample.cmf;
  }
  return {
    series,
    length,
    cmf,
    samples,
    cmfFinal,
    positiveCount,
    flatCount,
    negativeCount,
    ok: series.length >= length,
  };
}

export interface ChartLineChaikinMfLayoutOptions
  extends ChartLineChaikinMfOptions {
  data: readonly ChartLineChaikinMfPoint[] | null | undefined;
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
export function computeLineChaikinMfLayout(
  options: ChartLineChaikinMfLayoutOptions,
): ChartLineChaikinMfLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_CHAIKIN_MF_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_CHAIKIN_MF_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_CHAIKIN_MF_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_CHAIKIN_MF_PANEL_GAP;

  const run = runLineChaikinMf(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const cmfHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const cmfTop = priceBottom + panelGap;
  const cmfBottom = cmfTop + cmfHeight;

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

  let cmfMin = Infinity;
  let cmfMax = -Infinity;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.cmf)) {
      if (sample.cmf < cmfMin) cmfMin = sample.cmf;
      if (sample.cmf > cmfMax) cmfMax = sample.cmf;
    }
  }
  if (!Number.isFinite(cmfMin) || !Number.isFinite(cmfMax)) {
    cmfMin = -1;
    cmfMax = 1;
  }
  if (cmfMin === cmfMax) {
    cmfMin -= 1;
    cmfMax += 1;
  }
  // CMF is bounded in [-1, +1]; pad slightly so the line never
  // hugs the panel edge.
  if (cmfMin > 0) cmfMin = 0;
  if (cmfMax < 0) cmfMax = 0;
  const cmfY = (value: number): number =>
    cmfBottom - ((value - cmfMin) / (cmfMax - cmfMin)) * cmfHeight;
  const zeroLineY = cmfY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineChaikinMfDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const cmfLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineChaikinMfMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.cmf)) return;
    const cx = xAt(index);
    const yc = cmfY(sample.cmf);
    cmfLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      cmf: sample.cmf,
      zone: sample.zone,
    });
  });

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    cmfTop,
    cmfBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    cmfPath: buildLinePath(cmfLinePoints),
    markers,
    priceMin,
    priceMax,
    cmfMin,
    cmfMax,
    zeroLineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineChaikinMfChart(
  data: readonly ChartLineChaikinMfPoint[] | null | undefined,
  options: ChartLineChaikinMfOptions = {},
): string {
  const run = runLineChaikinMf(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.cmfFinal === null ? 'n/a' : run.cmfFinal.toFixed(4);
  return (
    `Dual-panel chart with a Chaikin Money Flow oscillator panel ` +
    `beneath the close (length ${run.length}). The CMF is the ` +
    `sum of money flow volume divided by the sum of volume across ` +
    `the lookback window. Money flow volume uses MFM = ((close - ` +
    `low) - (high - close)) / (high - low) so a close at the high ` +
    `is +1, at the low is -1, and at the midpoint is 0. Across ` +
    `${total} bars the CMF is positive on ${run.positiveCount}, ` +
    `flat on ${run.flatCount}, and negative on ${run.negativeCount}. ` +
    `The final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatCmf(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineChaikinMfZone,
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

function zoneLabelOf(zone: ChartLineChaikinMfZone): string {
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineChaikinMf -- dual-panel pure-SVG Chaikin Money Flow
 * chart.
 */
export const ChartLineChaikinMf = forwardRef<
  HTMLDivElement,
  ChartLineChaikinMfProps
>(function ChartLineChaikinMf(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_CHAIKIN_MF_LENGTH,
    width = DEFAULT_CHART_LINE_CHAIKIN_MF_WIDTH,
    height = DEFAULT_CHART_LINE_CHAIKIN_MF_HEIGHT,
    padding = DEFAULT_CHART_LINE_CHAIKIN_MF_PADDING,
    panelGap = DEFAULT_CHART_LINE_CHAIKIN_MF_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CHAIKIN_MF_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CHAIKIN_MF_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CHAIKIN_MF_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CHAIKIN_MF_PRICE_COLOR,
    cmfColor = DEFAULT_CHART_LINE_CHAIKIN_MF_CMF_COLOR,
    positiveColor = DEFAULT_CHART_LINE_CHAIKIN_MF_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_CHAIKIN_MF_NEGATIVE_COLOR,
    flatColor = DEFAULT_CHART_LINE_CHAIKIN_MF_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_CHAIKIN_MF_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_CHAIKIN_MF_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CHAIKIN_MF_GRID_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_CHAIKIN_MF_ZERO_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCmf = true,
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
    formatCmf = defaultFormatCmf,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-chaikin-mf-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineChaikinMfSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineChaikinMfSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineChaikinMfLayout({
        data,
        length,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, length, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineChaikinMfChart(data, { length });
  const resolvedLabel =
    ariaLabel ?? `Chaikin Money Flow chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineChaikinMfSeriesId): void => {
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
        data-section="chart-line-chaikin-mf-tooltip"
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
          data-section="chart-line-chaikin-mf-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-chaikin-mf-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-chaikin-mf-tooltip-mfm"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`MFM: ${hoverSample.mfm.toFixed(4)}`}
        </text>
        <text
          data-section="chart-line-chaikin-mf-tooltip-cmf"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`CMF: ${
            hoverSample.cmf === null ? 'n/a' : formatCmf(hoverSample.cmf)
          }`}
        </text>
        <text
          data-section="chart-line-chaikin-mf-tooltip-zone"
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
  const cmfHidden = isHidden('cmf') || !showCmf;

  const legendItems: Array<{
    id: ChartLineChaikinMfSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'cmf', label: 'Chaikin Money Flow', color: cmfColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-chaikin-mf"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-cmf-final={run.cmfFinal === null ? '' : run.cmfFinal}
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
        data-section="chart-line-chaikin-mf-aria-desc"
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
          data-section="chart-line-chaikin-mf-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-chaikin-mf-empty"
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
          data-section="chart-line-chaikin-mf-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-chaikin-mf-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yc =
                  layout.cmfBottom -
                  t * (layout.cmfBottom - layout.cmfTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-chaikin-mf-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-chaikin-mf-grid-line"
                      data-panel="cmf"
                      x1={layout.innerLeft}
                      y1={yc}
                      x2={layout.innerRight}
                      y2={yc}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-chaikin-mf-axes">
              <line
                data-section="chart-line-chaikin-mf-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-chaikin-mf-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-chaikin-mf-axis"
                data-panel="cmf"
                x1={layout.innerLeft}
                y1={layout.cmfTop}
                x2={layout.innerLeft}
                y2={layout.cmfBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-chaikin-mf-axis"
                data-panel="cmf"
                x1={layout.innerLeft}
                y1={layout.cmfBottom}
                x2={layout.innerRight}
                y2={layout.cmfBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-chaikin-mf-tick-label"
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
                data-section="chart-line-chaikin-mf-tick-label"
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
                data-section="chart-line-chaikin-mf-tick-label"
                data-panel="cmf"
                x={layout.innerLeft - 6}
                y={layout.cmfTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatCmf(layout.cmfMax)}
              </text>
              <text
                data-section="chart-line-chaikin-mf-tick-label"
                data-panel="cmf"
                x={layout.innerLeft - 6}
                y={layout.cmfBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatCmf(layout.cmfMin)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-chaikin-mf-zero-line"
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
              data-section="chart-line-chaikin-mf-price-path"
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
            <g data-section="chart-line-chaikin-mf-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-chaikin-mf-dot"
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

          {!cmfHidden ? (
            <path
              data-section="chart-line-chaikin-mf-line"
              d={layout.cmfPath}
              fill="none"
              stroke={cmfColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Chaikin Money Flow line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-chaikin-mf-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-chaikin-mf-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-cmf={marker.cmf}
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
                  )}, CMF ${formatCmf(marker.cmf)}, ${zoneLabelOf(
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
            <g data-section="chart-line-chaikin-mf-badge">
              <rect
                data-section="chart-line-chaikin-mf-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={140}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-chaikin-mf-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Chaikin MF ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-chaikin-mf-legend"
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
                data-section="chart-line-chaikin-mf-legend-item"
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
                  data-section="chart-line-chaikin-mf-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-chaikin-mf-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-chaikin-mf-legend-stats"
            style={{ color: axisColor }}
          >
            {`positive ${run.positiveCount} / flat ${run.flatCount} / negative ${run.negativeCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineChaikinMf.displayName = 'ChartLineChaikinMf';
