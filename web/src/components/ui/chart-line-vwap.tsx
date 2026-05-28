import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_VWAP_WIDTH = 560;
export const DEFAULT_CHART_LINE_VWAP_HEIGHT = 340;
export const DEFAULT_CHART_LINE_VWAP_PADDING = 40;
export const DEFAULT_CHART_LINE_VWAP_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VWAP_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VWAP_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VWAP_VOLUME_BAND_RATIO = 0.22;
export const DEFAULT_CHART_LINE_VWAP_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_VWAP_VWAP_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_VWAP_VOLUME_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VWAP_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VWAP_AXIS_COLOR = '#cbd5e1';

export interface ChartLineVwapPoint {
  x: number;
  price: number;
  volume: number;
}

export interface ChartLineVwapSample {
  index: number;
  x: number;
  price: number;
  volume: number;
  vwap: number | null;
  deviation: number;
}

export interface ChartLineVwapRun {
  series: ChartLineVwapPoint[];
  samples: ChartLineVwapSample[];
  totalVolume: number;
  vwapFinal: number;
  ok: boolean;
}

export interface ChartLineVwapLayoutDot {
  index: number;
  x: number;
  price: number;
  volume: number;
  vwap: number | null;
  deviation: number;
  px: number;
  py: number;
}

export interface ChartLineVwapVolumeBar {
  index: number;
  x: number;
  volume: number;
  bx: number;
  by: number;
  bw: number;
  bh: number;
}

export interface ChartLineVwapLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: { x: number; y: number; width: number; height: number };
  xTicks: number[];
  yTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  pricePath: string;
  vwapPath: string;
  dots: ChartLineVwapLayoutDot[];
  volumeBars: ChartLineVwapVolumeBar[];
  totalVolume: number;
  vwapFinal: number;
  maxVolume: number;
  totalPoints: number;
}

export interface ComputeLineVwapLayoutOptions {
  data: readonly ChartLineVwapPoint[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  volumeBandRatio?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineVwapProps {
  data: readonly ChartLineVwapPoint[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  volumeBandRatio?: number;
  priceColor?: string;
  vwapColor?: string;
  volumeColor?: string;
  gridColor?: string;
  axisColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showVwap?: boolean;
  showVolume?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: { point: ChartLineVwapLayoutDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineVwapFinitePoints(
  points: readonly ChartLineVwapPoint[] | null | undefined,
): ChartLineVwapPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineVwapPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.price) &&
      isFiniteNumber(p.volume),
  );
}

/**
 * Cumulative volume-weighted average price. For each period the VWAP
 * is `sum(price * volume) / sum(volume)` taken over every period up
 * to and including the current one. Negative volumes are clamped to
 * 0 (a trade cannot have negative size); a period whose cumulative
 * volume is still 0 has a `null` VWAP. `deviation` is `price - vwap`
 * -- how far the price trades from its volume-weighted benchmark.
 */
export function runLineVwap(
  points: readonly ChartLineVwapPoint[] | null | undefined,
): ChartLineVwapRun {
  const finite = getLineVwapFinitePoints(points);
  const series: ChartLineVwapPoint[] = [...finite]
    .sort((a, b) => a.x - b.x)
    .map((p) => ({
      x: p.x,
      price: p.price,
      volume: p.volume < 0 ? 0 : p.volume,
    }));
  const n = series.length;

  if (n < 2) {
    return {
      series,
      samples: [],
      totalVolume: 0,
      vwapFinal: NaN,
      ok: false,
    };
  }

  let cumPV = 0;
  let cumVol = 0;
  const samples: ChartLineVwapSample[] = series.map((p, i) => {
    cumPV += p.price * p.volume;
    cumVol += p.volume;
    const vwap = cumVol > 0 ? cumPV / cumVol : null;
    return {
      index: i,
      x: p.x,
      price: p.price,
      volume: p.volume,
      vwap,
      deviation: vwap !== null ? p.price - vwap : NaN,
    };
  });

  let vwapFinal = NaN;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (samples[i]!.vwap !== null) {
      vwapFinal = samples[i]!.vwap!;
      break;
    }
  }

  return {
    series = [],
    samples,
    totalVolume: cumVol,
    vwapFinal,
    ok: true,
  };
}

function buildPath(
  points: readonly { px: number; py: number }[],
): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  return parts.join(' ');
}

