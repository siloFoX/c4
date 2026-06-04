import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ENVELOPE_WIDTH = 560;
export const DEFAULT_CHART_LINE_ENVELOPE_HEIGHT = 320;
export const DEFAULT_CHART_LINE_ENVELOPE_PADDING = 40;
export const DEFAULT_CHART_LINE_ENVELOPE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ENVELOPE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ENVELOPE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ENVELOPE_PERIOD = 20;
export const DEFAULT_CHART_LINE_ENVELOPE_PERCENT = 5;
export const DEFAULT_CHART_LINE_ENVELOPE_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_ENVELOPE_BASIS_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ENVELOPE_ENVELOPE_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_ENVELOPE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ENVELOPE_AXIS_COLOR = '#cbd5e1';

export type ChartLineEnvelopePosition = 'above' | 'below' | 'on';

export interface ChartLineEnvelopePoint {
  x: number;
  value: number;
}

export interface ChartLineEnvelopeBands {
  upper: (number | null)[];
  lower: (number | null)[];
}

export interface ChartLineEnvelopeSample {
  index: number;
  x: number;
  value: number;
  basis: number | null;
  upper: number | null;
  lower: number | null;
  position: ChartLineEnvelopePosition;
}

export interface ChartLineEnvelopeRun {
  series: ChartLineEnvelopePoint[];
  period: number;
  percent: number;
  basis: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
  samples: ChartLineEnvelopeSample[];
  basisFinal: number;
  upperFinal: number;
  lowerFinal: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineEnvelopePriceDot {
  index: number;
  x: number;
  value: number;
  basis: number | null;
  upper: number | null;
  lower: number | null;
  position: ChartLineEnvelopePosition;
  px: number;
  py: number;
}

export interface ChartLineEnvelopeMarker {
  index: number;
  x: number;
  basis: number;
  px: number;
  py: number;
}

export interface ChartLineEnvelopePanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineEnvelopeLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineEnvelopePanel;
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
  priceDots: ChartLineEnvelopePriceDot[];
  basisMarkers: ChartLineEnvelopeMarker[];
  period: number;
  percent: number;
  basisFinal: number;
  upperFinal: number;
  lowerFinal: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineEnvelopeLayoutOptions {
  data: readonly ChartLineEnvelopePoint[];
  period?: number;
  percent?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineEnvelopeProps {
  data: readonly ChartLineEnvelopePoint[];
  period?: number;
  percent?: number;
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
  envelopeColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBasis?: boolean;
  showEnvelope?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineEnvelopePriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineEnvelopeFinitePoints(
  points: readonly ChartLineEnvelopePoint[] | null | undefined,
): ChartLineEnvelopePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineEnvelopePoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineEnvelopePeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Coerce an envelope percent to a positive finite number. A
 * non-finite or non-positive value falls back to `fallback`.
 */
export function normalizeLineEnvelopePercent(
  percent: number,
  fallback: number,
): number {
  if (isFiniteNumber(percent) && percent > 0) return percent;
  return fallback;
}

/**
 * The basis line -- the `period`-bar simple moving average. Null
 * through the warm-up; defined from index `period - 1` onward.
 */
export function computeLineEnvelopeBasis(
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
 * The envelope band edges. The offset is a fixed percentage of the
 * basis: `upper = basis * (1 + percent/100)` and
 * `lower = basis * (1 - percent/100)`. Because the offset scales
 * with the basis, the envelope keeps a constant relative width --
 * even a flat series carries a band.
 */
export function computeLineEnvelopeBands(
  values: readonly number[] | null | undefined,
  period: number,
  percent: number,
): ChartLineEnvelopeBands {
  const basis = computeLineEnvelopeBasis(values, period);
  const factor = percent / 100;
  const upper = basis.map((b) => (b === null ? null : b * (1 + factor)));
  const lower = basis.map((b) => (b === null ? null : b * (1 - factor)));
  return { upper, lower };
}

function classifyPosition(
  value: number,
  basis: number | null,
): ChartLineEnvelopePosition {
  if (basis === null) return 'on';
  if (value > basis) return 'above';
  if (value < basis) return 'below';
  return 'on';
}

export function runLineEnvelope(
  points: readonly ChartLineEnvelopePoint[] | null | undefined,
  options?: { period?: number; percent?: number },
): ChartLineEnvelopeRun {
  const finite = getLineEnvelopeFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineEnvelopePeriod(
    options?.period ?? DEFAULT_CHART_LINE_ENVELOPE_PERIOD,
    DEFAULT_CHART_LINE_ENVELOPE_PERIOD,
  );
  const percent = normalizeLineEnvelopePercent(
    options?.percent ?? DEFAULT_CHART_LINE_ENVELOPE_PERCENT,
    DEFAULT_CHART_LINE_ENVELOPE_PERCENT,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      percent,
      basis: [],
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
  const basis = computeLineEnvelopeBasis(values, period);
  const { upper, lower } = computeLineEnvelopeBands(values, period, percent);

  const samples: ChartLineEnvelopeSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    basis: basis[i] ?? null,
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
    series,
    period,
    percent,
    basis,
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

export function computeLineEnvelopeLayout(
  options: ComputeLineEnvelopeLayoutOptions,
): ChartLineEnvelopeLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_ENVELOPE_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineEnvelopePanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineEnvelope(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.percent) ? { percent: options.percent } : {}),
  });
  const empty: ChartLineEnvelopeLayout = {
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
    percent: run.percent,
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

  const panel: ChartLineEnvelopePanel = {
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

  const priceDots: ChartLineEnvelopePriceDot[] = run.samples.map((s) => ({
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

  const basisMarkers: ChartLineEnvelopeMarker[] = [];
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
    if (s.upper !== null) {
      upperPts.push({ px: projectX(s.x), py: projectY(s.upper) });
    }
    if (s.lower !== null) {
      lowerPts.push({ px: projectX(s.x), py: projectY(s.lower) });
    }
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
    percent: run.percent,
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

export function describeLineEnvelopeChart(
  data: readonly ChartLineEnvelopePoint[] | null | undefined,
  options?: { period?: number; percent?: number },
): string {
  const run = runLineEnvelope(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a moving average envelope (period ${run.period}, offset ${defaultFormatValue(run.percent)} percent): the basis is the ${run.period}-bar simple moving average; the envelope edges sit a fixed ${defaultFormatValue(run.percent)} percent above and below it -- upper = basis * (1 + percent/100), lower = basis * (1 - percent/100). Unlike a standard deviation band the offset is a constant fraction of the basis, so the envelope keeps a constant relative width. The price runs above the basis on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const ENVELOPE_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineEnvelope = forwardRef<
  HTMLDivElement,
  ChartLineEnvelopeProps
>(function ChartLineEnvelope(
  props: ChartLineEnvelopeProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    percent,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_ENVELOPE_WIDTH,
    height = DEFAULT_CHART_LINE_ENVELOPE_HEIGHT,
    padding = DEFAULT_CHART_LINE_ENVELOPE_PADDING,
    tickCount = DEFAULT_CHART_LINE_ENVELOPE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ENVELOPE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ENVELOPE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ENVELOPE_PRICE_COLOR,
    basisColor = DEFAULT_CHART_LINE_ENVELOPE_BASIS_COLOR,
    envelopeColor = DEFAULT_CHART_LINE_ENVELOPE_ENVELOPE_COLOR,
    gridColor = DEFAULT_CHART_LINE_ENVELOPE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ENVELOPE_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showBasis = true,
    showEnvelope = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a moving average envelope',
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
      computeLineEnvelopeLayout({
        data,
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(percent) ? { percent } : {}),
      }),
    [data, width, height, padding, tickCount, period, percent],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineEnvelopeChart(data, {
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(percent) ? { percent } : {}),
      }),
    [ariaDescription, data, period, percent],
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
        data-section="chart-line-envelope"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-envelope-aria-desc"
          style={ENVELOPE_SR_STYLE}
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
  const envelopeVisible = showEnvelope && !hiddenSet.has('envelope');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'basis', label: 'Basis', color: basisColor },
    { id: 'envelope', label: 'Envelope', color: envelopeColor },
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
      data-section="chart-line-envelope"
      data-empty="false"
      data-period={layout.period}
      data-percent={layout.percent}
      data-basis-final={layout.basisFinal}
      data-above-count={layout.aboveCount}
      data-below-count={layout.belowCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-envelope-aria-desc"
        style={ENVELOPE_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-envelope-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-envelope-badge"
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
              data-section="chart-line-envelope-badge-icon"
              aria-hidden="true"
              style={{ color: envelopeColor }}
            >
              ENVELOPE
            </span>
            <span data-section="chart-line-envelope-badge-config">
              {layout.period}/{formatValue(layout.percent)}%
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-envelope-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-envelope-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => (
                <line
                  key={`gy-${i}`}
                  data-section="chart-line-envelope-grid-line"
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
              data-section="chart-line-envelope-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-envelope-axis"
                data-axis="x"
                x1={cp.x}
                y1={cp.y + cp.height}
                x2={cp.x + cp.width}
                y2={cp.y + cp.height}
              />
              <line
                data-section="chart-line-envelope-axis"
                data-axis="y"
                x1={cp.x}
                y1={cp.y}
                x2={cp.x}
                y2={cp.y + cp.height}
              />
              {layout.yTicks.map((t, i) => (
                <g
                  key={`yt-${i}`}
                  data-section="chart-line-envelope-tick"
                  data-axis="y"
                >
                  <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                  <text
                    data-section="chart-line-envelope-tick-label"
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
                  data-section="chart-line-envelope-tick"
                  data-axis="x"
                >
                  <line
                    x1={t.px}
                    x2={t.px}
                    y1={cp.y + cp.height}
                    y2={cp.y + cp.height + 4}
                  />
                  <text
                    data-section="chart-line-envelope-tick-label"
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

          {envelopeVisible && layout.bandAreaPath ? (
            <path
              data-section="chart-line-envelope-band-area"
              d={layout.bandAreaPath}
              fill={envelopeColor}
              fillOpacity={0.12}
              stroke="none"
            />
          ) : null}

          {envelopeVisible && layout.upperPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Upper envelope band"
              data-section="chart-line-envelope-upper-line"
              d={layout.upperPath}
              fill="none"
              stroke={envelopeColor}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {envelopeVisible && layout.lowerPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Lower envelope band"
              data-section="chart-line-envelope-lower-line"
              d={layout.lowerPath}
              fill="none"
              stroke={envelopeColor}
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
              data-section="chart-line-envelope-basis-line"
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
              data-section="chart-line-envelope-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-envelope-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-envelope-dot"
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
            <g data-section="chart-line-envelope-markers">
              {layout.basisMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Basis at x ${formatX(m.x)}: ${formatValue(m.basis)}`}
                    data-section="chart-line-envelope-marker"
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
                  data-section="chart-line-envelope-tooltip"
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
                  <div data-section="chart-line-envelope-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-envelope-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-envelope-tooltip-basis">
                    basis: {d.basis === null ? 'n/a' : formatValue(d.basis)}
                  </div>
                  <div data-section="chart-line-envelope-tooltip-upper">
                    upper: {d.upper === null ? 'n/a' : formatValue(d.upper)}
                  </div>
                  <div data-section="chart-line-envelope-tooltip-lower">
                    lower: {d.lower === null ? 'n/a' : formatValue(d.lower)}
                  </div>
                  <div data-section="chart-line-envelope-tooltip-position">
                    position: {d.position}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-envelope-legend"
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
                data-section="chart-line-envelope-legend-item"
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
                  data-section="chart-line-envelope-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-envelope-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-envelope-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.aboveCount} above, {layout.belowCount} below
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineEnvelope.displayName = 'ChartLineEnvelope';
