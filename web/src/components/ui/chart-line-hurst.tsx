import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_HURST_WIDTH = 560;
export const DEFAULT_CHART_LINE_HURST_HEIGHT = 360;
export const DEFAULT_CHART_LINE_HURST_PADDING = 40;
export const DEFAULT_CHART_LINE_HURST_GAP = 12;
export const DEFAULT_CHART_LINE_HURST_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HURST_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HURST_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HURST_PERIOD = 20;
export const DEFAULT_CHART_LINE_HURST_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_HURST_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_HURST_HURST_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_HURST_TRENDING_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HURST_REVERTING_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HURST_RANDOM_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_HURST_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_HURST_AXIS_COLOR = '#cbd5e1';

export type ChartLineHurstClass = 'trending' | 'reverting' | 'random';

export interface ChartLineHurstPoint {
  x: number;
  value: number;
}

export interface ChartLineHurstRescaledRange {
  range: number;
  stddev: number;
  rs: number;
}

export interface ChartLineHurstSeries {
  hurst: (number | null)[];
  rs: (number | null)[];
}

export interface ChartLineHurstSample {
  index: number;
  x: number;
  value: number;
  hurst: number | null;
  rs: number | null;
  classification: ChartLineHurstClass;
}

export interface ChartLineHurstRun {
  series: ChartLineHurstPoint[];
  period: number;
  hurst: (number | null)[];
  rs: (number | null)[];
  samples: ChartLineHurstSample[];
  hurstFinal: number;
  hurstMin: number;
  hurstMax: number;
  trendingCount: number;
  revertingCount: number;
  ok: boolean;
}

export interface ChartLineHurstPriceDot {
  index: number;
  x: number;
  value: number;
  hurst: number | null;
  rs: number | null;
  classification: ChartLineHurstClass;
  px: number;
  py: number;
}

export interface ChartLineHurstMarker {
  index: number;
  x: number;
  hurst: number;
  classification: ChartLineHurstClass;
  px: number;
  py: number;
}

