import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_VORTEX_WIDTH = 560;
export const DEFAULT_CHART_LINE_VORTEX_HEIGHT = 360;
export const DEFAULT_CHART_LINE_VORTEX_PADDING = 40;
export const DEFAULT_CHART_LINE_VORTEX_GAP = 26;
export const DEFAULT_CHART_LINE_VORTEX_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_VORTEX_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VORTEX_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VORTEX_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VORTEX_PERIOD = 14;
export const DEFAULT_CHART_LINE_VORTEX_VALUE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_VORTEX_VI_PLUS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VORTEX_VI_MINUS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VORTEX_MID_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VORTEX_CROSS_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_VORTEX_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VORTEX_AXIS_COLOR = '#cbd5e1';

export type ChartLineVortexTrend = 'up' | 'down' | 'neutral';

export interface ChartLineVortexPoint {
  x: number;
  value: number;
}

export interface ChartLineVortexMovement {
  vmPlus: (number | null)[];
  vmMinus: (number | null)[];
  trueRange: (number | null)[];
}

export interface ChartLineVortexSeries {
  viPlus: (number | null)[];
  viMinus: (number | null)[];
}

export interface ChartLineVortexSample {
  index: number;
  x: number;
  value: number;
  viPlus: number | null;
  viMinus: number | null;
  trend: ChartLineVortexTrend;
  cross: boolean;
}

export interface ChartLineVortexRun {
  series: ChartLineVortexPoint[];
  period: number;
  viPlus: (number | null)[];
  viMinus: (number | null)[];
  samples: ChartLineVortexSample[];
  viPlusFinal: number;
  viMinusFinal: number;
  trendFinal: ChartLineVortexTrend | null;
  crossUpCount: number;
  crossDownCount: number;
  ok: boolean;
}

export interface ChartLineVortexPriceDot {
  index: number;
  x: number;
  value: number;
  viPlus: number | null;
  viMinus: number | null;
  trend: ChartLineVortexTrend;
  px: number;
  py: number;
}

export interface ChartLineVortexMarker {
  index: number;
  x: number;
  viPlus: number;
  trend: ChartLineVortexTrend;
  cross: boolean;
  px: number;
  py: number;
}

