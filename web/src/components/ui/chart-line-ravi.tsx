import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_RAVI_WIDTH = 560;
export const DEFAULT_CHART_LINE_RAVI_HEIGHT = 360;
export const DEFAULT_CHART_LINE_RAVI_PADDING = 40;
export const DEFAULT_CHART_LINE_RAVI_GAP = 12;
export const DEFAULT_CHART_LINE_RAVI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RAVI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RAVI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RAVI_FAST_PERIOD = 7;
export const DEFAULT_CHART_LINE_RAVI_SLOW_PERIOD = 65;
export const DEFAULT_CHART_LINE_RAVI_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_RAVI_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_RAVI_RAVI_COLOR = '#c026d3';
export const DEFAULT_CHART_LINE_RAVI_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RAVI_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RAVI_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RAVI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RAVI_AXIS_COLOR = '#cbd5e1';

export type ChartLineRaviSign = 'positive' | 'negative' | 'zero';

export interface ChartLineRaviPoint {
  x: number;
  value: number;
}

export interface ChartLineRaviSample {
  index: number;
  x: number;
  value: number;
  ravi: number | null;
  sign: ChartLineRaviSign;
}

export interface ChartLineRaviRun {
  series: ChartLineRaviPoint[];
  fastPeriod: number;
  slowPeriod: number;
  ravi: (number | null)[];
  samples: ChartLineRaviSample[];
  raviFinal: number;
  raviMin: number;
  raviMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineRaviPriceDot {
  index: number;
  x: number;
  value: number;
  ravi: number | null;
  sign: ChartLineRaviSign;
  px: number;
  py: number;
}

export interface ChartLineRaviMarker {
  index: number;
  x: number;
  ravi: number;
  sign: ChartLineRaviSign;
  px: number;
  py: number;
}

export interface ChartLineRaviPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineRaviLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineRaviPanel;
  raviPanel: ChartLineRaviPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  raviYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  raviYMin: number;
  raviYMax: number;
  pricePath: string;
  priceDots: ChartLineRaviPriceDot[];
  raviPath: string;
  raviMarkers: ChartLineRaviMarker[];
  zeroY: number;
  fastPeriod: number;
  slowPeriod: number;
  raviFinal: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineRaviLayoutOptions {
  data: readonly ChartLineRaviPoint[];
  fastPeriod?: number;
  slowPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineRaviProps {
  data: readonly ChartLineRaviPoint[];
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
  priceColor?: string;
  raviColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRavi?: boolean;
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
  onPointClick?: (payload: { point: ChartLineRaviPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineRaviFinitePoints(
  points: readonly ChartLineRaviPoint[] | null | undefined,
): ChartLineRaviPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineRaviPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a moving-average period to a positive integer. A
 * non-finite or sub-1 value falls back to `fallback`; a fractional
 * value floors.
 */
export function normalizeLineRaviPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The `period`-bar simple moving average of the series. Null
 * through the warm-up; defined from index `period - 1` onward.
 */
export function computeLineRaviSma(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineRaviPeriod(period, DEFAULT_CHART_LINE_RAVI_SLOW_PERIOD);
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p) return out;
  for (let i = p - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const v = values[i - k];
      if (!isFiniteNumber(v)) {
        valid = false;
        break;
      }
      sum += v;
    }
    out[i] = valid ? sum / p : null;
  }
  return out;
}

/**
 * The Range Action Verification Index (Tushar Chande). The RAVI is
 * the spread between a fast and a slow moving average, expressed as
 * a percentage of the slow average:
 *
 *   RAVI[i] = 100 * (SMA(close, fast) - SMA(close, slow)) / SMA(close, slow)
 *
 * A positive RAVI marks the fast average above the slow (an
 * uptrend), a negative RAVI below; the further from zero, the
 * stronger the trend, while a reading near zero marks a ranging
 * market. A zero-valued slow average has an undefined RAVI and is
 * null, as are bars before the slow window is full.
 */
export function computeLineRavi(
  values: readonly number[] | null | undefined,
  fastPeriod: number,
  slowPeriod: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const f = normalizeLineRaviPeriod(
    fastPeriod,
    DEFAULT_CHART_LINE_RAVI_FAST_PERIOD,
  );
  const s = normalizeLineRaviPeriod(
    slowPeriod,
    DEFAULT_CHART_LINE_RAVI_SLOW_PERIOD,
  );
  const fastSma = computeLineRaviSma(values, f);
  const slowSma = computeLineRaviSma(values, s);
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const fv = fastSma[i];
    const sv = slowSma[i];
    if (isFiniteNumber(fv) && isFiniteNumber(sv) && sv !== 0) {
      out[i] = (100 * (fv - sv)) / sv;
    }
  }
  return out;
}

function classifySign(v: number | null): ChartLineRaviSign {
  if (v === null || v === 0) return 'zero';
  return v > 0 ? 'positive' : 'negative';
}

export function runLineRavi(
  points: readonly ChartLineRaviPoint[] | null | undefined,
  options?: { fastPeriod?: number; slowPeriod?: number },
): ChartLineRaviRun {
  const finite = getLineRaviFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const fastPeriod = normalizeLineRaviPeriod(
    options?.fastPeriod ?? DEFAULT_CHART_LINE_RAVI_FAST_PERIOD,
    DEFAULT_CHART_LINE_RAVI_FAST_PERIOD,
  );
  const slowPeriod = normalizeLineRaviPeriod(
    options?.slowPeriod ?? DEFAULT_CHART_LINE_RAVI_SLOW_PERIOD,
    DEFAULT_CHART_LINE_RAVI_SLOW_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      fastPeriod,
      slowPeriod,
      ravi: [],
      samples: [],
      raviFinal: NaN,
      raviMin: NaN,
      raviMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const ravi = computeLineRavi(values, fastPeriod, slowPeriod);

  const samples: ChartLineRaviSample[] = series.map((p, i) => {
    const v = ravi[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      ravi: v,
      sign: classifySign(v),
    };
  });

  let positiveCount = 0;
  let negativeCount = 0;
  let rMin = Number.POSITIVE_INFINITY;
  let rMax = Number.NEGATIVE_INFINITY;
  let rFinal = NaN;
  for (const s of samples) {
    if (s.sign === 'positive') positiveCount += 1;
    else if (s.sign === 'negative') negativeCount += 1;
    if (s.ravi !== null) {
      if (s.ravi < rMin) rMin = s.ravi;
      if (s.ravi > rMax) rMax = s.ravi;
      rFinal = s.ravi;
    }
  }

  return {
    series = [],
    fastPeriod,
    slowPeriod,
    ravi,
    samples,
    raviFinal: rFinal,
    raviMin: isFiniteNumber(rMin) ? rMin : NaN,
    raviMax: isFiniteNumber(rMax) ? rMax : NaN,
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

export function computeLineRaviLayout(
  options: ComputeLineRaviLayoutOptions,
): ChartLineRaviLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_RAVI_GAP,
    tickCount = DEFAULT_CHART_LINE_RAVI_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_RAVI_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineRavi(data, {
    ...(isFiniteNumber(options.fastPeriod)
      ? { fastPeriod: options.fastPeriod }
      : {}),
    ...(isFiniteNumber(options.slowPeriod)
      ? { slowPeriod: options.slowPeriod }
      : {}),
  });

  const emptyPanel: ChartLineRaviPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineRaviLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    raviPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    raviYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    raviYMin: 0,
    raviYMax: 0,
    pricePath: '',
    priceDots: [],
    raviPath: '',
    raviMarkers: [],
    zeroY: 0,
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    raviFinal: NaN,
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
  const raviHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineRaviPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const raviPanel: ChartLineRaviPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: raviHeight,
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

  let bound = Math.max(Math.abs(run.raviMin), Math.abs(run.raviMax));
  if (!isFiniteNumber(bound) || bound <= 0) bound = 1;
  const raviLo = -bound;
  const raviHi = bound;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const raviRange = raviHi - raviLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectRaviY = (v: number): number =>
    raviPanel.y + raviPanel.height - ((v - raviLo) / raviRange) * raviPanel.height;

  const priceDots: ChartLineRaviPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    ravi: s.ravi,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const raviMarkers: ChartLineRaviMarker[] = run.samples
    .filter((s) => s.ravi !== null)
    .map((s) => {
      const v = s.ravi!;
      return {
        index: s.index,
        x: s.x,
        ravi: v,
        sign: s.sign,
        px: projectX(s.x),
        py: projectRaviY(v),
      };
    });

  return {
    ok: true,
    width,
    height,
    pricePanel,
    raviPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    raviYTicks: computeTicks(raviLo, raviHi, tickCount).map((v) => ({
      value: v,
      py: projectRaviY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    raviYMin: raviLo,
    raviYMax: raviHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    raviPath: buildPath(raviMarkers.map((m) => ({ px: m.px, py: m.py }))),
    raviMarkers,
    zeroY: projectRaviY(0),
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    raviFinal: run.raviFinal,
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

export function describeLineRaviChart(
  data: readonly ChartLineRaviPoint[] | null | undefined,
  options?: { fastPeriod?: number; slowPeriod?: number },
): string {
  const run = runLineRavi(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Range Action Verification Index (fast ${run.fastPeriod}, slow ${run.slowPeriod}): the top panel plots the raw price; the bottom panel plots the RAVI, a zero-centred oscillator. The RAVI is the spread between the fast and the slow moving average, expressed as a percentage of the slow average: 100 * (fast moving average - slow moving average) / slow moving average. A positive RAVI marks the fast average above the slow (an uptrend), a negative RAVI below; the further from zero, the stronger the trend. The RAVI reads positive on ${run.positiveCount} bars and negative on ${run.negativeCount} across ${run.samples.length} bars.`;
}

const RAVI_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineRavi = forwardRef<HTMLDivElement, ChartLineRaviProps>(
  function ChartLineRavi(
    props: ChartLineRaviProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      fastPeriod,
      slowPeriod,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_RAVI_WIDTH,
      height = DEFAULT_CHART_LINE_RAVI_HEIGHT,
      padding = DEFAULT_CHART_LINE_RAVI_PADDING,
      gap = DEFAULT_CHART_LINE_RAVI_GAP,
      tickCount = DEFAULT_CHART_LINE_RAVI_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_RAVI_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_RAVI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_RAVI_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_RAVI_PRICE_COLOR,
      raviColor = DEFAULT_CHART_LINE_RAVI_RAVI_COLOR,
      positiveColor = DEFAULT_CHART_LINE_RAVI_POSITIVE_COLOR,
      negativeColor = DEFAULT_CHART_LINE_RAVI_NEGATIVE_COLOR,
      zeroColor = DEFAULT_CHART_LINE_RAVI_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_RAVI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_RAVI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showRavi = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a Range Action Verification Index',
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
        computeLineRaviLayout({
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
        describeLineRaviChart(data, {
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
          data-section="chart-line-ravi"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-ravi-aria-desc"
            style={RAVI_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const rp = layout.raviPanel;
    const priceVisible = !hiddenSet.has('price');
    const raviVisible = showRavi && !hiddenSet.has('ravi');

    const signColor = (sign: ChartLineRaviSign): string =>
      sign === 'positive'
        ? positiveColor
        : sign === 'negative'
          ? negativeColor
          : zeroColor;

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'ravi', label: 'RAVI', color: raviColor },
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
        data-section="chart-line-ravi"
        data-empty="false"
        data-fast-period={layout.fastPeriod}
        data-slow-period={layout.slowPeriod}
        data-ravi-final={layout.raviFinal}
        data-positive-count={layout.positiveCount}
        data-negative-count={layout.negativeCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-ravi-aria-desc"
          style={RAVI_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-ravi-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-ravi-badge"
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
                data-section="chart-line-ravi-badge-icon"
                aria-hidden="true"
                style={{ color: raviColor }}
              >
                RAVI
              </span>
              <span data-section="chart-line-ravi-badge-config">
                {layout.fastPeriod}/{layout.slowPeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-ravi-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-ravi-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-ravi-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.raviYTicks.map((t, i) => (
                  <line
                    key={`gr-${i}`}
                    data-section="chart-line-ravi-grid-line"
                    data-panel="ravi"
                    x1={rp.x}
                    x2={rp.x + rp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-ravi-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-ravi-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-ravi-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-ravi-axis"
                  data-panel="ravi"
                  data-axis="y"
                  x1={rp.x}
                  y1={rp.y}
                  x2={rp.x}
                  y2={rp.y + rp.height}
                />
                <line
                  data-section="chart-line-ravi-axis"
                  data-panel="ravi"
                  data-axis="x"
                  x1={rp.x}
                  y1={rp.y + rp.height}
                  x2={rp.x + rp.width}
                  y2={rp.y + rp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-ravi-tick-label"
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
                {layout.raviYTicks.map((t, i) => (
                  <text
                    key={`ryt-${i}`}
                    data-section="chart-line-ravi-tick-label"
                    data-panel="ravi"
                    data-axis="y"
                    x={rp.x - 6}
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
                    data-section="chart-line-ravi-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={rp.y + rp.height + 14}
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
              data-section="chart-line-ravi-panel-label"
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
              data-section="chart-line-ravi-panel-label"
              data-panel="ravi"
              x={rp.x + 2}
              y={rp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              RAVI
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-ravi-zero-line"
                x1={rp.x}
                x2={rp.x + rp.width}
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
                data-section="chart-line-ravi-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-ravi-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-ravi-dot"
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

            {raviVisible && layout.raviPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Range Action Verification Index line"
                data-section="chart-line-ravi-ravi-line"
                d={layout.raviPath}
                fill="none"
                stroke={raviColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {raviVisible ? (
              <g data-section="chart-line-ravi-markers">
                {layout.raviMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Range Action Verification Index at x ${formatX(m.x)}: ${formatValue(m.ravi)}, ${m.sign}`}
                      data-section="chart-line-ravi-marker"
                      data-point-index={m.index}
                      data-ravi={m.ravi}
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
                    data-section="chart-line-ravi-tooltip"
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
                    <div data-section="chart-line-ravi-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-ravi-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-ravi-tooltip-ravi">
                      ravi: {fmtNullable(d.ravi)}
                    </div>
                    <div data-section="chart-line-ravi-tooltip-sign">
                      sign: {d.sign}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-ravi-legend"
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
                  data-section="chart-line-ravi-legend-item"
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
                    data-section="chart-line-ravi-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-ravi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-ravi-legend-stats"
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

ChartLineRavi.displayName = 'ChartLineRavi';
