import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_TII_WIDTH = 560;
export const DEFAULT_CHART_LINE_TII_HEIGHT = 360;
export const DEFAULT_CHART_LINE_TII_PADDING = 40;
export const DEFAULT_CHART_LINE_TII_GAP = 12;
export const DEFAULT_CHART_LINE_TII_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TII_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TII_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TII_PERIOD = 20;
export const DEFAULT_CHART_LINE_TII_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_TII_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_TII_TII_COLOR = '#65a30d';
export const DEFAULT_CHART_LINE_TII_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TII_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TII_NEUTRAL_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TII_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TII_AXIS_COLOR = '#cbd5e1';

export type ChartLineTiiTrend = 'up' | 'down' | 'neutral';

export interface ChartLineTiiPoint {
  x: number;
  value: number;
}

export interface ChartLineTiiSeries {
  deviations: (number | null)[];
  tii: (number | null)[];
}

export interface ChartLineTiiSample {
  index: number;
  x: number;
  value: number;
  deviation: number | null;
  tii: number | null;
  trend: ChartLineTiiTrend;
}

export interface ChartLineTiiRun {
  series: ChartLineTiiPoint[];
  period: number;
  deviations: (number | null)[];
  tii: (number | null)[];
  samples: ChartLineTiiSample[];
  tiiFinal: number;
  tiiMin: number;
  tiiMax: number;
  upCount: number;
  downCount: number;
  ok: boolean;
}

export interface ChartLineTiiPriceDot {
  index: number;
  x: number;
  value: number;
  deviation: number | null;
  tii: number | null;
  trend: ChartLineTiiTrend;
  px: number;
  py: number;
}

export interface ChartLineTiiMarker {
  index: number;
  x: number;
  tii: number;
  trend: ChartLineTiiTrend;
  px: number;
  py: number;
}

export interface ChartLineTiiPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineTiiLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineTiiPanel;
  tiiPanel: ChartLineTiiPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  tiiYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  tiiYMin: number;
  tiiYMax: number;
  pricePath: string;
  priceDots: ChartLineTiiPriceDot[];
  tiiPath: string;
  tiiMarkers: ChartLineTiiMarker[];
  refY: number;
  period: number;
  tiiFinal: number;
  upCount: number;
  downCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineTiiLayoutOptions {
  data: readonly ChartLineTiiPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineTiiProps {
  data: readonly ChartLineTiiPoint[];
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
  tiiColor?: string;
  upColor?: string;
  downColor?: string;
  neutralColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTii?: boolean;
  showRefLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineTiiPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineTiiFinitePoints(
  points: readonly ChartLineTiiPoint[] | null | undefined,
): ChartLineTiiPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineTiiPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce the Trend Intensity Index period to an integer of at least
 * 2. A non-finite or sub-2 value falls back to `fallback`; a
 * fractional value floors.
 */
export function normalizeLineTiiPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

function simpleMovingAverage(
  values: readonly number[],
  period: number,
): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < period) return out;
  for (let i = period - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = 0; k < period; k += 1) {
      const v = values[i - k];
      if (!isFiniteNumber(v)) {
        valid = false;
        break;
      }
      sum += v;
    }
    out[i] = valid ? sum / period : null;
  }
  return out;
}

/**
 * The per-bar deviation of the close from its `period`-bar moving
 * average: `deviation[i] = close[i] - SMA(close, period)[i]`. Null
 * through the moving-average warm-up.
 */
export function computeLineTiiDeviations(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLineTiiPeriod(period, DEFAULT_CHART_LINE_TII_PERIOD);
  const sma = simpleMovingAverage(closes, p);
  const n = closes.length;
  const out: (number | null)[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const s = sma[i];
    const c = closes[i];
    out[i] = isFiniteNumber(s) && isFiniteNumber(c) ? c - s : null;
  }
  return out;
}

/**
 * The Trend Intensity Index. The close's deviation from its
 * `period`-bar moving average is split into a positive part and a
 * negative part; over the trailing `period` window the positive
 * deviations are summed (`SDPos`) and the negative deviations are
 * summed in magnitude (`SDNeg`):
 *
 *   TII[i] = 100 * SDPos / (SDPos + SDNeg)
 *
 * the percentage share of the positive deviation sum. The TII runs
 * from 0 to 100: a reading above 50 marks an uptrend (positive
 * deviations dominate), below 50 a downtrend. A window with no
 * deviation at all (a flat market) is null, as are bars before the
 * window is full.
 */