export interface ChartLineHurstPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineHurstLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineHurstPanel;
  hurstPanel: ChartLineHurstPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  hurstYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  hurstYMin: number;
  hurstYMax: number;
  pricePath: string;
  priceDots: ChartLineHurstPriceDot[];
  hurstPath: string;
  hurstMarkers: ChartLineHurstMarker[];
  refY: number;
  period: number;
  hurstFinal: number;
  trendingCount: number;
  revertingCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineHurstLayoutOptions {
  data: readonly ChartLineHurstPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineHurstProps {
  data: readonly ChartLineHurstPoint[];
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
  hurstColor?: string;
  trendingColor?: string;
  revertingColor?: string;
  randomColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showHurst?: boolean;
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
  onPointClick?: (payload: { point: ChartLineHurstPriceDot }) => void;
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

export function getLineHurstFinitePoints(
  points: readonly ChartLineHurstPoint[] | null | undefined,
): ChartLineHurstPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineHurstPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce the Hurst window length to an integer of at least 2. A
 * non-finite or sub-2 value falls back to `fallback`; a fractional
 * value floors. A length of at least 2 keeps `log(period)` (the
 * estimator's denominator) above zero.
 */
export function normalizeLineHurstPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

/**
 * Rescaled range (R/S) analysis of a single window. The window is
 * mean-adjusted; the cumulative deviation is tracked bar by bar; the
 * range `R` is the spread of that cumulative deviation; `S` is the
 * population standard deviation of the window. The rescaled range is
 * `R / S`. A flat window has `S = 0` and reports a NaN rescaled
 * range.
 */
export function computeLineHurstRescaledRange(
  window: readonly number[] | null | undefined,
): ChartLineHurstRescaledRange {
  if (!Array.isArray(window) || window.length < 2) {
    return { range: 0, stddev: 0, rs: NaN };
  }
  const n = window.length;
  let sum = 0;
  for (const v of window) sum += v;
  const mean = sum / n;
  let cumDev = 0;
  let maxZ = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let sqSum = 0;
  for (const v of window) {
    const y = v - mean;
    cumDev += y;
    if (cumDev > maxZ) maxZ = cumDev;
    if (cumDev < minZ) minZ = cumDev;
    sqSum += y * y;
  }
  const range = maxZ - minZ;
  const stddev = Math.sqrt(sqSum / n);
  const rs = stddev === 0 ? NaN : range / stddev;
  return { range, stddev, rs };
}

/**
 * The rolling Hurst exponent via rescaled range analysis. For each
 * bar the trailing window of `period` values is analyzed; the Hurst
 * exponent is the single-window R/S estimate
 *
 *   H = log(R/S) / log(period)
 *
 * clamped into the unit interval. `H > 0.5` marks a persistent
 * (trending) series, `H < 0.5` an anti-persistent (mean reverting)
 * series, `H` near 0.5 a random walk. Bars before the window is
 * full -- and flat windows, whose R/S is undefined -- are null.
 */
export function computeLineHurst(
  values: readonly number[] | null | undefined,
  period: number,
): ChartLineHurstSeries {
  if (!Array.isArray(values)) return { hurst: [], rs: [] };
  const p = normalizeLineHurstPeriod(period, DEFAULT_CHART_LINE_HURST_PERIOD);
  const n = values.length;
  const hurst: (number | null)[] = new Array(n);
  const rs: (number | null)[] = new Array(n);
  const logP = Math.log(p);
  for (let i = 0; i < n; i += 1) {
    if (i < p - 1) {
      hurst[i] = null;
      rs[i] = null;
      continue;
    }
    const window = values.slice(i - p + 1, i + 1);
    const { rs: rsVal } = computeLineHurstRescaledRange(window);
    if (!isFiniteNumber(rsVal) || rsVal <= 0) {
      hurst[i] = null;
      rs[i] = null;
      continue;
    }
    rs[i] = rsVal;
    hurst[i] = clamp(Math.log(rsVal) / logP, 0, 1);
  }
  return { hurst, rs };
}

function classifyHurst(h: number | null): ChartLineHurstClass {
  if (h === null || h === 0.5) return 'random';
  return h > 0.5 ? 'trending' : 'reverting';
}

export function runLineHurst(
  points: readonly ChartLineHurstPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineHurstRun {
  const finite = getLineHurstFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineHurstPeriod(
    options?.period ?? DEFAULT_CHART_LINE_HURST_PERIOD,
    DEFAULT_CHART_LINE_HURST_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      hurst: [],
      rs: [],
      samples: [],
      hurstFinal: NaN,
      hurstMin: NaN,
      hurstMax: NaN,
      trendingCount: 0,
      revertingCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { hurst, rs } = computeLineHurst(values, period);

  const samples: ChartLineHurstSample[] = series.map((p, i) => {
    const h = hurst[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      hurst: h,
      rs: rs[i] ?? null,
      classification: classifyHurst(h),
    };
  });

  let hMin = Number.POSITIVE_INFINITY;
  let hMax = Number.NEGATIVE_INFINITY;
  let trendingCount = 0;
  let revertingCount = 0;
  for (const s of samples) {
    if (s.hurst !== null) {
      if (s.hurst < hMin) hMin = s.hurst;
      if (s.hurst > hMax) hMax = s.hurst;
    }
    if (s.classification === 'trending') trendingCount += 1;
    else if (s.classification === 'reverting') revertingCount += 1;
  }

  const lastSample = samples[n - 1]!;

  return {
    series,
    period,
    hurst,
    rs,
    samples,
    hurstFinal: lastSample.hurst ?? NaN,
    hurstMin: isFiniteNumber(hMin) ? hMin : NaN,
    hurstMax: isFiniteNumber(hMax) ? hMax : NaN,
    trendingCount,
    revertingCount,
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

export function computeLineHurstLayout(
  options: ComputeLineHurstLayoutOptions,
): ChartLineHurstLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_HURST_GAP,
    tickCount = DEFAULT_CHART_LINE_HURST_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_HURST_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineHurst(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });

  const emptyPanel: ChartLineHurstPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineHurstLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    hurstPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    hurstYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    hurstYMin: 0,
    hurstYMax: 1,
    pricePath: '',
    priceDots: [],
    hurstPath: '',
    hurstMarkers: [],
    refY: 0,
    period: run.period,
    hurstFinal: NaN,
    trendingCount: 0,
    revertingCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const hurstHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineHurstPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const hurstPanel: ChartLineHurstPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: hurstHeight,
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

  // The Hurst exponent is bounded to the unit interval, so the
  // bottom panel uses a fixed [0, 1] domain with a 0.5 reference.
  const hurstLo = 0;
  const hurstHi = 1;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const hurstRange = hurstHi - hurstLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectHurstY = (v: number): number =>
    hurstPanel.y +
    hurstPanel.height -
    ((v - hurstLo) / hurstRange) * hurstPanel.height;

  const priceDots: ChartLineHurstPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    hurst: s.hurst,
    rs: s.rs,
    classification: s.classification,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const hurstMarkers: ChartLineHurstMarker[] = run.samples
    .filter((s) => s.hurst !== null)
    .map((s) => {
      const h = s.hurst!;
      return {
        index: s.index,
        x: s.x,
        hurst: h,
        classification: s.classification,
        px: projectX(s.x),
        py: projectHurstY(h),
      };
    });

  return {
    ok: true,
    width,
    height,
    pricePanel,
    hurstPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    hurstYTicks: computeTicks(hurstLo, hurstHi, tickCount).map((v) => ({
      value: v,
      py: projectHurstY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    hurstYMin: hurstLo,
    hurstYMax: hurstHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    hurstPath: buildPath(hurstMarkers.map((m) => ({ px: m.px, py: m.py }))),
    hurstMarkers,
    refY: projectHurstY(0.5),
    period: run.period,
    hurstFinal: run.hurstFinal,
    trendingCount: run.trendingCount,
    revertingCount: run.revertingCount,
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

export function describeLineHurstChart(
  data: readonly ChartLineHurstPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineHurst(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a rolling Hurst exponent (period ${run.period}): the top panel plots the raw price; the bottom panel plots the Hurst exponent, estimated by rescaled range (R/S) analysis over the trailing window. A Hurst exponent above 0.5 marks a trending (persistent) series, below 0.5 a mean reverting (anti-persistent) series, and near 0.5 a random walk. The series reads trending on ${run.trendingCount} bars and mean reverting on ${run.revertingCount} across ${run.samples.length} bars.`;
}

const HURST_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineHurst = forwardRef<HTMLDivElement, ChartLineHurstProps>(
  function ChartLineHurst(
    props: ChartLineHurstProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_HURST_WIDTH,
      height = DEFAULT_CHART_LINE_HURST_HEIGHT,
      padding = DEFAULT_CHART_LINE_HURST_PADDING,
      gap = DEFAULT_CHART_LINE_HURST_GAP,
      tickCount = DEFAULT_CHART_LINE_HURST_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_HURST_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_HURST_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_HURST_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_HURST_PRICE_COLOR,
      hurstColor = DEFAULT_CHART_LINE_HURST_HURST_COLOR,
      trendingColor = DEFAULT_CHART_LINE_HURST_TRENDING_COLOR,
      revertingColor = DEFAULT_CHART_LINE_HURST_REVERTING_COLOR,
      randomColor = DEFAULT_CHART_LINE_HURST_RANDOM_COLOR,
      gridColor = DEFAULT_CHART_LINE_HURST_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_HURST_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showHurst = true,
      showRefLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a rolling Hurst exponent',
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
        computeLineHurstLayout({
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
        describeLineHurstChart(data, {
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
          data-section="chart-line-hurst"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-hurst-aria-desc"
            style={HURST_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const hp = layout.hurstPanel;
    const priceVisible = !hiddenSet.has('price');
    const hurstVisible = showHurst && !hiddenSet.has('hurst');

    const classColor = (c: ChartLineHurstClass): string =>
      c === 'trending'
        ? trendingColor
        : c === 'reverting'
          ? revertingColor
          : randomColor;

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'hurst', label: 'Hurst', color: hurstColor },
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
        data-section="chart-line-hurst"
        data-empty="false"
        data-period={layout.period}
        data-hurst-final={layout.hurstFinal}
        data-trending-count={layout.trendingCount}
        data-reverting-count={layout.revertingCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-hurst-aria-desc"
          style={HURST_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-hurst-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-hurst-badge"
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
                data-section="chart-line-hurst-badge-icon"
                aria-hidden="true"
                style={{ color: hurstColor }}
              >
                HURST
              </span>
              <span data-section="chart-line-hurst-badge-period">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-hurst-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-hurst-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-hurst-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.hurstYTicks.map((t, i) => (
                  <line
                    key={`gh-${i}`}
                    data-section="chart-line-hurst-grid-line"
                    data-panel="hurst"
                    x1={hp.x}
                    x2={hp.x + hp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-hurst-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-hurst-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-hurst-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-hurst-axis"
                  data-panel="hurst"
                  data-axis="y"
                  x1={hp.x}
                  y1={hp.y}
                  x2={hp.x}
                  y2={hp.y + hp.height}
                />
                <line
                  data-section="chart-line-hurst-axis"
                  data-panel="hurst"
                  data-axis="x"
                  x1={hp.x}
                  y1={hp.y + hp.height}
                  x2={hp.x + hp.width}
                  y2={hp.y + hp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-hurst-tick-label"
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
                {layout.hurstYTicks.map((t, i) => (
                  <text
                    key={`hyt-${i}`}
                    data-section="chart-line-hurst-tick-label"
                    data-panel="hurst"
                    data-axis="y"
                    x={hp.x - 6}
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
                    data-section="chart-line-hurst-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={hp.y + hp.height + 14}
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
              data-section="chart-line-hurst-panel-label"
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
              data-section="chart-line-hurst-panel-label"
              data-panel="hurst"
              x={hp.x + 2}
              y={hp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Hurst
            </text>

            {showRefLine ? (
              <line
                data-section="chart-line-hurst-ref-line"
                x1={hp.x}
                x2={hp.x + hp.width}
                y1={layout.refY}
                y2={layout.refY}
                stroke={randomColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-hurst-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-hurst-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-hurst-dot"
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

            {hurstVisible && layout.hurstPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Rolling Hurst exponent line"
                data-section="chart-line-hurst-hurst-line"
                d={layout.hurstPath}
                fill="none"
                stroke={hurstColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {hurstVisible ? (
              <g data-section="chart-line-hurst-markers">
                {layout.hurstMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Hurst exponent at x ${formatX(m.x)}: ${formatValue(m.hurst)}, ${m.classification}`}
                      data-section="chart-line-hurst-marker"
                      data-point-index={m.index}
                      data-hurst={m.hurst}
                      data-class={m.classification}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={classColor(m.classification)}
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
                    data-section="chart-line-hurst-tooltip"
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
                    <div data-section="chart-line-hurst-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-hurst-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-hurst-tooltip-rs">
                      R/S: {fmtNullable(d.rs)}
                    </div>
                    <div data-section="chart-line-hurst-tooltip-hurst">
                      hurst: {fmtNullable(d.hurst)}
                    </div>
                    <div data-section="chart-line-hurst-tooltip-class">
                      class: {d.classification}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-hurst-legend"
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
                  data-section="chart-line-hurst-legend-item"
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
                    data-section="chart-line-hurst-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-hurst-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-hurst-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.trendingCount} trending, {layout.revertingCount} reverting
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineHurst.displayName = 'ChartLineHurst';
