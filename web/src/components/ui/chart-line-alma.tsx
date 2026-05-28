import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ALMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_ALMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_ALMA_PADDING = 40;
export const DEFAULT_CHART_LINE_ALMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ALMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ALMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ALMA_PERIOD = 9;
export const DEFAULT_CHART_LINE_ALMA_OFFSET = 0.85;
export const DEFAULT_CHART_LINE_ALMA_SIGMA = 6;
export const DEFAULT_CHART_LINE_ALMA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_ALMA_ALMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ALMA_ABOVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ALMA_BELOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ALMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ALMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineAlmaPosition = 'above' | 'below' | 'on';

export interface ChartLineAlmaPoint {
  x: number;
  value: number;
}

export interface ChartLineAlmaSample {
  index: number;
  x: number;
  value: number;
  alma: number | null;
  position: ChartLineAlmaPosition;
}

export interface ChartLineAlmaRun {
  series: ChartLineAlmaPoint[];
  period: number;
  offset: number;
  sigma: number;
  weights: number[];
  alma: (number | null)[];
  samples: ChartLineAlmaSample[];
  almaFinal: number;
  almaMin: number;
  almaMax: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineAlmaPriceDot {
  index: number;
  x: number;
  value: number;
  alma: number | null;
  position: ChartLineAlmaPosition;
  px: number;
  py: number;
}

export interface ChartLineAlmaMarker {
  index: number;
  x: number;
  alma: number;
  px: number;
  py: number;
}

export interface ChartLineAlmaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineAlmaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineAlmaPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  almaPath: string;
  priceDots: ChartLineAlmaPriceDot[];
  almaMarkers: ChartLineAlmaMarker[];
  period: number;
  offset: number;
  sigma: number;
  almaFinal: number;
  almaMin: number;
  almaMax: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineAlmaLayoutOptions {
  data: readonly ChartLineAlmaPoint[];
  period?: number;
  offset?: number;
  sigma?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineAlmaProps {
  data: readonly ChartLineAlmaPoint[];
  period?: number;
  offset?: number;
  sigma?: number;
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
  almaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAlma?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineAlmaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineAlmaFinitePoints(
  points: readonly ChartLineAlmaPoint[] | null | undefined,
): ChartLineAlmaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineAlmaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineAlmaPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

function resolveOffset(offset: number | undefined): number {
  return isFiniteNumber(offset) && offset >= 0 && offset <= 1
    ? offset
    : DEFAULT_CHART_LINE_ALMA_OFFSET;
}

function resolveSigma(sigma: number | undefined): number {
  return isFiniteNumber(sigma) && sigma > 0
    ? sigma
    : DEFAULT_CHART_LINE_ALMA_SIGMA;
}

/**
 * The Arnaud Legoux Moving Average window weights: a Gaussian curve
 * over `period` slots, centred at `offset * (period - 1)` and with
 * width `period / sigma`. An offset near 1 pushes the peak toward the
 * recent end of the window; a larger sigma narrows the curve.
 */
export function computeLineAlmaWeights(
  period: number,
  offset: number,
  sigma: number,
): number[] {
  const p = period < 1 ? 1 : Math.floor(period);
  const off = resolveOffset(offset);
  const sig = resolveSigma(sigma);
  const m = off * (p - 1);
  const s = p / sig;
  const denom = 2 * s * s;
  const weights: number[] = new Array(p);
  for (let k = 0; k < p; k += 1) {
    const d = k - m;
    weights[k] = Math.exp(-(d * d) / denom);
  }
  return weights;
}

/**
 * Arnaud Legoux's Moving Average. Each `period`-length window is
 * averaged with the Gaussian weights from `computeLineAlmaWeights`,
 * normalised by their sum -- the offset shifts the weight toward
 * recent bars to cut lag, while the Gaussian shape filters noise.
 */
export function computeLineAlma(
  values: readonly number[] | null | undefined,
  period: number,
  offset: number,
  sigma: number,
): { weights: number[]; alma: (number | null)[] } {
  if (!Array.isArray(values)) return { weights: [], alma: [] };
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const weights = computeLineAlmaWeights(p, offset, sigma);
  let weightSum = 0;
  for (let k = 0; k < p; k += 1) weightSum += weights[k]!;
  const alma: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let weighted = 0;
    for (let k = 0; k < p; k += 1) {
      weighted += weights[k]! * values[i - (p - 1) + k]!;
    }
    alma[i] = weightSum === 0 ? 0 : weighted / weightSum;
  }
  return { weights, alma };
}

function classifyPosition(
  value: number,
  alma: number | null,
): ChartLineAlmaPosition {
  if (alma === null) return 'on';
  if (value > alma) return 'above';
  if (value < alma) return 'below';
  return 'on';
}

export function runLineAlma(
  points: readonly ChartLineAlmaPoint[] | null | undefined,
  options?: { period?: number; offset?: number; sigma?: number },
): ChartLineAlmaRun {
  const finite = getLineAlmaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineAlmaPeriod(
    options?.period ?? DEFAULT_CHART_LINE_ALMA_PERIOD,
    DEFAULT_CHART_LINE_ALMA_PERIOD,
  );
  const offset = resolveOffset(options?.offset);
  const sigma = resolveSigma(options?.sigma);
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      offset,
      sigma,
      weights: computeLineAlmaWeights(period, offset, sigma),
      alma: [],
      samples: [],
      almaFinal: NaN,
      almaMin: NaN,
      almaMax: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { weights, alma } = computeLineAlma(values, period, offset, sigma);

  const samples: ChartLineAlmaSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    alma: alma[i] ?? null,
    position: classifyPosition(p.value, alma[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let almaMin = NaN;
  let almaMax = NaN;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.alma !== null) {
      if (Number.isNaN(almaMin) || s.alma < almaMin) almaMin = s.alma;
      if (Number.isNaN(almaMax) || s.alma > almaMax) almaMax = s.alma;
    }
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series = [],
    period,
    offset,
    sigma,
    weights,
    alma,
    samples,
    almaFinal: lastDefined(alma),
    almaMin,
    almaMax,
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

export function computeLineAlmaLayout(
  options: ComputeLineAlmaLayoutOptions,
): ChartLineAlmaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_ALMA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineAlmaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineAlma(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.offset) ? { offset: options.offset } : {}),
    ...(isFiniteNumber(options.sigma) ? { sigma: options.sigma } : {}),
  });
  const empty: ChartLineAlmaLayout = {
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
    almaPath: '',
    priceDots: [],
    almaMarkers: [],
    period: run.period,
    offset: run.offset,
    sigma: run.sigma,
    almaFinal: NaN,
    almaMin: NaN,
    almaMax: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineAlmaPanel = {
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
    if (s.alma !== null) {
      if (s.alma < yLo) yLo = s.alma;
      if (s.alma > yHi) yHi = s.alma;
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

  const priceDots: ChartLineAlmaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    alma: s.alma,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const almaMarkers: ChartLineAlmaMarker[] = [];
  const almaPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.alma !== null) {
      const px = projectX(s.x);
      const py = projectY(s.alma);
      almaPts.push({ px, py });
      almaMarkers.push({ index: s.index, x: s.x, alma: s.alma, px, py });
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
    almaPath: buildPath(almaPts),
    priceDots,
    almaMarkers,
    period: run.period,
    offset: run.offset,
    sigma: run.sigma,
    almaFinal: run.almaFinal,
    almaMin: run.almaMin,
    almaMax: run.almaMax,
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

export function describeLineAlmaChart(
  data: readonly ChartLineAlmaPoint[] | null | undefined,
  options?: { period?: number; offset?: number; sigma?: number },
): string {
  const run = runLineAlma(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with an Arnaud Legoux Moving Average (ALMA) overlay (period ${run.period}, offset ${run.offset}, sigma ${run.sigma}): the ALMA weights each window with a Gaussian curve offset toward the recent end, cutting lag while filtering noise. The price runs above the ALMA on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const ALMA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineAlma = forwardRef<HTMLDivElement, ChartLineAlmaProps>(
  function ChartLineAlma(
    props: ChartLineAlmaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      offset,
      sigma,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_ALMA_WIDTH,
      height = DEFAULT_CHART_LINE_ALMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_ALMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_ALMA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_ALMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_ALMA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_ALMA_PRICE_COLOR,
      almaColor = DEFAULT_CHART_LINE_ALMA_ALMA_COLOR,
      gridColor = DEFAULT_CHART_LINE_ALMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_ALMA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showAlma = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with an Arnaud Legoux Moving Average overlay',
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
        computeLineAlmaLayout({
          data,
          width,
          height,
          padding,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(offset) ? { offset } : {}),
          ...(isFiniteNumber(sigma) ? { sigma } : {}),
        }),
      [data, width, height, padding, tickCount, period, offset, sigma],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineAlmaChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(offset) ? { offset } : {}),
          ...(isFiniteNumber(sigma) ? { sigma } : {}),
        }),
      [ariaDescription, data, period, offset, sigma],
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
          data-section="chart-line-alma"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-alma-aria-desc"
            style={ALMA_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const almaVisible = showAlma && !hiddenSet.has('alma');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'alma', label: 'ALMA', color: almaColor },
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
        data-section="chart-line-alma"
        data-empty="false"
        data-period={layout.period}
        data-offset={layout.offset}
        data-sigma={layout.sigma}
        data-alma-final={layout.almaFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-alma-aria-desc"
          style={ALMA_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-alma-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-alma-badge"
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
                data-section="chart-line-alma-badge-icon"
                aria-hidden="true"
                style={{ color: almaColor }}
              >
                ALMA
              </span>
              <span data-section="chart-line-alma-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-alma-badge-shape">
                o={layout.offset}/s={layout.sigma}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-alma-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-alma-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-alma-grid-line"
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
                data-section="chart-line-alma-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-alma-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-alma-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-alma-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-alma-tick-label"
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
                    data-section="chart-line-alma-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-alma-tick-label"
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
                data-section="chart-line-alma-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-alma-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-alma-dot"
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

            {almaVisible && layout.almaPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Arnaud Legoux Moving Average line"
                data-section="chart-line-alma-alma-line"
                d={layout.almaPath}
                fill="none"
                stroke={almaColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {almaVisible ? (
              <g data-section="chart-line-alma-markers">
                {layout.almaMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`ALMA at x ${formatX(m.x)}: ${formatValue(m.alma)}`}
                      data-section="chart-line-alma-marker"
                      data-point-index={m.index}
                      data-alma={m.alma}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={almaColor}
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
                    data-section="chart-line-alma-tooltip"
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
                    <div data-section="chart-line-alma-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-alma-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-alma-tooltip-alma">
                      alma: {d.alma === null ? 'n/a' : formatValue(d.alma)}
                    </div>
                    <div data-section="chart-line-alma-tooltip-position">
                      position: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-alma-legend"
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
                  data-section="chart-line-alma-legend-item"
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
                    data-section="chart-line-alma-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-alma-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-alma-legend-stats"
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

ChartLineAlma.displayName = 'ChartLineAlma';
