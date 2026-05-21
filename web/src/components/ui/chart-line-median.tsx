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
 * ChartLineMedian -- pure-SVG single-panel Median Price chart.
 *
 * The Median Price is the midpoint of each bar's high and low:
 * `(high + low) / 2`. Unlike the Typical Price or the Weighted Close it
 * ignores the close entirely -- it is the pure geometric center of the
 * bar's range. This primitive overlays the Median Price line on the close
 * line in a single panel and marks, per bar, whether the Median Price sits
 * above, below or level with the close.
 */

export interface ChartLineMedianPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineMedianZone = 'above' | 'below' | 'equal' | 'none';

export type ChartLineMedianSeriesId = 'close' | 'median';

export interface ChartLineMedianSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  median: number | null;
  zone: ChartLineMedianZone;
}

export interface ChartLineMedianRun {
  series: ChartLineMedianPoint[];
  median: (number | null)[];
  samples: ChartLineMedianSample[];
  medianFinal: number | null;
  closeFinal: number | null;
  aboveCount: number;
  belowCount: number;
  equalCount: number;
  ok: boolean;
}

export interface ChartLineMedianMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  median: number;
  close: number;
  zone: ChartLineMedianZone;
}

export interface ChartLineMedianDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMedianLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  closePath: string;
  closeDots: ChartLineMedianDot[];
  medianPath: string;
  markers: ChartLineMedianMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineMedianRun;
}

