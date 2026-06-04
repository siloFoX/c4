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
 * ChartLineFdi -- pure-SVG two-panel Fractal Dimension Index chart.
 *
 * The Fractal Dimension Index scores how ROUGH the price path is over a
 * lookback window. The window is normalized into a unit square, the length
 * of the price curve is measured, and the dimension is derived from it:
 * `FDI = 1 + ln(L) / ln(N - 1)`. A smooth, straight path has length near
 * the unit diagonal, so the FDI sits near 1 (trending); a jagged,
 * space-filling path has a much longer curve, so the FDI climbs toward 2
 * (choppy). A flat window is exactly dimension 1.
 *
 * The top panel plots the price; the bottom panel plots the FDI on a fixed
 * 1..2 scale with dashed threshold lines and per-bar zone markers.
 */

export interface ChartLineFdiPoint {
  x: number;
  value: number;
}

export type ChartLineFdiZone = 'trending' | 'choppy' | 'neutral' | 'none';

export type ChartLineFdiSeriesId = 'price' | 'fdi';

export interface ChartLineFdiSample {
  index: number;
  x: number;
  value: number;
  fdi: number | null;
  zone: ChartLineFdiZone;
}

export interface ChartLineFdiRun {
  series: ChartLineFdiPoint[];
  period: number;
  upperThreshold: number;
  lowerThreshold: number;
  fdi: (number | null)[];
  samples: ChartLineFdiSample[];
  fdiFinal: number | null;
  trendingCount: number;
  choppyCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineFdiMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  fdi: number;
  zone: ChartLineFdiZone;
}

export interface ChartLineFdiDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineFdiLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  fdiPanelTop: number;
  fdiPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineFdiDot[];
  fdiPath: string;
  markers: ChartLineFdiMarker[];
  upperY: number;
  lowerY: number;
  priceMin: number;
  priceMax: number;
  run: ChartLineFdiRun;
}