function normaliseHidden(
  hidden: ReadonlySet<string> | readonly string[] | null | undefined,
): Set<string> {
  if (!hidden) return new Set();
  if (hidden instanceof Set) return new Set(hidden);
  if (Array.isArray(hidden)) return new Set(hidden);
  return new Set();
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineVwapLayout(
  options: ComputeLineVwapLayoutOptions,
): ChartLineVwapLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_VWAP_TICK_COUNT,
    volumeBandRatio = DEFAULT_CHART_LINE_VWAP_VOLUME_BAND_RATIO,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const panel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };
  const run = runLineVwap(data);
  const empty: ChartLineVwapLayout = {
    ok: false,
    width,
    height,
    panel,
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    innerWidth,
    innerHeight,
    pricePath: '',
    vwapPath: '',
    dots: [],
    volumeBars: [],
    totalVolume: 0,
    vwapFinal: NaN,
    maxVolume: 0,
    totalPoints: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let maxVolume = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.price < yLo) yLo = s.price;
    if (s.price > yHi) yHi = s.price;
    if (s.vwap !== null) {
      if (s.vwap < yLo) yLo = s.vwap;
      if (s.vwap > yHi) yHi = s.vwap;
    }
    if (s.volume > maxVolume) maxVolume = s.volume;
  }

  if (isFiniteNumber(xMinOverride)) xLo = xMinOverride;
  if (isFiniteNumber(xMaxOverride)) xHi = xMaxOverride;
  if (isFiniteNumber(yMinOverride)) yLo = yMinOverride;
  if (isFiniteNumber(yMaxOverride)) yHi = yMaxOverride;

  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;
  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const dots: ChartLineVwapLayoutDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    price: s.price,
    volume: s.volume,
    vwap: s.vwap,
    deviation: s.deviation,
    px: projectX(s.x),
    py: projectY(s.price),
  }));

  const vwapPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.vwap !== null) {
      vwapPts.push({ px: projectX(s.x), py: projectY(s.vwap) });
    }
  }

  const bandRatio = Math.min(
    0.5,
    Math.max(0.05, isFiniteNumber(volumeBandRatio) ? volumeBandRatio : 0.22),
  );
  const bandHeight = panel.height * bandRatio;
  const baselineY = panel.y + panel.height;
  const barWidth = (panel.width / Math.max(1, run.samples.length)) * 0.6;
  const volumeBars: ChartLineVwapVolumeBar[] = run.samples.map((s) => {
    const bh = maxVolume > 0 ? (s.volume / maxVolume) * bandHeight : 0;
    const bx = projectX(s.x) - barWidth / 2;
    return {
      index: s.index,
      x: s.x,
      volume: s.volume,
      bx,
      by: baselineY - bh,
      bw: barWidth,
      bh,
    };
  });

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount),
    yTicks: computeTicks(yLo, yHi, tickCount),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    innerWidth,
    innerHeight,
    pricePath: buildPath(dots.map((d) => ({ px: d.px, py: d.py }))),
    vwapPath: buildPath(vwapPts),
    dots,
    volumeBars,
    totalVolume: run.totalVolume,
    vwapFinal: run.vwapFinal,
    maxVolume,
    totalPoints: run.samples.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineVwapChart(
  data: readonly ChartLineVwapPoint[] | null | undefined,
  options?: { formatValue?: (n: number) => string },
): string {
  const run = runLineVwap(data);
  if (!run.ok) return 'No data';
  const fmt = options?.formatValue ?? defaultFormatValue;
  return `Line chart with a volume-weighted average price (VWAP) overlay: final VWAP ${fmt(run.vwapFinal)} over ${fmt(run.totalVolume)} total volume across ${run.samples.length} periods.`;
}

