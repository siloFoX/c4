import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ADX_WIDTH = 560;
export const DEFAULT_CHART_LINE_ADX_HEIGHT = 360;
export const DEFAULT_CHART_LINE_ADX_PADDING = 40;
export const DEFAULT_CHART_LINE_ADX_GAP = 26;
export const DEFAULT_CHART_LINE_ADX_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_ADX_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ADX_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ADX_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ADX_PERIOD = 14;
export const DEFAULT_CHART_LINE_ADX_THRESHOLD = 25;
export const DEFAULT_CHART_LINE_ADX_VALUE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_ADX_ADX_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ADX_PLUS_DI_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADX_MINUS_DI_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ADX_THRESHOLD_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ADX_AXIS_COLOR = '#cbd5e1';

export interface ChartLineAdxPoint {
  x: number;
  value: number;
}

export interface ChartLineAdxDirectionalMovement {
  plusDM: (number | null)[];
  minusDM: (number | null)[];
  trueRange: (number | null)[];
}

export interface ChartLineAdxSeries {
  plusDI: (number | null)[];
  minusDI: (number | null)[];
  dx: (number | null)[];
  adx: (number | null)[];
}

export interface ChartLineAdxSample {
  index: number;
  x: number;
  value: number;
  plusDI: number | null;
  minusDI: number | null;
  dx: number | null;
  adx: number | null;
}

export interface ChartLineAdxRun {
  series: ChartLineAdxPoint[];
  period: number;
  plusDI: (number | null)[];
  minusDI: (number | null)[];
  dx: (number | null)[];
  adx: (number | null)[];
  samples: ChartLineAdxSample[];
  adxFinal: number;
  plusDiFinal: number;
  minusDiFinal: number;
  ok: boolean;
}

export interface ChartLineAdxPriceDot {
  index: number;
  x: number;
  value: number;
  plusDI: number | null;
  minusDI: number | null;
  dx: number | null;
  adx: number | null;
  px: number;
  py: number;
}

export interface ChartLineAdxMarker {
  index: number;
  x: number;
  adx: number;
  px: number;
  py: number;
}

export interface ChartLineAdxPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineAdxLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineAdxPanel;
  adxPanel: ChartLineAdxPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  adxYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineAdxPriceDot[];
  adxPath: string;
  plusDiPath: string;
  minusDiPath: string;
  adxMarkers: ChartLineAdxMarker[];
  thresholdY: number;
  threshold: number;
  period: number;
  adxFinal: number;
  plusDiFinal: number;
  minusDiFinal: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineAdxLayoutOptions {
  data: readonly ChartLineAdxPoint[];
  period?: number;
  threshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineAdxProps {
  data: readonly ChartLineAdxPoint[];
  period?: number;
  threshold?: number;
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
  adxColor?: string;
  plusDiColor?: string;
  minusDiColor?: string;
  thresholdColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAdx?: boolean;
  showPlusDi?: boolean;
  showMinusDi?: boolean;
  showThreshold?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineAdxPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineAdxFinitePoints(
  points: readonly ChartLineAdxPoint[] | null | undefined,
): ChartLineAdxPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineAdxPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineAdxPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Wilder's directional movement for a single-value series. For each
 * period the change `value[i] - value[i-1]` splits into a plus
 * directional movement (the positive part), a minus directional
 * movement (the magnitude of the negative part), and a true range
 * (the absolute change). Index 0 has no prior value and reads null.
 */
export function computeLineAdxDirectionalMovement(
  values: readonly number[] | null | undefined,
): ChartLineAdxDirectionalMovement {
  if (!Array.isArray(values)) {
    return { plusDM: [], minusDM: [], trueRange: [] };
  }
  const n = values.length;
  const plusDM: (number | null)[] = new Array(n).fill(null);
  const minusDM: (number | null)[] = new Array(n).fill(null);
  const trueRange: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const change = values[i]! - values[i - 1]!;
    plusDM[i] = change > 0 ? change : 0;
    minusDM[i] = change < 0 ? -change : 0;
    trueRange[i] = Math.abs(change);
  }
  return { plusDM, minusDM, trueRange };
}

/**
 * Wilder-smooth a series whose data starts at `firstDataIndex`. The
 * first smoothed value, at `firstDataIndex + period - 1`, is the
 * simple mean of the first `period` data values; later values use
 * Wilder smoothing `(prev * (period - 1) + x) / period`. Indices
 * before the window fills read null.
 */
function wilderSmoothSeries(
  src: readonly (number | null)[],
  firstDataIndex: number,
  period: number,
): (number | null)[] {
  const n = src.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const firstSmoothIndex = firstDataIndex + period - 1;
  if (firstSmoothIndex >= n || firstDataIndex < 0) return out;
  let sum = 0;
  for (let i = firstDataIndex; i <= firstSmoothIndex; i += 1) {
    sum += src[i] as number;
  }
  let smoothed = sum / period;
  out[firstSmoothIndex] = smoothed;
  for (let i = firstSmoothIndex + 1; i < n; i += 1) {
    smoothed = (smoothed * (period - 1) + (src[i] as number)) / period;
    out[i] = smoothed;
  }
  return out;
}

/**
 * Welles Wilder's Average Directional Index system. The smoothed
 * directional movements yield the directional indicators
 * `+DI = 100 * smoothedPlusDM / smoothedTR` and `-DI` likewise; the
 * directional index `DX = 100 * |+DI - -DI| / (+DI + -DI)` is then
 * Wilder-smoothed into the ADX. `+DI` / `-DI` / `DX` are defined
 * from index `period`; the ADX from index `2 * period - 1`.
 */
export function computeLineAdx(
  values: readonly number[] | null | undefined,
  period: number,
): ChartLineAdxSeries {
  if (!Array.isArray(values)) {
    return { plusDI: [], minusDI: [], dx: [], adx: [] };
  }
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const dm = computeLineAdxDirectionalMovement(values);
  const sPlusDM = wilderSmoothSeries(dm.plusDM, 1, p);
  const sMinusDM = wilderSmoothSeries(dm.minusDM, 1, p);
  const sTR = wilderSmoothSeries(dm.trueRange, 1, p);

  const plusDI: (number | null)[] = new Array(n).fill(null);
  const minusDI: (number | null)[] = new Array(n).fill(null);
  const dx: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    if (sTR[i] === null) continue;
    const tr = sTR[i] as number;
    const pdi = tr > 0 ? (100 * (sPlusDM[i] as number)) / tr : 0;
    const mdi = tr > 0 ? (100 * (sMinusDM[i] as number)) / tr : 0;
    plusDI[i] = pdi;
    minusDI[i] = mdi;
    const sum = pdi + mdi;
    dx[i] = sum > 0 ? (100 * Math.abs(pdi - mdi)) / sum : 0;
  }
  const adx = wilderSmoothSeries(dx, p, p);

  return { plusDI, minusDI, dx, adx };
}

