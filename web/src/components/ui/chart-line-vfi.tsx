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
 * ChartLineVfi -- pure-SVG two-panel Volume Flow Indicator chart.
 *
 * Markos Katsanos's Volume Flow Indicator (VFI) reads the bias of volume
 * across the lookback window. For each bar past the first the typical
 * price `(high + low + close) / 3` is compared to the prior bar's
 * typical: when it rose the bar's volume is signed positive, when it
 * fell it is signed negative, when it held it is zero. The cumulative
 * signed volume over the lookback is then divided by the cumulative
 * volume over the same lookback and scaled to 100:
 *
 *   typical      = (high + low + close) / 3
 *   signedVolume = sign(typical - typical[-1]) * volume
 *   vfi          = 100 * sum(signedVolume, period) / sum(volume, period)
 *
 * Because `|signedVolume[i]| <= volume[i]`, the ratio sits in [-1, 1],
 * so the VFI is bounded to [-100, 100]: +100 when every bar in the
 * window was an up bar, -100 when every bar was a down bar, and 0 when
 * up and down volume balanced.
 *
 * The top panel plots the close; the bottom panel plots the VFI inside
 * a fixed [-100, 100] band with a zero line and one marker per bar
 * coloured by the sign of the indicator.
 */

export interface ChartLineVfiPoint {
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartLineVfiZone = 'up' | 'down' | 'flat' | 'none';

export type ChartLineVfiSeriesId = 'price' | 'vfi';

export interface ChartLineVfiComputed {
  typical: (number | null)[];
  signedVolume: (number | null)[];
  vfi: (number | null)[];
}

export interface ChartLineVfiSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  typical: number | null;
  vfi: number | null;
  zone: ChartLineVfiZone;
}

export interface ChartLineVfiRun {
  series: ChartLineVfiPoint[];
  period: number;
  typical: (number | null)[];
  signedVolume: (number | null)[];
  vfi: (number | null)[];
  samples: ChartLineVfiSample[];
  vfiFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineVfiMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  vfi: number;
  zone: ChartLineVfiZone;
}

export interface ChartLineVfiDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVfiLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  vfiPanelTop: number;
  vfiPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineVfiDot[];
  vfiPath: string;
  markers: ChartLineVfiMarker[];
  zeroY: number;
  priceMin: number;
  priceMax: number;
  vfiMin: number;
  vfiMax: number;
  run: ChartLineVfiRun;
}

export interface ChartLineVfiProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVfiPoint[];
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
  vfiColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showVfi?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVfiSeriesId[];
  defaultHiddenSeries?: ChartLineVfiSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVfiSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineVfiSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_VFI_WIDTH = 720;
export const DEFAULT_CHART_LINE_VFI_HEIGHT = 400;
export const DEFAULT_CHART_LINE_VFI_PADDING = 44;
export const DEFAULT_CHART_LINE_VFI_GAP = 12;
export const DEFAULT_CHART_LINE_VFI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VFI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VFI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VFI_PERIOD = 26;
export const DEFAULT_CHART_LINE_VFI_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_VFI_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VFI_VFI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_VFI_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VFI_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VFI_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_VFI_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VFI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VFI_AXIS_COLOR = '#94a3b8';

/** The VFI is bounded to this magnitude; the panel pads past it. */
export const CHART_LINE_VFI_BOUND = 100;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only bars with a finite x, high, low, close and volume. */
export function getLineVfiFinitePoints(
  data: readonly ChartLineVfiPoint[] | null | undefined,
): ChartLineVfiPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVfiPoint[] = [];
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

