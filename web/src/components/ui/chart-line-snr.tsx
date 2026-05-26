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
 * ChartLineSnr -- pure-SVG two-panel Signal to Noise Ratio chart.
 *
 * The Signal to Noise Ratio reads how loud the current bar's range is
 * against the recent "noise floor" of the same range averaged across
 * the lookback. It is the decibel ratio of bar range to its rolling
 * average:
 *
 *   range     = high - low
 *   avgRange  = SMA(range, period)
 *   snr       = 10 * log10(range / avgRange)
 *
 * A bar wider than the recent average reads positive dB (a loud bar
 * relative to the noise floor); a quieter bar reads negative. A
 * constant range across the window reads exactly 0 dB.
 *
 * The top panel plots the bar midpoint; the bottom panel plots the SNR
 * with a zero line and one marker per bar coloured by the sign of the
 * reading.
 */

export interface ChartLineSnrPoint {
  x: number;
  high: number;
  low: number;
}

export type ChartLineSnrZone = 'up' | 'down' | 'flat' | 'none';

export type ChartLineSnrSeriesId = 'price' | 'snr';

export interface ChartLineSnrComputed {
  range: (number | null)[];
  avgRange: (number | null)[];
  snr: (number | null)[];
}

export interface ChartLineSnrSample {
  index: number;
  x: number;
  high: number;
  low: number;
  midpoint: number;
  range: number | null;
  avgRange: number | null;
  snr: number | null;
  zone: ChartLineSnrZone;
}

export interface ChartLineSnrRun {
  series: ChartLineSnrPoint[];
  period: number;
  range: (number | null)[];
  avgRange: (number | null)[];
  snr: (number | null)[];
  samples: ChartLineSnrSample[];
  snrFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineSnrMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  snr: number;
  zone: ChartLineSnrZone;
}

export interface ChartLineSnrDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  midpoint: number;
}

export interface ChartLineSnrLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  snrPanelTop: number;
  snrPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineSnrDot[];
  snrPath: string;
  markers: ChartLineSnrMarker[];
  zeroY: number;
  priceMin: number;
  priceMax: number;
  snrMin: number;
  snrMax: number;
  run: ChartLineSnrRun;
}

export interface ChartLineSnrProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSnrPoint[];
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
  snrColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSnr?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSnrSeriesId[];
  defaultHiddenSeries?: ChartLineSnrSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSnrSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineSnrSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_SNR_WIDTH = 720;
export const DEFAULT_CHART_LINE_SNR_HEIGHT = 400;
export const DEFAULT_CHART_LINE_SNR_PADDING = 44;
export const DEFAULT_CHART_LINE_SNR_GAP = 12;
export const DEFAULT_CHART_LINE_SNR_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SNR_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SNR_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SNR_PERIOD = 14;
export const DEFAULT_CHART_LINE_SNR_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_SNR_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SNR_SNR_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_SNR_UP_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SNR_DOWN_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SNR_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_SNR_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SNR_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SNR_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only bars with a finite x, high and low. */
export function getLineSnrFinitePoints(
  data: readonly ChartLineSnrPoint[] | null | undefined,
): ChartLineSnrPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSnrPoint[] = [];
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
export function normalizeLineSnrPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/**
 * The decibel ratio `10 * log10(value / reference)`. A zero or non-finite
 * value or reference yields null (the dB of zero is negative infinity
 * and division by zero is undefined).
 */
export function computeLineSnrDb(
  value: unknown,
  reference: unknown,
): number | null {
  if (
    !isFiniteNumber(value) ||
    !isFiniteNumber(reference) ||
    value <= 0 ||
    reference <= 0
  ) {
    return null;
  }
  return 10 * Math.log10(value / reference);
}

