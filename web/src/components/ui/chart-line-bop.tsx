import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_BOP_WIDTH = 560;
export const DEFAULT_CHART_LINE_BOP_HEIGHT = 360;
export const DEFAULT_CHART_LINE_BOP_PADDING = 40;
export const DEFAULT_CHART_LINE_BOP_GAP = 12;
export const DEFAULT_CHART_LINE_BOP_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_BOP_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_BOP_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_BOP_PERIOD = 14;
export const DEFAULT_CHART_LINE_BOP_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_BOP_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_BOP_BOP_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_BOP_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_BOP_BUY_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_BOP_SELL_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_BOP_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_BOP_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_BOP_AXIS_COLOR = '#cbd5e1';

export type ChartLineBopZone = 'buy' | 'sell' | 'balanced' | 'none';

export interface ChartLineBopPoint {
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLineBopSample {
  index: number;
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
  raw: number | null;
  signal: number | null;
  zone: ChartLineBopZone;
}

export interface ChartLineBopRun {
  series: ChartLineBopPoint[];
  period: number;
  raw: (number | null)[];
  signal: (number | null)[];
  samples: ChartLineBopSample[];
  bopFinal: number;
  signalFinal: number;
  buyCount: number;
  sellCount: number;
  balancedCount: number;
  ok: boolean;
}

export interface ChartLineBopPriceDot {
  index: number;
  x: number;
  close: number;
  raw: number | null;
  signal: number | null;
  zone: ChartLineBopZone;
  px: number;
  py: number;
}

export interface ChartLineBopMarker {
  index: number;
  x: number;
  raw: number;
  zone: ChartLineBopZone;
  px: number;
  py: number;
}

export interface ChartLineBopPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineBopLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineBopPanel;
  bopPanel: ChartLineBopPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  bopYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineBopPriceDot[];
  bopPath: string;
  signalPath: string;
  markers: ChartLineBopMarker[];
  zeroY: number;
  period: number;
  bopFinal: number;
  signalFinal: number;
  buyCount: number;
  sellCount: number;
  balancedCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineBopLayoutOptions {
  data: readonly ChartLineBopPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineBopProps {
  data: readonly ChartLineBopPoint[];
  period?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  bopColor?: string;
  signalColor?: string;
  buyColor?: string;
  sellColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSignal?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineBopPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function getLineBopFinitePoints(
  points: readonly ChartLineBopPoint[] | null | undefined,
): ChartLineBopPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineBopPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.open) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close),
  );
}

/**
 * Coerce a Balance of Power signal smoothing length to a positive
 * integer. A non-finite or sub-1 value falls back to `fallback`;
 * a fractional value floors.
 */
export function normalizeLineBopPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The raw Balance of Power of each bar -- the close-minus-open
 * spread divided by the bar's high-to-low range, clamped to
 * -1..+1. A bar with no range reads zero. A bar with a non-finite
 * field is null.
 */
export function computeLineBopRaw(
  bars: readonly ChartLineBopPoint[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const out: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i];
    if (!b) continue;
    if (
      !isFiniteNumber(b.open) ||
      !isFiniteNumber(b.high) ||
      !isFiniteNumber(b.low) ||
      !isFiniteNumber(b.close)
    ) {
      continue;
    }
    const range = b.high - b.low;
    out[i] = range > 0 ? clamp((b.close - b.open) / range, -1, 1) : 0;
  }
  return out;
}

function rollingMean(
  values: readonly (number | null)[],
  window: number,
): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const w = window < 1 ? 1 : Math.floor(window);
  for (let i = w - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = i - w + 1; k <= i; k += 1) {
      const v = values[k];
      if (v === null || v === undefined) {
        valid = false;
        break;
      }
      sum += v;
    }
    if (valid) out[i] = sum / w;
  }
  return out;
}

/**
 * The Balance of Power signal line -- the simple moving average
 * of the raw Balance of Power over `period` bars.
 */
export function computeLineBop(
  bars: readonly ChartLineBopPoint[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const raw = computeLineBopRaw(bars);
  const p = normalizeLineBopPeriod(period, DEFAULT_CHART_LINE_BOP_PERIOD);
  return rollingMean(raw, p);
}

function classifyZone(raw: number | null): ChartLineBopZone {
  if (raw === null) return 'none';
  if (raw > 0) return 'buy';
  if (raw < 0) return 'sell';
  return 'balanced';
}

export function runLineBop(
  points: readonly ChartLineBopPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineBopRun {
  const finite = getLineBopFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineBopPeriod(
    options?.period ?? DEFAULT_CHART_LINE_BOP_PERIOD,
    DEFAULT_CHART_LINE_BOP_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      raw: [],
      signal: [],
      samples: [],
      bopFinal: NaN,
      signalFinal: NaN,
      buyCount: 0,
      sellCount: 0,
      balancedCount: 0,
      ok: false,
    };
  }

  const raw = computeLineBopRaw(series);
  const signal = computeLineBop(series, period);

  const samples: ChartLineBopSample[] = series.map((p, i) => {
    const r = raw[i] ?? null;
    return {
      index: i,
      x: p.x,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      raw: r,
      signal: signal[i] ?? null,
      zone: classifyZone(r),
    };
  });

  let buyCount = 0;
  let sellCount = 0;
  let balancedCount = 0;
  let bopFinal = NaN;
  let signalFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'buy') buyCount += 1;
    else if (s.zone === 'sell') sellCount += 1;
    else if (s.zone === 'balanced') balancedCount += 1;
    if (s.raw !== null) bopFinal = s.raw;
    if (s.signal !== null) signalFinal = s.signal;
  }

  return {
    series,
    period,
    raw,
    signal,
    samples,
    bopFinal,
    signalFinal,
    buyCount,
    sellCount,
    balancedCount,
    ok: true,
  };
}

