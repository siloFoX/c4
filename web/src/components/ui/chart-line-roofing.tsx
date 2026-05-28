import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ROOFING_WIDTH = 560;
export const DEFAULT_CHART_LINE_ROOFING_HEIGHT = 360;
export const DEFAULT_CHART_LINE_ROOFING_PADDING = 40;
export const DEFAULT_CHART_LINE_ROOFING_GAP = 12;
export const DEFAULT_CHART_LINE_ROOFING_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ROOFING_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ROOFING_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ROOFING_HP_PERIOD = 48;
export const DEFAULT_CHART_LINE_ROOFING_SS_PERIOD = 10;
export const DEFAULT_CHART_LINE_ROOFING_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_ROOFING_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_ROOFING_ROOFING_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ROOFING_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ROOFING_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ROOFING_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ROOFING_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ROOFING_AXIS_COLOR = '#cbd5e1';

export type ChartLineRoofingSign = 'positive' | 'negative' | 'zero';

export interface ChartLineRoofingPoint {
  x: number;
  value: number;
}

export interface ChartLineRoofingSmootherCoefficients {
  a1: number;
  b1: number;
  c1: number;
  c2: number;
  c3: number;
}

export interface ChartLineRoofingSample {
  index: number;
  x: number;
  value: number;
  highpass: number;
  roofing: number;
  sign: ChartLineRoofingSign;
}