/** Coerce the lookback period to an integer of at least 2, else fallback. */
export function normalizeLineVfiPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** The typical price per bar, `(high + low + close) / 3`. */
export function computeLineVfiTypical(
  bars: readonly ChartLineVfiPoint[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const out: (number | null)[] = [];
  for (const bar of bars) {
    if (
      bar &&
      isFiniteNumber(bar.high) &&
      isFiniteNumber(bar.low) &&
      isFiniteNumber(bar.close)
    ) {
      out.push((bar.high + bar.low + bar.close) / 3);
    } else {
      out.push(null);
    }
  }
  return out;
}

/**
 * The signed volume per bar: positive when the typical rose, negative
 * when it fell, zero when it held. The first bar has no prior, so it
 * is null.
 */
export function computeLineVfiSignedVolume(
  bars: readonly ChartLineVfiPoint[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const typical = computeLineVfiTypical(bars);
  const out: (number | null)[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const bar = bars[i];
    const t0 = typical[i];
    const t1 = typical[i - 1];
    if (
      !bar ||
      !isFiniteNumber(bar.volume) ||
      !isFiniteNumber(t0) ||
      !isFiniteNumber(t1)
    ) {
      out.push(null);
      continue;
    }
    out.push(Math.sign(t0 - t1) * bar.volume);
  }
  return out;
}

export interface ChartLineVfiOptions {
  period?: number;
}

/**
 * Compute the Volume Flow Indicator: the typical price, the signed
 * volume per bar, and the rolling ratio `100 * sum(signedVolume) /
 * sum(volume)` over the lookback.
 */
export function computeLineVfi(
  bars: readonly ChartLineVfiPoint[] | null | undefined,
  options: ChartLineVfiOptions = {},
): ChartLineVfiComputed {
  if (!Array.isArray(bars)) {
    return { typical: [], signedVolume: [], vfi: [] };
  }
  const period = normalizeLineVfiPeriod(
    options.period,
    DEFAULT_CHART_LINE_VFI_PERIOD,
  );
  const typical = computeLineVfiTypical(bars);
  const signedVolume = computeLineVfiSignedVolume(bars);
  const vfi: (number | null)[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < period) {
      vfi.push(null);
      continue;
    }
    let sumSigned = 0;
    let sumVol = 0;
    let ok = true;
    for (let j = 0; j < period; j += 1) {
      const k = i - j;
      const sv = signedVolume[k];
      const bar = bars[k];
      if (sv == null || !bar || !isFiniteNumber(bar.volume)) {
        ok = false;
        break;
      }
      sumSigned += sv;
      sumVol += bar.volume;
    }
    if (!ok) {
      vfi.push(null);
      continue;
    }
    vfi.push(sumVol !== 0 ? (100 * sumSigned) / sumVol : 0);
  }
  return { typical, signedVolume, vfi };
}

/** Classify a bar by the sign of the VFI. */
export function classifyLineVfiZone(vfi: number | null): ChartLineVfiZone {
  if (!isFiniteNumber(vfi)) return 'none';
  if (vfi > 0) return 'up';
  if (vfi < 0) return 'down';
  return 'flat';
}

/** Run the full VFI pipeline over a set of bars. */
export function runLineVfi(
  data: readonly ChartLineVfiPoint[] | null | undefined,
  options: ChartLineVfiOptions = {},
): ChartLineVfiRun {
  const series = getLineVfiFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineVfiPeriod(
    options.period,
    DEFAULT_CHART_LINE_VFI_PERIOD,
  );
  const { typical, signedVolume, vfi } = computeLineVfi(series, { period });

  const samples: ChartLineVfiSample[] = series.map((bar, index) => {
    const vfiValue = vfi[index] ?? null;
    return {
      index,
      x: bar.x,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      typical: typical[index] ?? null,
      vfi: vfiValue,
      zone: classifyLineVfiZone(vfiValue),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let vfiFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.vfi)) vfiFinal = sample.vfi;
  }

  return {
    series,
    period,
    typical,
    signedVolume,
    vfi,
    samples,
    vfiFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineVfiLayoutOptions extends ChartLineVfiOptions {
  data: readonly ChartLineVfiPoint[] | null | undefined;
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
export function computeLineVfiLayout(
  options: ChartLineVfiLayoutOptions,
): ChartLineVfiLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_VFI_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_VFI_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_VFI_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_VFI_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_VFI_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineVfi(options.data, {
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
  const vfiPanelTop = pricePanelBottom + gap;
  const vfiPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    vfiPanelBottom - vfiPanelTop > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const bar of run.series) {
    if (bar.close < priceMin) priceMin = bar.close;
    if (bar.close > priceMax) priceMax = bar.close;
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

  const vfiMin = -(CHART_LINE_VFI_BOUND + 10);
  const vfiMax = CHART_LINE_VFI_BOUND + 10;
  const vfiPanelHeight = vfiPanelBottom - vfiPanelTop;
  const vfiYAt = (value: number): number =>
    vfiPanelBottom - ((value - vfiMin) / (vfiMax - vfiMin)) * vfiPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineVfiDot[] = [];
  run.series.forEach((bar, index) => {
    const cx = xAt(index);
    const cy = priceYAt(bar.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: bar.x, cx, cy, close: bar.close });
  });

  const vfiLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineVfiMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.vfi)) return;
    const cx = xAt(index);
    const cy = vfiYAt(sample.vfi);
    vfiLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      vfi: sample.vfi,
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
    vfiPanelTop,
    vfiPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    vfiPath: buildLinePath(vfiLinePoints),
    markers,
    zeroY: vfiYAt(0),
    priceMin,
    priceMax,
    vfiMin,
    vfiMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineVfiChart(
  data: readonly ChartLineVfiPoint[] | null | undefined,
  options: ChartLineVfiOptions = {},
): string {
  const run = runLineVfi(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.vfiFinal === null ? 'n/a' : run.vfiFinal.toFixed(2);
  return (
    `Two-panel chart with the Markos Katsanos Volume Flow Indicator ` +
    `(period ${run.period}): the top panel plots the close, the bottom ` +
    `panel plots the VFI. The Volume Flow Indicator takes the cumulative ` +
    `signed volume across the lookback -- positive on bars where the ` +
    `typical price rose, negative on bars where it fell -- and divides ` +
    `by the cumulative volume over the same window, scaled to 100; ` +
    `relative to the window's mean volume it reads +100 when every bar ` +
    `was an up bar, -100 when every bar was a down bar, and 0 when up ` +
    `and down volume balanced. Across ${total} bars the indicator is ` +
    `positive on ${run.upCount}, negative on ${run.downCount} and flat ` +
    `on ${run.flatCount}. The final VFI reading is ${finalText}.`
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
  zone: ChartLineVfiZone,
  upColor: string,
  downColor: string,
  flatColor: string,
): string {
  if (zone === 'up') return upColor;
  if (zone === 'down') return downColor;
  return flatColor;
}

function zoneLabelOf(zone: ChartLineVfiZone): string {
  if (zone === 'up') return 'Positive';
  if (zone === 'down') return 'Negative';
  if (zone === 'flat') return 'Balanced';
  return 'n/a';
}

/**
 * ChartLineVfi -- two-panel pure-SVG Volume Flow Indicator chart.
 */
export const ChartLineVfi = forwardRef<HTMLDivElement, ChartLineVfiProps>(
  function ChartLineVfi(props, ref) {
    const {
      data,
      period = DEFAULT_CHART_LINE_VFI_PERIOD,
      width = DEFAULT_CHART_LINE_VFI_WIDTH,
      height = DEFAULT_CHART_LINE_VFI_HEIGHT,
      padding = DEFAULT_CHART_LINE_VFI_PADDING,
      gap = DEFAULT_CHART_LINE_VFI_GAP,
      tickCount = DEFAULT_CHART_LINE_VFI_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_VFI_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_VFI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_VFI_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_VFI_PRICE_COLOR,
      vfiColor = DEFAULT_CHART_LINE_VFI_VFI_COLOR,
      upColor = DEFAULT_CHART_LINE_VFI_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_VFI_DOWN_COLOR,
      flatColor = DEFAULT_CHART_LINE_VFI_FLAT_COLOR,
      zeroColor = DEFAULT_CHART_LINE_VFI_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_VFI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_VFI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showVfi = true,
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
    const baseId = `chart-line-vfi-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<ChartLineVfiSeriesId[]>(
      defaultHiddenSeries ?? [],
    );
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineVfiSeriesId): boolean => hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineVfiLayout({
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
      ariaDescription ?? describeLineVfiChart(data, { period });
    const resolvedLabel =
      ariaLabel ?? `Volume Flow Indicator chart, period ${run.period}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineVfiSeriesId): void => {
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
      const tooltipW = 184;
      const rawX = anchorX + 12;
      const tx = Math.min(rawX, layout.width - tooltipW - 4);
      const ty = layout.pricePanelTop + 6;
      tooltip = (
        <g data-section="chart-line-vfi-tooltip" pointerEvents="none">
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
            data-section="chart-line-vfi-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-vfi-tooltip-close"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Close: ${formatValue(hoverSample.close)}`}
          </text>
          <text
            data-section="chart-line-vfi-tooltip-volume"
            x={tx + 10}
            y={ty + 51}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Volume: ${formatValue(hoverSample.volume)}`}
          </text>
          <text
            data-section="chart-line-vfi-tooltip-vfi"
            x={tx + 10}
            y={ty + 67}
            fill="#c4b5fd"
            fontSize={11}
            fontWeight={600}
          >
            {`VFI: ${
              hoverSample.vfi === null ? 'n/a' : formatValue(hoverSample.vfi)
            }`}
          </text>
          <text
            data-section="chart-line-vfi-tooltip-zone"
            x={tx + 10}
            y={ty + 83}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Flow: ${zoneLabelOf(hoverSample.zone)}`}
          </text>
        </g>
      );
    }

    const priceHidden = isHidden('price');
    const vfiHidden = isHidden('vfi') || !showVfi;

    const legendItems: Array<{
      id: ChartLineVfiSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Close', color: priceColor },
      { id: 'vfi', label: 'VFI', color: vfiColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-vfi"
        data-empty={isEmpty ? 'true' : 'false'}
        data-period={run.period}
        data-vfi-final={run.vfiFinal === null ? '' : run.vfiFinal}
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
          data-section="chart-line-vfi-aria-desc"
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
            data-section="chart-line-vfi-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-vfi-empty"
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
            data-section="chart-line-vfi-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-vfi-grid">
                {tickValues.map((t, i) => {
                  const py =
                    layout.pricePanelBottom -
                    t * (layout.pricePanelBottom - layout.pricePanelTop);
                  return (
                    <line
                      key={`pg-${i}`}
                      data-section="chart-line-vfi-grid-line"
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
                  const vy =
                    layout.vfiPanelBottom -
                    t * (layout.vfiPanelBottom - layout.vfiPanelTop);
                  return (
                    <line
                      key={`vg-${i}`}
                      data-section="chart-line-vfi-grid-line"
                      data-panel="vfi"
                      x1={layout.innerLeft}
                      y1={vy}
                      x2={layout.innerRight}
                      y2={vy}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  );
                })}
              </g>
            ) : null}

            {showAxis ? (
              <g data-section="chart-line-vfi-axes">
                <line
                  data-section="chart-line-vfi-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelTop}
                  x2={layout.innerLeft}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-vfi-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelBottom}
                  x2={layout.innerRight}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-vfi-axis"
                  data-panel="vfi"
                  x1={layout.innerLeft}
                  y1={layout.vfiPanelTop}
                  x2={layout.innerLeft}
                  y2={layout.vfiPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-vfi-axis"
                  data-panel="vfi"
                  x1={layout.innerLeft}
                  y1={layout.vfiPanelBottom}
                  x2={layout.innerRight}
                  y2={layout.vfiPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-vfi-tick-label"
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
                  data-section="chart-line-vfi-tick-label"
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
                  data-section="chart-line-vfi-tick-label"
                  data-panel="vfi"
                  x={layout.innerLeft - 6}
                  y={layout.vfiPanelTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  100
                </text>
                <text
                  data-section="chart-line-vfi-tick-label"
                  data-panel="vfi"
                  x={layout.innerLeft - 6}
                  y={layout.vfiPanelBottom}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  -100
                </text>
              </g>
            ) : null}

            <text
              data-section="chart-line-vfi-panel-label"
              data-panel="price"
              x={layout.innerRight}
              y={layout.pricePanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              Close
            </text>
            <text
              data-section="chart-line-vfi-panel-label"
              data-panel="vfi"
              x={layout.innerRight}
              y={layout.vfiPanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              Volume Flow Indicator
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-vfi-zero-line"
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
                data-section="chart-line-vfi-price-path"
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
              <g data-section="chart-line-vfi-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-vfi-dot"
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

            {!vfiHidden ? (
              <path
                data-section="chart-line-vfi-vfi-line"
                d={layout.vfiPath}
                fill="none"
                stroke={vfiColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`VFI line, ${layout.markers.length} points`}
              />
            ) : null}

            {!vfiHidden && showMarkers ? (
              <g data-section="chart-line-vfi-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-vfi-marker"
                    data-zone={marker.zone}
                    data-vfi={marker.vfi}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={zoneColorOf(marker.zone, upColor, downColor, flatColor)}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, vfi ${formatValue(
                      marker.vfi,
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
              <g data-section="chart-line-vfi-badge">
                <rect
                  data-section="chart-line-vfi-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.pricePanelTop + 4}
                  width={60}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-vfi-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.pricePanelTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`VFI ${run.period}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-vfi-legend"
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
                  data-section="chart-line-vfi-legend-item"
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
                    data-section="chart-line-vfi-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-vfi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-vfi-legend-stats"
              style={{ color: axisColor }}
            >
              {`up ${run.upCount} / down ${run.downCount} / flat ${run.flatCount}`}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineVfi.displayName = 'ChartLineVfi';