export interface ChartLineVortexPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineVortexLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineVortexPanel;
  vortexPanel: ChartLineVortexPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  vortexYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineVortexPriceDot[];
  viPlusPath: string;
  viMinusPath: string;
  markers: ChartLineVortexMarker[];
  midY: number;
  period: number;
  viPlusFinal: number;
  viMinusFinal: number;
  trendFinal: ChartLineVortexTrend | null;
  crossUpCount: number;
  crossDownCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineVortexLayoutOptions {
  data: readonly ChartLineVortexPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineVortexProps {
  data: readonly ChartLineVortexPoint[];
  period?: number;
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
  valueColor?: string;
  viPlusColor?: string;
  viMinusColor?: string;
  midColor?: string;
  crossColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showViPlus?: boolean;
  showViMinus?: boolean;
  showMidline?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineVortexPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineVortexFinitePoints(
  points: readonly ChartLineVortexPoint[] | null | undefined,
): ChartLineVortexPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineVortexPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineVortexPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Per-period vortex movement for a single-value series. The positive
 * vortex movement is the up-part of the period's change, the
 * negative is the down-part, and the true range is their sum (the
 * absolute change). Index 0 has no prior value and reads null.
 */
export function computeLineVortexMovement(
  values: readonly number[] | null | undefined,
): ChartLineVortexMovement {
  if (!Array.isArray(values)) {
    return { vmPlus: [], vmMinus: [], trueRange: [] };
  }
  const n = values.length;
  const vmPlus: (number | null)[] = new Array(n).fill(null);
  const vmMinus: (number | null)[] = new Array(n).fill(null);
  const trueRange: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const change = values[i]! - values[i - 1]!;
    vmPlus[i] = change > 0 ? change : 0;
    vmMinus[i] = change < 0 ? -change : 0;
    trueRange[i] = Math.abs(change);
  }
  return { vmPlus, vmMinus, trueRange };
}

/**
 * The Vortex Indicator. Over a trailing window of `period` vortex
 * movements, `VI+ = sum(VM+) / sum(TR)` and `VI- = sum(VM-) / sum(TR)`
 * via simple window sums. With the single-value adaptation
 * `TR = VM+ + VM-`, the two lines sum to 1 and cross at 0.5 as the
 * trend turns. A flat window reads 0.5 for both. VI is defined from
 * index `period` onward; earlier indices read null.
 */
export function computeLineVortex(
  values: readonly number[] | null | undefined,
  period: number,
): ChartLineVortexSeries {
  if (!Array.isArray(values)) return { viPlus: [], viMinus: [] };
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const { vmPlus, vmMinus, trueRange } = computeLineVortexMovement(values);
  const viPlus: (number | null)[] = new Array(n).fill(null);
  const viMinus: (number | null)[] = new Array(n).fill(null);
  for (let i = p; i < n; i += 1) {
    let sumP = 0;
    let sumM = 0;
    let sumT = 0;
    for (let j = i - p + 1; j <= i; j += 1) {
      sumP += vmPlus[j] ?? 0;
      sumM += vmMinus[j] ?? 0;
      sumT += trueRange[j] ?? 0;
    }
    const rp = sumT === 0 ? 0.5 : sumP / sumT;
    const rm = sumT === 0 ? 0.5 : sumM / sumT;
    viPlus[i] = rp === 0 ? 0 : rp;
    viMinus[i] = rm === 0 ? 0 : rm;
  }
  return { viPlus, viMinus };
}

export function runLineVortex(
  points: readonly ChartLineVortexPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineVortexRun {
  const finite = getLineVortexFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineVortexPeriod(
    options?.period ?? DEFAULT_CHART_LINE_VORTEX_PERIOD,
    DEFAULT_CHART_LINE_VORTEX_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      viPlus: [],
      viMinus: [],
      samples: [],
      viPlusFinal: NaN,
      viMinusFinal: NaN,
      trendFinal: null,
      crossUpCount: 0,
      crossDownCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { viPlus, viMinus } = computeLineVortex(values, period);
  const samples: ChartLineVortexSample[] = series.map((p, i) => {
    const vp = viPlus[i] ?? null;
    const vm = viMinus[i] ?? null;
    let trend: ChartLineVortexTrend = 'neutral';
    if (vp !== null && vm !== null) {
      if (vp > vm) trend = 'up';
      else if (vp < vm) trend = 'down';
    }
    return { index: i, x: p.x, value: p.value, viPlus: vp, viMinus: vm, trend, cross: false };
  });

  let prevTrend: ChartLineVortexTrend | null = null;
  let crossUpCount = 0;
  let crossDownCount = 0;
  for (const s of samples) {
    if (s.viPlus === null) continue;
    if (s.trend === 'up' || s.trend === 'down') {
      if (prevTrend !== null && s.trend !== prevTrend) {
        s.cross = true;
        if (s.trend === 'up') crossUpCount += 1;
        else crossDownCount += 1;
      }
      prevTrend = s.trend;
    }
  }

  let viPlusFinal = NaN;
  let viMinusFinal = NaN;
  let trendFinal: ChartLineVortexTrend | null = null;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (samples[i]!.viPlus !== null) {
      viPlusFinal = samples[i]!.viPlus as number;
      viMinusFinal = samples[i]!.viMinus as number;
      trendFinal = samples[i]!.trend;
      break;
    }
  }

  return {
    series = [],
    period,
    viPlus,
    viMinus,
    samples,
    viPlusFinal,
    viMinusFinal,
    trendFinal,
    crossUpCount,
    crossDownCount,
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

export function computeLineVortexLayout(
  options: ComputeLineVortexLayoutOptions,
): ChartLineVortexLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_VORTEX_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_VORTEX_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_VORTEX_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineVortexPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineVortex(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineVortexLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    vortexPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    vortexYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    viPlusPath: '',
    viMinusPath: '',
    markers: [],
    midY: 0,
    period: run.period,
    viPlusFinal: NaN,
    viMinusFinal: NaN,
    trendFinal: null,
    crossUpCount: 0,
    crossDownCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const vortexH = usableHeight - priceH;
  if (priceH <= 0 || vortexH <= 0) return empty;

  const pricePanel: ChartLineVortexPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const vortexPanel: ChartLineVortexPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: vortexH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < pyLo) pyLo = s.value;
    if (s.value > pyHi) pyHi = s.value;
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
  const projectVortexY = (v: number): number =>
    vortexPanel.y + vortexPanel.height - v * vortexPanel.height;

  const priceDots: ChartLineVortexPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    viPlus: s.viPlus,
    viMinus: s.viMinus,
    trend: s.trend,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const markers: ChartLineVortexMarker[] = [];
  const plusPts: { px: number; py: number }[] = [];
  const minusPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    if (s.viPlus !== null) {
      const py = projectVortexY(s.viPlus);
      plusPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        viPlus: s.viPlus,
        trend: s.trend,
        cross: s.cross,
        px,
        py,
      });
    }
    if (s.viMinus !== null) {
      minusPts.push({ px, py: projectVortexY(s.viMinus) });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    vortexPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    vortexYTicks: computeTicks(0, 1, tickCount).map((v) => ({
      value: v,
      py: projectVortexY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    viPlusPath: buildPath(plusPts),
    viMinusPath: buildPath(minusPts),
    markers,
    midY: projectVortexY(0.5),
    period: run.period,
    viPlusFinal: run.viPlusFinal,
    viMinusFinal: run.viMinusFinal,
    trendFinal: run.trendFinal,
    crossUpCount: run.crossUpCount,
    crossDownCount: run.crossDownCount,
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

export function describeLineVortexChart(
  data: readonly ChartLineVortexPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineVortex(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Vortex Indicator panel (period ${run.period}): the VI+ and VI- lines track positive and negative vortex movement; VI+ above VI- signals an uptrend, below signals a downtrend, and their crossings mark trend changes. Final trend ${run.trendFinal ?? 'n/a'}, ${run.crossUpCount} bullish and ${run.crossDownCount} bearish crossings, across ${run.samples.length} periods.`;
}

const VORTEX_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineVortex = forwardRef<HTMLDivElement, ChartLineVortexProps>(
  function ChartLineVortex(
    props: ChartLineVortexProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_VORTEX_WIDTH,
      height = DEFAULT_CHART_LINE_VORTEX_HEIGHT,
      padding = DEFAULT_CHART_LINE_VORTEX_PADDING,
      gap = DEFAULT_CHART_LINE_VORTEX_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_VORTEX_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_VORTEX_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_VORTEX_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_VORTEX_DOT_RADIUS,
      valueColor = DEFAULT_CHART_LINE_VORTEX_VALUE_COLOR,
      viPlusColor = DEFAULT_CHART_LINE_VORTEX_VI_PLUS_COLOR,
      viMinusColor = DEFAULT_CHART_LINE_VORTEX_VI_MINUS_COLOR,
      midColor = DEFAULT_CHART_LINE_VORTEX_MID_COLOR,
      crossColor = DEFAULT_CHART_LINE_VORTEX_CROSS_COLOR,
      gridColor = DEFAULT_CHART_LINE_VORTEX_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_VORTEX_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showViPlus = true,
      showViMinus = true,
      showMidline = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Vortex Indicator panel',
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
        computeLineVortexLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
        }),
      [data, width, height, padding, gap, pricePanelRatio, tickCount, period],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineVortexChart(data, {
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

    const trendColor = useCallback(
      (t: ChartLineVortexTrend): string =>
        t === 'up' ? viPlusColor : t === 'down' ? viMinusColor : midColor,
      [viPlusColor, viMinusColor, midColor],
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
          data-section="chart-line-vortex"
          data-empty="true"
          data-period={layout.period}
          data-animate={animate ? 'true' : 'false'}
        >
          <span id={descId} data-section="chart-line-vortex-aria-desc" style={VORTEX_SR_STYLE}>
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const vp = layout.vortexPanel;
    const valueVisible = !hiddenSet.has('value');
    const plusVisible = showViPlus && !hiddenSet.has('viplus');
    const minusVisible = showViMinus && !hiddenSet.has('viminus');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'value', label: 'Value', color: valueColor },
      { id: 'viplus', label: 'VI+', color: viPlusColor },
      { id: 'viminus', label: 'VI-', color: viMinusColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-vortex"
        data-empty="false"
        data-period={layout.period}
        data-vi-plus-final={layout.viPlusFinal}
        data-vi-minus-final={layout.viMinusFinal}
        data-trend-final={layout.trendFinal ?? ''}
        data-cross-up-count={layout.crossUpCount}
        data-cross-down-count={layout.crossDownCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-vortex-aria-desc" style={VORTEX_SR_STYLE}>
          {summary}
        </span>

        <div
          data-section="chart-line-vortex-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-vortex-badge"
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
                data-section="chart-line-vortex-badge-icon"
                aria-hidden="true"
                style={{ color: trendColor(layout.trendFinal ?? 'neutral') }}
              >
                VI
              </span>
              <span data-section="chart-line-vortex-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-vortex-badge-trend">
                {layout.trendFinal ?? 'n/a'}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-vortex-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-vortex-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-vortex-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.vortexYTicks.map((t, i) => (
                  <line
                    key={`vgy-${i}`}
                    data-section="chart-line-vortex-grid-line"
                    data-panel="vortex"
                    x1={vp.x}
                    x2={vp.x + vp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showMidline ? (
              <line
                data-section="chart-line-vortex-midline"
                x1={vp.x}
                x2={vp.x + vp.width}
                y1={layout.midY}
                y2={layout.midY}
                stroke={midColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-vortex-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: vp, name: 'vortex', yt: layout.vortexYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-vortex-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-vortex-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-vortex-axis"
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
                        data-section="chart-line-vortex-tick"
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
                          data-section="chart-line-vortex-tick-label"
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
                <g data-section="chart-line-vortex-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-vortex-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={vp.y + vp.height}
                        y2={vp.y + vp.height + 4}
                      />
                      <text
                        data-section="chart-line-vortex-tick-label"
                        data-axis="x"
                        x={t.px}
                        y={vp.y + vp.height + 14}
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

            <g data-section="chart-line-vortex-panel-labels">
              <text
                data-section="chart-line-vortex-panel-label"
                data-panel="price"
                x={pp.x + pp.width / 2}
                y={pp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Value
              </text>
              <text
                data-section="chart-line-vortex-panel-label"
                data-panel="vortex"
                x={vp.x + vp.width / 2}
                y={vp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Vortex
              </text>
            </g>

            {valueVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Value line"
                data-section="chart-line-vortex-value-path"
                d={layout.pricePath}
                fill="none"
                stroke={valueColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {valueVisible && showDots ? (
              <g data-section="chart-line-vortex-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-vortex-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.value}
                      cx={d.px}
                      cy={d.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={valueColor}
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

            {plusVisible && layout.viPlusPath ? (
              <path
                data-section="chart-line-vortex-vi-plus-line"
                d={layout.viPlusPath}
                fill="none"
                stroke={viPlusColor}
                strokeWidth={1.75}
              />
            ) : null}

            {minusVisible && layout.viMinusPath ? (
              <path
                data-section="chart-line-vortex-vi-minus-line"
                d={layout.viMinusPath}
                fill="none"
                stroke={viMinusColor}
                strokeWidth={1.75}
              />
            ) : null}

            {plusVisible ? (
              <g data-section="chart-line-vortex-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Vortex at x ${formatX(m.x)}: trend ${m.trend}${m.cross ? ', crossover' : ''}`}
                      data-section="chart-line-vortex-marker"
                      data-point-index={m.index}
                      data-vi-plus={m.viPlus}
                      data-trend={m.trend}
                      data-cross={m.cross ? 'true' : 'false'}
                      cx={m.px}
                      cy={m.py}
                      r={
                        m.cross
                          ? dotRadius + 1.5
                          : isHover
                            ? dotRadius + 1.5
                            : dotRadius
                      }
                      fill={m.cross ? crossColor : trendColor(m.trend)}
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
                    data-section="chart-line-vortex-tooltip"
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
                    <div data-section="chart-line-vortex-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-vortex-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-vortex-tooltip-vi-plus">
                      VI+:{' '}
                      {d.viPlus === null ? 'n/a' : formatValue(d.viPlus)}
                    </div>
                    <div data-section="chart-line-vortex-tooltip-vi-minus">
                      VI-:{' '}
                      {d.viMinus === null ? 'n/a' : formatValue(d.viMinus)}
                    </div>
                    <div data-section="chart-line-vortex-tooltip-trend">
                      trend: {d.trend}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-vortex-legend"
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
                  data-section="chart-line-vortex-legend-item"
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
                    data-section="chart-line-vortex-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-vortex-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-vortex-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              trend {layout.trendFinal ?? 'n/a'}, {layout.crossUpCount +
                layout.crossDownCount}{' '}
              crossings
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineVortex.displayName = 'ChartLineVortex';
