import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_MAMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_MAMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_MAMA_PADDING = 40;
export const DEFAULT_CHART_LINE_MAMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MAMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MAMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MAMA_PERIOD = 10;
export const DEFAULT_CHART_LINE_MAMA_SLOW_LIMIT = 0.05;
export const DEFAULT_CHART_LINE_MAMA_FAST_LIMIT = 0.5;
export const DEFAULT_CHART_LINE_MAMA_PRICE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MAMA_MAMA_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MAMA_FAMA_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_MAMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MAMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineMamaCross = 'bullish' | 'bearish' | 'neutral';

export interface ChartLineMamaPoint {
  x: number;
  value: number;
}

export interface ChartLineMamaSeries {
  mama: number[];
  fama: number[];
  alpha: number[];
}

export interface ChartLineMamaSample {
  index: number;
  x: number;
  value: number;
  mama: number;
  fama: number;
  alpha: number;
  cross: ChartLineMamaCross;
}

export interface ChartLineMamaRun {
  series: ChartLineMamaPoint[];
  period: number;
  slowLimit: number;
  fastLimit: number;
  mama: number[];
  fama: number[];
  alpha: number[];
  samples: ChartLineMamaSample[];
  mamaFinal: number;
  famaFinal: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineMamaDot {
  index: number;
  x: number;
  value: number;
  mama: number;
  fama: number;
  alpha: number;
  cross: ChartLineMamaCross;
  px: number;
  py: number;
}

export interface ChartLineMamaMarker {
  index: number;
  x: number;
  mama: number;
  cross: ChartLineMamaCross;
  px: number;
  py: number;
}

export interface ChartLineMamaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: { x: number; y: number; width: number; height: number };
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  mamaPath: string;
  famaPath: string;
  priceDots: ChartLineMamaDot[];
  mamaMarkers: ChartLineMamaMarker[];
  period: number;
  slowLimit: number;
  fastLimit: number;
  mamaFinal: number;
  famaFinal: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineMamaLayoutOptions {
  data: readonly ChartLineMamaPoint[];
  period?: number;
  slowLimit?: number;
  fastLimit?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineMamaProps {
  data: readonly ChartLineMamaPoint[];
  period?: number;
  slowLimit?: number;
  fastLimit?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  mamaColor?: string;
  famaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMama?: boolean;
  showFama?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineMamaDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineMamaFinitePoints(
  points: readonly ChartLineMamaPoint[] | null | undefined,
): ChartLineMamaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineMamaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a MAMA detrend period to a positive integer. A
 * non-finite or sub-1 value falls back to `fallback`; a
 * fractional value floors.
 */
export function normalizeLineMamaPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Coerce a MAMA alpha limit into the open interval (0, 1). A
 * non-finite value, or one outside the range, falls back to
 * `fallback`.
 */
export function normalizeLineMamaLimit(
  limit: number,
  fallback: number,
): number {
  if (!isFiniteNumber(limit) || limit <= 0 || limit >= 1) return fallback;
  return limit;
}

function computeSma(
  values: readonly number[],
  period: number,
): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
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
 * The phase of the price cycle, in radians. The price is
 * detrended -- the `period`-bar moving average subtracted -- to
 * expose its cycle; the phase treats the cycle value and its
 * one-bar change as the in-phase and quadrature components of a
 * phasor: `phase = atan2(cycle - cycle[-1], cycle)`. Bars before
 * the detrend window is full are null.
 */
export function computeLineMamaPhase(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineMamaPeriod(period, DEFAULT_CHART_LINE_MAMA_PERIOD);
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const sma = computeSma(values, p);
  const cycle: (number | null)[] = values.map((v, i) => {
    const m = sma[i];
    return isFiniteNumber(v) && isFiniteNumber(m) ? v - m : null;
  });
  for (let i = p; i < n; i += 1) {
    const c = cycle[i];
    const cp = cycle[i - 1];
    if (!isFiniteNumber(c) || !isFiniteNumber(cp)) continue;
    out[i] = Math.atan2(c - cp, c);
  }
  return out;
}

function wrapPhase(d: number): number {
  let w = d;
  while (w > Math.PI) w -= 2 * Math.PI;
  while (w <= -Math.PI) w += 2 * Math.PI;
  return w;
}

/**
 * The MESA Adaptive Moving Average and its companion FAMA. The
 * MAMA is an exponential moving average whose smoothing factor
 * `alpha` adapts to the measured cycle phase -- a fast-advancing
 * phase drives alpha toward `fastLimit` (close tracking), a slow
 * phase toward `slowLimit` (heavy smoothing):
 *
 *   alpha = slowLimit + (fastLimit - slowLimit) * |dPhase| / pi
 *   MAMA  = alpha * price + (1 - alpha) * MAMA[-1]
 *   FAMA  = 0.5 * alpha * MAMA + (1 - 0.5 * alpha) * FAMA[-1]
 *
 * Both are seeded with the first price.
 */
export function computeLineMama(
  values: readonly number[] | null | undefined,
  period: number,
  slowLimit: number,
  fastLimit: number,
): ChartLineMamaSeries {
  if (!Array.isArray(values)) return { mama: [], fama: [], alpha: [] };
  const lim1 = normalizeLineMamaLimit(
    slowLimit,
    DEFAULT_CHART_LINE_MAMA_SLOW_LIMIT,
  );
  const lim2 = normalizeLineMamaLimit(
    fastLimit,
    DEFAULT_CHART_LINE_MAMA_FAST_LIMIT,
  );
  const lo = Math.min(lim1, lim2);
  const hi = Math.max(lim1, lim2);
  const n = values.length;
  const mama: number[] = new Array(n).fill(0);
  const fama: number[] = new Array(n).fill(0);
  const alpha: number[] = new Array(n).fill(lo);
  if (n === 0) return { mama, fama, alpha };
  const phase = computeLineMamaPhase(values, period);
  const seed = isFiniteNumber(values[0]) ? (values[0] as number) : 0;
  mama[0] = seed;
  fama[0] = seed;
  let prevMama = seed;
  let prevFama = seed;
  for (let i = 1; i < n; i += 1) {
    let a = lo;
    const ph = phase[i];
    const php = phase[i - 1];
    if (isFiniteNumber(ph) && isFiniteNumber(php)) {
      const speed = Math.abs(wrapPhase(ph - php)) / Math.PI;
      a = lo + (hi - lo) * speed;
    }
    alpha[i] = a;
    const v = isFiniteNumber(values[i]) ? (values[i] as number) : prevMama;
    const m = a * v + (1 - a) * prevMama;
    const f = 0.5 * a * m + (1 - 0.5 * a) * prevFama;
    mama[i] = m;
    fama[i] = f;
    prevMama = m;
    prevFama = f;
  }
  return { mama, fama, alpha };
}

function classifyCross(mama: number, fama: number): ChartLineMamaCross {
  if (mama > fama) return 'bullish';
  if (mama < fama) return 'bearish';
  return 'neutral';
}

export function runLineMama(
  points: readonly ChartLineMamaPoint[] | null | undefined,
  options?: { period?: number; slowLimit?: number; fastLimit?: number },
): ChartLineMamaRun {
  const finite = getLineMamaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineMamaPeriod(
    options?.period ?? DEFAULT_CHART_LINE_MAMA_PERIOD,
    DEFAULT_CHART_LINE_MAMA_PERIOD,
  );
  const slowLimit = normalizeLineMamaLimit(
    options?.slowLimit ?? DEFAULT_CHART_LINE_MAMA_SLOW_LIMIT,
    DEFAULT_CHART_LINE_MAMA_SLOW_LIMIT,
  );
  const fastLimit = normalizeLineMamaLimit(
    options?.fastLimit ?? DEFAULT_CHART_LINE_MAMA_FAST_LIMIT,
    DEFAULT_CHART_LINE_MAMA_FAST_LIMIT,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      slowLimit,
      fastLimit,
      mama: [],
      fama: [],
      alpha: [],
      samples: [],
      mamaFinal: NaN,
      famaFinal: NaN,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const { mama, fama, alpha } = computeLineMama(
    closes,
    period,
    slowLimit,
    fastLimit,
  );

  const samples: ChartLineMamaSample[] = series.map((p, i) => {
    const m = mama[i] ?? p.value;
    const f = fama[i] ?? p.value;
    return {
      index: i,
      x: p.x,
      value: p.value,
      mama: m,
      fama: f,
      alpha: alpha[i] ?? slowLimit,
      cross: classifyCross(m, f),
    };
  });

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  for (const s of samples) {
    if (s.cross === 'bullish') bullishCount += 1;
    else if (s.cross === 'bearish') bearishCount += 1;
    else neutralCount += 1;
  }

  return {
    series = [],
    period,
    slowLimit,
    fastLimit,
    mama,
    fama,
    alpha,
    samples,
    mamaFinal: mama[n - 1] ?? NaN,
    famaFinal: fama[n - 1] ?? NaN,
    bullishCount,
    bearishCount,
    neutralCount,
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

export function computeLineMamaLayout(
  options: ComputeLineMamaLayoutOptions,
): ChartLineMamaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_MAMA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineMama(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.slowLimit)
      ? { slowLimit: options.slowLimit }
      : {}),
    ...(isFiniteNumber(options.fastLimit)
      ? { fastLimit: options.fastLimit }
      : {}),
  });

  const empty: ChartLineMamaLayout = {
    ok: false,
    width,
    height,
    panel: { x: padding, y: padding, width: 0, height: 0 },
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    pricePath: '',
    mamaPath: '',
    famaPath: '',
    priceDots: [],
    mamaMarkers: [],
    period: run.period,
    slowLimit: run.slowLimit,
    fastLimit: run.fastLimit,
    mamaFinal: NaN,
    famaFinal: NaN,
    bullishCount: 0,
    bearishCount: 0,
    neutralCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    for (const v of [s.value, s.mama, s.fama]) {
      if (v < yLo) yLo = v;
      if (v > yHi) yHi = v;
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;
  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const priceDots: ChartLineMamaDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    mama: s.mama,
    fama: s.fama,
    alpha: s.alpha,
    cross: s.cross,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const mamaMarkers: ChartLineMamaMarker[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    mama: s.mama,
    cross: s.cross,
    px: projectX(s.x),
    py: projectY(s.mama),
  }));

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    yTicks: computeTicks(yLo, yHi, tickCount).map((v) => ({
      value: v,
      py: projectY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    mamaPath: buildPath(
      run.samples.map((s) => ({
        px: projectX(s.x),
        py: projectY(s.mama),
      })),
    ),
    famaPath: buildPath(
      run.samples.map((s) => ({
        px: projectX(s.x),
        py: projectY(s.fama),
      })),
    ),
    priceDots,
    mamaMarkers,
    period: run.period,
    slowLimit: run.slowLimit,
    fastLimit: run.fastLimit,
    mamaFinal: run.mamaFinal,
    famaFinal: run.famaFinal,
    bullishCount: run.bullishCount,
    bearishCount: run.bearishCount,
    neutralCount: run.neutralCount,
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

export function describeLineMamaChart(
  data: readonly ChartLineMamaPoint[] | null | undefined,
  options?: { period?: number; slowLimit?: number; fastLimit?: number },
): string {
  const run = runLineMama(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a MESA Adaptive Moving Average overlay (period ${run.period}): the MAMA is an exponential moving average whose smoothing factor alpha adapts to the measured phase of the price cycle. The price is detrended to expose its cycle, the cycle phase is measured each bar, and when the phase advances quickly the MAMA tracks the price closely while a slow phase lets it smooth. The FAMA -- the Following Adaptive Moving Average -- trails the MAMA at half its alpha; a MAMA above its FAMA is bullish. The MAMA closes at ${defaultFormatValue(run.mamaFinal)} and is bullish on ${run.bullishCount} bars, bearish on ${run.bearishCount} across ${run.samples.length} bars.`;
}

const MAMA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineMama = forwardRef<HTMLDivElement, ChartLineMamaProps>(
  function ChartLineMama(
    props: ChartLineMamaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      slowLimit,
      fastLimit,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_MAMA_WIDTH,
      height = DEFAULT_CHART_LINE_MAMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_MAMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_MAMA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_MAMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_MAMA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_MAMA_PRICE_COLOR,
      mamaColor = DEFAULT_CHART_LINE_MAMA_MAMA_COLOR,
      famaColor = DEFAULT_CHART_LINE_MAMA_FAMA_COLOR,
      gridColor = DEFAULT_CHART_LINE_MAMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_MAMA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showMama = true,
      showFama = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a MESA Adaptive Moving Average overlay',
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
        computeLineMamaLayout({
          data,
          width,
          height,
          padding,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(slowLimit) ? { slowLimit } : {}),
          ...(isFiniteNumber(fastLimit) ? { fastLimit } : {}),
        }),
      [data, width, height, padding, tickCount, period, slowLimit, fastLimit],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineMamaChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(slowLimit) ? { slowLimit } : {}),
          ...(isFiniteNumber(fastLimit) ? { fastLimit } : {}),
        }),
      [ariaDescription, data, period, slowLimit, fastLimit],
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
          data-section="chart-line-mama"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-mama-aria-desc"
            style={MAMA_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const panel = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const mamaVisible = showMama && !hiddenSet.has('mama');
    const famaVisible = showFama && !hiddenSet.has('fama');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'mama', label: 'MAMA', color: mamaColor },
      { id: 'fama', label: 'FAMA', color: famaColor },
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
        data-section="chart-line-mama"
        data-empty="false"
        data-period={layout.period}
        data-mama-final={layout.mamaFinal}
        data-fama-final={layout.famaFinal}
        data-bullish-count={layout.bullishCount}
        data-bearish-count={layout.bearishCount}
        data-neutral-count={layout.neutralCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-mama-aria-desc"
          style={MAMA_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-mama-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-mama-badge"
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
                data-section="chart-line-mama-badge-icon"
                aria-hidden="true"
                style={{ color: mamaColor }}
              >
                MAMA
              </span>
              <span data-section="chart-line-mama-badge-config">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-mama-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-mama-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-mama-grid-line"
                    x1={panel.x}
                    x2={panel.x + panel.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-mama-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-mama-axis"
                  data-axis="y"
                  x1={panel.x}
                  y1={panel.y}
                  x2={panel.x}
                  y2={panel.y + panel.height}
                />
                <line
                  data-section="chart-line-mama-axis"
                  data-axis="x"
                  x1={panel.x}
                  y1={panel.y + panel.height}
                  x2={panel.x + panel.width}
                  y2={panel.y + panel.height}
                />
                {layout.yTicks.map((t, i) => (
                  <text
                    key={`yt-${i}`}
                    data-section="chart-line-mama-tick-label"
                    data-axis="y"
                    x={panel.x - 6}
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
                    data-section="chart-line-mama-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={panel.y + panel.height + 14}
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

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-mama-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-mama-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-mama-dot"
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

            {famaVisible && layout.famaPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="FAMA line"
                data-section="chart-line-mama-fama-line"
                d={layout.famaPath}
                fill="none"
                stroke={famaColor}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {mamaVisible && layout.mamaPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="MAMA line"
                data-section="chart-line-mama-mama-line"
                d={layout.mamaPath}
                fill="none"
                stroke={mamaColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {mamaVisible ? (
              <g data-section="chart-line-mama-markers">
                {layout.mamaMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`MAMA at x ${formatX(m.x)}: ${formatValue(m.mama)}, ${m.cross}`}
                      data-section="chart-line-mama-marker"
                      data-point-index={m.index}
                      data-mama={m.mama}
                      data-cross={m.cross}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={mamaColor}
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
                    data-section="chart-line-mama-tooltip"
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
                      minWidth: 140,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div data-section="chart-line-mama-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-mama-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-mama-tooltip-mama">
                      mama: {formatValue(d.mama)}
                    </div>
                    <div data-section="chart-line-mama-tooltip-fama">
                      fama: {formatValue(d.fama)}
                    </div>
                    <div data-section="chart-line-mama-tooltip-cross">
                      cross: {d.cross}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-mama-legend"
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
                  data-section="chart-line-mama-legend-item"
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
                    data-section="chart-line-mama-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-mama-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-mama-legend-stats"
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

ChartLineMama.displayName = 'ChartLineMama';