export interface ChartLineMedianProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMedianPoint[];
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  closeColor?: string;
  medianColor?: string;
  aboveColor?: string;
  belowColor?: string;
  equalColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMedian?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMedianSeriesId[];
  defaultHiddenSeries?: ChartLineMedianSeriesId[];
  onSeriesToggle?: (detail: { seriesId: ChartLineMedianSeriesId; hidden: boolean }) => void;
  onPointClick?: (detail: { point: ChartLineMedianSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_MEDIAN_WIDTH = 720;
export const DEFAULT_CHART_LINE_MEDIAN_HEIGHT = 320;
export const DEFAULT_CHART_LINE_MEDIAN_PADDING = 44;
export const DEFAULT_CHART_LINE_MEDIAN_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MEDIAN_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MEDIAN_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MEDIAN_CLOSE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MEDIAN_MEDIAN_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_MEDIAN_ABOVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MEDIAN_BELOW_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MEDIAN_EQUAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_MEDIAN_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MEDIAN_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only bars whose x, high, low and close are all finite. */
export function getLineMedianFinitePoints(
  data: readonly ChartLineMedianPoint[] | null | undefined,
): ChartLineMedianPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMedianPoint[] = [];
  for (const bar of data) {
    if (!bar) continue;
    if (
      isFiniteNumber(bar.x) &&
      isFiniteNumber(bar.high) &&
      isFiniteNumber(bar.low) &&
      isFiniteNumber(bar.close)
    ) {
      out.push({ x: bar.x, high: bar.high, low: bar.low, close: bar.close });
    }
  }
  return out;
}

/**
 * Median Price per bar: `(high + low) / 2`, the midpoint of the bar's
 * range. The close is not read at all. A bar with a non-finite high or low
 * yields null.
 */
export function computeLineMedian(
  bars: readonly ChartLineMedianPoint[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const out: (number | null)[] = [];
  for (const bar of bars) {
    if (bar && isFiniteNumber(bar.high) && isFiniteNumber(bar.low)) {
      out.push((bar.high + bar.low) / 2);
    } else {
      out.push(null);
    }
  }
  return out;
}

function classifyLineMedianZone(
  median: number | null,
  close: number,
): ChartLineMedianZone {
  if (!isFiniteNumber(median)) return 'none';
  if (median > close) return 'above';
  if (median < close) return 'below';
  return 'equal';
}

/** Run the full Median Price pipeline over a set of bars. */
export function runLineMedian(
  data: readonly ChartLineMedianPoint[] | null | undefined,
): ChartLineMedianRun {
  const series = getLineMedianFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const median = computeLineMedian(series);

  const samples: ChartLineMedianSample[] = series.map((bar, index) => {
    const medValue = median[index] ?? null;
    return {
      index,
      x: bar.x,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      median: medValue,
      zone: classifyLineMedianZone(medValue, bar.close),
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let equalCount = 0;
  let medianFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    else if (sample.zone === 'equal') equalCount += 1;
    if (isFiniteNumber(sample.median)) medianFinal = sample.median;
  }
  const closeFinal =
    series.length > 0 ? series[series.length - 1]!.close : null;

  return {
    series,
    median,
    samples,
    medianFinal,
    closeFinal,
    aboveCount,
    belowCount,
    equalCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineMedianLayoutOptions {
  data: readonly ChartLineMedianPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
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

/** Project the run into a single-panel SVG layout. */
export function computeLineMedianLayout(
  options: ChartLineMedianLayoutOptions,
): ChartLineMedianLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_MEDIAN_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_MEDIAN_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_MEDIAN_PADDING;

  const run = runLineMedian(options.data);

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
  run.series.forEach((bar, index) => {
    if (bar.close < valueMin) valueMin = bar.close;
    if (bar.close > valueMax) valueMax = bar.close;
    const med = run.median[index];
    if (isFiniteNumber(med)) {
      if (med < valueMin) valueMin = med;
      if (med > valueMax) valueMax = med;
    }
  });
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

  const closeLinePoints: Array<{ x: number; y: number }> = [];
  const closeDots: ChartLineMedianDot[] = [];
  run.series.forEach((bar, index) => {
    const cx = xAt(index);
    const cy = yAt(bar.close);
    closeLinePoints.push({ x: cx, y: cy });
    closeDots.push({ index, x: bar.x, cx, cy, close: bar.close });
  });

  const medianLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineMedianMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.median)) return;
    const cx = xAt(index);
    const cy = yAt(sample.median);
    medianLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      median: sample.median,
      close: sample.close,
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
    closePath: buildLinePath(closeLinePoints),
    closeDots,
    medianPath: buildLinePath(medianLinePoints),
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineMedianChart(
  data: readonly ChartLineMedianPoint[] | null | undefined,
): string {
  const run = runLineMedian(data);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.medianFinal === null ? 'n/a' : run.medianFinal.toFixed(2);
  return (
    `Line chart with a Median Price overlay: the close line with the ` +
    `Median Price -- the midpoint of each bar's high and low -- overlaid. ` +
    `The Median Price sits above the close on ${run.aboveCount} bars, below ` +
    `on ${run.belowCount} and level on ${run.equalCount}, across ${total} ` +
    `bars. The final Median Price is ${finalText}.`
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
  zone: ChartLineMedianZone,
  aboveColor: string,
  belowColor: string,
  equalColor: string,
): string {
  if (zone === 'above') return aboveColor;
  if (zone === 'below') return belowColor;
  return equalColor;
}

function zoneLabelOf(zone: ChartLineMedianZone): string {
  if (zone === 'above') return 'Above close';
  if (zone === 'below') return 'Below close';
  if (zone === 'equal') return 'Level with close';
  return 'n/a';
}

/**
 * ChartLineMedian -- single-panel pure-SVG Median Price chart.
 */
export const ChartLineMedian = forwardRef<HTMLDivElement, ChartLineMedianProps>(
  function ChartLineMedian(props, ref) {
    const {
      data,
      width = DEFAULT_CHART_LINE_MEDIAN_WIDTH,
      height = DEFAULT_CHART_LINE_MEDIAN_HEIGHT,
      padding = DEFAULT_CHART_LINE_MEDIAN_PADDING,
      tickCount = DEFAULT_CHART_LINE_MEDIAN_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_MEDIAN_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_MEDIAN_DOT_RADIUS,
      closeColor = DEFAULT_CHART_LINE_MEDIAN_CLOSE_COLOR,
      medianColor = DEFAULT_CHART_LINE_MEDIAN_MEDIAN_COLOR,
      aboveColor = DEFAULT_CHART_LINE_MEDIAN_ABOVE_COLOR,
      belowColor = DEFAULT_CHART_LINE_MEDIAN_BELOW_COLOR,
      equalColor = DEFAULT_CHART_LINE_MEDIAN_EQUAL_COLOR,
      gridColor = DEFAULT_CHART_LINE_MEDIAN_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_MEDIAN_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showMedian = true,
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
    const baseId = `chart-line-median-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<ChartLineMedianSeriesId[]>(
      defaultHiddenSeries ?? [],
    );
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineMedianSeriesId): boolean =>
      hiddenList.includes(id);

    const layout = useMemo(
      () => computeLineMedianLayout({ data, width, height, padding }),
      [data, width, height, padding],
    );

    const run = layout.run;
    const description = ariaDescription ?? describeLineMedianChart(data);
    const resolvedLabel =
      ariaLabel ??
      `Median Price chart, the midpoint of each bar's high and low`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineMedianSeriesId): void => {
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
      const dot = layout.closeDots[hoverSample.index];
      const anchorX = dot ? dot.cx : (layout.innerLeft + layout.innerRight) / 2;
      const tooltipW = 168;
      const rawX = anchorX + 12;
      const tx = Math.min(rawX, layout.width - tooltipW - 4);
      const ty = layout.innerTop + 6;
      tooltip = (
        <g data-section="chart-line-median-tooltip" pointerEvents="none">
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
            data-section="chart-line-median-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-median-tooltip-high"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`High: ${formatValue(hoverSample.high)}`}
          </text>
          <text
            data-section="chart-line-median-tooltip-low"
            x={tx + 10}
            y={ty + 51}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Low: ${formatValue(hoverSample.low)}`}
          </text>
          <text
            data-section="chart-line-median-tooltip-close"
            x={tx + 10}
            y={ty + 67}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Close: ${formatValue(hoverSample.close)}`}
          </text>
          <text
            data-section="chart-line-median-tooltip-median"
            x={tx + 10}
            y={ty + 83}
            fill="#c4b5fd"
            fontSize={11}
            fontWeight={600}
          >
            {`Median: ${
              hoverSample.median === null
                ? 'n/a'
                : formatValue(hoverSample.median)
            } (${zoneLabelOf(hoverSample.zone)})`}
          </text>
        </g>
      );
    }

    const closeHidden = isHidden('close');
    const medianHidden = isHidden('median') || !showMedian;

    const legendItems: Array<{
      id: ChartLineMedianSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'close', label: 'Close', color: closeColor },
      { id: 'median', label: 'Median Price', color: medianColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-median"
        data-empty={isEmpty ? 'true' : 'false'}
        data-total-points={run.series.length}
        data-median-final={run.medianFinal === null ? '' : run.medianFinal}
        data-close-final={run.closeFinal === null ? '' : run.closeFinal}
        data-above-count={run.aboveCount}
        data-below-count={run.belowCount}
        data-equal-count={run.equalCount}
        data-animate={animate ? 'true' : 'false'}
        role="region"
        aria-label={resolvedLabel}
        aria-describedby={descId}
      >
        <span
          id={descId}
          data-section="chart-line-median-aria-desc"
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
            data-section="chart-line-median-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-median-empty"
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
            data-section="chart-line-median-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-median-grid">
                {tickValues.map((t, i) => {
                  const gy =
                    layout.innerBottom -
                    t * (layout.innerBottom - layout.innerTop);
                  return (
                    <line
                      key={`g-${i}`}
                      data-section="chart-line-median-grid-line"
                      x1={layout.innerLeft}
                      y1={gy}
                      x2={layout.innerRight}
                      y2={gy}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  );
                })}
              </g>
            ) : null}

            {showAxis ? (
              <g data-section="chart-line-median-axes">
                <line
                  data-section="chart-line-median-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerTop}
                  x2={layout.innerLeft}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-median-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerBottom}
                  x2={layout.innerRight}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-median-tick-label"
                  x={layout.innerLeft - 6}
                  y={layout.innerTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.valueMax)}
                </text>
                <text
                  data-section="chart-line-median-tick-label"
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

            {!closeHidden ? (
              <path
                data-section="chart-line-median-close-path"
                d={layout.closePath}
                fill="none"
                stroke={closeColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Close line, ${run.series.length} bars`}
              />
            ) : null}

            {!closeHidden && showDots ? (
              <g data-section="chart-line-median-dots">
                {layout.closeDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-median-dot"
                    cx={dot.cx}
                    cy={dot.cy}
                    r={dotRadius}
                    fill={closeColor}
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

            {!medianHidden ? (
              <path
                data-section="chart-line-median-median-path"
                d={layout.medianPath}
                fill="none"
                stroke={medianColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Median Price line, ${layout.markers.length} bars`}
              />
            ) : null}

            {!medianHidden && showMarkers ? (
              <g data-section="chart-line-median-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-median-marker"
                    data-zone={marker.zone}
                    data-median={marker.median}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={zoneColorOf(
                      marker.zone,
                      aboveColor,
                      belowColor,
                      equalColor,
                    )}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, median price ${formatValue(
                      marker.median,
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
              <g data-section="chart-line-median-badge">
                <rect
                  data-section="chart-line-median-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.innerTop + 4}
                  width={56}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-median-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.innerTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  HL/2
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-median-legend"
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
                  data-section="chart-line-median-legend-item"
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
                    data-section="chart-line-median-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-median-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-median-legend-stats"
              style={{ color: axisColor }}
            >
              {`above ${run.aboveCount} / below ${run.belowCount} / level ${run.equalCount}`}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineMedian.displayName = 'ChartLineMedian';
