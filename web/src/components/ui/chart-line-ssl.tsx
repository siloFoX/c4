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
 * ChartLineSsl -- pure-SVG single-panel SSL Channel chart.
 *
 * The SSL Channel runs a moving average over the bar highs and another
 * over the bar lows. A direction state flips UP when the close crosses
 * above the high moving average and DOWN when it crosses below the low
 * moving average; between crosses it carries. The two channel lines then
 * SWAP roles on each flip -- in an uptrend the SSL Up line rides the high
 * average and the SSL Down line rides the low average; in a downtrend they
 * trade places. The crossover of the two lines marks the trend change.
 *
 * This primitive overlays the two SSL lines on the close line in a single
 * panel and marks, per bar, the channel direction.
 */

export interface ChartLineSslPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineSslZone = 'up' | 'down' | 'none';

export type ChartLineSslSeriesId = 'price' | 'sslUp' | 'sslDown';

export interface ChartLineSslSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  sslUp: number | null;
  sslDown: number | null;
  hlv: number;
  zone: ChartLineSslZone;
}

export interface ChartLineSslRun {
  series: ChartLineSslPoint[];
  period: number;
  smaHigh: (number | null)[];
  smaLow: (number | null)[];
  hlv: number[];
  sslUp: (number | null)[];
  sslDown: (number | null)[];
  samples: ChartLineSslSample[];
  hlvFinal: number;
  upCount: number;
  downCount: number;
  ok: boolean;
}

export interface ChartLineSslMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  hlv: number;
  zone: ChartLineSslZone;
}

export interface ChartLineSslDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSslLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineSslDot[];
  sslUpPath: string;
  sslDownPath: string;
  markers: ChartLineSslMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineSslRun;
}

export interface ChartLineSslProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSslPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  sslUpColor?: string;
  sslDownColor?: string;
  neutralColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSslUp?: boolean;
  showSslDown?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSslSeriesId[];
  defaultHiddenSeries?: ChartLineSslSeriesId[];
  onSeriesToggle?: (detail: { seriesId: ChartLineSslSeriesId; hidden: boolean }) => void;
  onPointClick?: (detail: { point: ChartLineSslSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_SSL_WIDTH = 720;
export const DEFAULT_CHART_LINE_SSL_HEIGHT = 320;
export const DEFAULT_CHART_LINE_SSL_PADDING = 44;
export const DEFAULT_CHART_LINE_SSL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SSL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SSL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SSL_PERIOD = 10;
export const DEFAULT_CHART_LINE_SSL_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SSL_SSL_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SSL_SSL_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SSL_NEUTRAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_SSL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SSL_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only bars whose x, high, low and close are all finite. */
export function getLineSslFinitePoints(
  data: readonly ChartLineSslPoint[] | null | undefined,
): ChartLineSslPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSslPoint[] = [];
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

/** Coerce a period to an integer >= 1, else the fallback. */
export function normalizeLineSslPeriod(period: unknown, fallback: number): number {
  if (!isFiniteNumber(period)) return fallback;
  const floored = Math.floor(period);
  if (floored < 1) return fallback;
  return floored;
}

/** Simple moving average over the trailing window; warm-up window null. */
export function computeLineSslSma(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineSslPeriod(period, 1);
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i + 1 < p) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let k = i - p + 1; k <= i; k += 1) {
      const v = values[k];
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

/**
 * The SSL direction state (Hlv): +1 once the close crosses above the high
 * moving average, -1 once it crosses below the low moving average,
 * carried between crosses. A bar without both moving averages is 0.
 */
export function computeLineSslHlv(
  closes: readonly (number | null | undefined)[] | null | undefined,
  smaHigh: readonly (number | null | undefined)[] | null | undefined,
  smaLow: readonly (number | null | undefined)[] | null | undefined,
): number[] {
  if (!Array.isArray(closes) || !Array.isArray(smaHigh) || !Array.isArray(smaLow)) {
    return [];
  }
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i];
    const sh = smaHigh[i];
    const sl = smaLow[i];
    if (!isFiniteNumber(c) || !isFiniteNumber(sh) || !isFiniteNumber(sl)) {
      out.push(0);
      continue;
    }
    if (c > sh) prev = 1;
    else if (c < sl) prev = -1;
    out.push(prev);
  }
  return out;
}

