import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_OBV_WIDTH = 560;
export const DEFAULT_CHART_LINE_OBV_HEIGHT = 360;
export const DEFAULT_CHART_LINE_OBV_PADDING = 40;
export const DEFAULT_CHART_LINE_OBV_GAP = 26;
export const DEFAULT_CHART_LINE_OBV_PRICE_PANEL_RATIO = 0.58;
export const DEFAULT_CHART_LINE_OBV_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_OBV_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_OBV_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_OBV_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_OBV_OBV_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_OBV_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_OBV_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_OBV_FLAT_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_OBV_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_OBV_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_OBV_AXIS_COLOR = '#cbd5e1';

export type ChartLineObvDirection = 'up' | 'down' | 'flat';

export interface ChartLineObvPoint {
  x: number;
  price: number;
  volume: number;
}

export interface ChartLineObvSample {
  index: number;
  x: number;
  price: number;
  volume: number;
  obv: number;
  direction: ChartLineObvDirection;
}

export interface ChartLineObvRun {
  series: ChartLineObvPoint[];
  obv: number[];
  directions: ChartLineObvDirection[];
  samples: ChartLineObvSample[];
  obvFinal: number;
  obvMin: number;
  obvMax: number;
  ok: boolean;
}

export interface ChartLineObvPriceDot {
  index: number;
  x: number;
  price: number;
  volume: number;
  obv: number;
  direction: ChartLineObvDirection;
  px: number;
  py: number;
}

export interface ChartLineObvMarker {
  index: number;
  x: number;
  obv: number;
  direction: ChartLineObvDirection;
  px: number;
  py: number;
}

export interface ChartLineObvPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineObvLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineObvPanel;
  obvPanel: ChartLineObvPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  obvYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  obvYMin: number;
  obvYMax: number;
  pricePath: string;
  priceDots: ChartLineObvPriceDot[];
  obvPath: string;
  obvMarkers: ChartLineObvMarker[];
  zeroY: number;
  obvFinal: number;
  obvMin: number;
  obvMax: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineObvLayoutOptions {
  data: readonly ChartLineObvPoint[];
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineObvProps {
  data: readonly ChartLineObvPoint[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  obvColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showObv?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineObvPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineObvFinitePoints(
  points: readonly ChartLineObvPoint[] | null | undefined,
): ChartLineObvPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineObvPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.price) &&
      isFiniteNumber(p.volume),
  );
}

/**
 * The per-period close direction. Index 0 has no prior close and
 * reads `flat`; later indices read `up` / `down` / `flat` from the
 * sign of `price[i] - price[i-1]`.
 */
export function computeLineObvDirections(
  prices: readonly number[] | null | undefined,
): ChartLineObvDirection[] {
  if (!Array.isArray(prices)) return [];
  const out: ChartLineObvDirection[] = new Array(prices.length).fill('flat');
  for (let i = 1; i < prices.length; i += 1) {
    if (prices[i]! > prices[i - 1]!) out[i] = 'up';
    else if (prices[i]! < prices[i - 1]!) out[i] = 'down';
    else out[i] = 'flat';
  }
  return out;
}

/**
 * Joe Granville's On-Balance Volume: a running cumulative total of
 * volume. OBV starts at 0; each period adds that period's volume on
 * an up close, subtracts it on a down close, and leaves the running
 * total unchanged on a flat close.
 */
export function computeLineObv(
  prices: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
): number[] {
  if (!Array.isArray(prices) || !Array.isArray(volumes)) return [];
  const n = prices.length;
  if (n === 0) return [];
  const out: number[] = new Array(n).fill(0);
  out[0] = 0;
  for (let i = 1; i < n; i += 1) {
    const vol = volumes[i] ?? 0;
    if (prices[i]! > prices[i - 1]!) out[i] = out[i - 1]! + vol;
    else if (prices[i]! < prices[i - 1]!) out[i] = out[i - 1]! - vol;
    else out[i] = out[i - 1]!;
  }
  return out;
}