export function computeLineTii(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLineTiiPeriod(period, DEFAULT_CHART_LINE_TII_PERIOD);
  const dev = computeLineTiiDeviations(closes, p);
  const n = dev.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const warmup = 2 * p - 2;
  for (let i = warmup; i < n; i += 1) {
    let sdPos = 0;
    let sdNeg = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const d = dev[i - k];
      if (!isFiniteNumber(d)) {
        valid = false;
        break;
      }
      if (d > 0) sdPos += d;
      else if (d < 0) sdNeg += -d;
    }
    if (!valid) continue;
    const total = sdPos + sdNeg;
    out[i] = total > 0 ? (100 * sdPos) / total : null;
  }
  return out;
}

function classifyTrend(v: number | null): ChartLineTiiTrend {
  if (v === null || v === 50) return 'neutral';
  return v > 50 ? 'up' : 'down';
}

export function runLineTii(
  points: readonly ChartLineTiiPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineTiiRun {
  const finite = getLineTiiFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineTiiPeriod(
    options?.period ?? DEFAULT_CHART_LINE_TII_PERIOD,
    DEFAULT_CHART_LINE_TII_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      deviations: [],
      tii: [],
      samples: [],
      tiiFinal: NaN,
      tiiMin: NaN,
      tiiMax: NaN,
      upCount: 0,
      downCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const deviations = computeLineTiiDeviations(closes, period);
  const tii = computeLineTii(closes, period);

  const samples: ChartLineTiiSample[] = series.map((p, i) => {
    const t = tii[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      deviation: deviations[i] ?? null,
      tii: t,
      trend: classifyTrend(t),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let tMin = Number.POSITIVE_INFINITY;
  let tMax = Number.NEGATIVE_INFINITY;
  let tFinal = NaN;
  for (const s of samples) {
    if (s.trend === 'up') upCount += 1;
    else if (s.trend === 'down') downCount += 1;
    if (s.tii !== null) {
      if (s.tii < tMin) tMin = s.tii;
      if (s.tii > tMax) tMax = s.tii;
      tFinal = s.tii;
    }
  }

  return {
    series,
    period,
    deviations,
    tii,
    samples,
    tiiFinal: tFinal,
    tiiMin: isFiniteNumber(tMin) ? tMin : NaN,
    tiiMax: isFiniteNumber(tMax) ? tMax : NaN,
    upCount,
    downCount,
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

export function computeLineTiiLayout(
  options: ComputeLineTiiLayoutOptions,
): ChartLineTiiLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_TII_GAP,
    tickCount = DEFAULT_CHART_LINE_TII_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_TII_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineTii(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });

  const emptyPanel: ChartLineTiiPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineTiiLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    tiiPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    tiiYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    tiiYMin: 0,
    tiiYMax: 100,
    pricePath: '',
    priceDots: [],
    tiiPath: '',
    tiiMarkers: [],
    refY: 0,
    period: run.period,
    tiiFinal: NaN,
    upCount: 0,
    downCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const tiiHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineTiiPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const tiiPanel: ChartLineTiiPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: tiiHeight,
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

  // The TII is bounded to [0, 100], so the bottom panel uses a
  // fixed [0, 100] domain with a 50 reference line.
  const tiiLo = 0;
  const tiiHi = 100;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const tiiRange = tiiHi - tiiLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectTiiY = (v: number): number =>
    tiiPanel.y + tiiPanel.height - ((v - tiiLo) / tiiRange) * tiiPanel.height;

  const priceDots: ChartLineTiiPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    deviation: s.deviation,
    tii: s.tii,
    trend: s.trend,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const tiiMarkers: ChartLineTiiMarker[] = run.samples
    .filter((s) => s.tii !== null)
    .map((s) => {
      const t = s.tii!;
      return {
        index: s.index,
        x: s.x,
        tii: t,
        trend: s.trend,
        px: projectX(s.x),
        py: projectTiiY(t),
      };
    });

  return {
    ok: true,
    width,
    height,
    pricePanel,
    tiiPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    tiiYTicks: computeTicks(tiiLo, tiiHi, tickCount).map((v) => ({
      value: v,
      py: projectTiiY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    tiiYMin: tiiLo,
    tiiYMax: tiiHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    tiiPath: buildPath(tiiMarkers.map((m) => ({ px: m.px, py: m.py }))),
    tiiMarkers,
    refY: projectTiiY(50),
    period: run.period,
    tiiFinal: run.tiiFinal,
    upCount: run.upCount,
    downCount: run.downCount,
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

export function describeLineTiiChart(
  data: readonly ChartLineTiiPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineTii(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Trend Intensity Index (period ${run.period}): the top panel plots the raw price; the bottom panel plots the TII, a 0 to 100 gauge. The deviation of the close from its ${run.period}-bar moving average is split into a positive part and a negative part; the TII is the percentage share of the positive deviation sum over the total deviation sum across the trailing window. A TII above 50 marks an uptrend (positive deviations dominate), below 50 a downtrend. The TII reads up on ${run.upCount} bars and down on ${run.downCount} across ${run.samples.length} bars.`;
}

const TII_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineTii = forwardRef<HTMLDivElement, ChartLineTiiProps>(
  function ChartLineTii(
    props: ChartLineTiiProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_TII_WIDTH,
      height = DEFAULT_CHART_LINE_TII_HEIGHT,
      padding = DEFAULT_CHART_LINE_TII_PADDING,
      gap = DEFAULT_CHART_LINE_TII_GAP,
      tickCount = DEFAULT_CHART_LINE_TII_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_TII_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_TII_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_TII_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_TII_PRICE_COLOR,
      tiiColor = DEFAULT_CHART_LINE_TII_TII_COLOR,
      upColor = DEFAULT_CHART_LINE_TII_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_TII_DOWN_COLOR,
      neutralColor = DEFAULT_CHART_LINE_TII_NEUTRAL_COLOR,
      gridColor = DEFAULT_CHART_LINE_TII_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_TII_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showTii = true,
      showRefLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a Trend Intensity Index',
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
        computeLineTiiLayout({
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
        describeLineTiiChart(data, {
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
          data-section="chart-line-tii"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-tii-aria-desc"
            style={TII_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const tp = layout.tiiPanel;
    const priceVisible = !hiddenSet.has('price');
    const tiiVisible = showTii && !hiddenSet.has('tii');

    const trendColor = (trend: ChartLineTiiTrend): string =>
      trend === 'up' ? upColor : trend === 'down' ? downColor : neutralColor;

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'tii', label: 'TII', color: tiiColor },
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
        data-section="chart-line-tii"
        data-empty="false"
        data-period={layout.period}
        data-tii-final={layout.tiiFinal}
        data-up-count={layout.upCount}
        data-down-count={layout.downCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-tii-aria-desc"
          style={TII_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-tii-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-tii-badge"
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
                data-section="chart-line-tii-badge-icon"
                aria-hidden="true"
                style={{ color: tiiColor }}
              >
                TII
              </span>
              <span data-section="chart-line-tii-badge-period">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-tii-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-tii-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-tii-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.tiiYTicks.map((t, i) => (
                  <line
                    key={`gt-${i}`}
                    data-section="chart-line-tii-grid-line"
                    data-panel="tii"
                    x1={tp.x}
                    x2={tp.x + tp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-tii-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-tii-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-tii-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-tii-axis"
                  data-panel="tii"
                  data-axis="y"
                  x1={tp.x}
                  y1={tp.y}
                  x2={tp.x}
                  y2={tp.y + tp.height}
                />
                <line
                  data-section="chart-line-tii-axis"
                  data-panel="tii"
                  data-axis="x"
                  x1={tp.x}
                  y1={tp.y + tp.height}
                  x2={tp.x + tp.width}
                  y2={tp.y + tp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-tii-tick-label"
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
                {layout.tiiYTicks.map((t, i) => (
                  <text
                    key={`tyt-${i}`}
                    data-section="chart-line-tii-tick-label"
                    data-panel="tii"
                    data-axis="y"
                    x={tp.x - 6}
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
                    data-section="chart-line-tii-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={tp.y + tp.height + 14}
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
              data-section="chart-line-tii-panel-label"
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
              data-section="chart-line-tii-panel-label"
              data-panel="tii"
              x={tp.x + 2}
              y={tp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              TII
            </text>

            {showRefLine ? (
              <line
                data-section="chart-line-tii-ref-line"
                x1={tp.x}
                x2={tp.x + tp.width}
                y1={layout.refY}
                y2={layout.refY}
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
                data-section="chart-line-tii-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-tii-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-tii-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.value}
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

            {tiiVisible && layout.tiiPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Trend Intensity Index line"
                data-section="chart-line-tii-tii-line"
                d={layout.tiiPath}
                fill="none"
                stroke={tiiColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {tiiVisible ? (
              <g data-section="chart-line-tii-markers">
                {layout.tiiMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Trend Intensity Index at x ${formatX(m.x)}: ${formatValue(m.tii)}, ${m.trend}`}
                      data-section="chart-line-tii-marker"
                      data-point-index={m.index}
                      data-tii={m.tii}
                      data-trend={m.trend}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={trendColor(m.trend)}
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
                    data-section="chart-line-tii-tooltip"
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
                    <div data-section="chart-line-tii-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-tii-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-tii-tooltip-deviation">
                      deviation: {fmtNullable(d.deviation)}
                    </div>
                    <div data-section="chart-line-tii-tooltip-tii">
                      tii: {fmtNullable(d.tii)}
                    </div>
                    <div data-section="chart-line-tii-tooltip-trend">
                      trend: {d.trend}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-tii-legend"
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
                  data-section="chart-line-tii-legend-item"
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
                    data-section="chart-line-tii-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-tii-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-tii-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.upCount} up, {layout.downCount} down
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineTii.displayName = 'ChartLineTii';
