import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ELDER_RAY_WIDTH = 560;
export const DEFAULT_CHART_LINE_ELDER_RAY_HEIGHT = 360;
export const DEFAULT_CHART_LINE_ELDER_RAY_PADDING = 40;
export const DEFAULT_CHART_LINE_ELDER_RAY_GAP = 26;
export const DEFAULT_CHART_LINE_ELDER_RAY_PRICE_PANEL_RATIO = 0.54;
export const DEFAULT_CHART_LINE_ELDER_RAY_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ELDER_RAY_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ELDER_RAY_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ELDER_RAY_EMA_PERIOD = 13;
export const DEFAULT_CHART_LINE_ELDER_RAY_CLOSE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_ELDER_RAY_EMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ELDER_RAY_BULL_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ELDER_RAY_BEAR_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ELDER_RAY_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_ELDER_RAY_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ELDER_RAY_AXIS_COLOR = '#cbd5e1';

export interface ChartLineElderRayPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLineElderRaySample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  ema: number | null;
  bullPower: number | null;
  bearPower: number | null;
}

export interface ChartLineElderRayRun {
  series: ChartLineElderRayPoint[];
  emaPeriod: number;
  ema: (number | null)[];
  bullPower: (number | null)[];
  bearPower: (number | null)[];
  samples: ChartLineElderRaySample[];
  bullFinal: number;
  bearFinal: number;
  bullMax: number;
  bearMin: number;
  bullPositiveCount: number;
  bearNegativeCount: number;
  ok: boolean;
}

export interface ChartLineElderRayPriceDot {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  ema: number | null;
  bullPower: number | null;
  bearPower: number | null;
  px: number;
  py: number;
}

export interface ChartLineElderRayMarker {
  index: number;
  x: number;
  power: number;
  px: number;
  py: number;
}

