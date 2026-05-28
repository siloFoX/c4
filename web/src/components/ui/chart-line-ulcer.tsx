import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ULCER_WIDTH = 560;
export const DEFAULT_CHART_LINE_ULCER_HEIGHT = 360;
export const DEFAULT_CHART_LINE_ULCER_PADDING = 40;
export const DEFAULT_CHART_LINE_ULCER_GAP = 12;
export const DEFAULT_CHART_LINE_ULCER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ULCER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ULCER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ULCER_PERIOD = 14;
export const DEFAULT_CHART_LINE_ULCER_THRESHOLD = 5;
export const DEFAULT_CHART_LINE_ULCER_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_ULCER_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_ULCER_ULCER_COLOR = '#b45309';
export const DEFAULT_CHART_LINE_ULCER_STRESS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ULCER_CALM_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ULCER_THRESHOLD_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ULCER_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ULCER_AXIS_COLOR = '#cbd5e1';

export type ChartLineUlcerZone = 'stress' | 'calm' | 'none';

export interface ChartLineUlcerPoint {
  x: number;
  value: number;
}

export interface ChartLineUlcerSample {
  index: number;
  x: number;
  value: number;
  drawdown: number;
  ulcer: number | null;
  zone: ChartLineUlcerZone;
}

export interface ChartLineUlcerRun {
  series: ChartLineUlcerPoint[];
  period: number;
  threshold: number;
  drawdown: number[];
  ulcer: (number | null)[];
  samples: ChartLineUlcerSample[];
  ulcerFinal: number;
  stressCount: number;
  calmCount: number;
  ok: boolean;
}

export interface ChartLineUlcerPriceDot {
  index: number;
  x: number;
  value: number;
  drawdown: number;
  ulcer: number | null;
  zone: ChartLineUlcerZone;
  px: number;
  py: number;
}

export interface ChartLineUlcerMarker {
  index: number;
  x: number;
  ulcer: number;
  zone: ChartLineUlcerZone;
  px: number;
  py: number;
}

export interface ChartLineUlcerPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineUlcerLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineUlcerPanel;
  ulcerPanel: ChartLineUlcerPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  ulcerYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  ulcerYMin: number;
  ulcerYMax: number;
  pricePath: string;
  priceDots: ChartLineUlcerPriceDot[];
  ulcerPath: string;
  ulcerMarkers: ChartLineUlcerMarker[];
  thresholdY: number;
  period: number;
  threshold: number;
  ulcerFinal: number;
  stressCount: number;
  calmCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineUlcerLayoutOptions {
  data: readonly ChartLineUlcerPoint[];
  period?: number;
  threshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineUlcerProps {
  data: readonly ChartLineUlcerPoint[];
  period?: number;
  threshold?: number;
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
  ulcerColor?: string;
  stressColor?: string;
  calmColor?: string;
  thresholdColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showUlcer?: boolean;
  showThreshold?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineUlcerPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineUlcerFinitePoints(
  points: readonly ChartLineUlcerPoint[] | null | undefined,
): ChartLineUlcerPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineUlcerPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce an Ulcer Index period to a positive integer. A
 * non-finite or sub-1 value falls back to `fallback`; a
 * fractional value floors.
 */
export function normalizeLineUlcerPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The percentage drawdown of each close off the running peak --
 * the highest close seen from the start up to that bar:
 *
 *   drawdown[i] = 100 * (runningPeak - close) / runningPeak
 *
 * It is zero at a new running high and grows as the close falls
 * away from the peak.
 */
export function computeLineUlcerDrawdown(
  closes: readonly number[] | null | undefined,
): number[] {
  if (!Array.isArray(closes)) return [];
  const n = closes.length;
  const out: number[] = new Array(n).fill(0);
  let peak = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i += 1) {
    const c = closes[i];
    if (!isFiniteNumber(c)) {
      out[i] = 0;
      continue;
    }
    if (c > peak) peak = c;
    out[i] = peak > 0 ? (100 * (peak - c)) / peak : 0;
  }
  return out;
}

/**
 * The Ulcer Index -- the root mean square of the percentage
 * drawdowns off the running peak over the trailing `period`
 * bars:
 *
 *   UI[i] = sqrt( mean of drawdown[k]^2 over the window )
 *
 * It is zero when the price holds at its peak and rises as
 * drawdowns deepen and persist, so it penalises long, deep
 * declines. Bars before the window is full are null.
 */
export function computeLineUlcer(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLineUlcerPeriod(period, DEFAULT_CHART_LINE_ULCER_PERIOD);
  const drawdown = computeLineUlcerDrawdown(closes);
  const n = drawdown.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let sumSq = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const d = drawdown[i - k];
      if (!isFiniteNumber(d)) {
        valid = false;
        break;
      }
      sumSq += d * d;
    }
    out[i] = valid ? Math.sqrt(sumSq / p) : null;
  }
  return out;
}