export interface ChartLineSslComputed {
  smaHigh: (number | null)[];
  smaLow: (number | null)[];
  hlv: number[];
  sslUp: (number | null)[];
  sslDown: (number | null)[];
}

/** Compute the full SSL Channel pipeline for a set of bars. */
export function computeLineSsl(
  bars: readonly ChartLineSslPoint[] | null | undefined,
  period: number,
): ChartLineSslComputed {
  if (!Array.isArray(bars)) {
    return { smaHigh: [], smaLow: [], hlv: [], sslUp: [], sslDown: [] };
  }
  const highs = bars.map((b) => (b ? b.high : Number.NaN));
  const lows = bars.map((b) => (b ? b.low : Number.NaN));
  const closes = bars.map((b) => (b ? b.close : Number.NaN));
  const smaHigh = computeLineSslSma(highs, period);
  const smaLow = computeLineSslSma(lows, period);
  const hlv = computeLineSslHlv(closes, smaHigh, smaLow);
  const sslUp: (number | null)[] = [];
  const sslDown: (number | null)[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const sh = smaHigh[i];
    const sl = smaLow[i];
    if (isFiniteNumber(sh) && isFiniteNumber(sl)) {
      const down = (hlv[i] ?? 0) < 0;
      sslUp.push(down ? sl : sh);
      sslDown.push(down ? sh : sl);
    } else {
      sslUp.push(null);
      sslDown.push(null);
    }
  }
  return { smaHigh, smaLow, hlv, sslUp, sslDown };
}

/** Classify a bar by the SSL direction state. */
export function classifyLineSslZone(hlv: number): ChartLineSslZone {
  if (hlv > 0) return 'up';
  if (hlv < 0) return 'down';
  return 'none';
}

export interface ChartLineSslOptions {
  period?: number;
}

