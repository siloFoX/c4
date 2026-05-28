import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_MCCLELLAN_WIDTH = 560;
export const DEFAULT_CHART_LINE_MCCLELLAN_HEIGHT = 360;
export const DEFAULT_CHART_LINE_MCCLELLAN_PADDING = 40;
export const DEFAULT_CHART_LINE_MCCLELLAN_GAP = 12;
export const DEFAULT_CHART_LINE_MCCLELLAN_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MCCLELLAN_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MCCLELLAN_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MCCLELLAN_FAST_PERIOD = 19;
export const DEFAULT_CHART_LINE_MCCLELLAN_SLOW_PERIOD = 39;
export const DEFAULT_CHART_LINE_MCCLELLAN_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_MCCLELLAN_BREADTH_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_MCCLELLAN_OSC_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_MCCLELLAN_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MCCLELLAN_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MCCLELLAN_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MCCLELLAN_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MCCLELLAN_AXIS_COLOR = '#cbd5e1';

export type ChartLineMcclellanZone = 'positive' | 'negative' | 'zero';

export interface ChartLineMcclellanPoint {
  x: number;
  value: number;
}

export interface ChartLineMcclellanSample {
  index: number;
  x: number;
  value: number;
  fastEma: number | null;
  slowEma: number | null;
  osc: number | null;
  zone: ChartLineMcclellanZone;
}

export interface ChartLineMcclellanRun {
  series: ChartLineMcclellanPoint[];
  fastPeriod: number;
  slowPeriod: number;
  fastEma: (number | null)[];
  slowEma: (number | null)[];
  osc: (number | null)[];
  samples: ChartLineMcclellanSample[];
  oscFinal: number;
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  ok: boolean;
}

export interface ChartLineMcclellanBreadthDot {
  index: number;
  x: number;
  value: number;
  osc: number | null;
  zone: ChartLineMcclellanZone;
  px: number;
  py: number;
}

export interface ChartLineMcclellanMarker {
  index: number;
  x: number;
  osc: number;
  zone: ChartLineMcclellanZone;
  px: number;
  py: number;
}

