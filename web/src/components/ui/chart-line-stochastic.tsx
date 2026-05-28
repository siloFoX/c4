import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_STOCHASTIC_WIDTH = 560;
export const DEFAULT_CHART_LINE_STOCHASTIC_HEIGHT = 360;
export const DEFAULT_CHART_LINE_STOCHASTIC_PADDING = 40;
export const DEFAULT_CHART_LINE_STOCHASTIC_GAP = 26;
export const DEFAULT_CHART_LINE_STOCHASTIC_PRICE_PANEL_RATIO = 0.58;
export const DEFAULT_CHART_LINE_STOCHASTIC_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STOCHASTIC_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STOCHASTIC_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STOCHASTIC_K_PERIOD = 14;
export const DEFAULT_CHART_LINE_STOCHASTIC_D_PERIOD = 3;
export const DEFAULT_CHART_LINE_STOCHASTIC_OVERBOUGHT = 80;
export const DEFAULT_CHART_LINE_STOCHASTIC_OVERSOLD = 20;
export const DEFAULT_CHART_LINE_STOCHASTIC_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_STOCHASTIC_K_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STOCHASTIC_D_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_STOCHASTIC_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STOCHASTIC_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STOCHASTIC_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_STOCHASTIC_AXIS_COLOR = '#cbd5e1';

export type ChartLineStochasticZone = 'overbought' | 'oversold' | 'neutral';

export interface ChartLineStochasticPoint {
  x: number;
  value: number;
}

export interface ChartLineStochasticSample {
  index: number;
  x: number;
  price: number;
  k: number | null;
  d: number | null;
  zone: ChartLineStochasticZone | null;
}

export interface ChartLineStochasticRun {
  series: ChartLineStochasticPoint[];
  period: number;
  dPeriod: number;
  overbought: number;
  oversold: number;
  k: (number | null)[];
  d: (number | null)[];
  samples: ChartLineStochasticSample[];
  overboughtCount: number;
  oversoldCount: number;
  ok: boolean;
}

export interface ChartLineStochasticPriceDot {
  index: number;
  x: number;
  price: number;
  k: number | null;
  d: number | null;
  zone: ChartLineStochasticZone | null;
  px: number;
  py: number;
}

export interface ChartLineStochasticMarker {
  index: number;
  x: number;
  k: number;
  zone: ChartLineStochasticZone;
  px: number;
  py: number;
}

export interface ChartLineStochasticPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineStochasticLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineStochasticPanel;
  stochPanel: ChartLineStochasticPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  stochYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineStochasticPriceDot[];
  kPath: string;
  dPath: string;
  kMarkers: ChartLineStochasticMarker[];
  overboughtRect: { x: number; y: number; width: number; height: number };
  oversoldRect: { x: number; y: number; width: number; height: number };
  overboughtLineY: number;
  oversoldLineY: number;
  period: number;
  dPeriod: number;
  overbought: number;
  oversold: number;
  overboughtCount: number;
  oversoldCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineStochasticLayoutOptions {
  data: readonly ChartLineStochasticPoint[];
  period?: number;
  dPeriod?: number;
  overbought?: number;
  oversold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineStochasticProps {
  data: readonly ChartLineStochasticPoint[];
  period?: number;
  dPeriod?: number;
  overbought?: number;
  oversold?: number;
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
  priceColor?: string;
  kColor?: string;
  dColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showK?: boolean;
  showD?: boolean;
  showZones?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineStochasticPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function clampStochThreshold(v: number, fallback: number): number {
  if (!isFiniteNumber(v)) return fallback;
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

export function getLineStochasticFinitePoints(
  points: readonly ChartLineStochasticPoint[] | null | undefined,
): ChartLineStochasticPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineStochasticPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineStochasticPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The stochastic oscillator %K line. For each period it measures
 * where the current value sits within its trailing high-low range:
 * `%K = 100 * (value - lowestLow) / (highestHigh - lowestLow)` over
 * a window of `period` values. A flat window (zero range) reads 50.
 * Indices before the window is full are `null`.
 */
export function computeLineStochasticK(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let j = i - p + 1; j <= i; j += 1) {
      const v = values[j]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    out[i] = hi === lo ? 50 : (100 * (values[i]! - lo)) / (hi - lo);
  }
  return out;
}

/**
 * The %D signal line: a simple moving average of %K over `dPeriod`
 * values. A %D value is defined only where the full window of %K is
 * itself defined.
 */
export function computeLineStochasticD(
  kValues: readonly (number | null)[] | null | undefined,
  dPeriod: number,
): (number | null)[] {
  if (!Array.isArray(kValues)) return [];
  const n = kValues.length;
  const p = dPeriod < 1 ? 1 : Math.floor(dPeriod);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let j = i - p + 1; j <= i; j += 1) {
      const v = kValues[j];
      if (v === null || v === undefined) {
        valid = false;
        break;
      }
      sum += v;
    }
    if (valid) out[i] = sum / p;
  }
  return out;
}

