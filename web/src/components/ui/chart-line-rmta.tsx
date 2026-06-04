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
 * ChartLineRmta -- pure-SVG single-panel Recursive Moving Trend Average
 * chart.
 *
 * The Recursive Moving Trend Average folds the price into a recursive
 * EMA-like trend with a momentum lead. Each bar runs two corrections on
 * the running average: a plain EMA pull toward the current price, and a
 * direct add of the one-bar price change to compensate the EMA lag:
 *
 *   rmta[0] = price[0]
 *   rmta[i] = rmta[i-1]
 *           + alpha * (price[i] - rmta[i-1])   -- EMA pull
 *           + beta  * (price[i] - price[i-1])  -- momentum lead
 *
 * With `alpha + beta < 1` the line lags the price (a smoothed trend);
 * with `alpha + beta = 1` the lag vanishes and the line tracks the
 * price exactly. The momentum lead is the "recursive trend" part of the
 * name -- on top of a plain exponential average, the recurrence folds
 * the most recent price step in, so the line catches a turn faster than
 * a same-period EMA.
 *
 * This primitive overlays the RMTA on the price in a single panel and
 * marks each bar by the slope of the RMTA line.
 */

export interface ChartLineRmtaPoint {
  x: number;
  value: number;
}

export type ChartLineRmtaTrend = 'up' | 'down' | 'flat' | 'none';

export type ChartLineRmtaSeriesId = 'price' | 'rmta';

export interface ChartLineRmtaSample {
  index: number;
  x: number;
  value: number;
  rmta: number | null;
  trend: ChartLineRmtaTrend;
}

export interface ChartLineRmtaRun {
  series: ChartLineRmtaPoint[];
  alpha: number;
  beta: number;
  rmta: number[];
  samples: ChartLineRmtaSample[];
  rmtaFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineRmtaMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  rmta: number;
  trend: ChartLineRmtaTrend;
}

export interface ChartLineRmtaDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineRmtaLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineRmtaDot[];
  rmtaPath: string;
  markers: ChartLineRmtaMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineRmtaRun;
}

export interface ChartLineRmtaProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRmtaPoint[];
  alpha?: number;
  beta?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  rmtaColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRmta?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRmtaSeriesId[];
  defaultHiddenSeries?: ChartLineRmtaSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRmtaSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineRmtaSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_RMTA_WIDTH = 720;
export const DEFAULT_CHART_LINE_RMTA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_RMTA_PADDING = 44;
export const DEFAULT_CHART_LINE_RMTA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RMTA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RMTA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RMTA_ALPHA = 0.1;
export const DEFAULT_CHART_LINE_RMTA_BETA = 0.5;
export const DEFAULT_CHART_LINE_RMTA_PRICE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RMTA_RMTA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_RMTA_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RMTA_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RMTA_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_RMTA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RMTA_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineRmtaFinitePoints(
  data: readonly ChartLineRmtaPoint[] | null | undefined,
): ChartLineRmtaPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRmtaPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce a weight to a finite number in (0, 2), else fallback. */
export function normalizeLineRmtaWeight(
  weight: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(weight) && weight > 0 && weight < 2) return weight;
  return fallback;
}

/**
 * Compute the Recursive Moving Trend Average from a value series. The
 * line seeds from the first finite value and recurses with the EMA pull
 * `alpha * (price - rmta[-1])` plus the momentum lead
 * `beta * (price - price[-1])`. Non-finite values carry the prior
 * average forward.
 */
export function computeLineRmta(
  values: readonly number[] | null | undefined,
  alpha: unknown,
  beta: unknown,
): number[] {
  if (!Array.isArray(values)) return [];
  const a = normalizeLineRmtaWeight(alpha, DEFAULT_CHART_LINE_RMTA_ALPHA);
  const b = normalizeLineRmtaWeight(beta, DEFAULT_CHART_LINE_RMTA_BETA);
  const n = values.length;
  const out: number[] = new Array(n).fill(0);
  let prevRmta = 0;
  let prevPrice = 0;
  let seeded = false;
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (!isFiniteNumber(v)) {
      out[i] = seeded ? prevRmta : 0;
      continue;
    }
    if (!seeded) {
      out[i] = v;
      prevRmta = v;
      prevPrice = v;
      seeded = true;
      continue;
    }
    const newRmta = prevRmta + a * (v - prevRmta) + b * (v - prevPrice);
    out[i] = newRmta;
    prevRmta = newRmta;
    prevPrice = v;
  }
  return out;
}

/** Classify a bar by the slope of the RMTA line. */
export function classifyLineRmtaTrend(
  rmta: number | null,
  prevRmta: number | null,
): ChartLineRmtaTrend {
  if (!isFiniteNumber(rmta) || !isFiniteNumber(prevRmta)) return 'none';
  if (rmta > prevRmta) return 'up';
  if (rmta < prevRmta) return 'down';
  return 'flat';
}