export interface ChartLineFdiProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineFdiPoint[];
  period?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  fdiColor?: string;
  trendingColor?: string;
  choppyColor?: string;
  neutralColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFdi?: boolean;
  showThresholds?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineFdiSeriesId[];
  defaultHiddenSeries?: ChartLineFdiSeriesId[];
  onSeriesToggle?: (detail: { seriesId: ChartLineFdiSeriesId; hidden: boolean }) => void;
  onPointClick?: (detail: { point: ChartLineFdiSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_FDI_WIDTH = 720;
export const DEFAULT_CHART_LINE_FDI_HEIGHT = 400;
export const DEFAULT_CHART_LINE_FDI_PADDING = 44;
export const DEFAULT_CHART_LINE_FDI_GAP = 12;
export const DEFAULT_CHART_LINE_FDI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FDI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_FDI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FDI_PERIOD = 30;
export const DEFAULT_CHART_LINE_FDI_UPPER_THRESHOLD = 1.6;
export const DEFAULT_CHART_LINE_FDI_LOWER_THRESHOLD = 1.4;
export const DEFAULT_CHART_LINE_FDI_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_FDI_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_FDI_FDI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_FDI_TRENDING_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_FDI_CHOPPY_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_FDI_NEUTRAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_FDI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_FDI_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineFdiFinitePoints(
  data: readonly ChartLineFdiPoint[] | null | undefined,
): ChartLineFdiPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineFdiPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce a period to an integer >= 2, else the fallback. */
export function normalizeLineFdiPeriod(period: unknown, fallback: number): number {
  if (!isFiniteNumber(period)) return fallback;
  const floored = Math.floor(period);
  if (floored < 2) return fallback;
  return floored;
}

/**
 * The Fractal Dimension Index of a single window: normalize the window
 * into a unit square, measure the length L of the price curve, and return
 * `1 + ln(L) / ln(N - 1)`, clamped to [1, 2]. A flat window is exactly 1;
 * a window of two or fewer points is a straight segment, also 1.
 */
export function computeLineFdiValue(
  window: readonly number[] | null | undefined,
): number | null {
  if (!Array.isArray(window)) return null;
  const n = window.length;
  if (n < 2) return null;
  if (n === 2) return 1;
  let highest = -Infinity;
  let lowest = Infinity;
  for (const v of window) {
    if (!isFiniteNumber(v)) return null;
    if (v > highest) highest = v;
    if (v < lowest) lowest = v;
  }
  const diff = highest - lowest;
  const dx = 1 / (n - 1);
  let length = 0;
  for (let k = 1; k < n; k += 1) {
    const dy = diff > 0 ? ((window[k] as number) - (window[k - 1] as number)) / diff : 0;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  const denom = Math.log(n - 1);
  if (length <= 0 || denom === 0) return 1;
  let fdi = 1 + Math.log(length) / denom;
  if (fdi < 1) fdi = 1;
  if (fdi > 2) fdi = 2;
  return fdi;
}

/** Rolling Fractal Dimension Index over the close series. */
export function computeLineFdi(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineFdiPeriod(period, 2);
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i + 1 < p) {
      out.push(null);
      continue;
    }
    out.push(computeLineFdiValue(values.slice(i - p + 1, i + 1)));
  }
  return out;
}

/** Classify a bar by the FDI against the thresholds. */
export function classifyLineFdiZone(
  fdi: number | null,
  upperThreshold: number,
  lowerThreshold: number,
): ChartLineFdiZone {
  if (!isFiniteNumber(fdi)) return 'none';
  if (fdi > upperThreshold) return 'choppy';
  if (fdi < lowerThreshold) return 'trending';
  return 'neutral';
}

export interface ChartLineFdiOptions {
  period?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
}

function normalizeFdiThreshold(value: unknown, fallback: number): number {
  if (isFiniteNumber(value) && value > 1 && value < 2) return value;
  return fallback;
}

/** Run the full Fractal Dimension Index pipeline over a set of points. */
export function runLineFdi(
  data: readonly ChartLineFdiPoint[] | null | undefined,
  options: ChartLineFdiOptions = {},
): ChartLineFdiRun {
  const series = getLineFdiFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineFdiPeriod(options.period, DEFAULT_CHART_LINE_FDI_PERIOD);
  const upperThreshold = normalizeFdiThreshold(
    options.upperThreshold,
    DEFAULT_CHART_LINE_FDI_UPPER_THRESHOLD,
  );
  const lowerThreshold = normalizeFdiThreshold(
    options.lowerThreshold,
    DEFAULT_CHART_LINE_FDI_LOWER_THRESHOLD,
  );
  const values = series.map((point) => point.value);
  const fdi = computeLineFdi(values, period);

  const samples: ChartLineFdiSample[] = series.map((point, index) => {
    const fdiValue = fdi[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      fdi: fdiValue,
      zone: classifyLineFdiZone(fdiValue, upperThreshold, lowerThreshold),
    };
  });

  let trendingCount = 0;
  let choppyCount = 0;
  let neutralCount = 0;
  let fdiFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'trending') trendingCount += 1;
    else if (sample.zone === 'choppy') choppyCount += 1;
    else if (sample.zone === 'neutral') neutralCount += 1;
    if (isFiniteNumber(sample.fdi)) fdiFinal = sample.fdi;
  }

  return {
    series,
    period,
    upperThreshold,
    lowerThreshold,
    fdi,
    samples,
    fdiFinal,
    trendingCount,
    choppyCount,
    neutralCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineFdiLayoutOptions extends ChartLineFdiOptions {
  data: readonly ChartLineFdiPoint[] | null | undefined;
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
export function computeLineFdiLayout(
  options: ChartLineFdiLayoutOptions,
): ChartLineFdiLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_FDI_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_FDI_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_FDI_PADDING;
  const gap = isFiniteNumber(options.gap) ? options.gap : DEFAULT_CHART_LINE_FDI_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_FDI_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineFdi(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.upperThreshold !== undefined
      ? { upperThreshold: options.upperThreshold }
      : {}),
    ...(options.lowerThreshold !== undefined
      ? { lowerThreshold: options.lowerThreshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const fdiPanelTop = pricePanelBottom + gap;
  const fdiPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 && pricePanelHeight > 0 && fdiPanelBottom - fdiPanelTop > 0;
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

  const fdiPanelHeight = fdiPanelBottom - fdiPanelTop;
  const fdiYAt = (value: number): number =>
    fdiPanelBottom - ((value - 1) / (2 - 1)) * fdiPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineFdiDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = priceYAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const fdiLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineFdiMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.fdi)) return;
    const cx = xAt(index);
    const cy = fdiYAt(sample.fdi);
    fdiLinePoints.push({ x: cx, y: cy });
    markers.push({ index, x: sample.x, cx, cy, fdi: sample.fdi, zone: sample.zone });
  });

  return {
    ok,
    width,
    height,
    padding,
    gap,
    pricePanelTop,
    pricePanelBottom,
    fdiPanelTop,
    fdiPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    fdiPath: buildLinePath(fdiLinePoints),
    markers,
    upperY: fdiYAt(run.upperThreshold),
    lowerY: fdiYAt(run.lowerThreshold),
    priceMin,
    priceMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineFdiChart(
  data: readonly ChartLineFdiPoint[] | null | undefined,
  options: ChartLineFdiOptions = {},
): string {
  const run = runLineFdi(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.fdiFinal === null ? 'n/a' : run.fdiFinal.toFixed(3);
  return (
    `Two-panel chart with the Fractal Dimension Index (period ` +
    `${run.period}): the top panel plots the price, the bottom panel plots ` +
    `the FDI. The FDI scores the roughness of the price path over the ` +
    `lookback window on a 1 to 2 scale -- a value near 1 marks a smooth, ` +
    `trending path, a value near 2 a rough, choppy one. Across ${total} ` +
    `bars it is trending on ${run.trendingCount}, choppy on ` +
    `${run.choppyCount} and neutral on ${run.neutralCount}. The final FDI ` +
    `is ${finalText}.`
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
  zone: ChartLineFdiZone,
  trendingColor: string,
  choppyColor: string,
  neutralColor: string,
): string {
  if (zone === 'trending') return trendingColor;
  if (zone === 'choppy') return choppyColor;
  return neutralColor;
}

function zoneLabelOf(zone: ChartLineFdiZone): string {
  if (zone === 'trending') return 'Trending';
  if (zone === 'choppy') return 'Choppy';
  if (zone === 'neutral') return 'Neutral';
  return 'n/a';
}

/**
 * ChartLineFdi -- two-panel pure-SVG Fractal Dimension Index chart.
 */
export const ChartLineFdi = forwardRef<HTMLDivElement, ChartLineFdiProps>(
  function ChartLineFdi(props, ref) {
    const {
      data,
      period = DEFAULT_CHART_LINE_FDI_PERIOD,
      upperThreshold = DEFAULT_CHART_LINE_FDI_UPPER_THRESHOLD,
      lowerThreshold = DEFAULT_CHART_LINE_FDI_LOWER_THRESHOLD,
      width = DEFAULT_CHART_LINE_FDI_WIDTH,
      height = DEFAULT_CHART_LINE_FDI_HEIGHT,
      padding = DEFAULT_CHART_LINE_FDI_PADDING,
      gap = DEFAULT_CHART_LINE_FDI_GAP,
      tickCount = DEFAULT_CHART_LINE_FDI_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_FDI_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_FDI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_FDI_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_FDI_PRICE_COLOR,
      fdiColor = DEFAULT_CHART_LINE_FDI_FDI_COLOR,
      trendingColor = DEFAULT_CHART_LINE_FDI_TRENDING_COLOR,
      choppyColor = DEFAULT_CHART_LINE_FDI_CHOPPY_COLOR,
      neutralColor = DEFAULT_CHART_LINE_FDI_NEUTRAL_COLOR,
      gridColor = DEFAULT_CHART_LINE_FDI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_FDI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showFdi = true,
      showThresholds = true,
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
    const baseId = `chart-line-fdi-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<ChartLineFdiSeriesId[]>(
      defaultHiddenSeries ?? [],
    );
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineFdiSeriesId): boolean => hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineFdiLayout({
          data,
          period,
          upperThreshold,
          lowerThreshold,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
        }),
      [
        data,
        period,
        upperThreshold,
        lowerThreshold,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      ],
    );

    const run = layout.run;
    const description =
      ariaDescription ??
      describeLineFdiChart(data, { period, upperThreshold, lowerThreshold });
    const resolvedLabel =
      ariaLabel ?? `Fractal Dimension Index chart, period ${run.period}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineFdiSeriesId): void => {
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
      const tooltipW = 168;
      const rawX = anchorX + 12;
      const tx = Math.min(rawX, layout.width - tooltipW - 4);
      const ty = layout.pricePanelTop + 6;
      tooltip = (
        <g data-section="chart-line-fdi-tooltip" pointerEvents="none">
          <rect
            x={tx}
            y={ty}
            width={tooltipW}
            height={80}
            rx={6}
            fill="#0f172a"
            opacity={0.92}
          />
          <text
            data-section="chart-line-fdi-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-fdi-tooltip-value"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Price: ${formatValue(hoverSample.value)}`}
          </text>
          <text
            data-section="chart-line-fdi-tooltip-fdi"
            x={tx + 10}
            y={ty + 51}
            fill="#c4b5fd"
            fontSize={11}
            fontWeight={600}
          >
            {`FDI: ${
              hoverSample.fdi === null ? 'n/a' : hoverSample.fdi.toFixed(3)
            }`}
          </text>
          <text
            data-section="chart-line-fdi-tooltip-zone"
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
    const fdiHidden = isHidden('fdi') || !showFdi;

    const legendItems: Array<{
      id: ChartLineFdiSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'fdi', label: 'FDI', color: fdiColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-fdi"
        data-empty={isEmpty ? 'true' : 'false'}
        data-period={run.period}
        data-upper-threshold={run.upperThreshold}
        data-lower-threshold={run.lowerThreshold}
        data-fdi-final={run.fdiFinal === null ? '' : run.fdiFinal}
        data-trending-count={run.trendingCount}
        data-choppy-count={run.choppyCount}
        data-neutral-count={run.neutralCount}
        data-total-points={run.series.length}
        data-animate={animate ? 'true' : 'false'}
        role="region"
        aria-label={resolvedLabel}
        aria-describedby={descId}
      >
        <span
          id={descId}
          data-section="chart-line-fdi-aria-desc"
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
            data-section="chart-line-fdi-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-fdi-empty"
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
            data-section="chart-line-fdi-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-fdi-grid">
                {tickValues.map((t, i) => {
                  const py =
                    layout.pricePanelBottom -
                    t * (layout.pricePanelBottom - layout.pricePanelTop);
                  return (
                    <line
                      key={`pg-${i}`}
                      data-section="chart-line-fdi-grid-line"
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
                  const fy =
                    layout.fdiPanelBottom -
                    t * (layout.fdiPanelBottom - layout.fdiPanelTop);
                  return (
                    <line
                      key={`fg-${i}`}
                      data-section="chart-line-fdi-grid-line"
                      data-panel="fdi"
                      x1={layout.innerLeft}
                      y1={fy}
                      x2={layout.innerRight}
                      y2={fy}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  );
                })}
              </g>
            ) : null}

            {showAxis ? (
              <g data-section="chart-line-fdi-axes">
                <line
                  data-section="chart-line-fdi-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelTop}
                  x2={layout.innerLeft}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-fdi-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelBottom}
                  x2={layout.innerRight}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-fdi-axis"
                  data-panel="fdi"
                  x1={layout.innerLeft}
                  y1={layout.fdiPanelTop}
                  x2={layout.innerLeft}
                  y2={layout.fdiPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-fdi-axis"
                  data-panel="fdi"
                  x1={layout.innerLeft}
                  y1={layout.fdiPanelBottom}
                  x2={layout.innerRight}
                  y2={layout.fdiPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-fdi-tick-label"
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
                  data-section="chart-line-fdi-tick-label"
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
                  data-section="chart-line-fdi-tick-label"
                  data-panel="fdi"
                  x={layout.innerLeft - 6}
                  y={layout.fdiPanelTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  2
                </text>
                <text
                  data-section="chart-line-fdi-tick-label"
                  data-panel="fdi"
                  x={layout.innerLeft - 6}
                  y={layout.fdiPanelBottom}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  1
                </text>
              </g>
            ) : null}

            <text
              data-section="chart-line-fdi-panel-label"
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
              data-section="chart-line-fdi-panel-label"
              data-panel="fdi"
              x={layout.innerRight}
              y={layout.fdiPanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              Fractal Dimension Index
            </text>

            {showThresholds ? (
              <g data-section="chart-line-fdi-thresholds">
                <line
                  data-section="chart-line-fdi-threshold-line"
                  data-level="upper"
                  x1={layout.innerLeft}
                  y1={layout.upperY}
                  x2={layout.innerRight}
                  y2={layout.upperY}
                  stroke={choppyColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-fdi-threshold-line"
                  data-level="lower"
                  x1={layout.innerLeft}
                  y1={layout.lowerY}
                  x2={layout.innerRight}
                  y2={layout.lowerY}
                  stroke={trendingColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              </g>
            ) : null}

            {!priceHidden ? (
              <path
                data-section="chart-line-fdi-price-path"
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
              <g data-section="chart-line-fdi-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-fdi-dot"
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

            {!fdiHidden ? (
              <path
                data-section="chart-line-fdi-fdi-line"
                d={layout.fdiPath}
                fill="none"
                stroke={fdiColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Fractal Dimension Index line, ${layout.markers.length} points`}
              />
            ) : null}

            {!fdiHidden && showMarkers ? (
              <g data-section="chart-line-fdi-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-fdi-marker"
                    data-zone={marker.zone}
                    data-fdi={marker.fdi}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={zoneColorOf(
                      marker.zone,
                      trendingColor,
                      choppyColor,
                      neutralColor,
                    )}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, FDI ${marker.fdi.toFixed(
                      3,
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
              <g data-section="chart-line-fdi-badge">
                <rect
                  data-section="chart-line-fdi-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.pricePanelTop + 4}
                  width={60}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-fdi-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.pricePanelTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`FDI ${run.period}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-fdi-legend"
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
                  data-section="chart-line-fdi-legend-item"
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
                    data-section="chart-line-fdi-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-fdi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-fdi-legend-stats"
              style={{ color: axisColor }}
            >
              {`trending ${run.trendingCount} / choppy ${run.choppyCount} / neutral ${run.neutralCount}`}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineFdi.displayName = 'ChartLineFdi';
