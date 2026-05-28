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
 * ChartLinePascal -- pure-SVG single-panel Pascal Triangle Moving Average
 * chart.
 *
 * The Pascal Triangle Moving Average (PMA) weights its lookback window by
 * the binomial coefficients of a Pascal's triangle row: for a window of
 * `period` values the weights are `C(period - 1, k)`, k = 0..period-1.
 * Those coefficients form a symmetric bell that peaks in the middle of the
 * window and, as the window grows, approaches a Gaussian. The row sums to
 * `2^(period-1)`, so the normalizer is a power of two -- the PMA of
 * integer prices is exact.
 *
 * This primitive overlays the PMA line on the price line in a single panel
 * and marks, per bar, whether the PMA sits above, below or level with the
 * price.
 */

export interface ChartLinePascalPoint {
  x: number;
  value: number;
}

export type ChartLinePascalZone = 'above' | 'below' | 'equal' | 'none';

export type ChartLinePascalSeriesId = 'price' | 'pma';

export interface ChartLinePascalSample {
  index: number;
  x: number;
  value: number;
  pma: number | null;
  zone: ChartLinePascalZone;
}

export interface ChartLinePascalRun {
  series: ChartLinePascalPoint[];
  period: number;
  weights: number[];
  pma: (number | null)[];
  samples: ChartLinePascalSample[];
  pmaFinal: number | null;
  aboveCount: number;
  belowCount: number;
  equalCount: number;
  ok: boolean;
}

export interface ChartLinePascalMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  pma: number;
  value: number;
  zone: ChartLinePascalZone;
}

export interface ChartLinePascalDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLinePascalLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLinePascalDot[];
  pmaPath: string;
  markers: ChartLinePascalMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLinePascalRun;
}

export interface ChartLinePascalProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLinePascalPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  pmaColor?: string;
  aboveColor?: string;
  belowColor?: string;
  equalColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPma?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLinePascalSeriesId[];
  defaultHiddenSeries?: ChartLinePascalSeriesId[];
  onSeriesToggle?: (detail: { seriesId: ChartLinePascalSeriesId; hidden: boolean }) => void;
  onPointClick?: (detail: { point: ChartLinePascalSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_PASCAL_WIDTH = 720;
export const DEFAULT_CHART_LINE_PASCAL_HEIGHT = 320;
export const DEFAULT_CHART_LINE_PASCAL_PADDING = 44;
export const DEFAULT_CHART_LINE_PASCAL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PASCAL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PASCAL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PASCAL_PERIOD = 5;
export const DEFAULT_CHART_LINE_PASCAL_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_PASCAL_PMA_COLOR = '#db2777';
export const DEFAULT_CHART_LINE_PASCAL_ABOVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PASCAL_BELOW_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PASCAL_EQUAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_PASCAL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PASCAL_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLinePascalFinitePoints(
  data: readonly ChartLinePascalPoint[] | null | undefined,
): ChartLinePascalPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLinePascalPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce a period to an integer >= 1, else the fallback. */
export function normalizeLinePascalPeriod(
  period: unknown,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const floored = Math.floor(period);
  if (floored < 1) return fallback;
  return floored;
}

/**
 * The binomial weights for a window of `period` slots: row `period - 1` of
 * Pascal's triangle, `C(period - 1, k)`. Built by the additive Pascal
 * recurrence so every weight is an exact integer.
 */
export function computeLinePascalWeights(period: number): number[] {
  const p = normalizeLinePascalPeriod(period, 1);
  let row: number[] = [1];
  for (let r = 1; r < p; r += 1) {
    const next: number[] = [1];
    for (let k = 1; k < r; k += 1) {
      next.push((row[k - 1] as number) + (row[k] as number));
    }
    next.push(1);
    row = next;
  }
  return row;
}

/**
 * Pascal Triangle Moving Average: the binomial-weighted average of each
 * full window, `sum(C(period-1,k) * value[k]) / 2^(period-1)`. Defined once
 * a full window is available; a window with a non-finite value yields null.
 */
export function computeLinePascal(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLinePascalPeriod(period, 1);
  const weights = computeLinePascalWeights(p);
  let weightSum = 0;
  for (const w of weights) weightSum += w;
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i + 1 < p || weightSum <= 0) {
      out.push(null);
      continue;
    }
    let acc = 0;
    let ok = true;
    for (let k = 0; k < p; k += 1) {
      const v = values[i - p + 1 + k];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      acc += weights[k]! * v;
    }
    out.push(ok ? acc / weightSum : null);
  }
  return out;
}

