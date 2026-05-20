import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_T3_WIDTH = 560;
export const DEFAULT_CHART_LINE_T3_HEIGHT = 320;
export const DEFAULT_CHART_LINE_T3_PADDING = 40;
export const DEFAULT_CHART_LINE_T3_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_T3_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_T3_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_T3_PERIOD = 5;
export const DEFAULT_CHART_LINE_T3_VFACTOR = 0.7;
export const DEFAULT_CHART_LINE_T3_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_T3_T3_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_T3_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_T3_AXIS_COLOR = '#cbd5e1';

export type ChartLineT3Position = 'above' | 'below' | 'on';

export interface ChartLineT3Point {
  x: number;
  value: number;
}

export interface ChartLineT3Sample {
  index: number;
  x: number;
  value: number;
  t3: number | null;
  position: ChartLineT3Position;
}

export interface ChartLineT3Run {
  series: ChartLineT3Point[];
  period: number;
  vfactor: number;
  ema1: (number | null)[];
  ema2: (number | null)[];
  ema3: (number | null)[];
  ema4: (number | null)[];
  ema5: (number | null)[];
  ema6: (number | null)[];
  t3: (number | null)[];
  samples: ChartLineT3Sample[];
  t3Final: number;
  t3Min: number;
  t3Max: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineT3PriceDot {
  index: number;
  x: number;
  value: number;
  t3: number | null;
  position: ChartLineT3Position;
  px: number;
  py: number;
}

export interface ChartLineT3Marker {
  index: number;
  x: number;
  t3: number;
  px: number;
  py: number;
}

export interface ChartLineT3Panel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineT3Layout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineT3Panel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  t3Path: string;
  priceDots: ChartLineT3PriceDot[];
  t3Markers: ChartLineT3Marker[];
  period: number;
  vfactor: number;
  t3Final: number;
  t3Min: number;
  t3Max: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineT3LayoutOptions {
  data: readonly ChartLineT3Point[];
  period?: number;
  vfactor?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineT3Props {
  data: readonly ChartLineT3Point[];
  period?: number;
  vfactor?: number;
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
  t3Color?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showT3?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineT3PriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineT3FinitePoints(
  points: readonly ChartLineT3Point[] | null | undefined,
): ChartLineT3Point[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineT3Point =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineT3Period(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Coerce the T3 volume factor to the range [0, 1]. A non-finite
 * value falls back to `fallback`; a value below 0 or above 1 is
 * clamped. At 0 the T3 collapses to a plain triple-nested EMA; near
 * 1 it is at its most responsive.
 */
export function normalizeLineT3Vfactor(
  vfactor: number,
  fallback: number,
): number {
  if (!isFiniteNumber(vfactor)) return fallback;
  if (vfactor < 0) return 0;
  if (vfactor > 1) return 1;
  return vfactor;
}

/**
 * Tim Tillson's T3 coefficients, four cubic polynomials in the
 * volume factor `v`: `c1 = -v^3`, `c2 = 3v^2 + 3v^3`,
 * `c3 = -6v^2 - 3v - 3v^3`, `c4 = 1 + 3v + 3v^2 + v^3`. They always
 * sum to 1, so the T3 of a constant series is that constant.
 */
export function lineT3Coefficients(vfactor: number): {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
} {
  const v = vfactor;
  const v2 = v * v;
  const v3 = v2 * v;
  const norm = (x: number): number => (x === 0 ? 0 : x);
  return {
    c1: norm(-v3),
    c2: norm(3 * v2 + 3 * v3),
    c3: norm(-6 * v2 - 3 * v - 3 * v3),
    c4: norm(1 + 3 * v + 3 * v2 + v3),
  };
}

/**
 * An exponential moving average over `period` values, tolerating the
 * leading `null` placeholders of a derived series. The seed is the
 * simple mean of the first `period` defined values placed at that
 * value's index; each later defined value folds in at weight
 * `2 / (period + 1)`.
 */
export function computeLineT3Ema(
  src: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  const idx: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (isDefined(src[i])) idx.push(i);
  }
  if (idx.length < p) return out;
  const mult = 2 / (p + 1);
  let sum = 0;
  for (let k = 0; k < p; k += 1) sum += src[idx[k]!] as number;
  let ema = sum / p;
  out[idx[p - 1]!] = ema;
  for (let k = p; k < idx.length; k += 1) {
    const i = idx[k]!;
    ema = (src[i] as number) * mult + ema * (1 - mult);
    out[i] = ema;
  }
  return out;
}

/**
 * Tim Tillson's T3 Moving Average. The price is run through a
 * cascade of six exponential moving averages, and four of them are
 * blended with the volume-factor coefficients:
 * `T3 = c1*EMA6 + c2*EMA5 + c3*EMA4 + c4*EMA3`. The volume factor
 * `vfactor` -- the cascaded smoothing factor -- dials how responsive
 * the average is: at 0 the blend collapses to the plain
 * triple-nested EMA, while a higher factor sharpens the response.
 * EMA1 is defined from index `period - 1`; each later nesting needs
 * another `period` defined values, so EMA6 -- and therefore the
 * T3 -- is defined from index `6 * period - 6` onward.
 */
export function computeLineT3(
  values: readonly number[] | null | undefined,
  period: number,
  vfactor: number,
): {
  ema1: (number | null)[];
  ema2: (number | null)[];
  ema3: (number | null)[];
  ema4: (number | null)[];
  ema5: (number | null)[];
  ema6: (number | null)[];
  t3: (number | null)[];
} {
  if (!Array.isArray(values)) {
    return {
      ema1: [],
      ema2: [],
      ema3: [],
      ema4: [],
      ema5: [],
      ema6: [],
      t3: [],
    };
  }
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const ema1 = computeLineT3Ema(values, p);
  const ema2 = computeLineT3Ema(ema1, p);
  const ema3 = computeLineT3Ema(ema2, p);
  const ema4 = computeLineT3Ema(ema3, p);
  const ema5 = computeLineT3Ema(ema4, p);
  const ema6 = computeLineT3Ema(ema5, p);
  const { c1, c2, c3, c4 } = lineT3Coefficients(vfactor);
  const t3: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    if (
      isDefined(ema3[i]) &&
      isDefined(ema4[i]) &&
      isDefined(ema5[i]) &&
      isDefined(ema6[i])
    ) {
      t3[i] =
        c1 * (ema6[i] as number) +
        c2 * (ema5[i] as number) +
        c3 * (ema4[i] as number) +
        c4 * (ema3[i] as number);
    }
  }
  return { ema1, ema2, ema3, ema4, ema5, ema6, t3 };
}

function classifyPosition(
  value: number,
  t3: number | null,
): ChartLineT3Position {
  if (t3 === null) return 'on';
  if (value > t3) return 'above';
  if (value < t3) return 'below';
  return 'on';
}

export function runLineT3(
  points: readonly ChartLineT3Point[] | null | undefined,
  options?: { period?: number; vfactor?: number },
): ChartLineT3Run {
  const finite = getLineT3FinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineT3Period(
    options?.period ?? DEFAULT_CHART_LINE_T3_PERIOD,
    DEFAULT_CHART_LINE_T3_PERIOD,
  );
  const vfactor = normalizeLineT3Vfactor(
    options?.vfactor ?? DEFAULT_CHART_LINE_T3_VFACTOR,
    DEFAULT_CHART_LINE_T3_VFACTOR,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      vfactor,
      ema1: [],
      ema2: [],
      ema3: [],
      ema4: [],
      ema5: [],
      ema6: [],
      t3: [],
      samples: [],
      t3Final: NaN,
      t3Min: NaN,
      t3Max: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { ema1, ema2, ema3, ema4, ema5, ema6, t3 } = computeLineT3(
    values,
    period,
    vfactor,
  );

  const samples: ChartLineT3Sample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    t3: t3[i] ?? null,
    position: classifyPosition(p.value, t3[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let t3Min = NaN;
  let t3Max = NaN;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.t3 !== null) {
      if (Number.isNaN(t3Min) || s.t3 < t3Min) t3Min = s.t3;
      if (Number.isNaN(t3Max) || s.t3 > t3Max) t3Max = s.t3;
    }
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series,
    period,
    vfactor,
    ema1,
    ema2,
    ema3,
    ema4,
    ema5,
    ema6,
    t3,
    samples,
    t3Final: lastDefined(t3),
    t3Min,
    t3Max,
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

export function computeLineT3Layout(
  options: ComputeLineT3LayoutOptions,
): ChartLineT3Layout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_T3_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineT3Panel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineT3(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.vfactor) ? { vfactor: options.vfactor } : {}),
  });
  const empty: ChartLineT3Layout = {
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
    t3Path: '',
    priceDots: [],
    t3Markers: [],
    period: run.period,
    vfactor: run.vfactor,
    t3Final: NaN,
    t3Min: NaN,
    t3Max: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineT3Panel = {
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
    if (s.t3 !== null) {
      if (s.t3 < yLo) yLo = s.t3;
      if (s.t3 > yHi) yHi = s.t3;
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

  const priceDots: ChartLineT3PriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    t3: s.t3,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const t3Markers: ChartLineT3Marker[] = [];
  const t3Pts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.t3 !== null) {
      const px = projectX(s.x);
      const py = projectY(s.t3);
      t3Pts.push({ px, py });
      t3Markers.push({ index: s.index, x: s.x, t3: s.t3, px, py });
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
    t3Path: buildPath(t3Pts),
    priceDots,
    t3Markers,
    period: run.period,
    vfactor: run.vfactor,
    t3Final: run.t3Final,
    t3Min: run.t3Min,
    t3Max: run.t3Max,
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

export function describeLineT3Chart(
  data: readonly ChartLineT3Point[] | null | undefined,
  options?: { period?: number; vfactor?: number },
): string {
  const run = runLineT3(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Tillson T3 Moving Average (T3) overlay (period ${run.period}): the T3 cascades six exponential moving averages and blends four of them with coefficients derived from a volume factor -- a cascaded smoothing factor that dials how responsive the average is. The result is smoother than a triple EMA yet keeps the lag low. The price runs above the T3 on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const T3_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineT3 = forwardRef<HTMLDivElement, ChartLineT3Props>(
  function ChartLineT3(
    props: ChartLineT3Props,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      vfactor,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_T3_WIDTH,
      height = DEFAULT_CHART_LINE_T3_HEIGHT,
      padding = DEFAULT_CHART_LINE_T3_PADDING,
      tickCount = DEFAULT_CHART_LINE_T3_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_T3_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_T3_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_T3_PRICE_COLOR,
      t3Color = DEFAULT_CHART_LINE_T3_T3_COLOR,
      gridColor = DEFAULT_CHART_LINE_T3_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_T3_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showT3 = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Tillson T3 Moving Average overlay',
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
        computeLineT3Layout({
          data,
          width,
          height,
          padding,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(vfactor) ? { vfactor } : {}),
        }),
      [data, width, height, padding, tickCount, period, vfactor],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineT3Chart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(vfactor) ? { vfactor } : {}),
        }),
      [ariaDescription, data, period, vfactor],
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
          data-section="chart-line-t3"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-t3-aria-desc"
            style={T3_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const t3Visible = showT3 && !hiddenSet.has('t3');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 't3', label: 'T3', color: t3Color },
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
        data-section="chart-line-t3"
        data-empty="false"
        data-period={layout.period}
        data-vfactor={layout.vfactor}
        data-t3-final={layout.t3Final}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-t3-aria-desc"
          style={T3_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-t3-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-t3-badge"
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
                data-section="chart-line-t3-badge-icon"
                aria-hidden="true"
                style={{ color: t3Color }}
              >
                T3
              </span>
              <span data-section="chart-line-t3-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-t3-badge-vfactor">
                v={layout.vfactor}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-t3-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-t3-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-t3-grid-line"
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
                data-section="chart-line-t3-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-t3-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-t3-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-t3-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-t3-tick-label"
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
                    data-section="chart-line-t3-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-t3-tick-label"
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
                data-section="chart-line-t3-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-t3-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-t3-dot"
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

            {t3Visible && layout.t3Path ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Tillson T3 Moving Average line"
                data-section="chart-line-t3-t3-line"
                d={layout.t3Path}
                fill="none"
                stroke={t3Color}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {t3Visible ? (
              <g data-section="chart-line-t3-markers">
                {layout.t3Markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`T3 at x ${formatX(m.x)}: ${formatValue(m.t3)}`}
                      data-section="chart-line-t3-marker"
                      data-point-index={m.index}
                      data-t3={m.t3}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={t3Color}
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
                    data-section="chart-line-t3-tooltip"
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
                    <div data-section="chart-line-t3-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-t3-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-t3-tooltip-t3">
                      t3: {d.t3 === null ? 'n/a' : formatValue(d.t3)}
                    </div>
                    <div data-section="chart-line-t3-tooltip-position">
                      position: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-t3-legend"
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
                  data-section="chart-line-t3-legend-item"
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
                    data-section="chart-line-t3-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-t3-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-t3-legend-stats"
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

ChartLineT3.displayName = 'ChartLineT3';
