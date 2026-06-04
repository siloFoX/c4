import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_QSTICK_WIDTH = 560;
export const DEFAULT_CHART_LINE_QSTICK_HEIGHT = 360;
export const DEFAULT_CHART_LINE_QSTICK_PADDING = 40;
export const DEFAULT_CHART_LINE_QSTICK_GAP = 12;
export const DEFAULT_CHART_LINE_QSTICK_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_QSTICK_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_QSTICK_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_QSTICK_PERIOD = 10;
export const DEFAULT_CHART_LINE_QSTICK_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_QSTICK_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_QSTICK_QSTICK_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_QSTICK_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_QSTICK_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_QSTICK_NEUTRAL_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_QSTICK_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_QSTICK_AXIS_COLOR = '#cbd5e1';

export type ChartLineQstickSentiment = 'bullish' | 'bearish' | 'neutral';

export interface ChartLineQstickPoint {
  x: number;
  value: number;
  open: number;
}

export interface ChartLineQstickSample {
  index: number;
  x: number;
  value: number;
  open: number;
  spread: number;
  qstick: number | null;
  sentiment: ChartLineQstickSentiment;
}

export interface ChartLineQstickRun {
  series: ChartLineQstickPoint[];
  period: number;
  spread: number[];
  qstick: (number | null)[];
  samples: ChartLineQstickSample[];
  qstickFinal: number;
  qstickMin: number;
  qstickMax: number;
  bullishCount: number;
  bearishCount: number;
  ok: boolean;
}

export interface ChartLineQstickPriceDot {
  index: number;
  x: number;
  value: number;
  open: number;
  spread: number;
  qstick: number | null;
  sentiment: ChartLineQstickSentiment;
  px: number;
  py: number;
}

export interface ChartLineQstickMarker {
  index: number;
  x: number;
  qstick: number;
  sentiment: ChartLineQstickSentiment;
  px: number;
  py: number;
}

export interface ChartLineQstickPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineQstickLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineQstickPanel;
  qstickPanel: ChartLineQstickPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  qstickYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  qstickYMin: number;
  qstickYMax: number;
  pricePath: string;
  priceDots: ChartLineQstickPriceDot[];
  qstickPath: string;
  qstickMarkers: ChartLineQstickMarker[];
  zeroY: number;
  period: number;
  qstickFinal: number;
  bullishCount: number;
  bearishCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineQstickLayoutOptions {
  data: readonly ChartLineQstickPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineQstickProps {
  data: readonly ChartLineQstickPoint[];
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
  qstickColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  neutralColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showQstick?: boolean;
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
  onPointClick?: (payload: { point: ChartLineQstickPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineQstickFinitePoints(
  points: readonly ChartLineQstickPoint[] | null | undefined,
): ChartLineQstickPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineQstickPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.value) &&
      isFiniteNumber(p.open),
  );
}

/**
 * Coerce the Qstick period to a positive integer. A non-finite or
 * sub-1 value falls back to `fallback`; a fractional value floors.
 */
export function normalizeLineQstickPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The per-bar close-minus-open spread. `value` is the bar close,
 * `open` the bar open; the spread is `value - open`. A positive
 * spread is a bar that closed above its open (a bullish bar), a
 * negative spread one that closed below it. A non-finite pair
 * contributes a zero spread.
 */
export function computeLineQstickSpread(
  values: readonly number[] | null | undefined,
  opens: readonly number[] | null | undefined,
): number[] {
  if (!Array.isArray(values) || !Array.isArray(opens)) return [];
  const n = values.length;
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    const o = opens[i];
    out[i] = isFiniteNumber(v) && isFiniteNumber(o) ? v - o : 0;
  }
  return out;
}

/**
 * The Qstick indicator -- the `period`-bar simple moving average of
 * the close-minus-open spread:
 *
 *   Qstick[i] = SMA(close[j] - open[j], period)
 *
 * A positive Qstick marks sustained buying pressure (closes
 * consistently above opens), a negative Qstick selling pressure,
 * and a reading near zero a balanced market. Bars before the
 * window is full are null.
 */
export function computeLineQstick(
  values: readonly number[] | null | undefined,
  opens: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  const spread = computeLineQstickSpread(values, opens);
  const n = spread.length;
  const p = normalizeLineQstickPeriod(period, DEFAULT_CHART_LINE_QSTICK_PERIOD);
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p) return out;
  for (let i = p - 1; i < n; i += 1) {
    let sum = 0;
    for (let k = 0; k < p; k += 1) sum += spread[i - k]!;
    out[i] = sum / p;
  }
  return out;
}

function classifySentiment(v: number | null): ChartLineQstickSentiment {
  if (v === null || v === 0) return 'neutral';
  return v > 0 ? 'bullish' : 'bearish';
}

