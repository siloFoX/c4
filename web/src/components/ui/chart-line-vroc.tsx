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
 * ChartLineVroc -- pure-SVG two-panel Volume Rate of Change chart.
 *
 * The Volume Rate of Change (VROC) is the percent change of volume from
 * `period` bars ago:
 *
 *   vroc = 100 * (volume - volume[-period]) / volume[-period]
 *
 * It is the volume analogue of the price Rate of Change -- a momentum
 * gauge for volume, positive when volume is expanding versus the prior
 * window, negative when it is contracting, zero when it has held steady.
 * Because volume cannot drop below zero, the indicator is bounded below
 * at -100 (a complete dry-up) but unbounded above (a volume surge can
 * read 200, 500 or higher).
 *
 * The top panel plots the close; the bottom panel plots the VROC with a
 * zero line and one marker per bar coloured by the sign of the reading.
 */

export interface ChartLineVrocPoint {
  x: number;
  close: number;
  volume: number;
}

export type ChartLineVrocZone = 'up' | 'down' | 'flat' | 'none';

export type ChartLineVrocSeriesId = 'price' | 'vroc';

export interface ChartLineVrocSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  priorVolume: number | null;
  vroc: number | null;
  zone: ChartLineVrocZone;
}

export interface ChartLineVrocRun {
  series: ChartLineVrocPoint[];
  period: number;
  vroc: (number | null)[];
  samples: ChartLineVrocSample[];
  vrocFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineVrocMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  vroc: number;
  zone: ChartLineVrocZone;
}

export interface ChartLineVrocDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVrocLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  vrocPanelTop: number;
  vrocPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineVrocDot[];
  vrocPath: string;
  markers: ChartLineVrocMarker[];
  zeroY: number;
  priceMin: number;
  priceMax: number;
  vrocMin: number;
  vrocMax: number;
  run: ChartLineVrocRun;
}

export interface ChartLineVrocProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVrocPoint[];
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
  vrocColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showVroc?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVrocSeriesId[];
  defaultHiddenSeries?: ChartLineVrocSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVrocSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineVrocSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_VROC_WIDTH = 720;
export const DEFAULT_CHART_LINE_VROC_HEIGHT = 400;
export const DEFAULT_CHART_LINE_VROC_PADDING = 44;
export const DEFAULT_CHART_LINE_VROC_GAP = 12;
export const DEFAULT_CHART_LINE_VROC_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VROC_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VROC_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VROC_PERIOD = 14;
export const DEFAULT_CHART_LINE_VROC_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_VROC_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VROC_VROC_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_VROC_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VROC_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VROC_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_VROC_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VROC_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VROC_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only bars with a finite x, close and volume. */
export function getLineVrocFinitePoints(
  data: readonly ChartLineVrocPoint[] | null | undefined,
): ChartLineVrocPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVrocPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume)
    ) {
      out.push({ x: point.x, close: point.close, volume: point.volume });
    }
  }
  return out;
}

/** Coerce the lookback period to an integer of at least 1, else fallback. */
export function normalizeLineVrocPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/**
 * Compute the Volume Rate of Change: for each bar past the lookback, the
 * percent change of volume from `period` bars ago. A bar with a prior
 * volume of zero (the divisor) or a non-finite volume yields null.
 */
export function computeLineVroc(
  bars: readonly ChartLineVrocPoint[] | null | undefined,
  period: unknown,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const p = normalizeLineVrocPeriod(period, DEFAULT_CHART_LINE_VROC_PERIOD);
  const out: (number | null)[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < p) {
      out.push(null);
      continue;
    }
    const cur = bars[i];
    const prior = bars[i - p];
    if (
      !cur ||
      !prior ||
      !isFiniteNumber(cur.volume) ||
      !isFiniteNumber(prior.volume)
    ) {
      out.push(null);
      continue;
    }
    if (prior.volume === 0) {
      out.push(null);
      continue;
    }
    out.push((100 * (cur.volume - prior.volume)) / prior.volume);
  }
  return out;
}

/** Classify a bar by the sign of the VROC. */
export function classifyLineVrocZone(vroc: number | null): ChartLineVrocZone {
  if (!isFiniteNumber(vroc)) return 'none';
  if (vroc > 0) return 'up';
  if (vroc < 0) return 'down';
  return 'flat';
}

export interface ChartLineVrocOptions {
  period?: number;
}