export interface ChartLineRoofingRun {
  series: ChartLineRoofingPoint[];
  hpPeriod: number;
  ssPeriod: number;
  highpass: number[];
  roofing: number[];
  samples: ChartLineRoofingSample[];
  roofingFinal: number;
  roofingMin: number;
  roofingMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineRoofingPriceDot {
  index: number;
  x: number;
  value: number;
  highpass: number;
  roofing: number;
  sign: ChartLineRoofingSign;
  px: number;
  py: number;
}

export interface ChartLineRoofingMarker {
  index: number;
  x: number;
  roofing: number;
  sign: ChartLineRoofingSign;
  px: number;
  py: number;
}

export interface ChartLineRoofingPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineRoofingLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineRoofingPanel;
  roofingPanel: ChartLineRoofingPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  roofingYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  roofingYMin: number;
  roofingYMax: number;
  pricePath: string;
  priceDots: ChartLineRoofingPriceDot[];
  roofingPath: string;
  roofingMarkers: ChartLineRoofingMarker[];
  zeroY: number;
  hpPeriod: number;
  ssPeriod: number;
  roofingFinal: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineRoofingLayoutOptions {
  data: readonly ChartLineRoofingPoint[];
  hpPeriod?: number;
  ssPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineRoofingProps {
  data: readonly ChartLineRoofingPoint[];
  hpPeriod?: number;
  ssPeriod?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  roofingColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRoofing?: boolean;
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
  onPointClick?: (payload: { point: ChartLineRoofingPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineRoofingFinitePoints(
  points: readonly ChartLineRoofingPoint[] | null | undefined,
): ChartLineRoofingPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineRoofingPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a filter period to a positive integer. A non-finite or
 * sub-1 value falls back to `fallback`; a fractional value floors.
 */
export function normalizeLineRoofingPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The alpha coefficient of the Roofing filter's two-pole high-pass
 * stage. With `angle = 0.707 * 2 * PI / hpPeriod`:
 *
 *   alpha1 = (cos(angle) + sin(angle) - 1) / cos(angle)
 */
export function computeLineRoofingHighpassAlpha(hpPeriod: number): number {
  const p = normalizeLineRoofingPeriod(
    hpPeriod,
    DEFAULT_CHART_LINE_ROOFING_HP_PERIOD,
  );
  const angle = (0.707 * 2 * Math.PI) / p;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  return (cosA + sinA - 1) / cosA;
}

/**
 * Stage one of the Roofing filter: a two-pole high-pass that strips
 * the low-frequency trend ("wander") out of the price, leaving a
 * detrended series centred on zero.
 *
 *   HP[i] = (1 - alpha1/2)^2 * (price[i] - 2*price[i-1] + price[i-2])
 *         + 2*(1 - alpha1) * HP[i-1] - (1 - alpha1)^2 * HP[i-2]
 *
 * The first two bars seed at zero. A flat price series stays at
 * zero throughout.
 */
export function computeLineRoofingHighpass(
  values: readonly number[] | null | undefined,
  hpPeriod: number,
): number[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  if (n === 0) return [];
  const out: number[] = new Array(n);
  out[0] = 0;
  if (n === 1) return out;
  out[1] = 0;
  const alpha1 = computeLineRoofingHighpassAlpha(hpPeriod);
  const k = 1 - alpha1 / 2;
  const inputCoeff = k * k;
  const oneMinusA = 1 - alpha1;
  const fb1 = 2 * oneMinusA;
  const fb2 = oneMinusA * oneMinusA;
  for (let i = 2; i < n; i += 1) {
    out[i] =
      inputCoeff * (values[i]! - 2 * values[i - 1]! + values[i - 2]!) +
      fb1 * out[i - 1]! -
      fb2 * out[i - 2]!;
  }
  return out;
}

/**
 * The coefficients of the Super Smoother stage -- a two-pole
 * low-pass filter. With `arg = 1.414 * PI / ssPeriod`:
 * `a1 = exp(-arg)`, `b1 = 2*a1*cos(arg)`, `c2 = b1`,
 * `c3 = -(a1*a1)`, `c1 = 1 - c2 - c3`.
 */
export function computeLineRoofingSmootherCoefficients(
  ssPeriod: number,
): ChartLineRoofingSmootherCoefficients {
  const p = normalizeLineRoofingPeriod(
    ssPeriod,
    DEFAULT_CHART_LINE_ROOFING_SS_PERIOD,
  );
  const arg = (1.414 * Math.PI) / p;
  const a1 = Math.exp(-arg);
  const b1 = 2 * a1 * Math.cos(arg);
  const c2 = b1;
  const c3 = -(a1 * a1);
  const c1 = 1 - c2 - c3;
  return { a1, b1, c1, c2, c3 };
}

/**
 * Stage two of the Roofing filter: an Ehlers Super Smoother that
 * strips the high-frequency noise. Applied to the high-pass output
 * it caps the passband from above, leaving a clean band-pass series.
 */
export function computeLineRoofingSmoother(
  values: readonly number[] | null | undefined,
  ssPeriod: number,
): number[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  if (n === 0) return [];
  const out: number[] = new Array(n);
  out[0] = values[0]!;
  if (n === 1) return out;
  out[1] = values[1]!;
  const { c1, c2, c3 } = computeLineRoofingSmootherCoefficients(ssPeriod);
  for (let i = 2; i < n; i += 1) {
    out[i] =
      (c1 * (values[i]! + values[i - 1]!)) / 2 +
      c2 * out[i - 1]! +
      c3 * out[i - 2]!;
  }
  return out;
}

/**
 * The full Ehlers Roofing filter -- the Super Smoother of the
 * high-pass of the price. The high-pass removes the trend and the
 * smoother removes the noise, so the output is a clean band-pass
 * oscillator centred on zero.
 */
export function computeLineRoofing(
  values: readonly number[] | null | undefined,
  hpPeriod: number,
  ssPeriod: number,
): number[] {
  return computeLineRoofingSmoother(
    computeLineRoofingHighpass(values, hpPeriod),
    ssPeriod,
  );
}

function classifySign(v: number): ChartLineRoofingSign {
  if (v > 0) return 'positive';
  if (v < 0) return 'negative';
  return 'zero';
}

export function runLineRoofing(
  points: readonly ChartLineRoofingPoint[] | null | undefined,
  options?: { hpPeriod?: number; ssPeriod?: number },
): ChartLineRoofingRun {
  const finite = getLineRoofingFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const hpPeriod = normalizeLineRoofingPeriod(
    options?.hpPeriod ?? DEFAULT_CHART_LINE_ROOFING_HP_PERIOD,
    DEFAULT_CHART_LINE_ROOFING_HP_PERIOD,
  );
  const ssPeriod = normalizeLineRoofingPeriod(
    options?.ssPeriod ?? DEFAULT_CHART_LINE_ROOFING_SS_PERIOD,
    DEFAULT_CHART_LINE_ROOFING_SS_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      hpPeriod,
      ssPeriod,
      highpass: [],
      roofing: [],
      samples: [],
      roofingFinal: NaN,
      roofingMin: NaN,
      roofingMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const highpass = computeLineRoofingHighpass(values, hpPeriod);
  const roofing = computeLineRoofingSmoother(highpass, ssPeriod);

  const samples: ChartLineRoofingSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    highpass: highpass[i]!,
    roofing: roofing[i]!,
    sign: classifySign(roofing[i]!),
  }));

  let roofingMin = Number.POSITIVE_INFINITY;
  let roofingMax = Number.NEGATIVE_INFINITY;
  let positiveCount = 0;
  let negativeCount = 0;
  for (const s of samples) {
    if (s.roofing < roofingMin) roofingMin = s.roofing;
    if (s.roofing > roofingMax) roofingMax = s.roofing;
    if (s.sign === 'positive') positiveCount += 1;
    if (s.sign === 'negative') negativeCount += 1;
  }

  return {
    series = [],
    hpPeriod,
    ssPeriod,
    highpass,
    roofing,
    samples,
    roofingFinal: roofing[roofing.length - 1]!,
    roofingMin,
    roofingMax,
    positiveCount,
    negativeCount,
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

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function computeLineRoofingLayout(
  options: ComputeLineRoofingLayoutOptions,
): ChartLineRoofingLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_ROOFING_GAP,
    tickCount = DEFAULT_CHART_LINE_ROOFING_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_ROOFING_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineRoofing(data, {
    ...(isFiniteNumber(options.hpPeriod) ? { hpPeriod: options.hpPeriod } : {}),
    ...(isFiniteNumber(options.ssPeriod) ? { ssPeriod: options.ssPeriod } : {}),
  });

  const emptyPanel: ChartLineRoofingPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineRoofingLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    roofingPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    roofingYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    roofingYMin: 0,
    roofingYMax: 0,
    pricePath: '',
    priceDots: [],
    roofingPath: '',
    roofingMarkers: [],
    zeroY: 0,
    hpPeriod: run.hpPeriod,
    ssPeriod: run.ssPeriod,
    roofingFinal: NaN,
    positiveCount: 0,
    negativeCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const roofingHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineRoofingPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const roofingPanel: ChartLineRoofingPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: roofingHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < priceLo) priceLo = s.value;
    if (s.value > priceHi) priceHi = s.value;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }

  let bound = Math.max(Math.abs(run.roofingMin), Math.abs(run.roofingMax));
  if (!isFiniteNumber(bound) || bound <= 0) bound = 1;
  const roofingLo = -bound;
  const roofingHi = bound;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const roofingRange = roofingHi - roofingLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y + pricePanel.height - ((v - priceLo) / priceRange) * pricePanel.height;
  const projectRoofingY = (v: number): number =>
    roofingPanel.y +
    roofingPanel.height -
    ((v - roofingLo) / roofingRange) * roofingPanel.height;

  const priceDots: ChartLineRoofingPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    highpass: s.highpass,
    roofing: s.roofing,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const roofingMarkers: ChartLineRoofingMarker[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    roofing: s.roofing,
    sign: s.sign,
    px: projectX(s.x),
    py: projectRoofingY(s.roofing),
  }));

