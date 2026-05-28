import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_RSI_WIDTH = 560;
export const DEFAULT_CHART_LINE_RSI_HEIGHT = 360;
export const DEFAULT_CHART_LINE_RSI_PADDING = 40;
export const DEFAULT_CHART_LINE_RSI_GAP = 26;
export const DEFAULT_CHART_LINE_RSI_PRICE_PANEL_RATIO = 0.58;
export const DEFAULT_CHART_LINE_RSI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RSI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RSI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RSI_PERIOD = 14;
export const DEFAULT_CHART_LINE_RSI_OVERBOUGHT = 70;
export const DEFAULT_CHART_LINE_RSI_OVERSOLD = 30;
export const DEFAULT_CHART_LINE_RSI_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_RSI_RSI_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_RSI_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RSI_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RSI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RSI_AXIS_COLOR = '#cbd5e1';

export type ChartLineRsiZone = 'overbought' | 'oversold' | 'neutral';

export interface ChartLineRsiPoint {
  x: number;
  value: number;
}

export interface ChartLineRsiSample {
  index: number;
  x: number;
  price: number;
  rsi: number | null;
  zone: ChartLineRsiZone | null;
}

export interface ChartLineRsiRun {
  series: ChartLineRsiPoint[];
  period: number;
  overbought: number;
  oversold: number;
  rsi: (number | null)[];
  samples: ChartLineRsiSample[];
  overboughtCount: number;
  oversoldCount: number;
  ok: boolean;
}

export interface ChartLineRsiPriceDot {
  index: number;
  x: number;
  price: number;
  rsi: number | null;
  zone: ChartLineRsiZone | null;
  px: number;
  py: number;
}

export interface ChartLineRsiMarker {
  index: number;
  x: number;
  rsi: number;
  zone: ChartLineRsiZone;
  px: number;
  py: number;
}