export function runLineStochastic(
  points: readonly ChartLineStochasticPoint[] | null | undefined,
  options?: {
    period?: number;
    dPeriod?: number;
    overbought?: number;
    oversold?: number;
  },
): ChartLineStochasticRun {
  const finite = getLineStochasticFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineStochasticPeriod(
    options?.period ?? DEFAULT_CHART_LINE_STOCHASTIC_K_PERIOD,
    DEFAULT_CHART_LINE_STOCHASTIC_K_PERIOD,
  );
  const dPeriod = normalizeLineStochasticPeriod(
    options?.dPeriod ?? DEFAULT_CHART_LINE_STOCHASTIC_D_PERIOD,
    DEFAULT_CHART_LINE_STOCHASTIC_D_PERIOD,
  );
  const overbought = clampStochThreshold(
    options?.overbought ?? DEFAULT_CHART_LINE_STOCHASTIC_OVERBOUGHT,
    DEFAULT_CHART_LINE_STOCHASTIC_OVERBOUGHT,
  );
  const oversold = clampStochThreshold(
    options?.oversold ?? DEFAULT_CHART_LINE_STOCHASTIC_OVERSOLD,
    DEFAULT_CHART_LINE_STOCHASTIC_OVERSOLD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      dPeriod,
      overbought,
      oversold,
      k: [],
      d: [],
      samples: [],
      overboughtCount: 0,
      oversoldCount: 0,
      ok: false,
    };
  }

  const k = computeLineStochasticK(
    series.map((p) => p.value),
    period,
  );
  const d = computeLineStochasticD(k, dPeriod);
  let overboughtCount = 0;
  let oversoldCount = 0;
  const samples: ChartLineStochasticSample[] = series.map((p, i) => {
    const kv = k[i] ?? null;
    let zone: ChartLineStochasticZone | null = null;
    if (kv !== null) {
      if (kv >= overbought) {
        zone = 'overbought';
        overboughtCount += 1;
      } else if (kv <= oversold) {
        zone = 'oversold';
        oversoldCount += 1;
      } else {
        zone = 'neutral';
      }
    }
    return { index: i, x: p.x, price: p.value, k: kv, d: d[i] ?? null, zone };
  });

  return {
    series = [],
    period,
    dPeriod,
    overbought,
    oversold,
    k,
    d,
    samples,
    overboughtCount,
    oversoldCount,
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

export function computeLineStochasticLayout(
  options: ComputeLineStochasticLayoutOptions,
): ChartLineStochasticLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_STOCHASTIC_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_STOCHASTIC_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_STOCHASTIC_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineStochasticPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const emptyRect = { x: 0, y: 0, width: 0, height: 0 };
  const run = runLineStochastic(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.dPeriod) ? { dPeriod: options.dPeriod } : {}),
    ...(isFiniteNumber(options.overbought)
      ? { overbought: options.overbought }
      : {}),
    ...(isFiniteNumber(options.oversold)
      ? { oversold: options.oversold }
      : {}),
  });
  const empty: ChartLineStochasticLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    stochPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    stochYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    kPath: '',
    dPath: '',
    kMarkers: [],
    overboughtRect: emptyRect,
    oversoldRect: emptyRect,
    overboughtLineY: 0,
    oversoldLineY: 0,
    period: run.period,
    dPeriod: run.dPeriod,
    overbought: run.overbought,
    oversold: run.oversold,
    overboughtCount: 0,
    oversoldCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const stochH = usableHeight - priceH;
  if (priceH <= 0 || stochH <= 0) return empty;

  const pricePanel: ChartLineStochasticPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const stochPanel: ChartLineStochasticPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: stochH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.price < pyLo) pyLo = s.price;
    if (s.price > pyHi) pyHi = s.price;
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
  const projectStochY = (v: number): number =>
    stochPanel.y + stochPanel.height - (v / 100) * stochPanel.height;

  const priceDots: ChartLineStochasticPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    price: s.price,
    k: s.k,
    d: s.d,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.price),
  }));

  const kMarkers: ChartLineStochasticMarker[] = [];
  const kPts: { px: number; py: number }[] = [];
  const dPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.k !== null && s.zone !== null) {
      const px = projectX(s.x);
      const py = projectStochY(s.k);
      kPts.push({ px, py });
      kMarkers.push({ index: s.index, x: s.x, k: s.k, zone: s.zone, px, py });
    }
    if (s.d !== null) {
      dPts.push({ px: projectX(s.x), py: projectStochY(s.d) });
    }
  }

  const obY = projectStochY(run.overbought);
  const osY = projectStochY(run.oversold);
  const topY = projectStochY(100);
  const botY = projectStochY(0);

  return {
    ok: true,
    width,
    height,
    pricePanel,
    stochPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    stochYTicks: computeTicks(0, 100, tickCount).map((v) => ({
      value: v,
      py: projectStochY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    kPath: buildPath(kPts),
    dPath: buildPath(dPts),
    kMarkers,
    overboughtRect: {
      x: stochPanel.x,
      y: topY,
      width: stochPanel.width,
      height: obY - topY,
    },
    oversoldRect: {
      x: stochPanel.x,
      y: osY,
      width: stochPanel.width,
      height: botY - osY,
    },
    overboughtLineY: obY,
    oversoldLineY: osY,
    period: run.period,
    dPeriod: run.dPeriod,
    overbought: run.overbought,
    oversold: run.oversold,
    overboughtCount: run.overboughtCount,
    oversoldCount: run.oversoldCount,
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

export function describeLineStochasticChart(
  data: readonly ChartLineStochasticPoint[] | null | undefined,
  options?: {
    period?: number;
    dPeriod?: number;
    overbought?: number;
    oversold?: number;
  },
): string {
  const run = runLineStochastic(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a stochastic oscillator panel (%K ${run.period}, %D ${run.dPeriod}): the percent-K and percent-D lines, overbought above ${run.overbought} and oversold below ${run.oversold} -- ${run.overboughtCount} overbought and ${run.oversoldCount} oversold readings across ${run.samples.length} periods.`;
}

const STOCH_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineStochastic = forwardRef<
  HTMLDivElement,
  ChartLineStochasticProps
>(function ChartLineStochastic(
  props: ChartLineStochasticProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    dPeriod,
    overbought,
    oversold,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_STOCHASTIC_WIDTH,
    height = DEFAULT_CHART_LINE_STOCHASTIC_HEIGHT,
    padding = DEFAULT_CHART_LINE_STOCHASTIC_PADDING,
    gap = DEFAULT_CHART_LINE_STOCHASTIC_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_STOCHASTIC_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_STOCHASTIC_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_STOCHASTIC_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STOCHASTIC_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STOCHASTIC_PRICE_COLOR,
    kColor = DEFAULT_CHART_LINE_STOCHASTIC_K_COLOR,
    dColor = DEFAULT_CHART_LINE_STOCHASTIC_D_COLOR,
    overboughtColor = DEFAULT_CHART_LINE_STOCHASTIC_OVERBOUGHT_COLOR,
    oversoldColor = DEFAULT_CHART_LINE_STOCHASTIC_OVERSOLD_COLOR,
    gridColor = DEFAULT_CHART_LINE_STOCHASTIC_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_STOCHASTIC_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showK = true,
    showD = true,
    showZones = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a stochastic oscillator panel',
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
      computeLineStochasticLayout({
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(dPeriod) ? { dPeriod } : {}),
        ...(isFiniteNumber(overbought) ? { overbought } : {}),
        ...(isFiniteNumber(oversold) ? { oversold } : {}),
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
      dPeriod,
      overbought,
      oversold,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineStochasticChart(data, {
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(dPeriod) ? { dPeriod } : {}),
        ...(isFiniteNumber(overbought) ? { overbought } : {}),
        ...(isFiniteNumber(oversold) ? { oversold } : {}),
      }),
    [ariaDescription, data, period, dPeriod, overbought, oversold],
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

  const zoneColor = useCallback(
    (zone: ChartLineStochasticZone): string => {
      if (zone === 'overbought') return overboughtColor;
      if (zone === 'oversold') return oversoldColor;
      return kColor;
    },
    [overboughtColor, oversoldColor, kColor],
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
        data-section="chart-line-stochastic"
        data-empty="true"
        data-overbought-count={0}
        data-oversold-count={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-stochastic-aria-desc" style={STOCH_SR_STYLE}>
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const sp = layout.stochPanel;
  const priceVisible = !hiddenSet.has('price');
  const kVisible = showK && !hiddenSet.has('k');
  const dVisible = showD && !hiddenSet.has('d');
  const zonesVisible = showZones && !hiddenSet.has('zones');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'k', label: '%K', color: kColor },
    { id: 'd', label: '%D', color: dColor },
    { id: 'zones', label: 'Zones', color: overboughtColor },
  ];

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-stochastic"
      data-empty="false"
      data-period={layout.period}
      data-d-period={layout.dPeriod}
      data-overbought-count={layout.overboughtCount}
      data-oversold-count={layout.oversoldCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span id={descId} data-section="chart-line-stochastic-aria-desc" style={STOCH_SR_STYLE}>
        {summary}
      </span>

      <div
        data-section="chart-line-stochastic-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-stochastic-badge"
            data-period={layout.period}
            data-d-period={layout.dPeriod}
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
              data-section="chart-line-stochastic-badge-icon"
              aria-hidden="true"
              style={{ color: kColor }}
            >
              STOCH
            </span>
            <span data-section="chart-line-stochastic-badge-period">
              k={layout.period} d={layout.dPeriod}
            </span>
            <span data-section="chart-line-stochastic-badge-zones">
              ob={layout.overbought} os={layout.oversold}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-stochastic-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-stochastic-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`pgy-${i}`}
                  data-section="chart-line-stochastic-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.stochYTicks.map((t, i) => (
                <line
                  key={`sgy-${i}`}
                  data-section="chart-line-stochastic-grid-line"
                  data-panel="stoch"
                  x1={sp.x}
                  x2={sp.x + sp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {zonesVisible ? (
            <g data-section="chart-line-stochastic-zones">
              <rect
                data-section="chart-line-stochastic-overbought-zone"
                x={layout.overboughtRect.x}
                y={layout.overboughtRect.y}
                width={layout.overboughtRect.width}
                height={layout.overboughtRect.height}
                fill={overboughtColor}
                fillOpacity={0.1}
              />
              <rect
                data-section="chart-line-stochastic-oversold-zone"
                x={layout.oversoldRect.x}
                y={layout.oversoldRect.y}
                width={layout.oversoldRect.width}
                height={layout.oversoldRect.height}
                fill={oversoldColor}
                fillOpacity={0.1}
              />
              <line
                data-section="chart-line-stochastic-threshold-line"
                data-kind="overbought"
                x1={sp.x}
                x2={sp.x + sp.width}
                y1={layout.overboughtLineY}
                y2={layout.overboughtLineY}
                stroke={overboughtColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                data-section="chart-line-stochastic-threshold-line"
                data-kind="oversold"
                x1={sp.x}
                x2={sp.x + sp.width}
                y1={layout.oversoldLineY}
                y2={layout.oversoldLineY}
                stroke={oversoldColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-stochastic-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              {[
                { panel: pp, name: 'price', yt: layout.priceYTicks },
                { panel: sp, name: 'stoch', yt: layout.stochYTicks },
              ].map((cfg) => (
                <g
                  key={`axis-${cfg.name}`}
                  data-section="chart-line-stochastic-axis-group"
                  data-panel={cfg.name}
                >
                  <line
                    data-section="chart-line-stochastic-axis"
                    data-panel={cfg.name}
                    data-axis="x"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y + cfg.panel.height}
                    x2={cfg.panel.x + cfg.panel.width}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  <line
                    data-section="chart-line-stochastic-axis"
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
                      data-section="chart-line-stochastic-tick"
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
                        data-section="chart-line-stochastic-tick-label"
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
              <g data-section="chart-line-stochastic-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`tx-${i}`}
                    data-section="chart-line-stochastic-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={sp.y + sp.height}
                      y2={sp.y + sp.height + 4}
                    />
                    <text
                      data-section="chart-line-stochastic-tick-label"
                      data-axis="x"
                      x={t.px}
                      y={sp.y + sp.height + 14}
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

          <g data-section="chart-line-stochastic-panel-labels">
            <text
              data-section="chart-line-stochastic-panel-label"
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
              data-section="chart-line-stochastic-panel-label"
              data-panel="stoch"
              x={sp.x + sp.width / 2}
              y={sp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Stochastic
            </text>
          </g>

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-stochastic-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-stochastic-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, price ${formatValue(d.price)}`}
                    data-section="chart-line-stochastic-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-price={d.price}
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

          {dVisible && layout.dPath ? (
            <path
              data-section="chart-line-stochastic-d-line"
              d={layout.dPath}
              fill="none"
              stroke={dColor}
              strokeWidth={1.5}
              strokeDasharray="5 3"
            />
          ) : null}

          {kVisible && layout.kPath ? (
            <path
              data-section="chart-line-stochastic-k-line"
              d={layout.kPath}
              fill="none"
              stroke={kColor}
              strokeWidth={1.75}
            />
          ) : null}

          {kVisible ? (
            <g data-section="chart-line-stochastic-k-markers">
              {layout.kMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Stochastic at x ${formatX(m.x)}: %K ${formatValue(m.k)}, ${m.zone}`}
                    data-section="chart-line-stochastic-k-marker"
                    data-point-index={m.index}
                    data-k={m.k}
                    data-zone={m.zone}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={zoneColor(m.zone)}
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
                  data-section="chart-line-stochastic-tooltip"
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
                  <div data-section="chart-line-stochastic-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-stochastic-tooltip-price"
                    style={{ fontWeight: 600 }}
                  >
                    price: {formatValue(d.price)}
                  </div>
                  <div data-section="chart-line-stochastic-tooltip-k">
                    K: {d.k === null ? 'n/a' : formatValue(d.k)}
                  </div>
                  <div data-section="chart-line-stochastic-tooltip-d">
                    D: {d.d === null ? 'n/a' : formatValue(d.d)}
                  </div>
                  {d.zone ? (
                    <div
                      data-section="chart-line-stochastic-tooltip-zone"
                      style={{
                        color:
                          d.zone === 'neutral'
                            ? '#94a3b8'
                            : zoneColor(d.zone),
                        fontWeight: 600,
                      }}
                    >
                      {d.zone}
                    </div>
                  ) : null}
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-stochastic-legend"
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
                data-section="chart-line-stochastic-legend-item"
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
                  data-section="chart-line-stochastic-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-stochastic-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-stochastic-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.overboughtCount} overbought / {layout.oversoldCount}{' '}
            oversold
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineStochastic.displayName = 'ChartLineStochastic';