  return {
    ok: true,
    width,
    height,
    pricePanel,
    roofingPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    roofingYTicks: computeTicks(roofingLo, roofingHi, tickCount).map((v) => ({
      value: v,
      py: projectRoofingY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    roofingYMin: roofingLo,
    roofingYMax: roofingHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    roofingPath: buildPath(
      roofingMarkers.map((m) => ({ px: m.px, py: m.py })),
    ),
    roofingMarkers,
    zeroY: projectRoofingY(0),
    hpPeriod: run.hpPeriod,
    ssPeriod: run.ssPeriod,
    roofingFinal: run.roofingFinal,
    positiveCount: run.positiveCount,
    negativeCount: run.negativeCount,
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

export function describeLineRoofingChart(
  data: readonly ChartLineRoofingPoint[] | null | undefined,
  options?: { hpPeriod?: number; ssPeriod?: number },
): string {
  const run = runLineRoofing(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with an Ehlers Roofing filter (high-pass ${run.hpPeriod}, smoother ${run.ssPeriod}): the top panel plots the raw price; the bottom panel plots the Roofing filter, a band-pass oscillator. Stage one is a two-pole high-pass that strips the low-frequency trend; stage two is a Super Smoother that strips the high-frequency noise. Combining the high-pass and the smoother leaves only a clean band of cycle frequencies, an oscillator centred on zero. The filter reads positive on ${run.positiveCount} bars and negative on ${run.negativeCount} across ${run.samples.length} bars.`;
}

const ROOFING_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineRoofing = forwardRef<
  HTMLDivElement,
  ChartLineRoofingProps
>(function ChartLineRoofing(
  props: ChartLineRoofingProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    hpPeriod,
    ssPeriod,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_ROOFING_WIDTH,
    height = DEFAULT_CHART_LINE_ROOFING_HEIGHT,
    padding = DEFAULT_CHART_LINE_ROOFING_PADDING,
    gap = DEFAULT_CHART_LINE_ROOFING_GAP,
    tickCount = DEFAULT_CHART_LINE_ROOFING_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_ROOFING_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_ROOFING_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ROOFING_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ROOFING_PRICE_COLOR,
    roofingColor = DEFAULT_CHART_LINE_ROOFING_ROOFING_COLOR,
    positiveColor = DEFAULT_CHART_LINE_ROOFING_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_ROOFING_NEGATIVE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_ROOFING_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_ROOFING_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ROOFING_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRoofing = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Two-panel chart with an Ehlers Roofing filter',
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
      computeLineRoofingLayout({
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        ...(isFiniteNumber(hpPeriod) ? { hpPeriod } : {}),
        ...(isFiniteNumber(ssPeriod) ? { ssPeriod } : {}),
      }),
    [data, width, height, padding, gap, tickCount, pricePanelRatio, hpPeriod, ssPeriod],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineRoofingChart(data, {
        ...(isFiniteNumber(hpPeriod) ? { hpPeriod } : {}),
        ...(isFiniteNumber(ssPeriod) ? { ssPeriod } : {}),
      }),
    [ariaDescription, data, hpPeriod, ssPeriod],
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
        data-section="chart-line-roofing"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-roofing-aria-desc"
          style={ROOFING_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const rp = layout.roofingPanel;
  const priceVisible = !hiddenSet.has('price');
  const roofingVisible = showRoofing && !hiddenSet.has('roofing');

  const signColor = (sign: ChartLineRoofingSign): string =>
    sign === 'positive'
      ? positiveColor
      : sign === 'negative'
        ? negativeColor
        : zeroColor;

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'roofing', label: 'Roofing filter', color: roofingColor },
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
      data-section="chart-line-roofing"
      data-empty="false"
      data-hp-period={layout.hpPeriod}
      data-ss-period={layout.ssPeriod}
      data-roofing-final={layout.roofingFinal}
      data-positive-count={layout.positiveCount}
      data-negative-count={layout.negativeCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-roofing-aria-desc"
        style={ROOFING_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-roofing-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-roofing-badge"
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
              data-section="chart-line-roofing-badge-icon"
              aria-hidden="true"
              style={{ color: roofingColor }}
            >
              ROOFING
            </span>
            <span data-section="chart-line-roofing-badge-periods">
              {layout.hpPeriod}/{layout.ssPeriod}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-roofing-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-roofing-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`gp-${i}`}
                  data-section="chart-line-roofing-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.roofingYTicks.map((t, i) => (
                <line
                  key={`gr-${i}`}
                  data-section="chart-line-roofing-grid-line"
                  data-panel="roofing"
                  x1={rp.x}
                  x2={rp.x + rp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-roofing-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-roofing-axis"
                data-panel="price"
                data-axis="y"
                x1={pp.x}
                y1={pp.y}
                x2={pp.x}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-roofing-axis"
                data-panel="price"
                data-axis="x"
                x1={pp.x}
                y1={pp.y + pp.height}
                x2={pp.x + pp.width}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-roofing-axis"
                data-panel="roofing"
                data-axis="y"
                x1={rp.x}
                y1={rp.y}
                x2={rp.x}
                y2={rp.y + rp.height}
              />
              <line
                data-section="chart-line-roofing-axis"
                data-panel="roofing"
                data-axis="x"
                x1={rp.x}
                y1={rp.y + rp.height}
                x2={rp.x + rp.width}
                y2={rp.y + rp.height}
              />
              {layout.priceYTicks.map((t, i) => (
                <text
                  key={`pyt-${i}`}
                  data-section="chart-line-roofing-tick-label"
                  data-panel="price"
                  data-axis="y"
                  x={pp.x - 6}
                  y={t.py + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill={axisColor}
                  stroke="none"
                >
                  {formatValue(t.value)}
                </text>
              ))}
              {layout.roofingYTicks.map((t, i) => (
                <text
                  key={`ryt-${i}`}
                  data-section="chart-line-roofing-tick-label"
                  data-panel="roofing"
                  data-axis="y"
                  x={rp.x - 6}
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
                  data-section="chart-line-roofing-tick-label"
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
              ))}
            </g>
          ) : null}

          <text
            data-section="chart-line-roofing-panel-label"
            data-panel="price"
            x={pp.x + 2}
            y={pp.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            Price
          </text>
          <text
            data-section="chart-line-roofing-panel-label"
            data-panel="roofing"
            x={rp.x + 2}
            y={rp.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            Roofing
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-roofing-zero-line"
              x1={rp.x}
              x2={rp.x + rp.width}
              y1={layout.zeroY}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-roofing-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-roofing-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-roofing-dot"
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

          {roofingVisible && layout.roofingPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Roofing filter line"
              data-section="chart-line-roofing-roofing-line"
              d={layout.roofingPath}
              fill="none"
              stroke={roofingColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {roofingVisible ? (
            <g data-section="chart-line-roofing-markers">
              {layout.roofingMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Roofing filter at x ${formatX(m.x)}: ${formatValue(m.roofing)}, ${m.sign}`}
                    data-section="chart-line-roofing-marker"
                    data-point-index={m.index}
                    data-roofing={m.roofing}
                    data-sign={m.sign}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={signColor(m.sign)}
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
                  data-section="chart-line-roofing-tooltip"
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
                  <div data-section="chart-line-roofing-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-roofing-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-roofing-tooltip-highpass">
                    highpass: {formatValue(d.highpass)}
                  </div>
                  <div data-section="chart-line-roofing-tooltip-roofing">
                    roofing: {formatValue(d.roofing)}
                  </div>
                  <div data-section="chart-line-roofing-tooltip-sign">
                    sign: {d.sign}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-roofing-legend"
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
                data-section="chart-line-roofing-legend-item"
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
                  data-section="chart-line-roofing-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-roofing-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-roofing-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.positiveCount} positive, {layout.negativeCount} negative
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineRoofing.displayName = 'ChartLineRoofing';