export interface ChartLineElderRayPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineElderRayLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineElderRayPanel;
  rayPanel: ChartLineElderRayPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  rayYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  rayYBound: number;
  closePath: string;
  emaPath: string;
  priceDots: ChartLineElderRayPriceDot[];
  bullPath: string;
  bearPath: string;
  bullMarkers: ChartLineElderRayMarker[];
  bearMarkers: ChartLineElderRayMarker[];
  zeroY: number;
  emaPeriod: number;
  bullFinal: number;
  bearFinal: number;
  bullMax: number;
  bearMin: number;
  bullPositiveCount: number;
  bearNegativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineElderRayLayoutOptions {
  data: readonly ChartLineElderRayPoint[];
  emaPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineElderRayProps {
  data: readonly ChartLineElderRayPoint[];
  emaPeriod?: number;
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
  closeColor?: string;
  emaColor?: string;
  bullColor?: string;
  bearColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showEma?: boolean;
  showBull?: boolean;
  showBear?: boolean;
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
  onPointClick?: (payload: { point: ChartLineElderRayPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineElderRayFinitePoints(
  points: readonly ChartLineElderRayPoint[] | null | undefined,
): ChartLineElderRayPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineElderRayPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineElderRayPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * An exponential moving average over `period` values, tolerating
 * leading `null` placeholders. The seed is the simple mean of the
 * first `period` defined values placed at that value's index; each
 * later defined value folds in at weight `2 / (period + 1)`.
 */
export function computeLineElderRayEma(
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
 * Alexander Elder's Elder Ray. An EMA of the close is the trend
 * baseline; bull power is each bar's high minus the baseline (how far
 * buyers can lift price above the trend) and bear power is its low
 * minus the baseline (how far sellers can press it below). Both swing
 * around zero.
 */
export function computeLineElderRay(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
  emaPeriod: number,
): {
  ema: (number | null)[];
  bullPower: (number | null)[];
  bearPower: (number | null)[];
} {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes)
  ) {
    return { ema: [], bullPower: [], bearPower: [] };
  }
  const n = Math.min(highs.length, lows.length, closes.length);
  const ema = computeLineElderRayEma(closes.slice(0, n), emaPeriod);
  const bullPower: (number | null)[] = new Array(n).fill(null);
  const bearPower: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const e = ema[i];
    if (isDefined(e)) {
      bullPower[i] = highs[i]! - e;
      bearPower[i] = lows[i]! - e;
    }
  }
  return { ema, bullPower, bearPower };
}

export function runLineElderRay(
  points: readonly ChartLineElderRayPoint[] | null | undefined,
  options?: { emaPeriod?: number },
): ChartLineElderRayRun {
  const finite = getLineElderRayFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const emaPeriod = normalizeLineElderRayPeriod(
    options?.emaPeriod ?? DEFAULT_CHART_LINE_ELDER_RAY_EMA_PERIOD,
    DEFAULT_CHART_LINE_ELDER_RAY_EMA_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      emaPeriod,
      ema: [],
      bullPower: [],
      bearPower: [],
      samples: [],
      bullFinal: NaN,
      bearFinal: NaN,
      bullMax: NaN,
      bearMin: NaN,
      bullPositiveCount: 0,
      bearNegativeCount: 0,
      ok: false,
    };
  }

  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const closes = series.map((p) => p.close);
  const { ema, bullPower, bearPower } = computeLineElderRay(
    highs,
    lows,
    closes,
    emaPeriod,
  );

  const samples: ChartLineElderRaySample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    high: p.high,
    low: p.low,
    close: p.close,
    ema: ema[i] ?? null,
    bullPower: bullPower[i] ?? null,
    bearPower: bearPower[i] ?? null,
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let bullMax = NaN;
  let bearMin = NaN;
  let bullPositiveCount = 0;
  let bearNegativeCount = 0;
  for (const s of samples) {
    if (s.bullPower !== null) {
      if (Number.isNaN(bullMax) || s.bullPower > bullMax) {
        bullMax = s.bullPower;
      }
      if (s.bullPower > 0) bullPositiveCount += 1;
    }
    if (s.bearPower !== null) {
      if (Number.isNaN(bearMin) || s.bearPower < bearMin) {
        bearMin = s.bearPower;
      }
      if (s.bearPower < 0) bearNegativeCount += 1;
    }
  }

  return {
    series = [],
    emaPeriod,
    ema,
    bullPower,
    bearPower,
    samples,
    bullFinal: lastDefined(bullPower),
    bearFinal: lastDefined(bearPower),
    bullMax,
    bearMin,
    bullPositiveCount,
    bearNegativeCount,
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

export function computeLineElderRayLayout(
  options: ComputeLineElderRayLayoutOptions,
): ChartLineElderRayLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_ELDER_RAY_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_ELDER_RAY_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_ELDER_RAY_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineElderRayPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineElderRay(data, {
    ...(isFiniteNumber(options.emaPeriod)
      ? { emaPeriod: options.emaPeriod }
      : {}),
  });
  const empty: ChartLineElderRayLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    rayPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    rayYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    rayYBound: 0,
    closePath: '',
    emaPath: '',
    priceDots: [],
    bullPath: '',
    bearPath: '',
    bullMarkers: [],
    bearMarkers: [],
    zeroY: 0,
    emaPeriod: run.emaPeriod,
    bullFinal: NaN,
    bearFinal: NaN,
    bullMax: NaN,
    bearMin: NaN,
    bullPositiveCount: 0,
    bearNegativeCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const rayH = usableHeight - priceH;
  if (priceH <= 0 || rayH <= 0) return empty;

  const pricePanel: ChartLineElderRayPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const rayPanel: ChartLineElderRayPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: rayH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let bound = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.close < pyLo) pyLo = s.close;
    if (s.close > pyHi) pyHi = s.close;
    if (s.ema !== null) {
      if (s.ema < pyLo) pyLo = s.ema;
      if (s.ema > pyHi) pyHi = s.ema;
    }
    if (s.bullPower !== null && Math.abs(s.bullPower) > bound) {
      bound = Math.abs(s.bullPower);
    }
    if (s.bearPower !== null && Math.abs(s.bearPower) > bound) {
      bound = Math.abs(s.bearPower);
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
  const projectRayY = (v: number): number =>
    rayPanel.y +
    rayPanel.height -
    ((v + bound) / (2 * bound)) * rayPanel.height;

  const priceDots: ChartLineElderRayPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    high: s.high,
    low: s.low,
    close: s.close,
    ema: s.ema,
    bullPower: s.bullPower,
    bearPower: s.bearPower,
    px: projectX(s.x),
    py: projectPriceY(s.close),
  }));

  const emaPts: { px: number; py: number }[] = [];
  const bullPts: { px: number; py: number }[] = [];
  const bearPts: { px: number; py: number }[] = [];
  const bullMarkers: ChartLineElderRayMarker[] = [];
  const bearMarkers: ChartLineElderRayMarker[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    if (s.ema !== null) emaPts.push({ px, py: projectPriceY(s.ema) });
    if (s.bullPower !== null) {
      const py = projectRayY(s.bullPower);
      bullPts.push({ px, py });
      bullMarkers.push({ index: s.index, x: s.x, power: s.bullPower, px, py });
    }
    if (s.bearPower !== null) {
      const py = projectRayY(s.bearPower);
      bearPts.push({ px, py });
      bearMarkers.push({ index: s.index, x: s.x, power: s.bearPower, px, py });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    rayPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    rayYTicks: computeTicks(-bound, bound, tickCount).map((v) => ({
      value: v,
      py: projectRayY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    rayYBound: bound,
    closePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    emaPath: buildPath(emaPts),
    priceDots,
    bullPath: buildPath(bullPts),
    bearPath: buildPath(bearPts),
    bullMarkers,
    bearMarkers,
    zeroY: projectRayY(0),
    emaPeriod: run.emaPeriod,
    bullFinal: run.bullFinal,
    bearFinal: run.bearFinal,
    bullMax: run.bullMax,
    bearMin: run.bearMin,
    bullPositiveCount: run.bullPositiveCount,
    bearNegativeCount: run.bearNegativeCount,
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

export function describeLineElderRayChart(
  data: readonly ChartLineElderRayPoint[] | null | undefined,
  options?: { emaPeriod?: number },
): string {
  const run = runLineElderRay(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with an Elder Ray panel (EMA ${run.emaPeriod}): bull power is each bar's high minus the EMA baseline and bear power is its low minus the baseline, measuring how far buyers and sellers can push price past the trend; both swing around zero. ${run.bullPositiveCount} bars of positive bull power and ${run.bearNegativeCount} bars of negative bear power across ${run.samples.length} periods.`;
}

const ELDER_RAY_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineElderRay = forwardRef<
  HTMLDivElement,
  ChartLineElderRayProps
>(function ChartLineElderRay(
  props: ChartLineElderRayProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    emaPeriod,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_ELDER_RAY_WIDTH,
    height = DEFAULT_CHART_LINE_ELDER_RAY_HEIGHT,
    padding = DEFAULT_CHART_LINE_ELDER_RAY_PADDING,
    gap = DEFAULT_CHART_LINE_ELDER_RAY_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_ELDER_RAY_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_ELDER_RAY_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ELDER_RAY_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ELDER_RAY_DOT_RADIUS,
    closeColor = DEFAULT_CHART_LINE_ELDER_RAY_CLOSE_COLOR,
    emaColor = DEFAULT_CHART_LINE_ELDER_RAY_EMA_COLOR,
    bullColor = DEFAULT_CHART_LINE_ELDER_RAY_BULL_COLOR,
    bearColor = DEFAULT_CHART_LINE_ELDER_RAY_BEAR_COLOR,
    zeroColor = DEFAULT_CHART_LINE_ELDER_RAY_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_ELDER_RAY_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ELDER_RAY_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showEma = true,
    showBull = true,
    showBear = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with an Elder Ray panel',
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
      computeLineElderRayLayout({
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        ...(isFiniteNumber(emaPeriod) ? { emaPeriod } : {}),
      }),
    [data, width, height, padding, gap, pricePanelRatio, tickCount, emaPeriod],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineElderRayChart(data, {
        ...(isFiniteNumber(emaPeriod) ? { emaPeriod } : {}),
      }),
    [ariaDescription, data, emaPeriod],
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
        data-section="chart-line-elder-ray"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-elder-ray-aria-desc"
          style={ELDER_RAY_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const rp = layout.rayPanel;
  const closeVisible = !hiddenSet.has('close');
  const emaVisible = showEma && !hiddenSet.has('ema');
  const bullVisible = showBull && !hiddenSet.has('bull');
  const bearVisible = showBear && !hiddenSet.has('bear');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'close', label: 'Close', color: closeColor },
    { id: 'ema', label: 'EMA', color: emaColor },
    { id: 'bull', label: 'Bull Power', color: bullColor },
    { id: 'bear', label: 'Bear Power', color: bearColor },
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
      data-section="chart-line-elder-ray"
      data-empty="false"
      data-ema-period={layout.emaPeriod}
      data-bull-final={layout.bullFinal}
      data-bear-final={layout.bearFinal}
      data-bull-positive-count={layout.bullPositiveCount}
      data-bear-negative-count={layout.bearNegativeCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-elder-ray-aria-desc"
        style={ELDER_RAY_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-elder-ray-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-elder-ray-badge"
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
              data-section="chart-line-elder-ray-badge-icon"
              aria-hidden="true"
              style={{ color: emaColor }}
            >
              ELDER RAY
            </span>
            <span data-section="chart-line-elder-ray-badge-ema">
              ema={layout.emaPeriod}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-elder-ray-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-elder-ray-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`pgy-${i}`}
                  data-section="chart-line-elder-ray-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.rayYTicks.map((t, i) => (
                <line
                  key={`rgy-${i}`}
                  data-section="chart-line-elder-ray-grid-line"
                  data-panel="ray"
                  x1={rp.x}
                  x2={rp.x + rp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-elder-ray-zero-line"
              x1={rp.x}
              x2={rp.x + rp.width}
              y1={layout.zeroY}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-elder-ray-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              {[
                { panel: pp, name: 'price', yt: layout.priceYTicks },
                { panel: rp, name: 'ray', yt: layout.rayYTicks },
              ].map((cfg) => (
                <g
                  key={`axis-${cfg.name}`}
                  data-section="chart-line-elder-ray-axis-group"
                  data-panel={cfg.name}
                >
                  <line
                    data-section="chart-line-elder-ray-axis"
                    data-panel={cfg.name}
                    data-axis="x"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y + cfg.panel.height}
                    x2={cfg.panel.x + cfg.panel.width}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  <line
                    data-section="chart-line-elder-ray-axis"
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
                      data-section="chart-line-elder-ray-tick"
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
                        data-section="chart-line-elder-ray-tick-label"
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
              <g data-section="chart-line-elder-ray-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`tx-${i}`}
                    data-section="chart-line-elder-ray-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={rp.y + rp.height}
                      y2={rp.y + rp.height + 4}
                    />
                    <text
                      data-section="chart-line-elder-ray-tick-label"
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
                  </g>
                ))}
              </g>
            </g>
          ) : null}

          <g data-section="chart-line-elder-ray-panel-labels">
            <text
              data-section="chart-line-elder-ray-panel-label"
              data-panel="price"
              x={pp.x + pp.width / 2}
              y={pp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Price
            </text>
            <text
              data-section="chart-line-elder-ray-panel-label"
              data-panel="ray"
              x={rp.x + rp.width / 2}
              y={rp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Elder Ray
            </text>
          </g>

          {emaVisible && layout.emaPath ? (
            <path
              data-section="chart-line-elder-ray-ema-path"
              d={layout.emaPath}
              fill="none"
              stroke={emaColor}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {closeVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Close line"
              data-section="chart-line-elder-ray-close-path"
              d={layout.closePath}
              fill="none"
              stroke={closeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {closeVisible && showDots ? (
            <g data-section="chart-line-elder-ray-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                    data-section="chart-line-elder-ray-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-value={d.close}
                    cx={d.px}
                    cy={d.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={closeColor}
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

          {bullVisible && layout.bullPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Bull power line"
              data-section="chart-line-elder-ray-bull-line"
              d={layout.bullPath}
              fill="none"
              stroke={bullColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {bearVisible && layout.bearPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Bear power line"
              data-section="chart-line-elder-ray-bear-line"
              d={layout.bearPath}
              fill="none"
              stroke={bearColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {bullVisible ? (
            <g data-section="chart-line-elder-ray-bull-markers">
              {layout.bullMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`bull-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bull power at x ${formatX(m.x)}: ${formatValue(m.power)}`}
                    data-section="chart-line-elder-ray-marker"
                    data-kind="bull"
                    data-point-index={m.index}
                    data-power={m.power}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={bullColor}
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

          {bearVisible ? (
            <g data-section="chart-line-elder-ray-bear-markers">
              {layout.bearMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`bear-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bear power at x ${formatX(m.x)}: ${formatValue(m.power)}`}
                    data-section="chart-line-elder-ray-marker"
                    data-kind="bear"
                    data-point-index={m.index}
                    data-power={m.power}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={bearColor}
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
                  data-section="chart-line-elder-ray-tooltip"
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
                  <div data-section="chart-line-elder-ray-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div data-section="chart-line-elder-ray-tooltip-high">
                    high: {formatValue(d.high)}
                  </div>
                  <div data-section="chart-line-elder-ray-tooltip-low">
                    low: {formatValue(d.low)}
                  </div>
                  <div
                    data-section="chart-line-elder-ray-tooltip-close"
                    style={{ fontWeight: 600 }}
                  >
                    close: {formatValue(d.close)}
                  </div>
                  <div data-section="chart-line-elder-ray-tooltip-ema">
                    ema: {d.ema === null ? 'n/a' : formatValue(d.ema)}
                  </div>
                  <div data-section="chart-line-elder-ray-tooltip-bull">
                    bull:{' '}
                    {d.bullPower === null ? 'n/a' : formatValue(d.bullPower)}
                  </div>
                  <div data-section="chart-line-elder-ray-tooltip-bear">
                    bear:{' '}
                    {d.bearPower === null ? 'n/a' : formatValue(d.bearPower)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-elder-ray-legend"
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
                data-section="chart-line-elder-ray-legend-item"
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
                  data-section="chart-line-elder-ray-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-elder-ray-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-elder-ray-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.bullPositiveCount} bull+, {layout.bearNegativeCount} bear-
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineElderRay.displayName = 'ChartLineElderRay';