/** Run the full SSL Channel pipeline over a set of bars. */
export function runLineSsl(
  data: readonly ChartLineSslPoint[] | null | undefined,
  options: ChartLineSslOptions = {},
): ChartLineSslRun {
  const series = getLineSslFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineSslPeriod(options.period, DEFAULT_CHART_LINE_SSL_PERIOD);
  const { smaHigh, smaLow, hlv, sslUp, sslDown } = computeLineSsl(series, period);

  const samples: ChartLineSslSample[] = series.map((bar, index) => {
    const hlvValue = hlv[index] ?? 0;
    return {
      index,
      x: bar.x,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      sslUp: sslUp[index] ?? null,
      sslDown: sslDown[index] ?? null,
      hlv: hlvValue,
      zone: classifyLineSslZone(hlvValue),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let hlvFinal = 0;
  for (const sample of samples) {
    if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    if (sample.hlv !== 0) hlvFinal = sample.hlv;
  }

  return {
    series = [],
    period,
    smaHigh,
    smaLow,
    hlv,
    sslUp,
    sslDown,
    samples,
    hlvFinal,
    upCount,
    downCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineSslLayoutOptions extends ChartLineSslOptions {
  data: readonly ChartLineSslPoint[] | null | undefined;
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
export function computeLineSslLayout(
  options: ChartLineSslLayoutOptions,
): ChartLineSslLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_SSL_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_SSL_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_SSL_PADDING;

  const run = runLineSsl(options.data, {
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
  run.series.forEach((bar, index) => {
    if (bar.close < valueMin) valueMin = bar.close;
    if (bar.close > valueMax) valueMax = bar.close;
    const up = run.sslUp[index];
    const down = run.sslDown[index];
    if (isFiniteNumber(up)) {
      if (up < valueMin) valueMin = up;
      if (up > valueMax) valueMax = up;
    }
    if (isFiniteNumber(down)) {
      if (down < valueMin) valueMin = down;
      if (down > valueMax) valueMax = down;
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
  const priceDots: ChartLineSslDot[] = [];
  run.series.forEach((bar, index) => {
    const cx = xAt(index);
    const cy = yAt(bar.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: bar.x, cx, cy, close: bar.close });
  });

  const sslUpPoints: Array<{ x: number; y: number }> = [];
  const sslDownPoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineSslMarker[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    if (isFiniteNumber(sample.sslUp)) {
      sslUpPoints.push({ x: cx, y: yAt(sample.sslUp) });
    }
    if (isFiniteNumber(sample.sslDown)) {
      sslDownPoints.push({ x: cx, y: yAt(sample.sslDown) });
    }
    if (isFiniteNumber(sample.sslUp) && isFiniteNumber(sample.sslDown)) {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yAt(sample.close),
        close: sample.close,
        hlv: sample.hlv,
        zone: sample.zone,
      });
    }
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
    sslUpPath: buildLinePath(sslUpPoints),
    sslDownPath: buildLinePath(sslDownPoints),
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineSslChart(
  data: readonly ChartLineSslPoint[] | null | undefined,
  options: ChartLineSslOptions = {},
): string {
  const run = runLineSsl(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.hlvFinal === 1 ? 'up' : run.hlvFinal === -1 ? 'down' : 'n/a';
  return (
    `Line chart with an SSL Channel overlay: the close line with two SSL ` +
    `lines flipping between the moving average of the highs and the moving ` +
    `average of the lows. The channel flips up when the close crosses above ` +
    `the high moving average and down when it crosses below the low moving ` +
    `average; between crosses it carries. Across ${total} bars the channel ` +
    `is up on ${run.upCount} and down on ${run.downCount}. The final ` +
    `direction is ${finalText}.`
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
  zone: ChartLineSslZone,
  upColor: string,
  downColor: string,
  neutralColor: string,
): string {
  if (zone === 'up') return upColor;
  if (zone === 'down') return downColor;
  return neutralColor;
}

function zoneLabelOf(zone: ChartLineSslZone): string {
  if (zone === 'up') return 'Up channel';
  if (zone === 'down') return 'Down channel';
  return 'n/a';
}

/**
 * ChartLineSsl -- single-panel pure-SVG SSL Channel chart.
 */
export const ChartLineSsl = forwardRef<HTMLDivElement, ChartLineSslProps>(
  function ChartLineSsl(props, ref) {
    const {
      data,
      period = DEFAULT_CHART_LINE_SSL_PERIOD,
      width = DEFAULT_CHART_LINE_SSL_WIDTH,
      height = DEFAULT_CHART_LINE_SSL_HEIGHT,
      padding = DEFAULT_CHART_LINE_SSL_PADDING,
      tickCount = DEFAULT_CHART_LINE_SSL_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_SSL_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_SSL_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_SSL_PRICE_COLOR,
      sslUpColor = DEFAULT_CHART_LINE_SSL_SSL_UP_COLOR,
      sslDownColor = DEFAULT_CHART_LINE_SSL_SSL_DOWN_COLOR,
      neutralColor = DEFAULT_CHART_LINE_SSL_NEUTRAL_COLOR,
      gridColor = DEFAULT_CHART_LINE_SSL_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_SSL_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showSslUp = true,
      showSslDown = true,
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
    const baseId = `chart-line-ssl-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<ChartLineSslSeriesId[]>(
      defaultHiddenSeries ?? [],
    );
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineSslSeriesId): boolean => hiddenList.includes(id);

    const layout = useMemo(
      () => computeLineSslLayout({ data, period, width, height, padding }),
      [data, period, width, height, padding],
    );

    const run = layout.run;
    const description = ariaDescription ?? describeLineSslChart(data, { period });
    const resolvedLabel =
      ariaLabel ?? `SSL Channel chart, period ${run.period}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineSslSeriesId): void => {
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
      const tooltipW = 176;
      const rawX = anchorX + 12;
      const tx = Math.min(rawX, layout.width - tooltipW - 4);
      const ty = layout.innerTop + 6;
      tooltip = (
        <g data-section="chart-line-ssl-tooltip" pointerEvents="none">
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
            data-section="chart-line-ssl-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-ssl-tooltip-close"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Close: ${formatValue(hoverSample.close)}`}
          </text>
          <text
            data-section="chart-line-ssl-tooltip-ssl-up"
            x={tx + 10}
            y={ty + 51}
            fill="#86efac"
            fontSize={11}
          >
            {`SSL Up: ${
              hoverSample.sslUp === null ? 'n/a' : formatValue(hoverSample.sslUp)
            }`}
          </text>
          <text
            data-section="chart-line-ssl-tooltip-ssl-down"
            x={tx + 10}
            y={ty + 67}
            fill="#fca5a5"
            fontSize={11}
          >
            {`SSL Down: ${
              hoverSample.sslDown === null
                ? 'n/a'
                : formatValue(hoverSample.sslDown)
            }`}
          </text>
          <text
            data-section="chart-line-ssl-tooltip-zone"
            x={tx + 10}
            y={ty + 83}
            fill="#cbd5e1"
            fontSize={11}
            fontWeight={600}
          >
            {`Channel: ${zoneLabelOf(hoverSample.zone)}`}
          </text>
        </g>
      );
    }

    const priceHidden = isHidden('price');
    const sslUpHidden = isHidden('sslUp') || !showSslUp;
    const sslDownHidden = isHidden('sslDown') || !showSslDown;

    const legendItems: Array<{
      id: ChartLineSslSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'sslUp', label: 'SSL Up', color: sslUpColor },
      { id: 'sslDown', label: 'SSL Down', color: sslDownColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-ssl"
        data-empty={isEmpty ? 'true' : 'false'}
        data-period={run.period}
        data-hlv-final={run.hlvFinal}
        data-up-count={run.upCount}
        data-down-count={run.downCount}
        data-total-points={run.series.length}
        data-animate={animate ? 'true' : 'false'}
        role="region"
        aria-label={resolvedLabel}
        aria-describedby={descId}
      >
        <span
          id={descId}
          data-section="chart-line-ssl-aria-desc"
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
            data-section="chart-line-ssl-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-ssl-empty"
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
            data-section="chart-line-ssl-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-ssl-grid">
                {tickValues.map((t, i) => {
                  const gy =
                    layout.innerBottom -
                    t * (layout.innerBottom - layout.innerTop);
                  return (
                    <line
                      key={`g-${i}`}
                      data-section="chart-line-ssl-grid-line"
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
              <g data-section="chart-line-ssl-axes">
                <line
                  data-section="chart-line-ssl-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerTop}
                  x2={layout.innerLeft}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-ssl-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerBottom}
                  x2={layout.innerRight}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-ssl-tick-label"
                  x={layout.innerLeft - 6}
                  y={layout.innerTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.valueMax)}
                </text>
                <text
                  data-section="chart-line-ssl-tick-label"
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

            {!sslDownHidden ? (
              <path
                data-section="chart-line-ssl-ssl-down-line"
                d={layout.sslDownPath}
                fill="none"
                stroke={sslDownColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label="SSL Down line"
              />
            ) : null}

            {!sslUpHidden ? (
              <path
                data-section="chart-line-ssl-ssl-up-line"
                d={layout.sslUpPath}
                fill="none"
                stroke={sslUpColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label="SSL Up line"
              />
            ) : null}

            {!priceHidden ? (
              <path
                data-section="chart-line-ssl-price-path"
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
              <g data-section="chart-line-ssl-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-ssl-dot"
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

            {showMarkers ? (
              <g data-section="chart-line-ssl-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-ssl-marker"
                    data-zone={marker.zone}
                    data-hlv={marker.hlv}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={zoneColorOf(
                      marker.zone,
                      sslUpColor,
                      sslDownColor,
                      neutralColor,
                    )}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, close ${formatValue(
                      marker.close,
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
              <g data-section="chart-line-ssl-badge">
                <rect
                  data-section="chart-line-ssl-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.innerTop + 4}
                  width={60}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-ssl-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.innerTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`SSL ${run.period}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-ssl-legend"
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
                  data-section="chart-line-ssl-legend-item"
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
                    data-section="chart-line-ssl-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-ssl-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-ssl-legend-stats"
              style={{ color: axisColor }}
            >
              {`up ${run.upCount} / down ${run.downCount}`}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineSsl.displayName = 'ChartLineSsl';
