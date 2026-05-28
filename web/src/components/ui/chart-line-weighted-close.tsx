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
 * ChartLineWeightedClose -- pure-SVG single-panel Weighted Close chart.
 *
 * The Weighted Close averages each bar's high, low and a double-weighted
 * close: `(high + low + 2 * close) / 4`. Giving the close half the total
 * weight pulls the result toward the close, so the Weighted Close hugs the
 * close more tightly than the equal-thirds Typical Price does. This
 * primitive overlays the Weighted Close line on the close line in a single
 * panel and marks, per bar, whether the Weighted Close sits above, below or
 * level with the close.
 */

export interface ChartLineWeightedClosePoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineWeightedCloseZone = 'above' | 'below' | 'equal' | 'none';

export type ChartLineWeightedCloseSeriesId = 'close' | 'weighted';

export interface ChartLineWeightedCloseSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  weighted: number | null;
  zone: ChartLineWeightedCloseZone;
}

export interface ChartLineWeightedCloseRun {
  series: ChartLineWeightedClosePoint[];
  weighted: (number | null)[];
  samples: ChartLineWeightedCloseSample[];
  weightedFinal: number | null;
  closeFinal: number | null;
  aboveCount: number;
  belowCount: number;
  equalCount: number;
  ok: boolean;
}

export interface ChartLineWeightedCloseMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  weighted: number;
  close: number;
  zone: ChartLineWeightedCloseZone;
}

export interface ChartLineWeightedCloseDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineWeightedCloseLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  closePath: string;
  closeDots: ChartLineWeightedCloseDot[];
  weightedPath: string;
  markers: ChartLineWeightedCloseMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineWeightedCloseRun;
}

export interface ChartLineWeightedCloseProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineWeightedClosePoint[];
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  closeColor?: string;
  weightedColor?: string;
  aboveColor?: string;
  belowColor?: string;
  equalColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showWeighted?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineWeightedCloseSeriesId[];
  defaultHiddenSeries?: ChartLineWeightedCloseSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineWeightedCloseSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineWeightedCloseSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_WEIGHTED_CLOSE_WIDTH = 720;
export const DEFAULT_CHART_LINE_WEIGHTED_CLOSE_HEIGHT = 320;
export const DEFAULT_CHART_LINE_WEIGHTED_CLOSE_PADDING = 44;
export const DEFAULT_CHART_LINE_WEIGHTED_CLOSE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_WEIGHTED_CLOSE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_WEIGHTED_CLOSE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_WEIGHTED_CLOSE_CLOSE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_WEIGHTED_CLOSE_WEIGHTED_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_WEIGHTED_CLOSE_ABOVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_WEIGHTED_CLOSE_BELOW_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_WEIGHTED_CLOSE_EQUAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_WEIGHTED_CLOSE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_WEIGHTED_CLOSE_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only bars whose x, high, low and close are all finite. */
export function getLineWeightedCloseFinitePoints(
  data: readonly ChartLineWeightedClosePoint[] | null | undefined,
): ChartLineWeightedClosePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineWeightedClosePoint[] = [];
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
 * Weighted Close per bar: `(high + low + 2 * close) / 4`. A bar with a
 * non-finite high, low or close yields null.
 */
export function computeLineWeightedClose(
  bars: readonly ChartLineWeightedClosePoint[] | null | undefined,
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
      out.push((bar.high + bar.low + 2 * bar.close) / 4);
    } else {
      out.push(null);
    }
  }
  return out;
}

function classifyLineWeightedCloseZone(
  weighted: number | null,
  close: number,
): ChartLineWeightedCloseZone {
  if (!isFiniteNumber(weighted)) return 'none';
  if (weighted > close) return 'above';
  if (weighted < close) return 'below';
  return 'equal';
}