function buildPath(points: readonly { px: number; py: number }[]): string {
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

export function computeLineBopLayout(
  options: ComputeLineBopLayoutOptions,
): ChartLineBopLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_BOP_GAP,
    tickCount = DEFAULT_CHART_LINE_BOP_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_BOP_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineBop(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });

  const emptyPanel: ChartLineBopPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineBopLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    bopPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    bopYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    bopPath: '',
    signalPath: '',
    markers: [],
    zeroY: 0,
    period: run.period,
    bopFinal: NaN,
    signalFinal: NaN,
    buyCount: 0,
    sellCount: 0,
    balancedCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const bopHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineBopPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const bopPanel: ChartLineBopPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: bopHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.close < priceLo) priceLo = s.close;
    if (s.close > priceHi) priceHi = s.close;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectBopY = (v: number): number =>
    bopPanel.y +
    bopPanel.height -
    ((clamp(v, -1, 1) + 1) / 2) * bopPanel.height;

  const priceDots: ChartLineBopPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    close: s.close,
    raw: s.raw,
    signal: s.signal,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.close),
  }));

  const bopPts: { px: number; py: number }[] = [];
  const signalPts: { px: number; py: number }[] = [];
  const markers: ChartLineBopMarker[] = [];
  for (const s of run.samples) {
    if (s.raw !== null) {
      const px = projectX(s.x);
      const py = projectBopY(s.raw);
      bopPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        raw: s.raw,
        zone: s.zone,
        px,
        py,
      });
    }
    if (s.signal !== null) {
      signalPts.push({ px: projectX(s.x), py: projectBopY(s.signal) });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    bopPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    bopYTicks: computeTicks(-1, 1, tickCount).map((v) => ({
      value: v,
      py: projectBopY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    bopPath: buildPath(bopPts),
    signalPath: buildPath(signalPts),
    markers,
    zeroY: projectBopY(0),
    period: run.period,
    bopFinal: run.bopFinal,
    signalFinal: run.signalFinal,
    buyCount: run.buyCount,
    sellCount: run.sellCount,
    balancedCount: run.balancedCount,
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

export function describeLineBopChart(
  data: readonly ChartLineBopPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineBop(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with the Balance of Power (signal SMA ${run.period}): the top panel plots the close; the bottom panel plots the Balance of Power. Each bar's Balance of Power is the close-minus-open spread divided by the bar's high-to-low range -- it reads +1 when a bar closes at its high after opening at its low with buyers in full control, -1 in the mirror case with sellers in control, and zero for a doji that closes where it opened. A signal line averages the Balance of Power over ${run.period} bars. The Balance of Power favours buyers on ${run.buyCount} bars, sellers on ${run.sellCount} and is balanced on ${run.balancedCount} across ${run.samples.length} bars.`;
}

const BOP_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineBop = forwardRef<HTMLDivElement, ChartLineBopProps>(
  function ChartLineBop(
    props: ChartLineBopProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_BOP_WIDTH,
      height = DEFAULT_CHART_LINE_BOP_HEIGHT,
      padding = DEFAULT_CHART_LINE_BOP_PADDING,
      gap = DEFAULT_CHART_LINE_BOP_GAP,
      tickCount = DEFAULT_CHART_LINE_BOP_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_BOP_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_BOP_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_BOP_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_BOP_PRICE_COLOR,
      bopColor = DEFAULT_CHART_LINE_BOP_BOP_COLOR,
      signalColor = DEFAULT_CHART_LINE_BOP_SIGNAL_COLOR,
      buyColor = DEFAULT_CHART_LINE_BOP_BUY_COLOR,
      sellColor = DEFAULT_CHART_LINE_BOP_SELL_COLOR,
      zeroColor = DEFAULT_CHART_LINE_BOP_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_BOP_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_BOP_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showSignal = true,
      showZeroLine = true,
      showMarkers = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with the Balance of Power',
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
        computeLineBopLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
          ...(isFiniteNumber(period) ? { period } : {}),
        }),
      [data, width, height, padding, gap, tickCount, pricePanelRatio, period],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineBopChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
        }),
      [ariaDescription, data, period],
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
          data-section="chart-line-bop"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-bop-aria-desc"
            style={BOP_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const bp = layout.bopPanel;
    const priceVisible = !hiddenSet.has('price');
    const bopVisible = !hiddenSet.has('bop');
    const signalVisible = showSignal && !hiddenSet.has('signal');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const zoneColor = (zone: ChartLineBopZone): string => {
      if (zone === 'buy') return buyColor;
      if (zone === 'sell') return sellColor;
      return bopColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'bop', label: 'BOP', color: bopColor },
      { id: 'signal', label: 'Signal', color: signalColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={
          [className, animateClass].filter(Boolean).join(' ') || undefined
        }
        style={containerStyle}
        data-section="chart-line-bop"
        data-empty="false"
        data-period={layout.period}
        data-bop-final={layout.bopFinal}
        data-signal-final={layout.signalFinal}
        data-buy-count={layout.buyCount}
        data-sell-count={layout.sellCount}
        data-balanced-count={layout.balancedCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-bop-aria-desc"
          style={BOP_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-bop-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-bop-badge"
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
                data-section="chart-line-bop-badge-icon"
                aria-hidden="true"
                style={{ color: bopColor }}
              >
                BOP
              </span>
              <span data-section="chart-line-bop-badge-config">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-bop-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-bop-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-bop-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.bopYTicks.map((t, i) => (
                  <line
                    key={`gb-${i}`}
                    data-section="chart-line-bop-grid-line"
                    data-panel="bop"
                    x1={bp.x}
                    x2={bp.x + bp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-bop-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-bop-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-bop-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-bop-axis"
                  data-panel="bop"
                  data-axis="y"
                  x1={bp.x}
                  y1={bp.y}
                  x2={bp.x}
                  y2={bp.y + bp.height}
                />
                <line
                  data-section="chart-line-bop-axis"
                  data-panel="bop"
                  data-axis="x"
                  x1={bp.x}
                  y1={bp.y + bp.height}
                  x2={bp.x + bp.width}
                  y2={bp.y + bp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-bop-tick-label"
                    data-panel="price"
                    data-axis="y"
                    x={pp.x - 6}
                    y={t.py + 3}
                    textAnchor="end"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatValue(t.value)}
                  </text>
                ))}
                {layout.bopYTicks.map((t, i) => (
                  <text
                    key={`byt-${i}`}
                    data-section="chart-line-bop-tick-label"
                    data-panel="bop"
                    data-axis="y"
                    x={bp.x - 6}
                    y={t.py + 3}
                    textAnchor="end"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatValue(t.value)}
                  </text>
                ))}
                {layout.xTicks.map((t, i) => (
                  <text
                    key={`xt-${i}`}
                    data-section="chart-line-bop-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={bp.y + bp.height + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatX(t.value)}
                  </text>
                ))}
              </g>
            ) : null}

            <text
              data-section="chart-line-bop-panel-label"
              data-panel="price"
              x={pp.x + 2}
              y={pp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Price
            </text>
            <text
              data-section="chart-line-bop-panel-label"
              data-panel="bop"
              x={bp.x + 2}
              y={bp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Balance of Power
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-bop-zero-line"
                x1={bp.x}
                x2={bp.x + bp.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-bop-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-bop-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                      data-section="chart-line-bop-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-close={d.close}
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

            {signalVisible && layout.signalPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Balance of Power signal line"
                data-section="chart-line-bop-signal-line"
                d={layout.signalPath}
                fill="none"
                stroke={signalColor}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {bopVisible && layout.bopPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Balance of Power line"
                data-section="chart-line-bop-bop-line"
                d={layout.bopPath}
                fill="none"
                stroke={bopColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {bopVisible && showMarkers ? (
              <g data-section="chart-line-bop-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Balance of Power at x ${formatX(m.x)}: ${formatValue(m.raw)}, ${m.zone}`}
                      data-section="chart-line-bop-marker"
                      data-point-index={m.index}
                      data-bop={m.raw}
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
                const d = layout.priceDots.find((x) => x.index === hoverIndex);
                if (!d) return null;
                return (
                  <div
                    data-section="chart-line-bop-tooltip"
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
                    <div data-section="chart-line-bop-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-bop-tooltip-close"
                      style={{ fontWeight: 600 }}
                    >
                      close: {formatValue(d.close)}
                    </div>
                    <div data-section="chart-line-bop-tooltip-bop">
                      bop: {fmtNullable(d.raw)}
                    </div>
                    <div data-section="chart-line-bop-tooltip-signal">
                      signal: {fmtNullable(d.signal)}
                    </div>
                    <div data-section="chart-line-bop-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-bop-legend"
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
                  data-section="chart-line-bop-legend-item"
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
                    data-section="chart-line-bop-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-bop-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-bop-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.buyCount} buy, {layout.sellCount} sell,{' '}
              {layout.balancedCount} balanced
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineBop.displayName = 'ChartLineBop';