/** The bar range `high - low` per bar; null for a non-finite bar. */
export function computeLineSnrRange(
  bars: readonly ChartLineSnrPoint[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const out: (number | null)[] = [];
  for (const bar of bars) {
    if (bar && isFiniteNumber(bar.high) && isFiniteNumber(bar.low)) {
      out.push(bar.high - bar.low);
    } else {
      out.push(null);
    }
  }
  return out;
}

/** The simple moving average of the value series, null in the warm-up. */
export function computeLineSnrSma(
  values: readonly (number | null)[] | null | undefined,
  period: unknown,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineSnrPeriod(period, DEFAULT_CHART_LINE_SNR_PERIOD);
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

/** Classify a bar by the sign of the SNR. */
export function classifyLineSnrZone(snr: number | null): ChartLineSnrZone {
  if (!isFiniteNumber(snr)) return 'none';
  if (snr > 0) return 'up';
  if (snr < 0) return 'down';
  return 'flat';
}

export interface ChartLineSnrOptions {
  period?: number;
}

/**
 * Compute the SNR pipeline: the bar range, its rolling average and the
 * decibel ratio of the two.
 */
export function computeLineSnr(
  bars: readonly ChartLineSnrPoint[] | null | undefined,
  options: ChartLineSnrOptions = {},
): ChartLineSnrComputed {
  if (!Array.isArray(bars)) {
    return { range: [], avgRange: [], snr: [] };
  }
  const period = normalizeLineSnrPeriod(
    options.period,
    DEFAULT_CHART_LINE_SNR_PERIOD,
  );
  const range = computeLineSnrRange(bars);
  const avgRange = computeLineSnrSma(range, period);
  const snr: (number | null)[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    snr.push(computeLineSnrDb(range[i], avgRange[i]));
  }
  return { range, avgRange, snr };
}

/** Run the full SNR pipeline over a set of bars. */
export function runLineSnr(
  data: readonly ChartLineSnrPoint[] | null | undefined,
  options: ChartLineSnrOptions = {},
): ChartLineSnrRun {
  const series = getLineSnrFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineSnrPeriod(
    options.period,
    DEFAULT_CHART_LINE_SNR_PERIOD,
  );
  const { range, avgRange, snr } = computeLineSnr(series, { period });

  const samples: ChartLineSnrSample[] = series.map((bar, index) => {
    const snrValue = snr[index] ?? null;
    return {
      index,
      x: bar.x,
      high: bar.high,
      low: bar.low,
      midpoint: (bar.high + bar.low) / 2,
      range: range[index] ?? null,
      avgRange: avgRange[index] ?? null,
      snr: snrValue,
      zone: classifyLineSnrZone(snrValue),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let snrFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.snr)) snrFinal = sample.snr;
  }

  return {
    series,
    period,
    range,
    avgRange,
    snr,
    samples,
    snrFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineSnrLayoutOptions extends ChartLineSnrOptions {
  data: readonly ChartLineSnrPoint[] | null | undefined;
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
export function computeLineSnrLayout(
  options: ChartLineSnrLayoutOptions,
): ChartLineSnrLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_SNR_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_SNR_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_SNR_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_SNR_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_SNR_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineSnr(options.data, {
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
  const snrPanelTop = pricePanelBottom + gap;
  const snrPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 && pricePanelHeight > 0 && snrPanelBottom - snrPanelTop > 0;
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

  let snrMin = 0;
  let snrMax = 0;
  for (const v of run.snr) {
    if (!isFiniteNumber(v)) continue;
    if (v < snrMin) snrMin = v;
    if (v > snrMax) snrMax = v;
  }
  if (snrMin === snrMax) {
    snrMin -= 1;
    snrMax += 1;
  } else {
    const range = snrMax - snrMin;
    snrMin -= range * 0.05;
    snrMax += range * 0.05;
  }
  const snrPanelHeight = snrPanelBottom - snrPanelTop;
  const snrYAt = (value: number): number =>
    snrPanelBottom - ((value - snrMin) / (snrMax - snrMin)) * snrPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineSnrDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.midpoint);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, midpoint: sample.midpoint });
  });

  const snrLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineSnrMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.snr)) return;
    const cx = xAt(index);
    const cy = snrYAt(sample.snr);
    snrLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      snr: sample.snr,
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
    snrPanelTop,
    snrPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    snrPath: buildLinePath(snrLinePoints),
    markers,
    zeroY: snrYAt(0),
    priceMin,
    priceMax,
    snrMin,
    snrMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineSnrChart(
  data: readonly ChartLineSnrPoint[] | null | undefined,
  options: ChartLineSnrOptions = {},
): string {
  const run = runLineSnr(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.snrFinal === null ? 'n/a' : run.snrFinal.toFixed(2);
  return (
    `Two-panel chart with the Signal to Noise Ratio (period ` +
    `${run.period}): the top panel plots the bar midpoint, the bottom ` +
    `panel plots the SNR. The Signal to Noise Ratio is the decibel ratio ` +
    `of bar range to its rolling average -- ` +
    `10 * log10(range / avgRange) -- ` +
    `so a bar wider than the recent average reads positive dB (loud) ` +
    `and a quieter bar reads negative. Across ${total} bars the SNR is ` +
    `positive on ${run.upCount}, negative on ${run.downCount} and flat ` +
    `on ${run.flatCount}. The final SNR reading is ${finalText}.`
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
  zone: ChartLineSnrZone,
  upColor: string,
  downColor: string,
  flatColor: string,
): string {
  if (zone === 'up') return upColor;
  if (zone === 'down') return downColor;
  return flatColor;
}

function zoneLabelOf(zone: ChartLineSnrZone): string {
  if (zone === 'up') return 'Loud';
  if (zone === 'down') return 'Quiet';
  if (zone === 'flat') return 'At noise floor';
  return 'n/a';
}

/**
 * ChartLineSnr -- two-panel pure-SVG Signal to Noise Ratio chart.
 */
export const ChartLineSnr = forwardRef<HTMLDivElement, ChartLineSnrProps>(
  function ChartLineSnr(props, ref) {
    const {
      data,
      period = DEFAULT_CHART_LINE_SNR_PERIOD,
      width = DEFAULT_CHART_LINE_SNR_WIDTH,
      height = DEFAULT_CHART_LINE_SNR_HEIGHT,
      padding = DEFAULT_CHART_LINE_SNR_PADDING,
      gap = DEFAULT_CHART_LINE_SNR_GAP,
      tickCount = DEFAULT_CHART_LINE_SNR_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_SNR_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_SNR_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_SNR_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_SNR_PRICE_COLOR,
      snrColor = DEFAULT_CHART_LINE_SNR_SNR_COLOR,
      upColor = DEFAULT_CHART_LINE_SNR_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_SNR_DOWN_COLOR,
      flatColor = DEFAULT_CHART_LINE_SNR_FLAT_COLOR,
      zeroColor = DEFAULT_CHART_LINE_SNR_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_SNR_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_SNR_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showSnr = true,
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
    const baseId = `chart-line-snr-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<
      ChartLineSnrSeriesId[]
    >(defaultHiddenSeries ?? []);
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineSnrSeriesId): boolean =>
      hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineSnrLayout({
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
      ariaDescription ?? describeLineSnrChart(data, { period });
    const resolvedLabel =
      ariaLabel ?? `Signal to Noise Ratio chart, period ${run.period}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineSnrSeriesId): void => {
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
        <g data-section="chart-line-snr-tooltip" pointerEvents="none">
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
            data-section="chart-line-snr-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-snr-tooltip-high"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`High: ${formatValue(hoverSample.high)}`}
          </text>
          <text
            data-section="chart-line-snr-tooltip-low"
            x={tx + 10}
            y={ty + 51}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Low: ${formatValue(hoverSample.low)}`}
          </text>
          <text
            data-section="chart-line-snr-tooltip-range"
            x={tx + 10}
            y={ty + 67}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Range: ${
              hoverSample.range === null
                ? 'n/a'
                : formatValue(hoverSample.range)
            }`}
          </text>
          <text
            data-section="chart-line-snr-tooltip-snr"
            x={tx + 10}
            y={ty + 83}
            fill="#c4b5fd"
            fontSize={11}
            fontWeight={600}
          >
            {`SNR: ${
              hoverSample.snr === null
                ? 'n/a'
                : `${formatValue(hoverSample.snr)} dB`
            }`}
          </text>
          <text
            data-section="chart-line-snr-tooltip-zone"
            x={tx + 10}
            y={ty + 99}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Signal: ${zoneLabelOf(hoverSample.zone)}`}
          </text>
        </g>
      );
    }

    const priceHidden = isHidden('price');
    const snrHidden = isHidden('snr') || !showSnr;

    const legendItems: Array<{
      id: ChartLineSnrSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Midpoint', color: priceColor },
      { id: 'snr', label: 'SNR', color: snrColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-snr"
        data-empty={isEmpty ? 'true' : 'false'}
        data-period={run.period}
        data-snr-final={run.snrFinal === null ? '' : run.snrFinal}
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
          data-section="chart-line-snr-aria-desc"
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
            data-section="chart-line-snr-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-snr-empty"
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
            data-section="chart-line-snr-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-snr-grid">
                {tickValues.map((t, i) => {
                  const py =
                    layout.pricePanelBottom -
                    t * (layout.pricePanelBottom - layout.pricePanelTop);
                  return (
                    <line
                      key={`pg-${i}`}
                      data-section="chart-line-snr-grid-line"
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
                    layout.snrPanelBottom -
                    t * (layout.snrPanelBottom - layout.snrPanelTop);
                  return (
                    <line
                      key={`sg-${i}`}
                      data-section="chart-line-snr-grid-line"
                      data-panel="snr"
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
              <g data-section="chart-line-snr-axes">
                <line
                  data-section="chart-line-snr-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelTop}
                  x2={layout.innerLeft}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-snr-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelBottom}
                  x2={layout.innerRight}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-snr-axis"
                  data-panel="snr"
                  x1={layout.innerLeft}
                  y1={layout.snrPanelTop}
                  x2={layout.innerLeft}
                  y2={layout.snrPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-snr-axis"
                  data-panel="snr"
                  x1={layout.innerLeft}
                  y1={layout.snrPanelBottom}
                  x2={layout.innerRight}
                  y2={layout.snrPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-snr-tick-label"
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
                  data-section="chart-line-snr-tick-label"
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
                  data-section="chart-line-snr-tick-label"
                  data-panel="snr"
                  x={layout.innerLeft - 6}
                  y={layout.snrPanelTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.snrMax)}
                </text>
                <text
                  data-section="chart-line-snr-tick-label"
                  data-panel="snr"
                  x={layout.innerLeft - 6}
                  y={layout.snrPanelBottom}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.snrMin)}
                </text>
              </g>
            ) : null}

            <text
              data-section="chart-line-snr-panel-label"
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
              data-section="chart-line-snr-panel-label"
              data-panel="snr"
              x={layout.innerRight}
              y={layout.snrPanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              Signal to Noise Ratio
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-snr-zero-line"
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
                data-section="chart-line-snr-price-path"
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
              <g data-section="chart-line-snr-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-snr-dot"
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

            {!snrHidden ? (
              <path
                data-section="chart-line-snr-snr-line"
                d={layout.snrPath}
                fill="none"
                stroke={snrColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`SNR line, ${layout.markers.length} points`}
              />
            ) : null}

            {!snrHidden && showMarkers ? (
              <g data-section="chart-line-snr-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-snr-marker"
                    data-zone={marker.zone}
                    data-snr={marker.snr}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={zoneColorOf(marker.zone, upColor, downColor, flatColor)}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, snr ${formatValue(
                      marker.snr,
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
              <g data-section="chart-line-snr-badge">
                <rect
                  data-section="chart-line-snr-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.pricePanelTop + 4}
                  width={56}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-snr-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.pricePanelTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`SNR ${run.period}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-snr-legend"
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
                  data-section="chart-line-snr-legend-item"
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
                    data-section="chart-line-snr-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-snr-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-snr-legend-stats"
              style={{ color: axisColor }}
            >
              {`loud ${run.upCount} / quiet ${run.downCount} / flat ${run.flatCount}`}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineSnr.displayName = 'ChartLineSnr';
