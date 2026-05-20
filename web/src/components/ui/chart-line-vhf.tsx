import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_VHF_WIDTH = 560;
export const DEFAULT_CHART_LINE_VHF_HEIGHT = 360;
export const DEFAULT_CHART_LINE_VHF_PADDING = 40;
export const DEFAULT_CHART_LINE_VHF_GAP = 12;
export const DEFAULT_CHART_LINE_VHF_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VHF_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VHF_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VHF_PERIOD = 28;
export const DEFAULT_CHART_LINE_VHF_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_VHF_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_VHF_VHF_COLOR = '#0284c7';
export const DEFAULT_CHART_LINE_VHF_TRENDING_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VHF_RANGING_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VHF_NEUTRAL_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VHF_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VHF_AXIS_COLOR = '#cbd5e1';

export type ChartLineVhfRegime = 'trending' | 'ranging' | 'neutral';

export interface ChartLineVhfPoint {
  x: number;
  value: number;
}

export interface ChartLineVhfWindow {
  range: number;
  travel: number;
  vhf: number;
}

export interface ChartLineVhfSample {
  index: number;
  x: number;
  value: number;
  vhf: number | null;
  regime: ChartLineVhfRegime;
}

export interface ChartLineVhfRun {
  series: ChartLineVhfPoint[];
  period: number;
  vhf: (number | null)[];
  samples: ChartLineVhfSample[];
  vhfFinal: number;
  vhfMin: number;
  vhfMax: number;
  trendingCount: number;
  rangingCount: number;
  ok: boolean;
}

export interface ChartLineVhfPriceDot {
  index: number;
  x: number;
  value: number;
  vhf: number | null;
  regime: ChartLineVhfRegime;
  px: number;
  py: number;
}

export interface ChartLineVhfMarker {
  index: number;
  x: number;
  vhf: number;
  regime: ChartLineVhfRegime;
  px: number;
  py: number;
}

