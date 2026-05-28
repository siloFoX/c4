import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_TRIX_WIDTH = 560;
export const DEFAULT_CHART_LINE_TRIX_HEIGHT = 360;
export const DEFAULT_CHART_LINE_TRIX_PADDING = 40;
export const DEFAULT_CHART_LINE_TRIX_GAP = 26;
export const DEFAULT_CHART_LINE_TRIX_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_TRIX_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TRIX_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TRIX_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TRIX_PERIOD = 15;
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_PERIOD = 9;
export const DEFAULT_CHART_LINE_TRIX_VALUE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_TRIX_TRIX_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_TRIX_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_TRIX_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TRIX_AXIS_COLOR = '#cbd5e1';

export interface ChartLineTrixPoint {
  x: number;
  value: number;
}

export interface ChartLineTrixSeries {
  ema1: number[];
  ema2: number[];
  ema3: number[];
  trix: (number | null)[];
}

export interface ChartLineTrixSample {
  index: number;
  x: number;
  value: number;
  ema3: number | null;
  trix: number | null;
  signal: number | null;
}

export interface ChartLineTrixRun {
  series: ChartLineTrixPoint[];
  period: number;
  signalPeriod: number;
  ema3: number[];
  trix: (number | null)[];
  signal: (number | null)[];
  samples: ChartLineTrixSample[];
  trixFinal: number;
  signalFinal: number;
  trixMin: number;
  trixMax: number;
  ok: boolean;
}

export interface ChartLineTrixPriceDot {
  index: number;
  x: number;
  value: number;
  ema3: number | null;
  trix: number | null;
  signal: number | null;
  px: number;
  py: number;
}

export interface ChartLineTrixMarker {
  index: number;
  x: number;
  trix: number;
  px: number;
  py: number;
}

