import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_FRAMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_FRAMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_FRAMA_PADDING = 40;
export const DEFAULT_CHART_LINE_FRAMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FRAMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_FRAMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FRAMA_PERIOD = 16;
export const DEFAULT_CHART_LINE_FRAMA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_FRAMA_FRAMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_FRAMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_FRAMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineFramaPosition = 'above' | 'below' | 'on';

export interface ChartLineFramaPoint {
  x: number;
  value: number;
}

export interface ChartLineFramaSample {
  index: number;
  x: number;
  value: number;
  dimension: number | null;
  alpha: number | null;
  frama: number | null;
  position: ChartLineFramaPosition;
}

export interface ChartLineFramaRun {
  series: ChartLineFramaPoint[];
  period: number;
  dimension: (number | null)[];
  alpha: (number | null)[];
  frama: (number | null)[];
  samples: ChartLineFramaSample[];
  framaFinal: number;
  framaMin: number;
  framaMax: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineFramaPriceDot {
  index: number;
  x: number;
  value: number;
  dimension: number | null;
  alpha: number | null;
  frama: number | null;
  position: ChartLineFramaPosition;
  px: number;
  py: number;
}

export interface ChartLineFramaMarker {
  index: number;
  x: number;
  frama: number;
  px: number;
  py: number;
}

export interface ChartLineFramaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineFramaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineFramaPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  framaPath: string;
  priceDots: ChartLineFramaPriceDot[];
  framaMarkers: ChartLineFramaMarker[];
  period: number;
  framaFinal: number;
  framaMin: number;
  framaMax: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineFramaLayoutOptions {
  data: readonly ChartLineFramaPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineFramaProps {
  data: readonly ChartLineFramaPoint[];
  period?: number;
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
  framaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFrama?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineFramaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineFramaFinitePoints(
  points: readonly ChartLineFramaPoint[] | null | undefined,
): ChartLineFramaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineFramaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to an even positive integer of at least 2 -- the
 * FRAMA window must be even so it can split cleanly into two halves.
 * A non-finite or sub-2 value falls back to `fallback`; a fractional
 * value is floored and an odd value is rounded down to even.
 */
export function normalizeLineFramaPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  let p = Math.floor(period);
  if (p < 2) return fallback;
  if (p % 2 === 1) p -= 1;
  return p;
}

function evenPeriod(period: number): number {
  let p = isFiniteNumber(period) ? Math.floor(period) : 2;
  if (p < 2) p = 2;
  if (p % 2 === 1) p -= 1;
  if (p < 2) p = 2;
  return p;
}

/**
 * The fractal dimension of the price over each trailing window of
 * `period` bars. The window is split into two halves; the dimension
 * compares the price range of each half against the range of the
 * whole: `D = (log(N1 + N2) - log(N3)) / log(2)`, where N1, N2 and
 * N3 are the per-bar normalized ranges of the first half, the second
 * half and the whole window. The dimension runs near 1 for a smooth
 * trend and near 2 for a jagged choppy market; it is clamped to
 * [1, 2] and a flat window reads 1. Defined from index `period - 1`.
 */
export function computeLineFramaDimension(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = evenPeriod(period);
  const half = p / 2;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    const start = i - p + 1;
    let h1 = Number.NEGATIVE_INFINITY;
    let l1 = Number.POSITIVE_INFINITY;
    let h2 = Number.NEGATIVE_INFINITY;
    let l2 = Number.POSITIVE_INFINITY;
    let h3 = Number.NEGATIVE_INFINITY;
    let l3 = Number.POSITIVE_INFINITY;
    for (let j = start; j <= i; j += 1) {
      const v = values[j]!;
      if (v > h3) h3 = v;
      if (v < l3) l3 = v;
      if (j < start + half) {
        if (v > h1) h1 = v;
        if (v < l1) l1 = v;
      } else {
        if (v > h2) h2 = v;
        if (v < l2) l2 = v;
      }
    }
    const n1 = (h1 - l1) / half;
    const n2 = (h2 - l2) / half;
    const n3 = (h3 - l3) / p;
    let d = 1;
    if (n1 + n2 > 0 && n3 > 0) {
      d = (Math.log(n1 + n2) - Math.log(n3)) / Math.LN2;
    }
    if (d < 1) d = 1;
    if (d > 2) d = 2;
    out[i] = d;
  }
  return out;
}

/**
 * John Ehlers' Fractal Adaptive Moving Average. The price's fractal
 * dimension `D` drives an adaptive exponential smoothing constant
 * `alpha = exp(-4.6 * (D - 1))` clamped to [0.01, 1]: a smooth trend
 * (`D` near 1) pushes alpha toward 1 so the average tracks the price
 * closely, while a jagged choppy market (`D` near 2) pushes alpha
 * toward 0.01 so the average barely moves. The FRAMA folds each bar
 * in at its own alpha: `FRAMA[i] = alpha*value[i] +
 * (1 - alpha)*FRAMA[i-1]`. It is seeded at index `period - 1` with
 * that bar's price and is recursive from index `period` onward.
 */
export function computeLineFrama(
  values: readonly number[] | null | undefined,
  period: number,
): {
  dimension: (number | null)[];
  alpha: (number | null)[];
  frama: (number | null)[];
} {
  if (!Array.isArray(values)) {
    return { dimension: [], alpha: [], frama: [] };
  }
  const n = values.length;
  const dimension = computeLineFramaDimension(values, period);
  const alpha: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const d = dimension[i];
    if (isDefined(d)) {
      let a = Math.exp(-4.6 * (d - 1));
      if (a < 0.01) a = 0.01;
      if (a > 1) a = 1;
      alpha[i] = a;
    }
  }
  const frama: (number | null)[] = new Array(n).fill(null);
  let firstIdx = -1;
  for (let i = 0; i < n; i += 1) {
    if (isDefined(dimension[i])) {
      firstIdx = i;
      break;
    }
  }
  if (firstIdx >= 0) {
    frama[firstIdx] = values[firstIdx]!;
    for (let i = firstIdx + 1; i < n; i += 1) {
      const a = alpha[i] ?? 1;
      const prev = frama[i - 1] as number;
      const raw = a * values[i]! + (1 - a) * prev;
      frama[i] = raw === 0 ? 0 : raw;
    }
  }
  return { dimension, alpha, frama };
}