const VWAP_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineVwap = forwardRef<HTMLDivElement, ChartLineVwapProps>(
  function ChartLineVwap(
    props: ChartLineVwapProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_VWAP_WIDTH,
      height = DEFAULT_CHART_LINE_VWAP_HEIGHT,
      padding = DEFAULT_CHART_LINE_VWAP_PADDING,
      tickCount = DEFAULT_CHART_LINE_VWAP_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_VWAP_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_VWAP_DOT_RADIUS,
      volumeBandRatio = DEFAULT_CHART_LINE_VWAP_VOLUME_BAND_RATIO,
      priceColor = DEFAULT_CHART_LINE_VWAP_PRICE_COLOR,
      vwapColor = DEFAULT_CHART_LINE_VWAP_VWAP_COLOR,
      volumeColor = DEFAULT_CHART_LINE_VWAP_VOLUME_COLOR,
      gridColor = DEFAULT_CHART_LINE_VWAP_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_VWAP_AXIS_COLOR,
      xMin,
      xMax,
      yMin,
      yMax,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showVwap = true,
      showVolume = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a volume-weighted average price overlay',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      xLabel,
      yLabel,
      onPointClick,
      onSeriesToggle,
      style,
    } = props;

    const reactId = useId();
    const descId = `${reactId}-desc`;

    const isControlled = controlledHidden !== undefined;
    const [uncontrolled, setUncontrolled] = useState<Set<string>>(() =>
      normaliseHidden(defaultHiddenSeries),
    );
    const hiddenSet = isControlled
      ? normaliseHidden(controlledHidden)
      : uncontrolled;

    const layout = useMemo(
      () =>
        computeLineVwapLayout({
          data,
          width,
          height,
          padding,
          tickCount,
          volumeBandRatio,
          ...(isFiniteNumber(xMin) ? { xMin } : {}),
          ...(isFiniteNumber(xMax) ? { xMax } : {}),
          ...(isFiniteNumber(yMin) ? { yMin } : {}),
          ...(isFiniteNumber(yMax) ? { yMax } : {}),
        }),
      [data, width, height, padding, tickCount, volumeBandRatio, xMin, xMax, yMin, yMax],
    );

    const summary = useMemo(
      () => ariaDescription ?? describeLineVwapChart(data, { formatValue }),
      [ariaDescription, data, formatValue],
    );

    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{
      px: number;
      py: number;
    } | null>(null);

    const clearHover = useCallback(() => {
      setHoverIndex(null);
      setTooltipPos(null);
    }, []);

    const handleToggle = useCallback(
      (seriesId: string) => {
        const next = new Set(hiddenSet);
        const willHide = !next.has(seriesId);
        if (willHide) next.add(seriesId);
        else next.delete(seriesId);
        if (!isControlled) setUncontrolled(next);
        onHiddenSeriesChange?.(next);
        onSeriesToggle?.({ seriesId, hidden: willHide });
      },
      [hiddenSet, isControlled, onHiddenSeriesChange, onSeriesToggle],
    );

    const containerStyle: CSSProperties = {
      width,
      height,
      position: 'relative',
      ...(style ?? {}),
    };

    if (!layout.ok) {
      return (
        <div
          ref={ref}
          role="region"
          aria-label={ariaLabel}
          aria-describedby={descId}
          className={className}
          style={containerStyle}
          data-section="chart-line-vwap"
          data-empty="true"
          data-total-volume={0}
          data-animate={animate ? 'true' : 'false'}
        >
          <span id={descId} data-section="chart-line-vwap-aria-desc" style={VWAP_SR_STYLE}>
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const priceVisible = !hiddenSet.has('price');
    const vwapVisible = showVwap && !hiddenSet.has('vwap');
    const volumeVisible = showVolume && !hiddenSet.has('volume');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'vwap', label: 'VWAP', color: vwapColor },
      { id: 'volume', label: 'Volume', color: volumeColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-vwap"
        data-empty="false"
        data-total-volume={layout.totalVolume}
        data-vwap-final={layout.vwapFinal}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-vwap-aria-desc" style={VWAP_SR_STYLE}>
          {summary}
        </span>

        <div
          data-section="chart-line-vwap-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-vwap-badge"
              data-vwap-final={layout.vwapFinal}
              data-total-volume={layout.totalVolume}
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                padding: '2px 6px',
                borderRadius: 4,
                background: '#ffffffd9',
                color: '#0f172a',
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                gap: 4,
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <span
                data-section="chart-line-vwap-badge-icon"
                aria-hidden="true"
                style={{ color: vwapColor }}
              >
                VWAP
              </span>
              <span data-section="chart-line-vwap-badge-final">
                final={formatValue(layout.vwapFinal)}
              </span>
              <span data-section="chart-line-vwap-badge-volume">
                vol={formatValue(layout.totalVolume)}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-vwap-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-vwap-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <line
                      key={`gy-${i}`}
                      data-section="chart-line-vwap-grid-line"
                      data-axis="y"
                      x1={layout.panel.x}
                      x2={layout.panel.x + layout.panel.width}
                      y1={py}
                      y2={py}
                    />
                  );
                })}
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <line
                      key={`gx-${i}`}
                      data-section="chart-line-vwap-grid-line"
                      data-axis="x"
                      x1={px}
                      x2={px}
                      y1={layout.panel.y}
                      y2={layout.panel.y + layout.panel.height}
                    />
                  );
                })}
              </g>
            ) : null}

            {volumeVisible ? (
              <g data-section="chart-line-vwap-volume">
                {layout.volumeBars.map((b) => (
                  <rect
                    key={`vb-${b.index}`}
                    data-section="chart-line-vwap-volume-bar"
                    data-point-index={b.index}
                    data-volume={b.volume}
                    x={b.bx}
                    y={b.by}
                    width={b.bw}
                    height={b.bh}
                    fill={volumeColor}
                    fillOpacity={0.3}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-vwap-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-vwap-axis"
                  data-axis="x"
                  x1={layout.panel.x}
                  y1={layout.panel.y + layout.panel.height}
                  x2={layout.panel.x + layout.panel.width}
                  y2={layout.panel.y + layout.panel.height}
                />
                <line
                  data-section="chart-line-vwap-axis"
                  data-axis="y"
                  x1={layout.panel.x}
                  y1={layout.panel.y}
                  x2={layout.panel.x}
                  y2={layout.panel.y + layout.panel.height}
                />
                <g data-section="chart-line-vwap-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => {
                    const px =
                      layout.panel.x +
                      ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                        layout.panel.width;
                    return (
                      <g
                        key={`tx-${i}`}
                        data-section="chart-line-vwap-tick"
                        data-axis="x"
                      >
                        <line
                          x1={px}
                          x2={px}
                          y1={layout.panel.y + layout.panel.height}
                          y2={layout.panel.y + layout.panel.height + 4}
                        />
                        <text
                          data-section="chart-line-vwap-tick-label"
                          data-axis="x"
                          x={px}
                          y={layout.panel.y + layout.panel.height + 14}
                          textAnchor="middle"
                          fontSize={10}
                          fill={axisColor}
                          stroke="none"
                        >
                          {formatX(t)}
                        </text>
                      </g>
                    );
                  })}
                </g>
                <g data-section="chart-line-vwap-ticks" data-axis="y">
                  {layout.yTicks.map((t, i) => {
                    const py =
                      layout.panel.y +
                      layout.panel.height -
                      ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                        layout.panel.height;
                    return (
                      <g
                        key={`ty-${i}`}
                        data-section="chart-line-vwap-tick"
                        data-axis="y"
                      >
                        <line
                          x1={layout.panel.x - 4}
                          x2={layout.panel.x}
                          y1={py}
                          y2={py}
                        />
                        <text
                          data-section="chart-line-vwap-tick-label"
                          data-axis="y"
                          x={layout.panel.x - 6}
                          y={py + 3}
                          textAnchor="end"
                          fontSize={10}
                          fill={axisColor}
                          stroke="none"
                        >
                          {formatValue(t)}
                        </text>
                      </g>
                    );
                  })}
                </g>
                {xLabel ? (
                  <text
                    data-section="chart-line-vwap-x-label"
                    x={layout.panel.x + layout.panel.width / 2}
                    y={height - 4}
                    textAnchor="middle"
                    fontSize={11}
                    fill={axisColor}
                    stroke="none"
                  >
                    {xLabel}
                  </text>
                ) : null}
                {yLabel ? (
                  <text
                    data-section="chart-line-vwap-y-label"
                    transform={`rotate(-90 12 ${layout.panel.y + layout.panel.height / 2})`}
                    x={12}
                    y={layout.panel.y + layout.panel.height / 2}
                    textAnchor="middle"
                    fontSize={11}
                    fill={axisColor}
                    stroke="none"
                  >
                    {yLabel}
                  </text>
                ) : null}
              </g>
            ) : null}

            {vwapVisible && layout.vwapPath ? (
              <path
                data-section="chart-line-vwap-vwap-path"
                d={layout.vwapPath}
                fill="none"
                stroke={vwapColor}
                strokeWidth={1.75}
                strokeDasharray="5 3"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-vwap-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-vwap-dots">
                {layout.dots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, price ${formatValue(d.price)}`}
                      data-section="chart-line-vwap-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-price={d.price}
                      data-volume={d.volume}
                      data-vwap={d.vwap === null ? '' : d.vwap}
                      data-deviation={d.deviation}
                      cx={d.px}
                      cy={d.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={priceColor}
                      stroke="#ffffff"
                      strokeWidth={1}
                      onMouseEnter={() => {
                        setHoverIndex(d.index);
                        setTooltipPos({ px: d.px, py: d.py });
                      }}
                      onMouseLeave={clearHover}
                      onFocus={() => {
                        setHoverIndex(d.index);
                        setTooltipPos({ px: d.px, py: d.py });
                      }}
                      onBlur={clearHover}
                      onClick={() => onPointClick?.({ point: d })}
                    />
                  );
                })}
              </g>
            ) : null}
          </svg>

          {showTooltip && hoverIndex !== null && tooltipPos
            ? (() => {
                const d = layout.dots.find((x) => x.index === hoverIndex);
                if (!d) return null;
                return (
                  <div
                    data-section="chart-line-vwap-tooltip"
                    data-point-index={d.index}
                    style={{
                      position: 'absolute',
                      left: tooltipPos.px + 8,
                      top: tooltipPos.py + 8,
                      background: '#0f172a',
                      color: '#f8fafc',
                      padding: '6px 8px',
                      fontSize: 11,
                      borderRadius: 4,
                      pointerEvents: 'none',
                      minWidth: 160,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div data-section="chart-line-vwap-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-vwap-tooltip-price"
                      style={{ fontWeight: 600 }}
                    >
                      price: {formatValue(d.price)}
                    </div>
                    <div data-section="chart-line-vwap-tooltip-volume">
                      volume: {formatValue(d.volume)}
                    </div>
                    <div data-section="chart-line-vwap-tooltip-vwap">
                      vwap: {d.vwap === null ? 'n/a' : formatValue(d.vwap)}
                    </div>
                    <div data-section="chart-line-vwap-tooltip-deviation">
                      deviation:{' '}
                      {Number.isFinite(d.deviation)
                        ? `${d.deviation >= 0 ? '+' : ''}${formatValue(d.deviation)}`
                        : 'n/a'}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-vwap-legend"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 8,
              alignItems: 'center',
            }}
          >
            {legendItems.map((item) => {
              const isHidden = hiddenSet.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  data-section="chart-line-vwap-legend-item"
                  data-series-id={item.id}
                  data-hidden={isHidden ? 'true' : 'false'}
                  onClick={() => handleToggle(item.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    opacity: isHidden ? 0.5 : 1,
                  }}
                >
                  <span
                    data-section="chart-line-vwap-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-vwap-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-vwap-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              final VWAP {formatValue(layout.vwapFinal)}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineVwap.displayName = 'ChartLineVwap';
