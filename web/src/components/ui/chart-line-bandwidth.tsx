import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_BANDWIDTH_WIDTH = 560;
export const DEFAULT_CHART_LINE_BANDWIDTH_HEIGHT = 360;
export const DEFAULT_CHART_LINE_BANDWIDTH_PADDING = 40;
export const DEFAULT_CHART_LINE_BANDWIDTH_GAP = 12;
export const DEFAULT_CHART_LINE_BANDWIDTH_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_BANDWIDTH_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_BANDWIDTH_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_BANDWIDTH_PERIOD = 20;
export const DEFAULT_CHART_LINE_BANDWIDTH_MULTIPLIER = 2;
export const DEFAULT_CHART_LINE_BANDWIDTH_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_BANDWIDTH_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_BANDWIDTH_BANDWIDTH_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_BANDWIDTH_WIDE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_BANDWIDTH_NARROW_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_BANDWIDTH_MID_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_BANDWIDTH_MEAN_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_BANDWIDTH_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_BANDWIDTH_AXIS_COLOR = '#cbd5e1';

export type ChartLineBandwidthClass = 'wide' | 'narrow' | 'mid';

export interface ChartLineBandwidthPoint {
  x: number;
  value: number;
}

export interface ChartLineBandwidthSample {
  index: number;
  x: number;
  value: number;
  basis: number | null;
  stddev: number | null;
  bandwidth: number | null;
  widthClass: ChartLineBandwidthClass;
}

export interface ChartLineBandwidthRun {
  series: ChartLineBandwidthPoint[];
  period: number;
  multiplier: number;
  basis: (number | null)[];
  stddev: (number | null)[];
  bandwidth: (number | null)[];
  samples: ChartLineBandwidthSample[];
  bandwidthMean: number;
  bandwidthFinal: number;
  bandwidthMin: number;
  bandwidthMax: number;
  wideCount: number;
  narrowCount: number;
  ok: boolean;
}

export interface ChartLineBandwidthPriceDot {
  index: number;
  x: number;
  value: number;
  basis: number | null;
  bandwidth: number | null;
  widthClass: ChartLineBandwidthClass;
  px: number;
  py: number;
}

export interface ChartLineBandwidthMarker {
  index: number;
  x: number;
  bandwidth: number;
  widthClass: ChartLineBandwidthClass;
  px: number;
  py: number;
}