export interface ChartLineRsiPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineRsiLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineRsiPanel;
  rsiPanel: ChartLineRsiPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  rsiYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineRsiPriceDot[];
  rsiPath: string;
  rsiMarkers: ChartLineRsiMarker[];
  overboughtRect: { x: number; y: number; width: number; height: number };
  oversoldRect: { x: number; y: number; width: number; height: number };
  overboughtLineY: number;
  oversoldLineY: number;
  period: number;
  overbought: number;
  oversold: number;
  overboughtCount: number;
  oversoldCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineRsiLayoutOptions {
  data: readonly ChartLineRsiPoint[];
  period?: number;
  overbought?: number;
  oversold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineRsiProps {
  data: readonly ChartLineRsiPoint[];
  period?: number;
  overbought?: number;
  oversold?: number;
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
  rsiColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRsi?: boolean;
  showZones?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineRsiPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function clampRsiThreshold(v: number, fallback: number): number {
  if (!isFiniteNumber(v)) return fallback;
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

export function getLineRsiFinitePoints(
  points: readonly ChartLineRsiPoint[] | null | undefined,
): ChartLineRsiPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineRsiPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineRsiPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

function rsiFrom(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Welles Wilder's Relative Strength Index. Period-over-period
 * changes are split into gains and losses; the average gain and
 * average loss are Wilder-smoothed (the first average is the simple
 * mean of the first `period` changes, then
 * `avg = (avg * (period - 1) + change) / period`). The RSI is
 * `100 - 100 / (1 + avgGain / avgLoss)`, bounded to [0, 100]. An
 * all-gain window reads 100, an all-loss window 0, a flat window
 * 50. Indices before the window is full are `null`.
 */
export function computeLineRsi(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p + 1) return out;

  let sumGain = 0;
  let sumLoss = 0;
  for (let i = 1; i <= p; i += 1) {
    const d = values[i]! - values[i - 1]!;
    if (d > 0) sumGain += d;
    else sumLoss += -d;
  }
  let avgGain = sumGain / p;
  let avgLoss = sumLoss / p;
  out[p] = rsiFrom(avgGain, avgLoss);

  for (let i = p + 1; i < n; i += 1) {
    const d = values[i]! - values[i - 1]!;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (p - 1) + g) / p;
    avgLoss = (avgLoss * (p - 1) + l) / p;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

export function runLineRsi(
  points: readonly ChartLineRsiPoint[] | null | undefined,
  options?: { period?: number; overbought?: number; oversold?: number },
): ChartLineRsiRun {
  const finite = getLineRsiFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineRsiPeriod(
    options?.period ?? DEFAULT_CHART_LINE_RSI_PERIOD,
    DEFAULT_CHART_LINE_RSI_PERIOD,
  );
  const overbought = clampRsiThreshold(
    options?.overbought ?? DEFAULT_CHART_LINE_RSI_OVERBOUGHT,
    DEFAULT_CHART_LINE_RSI_OVERBOUGHT,
  );
  const oversold = clampRsiThreshold(
    options?.oversold ?? DEFAULT_CHART_LINE_RSI_OVERSOLD,
    DEFAULT_CHART_LINE_RSI_OVERSOLD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      overbought,
      oversold,
      rsi: [],
      samples: [],
      overboughtCount: 0,
      oversoldCount: 0,
      ok: false,
    };
  }

  const rsi = computeLineRsi(
    series.map((p) => p.value),
    period,
  );
  let overboughtCount = 0;
  let oversoldCount = 0;
  const samples: ChartLineRsiSample[] = series.map((p, i) => {
    const r = rsi[i] ?? null;
    let zone: ChartLineRsiZone | null = null;
    if (r !== null) {
      if (r >= overbought) {
        zone = 'overbought';
        overboughtCount += 1;
      } else if (r <= oversold) {
        zone = 'oversold';
        oversoldCount += 1;
      } else {
        zone = 'neutral';
      }
    }
    return { index: i, x: p.x, price: p.value, rsi: r, zone };
  });

  return {
    series = [],
    period,
    overbought,
    oversold,
    rsi,
    samples,
    overboughtCount,
    oversoldCount,
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

export function computeLineRsiLayout(
  options: ComputeLineRsiLayoutOptions,
): ChartLineRsiLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_RSI_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_RSI_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_RSI_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineRsiPanel = { x: padding, y: padding, width: 0, height: 0 };
  const emptyRect = { x: 0, y: 0, width: 0, height: 0 };
  const run = runLineRsi(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.overbought)
      ? { overbought: options.overbought }
      : {}),
    ...(isFiniteNumber(options.oversold)
      ? { oversold: options.oversold }
      : {}),
  });
  const empty: ChartLineRsiLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    rsiPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    rsiYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    rsiPath: '',
    rsiMarkers: [],
    overboughtRect: emptyRect,
    oversoldRect: emptyRect,
    overboughtLineY: 0,
    oversoldLineY: 0,
    period: run.period,
    overbought: run.overbought,
    oversold: run.oversold,
    overboughtCount: 0,
    oversoldCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const rsiH = usableHeight - priceH;
  if (priceH <= 0 || rsiH <= 0) return empty;

  const pricePanel: ChartLineRsiPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const rsiPanel: ChartLineRsiPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: rsiH,
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

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectRsiY = (v: number): number =>
    rsiPanel.y + rsiPanel.height - (v / 100) * rsiPanel.height;

  const priceDots: ChartLineRsiPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    price: s.price,
    rsi: s.rsi,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.price),
  }));

  const rsiMarkers: ChartLineRsiMarker[] = [];
  const rsiPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.rsi !== null && s.zone !== null) {
      const px = projectX(s.x);
      const py = projectRsiY(s.rsi);
      rsiPts.push({ px, py });
      rsiMarkers.push({
        index: s.index,
        x: s.x,
        rsi: s.rsi,
        zone: s.zone,
        px,
        py,
      });
    }
  }

  const obY = projectRsiY(run.overbought);
  const osY = projectRsiY(run.oversold);
  const topY = projectRsiY(100);
  const botY = projectRsiY(0);

  return {
    ok: true,
    width,
    height,
    pricePanel,
    rsiPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    rsiYTicks: computeTicks(0, 100, tickCount).map((v) => ({
      value: v,
      py: projectRsiY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    rsiPath: buildPath(rsiPts),
    rsiMarkers,
    overboughtRect: {
      x: rsiPanel.x,
      y: topY,
      width: rsiPanel.width,
      height: obY - topY,
    },
    oversoldRect: {
      x: rsiPanel.x,
      y: osY,
      width: rsiPanel.width,
      height: botY - osY,
    },
    overboughtLineY: obY,
    oversoldLineY: osY,
    period: run.period,
    overbought: run.overbought,
    oversold: run.oversold,
    overboughtCount: run.overboughtCount,
    oversoldCount: run.oversoldCount,
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

export function describeLineRsiChart(
  data: readonly ChartLineRsiPoint[] | null | undefined,
  options?: { period?: number; overbought?: number; oversold?: number },
): string {
  const run = runLineRsi(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with an RSI oscillator panel (period ${run.period}): overbought above ${run.overbought}, oversold below ${run.oversold} -- ${run.overboughtCount} overbought and ${run.oversoldCount} oversold readings across ${run.samples.length} periods.`;
}

const RSI_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineRsi = forwardRef<HTMLDivElement, ChartLineRsiProps>(
  function ChartLineRsi(
    props: ChartLineRsiProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      overbought,
      oversold,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_RSI_WIDTH,
      height = DEFAULT_CHART_LINE_RSI_HEIGHT,
      padding = DEFAULT_CHART_LINE_RSI_PADDING,
      gap = DEFAULT_CHART_LINE_RSI_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_RSI_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_RSI_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_RSI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_RSI_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_RSI_PRICE_COLOR,
      rsiColor = DEFAULT_CHART_LINE_RSI_RSI_COLOR,
      overboughtColor = DEFAULT_CHART_LINE_RSI_OVERBOUGHT_COLOR,
      oversoldColor = DEFAULT_CHART_LINE_RSI_OVERSOLD_COLOR,
      gridColor = DEFAULT_CHART_LINE_RSI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_RSI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showRsi = true,
      showZones = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with an RSI oscillator panel',
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
        computeLineRsiLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(overbought) ? { overbought } : {}),
          ...(isFiniteNumber(oversold) ? { oversold } : {}),
        }),
      [data, width, height, padding, gap, pricePanelRatio, tickCount, period, overbought, oversold],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineRsiChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(overbought) ? { overbought } : {}),
          ...(isFiniteNumber(oversold) ? { oversold } : {}),
        }),
      [ariaDescription, data, period, overbought, oversold],
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

    const zoneColor = useCallback(
      (zone: ChartLineRsiZone): string => {
        if (zone === 'overbought') return overboughtColor;
        if (zone === 'oversold') return oversoldColor;
        return rsiColor;
      },
      [overboughtColor, oversoldColor, rsiColor],
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
          data-section="chart-line-rsi"
          data-empty="true"
          data-overbought-count={0}
          data-oversold-count={0}
          data-animate={animate ? 'true' : 'false'}
        >
          <span id={descId} data-section="chart-line-rsi-aria-desc" style={RSI_SR_STYLE}>
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const rp = layout.rsiPanel;
    const priceVisible = !hiddenSet.has('price');
    const rsiVisible = showRsi && !hiddenSet.has('rsi');
    const zonesVisible = showZones && !hiddenSet.has('zones');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'rsi', label: 'RSI', color: rsiColor },
      { id: 'zones', label: 'Zones', color: overboughtColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-rsi"
        data-empty="false"
        data-period={layout.period}
        data-overbought-count={layout.overboughtCount}
        data-oversold-count={layout.oversoldCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-rsi-aria-desc" style={RSI_SR_STYLE}>
          {summary}
        </span>

        <div
          data-section="chart-line-rsi-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-rsi-badge"
              data-period={layout.period}
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
                data-section="chart-line-rsi-badge-icon"
                aria-hidden="true"
                style={{ color: rsiColor }}
              >
                RSI
              </span>
              <span data-section="chart-line-rsi-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-rsi-badge-zones">
                ob={layout.overbought} os={layout.oversold}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-rsi-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-rsi-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-rsi-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.rsiYTicks.map((t, i) => (
                  <line
                    key={`rgy-${i}`}
                    data-section="chart-line-rsi-grid-line"
                    data-panel="rsi"
                    x1={rp.x}
                    x2={rp.x + rp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {zonesVisible ? (
              <g data-section="chart-line-rsi-zones">
                <rect
                  data-section="chart-line-rsi-overbought-zone"
                  x={layout.overboughtRect.x}
                  y={layout.overboughtRect.y}
                  width={layout.overboughtRect.width}
                  height={layout.overboughtRect.height}
                  fill={overboughtColor}
                  fillOpacity={0.1}
                />
                <rect
                  data-section="chart-line-rsi-oversold-zone"
                  x={layout.oversoldRect.x}
                  y={layout.oversoldRect.y}
                  width={layout.oversoldRect.width}
                  height={layout.oversoldRect.height}
                  fill={oversoldColor}
                  fillOpacity={0.1}
                />
                <line
                  data-section="chart-line-rsi-threshold-line"
                  data-kind="overbought"
                  x1={rp.x}
                  x2={rp.x + rp.width}
                  y1={layout.overboughtLineY}
                  y2={layout.overboughtLineY}
                  stroke={overboughtColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-rsi-threshold-line"
                  data-kind="oversold"
                  x1={rp.x}
                  x2={rp.x + rp.width}
                  y1={layout.oversoldLineY}
                  y2={layout.oversoldLineY}
                  stroke={oversoldColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-rsi-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: rp, name: 'rsi', yt: layout.rsiYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-rsi-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-rsi-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-rsi-axis"
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
                        data-section="chart-line-rsi-tick"
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
                          data-section="chart-line-rsi-tick-label"
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
                <g data-section="chart-line-rsi-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-rsi-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={rp.y + rp.height}
                        y2={rp.y + rp.height + 4}
                      />
                      <text
                        data-section="chart-line-rsi-tick-label"
                        data-axis="x"
                        x={t.px}
                        y={rp.y + rp.height + 14}
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

            <g data-section="chart-line-rsi-panel-labels">
              <text
                data-section="chart-line-rsi-panel-label"
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
                data-section="chart-line-rsi-panel-label"
                data-panel="rsi"
                x={rp.x + rp.width / 2}
                y={rp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                RSI
              </text>
            </g>

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-rsi-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-rsi-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, price ${formatValue(d.price)}`}
                      data-section="chart-line-rsi-dot"
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

            {rsiVisible && layout.rsiPath ? (
              <path
                data-section="chart-line-rsi-rsi-line"
                d={layout.rsiPath}
                fill="none"
                stroke={rsiColor}
                strokeWidth={1.75}
              />
            ) : null}

            {rsiVisible ? (
              <g data-section="chart-line-rsi-markers">
                {layout.rsiMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`RSI at x ${formatX(m.x)}: ${formatValue(m.rsi)}, ${m.zone}`}
                      data-section="chart-line-rsi-marker"
                      data-point-index={m.index}
                      data-rsi={m.rsi}
                      data-zone={m.zone}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={zoneColor(m.zone)}
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
                    data-section="chart-line-rsi-tooltip"
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
                    <div data-section="chart-line-rsi-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-rsi-tooltip-price"
                      style={{ fontWeight: 600 }}
                    >
                      price: {formatValue(d.price)}
                    </div>
                    <div data-section="chart-line-rsi-tooltip-rsi">
                      rsi: {d.rsi === null ? 'n/a' : formatValue(d.rsi)}
                    </div>
                    {d.zone ? (
                      <div
                        data-section="chart-line-rsi-tooltip-zone"
                        style={{
                          color:
                            d.zone === 'neutral'
                              ? '#94a3b8'
                              : zoneColor(d.zone),
                          fontWeight: 600,
                        }}
                      >
                        {d.zone}
                      </div>
                    ) : null}
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-rsi-legend"
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
                  data-section="chart-line-rsi-legend-item"
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
                    data-section="chart-line-rsi-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-rsi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-rsi-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.overboughtCount} overbought / {layout.oversoldCount}{' '}
              oversold
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineRsi.displayName = 'ChartLineRsi';