/** Run the full Weighted Close pipeline over a set of bars. */
export function runLineWeightedClose(
  data: readonly ChartLineWeightedClosePoint[] | null | undefined,
): ChartLineWeightedCloseRun {
  const series = getLineWeightedCloseFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const weighted = computeLineWeightedClose(series);

  const samples: ChartLineWeightedCloseSample[] = series.map((bar, index) => {
    const wcValue = weighted[index] ?? null;
    return {
      index,
      x: bar.x,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      weighted: wcValue,
      zone: classifyLineWeightedCloseZone(wcValue, bar.close),
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let equalCount = 0;
  let weightedFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    else if (sample.zone === 'equal') equalCount += 1;
    if (isFiniteNumber(sample.weighted)) weightedFinal = sample.weighted;
  }
  const closeFinal =
    series.length > 0 ? series[series.length - 1]!.close : null;

  return {
    series = [],
    weighted,
    samples,
    weightedFinal,
    closeFinal,
    aboveCount,
    belowCount,
    equalCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineWeightedCloseLayoutOptions {
  data: readonly ChartLineWeightedClosePoint[] | null | undefined;
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
export function computeLineWeightedCloseLayout(
  options: ChartLineWeightedCloseLayoutOptions,
): ChartLineWeightedCloseLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_WEIGHTED_CLOSE_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_WEIGHTED_CLOSE_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_WEIGHTED_CLOSE_PADDING;

  const run = runLineWeightedClose(options.data);

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
    const wc = run.weighted[index];
    if (isFiniteNumber(wc)) {
      if (wc < valueMin) valueMin = wc;
      if (wc > valueMax) valueMax = wc;
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
  const closeDots: ChartLineWeightedCloseDot[] = [];
  run.series.forEach((bar, index) => {
    const cx = xAt(index);
    const cy = yAt(bar.close);
    closeLinePoints.push({ x: cx, y: cy });
    closeDots.push({ index, x: bar.x, cx, cy, close: bar.close });
  });

  const weightedLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineWeightedCloseMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.weighted)) return;
    const cx = xAt(index);
    const cy = yAt(sample.weighted);
    weightedLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      weighted: sample.weighted,
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
    weightedPath: buildLinePath(weightedLinePoints),
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineWeightedCloseChart(
  data: readonly ChartLineWeightedClosePoint[] | null | undefined,
): string {
  const run = runLineWeightedClose(data);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.weightedFinal === null ? 'n/a' : run.weightedFinal.toFixed(2);
  return (
    `Line chart with a Weighted Close overlay: the close line with the ` +
    `Weighted Close -- the average of each bar's high, low and a ` +
    `double-weighted close -- overlaid. The Weighted Close sits above the ` +
    `close on ${run.aboveCount} bars, below on ${run.belowCount} and level ` +
    `on ${run.equalCount}, across ${total} bars. The final Weighted Close ` +
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
  zone: ChartLineWeightedCloseZone,
  aboveColor: string,
  belowColor: string,
  equalColor: string,
): string {
  if (zone === 'above') return aboveColor;
  if (zone === 'below') return belowColor;
  return equalColor;
}

function zoneLabelOf(zone: ChartLineWeightedCloseZone): string {
  if (zone === 'above') return 'Above close';
  if (zone === 'below') return 'Below close';
  if (zone === 'equal') return 'Level with close';
  return 'n/a';
}

/**
 * ChartLineWeightedClose -- single-panel pure-SVG Weighted Close chart.
 */
export const ChartLineWeightedClose = forwardRef<
  HTMLDivElement,
  ChartLineWeightedCloseProps
>(function ChartLineWeightedClose(props, ref) {
  const {
    data,
    width = DEFAULT_CHART_LINE_WEIGHTED_CLOSE_WIDTH,
    height = DEFAULT_CHART_LINE_WEIGHTED_CLOSE_HEIGHT,
    padding = DEFAULT_CHART_LINE_WEIGHTED_CLOSE_PADDING,
    tickCount = DEFAULT_CHART_LINE_WEIGHTED_CLOSE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_WEIGHTED_CLOSE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_WEIGHTED_CLOSE_DOT_RADIUS,
    closeColor = DEFAULT_CHART_LINE_WEIGHTED_CLOSE_CLOSE_COLOR,
    weightedColor = DEFAULT_CHART_LINE_WEIGHTED_CLOSE_WEIGHTED_COLOR,
    aboveColor = DEFAULT_CHART_LINE_WEIGHTED_CLOSE_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_WEIGHTED_CLOSE_BELOW_COLOR,
    equalColor = DEFAULT_CHART_LINE_WEIGHTED_CLOSE_EQUAL_COLOR,
    gridColor = DEFAULT_CHART_LINE_WEIGHTED_CLOSE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_WEIGHTED_CLOSE_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showWeighted = true,
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
  const baseId = `chart-line-weighted-close-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineWeightedCloseSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineWeightedCloseSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () => computeLineWeightedCloseLayout({ data, width, height, padding }),
    [data, width, height, padding],
  );

  const run = layout.run;
  const description = ariaDescription ?? describeLineWeightedCloseChart(data);
  const resolvedLabel =
    ariaLabel ??
    `Weighted Close chart, the average of each bar's high, low and a double-weighted close`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineWeightedCloseSeriesId): void => {
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
    const tooltipW = 176;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    tooltip = (
      <g data-section="chart-line-weighted-close-tooltip" pointerEvents="none">
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
          data-section="chart-line-weighted-close-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-weighted-close-tooltip-high"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`High: ${formatValue(hoverSample.high)}`}
        </text>
        <text
          data-section="chart-line-weighted-close-tooltip-low"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Low: ${formatValue(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-weighted-close-tooltip-close"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-weighted-close-tooltip-weighted"
          x={tx + 10}
          y={ty + 83}
          fill="#5eead4"
          fontSize={11}
          fontWeight={600}
        >
          {`Weighted: ${
            hoverSample.weighted === null
              ? 'n/a'
              : formatValue(hoverSample.weighted)
          } (${zoneLabelOf(hoverSample.zone)})`}
        </text>
      </g>
    );
  }

  const closeHidden = isHidden('close');
  const weightedHidden = isHidden('weighted') || !showWeighted;

  const legendItems: Array<{
    id: ChartLineWeightedCloseSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'close', label: 'Close', color: closeColor },
    { id: 'weighted', label: 'Weighted Close', color: weightedColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-weighted-close"
      data-empty={isEmpty ? 'true' : 'false'}
      data-total-points={run.series.length}
      data-weighted-final={run.weightedFinal === null ? '' : run.weightedFinal}
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
        data-section="chart-line-weighted-close-aria-desc"
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
          data-section="chart-line-weighted-close-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-weighted-close-empty"
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
          data-section="chart-line-weighted-close-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-weighted-close-grid">
              {tickValues.map((t, i) => {
                const gy =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-weighted-close-grid-line"
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
            <g data-section="chart-line-weighted-close-axes">
              <line
                data-section="chart-line-weighted-close-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-weighted-close-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-weighted-close-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-weighted-close-tick-label"
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
              data-section="chart-line-weighted-close-close-path"
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
            <g data-section="chart-line-weighted-close-dots">
              {layout.closeDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-weighted-close-dot"
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

          {!weightedHidden ? (
            <path
              data-section="chart-line-weighted-close-weighted-path"
              d={layout.weightedPath}
              fill="none"
              stroke={weightedColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Weighted Close line, ${layout.markers.length} bars`}
            />
          ) : null}

          {!weightedHidden && showMarkers ? (
            <g data-section="chart-line-weighted-close-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-weighted-close-marker"
                  data-zone={marker.zone}
                  data-weighted={marker.weighted}
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
                  aria-label={`Bar ${formatX(marker.x)}, weighted close ${formatValue(
                    marker.weighted,
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
            <g data-section="chart-line-weighted-close-badge">
              <rect
                data-section="chart-line-weighted-close-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={72}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-weighted-close-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                HLCC/4
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-weighted-close-legend"
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
                data-section="chart-line-weighted-close-legend-item"
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
                  data-section="chart-line-weighted-close-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-weighted-close-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-weighted-close-legend-stats"
            style={{ color: axisColor }}
          >
            {`above ${run.aboveCount} / below ${run.belowCount} / level ${run.equalCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineWeightedClose.displayName = 'ChartLineWeightedClose';