export function runLineObv(
  points: readonly ChartLineObvPoint[] | null | undefined,
): ChartLineObvRun {
  const finite = getLineObvFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const n = series.length;

  if (n < 2) {
    return {
      series,
      obv: [],
      directions: [],
      samples: [],
      obvFinal: NaN,
      obvMin: 0,
      obvMax: 0,
      ok: false,
    };
  }

  const prices = series.map((p) => p.price);
  const volumes = series.map((p) => p.volume);
  const obv = computeLineObv(prices, volumes);
  const directions = computeLineObvDirections(prices);
  const samples: ChartLineObvSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    price: p.price,
    volume: p.volume,
    obv: obv[i]!,
    direction: directions[i]!,
  }));

  let obvMin = obv[0]!;
  let obvMax = obv[0]!;
  for (const v of obv) {
    if (v < obvMin) obvMin = v;
    if (v > obvMax) obvMax = v;
  }

  return {
    series = [],
    obv,
    directions,
    samples,
    obvFinal: obv[n - 1]!,
    obvMin,
    obvMax,
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

export function computeLineObvLayout(
  options: ComputeLineObvLayoutOptions,
): ChartLineObvLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_OBV_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_OBV_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_OBV_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineObvPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineObvLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    obvPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    obvYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    obvYMin: 0,
    obvYMax: 0,
    pricePath: '',
    priceDots: [],
    obvPath: '',
    obvMarkers: [],
    zeroY: 0,
    obvFinal: NaN,
    obvMin: 0,
    obvMax: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  const run = runLineObv(data);
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const obvH = usableHeight - priceH;
  if (priceH <= 0 || obvH <= 0) return empty;

  const pricePanel: ChartLineObvPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const obvPanel: ChartLineObvPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: obvH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.price < pyLo) pyLo = s.price;
    if (s.price > pyHi) pyHi = s.price;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }

  let obvLo = Math.min(0, run.obvMin);
  let obvHi = Math.max(0, run.obvMax);
  if (obvLo === obvHi) {
    obvLo -= 1;
    obvHi += 1;
  }

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectObvY = (v: number): number =>
    obvPanel.y +
    obvPanel.height -
    ((v - obvLo) / (obvHi - obvLo)) * obvPanel.height;

  const priceDots: ChartLineObvPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    price: s.price,
    volume: s.volume,
    obv: s.obv,
    direction: s.direction,
    px: projectX(s.x),
    py: projectPriceY(s.price),
  }));

  const obvMarkers: ChartLineObvMarker[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    obv: s.obv,
    direction: s.direction,
    px: projectX(s.x),
    py: projectObvY(s.obv),
  }));

  return {
    ok: true,
    width,
    height,
    pricePanel,
    obvPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    obvYTicks: computeTicks(obvLo, obvHi, tickCount).map((v) => ({
      value: v,
      py: projectObvY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    obvYMin: obvLo,
    obvYMax: obvHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    obvPath: buildPath(obvMarkers.map((m) => ({ px: m.px, py: m.py }))),
    obvMarkers,
    zeroY: projectObvY(0),
    obvFinal: run.obvFinal,
    obvMin: run.obvMin,
    obvMax: run.obvMax,
    totalPoints: run.samples.length,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineObvChart(
  data: readonly ChartLineObvPoint[] | null | undefined,
  options?: { formatValue?: (n: number) => string },
): string {
  const run = runLineObv(data);
  if (!run.ok) return 'No data';
  const fmt = options?.formatValue ?? defaultFormatValue;
  return `Line chart with an On-Balance Volume cumulative panel: OBV adds each period's volume on an up close and subtracts it on a down close. Final OBV ${fmt(run.obvFinal)}, range ${fmt(run.obvMin)} to ${fmt(run.obvMax)}, across ${run.samples.length} periods.`;
}

const OBV_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineObv = forwardRef<HTMLDivElement, ChartLineObvProps>(
  function ChartLineObv(
    props: ChartLineObvProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_OBV_WIDTH,
      height = DEFAULT_CHART_LINE_OBV_HEIGHT,
      padding = DEFAULT_CHART_LINE_OBV_PADDING,
      gap = DEFAULT_CHART_LINE_OBV_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_OBV_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_OBV_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_OBV_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_OBV_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_OBV_PRICE_COLOR,
      obvColor = DEFAULT_CHART_LINE_OBV_OBV_COLOR,
      upColor = DEFAULT_CHART_LINE_OBV_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_OBV_DOWN_COLOR,
      flatColor = DEFAULT_CHART_LINE_OBV_FLAT_COLOR,
      zeroColor = DEFAULT_CHART_LINE_OBV_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_OBV_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_OBV_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showObv = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with an On-Balance Volume cumulative panel',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
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
        computeLineObvLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
        }),
      [data, width, height, padding, gap, pricePanelRatio, tickCount],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineObvChart(data, { formatValue }),
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

    const directionColor = useCallback(
      (d: ChartLineObvDirection): string =>
        d === 'up' ? upColor : d === 'down' ? downColor : flatColor,
      [upColor, downColor, flatColor],
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
          data-section="chart-line-obv"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span id={descId} data-section="chart-line-obv-aria-desc" style={OBV_SR_STYLE}>
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const op = layout.obvPanel;
    const priceVisible = !hiddenSet.has('price');
    const obvVisible = showObv && !hiddenSet.has('obv');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'obv', label: 'OBV', color: obvColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-obv"
        data-empty="false"
        data-obv-final={layout.obvFinal}
        data-obv-min={layout.obvMin}
        data-obv-max={layout.obvMax}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-obv-aria-desc" style={OBV_SR_STYLE}>
          {summary}
        </span>

        <div
          data-section="chart-line-obv-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-obv-badge"
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
                data-section="chart-line-obv-badge-icon"
                aria-hidden="true"
                style={{ color: obvColor }}
              >
                OBV
              </span>
              <span data-section="chart-line-obv-badge-final">
                final={formatValue(layout.obvFinal)}
              </span>
              <span data-section="chart-line-obv-badge-peak">
                peak={formatValue(layout.obvMax)}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-obv-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-obv-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-obv-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.obvYTicks.map((t, i) => (
                  <line
                    key={`ogy-${i}`}
                    data-section="chart-line-obv-grid-line"
                    data-panel="obv"
                    x1={op.x}
                    x2={op.x + op.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showZeroLine ? (
              <line
                data-section="chart-line-obv-zero-line"
                x1={op.x}
                x2={op.x + op.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-obv-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: op, name: 'obv', yt: layout.obvYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-obv-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-obv-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-obv-axis"
                      data-panel={cfg.name}
                      data-axis="y"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y}
                      x2={cfg.panel.x}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    {cfg.yt.map((t, i) => (
                      <g
                        key={`yt-${cfg.name}-${i}`}
                        data-section="chart-line-obv-tick"
                        data-panel={cfg.name}
                        data-axis="y"
                      >
                        <line
                          x1={cfg.panel.x - 4}
                          x2={cfg.panel.x}
                          y1={t.py}
                          y2={t.py}
                        />
                        <text
                          data-section="chart-line-obv-tick-label"
                          data-panel={cfg.name}
                          data-axis="y"
                          x={cfg.panel.x - 6}
                          y={t.py + 3}
                          textAnchor="end"
                          fontSize={10}
                          fill={axisColor}
                          stroke="none"
                        >
                          {formatValue(t.value)}
                        </text>
                      </g>
                    ))}
                  </g>
                ))}
                <g data-section="chart-line-obv-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-obv-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={op.y + op.height}
                        y2={op.y + op.height + 4}
                      />
                      <text
                        data-section="chart-line-obv-tick-label"
                        data-axis="x"
                        x={t.px}
                        y={op.y + op.height + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatX(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              </g>
            ) : null}

            <g data-section="chart-line-obv-panel-labels">
              <text
                data-section="chart-line-obv-panel-label"
                data-panel="price"
                x={pp.x + pp.width / 2}
                y={pp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Price
              </text>
              <text
                data-section="chart-line-obv-panel-label"
                data-panel="obv"
                x={op.x + op.width / 2}
                y={op.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                OBV
              </text>
            </g>

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-obv-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-obv-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, price ${formatValue(d.price)}`}
                      data-section="chart-line-obv-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-price={d.price}
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

            {obvVisible && layout.obvPath ? (
              <path
                data-section="chart-line-obv-obv-line"
                d={layout.obvPath}
                fill="none"
                stroke={obvColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {obvVisible ? (
              <g data-section="chart-line-obv-markers">
                {layout.obvMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`OBV at x ${formatX(m.x)}: ${formatValue(m.obv)} (${m.direction})`}
                      data-section="chart-line-obv-marker"
                      data-point-index={m.index}
                      data-obv={m.obv}
                      data-direction={m.direction}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={directionColor(m.direction)}
                      stroke="#ffffff"
                      strokeWidth={1}
                      onMouseEnter={() => {
                        setHoverIndex(m.index);
                        setTooltipPos({ px: m.px, py: m.py });
                      }}
                      onMouseLeave={clearHover}
                      onFocus={() => {
                        setHoverIndex(m.index);
                        setTooltipPos({ px: m.px, py: m.py });
                      }}
                      onBlur={clearHover}
                      onClick={() => {
                        const d = layout.priceDots.find(
                          (x) => x.index === m.index,
                        );
                        if (d) onPointClick?.({ point: d });
                      }}
                    />
                  );
                })}
              </g>
            ) : null}
          </svg>

          {showTooltip && hoverIndex !== null && tooltipPos
            ? (() => {
                const d = layout.priceDots.find(
                  (x) => x.index === hoverIndex,
                );
                if (!d) return null;
                return (
                  <div
                    data-section="chart-line-obv-tooltip"
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
                      minWidth: 150,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div data-section="chart-line-obv-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-obv-tooltip-price"
                      style={{ fontWeight: 600 }}
                    >
                      price: {formatValue(d.price)}
                    </div>
                    <div data-section="chart-line-obv-tooltip-volume">
                      volume: {formatValue(d.volume)}
                    </div>
                    <div data-section="chart-line-obv-tooltip-obv">
                      obv: {formatValue(d.obv)}
                    </div>
                    <div data-section="chart-line-obv-tooltip-direction">
                      direction: {d.direction}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-obv-legend"
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
                  data-section="chart-line-obv-legend-item"
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
                    data-section="chart-line-obv-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-obv-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-obv-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              final OBV {formatValue(layout.obvFinal)}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineObv.displayName = 'ChartLineObv';
