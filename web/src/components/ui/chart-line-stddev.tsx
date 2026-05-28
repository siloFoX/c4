import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_STDDEV_WIDTH = 560;
export const DEFAULT_CHART_LINE_STDDEV_HEIGHT = 320;
export const DEFAULT_CHART_LINE_STDDEV_PADDING = 40;
export const DEFAULT_CHART_LINE_STDDEV_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STDDEV_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STDDEV_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STDDEV_PERIOD = 20;
export const DEFAULT_CHART_LINE_STDDEV_MULTIPLIER = 2;
export const DEFAULT_CHART_LINE_STDDEV_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_STDDEV_BASIS_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STDDEV_BAND_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_STDDEV_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_STDDEV_AXIS_COLOR = '#cbd5e1';

export type ChartLineStdDevPosition = 'above' | 'below' | 'on';

export interface ChartLineStdDevPoint {
  x: number;
  value: number;
}

export interface ChartLineStdDevSample {
  index: number;
  x: number;
  value: number;
  basis: number | null;
  stddev: number | null;
  upper: number | null;
  lower: number | null;
  position: ChartLineStdDevPosition;
}

export interface ChartLineStdDevRun {
  series: ChartLineStdDevPoint[];
  period: number;
  multiplier: number;
  basis: (number | null)[];
  stddev: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
  samples: ChartLineStdDevSample[];
  basisFinal: number;
  upperFinal: number;
  lowerFinal: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineStdDevPriceDot {
  index: number;
  x: number;
  value: number;
  basis: number | null;
  upper: number | null;
  lower: number | null;
  position: ChartLineStdDevPosition;
  px: number;
  py: number;
}

export interface ChartLineStdDevMarker {
  index: number;
  x: number;
  basis: number;
  px: number;
  py: number;
}

export interface ChartLineStdDevPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineStdDevLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineStdDevPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  basisPath: string;
  upperPath: string;
  lowerPath: string;
  bandAreaPath: string;
  priceDots: ChartLineStdDevPriceDot[];
  basisMarkers: ChartLineStdDevMarker[];
  period: number;
  multiplier: number;
  basisFinal: number;
  upperFinal: number;
  lowerFinal: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineStdDevLayoutOptions {
  data: readonly ChartLineStdDevPoint[];
  period?: number;
  multiplier?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineStdDevProps {
  data: readonly ChartLineStdDevPoint[];
  period?: number;
  multiplier?: number;
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
  basisColor?: string;
  bandColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBasis?: boolean;
  showBands?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineStdDevPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineStdDevFinitePoints(
  points: readonly ChartLineStdDevPoint[] | null | undefined,
): ChartLineStdDevPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineStdDevPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineStdDevPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Coerce a band multiplier to a positive finite number. A
 * non-finite or non-positive value falls back to `fallback`.
 */
export function normalizeLineStdDevMultiplier(
  multiplier: number,
  fallback: number,
): number {
  if (isFiniteNumber(multiplier) && multiplier > 0) return multiplier;
  return fallback;
}

/**
 * The basis line -- the `period`-bar simple moving average. Null
 * through the warm-up; defined from index `period - 1` onward.
 */
export function computeLineStdDevBasis(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p) return out;
  for (let i = p - 1; i < n; i += 1) {
    let sum = 0;
    for (let k = 0; k < p; k += 1) sum += values[i - k]!;
    out[i] = sum / p;
  }
  return out;
}

/**
 * The rolling population standard deviation over a `period`-bar
 * window: `sqrt(mean of (value - mean)^2)`. Null through the
 * warm-up. A flat window reports zero.
 */
export function computeLineStdDev(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p) return out;
  const basis = computeLineStdDevBasis(values, period);
  for (let i = p - 1; i < n; i += 1) {
    const mean = basis[i];
    if (!isDefined(mean)) continue;
    let sq = 0;
    for (let k = 0; k < p; k += 1) {
      const d = values[i - k]! - mean;
      sq += d * d;
    }
    out[i] = Math.sqrt(sq / p);
  }
  return out;
}

function classifyPosition(
  value: number,
  basis: number | null,
): ChartLineStdDevPosition {
  if (basis === null) return 'on';
  if (value > basis) return 'above';
  if (value < basis) return 'below';
  return 'on';
}

export function runLineStdDev(
  points: readonly ChartLineStdDevPoint[] | null | undefined,
  options?: { period?: number; multiplier?: number },
): ChartLineStdDevRun {
  const finite = getLineStdDevFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineStdDevPeriod(
    options?.period ?? DEFAULT_CHART_LINE_STDDEV_PERIOD,
    DEFAULT_CHART_LINE_STDDEV_PERIOD,
  );
  const multiplier = normalizeLineStdDevMultiplier(
    options?.multiplier ?? DEFAULT_CHART_LINE_STDDEV_MULTIPLIER,
    DEFAULT_CHART_LINE_STDDEV_MULTIPLIER,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      multiplier,
      basis: [],
      stddev: [],
      upper: [],
      lower: [],
      samples: [],
      basisFinal: NaN,
      upperFinal: NaN,
      lowerFinal: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const basis = computeLineStdDevBasis(values, period);
  const stddev = computeLineStdDev(values, period);
  const upper: (number | null)[] = basis.map((b, i) =>
    b === null || stddev[i] === null ? null : b + multiplier * stddev[i]!,
  );
  const lower: (number | null)[] = basis.map((b, i) =>
    b === null || stddev[i] === null ? null : b - multiplier * stddev[i]!,
  );

  const samples: ChartLineStdDevSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    basis: basis[i] ?? null,
    stddev: stddev[i] ?? null,
    upper: upper[i] ?? null,
    lower: lower[i] ?? null,
    position: classifyPosition(p.value, basis[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series = [],
    period,
    multiplier,
    basis,
    stddev,
    upper,
    lower,
    samples,
    basisFinal: lastDefined(basis),
    upperFinal: lastDefined(upper),
    lowerFinal: lastDefined(lower),
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

export function computeLineStdDevLayout(
  options: ComputeLineStdDevLayoutOptions,
): ChartLineStdDevLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_STDDEV_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineStdDevPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineStdDev(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.multiplier)
      ? { multiplier: options.multiplier }
      : {}),
  });
  const empty: ChartLineStdDevLayout = {
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
    basisPath: '',
    upperPath: '',
    lowerPath: '',
    bandAreaPath: '',
    priceDots: [],
    basisMarkers: [],
    period: run.period,
    multiplier: run.multiplier,
    basisFinal: NaN,
    upperFinal: NaN,
    lowerFinal: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineStdDevPanel = {
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
    if (s.upper !== null && s.upper > yHi) yHi = s.upper;
    if (s.lower !== null && s.lower < yLo) yLo = s.lower;
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

  const priceDots: ChartLineStdDevPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    basis: s.basis,
    upper: s.upper,
    lower: s.lower,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const basisMarkers: ChartLineStdDevMarker[] = [];
  const basisPts: { px: number; py: number }[] = [];
  const upperPts: { px: number; py: number }[] = [];
  const lowerPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.basis !== null) {
      const px = projectX(s.x);
      basisPts.push({ px, py: projectY(s.basis) });
      basisMarkers.push({
        index: s.index,
        x: s.x,
        basis: s.basis,
        px,
        py: projectY(s.basis),
      });
    }
    if (s.upper !== null) upperPts.push({ px: projectX(s.x), py: projectY(s.upper) });
    if (s.lower !== null) lowerPts.push({ px: projectX(s.x), py: projectY(s.lower) });
  }

  let bandAreaPath = '';
  if (upperPts.length > 0 && upperPts.length === lowerPts.length) {
    const forward = upperPts
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`,
      )
      .join(' ');
    const back = [...lowerPts]
      .reverse()
      .map((p) => `L ${p.px.toFixed(3)} ${p.py.toFixed(3)}`)
      .join(' ');
    bandAreaPath = `${forward} ${back} Z`;
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
    basisPath: buildPath(basisPts),
    upperPath: buildPath(upperPts),
    lowerPath: buildPath(lowerPts),
    bandAreaPath,
    priceDots,
    basisMarkers,
    period: run.period,
    multiplier: run.multiplier,
    basisFinal: run.basisFinal,
    upperFinal: run.upperFinal,
    lowerFinal: run.lowerFinal,
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

export function describeLineStdDevChart(
  data: readonly ChartLineStdDevPoint[] | null | undefined,
  options?: { period?: number; multiplier?: number },
): string {
  const run = runLineStdDev(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a rolling standard deviation band (period ${run.period}, multiplier ${defaultFormatValue(run.multiplier)}): the basis is the ${run.period}-bar simple moving average; the band edges sit ${defaultFormatValue(run.multiplier)} population standard deviations above and below it, so the band widens when the price turns volatile and tightens when it settles. The price runs above the basis on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const STDDEV_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineStdDev = forwardRef<HTMLDivElement, ChartLineStdDevProps>(
  function ChartLineStdDev(
    props: ChartLineStdDevProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      multiplier,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_STDDEV_WIDTH,
      height = DEFAULT_CHART_LINE_STDDEV_HEIGHT,
      padding = DEFAULT_CHART_LINE_STDDEV_PADDING,
      tickCount = DEFAULT_CHART_LINE_STDDEV_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_STDDEV_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_STDDEV_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_STDDEV_PRICE_COLOR,
      basisColor = DEFAULT_CHART_LINE_STDDEV_BASIS_COLOR,
      bandColor = DEFAULT_CHART_LINE_STDDEV_BAND_COLOR,
      gridColor = DEFAULT_CHART_LINE_STDDEV_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_STDDEV_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showBasis = true,
      showBands = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a rolling standard deviation band',
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
        computeLineStdDevLayout({
          data,
          width,
          height,
          padding,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(multiplier) ? { multiplier } : {}),
        }),
      [data, width, height, padding, tickCount, period, multiplier],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineStdDevChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(multiplier) ? { multiplier } : {}),
        }),
      [ariaDescription, data, period, multiplier],
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
          data-section="chart-line-stddev"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-stddev-aria-desc"
            style={STDDEV_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const basisVisible = showBasis && !hiddenSet.has('basis');
    const bandVisible = showBands && !hiddenSet.has('band');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'basis', label: 'Basis', color: basisColor },
      { id: 'band', label: 'Std dev band', color: bandColor },
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
        data-section="chart-line-stddev"
        data-empty="false"
        data-period={layout.period}
        data-multiplier={layout.multiplier}
        data-basis-final={layout.basisFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-stddev-aria-desc"
          style={STDDEV_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-stddev-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-stddev-badge"
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
                data-section="chart-line-stddev-badge-icon"
                aria-hidden="true"
                style={{ color: bandColor }}
              >
                STDDEV
              </span>
              <span data-section="chart-line-stddev-badge-config">
                {layout.period}/{formatValue(layout.multiplier)}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-stddev-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-stddev-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-stddev-grid-line"
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
                data-section="chart-line-stddev-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-stddev-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-stddev-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-stddev-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-stddev-tick-label"
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
                    data-section="chart-line-stddev-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-stddev-tick-label"
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

            {bandVisible && layout.bandAreaPath ? (
              <path
                data-section="chart-line-stddev-band-area"
                d={layout.bandAreaPath}
                fill={bandColor}
                fillOpacity={0.12}
                stroke="none"
              />
            ) : null}

            {bandVisible && layout.upperPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Upper standard deviation band"
                data-section="chart-line-stddev-upper-line"
                d={layout.upperPath}
                fill="none"
                stroke={bandColor}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {bandVisible && layout.lowerPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Lower standard deviation band"
                data-section="chart-line-stddev-lower-line"
                d={layout.lowerPath}
                fill="none"
                stroke={bandColor}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {basisVisible && layout.basisPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Basis moving average line"
                data-section="chart-line-stddev-basis-line"
                d={layout.basisPath}
                fill="none"
                stroke={basisColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-stddev-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-stddev-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-stddev-dot"
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

            {basisVisible ? (
              <g data-section="chart-line-stddev-markers">
                {layout.basisMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Basis at x ${formatX(m.x)}: ${formatValue(m.basis)}`}
                      data-section="chart-line-stddev-marker"
                      data-point-index={m.index}
                      data-basis={m.basis}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={basisColor}
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
                    data-section="chart-line-stddev-tooltip"
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
                    <div data-section="chart-line-stddev-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-stddev-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-stddev-tooltip-basis">
                      basis: {d.basis === null ? 'n/a' : formatValue(d.basis)}
                    </div>
                    <div data-section="chart-line-stddev-tooltip-upper">
                      upper: {d.upper === null ? 'n/a' : formatValue(d.upper)}
                    </div>
                    <div data-section="chart-line-stddev-tooltip-lower">
                      lower: {d.lower === null ? 'n/a' : formatValue(d.lower)}
                    </div>
                    <div data-section="chart-line-stddev-tooltip-position">
                      position: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-stddev-legend"
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
                  data-section="chart-line-stddev-legend-item"
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
                    data-section="chart-line-stddev-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-stddev-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-stddev-legend-stats"
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

ChartLineStdDev.displayName = 'ChartLineStdDev';