export interface ChartLineBandwidthPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineBandwidthLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineBandwidthPanel;
  bandwidthPanel: ChartLineBandwidthPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  bandwidthYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  bandwidthYMin: number;
  bandwidthYMax: number;
  pricePath: string;
  priceDots: ChartLineBandwidthPriceDot[];
  bandwidthPath: string;
  bandwidthMarkers: ChartLineBandwidthMarker[];
  meanY: number;
  meanInRange: boolean;
  period: number;
  multiplier: number;
  bandwidthFinal: number;
  bandwidthMean: number;
  wideCount: number;
  narrowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineBandwidthLayoutOptions {
  data: readonly ChartLineBandwidthPoint[];
  period?: number;
  multiplier?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineBandwidthProps {
  data: readonly ChartLineBandwidthPoint[];
  period?: number;
  multiplier?: number;
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
  bandwidthColor?: string;
  wideColor?: string;
  narrowColor?: string;
  midColor?: string;
  meanColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBandwidth?: boolean;
  showMeanLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineBandwidthPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineBandwidthFinitePoints(
  points: readonly ChartLineBandwidthPoint[] | null | undefined,
): ChartLineBandwidthPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineBandwidthPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineBandwidthPeriod(
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
export function normalizeLineBandwidthMultiplier(
  multiplier: number,
  fallback: number,
): number {
  if (isFiniteNumber(multiplier) && multiplier > 0) return multiplier;
  return fallback;
}

/**
 * The Bollinger basis -- the `period`-bar simple moving average.
 * Null through the warm-up.
 */
export function computeLineBandwidthBasis(
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
 * window. Null through the warm-up.
 */
export function computeLineBandwidthStdDev(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p) return out;
  const basis = computeLineBandwidthBasis(values, period);
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

/**
 * The Bollinger Bandwidth -- the width of the Bollinger band as a
 * fraction of its middle line: `(upper - lower) / basis`, where
 * `upper = basis + multiplier*stddev` and
 * `lower = basis - multiplier*stddev`. A low reading marks a
 * volatility squeeze; a high reading marks an expansion. Null
 * through the warm-up; a zero basis reports zero.
 */
export function computeLineBandwidth(
  values: readonly number[] | null | undefined,
  period: number,
  multiplier: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const basis = computeLineBandwidthBasis(values, period);
  const stddev = computeLineBandwidthStdDev(values, period);
  const out: (number | null)[] = new Array(basis.length).fill(null);
  for (let i = 0; i < basis.length; i += 1) {
    const b = basis[i];
    const sd = stddev[i];
    if (!isDefined(b) || !isDefined(sd)) continue;
    if (b === 0) {
      out[i] = 0;
      continue;
    }
    const upper = b + multiplier * sd;
    const lower = b - multiplier * sd;
    out[i] = (upper - lower) / b;
  }
  return out;
}

function classifyWidth(
  bandwidth: number | null,
  mean: number,
): ChartLineBandwidthClass {
  if (bandwidth === null || !isFiniteNumber(mean)) return 'mid';
  if (bandwidth > mean) return 'wide';
  if (bandwidth < mean) return 'narrow';
  return 'mid';
}

export function runLineBandwidth(
  points: readonly ChartLineBandwidthPoint[] | null | undefined,
  options?: { period?: number; multiplier?: number },
): ChartLineBandwidthRun {
  const finite = getLineBandwidthFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineBandwidthPeriod(
    options?.period ?? DEFAULT_CHART_LINE_BANDWIDTH_PERIOD,
    DEFAULT_CHART_LINE_BANDWIDTH_PERIOD,
  );
  const multiplier = normalizeLineBandwidthMultiplier(
    options?.multiplier ?? DEFAULT_CHART_LINE_BANDWIDTH_MULTIPLIER,
    DEFAULT_CHART_LINE_BANDWIDTH_MULTIPLIER,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      multiplier,
      basis: [],
      stddev: [],
      bandwidth: [],
      samples: [],
      bandwidthMean: NaN,
      bandwidthFinal: NaN,
      bandwidthMin: NaN,
      bandwidthMax: NaN,
      wideCount: 0,
      narrowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const basis = computeLineBandwidthBasis(values, period);
  const stddev = computeLineBandwidthStdDev(values, period);
  const bandwidth = computeLineBandwidth(values, period, multiplier);

  let bwSum = 0;
  let bwCount = 0;
  for (const bw of bandwidth) {
    if (isDefined(bw)) {
      bwSum += bw;
      bwCount += 1;
    }
  }
  const bandwidthMean = bwCount > 0 ? bwSum / bwCount : NaN;

  const samples: ChartLineBandwidthSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    basis: basis[i] ?? null,
    stddev: stddev[i] ?? null,
    bandwidth: bandwidth[i] ?? null,
    widthClass: classifyWidth(bandwidth[i] ?? null, bandwidthMean),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let bandwidthMin = NaN;
  let bandwidthMax = NaN;
  let wideCount = 0;
  let narrowCount = 0;
  for (const s of samples) {
    if (s.bandwidth !== null) {
      if (Number.isNaN(bandwidthMin) || s.bandwidth < bandwidthMin) {
        bandwidthMin = s.bandwidth;
      }
      if (Number.isNaN(bandwidthMax) || s.bandwidth > bandwidthMax) {
        bandwidthMax = s.bandwidth;
      }
    }
    if (s.widthClass === 'wide') wideCount += 1;
    if (s.widthClass === 'narrow') narrowCount += 1;
  }

  return {
    series,
    period,
    multiplier,
    basis,
    stddev,
    bandwidth,
    samples,
    bandwidthMean,
    bandwidthFinal: lastDefined(bandwidth),
    bandwidthMin,
    bandwidthMax,
    wideCount,
    narrowCount,
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

export function computeLineBandwidthLayout(
  options: ComputeLineBandwidthLayoutOptions,
): ChartLineBandwidthLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_BANDWIDTH_GAP,
    tickCount = DEFAULT_CHART_LINE_BANDWIDTH_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_BANDWIDTH_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineBandwidth(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.multiplier)
      ? { multiplier: options.multiplier }
      : {}),
  });

  const emptyPanel: ChartLineBandwidthPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineBandwidthLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    bandwidthPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    bandwidthYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    bandwidthYMin: 0,
    bandwidthYMax: 0,
    pricePath: '',
    priceDots: [],
    bandwidthPath: '',
    bandwidthMarkers: [],
    meanY: 0,
    meanInRange: false,
    period: run.period,
    multiplier: run.multiplier,
    bandwidthFinal: NaN,
    bandwidthMean: NaN,
    wideCount: 0,
    narrowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const bandwidthHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineBandwidthPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const bandwidthPanel: ChartLineBandwidthPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: bandwidthHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  let bwHi = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < priceLo) priceLo = s.value;
    if (s.value > priceHi) priceHi = s.value;
    if (s.bandwidth !== null && s.bandwidth > bwHi) bwHi = s.bandwidth;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }
  if (bwHi <= 0) bwHi = 1;
  const bwLo = 0;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const bwRange = bwHi - bwLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectBandwidthY = (v: number): number =>
    bandwidthPanel.y +
    bandwidthPanel.height -
    ((v - bwLo) / bwRange) * bandwidthPanel.height;

  const priceDots: ChartLineBandwidthPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    basis: s.basis,
    bandwidth: s.bandwidth,
    widthClass: s.widthClass,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const bandwidthMarkers: ChartLineBandwidthMarker[] = [];
  const bandwidthPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.bandwidth !== null) {
      const px = projectX(s.x);
      const py = projectBandwidthY(s.bandwidth);
      bandwidthPts.push({ px, py });
      bandwidthMarkers.push({
        index: s.index,
        x: s.x,
        bandwidth: s.bandwidth,
        widthClass: s.widthClass,
        px,
        py,
      });
    }
  }

  const meanInRange =
    isFiniteNumber(run.bandwidthMean) &&
    run.bandwidthMean >= bwLo &&
    run.bandwidthMean <= bwHi;

  return {
    ok: true,
    width,
    height,
    pricePanel,
    bandwidthPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    bandwidthYTicks: computeTicks(bwLo, bwHi, tickCount).map((v) => ({
      value: v,
      py: projectBandwidthY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    bandwidthYMin: bwLo,
    bandwidthYMax: bwHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    bandwidthPath: buildPath(bandwidthPts),
    bandwidthMarkers,
    meanY: meanInRange ? projectBandwidthY(run.bandwidthMean) : 0,
    meanInRange,
    period: run.period,
    multiplier: run.multiplier,
    bandwidthFinal: run.bandwidthFinal,
    bandwidthMean: run.bandwidthMean,
    wideCount: run.wideCount,
    narrowCount: run.narrowCount,
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

export function describeLineBandwidthChart(
  data: readonly ChartLineBandwidthPoint[] | null | undefined,
  options?: { period?: number; multiplier?: number },
): string {
  const run = runLineBandwidth(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Bollinger Bandwidth indicator (period ${run.period}, multiplier ${defaultFormatValue(run.multiplier)}): the top panel plots the raw price; the bottom panel plots the Bollinger Bandwidth, the width of the Bollinger band as a fraction of its middle line -- (upper - lower) / basis. A low bandwidth marks a volatility squeeze, often the prelude to a breakout; a high bandwidth marks an expansion. The bandwidth reads wide (above its ${defaultFormatValue(run.bandwidthMean)} mean) on ${run.wideCount} bars and narrow on ${run.narrowCount} across ${run.samples.length} bars.`;
}

const BANDWIDTH_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineBandwidth = forwardRef<
  HTMLDivElement,
  ChartLineBandwidthProps
>(function ChartLineBandwidth(
  props: ChartLineBandwidthProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    multiplier,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_BANDWIDTH_WIDTH,
    height = DEFAULT_CHART_LINE_BANDWIDTH_HEIGHT,
    padding = DEFAULT_CHART_LINE_BANDWIDTH_PADDING,
    gap = DEFAULT_CHART_LINE_BANDWIDTH_GAP,
    tickCount = DEFAULT_CHART_LINE_BANDWIDTH_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_BANDWIDTH_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_BANDWIDTH_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_BANDWIDTH_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_BANDWIDTH_PRICE_COLOR,
    bandwidthColor = DEFAULT_CHART_LINE_BANDWIDTH_BANDWIDTH_COLOR,
    wideColor = DEFAULT_CHART_LINE_BANDWIDTH_WIDE_COLOR,
    narrowColor = DEFAULT_CHART_LINE_BANDWIDTH_NARROW_COLOR,
    midColor = DEFAULT_CHART_LINE_BANDWIDTH_MID_COLOR,
    meanColor = DEFAULT_CHART_LINE_BANDWIDTH_MEAN_COLOR,
    gridColor = DEFAULT_CHART_LINE_BANDWIDTH_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_BANDWIDTH_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showBandwidth = true,
    showMeanLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Two-panel chart with a Bollinger Bandwidth indicator',
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
      computeLineBandwidthLayout({
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(multiplier) ? { multiplier } : {}),
      }),
    [data, width, height, padding, gap, tickCount, pricePanelRatio, period, multiplier],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineBandwidthChart(data, {
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
        data-section="chart-line-bandwidth"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-bandwidth-aria-desc"
          style={BANDWIDTH_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const bp = layout.bandwidthPanel;
  const priceVisible = !hiddenSet.has('price');
  const bandwidthVisible = showBandwidth && !hiddenSet.has('bandwidth');

  const classColor = (c: ChartLineBandwidthClass): string =>
    c === 'wide' ? wideColor : c === 'narrow' ? narrowColor : midColor;

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'bandwidth', label: 'Bandwidth', color: bandwidthColor },
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
      data-section="chart-line-bandwidth"
      data-empty="false"
      data-period={layout.period}
      data-multiplier={layout.multiplier}
      data-bandwidth-final={layout.bandwidthFinal}
      data-wide-count={layout.wideCount}
      data-narrow-count={layout.narrowCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-bandwidth-aria-desc"
        style={BANDWIDTH_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-bandwidth-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-bandwidth-badge"
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
              data-section="chart-line-bandwidth-badge-icon"
              aria-hidden="true"
              style={{ color: bandwidthColor }}
            >
              BANDWIDTH
            </span>
            <span data-section="chart-line-bandwidth-badge-config">
              {layout.period}/{formatValue(layout.multiplier)}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-bandwidth-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-bandwidth-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`gp-${i}`}
                  data-section="chart-line-bandwidth-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.bandwidthYTicks.map((t, i) => (
                <line
                  key={`gb-${i}`}
                  data-section="chart-line-bandwidth-grid-line"
                  data-panel="bandwidth"
                  x1={bp.x}
                  x2={bp.x + bp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-bandwidth-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-bandwidth-axis"
                data-panel="price"
                data-axis="y"
                x1={pp.x}
                y1={pp.y}
                x2={pp.x}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-bandwidth-axis"
                data-panel="price"
                data-axis="x"
                x1={pp.x}
                y1={pp.y + pp.height}
                x2={pp.x + pp.width}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-bandwidth-axis"
                data-panel="bandwidth"
                data-axis="y"
                x1={bp.x}
                y1={bp.y}
                x2={bp.x}
                y2={bp.y + bp.height}
              />
              <line
                data-section="chart-line-bandwidth-axis"
                data-panel="bandwidth"
                data-axis="x"
                x1={bp.x}
                y1={bp.y + bp.height}
                x2={bp.x + bp.width}
                y2={bp.y + bp.height}
              />
              {layout.priceYTicks.map((t, i) => (
                <text
                  key={`pyt-${i}`}
                  data-section="chart-line-bandwidth-tick-label"
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
              {layout.bandwidthYTicks.map((t, i) => (
                <text
                  key={`byt-${i}`}
                  data-section="chart-line-bandwidth-tick-label"
                  data-panel="bandwidth"
                  data-axis="y"
                  x={bp.x - 6}
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
                  data-section="chart-line-bandwidth-tick-label"
                  data-axis="x"
                  x={t.px}
                  y={bp.y + bp.height + 14}
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
            data-section="chart-line-bandwidth-panel-label"
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
            data-section="chart-line-bandwidth-panel-label"
            data-panel="bandwidth"
            x={bp.x + 2}
            y={bp.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            Bandwidth
          </text>

          {showMeanLine && layout.meanInRange ? (
            <line
              data-section="chart-line-bandwidth-mean-line"
              x1={bp.x}
              x2={bp.x + bp.width}
              y1={layout.meanY}
              y2={layout.meanY}
              stroke={meanColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-bandwidth-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-bandwidth-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-bandwidth-dot"
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

          {bandwidthVisible && layout.bandwidthPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Bollinger Bandwidth line"
              data-section="chart-line-bandwidth-bandwidth-line"
              d={layout.bandwidthPath}
              fill="none"
              stroke={bandwidthColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {bandwidthVisible ? (
            <g data-section="chart-line-bandwidth-markers">
              {layout.bandwidthMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bandwidth at x ${formatX(m.x)}: ${formatValue(m.bandwidth)}, ${m.widthClass}`}
                    data-section="chart-line-bandwidth-marker"
                    data-point-index={m.index}
                    data-bandwidth={m.bandwidth}
                    data-width-class={m.widthClass}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={classColor(m.widthClass)}
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
                  data-section="chart-line-bandwidth-tooltip"
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
                  <div data-section="chart-line-bandwidth-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-bandwidth-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-bandwidth-tooltip-basis">
                    basis: {d.basis === null ? 'n/a' : formatValue(d.basis)}
                  </div>
                  <div data-section="chart-line-bandwidth-tooltip-bandwidth">
                    bandwidth:{' '}
                    {d.bandwidth === null ? 'n/a' : formatValue(d.bandwidth)}
                  </div>
                  <div data-section="chart-line-bandwidth-tooltip-class">
                    width: {d.widthClass}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-bandwidth-legend"
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
                data-section="chart-line-bandwidth-legend-item"
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
                  data-section="chart-line-bandwidth-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-bandwidth-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-bandwidth-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.wideCount} wide, {layout.narrowCount} narrow
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineBandwidth.displayName = 'ChartLineBandwidth';