export interface ChartLineVhfPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineVhfLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineVhfPanel;
  vhfPanel: ChartLineVhfPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  vhfYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  vhfYMin: number;
  vhfYMax: number;
  pricePath: string;
  priceDots: ChartLineVhfPriceDot[];
  vhfPath: string;
  vhfMarkers: ChartLineVhfMarker[];
  refY: number;
  period: number;
  vhfFinal: number;
  trendingCount: number;
  rangingCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineVhfLayoutOptions {
  data: readonly ChartLineVhfPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineVhfProps {
  data: readonly ChartLineVhfPoint[];
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
  vhfColor?: string;
  trendingColor?: string;
  rangingColor?: string;
  neutralColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showVhf?: boolean;
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
  onPointClick?: (payload: { point: ChartLineVhfPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineVhfFinitePoints(
  points: readonly ChartLineVhfPoint[] | null | undefined,
): ChartLineVhfPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineVhfPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce the Vertical Horizontal Filter period to an integer of at
 * least 2. A non-finite or sub-2 value falls back to `fallback`; a
 * fractional value floors.
 */
export function normalizeLineVhfPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

/**
 * Score a single window. The `range` is the net travel of the close
 * -- its highest value minus its lowest. The `travel` is the total
 * distance walked -- the sum of the absolute bar-to-bar moves. The
 * `vhf` is `range / travel`: it sits in [0, 1] because the net
 * displacement can never exceed the total path. A flat window has a
 * zero travel and a NaN vhf.
 */
export function computeLineVhfWindow(
  window: readonly number[] | null | undefined,
): ChartLineVhfWindow {
  if (!Array.isArray(window) || window.length < 2) {
    return { range: 0, travel: 0, vhf: NaN };
  }
  const n = window.length;
  let max = Number.NEGATIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  let travel = 0;
  for (let j = 0; j < n; j += 1) {
    const v = window[j]!;
    if (v > max) max = v;
    if (v < min) min = v;
    if (j > 0) travel += Math.abs(v - window[j - 1]!);
  }
  const range = max - min;
  const vhf = travel > 0 ? range / travel : NaN;
  return { range, travel, vhf };
}

/**
 * The rolling Vertical Horizontal Filter (Adam White). For each bar
 * the trailing window of `period` closes is scored:
 *
 *   VHF[i] = (highest close - lowest close) / sum(abs bar-to-bar move)
 *
 * the net range of the close divided by the total distance it
 * travelled. A VHF near 1 marks a trending market (the price moved
 * in one direction so the range nearly equals the path); near 0 a
 * ranging market (the price travelled far but went nowhere). A flat
 * window has an undefined VHF and is null, as are bars before the
 * window is full.
 */
export function computeLineVhf(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineVhfPeriod(period, DEFAULT_CHART_LINE_VHF_PERIOD);
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p) return out;
  for (let i = p - 1; i < n; i += 1) {
    const window = values.slice(i - p + 1, i + 1);
    const { vhf } = computeLineVhfWindow(window);
    out[i] = isFiniteNumber(vhf) ? vhf : null;
  }
  return out;
}

function classifyRegime(v: number | null): ChartLineVhfRegime {
  if (v === null || v === 0.5) return 'neutral';
  return v > 0.5 ? 'trending' : 'ranging';
}

export function runLineVhf(
  points: readonly ChartLineVhfPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineVhfRun {
  const finite = getLineVhfFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineVhfPeriod(
    options?.period ?? DEFAULT_CHART_LINE_VHF_PERIOD,
    DEFAULT_CHART_LINE_VHF_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      vhf: [],
      samples: [],
      vhfFinal: NaN,
      vhfMin: NaN,
      vhfMax: NaN,
      trendingCount: 0,
      rangingCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const vhf = computeLineVhf(values, period);

  const samples: ChartLineVhfSample[] = series.map((p, i) => {
    const v = vhf[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      vhf: v,
      regime: classifyRegime(v),
    };
  });

  let trendingCount = 0;
  let rangingCount = 0;
  let vMin = Number.POSITIVE_INFINITY;
  let vMax = Number.NEGATIVE_INFINITY;
  let vFinal = NaN;
  for (const s of samples) {
    if (s.regime === 'trending') trendingCount += 1;
    else if (s.regime === 'ranging') rangingCount += 1;
    if (s.vhf !== null) {
      if (s.vhf < vMin) vMin = s.vhf;
      if (s.vhf > vMax) vMax = s.vhf;
      vFinal = s.vhf;
    }
  }

  return {
    series,
    period,
    vhf,
    samples,
    vhfFinal: vFinal,
    vhfMin: isFiniteNumber(vMin) ? vMin : NaN,
    vhfMax: isFiniteNumber(vMax) ? vMax : NaN,
    trendingCount,
    rangingCount,
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

export function computeLineVhfLayout(
  options: ComputeLineVhfLayoutOptions,
): ChartLineVhfLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_VHF_GAP,
    tickCount = DEFAULT_CHART_LINE_VHF_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_VHF_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineVhf(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });

  const emptyPanel: ChartLineVhfPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineVhfLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    vhfPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    vhfYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    vhfYMin: 0,
    vhfYMax: 1,
    pricePath: '',
    priceDots: [],
    vhfPath: '',
    vhfMarkers: [],
    refY: 0,
    period: run.period,
    vhfFinal: NaN,
    trendingCount: 0,
    rangingCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const vhfHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineVhfPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const vhfPanel: ChartLineVhfPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: vhfHeight,
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

  // The VHF is bounded to [0, 1], so the bottom panel uses a fixed
  // [0, 1] domain with a 0.5 reference line.
  const vhfLo = 0;
  const vhfHi = 1;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const vhfRange = vhfHi - vhfLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectVhfY = (v: number): number =>
    vhfPanel.y + vhfPanel.height - ((v - vhfLo) / vhfRange) * vhfPanel.height;

  const priceDots: ChartLineVhfPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    vhf: s.vhf,
    regime: s.regime,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const vhfMarkers: ChartLineVhfMarker[] = run.samples
    .filter((s) => s.vhf !== null)
    .map((s) => {
      const v = s.vhf!;
      return {
        index: s.index,
        x: s.x,
        vhf: v,
        regime: s.regime,
        px: projectX(s.x),
        py: projectVhfY(v),
      };
    });

  return {
    ok: true,
    width,
    height,
    pricePanel,
    vhfPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    vhfYTicks: computeTicks(vhfLo, vhfHi, tickCount).map((v) => ({
      value: v,
      py: projectVhfY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    vhfYMin: vhfLo,
    vhfYMax: vhfHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    vhfPath: buildPath(vhfMarkers.map((m) => ({ px: m.px, py: m.py }))),
    vhfMarkers,
    refY: projectVhfY(0.5),
    period: run.period,
    vhfFinal: run.vhfFinal,
    trendingCount: run.trendingCount,
    rangingCount: run.rangingCount,
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

export function describeLineVhfChart(
  data: readonly ChartLineVhfPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineVhf(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Vertical Horizontal Filter (period ${run.period}): the top panel plots the raw price; the bottom panel plots the VHF, a 0 to 1 gauge. The VHF divides the net range of the close (its highest minus its lowest over the window) by the total distance it travelled (the sum of the bar-to-bar moves). A VHF near 1 marks a trending market -- the price moved in one direction so the range nearly equals the path; near 0 a ranging market -- the price travelled far but went nowhere. A reading above 0.5 is scored trending, below 0.5 ranging. The VHF reads trending on ${run.trendingCount} bars and ranging on ${run.rangingCount} across ${run.samples.length} bars.`;
}

const VHF_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineVhf = forwardRef<HTMLDivElement, ChartLineVhfProps>(
  function ChartLineVhf(
    props: ChartLineVhfProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_VHF_WIDTH,
      height = DEFAULT_CHART_LINE_VHF_HEIGHT,
      padding = DEFAULT_CHART_LINE_VHF_PADDING,
      gap = DEFAULT_CHART_LINE_VHF_GAP,
      tickCount = DEFAULT_CHART_LINE_VHF_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_VHF_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_VHF_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_VHF_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_VHF_PRICE_COLOR,
      vhfColor = DEFAULT_CHART_LINE_VHF_VHF_COLOR,
      trendingColor = DEFAULT_CHART_LINE_VHF_TRENDING_COLOR,
      rangingColor = DEFAULT_CHART_LINE_VHF_RANGING_COLOR,
      neutralColor = DEFAULT_CHART_LINE_VHF_NEUTRAL_COLOR,
      gridColor = DEFAULT_CHART_LINE_VHF_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_VHF_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showVhf = true,
      showRefLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a Vertical Horizontal Filter',
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
        computeLineVhfLayout({
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
        describeLineVhfChart(data, {
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
          data-section="chart-line-vhf"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-vhf-aria-desc"
            style={VHF_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const vp = layout.vhfPanel;
    const priceVisible = !hiddenSet.has('price');
    const vhfVisible = showVhf && !hiddenSet.has('vhf');

    const regimeColor = (regime: ChartLineVhfRegime): string =>
      regime === 'trending'
        ? trendingColor
        : regime === 'ranging'
          ? rangingColor
          : neutralColor;

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'vhf', label: 'VHF', color: vhfColor },
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
        data-section="chart-line-vhf"
        data-empty="false"
        data-period={layout.period}
        data-vhf-final={layout.vhfFinal}
        data-trending-count={layout.trendingCount}
        data-ranging-count={layout.rangingCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-vhf-aria-desc"
          style={VHF_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-vhf-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-vhf-badge"
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
                data-section="chart-line-vhf-badge-icon"
                aria-hidden="true"
                style={{ color: vhfColor }}
              >
                VHF
              </span>
              <span data-section="chart-line-vhf-badge-period">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-vhf-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-vhf-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-vhf-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.vhfYTicks.map((t, i) => (
                  <line
                    key={`gv-${i}`}
                    data-section="chart-line-vhf-grid-line"
                    data-panel="vhf"
                    x1={vp.x}
                    x2={vp.x + vp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-vhf-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-vhf-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-vhf-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-vhf-axis"
                  data-panel="vhf"
                  data-axis="y"
                  x1={vp.x}
                  y1={vp.y}
                  x2={vp.x}
                  y2={vp.y + vp.height}
                />
                <line
                  data-section="chart-line-vhf-axis"
                  data-panel="vhf"
                  data-axis="x"
                  x1={vp.x}
                  y1={vp.y + vp.height}
                  x2={vp.x + vp.width}
                  y2={vp.y + vp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-vhf-tick-label"
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
                {layout.vhfYTicks.map((t, i) => (
                  <text
                    key={`vyt-${i}`}
                    data-section="chart-line-vhf-tick-label"
                    data-panel="vhf"
                    data-axis="y"
                    x={vp.x - 6}
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
                    data-section="chart-line-vhf-tick-label"
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
                ))}
              </g>
            ) : null}

            <text
              data-section="chart-line-vhf-panel-label"
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
              data-section="chart-line-vhf-panel-label"
              data-panel="vhf"
              x={vp.x + 2}
              y={vp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              VHF
            </text>

            {showRefLine ? (
              <line
                data-section="chart-line-vhf-ref-line"
                x1={vp.x}
                x2={vp.x + vp.width}
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
                data-section="chart-line-vhf-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-vhf-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-vhf-dot"
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

            {vhfVisible && layout.vhfPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Vertical Horizontal Filter line"
                data-section="chart-line-vhf-vhf-line"
                d={layout.vhfPath}
                fill="none"
                stroke={vhfColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {vhfVisible ? (
              <g data-section="chart-line-vhf-markers">
                {layout.vhfMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Vertical Horizontal Filter at x ${formatX(m.x)}: ${formatValue(m.vhf)}, ${m.regime}`}
                      data-section="chart-line-vhf-marker"
                      data-point-index={m.index}
                      data-vhf={m.vhf}
                      data-regime={m.regime}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={regimeColor(m.regime)}
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
                    data-section="chart-line-vhf-tooltip"
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
                    <div data-section="chart-line-vhf-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-vhf-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-vhf-tooltip-vhf">
                      vhf: {fmtNullable(d.vhf)}
                    </div>
                    <div data-section="chart-line-vhf-tooltip-regime">
                      regime: {d.regime}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-vhf-legend"
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
                  data-section="chart-line-vhf-legend-item"
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
                    data-section="chart-line-vhf-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-vhf-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-vhf-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.trendingCount} trending, {layout.rangingCount} ranging
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineVhf.displayName = 'ChartLineVhf';