function classifyPosition(
  value: number,
  frama: number | null,
): ChartLineFramaPosition {
  if (frama === null) return 'on';
  if (value > frama) return 'above';
  if (value < frama) return 'below';
  return 'on';
}

export function runLineFrama(
  points: readonly ChartLineFramaPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineFramaRun {
  const finite = getLineFramaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineFramaPeriod(
    options?.period ?? DEFAULT_CHART_LINE_FRAMA_PERIOD,
    DEFAULT_CHART_LINE_FRAMA_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      dimension: [],
      alpha: [],
      frama: [],
      samples: [],
      framaFinal: NaN,
      framaMin: NaN,
      framaMax: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { dimension, alpha, frama } = computeLineFrama(values, period);

  const samples: ChartLineFramaSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    dimension: dimension[i] ?? null,
    alpha: alpha[i] ?? null,
    frama: frama[i] ?? null,
    position: classifyPosition(p.value, frama[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let framaMin = NaN;
  let framaMax = NaN;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.frama !== null) {
      if (Number.isNaN(framaMin) || s.frama < framaMin) framaMin = s.frama;
      if (Number.isNaN(framaMax) || s.frama > framaMax) framaMax = s.frama;
    }
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series = [],
    period,
    dimension,
    alpha,
    frama,
    samples,
    framaFinal: lastDefined(frama),
    framaMin,
    framaMax,
    aboveCount,
    belowCount,
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

export function computeLineFramaLayout(
  options: ComputeLineFramaLayoutOptions,
): ChartLineFramaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_FRAMA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineFramaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineFrama(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineFramaLayout = {
    ok: false,
    width,
    height,
    panel: emptyPanel,
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    pricePath: '',
    framaPath: '',
    priceDots: [],
    framaMarkers: [],
    period: run.period,
    framaFinal: NaN,
    framaMin: NaN,
    framaMax: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineFramaPanel = {
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
    if (s.value < yLo) yLo = s.value;
    if (s.value > yHi) yHi = s.value;
    if (s.frama !== null) {
      if (s.frama < yLo) yLo = s.frama;
      if (s.frama > yHi) yHi = s.frama;
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

  const priceDots: ChartLineFramaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    dimension: s.dimension,
    alpha: s.alpha,
    frama: s.frama,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const framaMarkers: ChartLineFramaMarker[] = [];
  const framaPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.frama !== null) {
      const px = projectX(s.x);
      const py = projectY(s.frama);
      framaPts.push({ px, py });
      framaMarkers.push({ index: s.index, x: s.x, frama: s.frama, px, py });
    }
  }

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
    framaPath: buildPath(framaPts),
    priceDots,
    framaMarkers,
    period: run.period,
    framaFinal: run.framaFinal,
    framaMin: run.framaMin,
    framaMax: run.framaMax,
    aboveCount: run.aboveCount,
    belowCount: run.belowCount,
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

export function describeLineFramaChart(
  data: readonly ChartLineFramaPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineFrama(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Fractal Adaptive Moving Average (FRAMA) overlay (period ${run.period}): the FRAMA is an adaptive moving average whose smoothing tracks the fractal dimension of the price. The dimension is read from how the price range over the window compares to the ranges of its two halves -- it runs near 1 for a smooth trend and near 2 for a jagged choppy market. A low dimension makes the average track the price closely; a high dimension slows it almost to a halt. The price runs above the FRAMA on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const FRAMA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineFrama = forwardRef<HTMLDivElement, ChartLineFramaProps>(
  function ChartLineFrama(
    props: ChartLineFramaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_FRAMA_WIDTH,
      height = DEFAULT_CHART_LINE_FRAMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_FRAMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_FRAMA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_FRAMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_FRAMA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_FRAMA_PRICE_COLOR,
      framaColor = DEFAULT_CHART_LINE_FRAMA_FRAMA_COLOR,
      gridColor = DEFAULT_CHART_LINE_FRAMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_FRAMA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showFrama = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Fractal Adaptive Moving Average overlay',
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
        computeLineFramaLayout({
          data,
          width,
          height,
          padding,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
        }),
      [data, width, height, padding, tickCount, period],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineFramaChart(data, {
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
          data-section="chart-line-frama"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-frama-aria-desc"
            style={FRAMA_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const framaVisible = showFrama && !hiddenSet.has('frama');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'frama', label: 'FRAMA', color: framaColor },
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
        data-section="chart-line-frama"
        data-empty="false"
        data-period={layout.period}
        data-frama-final={layout.framaFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-frama-aria-desc"
          style={FRAMA_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-frama-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-frama-badge"
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
                data-section="chart-line-frama-badge-icon"
                aria-hidden="true"
                style={{ color: framaColor }}
              >
                FRAMA
              </span>
              <span data-section="chart-line-frama-badge-period">
                p={layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-frama-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-frama-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-frama-grid-line"
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
                data-section="chart-line-frama-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-frama-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-frama-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-frama-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-frama-tick-label"
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
                  </g>
                ))}
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`xt-${i}`}
                    data-section="chart-line-frama-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-frama-tick-label"
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
                  </g>
                ))}
              </g>
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-frama-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-frama-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-frama-dot"
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

            {framaVisible && layout.framaPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Fractal Adaptive Moving Average line"
                data-section="chart-line-frama-frama-line"
                d={layout.framaPath}
                fill="none"
                stroke={framaColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {framaVisible ? (
              <g data-section="chart-line-frama-markers">
                {layout.framaMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`FRAMA at x ${formatX(m.x)}: ${formatValue(m.frama)}`}
                      data-section="chart-line-frama-marker"
                      data-point-index={m.index}
                      data-frama={m.frama}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={framaColor}
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
                    data-section="chart-line-frama-tooltip"
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
                    <div data-section="chart-line-frama-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-frama-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-frama-tooltip-frama">
                      frama: {d.frama === null ? 'n/a' : formatValue(d.frama)}
                    </div>
                    <div data-section="chart-line-frama-tooltip-dimension">
                      dimension:{' '}
                      {d.dimension === null ? 'n/a' : formatValue(d.dimension)}
                    </div>
                    <div data-section="chart-line-frama-tooltip-position">
                      position: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-frama-legend"
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
                  data-section="chart-line-frama-legend-item"
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
                    data-section="chart-line-frama-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-frama-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-frama-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.aboveCount} above, {layout.belowCount} below
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineFrama.displayName = 'ChartLineFrama';
