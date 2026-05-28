import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_DISPARITY_WIDTH = 560;
export const DEFAULT_CHART_LINE_DISPARITY_HEIGHT = 360;
export const DEFAULT_CHART_LINE_DISPARITY_PADDING = 40;
export const DEFAULT_CHART_LINE_DISPARITY_GAP = 26;
export const DEFAULT_CHART_LINE_DISPARITY_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_DISPARITY_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DISPARITY_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DISPARITY_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DISPARITY_PERIOD = 14;
export const DEFAULT_CHART_LINE_DISPARITY_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_DISPARITY_DISPARITY_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_DISPARITY_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DISPARITY_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DISPARITY_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_DISPARITY_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DISPARITY_AXIS_COLOR = '#cbd5e1';

export type ChartLineDisparitySign = 'positive' | 'negative' | 'zero';

export interface ChartLineDisparityPoint {
  x: number;
  value: number;
}

export interface ChartLineDisparitySample {
  index: number;
  x: number;
  value: number;
  sma: number | null;
  disparity: number | null;
  sign: ChartLineDisparitySign;
}

export interface ChartLineDisparityRun {
  series: ChartLineDisparityPoint[];
  period: number;
  sma: (number | null)[];
  disparity: (number | null)[];
  samples: ChartLineDisparitySample[];
  disparityFinal: number;
  disparityMin: number;
  disparityMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineDisparityPriceDot {
  index: number;
  x: number;
  value: number;
  sma: number | null;
  disparity: number | null;
  sign: ChartLineDisparitySign;
  px: number;
  py: number;
}

export interface ChartLineDisparityMarker {
  index: number;
  x: number;
  disparity: number;
  sign: ChartLineDisparitySign;
  px: number;
  py: number;
}

export interface ChartLineDisparityPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineDisparityLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineDisparityPanel;
  disparityPanel: ChartLineDisparityPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  disparityYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  disparityYMin: number;
  disparityYMax: number;
  pricePath: string;
  priceDots: ChartLineDisparityPriceDot[];
  disparityPath: string;
  markers: ChartLineDisparityMarker[];
  zeroY: number;
  period: number;
  disparityFinal: number;
  disparityMin: number;
  disparityMax: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineDisparityLayoutOptions {
  data: readonly ChartLineDisparityPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineDisparityProps {
  data: readonly ChartLineDisparityPoint[];
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
  priceColor?: string;
  disparityColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showDisparity?: boolean;
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
  onPointClick?: (payload: { point: ChartLineDisparityPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineDisparityFinitePoints(
  points: readonly ChartLineDisparityPoint[] | null | undefined,
): ChartLineDisparityPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineDisparityPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineDisparityPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * A simple moving average -- the mean of each trailing window of
 * `period` values. Defined from index `period - 1` onward.
 */
export function computeLineDisparitySma(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let sum = 0;
    for (let j = i - p + 1; j <= i; j += 1) sum += values[j]!;
    out[i] = sum / p;
  }
  return out;
}

/**
 * Steve Nison's Disparity Index. It rates how far the price sits
 * from its own moving average as a percentage:
 * `disparity = 100 * (price - SMA) / SMA`. The index swings around
 * zero -- positive when the price is above its moving average,
 * negative when below -- and the size of the swing shows how
 * stretched the price has become. It is defined from index
 * `period - 1` onward; a zero moving average reads 0 rather than
 * dividing by zero.
 */
export function computeLineDisparity(
  values: readonly number[] | null | undefined,
  period: number,
): { sma: (number | null)[]; disparity: (number | null)[] } {
  if (!Array.isArray(values)) return { sma: [], disparity: [] };
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const sma = computeLineDisparitySma(values, p);
  const disparity: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const m = sma[i];
    if (isDefined(m)) {
      const raw = m === 0 ? 0 : (100 * (values[i]! - m)) / m;
      disparity[i] = raw === 0 ? 0 : raw;
    }
  }
  return { sma, disparity };
}

function classifySign(disparity: number | null): ChartLineDisparitySign {
  if (disparity === null) return 'zero';
  if (disparity > 0) return 'positive';
  if (disparity < 0) return 'negative';
  return 'zero';
}

export function runLineDisparity(
  points: readonly ChartLineDisparityPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineDisparityRun {
  const finite = getLineDisparityFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineDisparityPeriod(
    options?.period ?? DEFAULT_CHART_LINE_DISPARITY_PERIOD,
    DEFAULT_CHART_LINE_DISPARITY_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      sma: [],
      disparity: [],
      samples: [],
      disparityFinal: NaN,
      disparityMin: NaN,
      disparityMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { sma, disparity } = computeLineDisparity(values, period);

  const samples: ChartLineDisparitySample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    sma: sma[i] ?? null,
    disparity: disparity[i] ?? null,
    sign: classifySign(disparity[i] ?? null),
  }));

  let disparityFinal = NaN;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (isDefined(disparity[i])) {
      disparityFinal = disparity[i] as number;
      break;
    }
  }
  let disparityMin = NaN;
  let disparityMax = NaN;
  let positiveCount = 0;
  let negativeCount = 0;
  for (const s of samples) {
    if (s.disparity !== null) {
      if (Number.isNaN(disparityMin) || s.disparity < disparityMin) {
        disparityMin = s.disparity;
      }
      if (Number.isNaN(disparityMax) || s.disparity > disparityMax) {
        disparityMax = s.disparity;
      }
    }
    if (s.sign === 'positive') positiveCount += 1;
    if (s.sign === 'negative') negativeCount += 1;
  }

  return {
    series = [],
    period,
    sma,
    disparity,
    samples,
    disparityFinal,
    disparityMin,
    disparityMax,
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

export function computeLineDisparityLayout(
  options: ComputeLineDisparityLayoutOptions,
): ChartLineDisparityLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_DISPARITY_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_DISPARITY_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_DISPARITY_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineDisparityPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineDisparity(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineDisparityLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    disparityPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    disparityYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    disparityYMin: 0,
    disparityYMax: 0,
    pricePath: '',
    priceDots: [],
    disparityPath: '',
    markers: [],
    zeroY: 0,
    period: run.period,
    disparityFinal: NaN,
    disparityMin: NaN,
    disparityMax: NaN,
    positiveCount: 0,
    negativeCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const disparityH = usableHeight - priceH;
  if (priceH <= 0 || disparityH <= 0) return empty;

  const pricePanel: ChartLineDisparityPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const disparityPanel: ChartLineDisparityPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: disparityH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let mag = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < pyLo) pyLo = s.value;
    if (s.value > pyHi) pyHi = s.value;
    if (s.disparity !== null) {
      const a = Math.abs(s.disparity);
      if (a > mag) mag = a;
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }
  const bound = mag > 0 ? mag : 1;
  const disparityYMin = -bound;
  const disparityYMax = bound;

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectDisparityY = (v: number): number =>
    disparityPanel.y +
    disparityPanel.height -
    ((v - disparityYMin) / (disparityYMax - disparityYMin)) *
      disparityPanel.height;

  const priceDots: ChartLineDisparityPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    sma: s.sma,
    disparity: s.disparity,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const markers: ChartLineDisparityMarker[] = [];
  const disparityPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.disparity !== null) {
      const px = projectX(s.x);
      const py = projectDisparityY(s.disparity);
      disparityPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        disparity: s.disparity,
        sign: s.sign,
        px,
        py,
      });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    disparityPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    disparityYTicks: computeTicks(disparityYMin, disparityYMax, tickCount).map(
      (v) => ({ value: v, py: projectDisparityY(v) }),
    ),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    disparityYMin,
    disparityYMax,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    disparityPath: buildPath(disparityPts),
    markers,
    zeroY: projectDisparityY(0),
    period: run.period,
    disparityFinal: run.disparityFinal,
    disparityMin: run.disparityMin,
    disparityMax: run.disparityMax,
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

export function describeLineDisparityChart(
  data: readonly ChartLineDisparityPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineDisparity(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Disparity Index panel (period ${run.period}): the Disparity Index rates how far the price sits from its own ${run.period}-period moving average as a percentage -- 100 * (price - MA) / MA. It swings around zero: a positive reading means the price is above its moving average, a negative reading means below, and the size of the swing shows how stretched the price has become. ${run.positiveCount} positive and ${run.negativeCount} negative across ${run.samples.length} periods.`;
}

const DISPARITY_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineDisparity = forwardRef<
  HTMLDivElement,
  ChartLineDisparityProps
>(function ChartLineDisparity(
  props: ChartLineDisparityProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_DISPARITY_WIDTH,
    height = DEFAULT_CHART_LINE_DISPARITY_HEIGHT,
    padding = DEFAULT_CHART_LINE_DISPARITY_PADDING,
    gap = DEFAULT_CHART_LINE_DISPARITY_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_DISPARITY_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_DISPARITY_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DISPARITY_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DISPARITY_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DISPARITY_PRICE_COLOR,
    disparityColor = DEFAULT_CHART_LINE_DISPARITY_DISPARITY_COLOR,
    positiveColor = DEFAULT_CHART_LINE_DISPARITY_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_DISPARITY_NEGATIVE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_DISPARITY_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_DISPARITY_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_DISPARITY_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showDisparity = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a Disparity Index panel',
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
      computeLineDisparityLayout({
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
      describeLineDisparityChart(data, {
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

  const signColor = useCallback(
    (s: ChartLineDisparitySign): string =>
      s === 'positive'
        ? positiveColor
        : s === 'negative'
          ? negativeColor
          : disparityColor,
    [positiveColor, negativeColor, disparityColor],
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
        data-section="chart-line-disparity"
        data-empty="true"
        data-period={layout.period}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-disparity-aria-desc"
          style={DISPARITY_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const dp = layout.disparityPanel;
  const priceVisible = !hiddenSet.has('price');
  const disparityVisible = showDisparity && !hiddenSet.has('disparity');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'disparity', label: 'Disparity', color: disparityColor },
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
      data-section="chart-line-disparity"
      data-empty="false"
      data-period={layout.period}
      data-disparity-final={layout.disparityFinal}
      data-positive-count={layout.positiveCount}
      data-negative-count={layout.negativeCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-disparity-aria-desc"
        style={DISPARITY_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-disparity-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-disparity-badge"
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
              data-section="chart-line-disparity-badge-icon"
              aria-hidden="true"
              style={{ color: disparityColor }}
            >
              DISP
            </span>
            <span data-section="chart-line-disparity-badge-period">
              p={layout.period}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-disparity-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-disparity-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`pgy-${i}`}
                  data-section="chart-line-disparity-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.disparityYTicks.map((t, i) => (
                <line
                  key={`dgy-${i}`}
                  data-section="chart-line-disparity-grid-line"
                  data-panel="disparity"
                  x1={dp.x}
                  x2={dp.x + dp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-disparity-zero-line"
              x1={dp.x}
              x2={dp.x + dp.width}
              y1={layout.zeroY}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-disparity-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              {[
                { panel: pp, name: 'price', yt: layout.priceYTicks },
                { panel: dp, name: 'disparity', yt: layout.disparityYTicks },
              ].map((cfg) => (
                <g
                  key={`axis-${cfg.name}`}
                  data-section="chart-line-disparity-axis-group"
                  data-panel={cfg.name}
                >
                  <line
                    data-section="chart-line-disparity-axis"
                    data-panel={cfg.name}
                    data-axis="x"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y + cfg.panel.height}
                    x2={cfg.panel.x + cfg.panel.width}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  <line
                    data-section="chart-line-disparity-axis"
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
                      data-section="chart-line-disparity-tick"
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
                        data-section="chart-line-disparity-tick-label"
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
              <g data-section="chart-line-disparity-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`tx-${i}`}
                    data-section="chart-line-disparity-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={dp.y + dp.height}
                      y2={dp.y + dp.height + 4}
                    />
                    <text
                      data-section="chart-line-disparity-tick-label"
                      data-axis="x"
                      x={t.px}
                      y={dp.y + dp.height + 14}
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

          <g data-section="chart-line-disparity-panel-labels">
            <text
              data-section="chart-line-disparity-panel-label"
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
              data-section="chart-line-disparity-panel-label"
              data-panel="disparity"
              x={dp.x + dp.width / 2}
              y={dp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Disparity Index
            </text>
          </g>

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-disparity-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-disparity-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-disparity-dot"
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

          {disparityVisible && layout.disparityPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Disparity Index line"
              data-section="chart-line-disparity-disparity-line"
              d={layout.disparityPath}
              fill="none"
              stroke={disparityColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {disparityVisible ? (
            <g data-section="chart-line-disparity-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Disparity at x ${formatX(m.x)}: ${formatValue(m.disparity)} (${m.sign})`}
                    data-section="chart-line-disparity-marker"
                    data-point-index={m.index}
                    data-disparity={m.disparity}
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
                  data-section="chart-line-disparity-tooltip"
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
                  <div data-section="chart-line-disparity-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div data-section="chart-line-disparity-tooltip-value">
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-disparity-tooltip-sma">
                    sma: {d.sma === null ? 'n/a' : formatValue(d.sma)}
                  </div>
                  <div
                    data-section="chart-line-disparity-tooltip-disparity"
                    style={{ fontWeight: 600 }}
                  >
                    disparity:{' '}
                    {d.disparity === null ? 'n/a' : formatValue(d.disparity)}
                  </div>
                  <div data-section="chart-line-disparity-tooltip-sign">
                    sign: {d.sign}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-disparity-legend"
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
                data-section="chart-line-disparity-legend-item"
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
                  data-section="chart-line-disparity-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-disparity-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-disparity-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.positiveCount} positive, {layout.negativeCount} negative
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineDisparity.displayName = 'ChartLineDisparity';