function classifyZone(
  ulcer: number | null,
  threshold: number,
): ChartLineUlcerZone {
  if (ulcer === null) return 'none';
  return ulcer > threshold ? 'stress' : 'calm';
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function runLineUlcer(
  points: readonly ChartLineUlcerPoint[] | null | undefined,
  options?: { period?: number; threshold?: number },
): ChartLineUlcerRun {
  const finite = getLineUlcerFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineUlcerPeriod(
    options?.period ?? DEFAULT_CHART_LINE_ULCER_PERIOD,
    DEFAULT_CHART_LINE_ULCER_PERIOD,
  );
  const threshold =
    isFiniteNumber(options?.threshold) && (options?.threshold ?? 0) > 0
      ? (options?.threshold as number)
      : DEFAULT_CHART_LINE_ULCER_THRESHOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      threshold,
      drawdown: [],
      ulcer: [],
      samples: [],
      ulcerFinal: NaN,
      stressCount: 0,
      calmCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const drawdown = computeLineUlcerDrawdown(closes);
  const ulcer = computeLineUlcer(closes, period);

  const samples: ChartLineUlcerSample[] = series.map((p, i) => {
    const u = ulcer[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      drawdown: drawdown[i] ?? 0,
      ulcer: u,
      zone: classifyZone(u, threshold),
    };
  });

  let stressCount = 0;
  let calmCount = 0;
  let ulcerFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'stress') stressCount += 1;
    else if (s.zone === 'calm') calmCount += 1;
    if (s.ulcer !== null) ulcerFinal = s.ulcer;
  }

  return {
    series = [],
    period,
    threshold,
    drawdown,
    ulcer,
    samples,
    ulcerFinal,
    stressCount,
    calmCount,
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

export function computeLineUlcerLayout(
  options: ComputeLineUlcerLayoutOptions,
): ChartLineUlcerLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_ULCER_GAP,
    tickCount = DEFAULT_CHART_LINE_ULCER_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_ULCER_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineUlcer(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.threshold)
      ? { threshold: options.threshold }
      : {}),
  });

  const emptyPanel: ChartLineUlcerPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineUlcerLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    ulcerPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    ulcerYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    ulcerYMin: 0,
    ulcerYMax: 0,
    pricePath: '',
    priceDots: [],
    ulcerPath: '',
    ulcerMarkers: [],
    thresholdY: 0,
    period: run.period,
    threshold: run.threshold,
    ulcerFinal: NaN,
    stressCount: 0,
    calmCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const ulcerHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineUlcerPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const ulcerPanel: ChartLineUlcerPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: ulcerHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  let ulcerHiVal = run.threshold;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < priceLo) priceLo = s.value;
    if (s.value > priceHi) priceHi = s.value;
    if (s.ulcer !== null && s.ulcer > ulcerHiVal) ulcerHiVal = s.ulcer;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }
  const ulcerLoVal = 0;
  if (ulcerHiVal <= ulcerLoVal) ulcerHiVal = ulcerLoVal + 1;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const ulcerRange = ulcerHiVal - ulcerLoVal;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectUlcerY = (v: number): number =>
    ulcerPanel.y +
    ulcerPanel.height -
    ((v - ulcerLoVal) / ulcerRange) * ulcerPanel.height;

  const priceDots: ChartLineUlcerPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    drawdown: s.drawdown,
    ulcer: s.ulcer,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const ulcerPts: { px: number; py: number }[] = [];
  const ulcerMarkers: ChartLineUlcerMarker[] = [];
  for (const s of run.samples) {
    if (s.ulcer === null) continue;
    const px = projectX(s.x);
    const py = projectUlcerY(s.ulcer);
    ulcerPts.push({ px, py });
    ulcerMarkers.push({
      index: s.index,
      x: s.x,
      ulcer: s.ulcer,
      zone: s.zone,
      px,
      py,
    });
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    ulcerPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    ulcerYTicks: computeTicks(ulcerLoVal, ulcerHiVal, tickCount).map((v) => ({
      value: v,
      py: projectUlcerY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    ulcerYMin: ulcerLoVal,
    ulcerYMax: ulcerHiVal,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    ulcerPath: buildPath(ulcerPts),
    ulcerMarkers,
    thresholdY: projectUlcerY(run.threshold),
    period: run.period,
    threshold: run.threshold,
    ulcerFinal: run.ulcerFinal,
    stressCount: run.stressCount,
    calmCount: run.calmCount,
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

export function describeLineUlcerChart(
  data: readonly ChartLineUlcerPoint[] | null | undefined,
  options?: { period?: number; threshold?: number },
): string {
  const run = runLineUlcer(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with an Ulcer Index (period ${run.period}): the top panel plots the price; the bottom panel plots the Ulcer Index. The Ulcer Index measures downside risk -- it tracks the running peak of the price and, each bar, the percentage drawdown the close sits below that peak, then takes the root mean square of those drawdowns over the last ${run.period} bars. It is zero when the price holds at a new high and rises as drawdowns deepen and persist, so it penalises long, deep declines. The Ulcer Index is stressed above the threshold on ${run.stressCount} bars and calm on ${run.calmCount} across ${run.samples.length} bars.`;
}

const ULCER_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineUlcer = forwardRef<HTMLDivElement, ChartLineUlcerProps>(
  function ChartLineUlcer(
    props: ChartLineUlcerProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      threshold,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_ULCER_WIDTH,
      height = DEFAULT_CHART_LINE_ULCER_HEIGHT,
      padding = DEFAULT_CHART_LINE_ULCER_PADDING,
      gap = DEFAULT_CHART_LINE_ULCER_GAP,
      tickCount = DEFAULT_CHART_LINE_ULCER_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_ULCER_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_ULCER_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_ULCER_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_ULCER_PRICE_COLOR,
      ulcerColor = DEFAULT_CHART_LINE_ULCER_ULCER_COLOR,
      stressColor = DEFAULT_CHART_LINE_ULCER_STRESS_COLOR,
      calmColor = DEFAULT_CHART_LINE_ULCER_CALM_COLOR,
      thresholdColor = DEFAULT_CHART_LINE_ULCER_THRESHOLD_COLOR,
      gridColor = DEFAULT_CHART_LINE_ULCER_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_ULCER_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showUlcer = true,
      showThreshold = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with an Ulcer Index',
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
        computeLineUlcerLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(threshold) ? { threshold } : {}),
        }),
      [
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        period,
        threshold,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineUlcerChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(threshold) ? { threshold } : {}),
        }),
      [ariaDescription, data, period, threshold],
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
          data-section="chart-line-ulcer"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-ulcer-aria-desc"
            style={ULCER_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const up = layout.ulcerPanel;
    const priceVisible = !hiddenSet.has('price');
    const ulcerVisible = showUlcer && !hiddenSet.has('ulcer');
    const thresholdVisible = showThreshold && !hiddenSet.has('threshold');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const zoneColor = (zone: ChartLineUlcerZone): string => {
      if (zone === 'stress') return stressColor;
      if (zone === 'calm') return calmColor;
      return ulcerColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'ulcer', label: 'Ulcer', color: ulcerColor },
      { id: 'threshold', label: 'Threshold', color: thresholdColor },
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
        data-section="chart-line-ulcer"
        data-empty="false"
        data-period={layout.period}
        data-threshold={layout.threshold}
        data-ulcer-final={layout.ulcerFinal}
        data-stress-count={layout.stressCount}
        data-calm-count={layout.calmCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-ulcer-aria-desc"
          style={ULCER_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-ulcer-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-ulcer-badge"
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
                data-section="chart-line-ulcer-badge-icon"
                aria-hidden="true"
                style={{ color: ulcerColor }}
              >
                UI
              </span>
              <span data-section="chart-line-ulcer-badge-config">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-ulcer-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-ulcer-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-ulcer-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.ulcerYTicks.map((t, i) => (
                  <line
                    key={`gu-${i}`}
                    data-section="chart-line-ulcer-grid-line"
                    data-panel="ulcer"
                    x1={up.x}
                    x2={up.x + up.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-ulcer-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-ulcer-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-ulcer-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-ulcer-axis"
                  data-panel="ulcer"
                  data-axis="y"
                  x1={up.x}
                  y1={up.y}
                  x2={up.x}
                  y2={up.y + up.height}
                />
                <line
                  data-section="chart-line-ulcer-axis"
                  data-panel="ulcer"
                  data-axis="x"
                  x1={up.x}
                  y1={up.y + up.height}
                  x2={up.x + up.width}
                  y2={up.y + up.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-ulcer-tick-label"
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
                {layout.ulcerYTicks.map((t, i) => (
                  <text
                    key={`uyt-${i}`}
                    data-section="chart-line-ulcer-tick-label"
                    data-panel="ulcer"
                    data-axis="y"
                    x={up.x - 6}
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
                    data-section="chart-line-ulcer-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={up.y + up.height + 14}
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
              data-section="chart-line-ulcer-panel-label"
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
              data-section="chart-line-ulcer-panel-label"
              data-panel="ulcer"
              x={up.x + 2}
              y={up.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Ulcer
            </text>

            {thresholdVisible ? (
              <line
                data-section="chart-line-ulcer-threshold-line"
                x1={up.x}
                x2={up.x + up.width}
                y1={layout.thresholdY}
                y2={layout.thresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-ulcer-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-ulcer-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-ulcer-dot"
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

            {ulcerVisible && layout.ulcerPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Ulcer Index line"
                data-section="chart-line-ulcer-ulcer-line"
                d={layout.ulcerPath}
                fill="none"
                stroke={ulcerColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {ulcerVisible ? (
              <g data-section="chart-line-ulcer-markers">
                {layout.ulcerMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Ulcer Index at x ${formatX(m.x)}: ${formatValue(m.ulcer)}, ${m.zone}`}
                      data-section="chart-line-ulcer-marker"
                      data-point-index={m.index}
                      data-ulcer={m.ulcer}
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
                    data-section="chart-line-ulcer-tooltip"
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
                    <div data-section="chart-line-ulcer-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-ulcer-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-ulcer-tooltip-drawdown">
                      drawdown: {formatValue(d.drawdown)}
                    </div>
                    <div data-section="chart-line-ulcer-tooltip-ulcer">
                      ulcer: {fmtNullable(d.ulcer)}
                    </div>
                    <div data-section="chart-line-ulcer-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-ulcer-legend"
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
                  data-section="chart-line-ulcer-legend-item"
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
                    data-section="chart-line-ulcer-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-ulcer-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-ulcer-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.stressCount} stress, {layout.calmCount} calm
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineUlcer.displayName = 'ChartLineUlcer';