/** Run the full VROC pipeline over a set of bars. */
export function runLineVroc(
  data: readonly ChartLineVrocPoint[] | null | undefined,
  options: ChartLineVrocOptions = {},
): ChartLineVrocRun {
  const series = getLineVrocFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineVrocPeriod(
    options.period,
    DEFAULT_CHART_LINE_VROC_PERIOD,
  );
  const vroc = computeLineVroc(series, period);

  const samples: ChartLineVrocSample[] = series.map((bar, index) => {
    const vrocValue = vroc[index] ?? null;
    const priorBar = index - period >= 0 ? series[index - period] : null;
    const priorVolume = priorBar ? priorBar.volume : null;
    return {
      index,
      x: bar.x,
      close: bar.close,
      volume: bar.volume,
      priorVolume,
      vroc: vrocValue,
      zone: classifyLineVrocZone(vrocValue),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let vrocFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.vroc)) vrocFinal = sample.vroc;
  }

  return {
    series,
    period,
    vroc,
    samples,
    vrocFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineVrocLayoutOptions extends ChartLineVrocOptions {
  data: readonly ChartLineVrocPoint[] | null | undefined;
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
export function computeLineVrocLayout(
  options: ChartLineVrocLayoutOptions,
): ChartLineVrocLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_VROC_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_VROC_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_VROC_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_VROC_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_VROC_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineVroc(options.data, {
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
  const vrocPanelTop = pricePanelBottom + gap;
  const vrocPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    vrocPanelBottom - vrocPanelTop > 0;
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

  let vrocMin = 0;
  let vrocMax = 0;
  for (const v of run.vroc) {
    if (!isFiniteNumber(v)) continue;
    if (v < vrocMin) vrocMin = v;
    if (v > vrocMax) vrocMax = v;
  }
  if (vrocMin === vrocMax) {
    vrocMin -= 1;
    vrocMax += 1;
  } else {
    const range = vrocMax - vrocMin;
    vrocMin -= range * 0.05;
    vrocMax += range * 0.05;
  }
  const vrocPanelHeight = vrocPanelBottom - vrocPanelTop;
  const vrocYAt = (value: number): number =>
    vrocPanelBottom -
    ((value - vrocMin) / (vrocMax - vrocMin)) * vrocPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineVrocDot[] = [];
  run.series.forEach((bar, index) => {
    const cx = xAt(index);
    const cy = priceYAt(bar.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: bar.x, cx, cy, close: bar.close });
  });

  const vrocLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineVrocMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.vroc)) return;
    const cx = xAt(index);
    const cy = vrocYAt(sample.vroc);
    vrocLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      vroc: sample.vroc,
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
    vrocPanelTop,
    vrocPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    vrocPath: buildLinePath(vrocLinePoints),
    markers,
    zeroY: vrocYAt(0),
    priceMin,
    priceMax,
    vrocMin,
    vrocMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineVrocChart(
  data: readonly ChartLineVrocPoint[] | null | undefined,
  options: ChartLineVrocOptions = {},
): string {
  const run = runLineVroc(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.vrocFinal === null ? 'n/a' : run.vrocFinal.toFixed(2);
  return (
    `Two-panel chart with the Volume Rate of Change (period ` +
    `${run.period}): the top panel plots the close, the bottom panel ` +
    `plots the VROC. The Volume Rate of Change is the percent change of ` +
    `volume across the lookback -- 100 * (volume - volume[-period]) / ` +
    `volume[-period] -- a momentum gauge for volume that reads positive ` +
    `when volume is expanding, negative when contracting and zero when ` +
    `steady. Across ${total} bars the VROC is positive on ${run.upCount}, ` +
    `negative on ${run.downCount} and flat on ${run.flatCount}. The ` +
    `final VROC reading is ${finalText}.`
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
  zone: ChartLineVrocZone,
  upColor: string,
  downColor: string,
  flatColor: string,
): string {
  if (zone === 'up') return upColor;
  if (zone === 'down') return downColor;
  return flatColor;
}

function zoneLabelOf(zone: ChartLineVrocZone): string {
  if (zone === 'up') return 'Expanding';
  if (zone === 'down') return 'Contracting';
  if (zone === 'flat') return 'Steady';
  return 'n/a';
}

/**
 * ChartLineVroc -- two-panel pure-SVG Volume Rate of Change chart.
 */
export const ChartLineVroc = forwardRef<HTMLDivElement, ChartLineVrocProps>(
  function ChartLineVroc(props, ref) {
    const {
      data,
      period = DEFAULT_CHART_LINE_VROC_PERIOD,
      width = DEFAULT_CHART_LINE_VROC_WIDTH,
      height = DEFAULT_CHART_LINE_VROC_HEIGHT,
      padding = DEFAULT_CHART_LINE_VROC_PADDING,
      gap = DEFAULT_CHART_LINE_VROC_GAP,
      tickCount = DEFAULT_CHART_LINE_VROC_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_VROC_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_VROC_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_VROC_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_VROC_PRICE_COLOR,
      vrocColor = DEFAULT_CHART_LINE_VROC_VROC_COLOR,
      upColor = DEFAULT_CHART_LINE_VROC_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_VROC_DOWN_COLOR,
      flatColor = DEFAULT_CHART_LINE_VROC_FLAT_COLOR,
      zeroColor = DEFAULT_CHART_LINE_VROC_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_VROC_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_VROC_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showVroc = true,
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
    const baseId = `chart-line-vroc-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<
      ChartLineVrocSeriesId[]
    >(defaultHiddenSeries ?? []);
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineVrocSeriesId): boolean =>
      hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineVrocLayout({
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
      ariaDescription ?? describeLineVrocChart(data, { period });
    const resolvedLabel =
      ariaLabel ?? `Volume Rate of Change chart, period ${run.period}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineVrocSeriesId): void => {
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
        <g data-section="chart-line-vroc-tooltip" pointerEvents="none">
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
            data-section="chart-line-vroc-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-vroc-tooltip-close"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Close: ${formatValue(hoverSample.close)}`}
          </text>
          <text
            data-section="chart-line-vroc-tooltip-volume"
            x={tx + 10}
            y={ty + 51}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Volume: ${formatValue(hoverSample.volume)}`}
          </text>
          <text
            data-section="chart-line-vroc-tooltip-vroc"
            x={tx + 10}
            y={ty + 67}
            fill="#c4b5fd"
            fontSize={11}
            fontWeight={600}
          >
            {`VROC: ${
              hoverSample.vroc === null ? 'n/a' : formatValue(hoverSample.vroc)
            }`}
          </text>
          <text
            data-section="chart-line-vroc-tooltip-zone"
            x={tx + 10}
            y={ty + 83}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Volume: ${zoneLabelOf(hoverSample.zone)}`}
          </text>
        </g>
      );
    }

    const priceHidden = isHidden('price');
    const vrocHidden = isHidden('vroc') || !showVroc;

    const legendItems: Array<{
      id: ChartLineVrocSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Close', color: priceColor },
      { id: 'vroc', label: 'VROC', color: vrocColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-vroc"
        data-empty={isEmpty ? 'true' : 'false'}
        data-period={run.period}
        data-vroc-final={run.vrocFinal === null ? '' : run.vrocFinal}
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
          data-section="chart-line-vroc-aria-desc"
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
            data-section="chart-line-vroc-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-vroc-empty"
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
            data-section="chart-line-vroc-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-vroc-grid">
                {tickValues.map((t, i) => {
                  const py =
                    layout.pricePanelBottom -
                    t * (layout.pricePanelBottom - layout.pricePanelTop);
                  return (
                    <line
                      key={`pg-${i}`}
                      data-section="chart-line-vroc-grid-line"
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
                    layout.vrocPanelBottom -
                    t * (layout.vrocPanelBottom - layout.vrocPanelTop);
                  return (
                    <line
                      key={`vg-${i}`}
                      data-section="chart-line-vroc-grid-line"
                      data-panel="vroc"
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
              <g data-section="chart-line-vroc-axes">
                <line
                  data-section="chart-line-vroc-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelTop}
                  x2={layout.innerLeft}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-vroc-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelBottom}
                  x2={layout.innerRight}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-vroc-axis"
                  data-panel="vroc"
                  x1={layout.innerLeft}
                  y1={layout.vrocPanelTop}
                  x2={layout.innerLeft}
                  y2={layout.vrocPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-vroc-axis"
                  data-panel="vroc"
                  x1={layout.innerLeft}
                  y1={layout.vrocPanelBottom}
                  x2={layout.innerRight}
                  y2={layout.vrocPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-vroc-tick-label"
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
                  data-section="chart-line-vroc-tick-label"
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
                  data-section="chart-line-vroc-tick-label"
                  data-panel="vroc"
                  x={layout.innerLeft - 6}
                  y={layout.vrocPanelTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.vrocMax)}
                </text>
                <text
                  data-section="chart-line-vroc-tick-label"
                  data-panel="vroc"
                  x={layout.innerLeft - 6}
                  y={layout.vrocPanelBottom}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.vrocMin)}
                </text>
              </g>
            ) : null}

            <text
              data-section="chart-line-vroc-panel-label"
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
              data-section="chart-line-vroc-panel-label"
              data-panel="vroc"
              x={layout.innerRight}
              y={layout.vrocPanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              Volume Rate of Change
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-vroc-zero-line"
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
                data-section="chart-line-vroc-price-path"
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
              <g data-section="chart-line-vroc-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-vroc-dot"
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

            {!vrocHidden ? (
              <path
                data-section="chart-line-vroc-vroc-line"
                d={layout.vrocPath}
                fill="none"
                stroke={vrocColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`VROC line, ${layout.markers.length} points`}
              />
            ) : null}

            {!vrocHidden && showMarkers ? (
              <g data-section="chart-line-vroc-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-vroc-marker"
                    data-zone={marker.zone}
                    data-vroc={marker.vroc}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={zoneColorOf(marker.zone, upColor, downColor, flatColor)}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, vroc ${formatValue(
                      marker.vroc,
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
              <g data-section="chart-line-vroc-badge">
                <rect
                  data-section="chart-line-vroc-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.pricePanelTop + 4}
                  width={64}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-vroc-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.pricePanelTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`VROC ${run.period}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-vroc-legend"
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
                  data-section="chart-line-vroc-legend-item"
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
                    data-section="chart-line-vroc-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-vroc-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-vroc-legend-stats"
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

ChartLineVroc.displayName = 'ChartLineVroc';