export function runLineAdx(
  points: readonly ChartLineAdxPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineAdxRun {
  const finite = getLineAdxFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineAdxPeriod(
    options?.period ?? DEFAULT_CHART_LINE_ADX_PERIOD,
    DEFAULT_CHART_LINE_ADX_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      plusDI: [],
      minusDI: [],
      dx: [],
      adx: [],
      samples: [],
      adxFinal: NaN,
      plusDiFinal: NaN,
      minusDiFinal: NaN,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { plusDI, minusDI, dx, adx } = computeLineAdx(values, period);
  const samples: ChartLineAdxSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    plusDI: plusDI[i] ?? null,
    minusDI: minusDI[i] ?? null,
    dx: dx[i] ?? null,
    adx: adx[i] ?? null,
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (arr[i] !== null) return arr[i] as number;
    }
    return NaN;
  };

  return {
    series,
    period,
    plusDI,
    minusDI,
    dx,
    adx,
    samples,
    adxFinal: lastDefined(adx),
    plusDiFinal: lastDefined(plusDI),
    minusDiFinal: lastDefined(minusDI),
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

export function computeLineAdxLayout(
  options: ComputeLineAdxLayoutOptions,
): ChartLineAdxLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_ADX_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_ADX_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_ADX_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));
  const threshold = isFiniteNumber(options.threshold)
    ? Math.min(100, Math.max(0, options.threshold))
    : DEFAULT_CHART_LINE_ADX_THRESHOLD;

  const emptyPanel: ChartLineAdxPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineAdx(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineAdxLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    adxPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    adxYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    adxPath: '',
    plusDiPath: '',
    minusDiPath: '',
    adxMarkers: [],
    thresholdY: 0,
    threshold,
    period: run.period,
    adxFinal: NaN,
    plusDiFinal: NaN,
    minusDiFinal: NaN,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const adxH = usableHeight - priceH;
  if (priceH <= 0 || adxH <= 0) return empty;

  const pricePanel: ChartLineAdxPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const adxPanel: ChartLineAdxPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: adxH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < pyLo) pyLo = s.value;
    if (s.value > pyHi) pyHi = s.value;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectAdxY = (v: number): number =>
    adxPanel.y + adxPanel.height - (v / 100) * adxPanel.height;

  const priceDots: ChartLineAdxPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    plusDI: s.plusDI,
    minusDI: s.minusDI,
    dx: s.dx,
    adx: s.adx,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const adxMarkers: ChartLineAdxMarker[] = [];
  const adxPts: { px: number; py: number }[] = [];
  const plusDiPts: { px: number; py: number }[] = [];
  const minusDiPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    if (s.adx !== null) {
      const py = projectAdxY(s.adx);
      adxPts.push({ px, py });
      adxMarkers.push({ index: s.index, x: s.x, adx: s.adx, px, py });
    }
    if (s.plusDI !== null) {
      plusDiPts.push({ px, py: projectAdxY(s.plusDI) });
    }
    if (s.minusDI !== null) {
      minusDiPts.push({ px, py: projectAdxY(s.minusDI) });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    adxPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    adxYTicks: computeTicks(0, 100, tickCount).map((v) => ({
      value: v,
      py: projectAdxY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    adxPath: buildPath(adxPts),
    plusDiPath: buildPath(plusDiPts),
    minusDiPath: buildPath(minusDiPts),
    adxMarkers,
    thresholdY: projectAdxY(threshold),
    threshold,
    period: run.period,
    adxFinal: run.adxFinal,
    plusDiFinal: run.plusDiFinal,
    minusDiFinal: run.minusDiFinal,
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

export function describeLineAdxChart(
  data: readonly ChartLineAdxPoint[] | null | undefined,
  options?: { period?: number; formatValue?: (n: number) => string },
): string {
  const run = runLineAdx(data, options);
  if (!run.ok) return 'No data';
  const fmt = options?.formatValue ?? defaultFormatValue;
  return `Line chart with an Average Directional Index panel (period ${run.period}): ADX measures trend strength while the +DI and -DI lines show directional movement. Final ADX ${fmt(run.adxFinal)}, +DI ${fmt(run.plusDiFinal)}, -DI ${fmt(run.minusDiFinal)}, across ${run.samples.length} periods.`;
}

const ADX_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineAdx = forwardRef<HTMLDivElement, ChartLineAdxProps>(
  function ChartLineAdx(
    props: ChartLineAdxProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      threshold,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_ADX_WIDTH,
      height = DEFAULT_CHART_LINE_ADX_HEIGHT,
      padding = DEFAULT_CHART_LINE_ADX_PADDING,
      gap = DEFAULT_CHART_LINE_ADX_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_ADX_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_ADX_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_ADX_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_ADX_DOT_RADIUS,
      valueColor = DEFAULT_CHART_LINE_ADX_VALUE_COLOR,
      adxColor = DEFAULT_CHART_LINE_ADX_ADX_COLOR,
      plusDiColor = DEFAULT_CHART_LINE_ADX_PLUS_DI_COLOR,
      minusDiColor = DEFAULT_CHART_LINE_ADX_MINUS_DI_COLOR,
      thresholdColor = DEFAULT_CHART_LINE_ADX_THRESHOLD_COLOR,
      gridColor = DEFAULT_CHART_LINE_ADX_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_ADX_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showAdx = true,
      showPlusDi = true,
      showMinusDi = true,
      showThreshold = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with an Average Directional Index panel',
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
        computeLineAdxLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(threshold) ? { threshold } : {}),
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
        threshold,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineAdxChart(data, {
          formatValue,
          ...(isFiniteNumber(period) ? { period } : {}),
        }),
      [ariaDescription, data, period, formatValue],
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
          data-section="chart-line-adx"
          data-empty="true"
          data-period={layout.period}
          data-animate={animate ? 'true' : 'false'}
        >
          <span id={descId} data-section="chart-line-adx-aria-desc" style={ADX_SR_STYLE}>
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const ap = layout.adxPanel;
    const valueVisible = !hiddenSet.has('value');
    const adxVisible = showAdx && !hiddenSet.has('adx');
    const plusDiVisible = showPlusDi && !hiddenSet.has('plusdi');
    const minusDiVisible = showMinusDi && !hiddenSet.has('minusdi');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'value', label: 'Value', color: valueColor },
      { id: 'adx', label: 'ADX', color: adxColor },
      { id: 'plusdi', label: '+DI', color: plusDiColor },
      { id: 'minusdi', label: '-DI', color: minusDiColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-adx"
        data-empty="false"
        data-period={layout.period}
        data-adx-final={layout.adxFinal}
        data-plus-di-final={layout.plusDiFinal}
        data-minus-di-final={layout.minusDiFinal}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-adx-aria-desc" style={ADX_SR_STYLE}>
          {summary}
        </span>

        <div
          data-section="chart-line-adx-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-adx-badge"
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
                data-section="chart-line-adx-badge-icon"
                aria-hidden="true"
                style={{ color: adxColor }}
              >
                ADX
              </span>
              <span data-section="chart-line-adx-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-adx-badge-final">
                ADX={formatValue(layout.adxFinal)}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-adx-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-adx-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-adx-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.adxYTicks.map((t, i) => (
                  <line
                    key={`agy-${i}`}
                    data-section="chart-line-adx-grid-line"
                    data-panel="adx"
                    x1={ap.x}
                    x2={ap.x + ap.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showThreshold ? (
              <g data-section="chart-line-adx-threshold">
                <line
                  data-section="chart-line-adx-threshold-line"
                  data-threshold={layout.threshold}
                  x1={ap.x}
                  x2={ap.x + ap.width}
                  y1={layout.thresholdY}
                  y2={layout.thresholdY}
                  stroke={thresholdColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <text
                  data-section="chart-line-adx-threshold-label"
                  x={ap.x + ap.width - 2}
                  y={layout.thresholdY - 3}
                  textAnchor="end"
                  fontSize={9}
                  fill={thresholdColor}
                  stroke="none"
                >
                  trend {formatValue(layout.threshold)}
                </text>
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-adx-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: ap, name: 'adx', yt: layout.adxYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-adx-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-adx-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-adx-axis"
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
                        data-section="chart-line-adx-tick"
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
                          data-section="chart-line-adx-tick-label"
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
                <g data-section="chart-line-adx-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-adx-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={ap.y + ap.height}
                        y2={ap.y + ap.height + 4}
                      />
                      <text
                        data-section="chart-line-adx-tick-label"
                        data-axis="x"
                        x={t.px}
                        y={ap.y + ap.height + 14}
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

            <g data-section="chart-line-adx-panel-labels">
              <text
                data-section="chart-line-adx-panel-label"
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
                data-section="chart-line-adx-panel-label"
                data-panel="adx"
                x={ap.x + ap.width / 2}
                y={ap.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                ADX
              </text>
            </g>

            {valueVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Value line"
                data-section="chart-line-adx-value-path"
                d={layout.pricePath}
                fill="none"
                stroke={valueColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {valueVisible && showDots ? (
              <g data-section="chart-line-adx-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-adx-dot"
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

            {plusDiVisible && layout.plusDiPath ? (
              <path
                data-section="chart-line-adx-plus-di-line"
                d={layout.plusDiPath}
                fill="none"
                stroke={plusDiColor}
                strokeWidth={1.5}
              />
            ) : null}

            {minusDiVisible && layout.minusDiPath ? (
              <path
                data-section="chart-line-adx-minus-di-line"
                d={layout.minusDiPath}
                fill="none"
                stroke={minusDiColor}
                strokeWidth={1.5}
              />
            ) : null}

            {adxVisible && layout.adxPath ? (
              <path
                data-section="chart-line-adx-adx-line"
                d={layout.adxPath}
                fill="none"
                stroke={adxColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {adxVisible ? (
              <g data-section="chart-line-adx-markers">
                {layout.adxMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`ADX at x ${formatX(m.x)}: ${formatValue(m.adx)}`}
                      data-section="chart-line-adx-marker"
                      data-point-index={m.index}
                      data-adx={m.adx}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={adxColor}
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
                    data-section="chart-line-adx-tooltip"
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
                    <div data-section="chart-line-adx-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-adx-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-adx-tooltip-plus-di">
                      +DI:{' '}
                      {d.plusDI === null ? 'n/a' : formatValue(d.plusDI)}
                    </div>
                    <div data-section="chart-line-adx-tooltip-minus-di">
                      -DI:{' '}
                      {d.minusDI === null ? 'n/a' : formatValue(d.minusDI)}
                    </div>
                    <div data-section="chart-line-adx-tooltip-dx">
                      DX: {d.dx === null ? 'n/a' : formatValue(d.dx)}
                    </div>
                    <div data-section="chart-line-adx-tooltip-adx">
                      ADX: {d.adx === null ? 'n/a' : formatValue(d.adx)}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-adx-legend"
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
                  data-section="chart-line-adx-legend-item"
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
                    data-section="chart-line-adx-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-adx-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-adx-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              final ADX {formatValue(layout.adxFinal)}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineAdx.displayName = 'ChartLineAdx';