export interface ChartLineTrixPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineTrixLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineTrixPanel;
  trixPanel: ChartLineTrixPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  trixYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  trixYBound: number;
  pricePath: string;
  priceDots: ChartLineTrixPriceDot[];
  trixPath: string;
  signalPath: string;
  markers: ChartLineTrixMarker[];
  zeroY: number;
  period: number;
  signalPeriod: number;
  trixFinal: number;
  signalFinal: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineTrixLayoutOptions {
  data: readonly ChartLineTrixPoint[];
  period?: number;
  signalPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineTrixProps {
  data: readonly ChartLineTrixPoint[];
  period?: number;
  signalPeriod?: number;
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
  valueColor?: string;
  trixColor?: string;
  signalColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTrix?: boolean;
  showSignal?: boolean;
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
  onPointClick?: (payload: { point: ChartLineTrixPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineTrixFinitePoints(
  points: readonly ChartLineTrixPoint[] | null | undefined,
): ChartLineTrixPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineTrixPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineTrixPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * An exponential moving average. The EMA is seeded with the first
 * value and rolls forward with the smoothing factor `k = 2/(p+1)`:
 * `ema[i] = value[i] * k + ema[i-1] * (1 - k)`. Every index carries
 * a value.
 */
export function computeLineTrixEma(
  values: readonly number[] | null | undefined,
  period: number,
): number[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  const p = period < 1 ? 1 : Math.floor(period);
  const k = 2 / (p + 1);
  const out: number[] = new Array(values.length);
  out[0] = values[0]!;
  for (let i = 1; i < values.length; i += 1) {
    out[i] = values[i]! * k + out[i - 1]! * (1 - k);
  }
  return out;
}

/**
 * Jack Hutson's TRIX components. The series is smoothed by three
 * successive EMAs of the same period; TRIX is the 1-period
 * percentage rate of change of that triple-smoothed line,
 * `TRIX[i] = 100 * (ema3[i] - ema3[i-1]) / ema3[i-1]`. Index 0 has
 * no prior value and reads null.
 */
export function computeLineTrix(
  values: readonly number[] | null | undefined,
  period: number,
): ChartLineTrixSeries {
  if (!Array.isArray(values)) {
    return { ema1: [], ema2: [], ema3: [], trix: [] };
  }
  const n = values.length;
  const ema1 = computeLineTrixEma(values, period);
  const ema2 = computeLineTrixEma(ema1, period);
  const ema3 = computeLineTrixEma(ema2, period);
  const trix: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const prev = ema3[i - 1]!;
    const raw = prev === 0 ? 0 : (100 * (ema3[i]! - prev)) / prev;
    trix[i] = raw === 0 ? 0 : raw;
  }
  return { ema1, ema2, ema3, trix };
}

/**
 * The TRIX signal line: an EMA of the TRIX series over
 * `signalPeriod`, seeded at the first defined TRIX value.
 */
export function computeLineTrixSignal(
  trix: readonly (number | null)[] | null | undefined,
  signalPeriod: number,
): (number | null)[] {
  if (!Array.isArray(trix)) return [];
  const n = trix.length;
  const p = signalPeriod < 1 ? 1 : Math.floor(signalPeriod);
  const k = 2 / (p + 1);
  const out: (number | null)[] = new Array(n).fill(null);
  let firstIdx = -1;
  for (let i = 0; i < n; i += 1) {
    if (trix[i] !== null) {
      firstIdx = i;
      break;
    }
  }
  if (firstIdx === -1) return out;
  let ema = trix[firstIdx] as number;
  out[firstIdx] = ema;
  for (let i = firstIdx + 1; i < n; i += 1) {
    if (trix[i] === null) continue;
    ema = (trix[i] as number) * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

export function runLineTrix(
  points: readonly ChartLineTrixPoint[] | null | undefined,
  options?: { period?: number; signalPeriod?: number },
): ChartLineTrixRun {
  const finite = getLineTrixFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineTrixPeriod(
    options?.period ?? DEFAULT_CHART_LINE_TRIX_PERIOD,
    DEFAULT_CHART_LINE_TRIX_PERIOD,
  );
  const signalPeriod = normalizeLineTrixPeriod(
    options?.signalPeriod ?? DEFAULT_CHART_LINE_TRIX_SIGNAL_PERIOD,
    DEFAULT_CHART_LINE_TRIX_SIGNAL_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      signalPeriod,
      ema3: [],
      trix: [],
      signal: [],
      samples: [],
      trixFinal: NaN,
      signalFinal: NaN,
      trixMin: NaN,
      trixMax: NaN,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { ema3, trix } = computeLineTrix(values, period);
  const signal = computeLineTrixSignal(trix, signalPeriod);
  const samples: ChartLineTrixSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    ema3: ema3[i] ?? null,
    trix: trix[i] ?? null,
    signal: signal[i] ?? null,
  }));

  const lastDefined = (arr: readonly (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (arr[i] !== null) return arr[i] as number;
    }
    return NaN;
  };
  let trixMin = NaN;
  let trixMax = NaN;
  for (const arr of [trix, signal]) {
    for (const v of arr) {
      if (v === null) continue;
      if (Number.isNaN(trixMin) || v < trixMin) trixMin = v;
      if (Number.isNaN(trixMax) || v > trixMax) trixMax = v;
    }
  }

  return {
    series = [],
    period,
    signalPeriod,
    ema3,
    trix,
    signal,
    samples,
    trixFinal: lastDefined(trix),
    signalFinal: lastDefined(signal),
    trixMin,
    trixMax,
    ok: true,
  };
}

function buildPath(
  points: readonly { px: number; py: number }[],
): string {
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

export function computeLineTrixLayout(
  options: ComputeLineTrixLayoutOptions,
): ChartLineTrixLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_TRIX_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_TRIX_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_TRIX_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineTrixPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineTrix(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.signalPeriod)
      ? { signalPeriod: options.signalPeriod }
      : {}),
  });
  const empty: ChartLineTrixLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    trixPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    trixYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    trixYBound: 0,
    pricePath: '',
    priceDots: [],
    trixPath: '',
    signalPath: '',
    markers: [],
    zeroY: 0,
    period: run.period,
    signalPeriod: run.signalPeriod,
    trixFinal: NaN,
    signalFinal: NaN,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const trixH = usableHeight - priceH;
  if (priceH <= 0 || trixH <= 0) return empty;

  const pricePanel: ChartLineTrixPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const trixPanel: ChartLineTrixPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: trixH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let bound = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < pyLo) pyLo = s.value;
    if (s.value > pyHi) pyHi = s.value;
    if (s.trix !== null && Math.abs(s.trix) > bound) bound = Math.abs(s.trix);
    if (s.signal !== null && Math.abs(s.signal) > bound) {
      bound = Math.abs(s.signal);
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
  if (bound <= 0) bound = 1;

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectTrixY = (v: number): number =>
    trixPanel.y +
    trixPanel.height -
    ((v + bound) / (2 * bound)) * trixPanel.height;

  const priceDots: ChartLineTrixPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    ema3: s.ema3,
    trix: s.trix,
    signal: s.signal,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const markers: ChartLineTrixMarker[] = [];
  const trixPts: { px: number; py: number }[] = [];
  const signalPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    if (s.trix !== null) {
      const py = projectTrixY(s.trix);
      trixPts.push({ px, py });
      markers.push({ index: s.index, x: s.x, trix: s.trix, px, py });
    }
    if (s.signal !== null) {
      signalPts.push({ px, py: projectTrixY(s.signal) });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    trixPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    trixYTicks: computeTicks(-bound, bound, tickCount).map((v) => ({
      value: v,
      py: projectTrixY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    trixYBound: bound,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    trixPath: buildPath(trixPts),
    signalPath: buildPath(signalPts),
    markers,
    zeroY: projectTrixY(0),
    period: run.period,
    signalPeriod: run.signalPeriod,
    trixFinal: run.trixFinal,
    signalFinal: run.signalFinal,
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

export function describeLineTrixChart(
  data: readonly ChartLineTrixPoint[] | null | undefined,
  options?: { period?: number; signalPeriod?: number },
): string {
  const run = runLineTrix(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a TRIX triple-smoothed EMA oscillator panel (period ${run.period}, signal ${run.signalPeriod}): TRIX is the percentage rate of change of an exponential moving average smoothed three times, oscillating around zero as the underlying trend turns. Across ${run.samples.length} periods.`;
}

const TRIX_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineTrix = forwardRef<HTMLDivElement, ChartLineTrixProps>(
  function ChartLineTrix(
    props: ChartLineTrixProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      signalPeriod,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_TRIX_WIDTH,
      height = DEFAULT_CHART_LINE_TRIX_HEIGHT,
      padding = DEFAULT_CHART_LINE_TRIX_PADDING,
      gap = DEFAULT_CHART_LINE_TRIX_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_TRIX_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_TRIX_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_TRIX_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_TRIX_DOT_RADIUS,
      valueColor = DEFAULT_CHART_LINE_TRIX_VALUE_COLOR,
      trixColor = DEFAULT_CHART_LINE_TRIX_TRIX_COLOR,
      signalColor = DEFAULT_CHART_LINE_TRIX_SIGNAL_COLOR,
      zeroColor = DEFAULT_CHART_LINE_TRIX_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_TRIX_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_TRIX_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showTrix = true,
      showSignal = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a TRIX triple-smoothed EMA oscillator panel',
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
        computeLineTrixLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
        }),
      [
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        period,
        signalPeriod,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineTrixChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
        }),
      [ariaDescription, data, period, signalPeriod],
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
          data-section="chart-line-trix"
          data-empty="true"
          data-period={layout.period}
          data-animate={animate ? 'true' : 'false'}
        >
          <span id={descId} data-section="chart-line-trix-aria-desc" style={TRIX_SR_STYLE}>
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const tp = layout.trixPanel;
    const valueVisible = !hiddenSet.has('value');
    const trixVisible = showTrix && !hiddenSet.has('trix');
    const signalVisible = showSignal && !hiddenSet.has('signal');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'value', label: 'Value', color: valueColor },
      { id: 'trix', label: 'TRIX', color: trixColor },
      { id: 'signal', label: 'Signal', color: signalColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-trix"
        data-empty="false"
        data-period={layout.period}
        data-signal-period={layout.signalPeriod}
        data-trix-final={layout.trixFinal}
        data-signal-final={layout.signalFinal}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-trix-aria-desc" style={TRIX_SR_STYLE}>
          {summary}
        </span>

        <div
          data-section="chart-line-trix-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-trix-badge"
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
                data-section="chart-line-trix-badge-icon"
                aria-hidden="true"
                style={{ color: trixColor }}
              >
                TRIX
              </span>
              <span data-section="chart-line-trix-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-trix-badge-signal">
                s={layout.signalPeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-trix-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-trix-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-trix-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.trixYTicks.map((t, i) => (
                  <line
                    key={`tgy-${i}`}
                    data-section="chart-line-trix-grid-line"
                    data-panel="trix"
                    x1={tp.x}
                    x2={tp.x + tp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showZeroLine ? (
              <line
                data-section="chart-line-trix-zero-line"
                x1={tp.x}
                x2={tp.x + tp.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-trix-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: tp, name: 'trix', yt: layout.trixYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-trix-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-trix-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-trix-axis"
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
                        data-section="chart-line-trix-tick"
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
                          data-section="chart-line-trix-tick-label"
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
                <g data-section="chart-line-trix-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-trix-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={tp.y + tp.height}
                        y2={tp.y + tp.height + 4}
                      />
                      <text
                        data-section="chart-line-trix-tick-label"
                        data-axis="x"
                        x={t.px}
                        y={tp.y + tp.height + 14}
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

            <g data-section="chart-line-trix-panel-labels">
              <text
                data-section="chart-line-trix-panel-label"
                data-panel="price"
                x={pp.x + pp.width / 2}
                y={pp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Value
              </text>
              <text
                data-section="chart-line-trix-panel-label"
                data-panel="trix"
                x={tp.x + tp.width / 2}
                y={tp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                TRIX
              </text>
            </g>

            {valueVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Value line"
                data-section="chart-line-trix-value-path"
                d={layout.pricePath}
                fill="none"
                stroke={valueColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {valueVisible && showDots ? (
              <g data-section="chart-line-trix-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-trix-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.value}
                      cx={d.px}
                      cy={d.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={valueColor}
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

            {signalVisible && layout.signalPath ? (
              <path
                data-section="chart-line-trix-signal-line"
                d={layout.signalPath}
                fill="none"
                stroke={signalColor}
                strokeWidth={1.5}
                strokeDasharray="5 3"
              />
            ) : null}

            {trixVisible && layout.trixPath ? (
              <path
                data-section="chart-line-trix-trix-line"
                d={layout.trixPath}
                fill="none"
                stroke={trixColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {trixVisible ? (
              <g data-section="chart-line-trix-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`TRIX at x ${formatX(m.x)}: ${formatValue(m.trix)}`}
                      data-section="chart-line-trix-marker"
                      data-point-index={m.index}
                      data-trix={m.trix}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={trixColor}
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
                const d = layout.priceDots.find(
                  (x) => x.index === hoverIndex,
                );
                if (!d) return null;
                return (
                  <div
                    data-section="chart-line-trix-tooltip"
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
                    <div data-section="chart-line-trix-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-trix-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-trix-tooltip-ema3">
                      ema3: {d.ema3 === null ? 'n/a' : formatValue(d.ema3)}
                    </div>
                    <div data-section="chart-line-trix-tooltip-trix">
                      trix: {d.trix === null ? 'n/a' : formatValue(d.trix)}
                    </div>
                    <div data-section="chart-line-trix-tooltip-signal">
                      signal:{' '}
                      {d.signal === null ? 'n/a' : formatValue(d.signal)}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-trix-legend"
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
                  data-section="chart-line-trix-legend-item"
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
                    data-section="chart-line-trix-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-trix-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-trix-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              final TRIX {formatValue(layout.trixFinal)}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineTrix.displayName = 'ChartLineTrix';
