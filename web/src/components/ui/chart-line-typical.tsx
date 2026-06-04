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
 * ChartLineTypical -- pure-SVG single-panel Typical Price chart.
 *
 * The Typical Price is the simple average of each bar's high, low and
 * close: `(high + low + close) / 3`. It is a smoothed proxy for the bar's
 * "fair" level and feeds many volume-weighted and band indicators. This
 * primitive overlays the Typical Price line on the close line in a single
 * panel and marks, per bar, whether the Typical Price sits above, below or
 * level with the close.
 */

export interface ChartLineTypicalPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineTypicalZone = 'above' | 'below' | 'equal' | 'none';

export type ChartLineTypicalSeriesId = 'close' | 'typical';

export interface ChartLineTypicalSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  typical: number | null;
  zone: ChartLineTypicalZone;
}

export interface ChartLineTypicalRun {
  series: ChartLineTypicalPoint[];
  typical: (number | null)[];
  samples: ChartLineTypicalSample[];
  typicalFinal: number | null;
  closeFinal: number | null;
  aboveCount: number;
  belowCount: number;
  equalCount: number;
  ok: boolean;
}

export interface ChartLineTypicalMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  typical: number;
  close: number;
  zone: ChartLineTypicalZone;
}

export interface ChartLineTypicalDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTypicalLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  closePath: string;
  closeDots: ChartLineTypicalDot[];
  typicalPath: string;
  markers: ChartLineTypicalMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineTypicalRun;
}

