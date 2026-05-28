import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_HMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_HMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_HMA_PADDING = 40;
export const DEFAULT_CHART_LINE_HMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HMA_PERIOD = 16;
export const DEFAULT_CHART_LINE_HMA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_HMA_HMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_HMA_ABOVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HMA_BELOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_HMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineHmaPosition = 'above' | 'below' | 'on';

export interface ChartLineHmaPoint {
  x: number;
  value: number;
}

export interface ChartLineHmaSample {
  index: number;
  x: number;
  value: number;
  hma: number | null;
  position: ChartLineHmaPosition;
}

export interface ChartLineHmaRun {
  series: ChartLineHmaPoint[];
  period: number;
  halfPeriod: number;
  sqrtPeriod: number;
  wmaHalf: (number | null)[];
  wmaFull: (number | null)[];
  raw: (number | null)[];
  hma: (number | null)[];
  samples: ChartLineHmaSample[];
  hmaFinal: number;
  hmaMin: number;
  hmaMax: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineHmaPriceDot {
  index: number;
  x: number;
  value: number;
  hma: number | null;
  position: ChartLineHmaPosition;
  px: number;
  py: number;
}

export interface ChartLineHmaMarker {
  index: number;
  x: number;
  hma: number;
  px: number;
  py: number;
}

export interface ChartLineHmaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineHmaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineHmaPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  hmaPath: string;
  priceDots: ChartLineHmaPriceDot[];
  hmaMarkers: ChartLineHmaMarker[];
  period: number;
  halfPeriod: number;
  sqrtPeriod: number;
  hmaFinal: number;
  hmaMin: number;
  hmaMax: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineHmaLayoutOptions {
  data: readonly ChartLineHmaPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineHmaProps {
  data: readonly ChartLineHmaPoint[];
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
  hmaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showHma?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineHmaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineHmaFinitePoints(
  points: readonly ChartLineHmaPoint[] | null | undefined,
): ChartLineHmaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineHmaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineHmaPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * A linearly weighted moving average over `period` values: the oldest
 * value in the window carries weight 1, the newest weight `period`,
 * divided by the triangular weight sum. Tolerates leading `null`
 * placeholders -- any window touching a null reads null.
 */
export function computeLineHmaWma(
  src: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  const weightSum = (p * (p + 1)) / 2;
  for (let i = p - 1; i < n; i += 1) {
    let weighted = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const v = src[i - p + 1 + k];
      if (!isDefined(v)) {
        valid = false;
        break;
      }
      weighted += (k + 1) * v;
    }
    if (valid) out[i] = weighted / weightSum;
  }
  return out;
}

/**
 * Alan Hull's Hull Moving Average. The lag-reduced raw line is
 * `2 * WMA(period / 2) - WMA(period)`, and the HMA is a
 * square-root-length weighted moving average of that raw line --
 * cutting lag while staying smooth.
 */
export function computeLineHma(
  values: readonly number[] | null | undefined,
  period: number,
): {
  wmaHalf: (number | null)[];
  wmaFull: (number | null)[];
  raw: (number | null)[];
  hma: (number | null)[];
} {
  if (!Array.isArray(values)) {
    return { wmaHalf: [], wmaFull: [], raw: [], hma: [] };
  }
  const n = values.length;
  const fullPeriod = period < 1 ? 1 : Math.floor(period);
  const halfPeriod = Math.max(1, Math.floor(fullPeriod / 2));
  const sqrtPeriod = Math.max(1, Math.floor(Math.sqrt(fullPeriod)));
  const wmaHalf = computeLineHmaWma(values, halfPeriod);
  const wmaFull = computeLineHmaWma(values, fullPeriod);
  const raw: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const h = wmaHalf[i];
    const f = wmaFull[i];
    if (isDefined(h) && isDefined(f)) {
      raw[i] = 2 * h - f;
    }
  }
  const hma = computeLineHmaWma(raw, sqrtPeriod);
  return { wmaHalf, wmaFull, raw, hma };
}

function classifyPosition(
  value: number,
  hma: number | null,
): ChartLineHmaPosition {
  if (hma === null) return 'on';
  if (value > hma) return 'above';
  if (value < hma) return 'below';
  return 'on';
}

export function runLineHma(
  points: readonly ChartLineHmaPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineHmaRun {
  const finite = getLineHmaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineHmaPeriod(
    options?.period ?? DEFAULT_CHART_LINE_HMA_PERIOD,
    DEFAULT_CHART_LINE_HMA_PERIOD,
  );
  const halfPeriod = Math.max(1, Math.floor(period / 2));
  const sqrtPeriod = Math.max(1, Math.floor(Math.sqrt(period)));
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      halfPeriod,
      sqrtPeriod,
      wmaHalf: [],
      wmaFull: [],
      raw: [],
      hma: [],
      samples: [],
      hmaFinal: NaN,
      hmaMin: NaN,
      hmaMax: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { wmaHalf, wmaFull, raw, hma } = computeLineHma(values, period);

  const samples: ChartLineHmaSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    hma: hma[i] ?? null,
    position: classifyPosition(p.value, hma[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let hmaMin = NaN;
  let hmaMax = NaN;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.hma !== null) {
      if (Number.isNaN(hmaMin) || s.hma < hmaMin) hmaMin = s.hma;
      if (Number.isNaN(hmaMax) || s.hma > hmaMax) hmaMax = s.hma;
    }
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series = [],
    period,
    halfPeriod,
    sqrtPeriod,
    wmaHalf,
    wmaFull,
    raw,
    hma,
    samples,
    hmaFinal: lastDefined(hma),
    hmaMin,
    hmaMax,
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

export function computeLineHmaLayout(
  options: ComputeLineHmaLayoutOptions,
): ChartLineHmaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_HMA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineHmaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineHma(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineHmaLayout = {
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
    hmaPath: '',
    priceDots: [],
    hmaMarkers: [],
    period: run.period,
    halfPeriod: run.halfPeriod,
    sqrtPeriod: run.sqrtPeriod,
    hmaFinal: NaN,
    hmaMin: NaN,
    hmaMax: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineHmaPanel = {
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
    if (s.hma !== null) {
      if (s.hma < yLo) yLo = s.hma;
      if (s.hma > yHi) yHi = s.hma;
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

  const priceDots: ChartLineHmaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    hma: s.hma,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const hmaMarkers: ChartLineHmaMarker[] = [];
  const hmaPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.hma !== null) {
      const px = projectX(s.x);
      const py = projectY(s.hma);
      hmaPts.push({ px, py });
      hmaMarkers.push({ index: s.index, x: s.x, hma: s.hma, px, py });
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
    hmaPath: buildPath(hmaPts),
    priceDots,
    hmaMarkers,
    period: run.period,
    halfPeriod: run.halfPeriod,
    sqrtPeriod: run.sqrtPeriod,
    hmaFinal: run.hmaFinal,
    hmaMin: run.hmaMin,
    hmaMax: run.hmaMax,
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

export function describeLineHmaChart(
  data: readonly ChartLineHmaPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineHma(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Hull Moving Average (HMA) overlay (period ${run.period}): the HMA blends a half-length and a full-length weighted moving average and smooths the result with a square-root-length weighted moving average, cutting lag while staying smooth. The price runs above the HMA on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const HMA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineHma = forwardRef<HTMLDivElement, ChartLineHmaProps>(
  function ChartLineHma(
    props: ChartLineHmaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_HMA_WIDTH,
      height = DEFAULT_CHART_LINE_HMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_HMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_HMA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_HMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_HMA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_HMA_PRICE_COLOR,
      hmaColor = DEFAULT_CHART_LINE_HMA_HMA_COLOR,
      gridColor = DEFAULT_CHART_LINE_HMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_HMA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showHma = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Hull Moving Average overlay',
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
        computeLineHmaLayout({
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
        describeLineHmaChart(data, {
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
          data-section="chart-line-hma"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-hma-aria-desc"
            style={HMA_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const hmaVisible = showHma && !hiddenSet.has('hma');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'hma', label: 'HMA', color: hmaColor },
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
        data-section="chart-line-hma"
        data-empty="false"
        data-period={layout.period}
        data-half-period={layout.halfPeriod}
        data-sqrt-period={layout.sqrtPeriod}
        data-hma-final={layout.hmaFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-hma-aria-desc"
          style={HMA_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-hma-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-hma-badge"
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
                data-section="chart-line-hma-badge-icon"
                aria-hidden="true"
                style={{ color: hmaColor }}
              >
                HMA
              </span>
              <span data-section="chart-line-hma-badge-period">
                p={layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-hma-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-hma-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-hma-grid-line"
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
                data-section="chart-line-hma-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-hma-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-hma-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-hma-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-hma-tick-label"
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
                    data-section="chart-line-hma-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-hma-tick-label"
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
                data-section="chart-line-hma-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-hma-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-hma-dot"
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

            {hmaVisible && layout.hmaPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Hull Moving Average line"
                data-section="chart-line-hma-hma-line"
                d={layout.hmaPath}
                fill="none"
                stroke={hmaColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {hmaVisible ? (
              <g data-section="chart-line-hma-markers">
                {layout.hmaMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`HMA at x ${formatX(m.x)}: ${formatValue(m.hma)}`}
                      data-section="chart-line-hma-marker"
                      data-point-index={m.index}
                      data-hma={m.hma}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={hmaColor}
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
                    data-section="chart-line-hma-tooltip"
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
                    <div data-section="chart-line-hma-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-hma-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-hma-tooltip-hma">
                      hma: {d.hma === null ? 'n/a' : formatValue(d.hma)}
                    </div>
                    <div data-section="chart-line-hma-tooltip-position">
                      position: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-hma-legend"
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
                  data-section="chart-line-hma-legend-item"
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
                    data-section="chart-line-hma-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-hma-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-hma-legend-stats"
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

ChartLineHma.displayName = 'ChartLineHma';