export interface ChartLineMcclellanPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineMcclellanLayout {
  ok: boolean;
  width: number;
  height: number;
  breadthPanel: ChartLineMcclellanPanel;
  oscPanel: ChartLineMcclellanPanel;
  xTicks: { value: number; px: number }[];
  breadthYTicks: { value: number; py: number }[];
  oscYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  breadthYMin: number;
  breadthYMax: number;
  oscYMin: number;
  oscYMax: number;
  breadthPath: string;
  breadthDots: ChartLineMcclellanBreadthDot[];
  oscPath: string;
  markers: ChartLineMcclellanMarker[];
  zeroY: number;
  fastPeriod: number;
  slowPeriod: number;
  oscFinal: number;
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineMcclellanLayoutOptions {
  data: readonly ChartLineMcclellanPoint[];
  fastPeriod?: number;
  slowPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineMcclellanProps {
  data: readonly ChartLineMcclellanPoint[];
  fastPeriod?: number;
  slowPeriod?: number;
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
  breadthColor?: string;
  oscColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
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
  onPointClick?: (payload: { point: ChartLineMcclellanBreadthDot }) => void;
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

export function getLineMcclellanFinitePoints(
  points: readonly ChartLineMcclellanPoint[] | null | undefined,
): ChartLineMcclellanPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineMcclellanPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a McClellan exponential-moving-average length to a
 * positive integer. A non-finite or sub-1 value falls back to
 * `fallback`; a fractional value floors.
 */
export function normalizeLineMcclellanPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * An exponential moving average of the breadth series. The EMA
 * seeds with the first finite value and advances
 * `ema += alpha * (value - ema)` with `alpha = 2 / (period + 1)`,
 * so a constant input yields a bit-exact constant output.
 */
export function computeLineMcclellanEma(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineMcclellanPeriod(
    period,
    DEFAULT_CHART_LINE_MCCLELLAN_FAST_PERIOD,
  );
  const alpha = 2 / (p + 1);
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  let ema: number | null = null;
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (!isFiniteNumber(v)) continue;
    ema = ema === null ? v : ema + alpha * (v - ema);
    out[i] = ema;
  }
  return out;
}

/**
 * The McClellan Oscillator -- the spread between a fast and a
 * slow exponential moving average of the advance-decline breadth.
 */
export function computeLineMcclellan(
  values: readonly number[] | null | undefined,
  fastPeriod: number,
  slowPeriod: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const fast = computeLineMcclellanEma(values, fastPeriod);
  const slow = computeLineMcclellanEma(values, slowPeriod);
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const f = fast[i];
    const s = slow[i];
    if (isFiniteNumber(f) && isFiniteNumber(s)) out[i] = f - s;
  }
  return out;
}

function classifyZone(osc: number): ChartLineMcclellanZone {
  if (osc > 0) return 'positive';
  if (osc < 0) return 'negative';
  return 'zero';
}

export function runLineMcclellan(
  points: readonly ChartLineMcclellanPoint[] | null | undefined,
  options?: { fastPeriod?: number; slowPeriod?: number },
): ChartLineMcclellanRun {
  const finite = getLineMcclellanFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const fastPeriod = normalizeLineMcclellanPeriod(
    options?.fastPeriod ?? DEFAULT_CHART_LINE_MCCLELLAN_FAST_PERIOD,
    DEFAULT_CHART_LINE_MCCLELLAN_FAST_PERIOD,
  );
  const slowPeriod = normalizeLineMcclellanPeriod(
    options?.slowPeriod ?? DEFAULT_CHART_LINE_MCCLELLAN_SLOW_PERIOD,
    DEFAULT_CHART_LINE_MCCLELLAN_SLOW_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      fastPeriod,
      slowPeriod,
      fastEma: [],
      slowEma: [],
      osc: [],
      samples: [],
      oscFinal: NaN,
      positiveCount: 0,
      negativeCount: 0,
      zeroCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const fastEma = computeLineMcclellanEma(values, fastPeriod);
  const slowEma = computeLineMcclellanEma(values, slowPeriod);
  const osc = computeLineMcclellan(values, fastPeriod, slowPeriod);

  const samples: ChartLineMcclellanSample[] = series.map((p, i) => {
    const o = osc[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      fastEma: fastEma[i] ?? null,
      slowEma: slowEma[i] ?? null,
      osc: o,
      zone: o === null ? 'zero' : classifyZone(o),
    };
  });

  let positiveCount = 0;
  let negativeCount = 0;
  let zeroCount = 0;
  let oscFinal = NaN;
  for (const s of samples) {
    if (s.osc === null) continue;
    if (s.zone === 'positive') positiveCount += 1;
    else if (s.zone === 'negative') negativeCount += 1;
    else zeroCount += 1;
    oscFinal = s.osc;
  }

  return {
    series = [],
    fastPeriod,
    slowPeriod,
    fastEma,
    slowEma,
    osc,
    samples,
    oscFinal,
    positiveCount,
    negativeCount,
    zeroCount,
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

export function computeLineMcclellanLayout(
  options: ComputeLineMcclellanLayoutOptions,
): ChartLineMcclellanLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_MCCLELLAN_GAP,
    tickCount = DEFAULT_CHART_LINE_MCCLELLAN_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_MCCLELLAN_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineMcclellan(data, {
    ...(isFiniteNumber(options.fastPeriod)
      ? { fastPeriod: options.fastPeriod }
      : {}),
    ...(isFiniteNumber(options.slowPeriod)
      ? { slowPeriod: options.slowPeriod }
      : {}),
  });

  const emptyPanel: ChartLineMcclellanPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineMcclellanLayout = {
    ok: false,
    width,
    height,
    breadthPanel: emptyPanel,
    oscPanel: emptyPanel,
    xTicks: [],
    breadthYTicks: [],
    oscYTicks: [],
    xMin: 0,
    xMax: 0,
    breadthYMin: 0,
    breadthYMax: 0,
    oscYMin: 0,
    oscYMax: 0,
    breadthPath: '',
    breadthDots: [],
    oscPath: '',
    markers: [],
    zeroY: 0,
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    oscFinal: NaN,
    positiveCount: 0,
    negativeCount: 0,
    zeroCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const breadthHeight = usableHeight * ratio;
  const oscHeight = usableHeight - breadthHeight;

  const breadthPanel: ChartLineMcclellanPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: breadthHeight,
  };
  const oscPanel: ChartLineMcclellanPanel = {
    x: padding,
    y: padding + breadthHeight + gap,
    width: innerWidth,
    height: oscHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let bLo = Number.POSITIVE_INFINITY;
  let bHi = Number.NEGATIVE_INFINITY;
  let oLo = 0;
  let oHi = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < bLo) bLo = s.value;
    if (s.value > bHi) bHi = s.value;
    if (s.osc !== null) {
      if (s.osc < oLo) oLo = s.osc;
      if (s.osc > oHi) oHi = s.osc;
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (bLo === bHi) {
    bLo -= 0.5;
    bHi += 0.5;
  }
  if (oLo === oHi) {
    oLo -= 1;
    oHi += 1;
  }

  const xRange = xHi - xLo;
  const bRange = bHi - bLo;
  const oRange = oHi - oLo;
  const projectX = (x: number): number =>
    breadthPanel.x + ((x - xLo) / xRange) * breadthPanel.width;
  const projectBreadthY = (v: number): number =>
    breadthPanel.y +
    breadthPanel.height -
    ((v - bLo) / bRange) * breadthPanel.height;
  const projectOscY = (v: number): number =>
    oscPanel.y + oscPanel.height - ((v - oLo) / oRange) * oscPanel.height;

  const breadthDots: ChartLineMcclellanBreadthDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    osc: s.osc,
    zone: s.zone,
    px: projectX(s.x),
    py: projectBreadthY(s.value),
  }));

  const oscPts: { px: number; py: number }[] = [];
  const markers: ChartLineMcclellanMarker[] = [];
  for (const s of run.samples) {
    if (s.osc === null) continue;
    const px = projectX(s.x);
    const py = projectOscY(s.osc);
    oscPts.push({ px, py });
    markers.push({
      index: s.index,
      x: s.x,
      osc: s.osc,
      zone: s.zone,
      px,
      py,
    });
  }

  return {
    ok: true,
    width,
    height,
    breadthPanel,
    oscPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    breadthYTicks: computeTicks(bLo, bHi, tickCount).map((v) => ({
      value: v,
      py: projectBreadthY(v),
    })),
    oscYTicks: computeTicks(oLo, oHi, tickCount).map((v) => ({
      value: v,
      py: projectOscY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    breadthYMin: bLo,
    breadthYMax: bHi,
    oscYMin: oLo,
    oscYMax: oHi,
    breadthPath: buildPath(breadthDots.map((d) => ({ px: d.px, py: d.py }))),
    breadthDots,
    oscPath: buildPath(oscPts),
    markers,
    zeroY: projectOscY(0),
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    oscFinal: run.oscFinal,
    positiveCount: run.positiveCount,
    negativeCount: run.negativeCount,
    zeroCount: run.zeroCount,
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

export function describeLineMcclellanChart(
  data: readonly ChartLineMcclellanPoint[] | null | undefined,
  options?: { fastPeriod?: number; slowPeriod?: number },
): string {
  const run = runLineMcclellan(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with the McClellan Oscillator (EMA ${run.fastPeriod} / ${run.slowPeriod}): the top panel plots the advance-decline breadth value; the bottom panel plots the McClellan Oscillator. The oscillator is the spread between a fast ${run.fastPeriod}-bar and a slow ${run.slowPeriod}-bar exponential moving average of the breadth -- it is positive when the fast average leads the slow, marking improving breadth, and negative when it lags. The oscillator is positive on ${run.positiveCount} bars, negative on ${run.negativeCount} and zero on ${run.zeroCount} across ${run.samples.length} bars.`;
}

const MCCLELLAN_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineMcclellan = forwardRef<
  HTMLDivElement,
  ChartLineMcclellanProps
>(function ChartLineMcclellan(
  props: ChartLineMcclellanProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    fastPeriod,
    slowPeriod,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_MCCLELLAN_WIDTH,
    height = DEFAULT_CHART_LINE_MCCLELLAN_HEIGHT,
    padding = DEFAULT_CHART_LINE_MCCLELLAN_PADDING,
    gap = DEFAULT_CHART_LINE_MCCLELLAN_GAP,
    tickCount = DEFAULT_CHART_LINE_MCCLELLAN_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_MCCLELLAN_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_MCCLELLAN_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MCCLELLAN_DOT_RADIUS,
    breadthColor = DEFAULT_CHART_LINE_MCCLELLAN_BREADTH_COLOR,
    oscColor = DEFAULT_CHART_LINE_MCCLELLAN_OSC_COLOR,
    positiveColor = DEFAULT_CHART_LINE_MCCLELLAN_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_MCCLELLAN_NEGATIVE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_MCCLELLAN_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_MCCLELLAN_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_MCCLELLAN_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showZeroLine = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Two-panel chart with the McClellan Oscillator',
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
      computeLineMcclellanLayout({
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        ...(isFiniteNumber(fastPeriod) ? { fastPeriod } : {}),
        ...(isFiniteNumber(slowPeriod) ? { slowPeriod } : {}),
      }),
    [
      data,
      width,
      height,
      padding,
      gap,
      tickCount,
      pricePanelRatio,
      fastPeriod,
      slowPeriod,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineMcclellanChart(data, {
        ...(isFiniteNumber(fastPeriod) ? { fastPeriod } : {}),
        ...(isFiniteNumber(slowPeriod) ? { slowPeriod } : {}),
      }),
    [ariaDescription, data, fastPeriod, slowPeriod],
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
        data-section="chart-line-mcclellan"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-mcclellan-aria-desc"
          style={MCCLELLAN_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const bp = layout.breadthPanel;
  const op = layout.oscPanel;
  const breadthVisible = !hiddenSet.has('breadth');
  const oscVisible = !hiddenSet.has('osc');

  const fmtNullable = (v: number | null): string =>
    v === null ? 'n/a' : formatValue(v);

  const zoneColor = (zone: ChartLineMcclellanZone): string => {
    if (zone === 'positive') return positiveColor;
    if (zone === 'negative') return negativeColor;
    return oscColor;
  };

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'breadth', label: 'Breadth', color: breadthColor },
    { id: 'osc', label: 'McClellan', color: oscColor },
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
      data-section="chart-line-mcclellan"
      data-empty="false"
      data-fast-period={layout.fastPeriod}
      data-slow-period={layout.slowPeriod}
      data-osc-final={layout.oscFinal}
      data-positive-count={layout.positiveCount}
      data-negative-count={layout.negativeCount}
      data-zero-count={layout.zeroCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-mcclellan-aria-desc"
        style={MCCLELLAN_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-mcclellan-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-mcclellan-badge"
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
              data-section="chart-line-mcclellan-badge-icon"
              aria-hidden="true"
              style={{ color: oscColor }}
            >
              MCO
            </span>
            <span data-section="chart-line-mcclellan-badge-config">
              {layout.fastPeriod}/{layout.slowPeriod}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-mcclellan-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-mcclellan-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.breadthYTicks.map((t, i) => (
                <line
                  key={`gb-${i}`}
                  data-section="chart-line-mcclellan-grid-line"
                  data-panel="breadth"
                  x1={bp.x}
                  x2={bp.x + bp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.oscYTicks.map((t, i) => (
                <line
                  key={`go-${i}`}
                  data-section="chart-line-mcclellan-grid-line"
                  data-panel="osc"
                  x1={op.x}
                  x2={op.x + op.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-mcclellan-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-mcclellan-axis"
                data-panel="breadth"
                data-axis="y"
                x1={bp.x}
                y1={bp.y}
                x2={bp.x}
                y2={bp.y + bp.height}
              />
              <line
                data-section="chart-line-mcclellan-axis"
                data-panel="breadth"
                data-axis="x"
                x1={bp.x}
                y1={bp.y + bp.height}
                x2={bp.x + bp.width}
                y2={bp.y + bp.height}
              />
              <line
                data-section="chart-line-mcclellan-axis"
                data-panel="osc"
                data-axis="y"
                x1={op.x}
                y1={op.y}
                x2={op.x}
                y2={op.y + op.height}
              />
              <line
                data-section="chart-line-mcclellan-axis"
                data-panel="osc"
                data-axis="x"
                x1={op.x}
                y1={op.y + op.height}
                x2={op.x + op.width}
                y2={op.y + op.height}
              />
              {layout.breadthYTicks.map((t, i) => (
                <text
                  key={`byt-${i}`}
                  data-section="chart-line-mcclellan-tick-label"
                  data-panel="breadth"
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
              {layout.oscYTicks.map((t, i) => (
                <text
                  key={`oyt-${i}`}
                  data-section="chart-line-mcclellan-tick-label"
                  data-panel="osc"
                  data-axis="y"
                  x={op.x - 6}
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
                  data-section="chart-line-mcclellan-tick-label"
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
              ))}
            </g>
          ) : null}

          <text
            data-section="chart-line-mcclellan-panel-label"
            data-panel="breadth"
            x={bp.x + 2}
            y={bp.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            Breadth
          </text>
          <text
            data-section="chart-line-mcclellan-panel-label"
            data-panel="osc"
            x={op.x + 2}
            y={op.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            McClellan Oscillator
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-mcclellan-zero-line"
              x1={op.x}
              x2={op.x + op.width}
              y1={layout.zeroY}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {breadthVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Advance-decline breadth line"
              data-section="chart-line-mcclellan-breadth-path"
              d={layout.breadthPath}
              fill="none"
              stroke={breadthColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {breadthVisible && showDots ? (
            <g data-section="chart-line-mcclellan-dots">
              {layout.breadthDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, breadth ${formatValue(d.value)}`}
                    data-section="chart-line-mcclellan-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-value={d.value}
                    cx={d.px}
                    cy={d.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={breadthColor}
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

          {oscVisible && layout.oscPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="McClellan Oscillator line"
              data-section="chart-line-mcclellan-osc-line"
              d={layout.oscPath}
              fill="none"
              stroke={oscColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {oscVisible && showMarkers ? (
            <g data-section="chart-line-mcclellan-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`McClellan at x ${formatX(m.x)}: ${formatValue(m.osc)}, ${m.zone}`}
                    data-section="chart-line-mcclellan-marker"
                    data-point-index={m.index}
                    data-osc={m.osc}
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
                      const d = layout.breadthDots.find(
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
              const d = layout.breadthDots.find(
                (x) => x.index === hoverIndex,
              );
              if (!d) return null;
              return (
                <div
                  data-section="chart-line-mcclellan-tooltip"
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
                  <div data-section="chart-line-mcclellan-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-mcclellan-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    breadth: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-mcclellan-tooltip-osc">
                    osc: {fmtNullable(d.osc)}
                  </div>
                  <div data-section="chart-line-mcclellan-tooltip-zone">
                    zone: {d.zone}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-mcclellan-legend"
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
                data-section="chart-line-mcclellan-legend-item"
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
                  data-section="chart-line-mcclellan-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-mcclellan-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-mcclellan-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.positiveCount} pos, {layout.negativeCount} neg,{' '}
            {layout.zeroCount} zero
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineMcclellan.displayName = 'ChartLineMcclellan';