export interface ChartLineTypicalProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTypicalPoint[];
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  closeColor?: string;
  typicalColor?: string;
  aboveColor?: string;
  belowColor?: string;
  equalColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTypical?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTypicalSeriesId[];
  defaultHiddenSeries?: ChartLineTypicalSeriesId[];
  onSeriesToggle?: (detail: { seriesId: ChartLineTypicalSeriesId; hidden: boolean }) => void;
  onPointClick?: (detail: { point: ChartLineTypicalSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_TYPICAL_WIDTH = 720;
export const DEFAULT_CHART_LINE_TYPICAL_HEIGHT = 320;
export const DEFAULT_CHART_LINE_TYPICAL_PADDING = 44;
export const DEFAULT_CHART_LINE_TYPICAL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TYPICAL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TYPICAL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TYPICAL_CLOSE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TYPICAL_TYPICAL_COLOR = '#d97706';
export const DEFAULT_CHART_LINE_TYPICAL_ABOVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TYPICAL_BELOW_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TYPICAL_EQUAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_TYPICAL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TYPICAL_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only bars whose x, high, low and close are all finite. */
export function getLineTypicalFinitePoints(
  data: readonly ChartLineTypicalPoint[] | null | undefined,
): ChartLineTypicalPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTypicalPoint[] = [];
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
 * Typical Price per bar: `(high + low + close) / 3`. A bar with a
 * non-finite high, low or close yields null.
 */
export function computeLineTypical(
  bars: readonly ChartLineTypicalPoint[] | null | undefined,
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

function classifyLineTypicalZone(
  typical: number | null,
  close: number,
): ChartLineTypicalZone {
  if (!isFiniteNumber(typical)) return 'none';
  if (typical > close) return 'above';
  if (typical < close) return 'below';
  return 'equal';
}

/** Run the full Typical Price pipeline over a set of bars. */
export function runLineTypical(
  data: readonly ChartLineTypicalPoint[] | null | undefined,
): ChartLineTypicalRun {
  const series = getLineTypicalFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const typical = computeLineTypical(series);

  const samples: ChartLineTypicalSample[] = series.map((bar, index) => {
    const typValue = typical[index] ?? null;
    return {
      index,
      x: bar.x,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      typical: typValue,
      zone: classifyLineTypicalZone(typValue, bar.close),
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let equalCount = 0;
  let typicalFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    else if (sample.zone === 'equal') equalCount += 1;
    if (isFiniteNumber(sample.typical)) typicalFinal = sample.typical;
  }
  const closeFinal =
    series.length > 0 ? series[series.length - 1]!.close : null;

  return {
    series,
    typical,
    samples,
    typicalFinal,
    closeFinal,
    aboveCount,
    belowCount,
    equalCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineTypicalLayoutOptions {
  data: readonly ChartLineTypicalPoint[] | null | undefined;
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
export function computeLineTypicalLayout(
  options: ChartLineTypicalLayoutOptions,
): ChartLineTypicalLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_TYPICAL_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_TYPICAL_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_TYPICAL_PADDING;

  const run = runLineTypical(options.data);

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
    const typ = run.typical[index];
    if (isFiniteNumber(typ)) {
      if (typ < valueMin) valueMin = typ;
      if (typ > valueMax) valueMax = typ;
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
  const closeDots: ChartLineTypicalDot[] = [];
  run.series.forEach((bar, index) => {
    const cx = xAt(index);
    const cy = yAt(bar.close);
    closeLinePoints.push({ x: cx, y: cy });
    closeDots.push({ index, x: bar.x, cx, cy, close: bar.close });
  });

  const typicalLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineTypicalMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.typical)) return;
    const cx = xAt(index);
    const cy = yAt(sample.typical);
    typicalLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      typical: sample.typical,
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
    typicalPath: buildLinePath(typicalLinePoints),
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineTypicalChart(
  data: readonly ChartLineTypicalPoint[] | null | undefined,
): string {
  const run = runLineTypical(data);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.typicalFinal === null ? 'n/a' : run.typicalFinal.toFixed(2);
  return (
    `Line chart with a Typical Price overlay: the close line with the ` +
    `Typical Price -- the average of each bar's high, low and close -- ` +
    `overlaid. The Typical Price sits above the close on ${run.aboveCount} ` +
    `bars, below on ${run.belowCount} and level on ${run.equalCount}, across ` +
    `${total} bars. The final Typical Price is ${finalText}.`
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
  zone: ChartLineTypicalZone,
  aboveColor: string,
  belowColor: string,
  equalColor: string,
): string {
  if (zone === 'above') return aboveColor;
  if (zone === 'below') return belowColor;
  return equalColor;
}

function zoneLabelOf(zone: ChartLineTypicalZone): string {
  if (zone === 'above') return 'Above close';
  if (zone === 'below') return 'Below close';
  if (zone === 'equal') return 'Level with close';
  return 'n/a';
}

/**
 * ChartLineTypical -- single-panel pure-SVG Typical Price chart.
 */
export const ChartLineTypical = forwardRef<HTMLDivElement, ChartLineTypicalProps>(
  function ChartLineTypical(props, ref) {
    const {
      data,
      width = DEFAULT_CHART_LINE_TYPICAL_WIDTH,
      height = DEFAULT_CHART_LINE_TYPICAL_HEIGHT,
      padding = DEFAULT_CHART_LINE_TYPICAL_PADDING,
      tickCount = DEFAULT_CHART_LINE_TYPICAL_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_TYPICAL_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_TYPICAL_DOT_RADIUS,
      closeColor = DEFAULT_CHART_LINE_TYPICAL_CLOSE_COLOR,
      typicalColor = DEFAULT_CHART_LINE_TYPICAL_TYPICAL_COLOR,
      aboveColor = DEFAULT_CHART_LINE_TYPICAL_ABOVE_COLOR,
      belowColor = DEFAULT_CHART_LINE_TYPICAL_BELOW_COLOR,
      equalColor = DEFAULT_CHART_LINE_TYPICAL_EQUAL_COLOR,
      gridColor = DEFAULT_CHART_LINE_TYPICAL_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_TYPICAL_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showTypical = true,
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
    const baseId = `chart-line-typical-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<ChartLineTypicalSeriesId[]>(
      defaultHiddenSeries ?? [],
    );
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineTypicalSeriesId): boolean =>
      hiddenList.includes(id);

    const layout = useMemo(
      () => computeLineTypicalLayout({ data, width, height, padding }),
      [data, width, height, padding],
    );

    const run = layout.run;
    const description = ariaDescription ?? describeLineTypicalChart(data);
    const resolvedLabel =
      ariaLabel ??
      `Typical Price chart, the average of each bar's high, low and close`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineTypicalSeriesId): void => {
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
        <g data-section="chart-line-typical-tooltip" pointerEvents="none">
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
            data-section="chart-line-typical-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-typical-tooltip-high"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`High: ${formatValue(hoverSample.high)}`}
          </text>
          <text
            data-section="chart-line-typical-tooltip-low"
            x={tx + 10}
            y={ty + 51}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Low: ${formatValue(hoverSample.low)}`}
          </text>
          <text
            data-section="chart-line-typical-tooltip-close"
            x={tx + 10}
            y={ty + 67}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Close: ${formatValue(hoverSample.close)}`}
          </text>
          <text
            data-section="chart-line-typical-tooltip-typical"
            x={tx + 10}
            y={ty + 83}
            fill="#fbbf24"
            fontSize={11}
            fontWeight={600}
          >
            {`Typical: ${
              hoverSample.typical === null
                ? 'n/a'
                : formatValue(hoverSample.typical)
            } (${zoneLabelOf(hoverSample.zone)})`}
          </text>
        </g>
      );
    }

    const closeHidden = isHidden('close');
    const typicalHidden = isHidden('typical') || !showTypical;

    const legendItems: Array<{
      id: ChartLineTypicalSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'close', label: 'Close', color: closeColor },
      { id: 'typical', label: 'Typical Price', color: typicalColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-typical"
        data-empty={isEmpty ? 'true' : 'false'}
        data-total-points={run.series.length}
        data-typical-final={run.typicalFinal === null ? '' : run.typicalFinal}
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
          data-section="chart-line-typical-aria-desc"
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
            data-section="chart-line-typical-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-typical-empty"
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
            data-section="chart-line-typical-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-typical-grid">
                {tickValues.map((t, i) => {
                  const gy =
                    layout.innerBottom -
                    t * (layout.innerBottom - layout.innerTop);
                  return (
                    <line
                      key={`g-${i}`}
                      data-section="chart-line-typical-grid-line"
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
              <g data-section="chart-line-typical-axes">
                <line
                  data-section="chart-line-typical-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerTop}
                  x2={layout.innerLeft}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-typical-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerBottom}
                  x2={layout.innerRight}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-typical-tick-label"
                  x={layout.innerLeft - 6}
                  y={layout.innerTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.valueMax)}
                </text>
                <text
                  data-section="chart-line-typical-tick-label"
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
                data-section="chart-line-typical-close-path"
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
              <g data-section="chart-line-typical-dots">
                {layout.closeDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-typical-dot"
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

            {!typicalHidden ? (
              <path
                data-section="chart-line-typical-typical-path"
                d={layout.typicalPath}
                fill="none"
                stroke={typicalColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Typical Price line, ${layout.markers.length} bars`}
              />
            ) : null}

            {!typicalHidden && showMarkers ? (
              <g data-section="chart-line-typical-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-typical-marker"
                    data-zone={marker.zone}
                    data-typical={marker.typical}
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
                    aria-label={`Bar ${formatX(marker.x)}, typical price ${formatValue(
                      marker.typical,
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
              <g data-section="chart-line-typical-badge">
                <rect
                  data-section="chart-line-typical-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.innerTop + 4}
                  width={64}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-typical-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.innerTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  HLC/3
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-typical-legend"
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
                  data-section="chart-line-typical-legend-item"
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
                    data-section="chart-line-typical-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-typical-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-typical-legend-stats"
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

ChartLineTypical.displayName = 'ChartLineTypical';