export interface ChartLineRmtaOptions {
  alpha?: number;
  beta?: number;
}

/** Run the full RMTA pipeline over a set of points. */
export function runLineRmta(
  data: readonly ChartLineRmtaPoint[] | null | undefined,
  options: ChartLineRmtaOptions = {},
): ChartLineRmtaRun {
  const series = getLineRmtaFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const alpha = normalizeLineRmtaWeight(
    options.alpha,
    DEFAULT_CHART_LINE_RMTA_ALPHA,
  );
  const beta = normalizeLineRmtaWeight(
    options.beta,
    DEFAULT_CHART_LINE_RMTA_BETA,
  );
  const values = series.map((p) => p.value);
  const rmta = computeLineRmta(values, alpha, beta);

  const samples: ChartLineRmtaSample[] = series.map((point, index) => {
    const rmtaValue = rmta[index] ?? null;
    const prevRmta = index > 0 ? rmta[index - 1] ?? null : null;
    return {
      index,
      x: point.x,
      value: point.value,
      rmta: rmtaValue,
      trend: classifyLineRmtaTrend(rmtaValue, prevRmta),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let rmtaFinal: number | null = null;
  for (const sample of samples) {
    if (sample.trend === 'up') upCount += 1;
    else if (sample.trend === 'down') downCount += 1;
    else if (sample.trend === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.rmta)) rmtaFinal = sample.rmta;
  }

  return {
    series,
    alpha,
    beta,
    rmta,
    samples,
    rmtaFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineRmtaLayoutOptions extends ChartLineRmtaOptions {
  data: readonly ChartLineRmtaPoint[] | null | undefined;
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
export function computeLineRmtaLayout(
  options: ChartLineRmtaLayoutOptions,
): ChartLineRmtaLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_RMTA_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_RMTA_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_RMTA_PADDING;

  const run = runLineRmta(options.data, {
    ...(options.alpha !== undefined ? { alpha: options.alpha } : {}),
    ...(options.beta !== undefined ? { beta: options.beta } : {}),
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
  run.samples.forEach((sample, index) => {
    if (sample.value < valueMin) valueMin = sample.value;
    if (sample.value > valueMax) valueMax = sample.value;
    const r = run.rmta[index];
    if (isFiniteNumber(r)) {
      if (r < valueMin) valueMin = r;
      if (r > valueMax) valueMax = r;
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
  const priceDots: ChartLineRmtaDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, value: sample.value });
  });

  const rmtaLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineRmtaMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.rmta)) return;
    const cx = xAt(index);
    const cy = yAt(sample.rmta);
    rmtaLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      rmta: sample.rmta,
      trend: sample.trend,
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
    rmtaPath: buildLinePath(rmtaLinePoints),
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineRmtaChart(
  data: readonly ChartLineRmtaPoint[] | null | undefined,
  options: ChartLineRmtaOptions = {},
): string {
  const run = runLineRmta(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.rmtaFinal === null ? 'n/a' : run.rmtaFinal.toFixed(2);
  return (
    `Line chart with a Recursive Moving Trend Average overlay (alpha ` +
    `${run.alpha}, beta ${run.beta}): the price with the RMTA line ` +
    `overlaid. The RMTA folds the price into a recursive EMA-like ` +
    `trend by pulling the running average toward each new price and ` +
    `adding the one-bar price change directly as a momentum lead, so ` +
    `the line catches turns faster than a same-period exponential ` +
    `average. Across ${total} bars the RMTA rises on ${run.upCount}, ` +
    `falls on ${run.downCount} and is flat on ${run.flatCount}. The ` +
    `final RMTA reading is ${finalText}.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function trendColorOf(
  trend: ChartLineRmtaTrend,
  upColor: string,
  downColor: string,
  flatColor: string,
): string {
  if (trend === 'up') return upColor;
  if (trend === 'down') return downColor;
  return flatColor;
}

function trendLabelOf(trend: ChartLineRmtaTrend): string {
  if (trend === 'up') return 'Rising';
  if (trend === 'down') return 'Falling';
  if (trend === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineRmta -- single-panel pure-SVG Recursive Moving Trend Average
 * chart.
 */
export const ChartLineRmta = forwardRef<HTMLDivElement, ChartLineRmtaProps>(
  function ChartLineRmta(props, ref) {
    const {
      data,
      alpha = DEFAULT_CHART_LINE_RMTA_ALPHA,
      beta = DEFAULT_CHART_LINE_RMTA_BETA,
      width = DEFAULT_CHART_LINE_RMTA_WIDTH,
      height = DEFAULT_CHART_LINE_RMTA_HEIGHT,
      padding = DEFAULT_CHART_LINE_RMTA_PADDING,
      tickCount = DEFAULT_CHART_LINE_RMTA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_RMTA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_RMTA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_RMTA_PRICE_COLOR,
      rmtaColor = DEFAULT_CHART_LINE_RMTA_RMTA_COLOR,
      upColor = DEFAULT_CHART_LINE_RMTA_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_RMTA_DOWN_COLOR,
      flatColor = DEFAULT_CHART_LINE_RMTA_FLAT_COLOR,
      gridColor = DEFAULT_CHART_LINE_RMTA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_RMTA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showRmta = true,
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
    const baseId = `chart-line-rmta-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<ChartLineRmtaSeriesId[]>(
      defaultHiddenSeries ?? [],
    );
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineRmtaSeriesId): boolean =>
      hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineRmtaLayout({ data, alpha, beta, width, height, padding }),
      [data, alpha, beta, width, height, padding],
    );

    const run = layout.run;
    const description =
      ariaDescription ?? describeLineRmtaChart(data, { alpha, beta });
    const resolvedLabel =
      ariaLabel ??
      `Recursive Moving Trend Average chart, alpha ${run.alpha} beta ${run.beta}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineRmtaSeriesId): void => {
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
      const tooltipW = 180;
      const rawX = anchorX + 12;
      const tx = Math.min(rawX, layout.width - tooltipW - 4);
      const ty = layout.innerTop + 6;
      tooltip = (
        <g data-section="chart-line-rmta-tooltip" pointerEvents="none">
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
            data-section="chart-line-rmta-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-rmta-tooltip-value"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Price: ${formatValue(hoverSample.value)}`}
          </text>
          <text
            data-section="chart-line-rmta-tooltip-rmta"
            x={tx + 10}
            y={ty + 51}
            fill="#c4b5fd"
            fontSize={11}
            fontWeight={600}
          >
            {`RMTA: ${
              hoverSample.rmta === null
                ? 'n/a'
                : formatValue(hoverSample.rmta)
            }`}
          </text>
          <text
            data-section="chart-line-rmta-tooltip-trend"
            x={tx + 10}
            y={ty + 67}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Trend: ${trendLabelOf(hoverSample.trend)}`}
          </text>
        </g>
      );
    }

    const priceHidden = isHidden('price');
    const rmtaHidden = isHidden('rmta') || !showRmta;

    const legendItems: Array<{
      id: ChartLineRmtaSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'rmta', label: 'RMTA', color: rmtaColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-rmta"
        data-empty={isEmpty ? 'true' : 'false'}
        data-alpha={run.alpha}
        data-beta={run.beta}
        data-rmta-final={run.rmtaFinal === null ? '' : run.rmtaFinal}
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
          data-section="chart-line-rmta-aria-desc"
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
            data-section="chart-line-rmta-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-rmta-empty"
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
            data-section="chart-line-rmta-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-rmta-grid">
                {tickValues.map((t, i) => {
                  const gy =
                    layout.innerBottom -
                    t * (layout.innerBottom - layout.innerTop);
                  return (
                    <line
                      key={`g-${i}`}
                      data-section="chart-line-rmta-grid-line"
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
              <g data-section="chart-line-rmta-axes">
                <line
                  data-section="chart-line-rmta-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerTop}
                  x2={layout.innerLeft}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-rmta-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerBottom}
                  x2={layout.innerRight}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-rmta-tick-label"
                  x={layout.innerLeft - 6}
                  y={layout.innerTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.valueMax)}
                </text>
                <text
                  data-section="chart-line-rmta-tick-label"
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
                data-section="chart-line-rmta-price-path"
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
              <g data-section="chart-line-rmta-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-rmta-dot"
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

            {!rmtaHidden ? (
              <path
                data-section="chart-line-rmta-rmta-line"
                d={layout.rmtaPath}
                fill="none"
                stroke={rmtaColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Recursive Moving Trend Average line, ${layout.markers.length} points`}
              />
            ) : null}

            {!rmtaHidden && showMarkers ? (
              <g data-section="chart-line-rmta-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-rmta-marker"
                    data-trend={marker.trend}
                    data-rmta={marker.rmta}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={trendColorOf(marker.trend, upColor, downColor, flatColor)}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, rmta ${formatValue(
                      marker.rmta,
                    )}, ${trendLabelOf(marker.trend)}`}
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
              <g data-section="chart-line-rmta-badge">
                <rect
                  data-section="chart-line-rmta-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.innerTop + 4}
                  width={96}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-rmta-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.innerTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`RMTA ${run.alpha}/${run.beta}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-rmta-legend"
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
                  data-section="chart-line-rmta-legend-item"
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
                    data-section="chart-line-rmta-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-rmta-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-rmta-legend-stats"
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

ChartLineRmta.displayName = 'ChartLineRmta';