export function runLineQstick(
  points: readonly ChartLineQstickPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineQstickRun {
  const finite = getLineQstickFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineQstickPeriod(
    options?.period ?? DEFAULT_CHART_LINE_QSTICK_PERIOD,
    DEFAULT_CHART_LINE_QSTICK_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      spread: [],
      qstick: [],
      samples: [],
      qstickFinal: NaN,
      qstickMin: NaN,
      qstickMax: NaN,
      bullishCount: 0,
      bearishCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const opens = series.map((p) => p.open);
  const spread = computeLineQstickSpread(values, opens);
  const qstick = computeLineQstick(values, opens, period);

  const samples: ChartLineQstickSample[] = series.map((p, i) => {
    const q = qstick[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      open: p.open,
      spread: spread[i] ?? 0,
      qstick: q,
      sentiment: classifySentiment(q),
    };
  });

  let bullishCount = 0;
  let bearishCount = 0;
  let qMin = Number.POSITIVE_INFINITY;
  let qMax = Number.NEGATIVE_INFINITY;
  let qFinal = NaN;
  for (const s of samples) {
    if (s.sentiment === 'bullish') bullishCount += 1;
    else if (s.sentiment === 'bearish') bearishCount += 1;
    if (s.qstick !== null) {
      if (s.qstick < qMin) qMin = s.qstick;
      if (s.qstick > qMax) qMax = s.qstick;
      qFinal = s.qstick;
    }
  }

  return {
    series,
    period,
    spread,
    qstick,
    samples,
    qstickFinal: qFinal,
    qstickMin: isFiniteNumber(qMin) ? qMin : NaN,
    qstickMax: isFiniteNumber(qMax) ? qMax : NaN,
    bullishCount,
    bearishCount,
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

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function computeLineQstickLayout(
  options: ComputeLineQstickLayoutOptions,
): ChartLineQstickLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_QSTICK_GAP,
    tickCount = DEFAULT_CHART_LINE_QSTICK_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_QSTICK_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineQstick(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });

  const emptyPanel: ChartLineQstickPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineQstickLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    qstickPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    qstickYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    qstickYMin: 0,
    qstickYMax: 0,
    pricePath: '',
    priceDots: [],
    qstickPath: '',
    qstickMarkers: [],
    zeroY: 0,
    period: run.period,
    qstickFinal: NaN,
    bullishCount: 0,
    bearishCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const qstickHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineQstickPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const qstickPanel: ChartLineQstickPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: qstickHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < priceLo) priceLo = s.value;
    if (s.value > priceHi) priceHi = s.value;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }

  let bound = Math.max(Math.abs(run.qstickMin), Math.abs(run.qstickMax));
  if (!isFiniteNumber(bound) || bound <= 0) bound = 1;
  const qstickLo = -bound;
  const qstickHi = bound;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const qstickRange = qstickHi - qstickLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectQstickY = (v: number): number =>
    qstickPanel.y +
    qstickPanel.height -
    ((v - qstickLo) / qstickRange) * qstickPanel.height;

  const priceDots: ChartLineQstickPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    open: s.open,
    spread: s.spread,
    qstick: s.qstick,
    sentiment: s.sentiment,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const qstickMarkers: ChartLineQstickMarker[] = run.samples
    .filter((s) => s.qstick !== null)
    .map((s) => {
      const q = s.qstick!;
      return {
        index: s.index,
        x: s.x,
        qstick: q,
        sentiment: s.sentiment,
        px: projectX(s.x),
        py: projectQstickY(q),
      };
    });

  return {
    ok: true,
    width,
    height,
    pricePanel,
    qstickPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    qstickYTicks: computeTicks(qstickLo, qstickHi, tickCount).map((v) => ({
      value: v,
      py: projectQstickY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    qstickYMin: qstickLo,
    qstickYMax: qstickHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    qstickPath: buildPath(
      qstickMarkers.map((m) => ({ px: m.px, py: m.py })),
    ),
    qstickMarkers,
    zeroY: projectQstickY(0),
    period: run.period,
    qstickFinal: run.qstickFinal,
    bullishCount: run.bullishCount,
    bearishCount: run.bearishCount,
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

export function describeLineQstickChart(
  data: readonly ChartLineQstickPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineQstick(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Qstick indicator (period ${run.period}): the top panel plots the raw price; the bottom panel plots the Qstick, a zero-centred oscillator. The per-bar spread is the close minus the open; the Qstick is the ${run.period}-bar simple moving average of that spread. A positive Qstick marks sustained buying pressure (closes consistently above opens), a negative Qstick selling pressure, and a reading near zero a balanced market. The Qstick reads bullish on ${run.bullishCount} bars and bearish on ${run.bearishCount} across ${run.samples.length} bars.`;
}

const QSTICK_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineQstick = forwardRef<HTMLDivElement, ChartLineQstickProps>(
  function ChartLineQstick(
    props: ChartLineQstickProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_QSTICK_WIDTH,
      height = DEFAULT_CHART_LINE_QSTICK_HEIGHT,
      padding = DEFAULT_CHART_LINE_QSTICK_PADDING,
      gap = DEFAULT_CHART_LINE_QSTICK_GAP,
      tickCount = DEFAULT_CHART_LINE_QSTICK_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_QSTICK_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_QSTICK_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_QSTICK_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_QSTICK_PRICE_COLOR,
      qstickColor = DEFAULT_CHART_LINE_QSTICK_QSTICK_COLOR,
      bullishColor = DEFAULT_CHART_LINE_QSTICK_BULLISH_COLOR,
      bearishColor = DEFAULT_CHART_LINE_QSTICK_BEARISH_COLOR,
      neutralColor = DEFAULT_CHART_LINE_QSTICK_NEUTRAL_COLOR,
      gridColor = DEFAULT_CHART_LINE_QSTICK_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_QSTICK_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showQstick = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a Qstick indicator',
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
        computeLineQstickLayout({
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
        describeLineQstickChart(data, {
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
          data-section="chart-line-qstick"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-qstick-aria-desc"
            style={QSTICK_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const qp = layout.qstickPanel;
    const priceVisible = !hiddenSet.has('price');
    const qstickVisible = showQstick && !hiddenSet.has('qstick');

    const sentimentColor = (s: ChartLineQstickSentiment): string =>
      s === 'bullish'
        ? bullishColor
        : s === 'bearish'
          ? bearishColor
          : neutralColor;

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'qstick', label: 'Qstick', color: qstickColor },
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
        data-section="chart-line-qstick"
        data-empty="false"
        data-period={layout.period}
        data-qstick-final={layout.qstickFinal}
        data-bullish-count={layout.bullishCount}
        data-bearish-count={layout.bearishCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-qstick-aria-desc"
          style={QSTICK_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-qstick-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-qstick-badge"
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
                data-section="chart-line-qstick-badge-icon"
                aria-hidden="true"
                style={{ color: qstickColor }}
              >
                QSTICK
              </span>
              <span data-section="chart-line-qstick-badge-period">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-qstick-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-qstick-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-qstick-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.qstickYTicks.map((t, i) => (
                  <line
                    key={`gq-${i}`}
                    data-section="chart-line-qstick-grid-line"
                    data-panel="qstick"
                    x1={qp.x}
                    x2={qp.x + qp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-qstick-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-qstick-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-qstick-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-qstick-axis"
                  data-panel="qstick"
                  data-axis="y"
                  x1={qp.x}
                  y1={qp.y}
                  x2={qp.x}
                  y2={qp.y + qp.height}
                />
                <line
                  data-section="chart-line-qstick-axis"
                  data-panel="qstick"
                  data-axis="x"
                  x1={qp.x}
                  y1={qp.y + qp.height}
                  x2={qp.x + qp.width}
                  y2={qp.y + qp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-qstick-tick-label"
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
                {layout.qstickYTicks.map((t, i) => (
                  <text
                    key={`qyt-${i}`}
                    data-section="chart-line-qstick-tick-label"
                    data-panel="qstick"
                    data-axis="y"
                    x={qp.x - 6}
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
                    data-section="chart-line-qstick-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={qp.y + qp.height + 14}
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
              data-section="chart-line-qstick-panel-label"
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
              data-section="chart-line-qstick-panel-label"
              data-panel="qstick"
              x={qp.x + 2}
              y={qp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Qstick
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-qstick-zero-line"
                x1={qp.x}
                x2={qp.x + qp.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={neutralColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-qstick-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-qstick-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.value)}, open ${formatValue(d.open)}`}
                      data-section="chart-line-qstick-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.value}
                      data-open={d.open}
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

            {qstickVisible && layout.qstickPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Qstick indicator line"
                data-section="chart-line-qstick-qstick-line"
                d={layout.qstickPath}
                fill="none"
                stroke={qstickColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {qstickVisible ? (
              <g data-section="chart-line-qstick-markers">
                {layout.qstickMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Qstick at x ${formatX(m.x)}: ${formatValue(m.qstick)}, ${m.sentiment}`}
                      data-section="chart-line-qstick-marker"
                      data-point-index={m.index}
                      data-qstick={m.qstick}
                      data-sentiment={m.sentiment}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={sentimentColor(m.sentiment)}
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
                    data-section="chart-line-qstick-tooltip"
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
                    <div data-section="chart-line-qstick-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-qstick-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      close: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-qstick-tooltip-open">
                      open: {formatValue(d.open)}
                    </div>
                    <div data-section="chart-line-qstick-tooltip-spread">
                      spread: {formatValue(d.spread)}
                    </div>
                    <div data-section="chart-line-qstick-tooltip-qstick">
                      qstick: {fmtNullable(d.qstick)}
                    </div>
                    <div data-section="chart-line-qstick-tooltip-sentiment">
                      sentiment: {d.sentiment}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-qstick-legend"
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
                  data-section="chart-line-qstick-legend-item"
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
                    data-section="chart-line-qstick-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-qstick-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-qstick-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.bullishCount} bullish, {layout.bearishCount} bearish
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineQstick.displayName = 'ChartLineQstick';