/** Classify a bar by where the PMA sits relative to the price. */
export function classifyLinePascalZone(
  pma: number | null,
  value: number,
): ChartLinePascalZone {
  if (!isFiniteNumber(pma)) return 'none';
  if (pma > value) return 'above';
  if (pma < value) return 'below';
  return 'equal';
}

export interface ChartLinePascalOptions {
  period?: number;
}

/** Run the full Pascal Triangle Moving Average pipeline over a set of points. */
export function runLinePascal(
  data: readonly ChartLinePascalPoint[] | null | undefined,
  options: ChartLinePascalOptions = {},
): ChartLinePascalRun {
  const series = getLinePascalFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLinePascalPeriod(
    options.period,
    DEFAULT_CHART_LINE_PASCAL_PERIOD,
  );
  const weights = computeLinePascalWeights(period);
  const values = series.map((point) => point.value);
  const pma = computeLinePascal(values, period);

  const samples: ChartLinePascalSample[] = series.map((point, index) => {
    const pmaValue = pma[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      pma: pmaValue,
      zone: classifyLinePascalZone(pmaValue, point.value),
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let equalCount = 0;
  let pmaFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    else if (sample.zone === 'equal') equalCount += 1;
    if (isFiniteNumber(sample.pma)) pmaFinal = sample.pma;
  }

  return {
    series = [],
    period,
    weights,
    pma,
    samples,
    pmaFinal,
    aboveCount,
    belowCount,
    equalCount,
    ok: series.length >= 2,
  };
}

export interface ChartLinePascalLayoutOptions extends ChartLinePascalOptions {
  data: readonly ChartLinePascalPoint[] | null | undefined;
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
export function computeLinePascalLayout(
  options: ChartLinePascalLayoutOptions,
): ChartLinePascalLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_PASCAL_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_PASCAL_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_PASCAL_PADDING;

  const run = runLinePascal(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
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
  run.series.forEach((point, index) => {
    if (point.value < valueMin) valueMin = point.value;
    if (point.value > valueMax) valueMax = point.value;
    const m = run.pma[index];
    if (isFiniteNumber(m)) {
      if (m < valueMin) valueMin = m;
      if (m > valueMax) valueMax = m;
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

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLinePascalDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = yAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const pmaLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLinePascalMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.pma)) return;
    const cx = xAt(index);
    const cy = yAt(sample.pma);
    pmaLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      pma: sample.pma,
      value: sample.value,
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
    pmaPath: buildLinePath(pmaLinePoints),
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLinePascalChart(
  data: readonly ChartLinePascalPoint[] | null | undefined,
  options: ChartLinePascalOptions = {},
): string {
  const run = runLinePascal(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.pmaFinal === null ? 'n/a' : run.pmaFinal.toFixed(2);
  return (
    `Line chart with a Pascal Triangle Moving Average overlay: the price ` +
    `line with a ${run.period}-period PMA -- a moving average that weights ` +
    `its lookback window by the binomial coefficients of a Pascal's ` +
    `triangle row, a symmetric bell peaking in the middle of the window -- ` +
    `overlaid. The PMA sits above the price on ${run.aboveCount} bars, ` +
    `below on ${run.belowCount} and level on ${run.equalCount}, across ` +
    `${total} bars. The final PMA is ${finalText}.`
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
  zone: ChartLinePascalZone,
  aboveColor: string,
  belowColor: string,
  equalColor: string,
): string {
  if (zone === 'above') return aboveColor;
  if (zone === 'below') return belowColor;
  return equalColor;
}

function zoneLabelOf(zone: ChartLinePascalZone): string {
  if (zone === 'above') return 'PMA above price';
  if (zone === 'below') return 'PMA below price';
  if (zone === 'equal') return 'PMA level with price';
  return 'n/a';
}

/**
 * ChartLinePascal -- single-panel pure-SVG Pascal Triangle Moving Average
 * chart.
 */
export const ChartLinePascal = forwardRef<HTMLDivElement, ChartLinePascalProps>(
  function ChartLinePascal(props, ref) {
    const {
      data,
      period = DEFAULT_CHART_LINE_PASCAL_PERIOD,
      width = DEFAULT_CHART_LINE_PASCAL_WIDTH,
      height = DEFAULT_CHART_LINE_PASCAL_HEIGHT,
      padding = DEFAULT_CHART_LINE_PASCAL_PADDING,
      tickCount = DEFAULT_CHART_LINE_PASCAL_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_PASCAL_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_PASCAL_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_PASCAL_PRICE_COLOR,
      pmaColor = DEFAULT_CHART_LINE_PASCAL_PMA_COLOR,
      aboveColor = DEFAULT_CHART_LINE_PASCAL_ABOVE_COLOR,
      belowColor = DEFAULT_CHART_LINE_PASCAL_BELOW_COLOR,
      equalColor = DEFAULT_CHART_LINE_PASCAL_EQUAL_COLOR,
      gridColor = DEFAULT_CHART_LINE_PASCAL_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_PASCAL_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showPma = true,
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
    const baseId = `chart-line-pascal-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<ChartLinePascalSeriesId[]>(
      defaultHiddenSeries ?? [],
    );
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLinePascalSeriesId): boolean =>
      hiddenList.includes(id);

    const layout = useMemo(
      () => computeLinePascalLayout({ data, period, width, height, padding }),
      [data, period, width, height, padding],
    );

    const run = layout.run;
    const description =
      ariaDescription ?? describeLinePascalChart(data, { period });
    const resolvedLabel =
      ariaLabel ?? `Pascal Triangle Moving Average chart, period ${run.period}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLinePascalSeriesId): void => {
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
      const ty = layout.innerTop + 6;
      tooltip = (
        <g data-section="chart-line-pascal-tooltip" pointerEvents="none">
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
            data-section="chart-line-pascal-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-pascal-tooltip-value"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Price: ${formatValue(hoverSample.value)}`}
          </text>
          <text
            data-section="chart-line-pascal-tooltip-pma"
            x={tx + 10}
            y={ty + 51}
            fill="#f9a8d4"
            fontSize={11}
            fontWeight={600}
          >
            {`PMA: ${
              hoverSample.pma === null ? 'n/a' : formatValue(hoverSample.pma)
            }`}
          </text>
          <text
            data-section="chart-line-pascal-tooltip-zone"
            x={tx + 10}
            y={ty + 67}
            fill="#cbd5e1"
            fontSize={11}
          >
            {zoneLabelOf(hoverSample.zone)}
          </text>
        </g>
      );
    }

    const priceHidden = isHidden('price');
    const pmaHidden = isHidden('pma') || !showPma;

    const legendItems: Array<{
      id: ChartLinePascalSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'pma', label: `PMA ${run.period}`, color: pmaColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-pascal"
        data-empty={isEmpty ? 'true' : 'false'}
        data-period={run.period}
        data-pma-final={run.pmaFinal === null ? '' : run.pmaFinal}
        data-above-count={run.aboveCount}
        data-below-count={run.belowCount}
        data-equal-count={run.equalCount}
        data-total-points={run.series.length}
        data-animate={animate ? 'true' : 'false'}
        role="region"
        aria-label={resolvedLabel}
        aria-describedby={descId}
      >
        <span
          id={descId}
          data-section="chart-line-pascal-aria-desc"
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
            data-section="chart-line-pascal-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-pascal-empty"
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
            data-section="chart-line-pascal-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-pascal-grid">
                {tickValues.map((t, i) => {
                  const gy =
                    layout.innerBottom -
                    t * (layout.innerBottom - layout.innerTop);
                  return (
                    <line
                      key={`g-${i}`}
                      data-section="chart-line-pascal-grid-line"
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
              <g data-section="chart-line-pascal-axes">
                <line
                  data-section="chart-line-pascal-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerTop}
                  x2={layout.innerLeft}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-pascal-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerBottom}
                  x2={layout.innerRight}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-pascal-tick-label"
                  x={layout.innerLeft - 6}
                  y={layout.innerTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.valueMax)}
                </text>
                <text
                  data-section="chart-line-pascal-tick-label"
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
                data-section="chart-line-pascal-price-path"
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
              <g data-section="chart-line-pascal-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-pascal-dot"
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

            {!pmaHidden ? (
              <path
                data-section="chart-line-pascal-pma-path"
                d={layout.pmaPath}
                fill="none"
                stroke={pmaColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Pascal Triangle Moving Average line, ${layout.markers.length} bars`}
              />
            ) : null}

            {!pmaHidden && showMarkers ? (
              <g data-section="chart-line-pascal-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-pascal-marker"
                    data-zone={marker.zone}
                    data-pma={marker.pma}
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
                    aria-label={`Bar ${formatX(marker.x)}, PMA ${formatValue(
                      marker.pma,
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
              <g data-section="chart-line-pascal-badge">
                <rect
                  data-section="chart-line-pascal-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.innerTop + 4}
                  width={68}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-pascal-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.innerTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`PMA ${run.period}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-pascal-legend"
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
                  data-section="chart-line-pascal-legend-item"
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
                    data-section="chart-line-pascal-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-pascal-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-pascal-legend-stats"
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

ChartLinePascal.displayName = 'ChartLinePascal';
