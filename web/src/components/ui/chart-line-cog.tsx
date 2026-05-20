import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_COG_WIDTH = 560;
export const DEFAULT_CHART_LINE_COG_HEIGHT = 360;
export const DEFAULT_CHART_LINE_COG_PADDING = 40;
export const DEFAULT_CHART_LINE_COG_GAP = 12;
export const DEFAULT_CHART_LINE_COG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_COG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_COG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_COG_PERIOD = 10;
export const DEFAULT_CHART_LINE_COG_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_COG_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_COG_COG_COLOR = '#ca8a04';
export const DEFAULT_CHART_LINE_COG_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_COG_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_COG_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_COG_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_COG_AXIS_COLOR = '#cbd5e1';

export type ChartLineCogSign = 'positive' | 'negative' | 'zero';

export interface ChartLineCogPoint {
  x: number;
  value: number;
}

export interface ChartLineCogWeightedSum {
  numerator: number;
  denominator: number;
}

export interface ChartLineCogSample {
  index: number;
  x: number;
  value: number;
  cog: number | null;
  sign: ChartLineCogSign;
}

export interface ChartLineCogRun {
  series: ChartLineCogPoint[];
  period: number;
  cog: (number | null)[];
  samples: ChartLineCogSample[];
  cogFinal: number;
  cogMin: number;
  cogMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineCogPriceDot {
  index: number;
  x: number;
  value: number;
  cog: number | null;
  sign: ChartLineCogSign;
  px: number;
  py: number;
}

export interface ChartLineCogMarker {
  index: number;
  x: number;
  cog: number;
  sign: ChartLineCogSign;
  px: number;
  py: number;
}

export interface ChartLineCogPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineCogLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineCogPanel;
  cogPanel: ChartLineCogPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  cogYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  cogYMin: number;
  cogYMax: number;
  pricePath: string;
  priceDots: ChartLineCogPriceDot[];
  cogPath: string;
  cogMarkers: ChartLineCogMarker[];
  zeroY: number;
  period: number;
  cogFinal: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineCogLayoutOptions {
  data: readonly ChartLineCogPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineCogProps {
  data: readonly ChartLineCogPoint[];
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
  cogColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCog?: boolean;
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
  onPointClick?: (payload: { point: ChartLineCogPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineCogFinitePoints(
  points: readonly ChartLineCogPoint[] | null | undefined,
): ChartLineCogPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineCogPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce the Center of Gravity period to an integer of at least 2.
 * A non-finite or sub-2 value falls back to `fallback`; a fractional
 * value floors.
 */
export function normalizeLineCogPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

/**
 * The weighted price sum of a window. The window is ordered oldest
 * first; each bar is weighted by its age -- the oldest bar carries
 * the heaviest weight `m` and the most recent bar the lightest
 * weight `1` (with `m` the window length):
 *
 *   numerator   = SUM[j] (m - j) * window[j]
 *   denominator = SUM[j] window[j]
 *
 * The numerator is the weighted price sum; the denominator the
 * plain price sum.
 */
export function computeLineCogWeightedSum(
  window: readonly number[] | null | undefined,
): ChartLineCogWeightedSum {
  if (!Array.isArray(window) || window.length === 0) {
    return { numerator: 0, denominator: 0 };
  }
  const m = window.length;
  let numerator = 0;
  let denominator = 0;
  for (let j = 0; j < m; j += 1) {
    const v = window[j];
    if (isFiniteNumber(v)) {
      numerator += (m - j) * v;
      denominator += v;
    }
  }
  return { numerator, denominator };
}

/**
 * The Ehlers Center of Gravity oscillator. For each bar the
 * trailing window of `period` bars is reduced to its weighted price
 * sum; the centroid `numerator / denominator` is negated and offset
 * by `(period + 1) / 2`:
 *
 *   CoG[i] = -numerator / denominator + (period + 1) / 2
 *
 * The offset is the centroid of a flat window, so a flat series
 * reads exactly zero. A positive CoG marks recent prices
 * outweighing older ones (a rising window), a negative CoG the
 * reverse. A window whose prices sum to zero has an undefined
 * centroid and is null, as are bars before the window is full.
 */
export function computeLineCog(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = normalizeLineCogPeriod(period, DEFAULT_CHART_LINE_COG_PERIOD);
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p) return out;
  const offset = (p + 1) / 2;
  for (let i = p - 1; i < n; i += 1) {
    const window = values.slice(i - p + 1, i + 1);
    const { numerator, denominator } = computeLineCogWeightedSum(window);
    out[i] = denominator !== 0 ? -numerator / denominator + offset : null;
  }
  return out;
}

function classifySign(v: number | null): ChartLineCogSign {
  if (v === null || v === 0) return 'zero';
  return v > 0 ? 'positive' : 'negative';
}

export function runLineCog(
  points: readonly ChartLineCogPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineCogRun {
  const finite = getLineCogFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineCogPeriod(
    options?.period ?? DEFAULT_CHART_LINE_COG_PERIOD,
    DEFAULT_CHART_LINE_COG_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      cog: [],
      samples: [],
      cogFinal: NaN,
      cogMin: NaN,
      cogMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const cog = computeLineCog(values, period);

  const samples: ChartLineCogSample[] = series.map((p, i) => {
    const c = cog[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      cog: c,
      sign: classifySign(c),
    };
  });

  let positiveCount = 0;
  let negativeCount = 0;
  let cMin = Number.POSITIVE_INFINITY;
  let cMax = Number.NEGATIVE_INFINITY;
  let cFinal = NaN;
  for (const s of samples) {
    if (s.sign === 'positive') positiveCount += 1;
    else if (s.sign === 'negative') negativeCount += 1;
    if (s.cog !== null) {
      if (s.cog < cMin) cMin = s.cog;
      if (s.cog > cMax) cMax = s.cog;
      cFinal = s.cog;
    }
  }

  return {
    series,
    period,
    cog,
    samples,
    cogFinal: cFinal,
    cogMin: isFiniteNumber(cMin) ? cMin : NaN,
    cogMax: isFiniteNumber(cMax) ? cMax : NaN,
    positiveCount,
    negativeCount,
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

export function computeLineCogLayout(
  options: ComputeLineCogLayoutOptions,
): ChartLineCogLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_COG_GAP,
    tickCount = DEFAULT_CHART_LINE_COG_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_COG_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineCog(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });

  const emptyPanel: ChartLineCogPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineCogLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    cogPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    cogYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    cogYMin: 0,
    cogYMax: 0,
    pricePath: '',
    priceDots: [],
    cogPath: '',
    cogMarkers: [],
    zeroY: 0,
    period: run.period,
    cogFinal: NaN,
    positiveCount: 0,
    negativeCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const cogHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineCogPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const cogPanel: ChartLineCogPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: cogHeight,
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

  let bound = Math.max(Math.abs(run.cogMin), Math.abs(run.cogMax));
  if (!isFiniteNumber(bound) || bound <= 0) bound = 1;
  const cogLo = -bound;
  const cogHi = bound;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const cogRange = cogHi - cogLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectCogY = (v: number): number =>
    cogPanel.y + cogPanel.height - ((v - cogLo) / cogRange) * cogPanel.height;

  const priceDots: ChartLineCogPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    cog: s.cog,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const cogMarkers: ChartLineCogMarker[] = run.samples
    .filter((s) => s.cog !== null)
    .map((s) => {
      const c = s.cog!;
      return {
        index: s.index,
        x: s.x,
        cog: c,
        sign: s.sign,
        px: projectX(s.x),
        py: projectCogY(c),
      };
    });

  return {
    ok: true,
    width,
    height,
    pricePanel,
    cogPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    cogYTicks: computeTicks(cogLo, cogHi, tickCount).map((v) => ({
      value: v,
      py: projectCogY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    cogYMin: cogLo,
    cogYMax: cogHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    cogPath: buildPath(cogMarkers.map((m) => ({ px: m.px, py: m.py }))),
    cogMarkers,
    zeroY: projectCogY(0),
    period: run.period,
    cogFinal: run.cogFinal,
    positiveCount: run.positiveCount,
    negativeCount: run.negativeCount,
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

export function describeLineCogChart(
  data: readonly ChartLineCogPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineCog(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with an Ehlers Center of Gravity oscillator (period ${run.period}): the top panel plots the raw price; the bottom panel plots the Center of Gravity, a zero-centred oscillator. The CoG is the centroid of the price window -- a weighted price sum where each bar is weighted by its age -- negated and offset by (period + 1) / 2 so it oscillates around zero. A positive CoG marks recent prices outweighing older ones (a rising window), a negative CoG the reverse. The CoG reads positive on ${run.positiveCount} bars and negative on ${run.negativeCount} across ${run.samples.length} bars.`;
}

const COG_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineCog = forwardRef<HTMLDivElement, ChartLineCogProps>(
  function ChartLineCog(
    props: ChartLineCogProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_COG_WIDTH,
      height = DEFAULT_CHART_LINE_COG_HEIGHT,
      padding = DEFAULT_CHART_LINE_COG_PADDING,
      gap = DEFAULT_CHART_LINE_COG_GAP,
      tickCount = DEFAULT_CHART_LINE_COG_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_COG_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_COG_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_COG_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_COG_PRICE_COLOR,
      cogColor = DEFAULT_CHART_LINE_COG_COG_COLOR,
      positiveColor = DEFAULT_CHART_LINE_COG_POSITIVE_COLOR,
      negativeColor = DEFAULT_CHART_LINE_COG_NEGATIVE_COLOR,
      zeroColor = DEFAULT_CHART_LINE_COG_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_COG_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_COG_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showCog = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with an Ehlers Center of Gravity oscillator',
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
        computeLineCogLayout({
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
        describeLineCogChart(data, {
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
          data-section="chart-line-cog"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-cog-aria-desc"
            style={COG_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const cp = layout.cogPanel;
    const priceVisible = !hiddenSet.has('price');
    const cogVisible = showCog && !hiddenSet.has('cog');

    const signColor = (sign: ChartLineCogSign): string =>
      sign === 'positive'
        ? positiveColor
        : sign === 'negative'
          ? negativeColor
          : zeroColor;

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'cog', label: 'CoG', color: cogColor },
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
        data-section="chart-line-cog"
        data-empty="false"
        data-period={layout.period}
        data-cog-final={layout.cogFinal}
        data-positive-count={layout.positiveCount}
        data-negative-count={layout.negativeCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-cog-aria-desc"
          style={COG_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-cog-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-cog-badge"
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
                data-section="chart-line-cog-badge-icon"
                aria-hidden="true"
                style={{ color: cogColor }}
              >
                COG
              </span>
              <span data-section="chart-line-cog-badge-period">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-cog-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-cog-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-cog-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.cogYTicks.map((t, i) => (
                  <line
                    key={`gc-${i}`}
                    data-section="chart-line-cog-grid-line"
                    data-panel="cog"
                    x1={cp.x}
                    x2={cp.x + cp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-cog-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-cog-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-cog-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-cog-axis"
                  data-panel="cog"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-cog-axis"
                  data-panel="cog"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-cog-tick-label"
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
                {layout.cogYTicks.map((t, i) => (
                  <text
                    key={`cyt-${i}`}
                    data-section="chart-line-cog-tick-label"
                    data-panel="cog"
                    data-axis="y"
                    x={cp.x - 6}
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
                    data-section="chart-line-cog-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={cp.y + cp.height + 14}
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
              data-section="chart-line-cog-panel-label"
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
              data-section="chart-line-cog-panel-label"
              data-panel="cog"
              x={cp.x + 2}
              y={cp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              CoG
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-cog-zero-line"
                x1={cp.x}
                x2={cp.x + cp.width}
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
                data-section="chart-line-cog-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-cog-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-cog-dot"
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

            {cogVisible && layout.cogPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Center of Gravity oscillator line"
                data-section="chart-line-cog-cog-line"
                d={layout.cogPath}
                fill="none"
                stroke={cogColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {cogVisible ? (
              <g data-section="chart-line-cog-markers">
                {layout.cogMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Center of Gravity at x ${formatX(m.x)}: ${formatValue(m.cog)}, ${m.sign}`}
                      data-section="chart-line-cog-marker"
                      data-point-index={m.index}
                      data-cog={m.cog}
                      data-sign={m.sign}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={signColor(m.sign)}
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
                    data-section="chart-line-cog-tooltip"
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
                    <div data-section="chart-line-cog-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-cog-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-cog-tooltip-cog">
                      cog: {fmtNullable(d.cog)}
                    </div>
                    <div data-section="chart-line-cog-tooltip-sign">
                      sign: {d.sign}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-cog-legend"
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
                  data-section="chart-line-cog-legend-item"
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
                    data-section="chart-line-cog-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-cog-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-cog-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.positiveCount} positive, {layout.negativeCount} negative
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineCog.displayName = 'ChartLineCog';
