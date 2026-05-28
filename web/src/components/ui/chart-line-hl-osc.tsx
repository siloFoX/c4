import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
} from 'react';

/**
 * ChartLineHlOsc -- pure-SVG dual-panel chart with the close on top
 * and a High-Low Oscillator on the bottom. The oscillator subtracts
 * the rolling-mean low from the rolling-mean high across the
 * lookback, giving a volatility proxy bounded below by zero (for
 * well-ordered OHLC data where `high >= low`):
 *
 *   highSma[i] = mean(high[i - length + 1 .. i])
 *   lowSma[i]  = mean(low[i  - length + 1 .. i])
 *   osc[i]     = highSma[i] - lowSma[i]
 *
 * `osc[i]` is `null` during warmup (`i < length - 1`) and whenever
 * either rolling mean cannot be formed. Output is unbounded above
 * and, for typical data, bounded below by zero.
 *
 * Bit-exact anchors:
 * - **CONST high = low = K**: both SMAs collapse to `K`, so
 *   `osc = 0` bit-exact post-warmup. Subtraction of identical IEEE
 *   754 doubles is exact.
 * - **CONSTANT-SPREAD high = low + D (any L)**: by the linearity of
 *   the SMA, `SMA(high) - SMA(low) = SMA(high - low) = SMA(D) = D`
 *   bit-exact post-warmup. Verified across `(K, D, length)` sweeps.
 * - **LINEAR + CONSTANT SPREAD high = i + 2, low = i + 1**: per-bar
 *   spread is 1, and the same SMA-linearity argument gives
 *   `osc = 1` bit-exact post-warmup.
 */

export interface ChartLineHlOscPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineHlOscZone =
  | 'expanded'
  | 'narrow'
  | 'neutral'
  | 'none';

export type ChartLineHlOscCross = 'up' | 'down' | null;

export type ChartLineHlOscSeriesId = 'price' | 'osc';

export interface ChartLineHlOscSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  highSma: number | null;
  lowSma: number | null;
  osc: number | null;
  zone: ChartLineHlOscZone;
  crossed: ChartLineHlOscCross;
}

export interface ChartLineHlOscRun {
  series: ChartLineHlOscPoint[];
  length: number;
  highThreshold: number;
  lowThreshold: number;
  highSmaValues: Array<number | null>;
  lowSmaValues: Array<number | null>;
  oscValues: Array<number | null>;
  samples: ChartLineHlOscSample[];
  expandedCount: number;
  narrowCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineHlOscMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  osc: number;
  crossed: 'up' | 'down';
}

export interface ChartLineHlOscDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineHlOscLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  oscTop: number;
  oscBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineHlOscDot[];
  oscPath: string;
  highY: number;
  lowY: number;
  zeroY: number;
  markers: ChartLineHlOscMarker[];
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  run: ChartLineHlOscRun;
}

export interface ChartLineHlOscProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineHlOscPoint[];
  length?: number;
  highThreshold?: number;
  lowThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  oscColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showOsc?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineHlOscSeriesId[];
  defaultHiddenSeries?: ChartLineHlOscSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineHlOscSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineHlOscSample }) => void;
  formatPrice?: (value: number) => string;
  formatOsc?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_HL_OSC_WIDTH = 720;
export const DEFAULT_CHART_LINE_HL_OSC_HEIGHT = 460;
export const DEFAULT_CHART_LINE_HL_OSC_PADDING = 44;
export const DEFAULT_CHART_LINE_HL_OSC_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_HL_OSC_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HL_OSC_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HL_OSC_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HL_OSC_LENGTH = 14;
export const DEFAULT_CHART_LINE_HL_OSC_HIGH_THRESHOLD = 1;
export const DEFAULT_CHART_LINE_HL_OSC_LOW_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_HL_OSC_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_HL_OSC_OSC_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_HL_OSC_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HL_OSC_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HL_OSC_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_HL_OSC_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_HL_OSC_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_HL_OSC_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite OHLC fields. */
export function getLineHlOscFinitePoints(
  data: readonly ChartLineHlOscPoint[] | null | undefined,
): ChartLineHlOscPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineHlOscPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
      });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineHlOscLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a numeric threshold (any finite real). */
export function normalizeLineHlOscThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold)) return threshold;
  return fallback;
}

/** Rolling SMA over a window of length bars. */
export function applyLineHlOscSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? posZero(sum / length) : null);
  }
  return out;
}

export interface LineHlOscChannels {
  highSma: Array<number | null>;
  lowSma: Array<number | null>;
  osc: Array<number | null>;
}

/** Compute the highSma, lowSma, and osc channels. */
export function computeLineHlOsc(
  series: readonly ChartLineHlOscPoint[] | null | undefined,
  options: { length?: number } = {},
): LineHlOscChannels {
  const cleaned = getLineHlOscFinitePoints(series);
  if (cleaned.length === 0) {
    return { highSma: [], lowSma: [], osc: [] };
  }
  const length = normalizeLineHlOscLength(
    options.length,
    DEFAULT_CHART_LINE_HL_OSC_LENGTH,
  );
  const highs = cleaned.map((p) => p.high);
  const lows = cleaned.map((p) => p.low);
  const highSma = applyLineHlOscSma(highs, length);
  const lowSma = applyLineHlOscSma(lows, length);
  const osc: Array<number | null> = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const h = highSma[i];
    const l = lowSma[i];
    if (h == null || l == null) {
      osc.push(null);
      continue;
    }
    osc.push(posZero(h - l));
  }
  return { highSma, lowSma, osc };
}

export function classifyLineHlOscZone(
  value: number | null,
  highThreshold: number,
  lowThreshold: number,
): ChartLineHlOscZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value >= highThreshold) return 'expanded';
  if (value <= lowThreshold) return 'narrow';
  return 'neutral';
}

export function detectLineHlOscCrosses(
  values: readonly (number | null)[],
  highThreshold: number,
  lowThreshold: number,
): ChartLineHlOscCross[] {
  const out: ChartLineHlOscCross[] = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev == null) {
      out.push(null);
      prev = v;
      continue;
    }
    if (prev < highThreshold && v >= highThreshold) {
      out.push('up');
    } else if (prev > lowThreshold && v <= lowThreshold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

export function runLineHlOsc(
  data: ChartLineHlOscPoint[],
  options: {
    length?: number;
    highThreshold?: number;
    lowThreshold?: number;
  } = {},
): ChartLineHlOscRun {
  const cleaned = getLineHlOscFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineHlOscLength(
    options.length,
    DEFAULT_CHART_LINE_HL_OSC_LENGTH,
  );
  const highThreshold = normalizeLineHlOscThreshold(
    options.highThreshold,
    DEFAULT_CHART_LINE_HL_OSC_HIGH_THRESHOLD,
  );
  const lowThreshold = normalizeLineHlOscThreshold(
    options.lowThreshold,
    DEFAULT_CHART_LINE_HL_OSC_LOW_THRESHOLD,
  );

  const channels = computeLineHlOsc(series, { length });
  const crosses = detectLineHlOscCrosses(
    channels.osc,
    highThreshold,
    lowThreshold,
  );

  const samples: ChartLineHlOscSample[] = series.map((p, i) => {
    const hs = channels.highSma[i] ?? null;
    const ls = channels.lowSma[i] ?? null;
    const osc = channels.osc[i] ?? null;
    const zone = classifyLineHlOscZone(osc, highThreshold, lowThreshold);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      highSma: hs,
      lowSma: ls,
      osc,
      zone,
      crossed,
    };
  });

  let expandedCount = 0;
  let narrowCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const s of samples) {
    if (s.zone === 'expanded') expandedCount += 1;
    else if (s.zone === 'narrow') narrowCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    else noneCount += 1;
    if (s.crossed === 'up') bullishCrossCount += 1;
    else if (s.crossed === 'down') bearishCrossCount += 1;
  }

  const ok = series.length >= length;

  return {
    series = [],
    length,
    highThreshold,
    lowThreshold,
    highSmaValues: channels.highSma,
    lowSmaValues: channels.lowSma,
    oscValues: channels.osc,
    samples,
    expandedCount,
    narrowCount,
    neutralCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineHlOscLayoutOptions {
  data: ChartLineHlOscPoint[];
  length?: number;
  highThreshold?: number;
  lowThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineHlOscLayout(
  opts: ComputeLineHlOscLayoutOptions,
): ChartLineHlOscLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_HL_OSC_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_HL_OSC_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_HL_OSC_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_HL_OSC_PANEL_GAP;

  const run = runLineHlOsc(opts.data, {
    length: opts.length ?? undefined,
    highThreshold: opts.highThreshold ?? undefined,
    lowThreshold: opts.lowThreshold ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      oscTop,
      oscBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      oscPath: '',
      highY: oscTop,
      lowY: oscBottom,
      zeroY: oscBottom,
      markers: [],
      priceMin: 0,
      priceMax: 0,
      oscMin: 0,
      oscMax: 1,
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.low < priceMin) priceMin = s.low;
    if (s.high > priceMax) priceMax = s.high;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  let oscMin = 0;
  let oscMax = Math.max(run.highThreshold + 0.5, 1);
  for (const s of run.samples) {
    if (s.osc == null) continue;
    if (s.osc < oscMin) oscMin = s.osc;
    if (s.osc > oscMax) oscMax = s.osc;
  }
  if (oscMin === oscMax) oscMax += 1;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syOsc = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

  let pricePath = '';
  const priceDots: ChartLineHlOscDot[] = [];
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = syPrice(s.close);
    pricePath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    priceDots.push({
      index: s.index,
      x: s.x,
      cx,
      cy,
      close: s.close,
    });
  }

  let oscPath = '';
  let firstO = true;
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s || s.osc == null) {
      firstO = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.osc);
    oscPath += `${firstO ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstO = false;
  }

  const markers: ChartLineHlOscMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.osc == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syOsc(s.osc),
      close: s.close,
      osc: s.osc,
      crossed: s.crossed,
    });
  }

  return {
    ok: true,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    oscTop,
    oscBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    oscPath: oscPath.trim(),
    highY: syOsc(run.highThreshold),
    lowY: syOsc(run.lowThreshold),
    zeroY: syOsc(0),
    markers,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    run,
  };
}

export function describeLineHlOscChart(
  data: ChartLineHlOscPoint[],
  options: {
    length?: number;
    highThreshold?: number;
    lowThreshold?: number;
  } = {},
): string {
  const cleaned = getLineHlOscFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineHlOscLength(
    options.length,
    DEFAULT_CHART_LINE_HL_OSC_LENGTH,
  );
  const highThreshold = normalizeLineHlOscThreshold(
    options.highThreshold,
    DEFAULT_CHART_LINE_HL_OSC_HIGH_THRESHOLD,
  );
  const lowThreshold = normalizeLineHlOscThreshold(
    options.lowThreshold,
    DEFAULT_CHART_LINE_HL_OSC_LOW_THRESHOLD,
  );
  return (
    `High-Low Oscillator chart over ${cleaned.length} bars ` +
    `(length ${length}, highThreshold ${highThreshold}, ` +
    `lowThreshold ${lowThreshold}). Top panel renders the close; ` +
    `bottom panel renders the difference between the high SMA and ` +
    `the low SMA across the lookback.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultOscFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineHlOsc = forwardRef<
  HTMLDivElement,
  ChartLineHlOscProps
>(function ChartLineHlOsc(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_HL_OSC_LENGTH,
    highThreshold = DEFAULT_CHART_LINE_HL_OSC_HIGH_THRESHOLD,
    lowThreshold = DEFAULT_CHART_LINE_HL_OSC_LOW_THRESHOLD,
    width = DEFAULT_CHART_LINE_HL_OSC_WIDTH,
    height = DEFAULT_CHART_LINE_HL_OSC_HEIGHT,
    padding = DEFAULT_CHART_LINE_HL_OSC_PADDING,
    panelGap = DEFAULT_CHART_LINE_HL_OSC_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_HL_OSC_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_HL_OSC_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_HL_OSC_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_HL_OSC_PRICE_COLOR,
    oscColor = DEFAULT_CHART_LINE_HL_OSC_OSC_COLOR,
    bullishColor = DEFAULT_CHART_LINE_HL_OSC_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_HL_OSC_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_HL_OSC_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_HL_OSC_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_HL_OSC_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_HL_OSC_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showOsc = true,
    showMarkers = true,
    showThresholds = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultPriceFormatter,
    formatOsc = defaultOscFormatter,
    formatX = defaultXFormatter,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...rest
  } = props;

  const reactId = useId();
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  const cleaned = useMemo(
    () => getLineHlOscFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineHlOscLayout({
        data: cleaned,
        length,
        highThreshold,
        lowThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      highThreshold,
      lowThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineHlOscSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineHlOscSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineHlOscSeriesId,
  ): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLegendClick(seriesId);
    }
  };

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (cleaned.length === 0) {
    return (
      <div
        ref={ref}
        className={className}
        style={style}
        data-section="chart-line-hl-osc-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineHlOscChart(cleaned, {
      length,
      highThreshold,
      lowThreshold,
    });

  const showPrice = !hidden.has('price');
  const showOscLine = !hidden.has('osc') && showOsc;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickOscValues.push(
      layout.oscMin + ((layout.oscMax - layout.oscMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'High-Low Oscillator chart'}
      aria-describedby={descId}
      data-section="chart-line-hl-osc"
      data-length={length}
      data-high-threshold={highThreshold}
      data-low-threshold={lowThreshold}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-hl-osc-title"
      >
        {ariaLabel ?? 'High-Low Oscillator chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-hl-osc-aria-desc"
      >
        {desc}
      </span>
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={0}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={animate ? 'motion-safe:animate-fade-in' : undefined}
        data-section="chart-line-hl-osc-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-hl-osc-grid">
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <line
                  key={`grid-price-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-hl-osc-grid-line-price"
                />
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <line
                  key={`grid-osc-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-hl-osc-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-hl-osc-axes">
            <line
              x1={layout.innerLeft}
              y1={layout.priceTop}
              x2={layout.innerLeft}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.priceBottom}
              x2={layout.innerRight}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oscTop}
              x2={layout.innerLeft}
              y2={layout.oscBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oscBottom}
              x2={layout.innerRight}
              y2={layout.oscBottom}
              stroke={axisColor}
            />
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <text
                  key={`tick-price-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-hl-osc-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <text
                  key={`tick-osc-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-hl-osc-tick-osc"
                >
                  {formatOsc(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroY}
            x2={layout.innerRight}
            y2={layout.zeroY}
            stroke={zeroColor}
            strokeDasharray="2 4"
            data-section="chart-line-hl-osc-zero-line"
          />
        ) : null}

        {showThresholds ? (
          <g data-section="chart-line-hl-osc-thresholds">
            <line
              x1={layout.innerLeft}
              y1={layout.highY}
              x2={layout.innerRight}
              y2={layout.highY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-hl-osc-high-line"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.lowY}
              x2={layout.innerRight}
              y2={layout.lowY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-hl-osc-low-line"
            />
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-hl-osc-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-hl-osc-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-hl-osc-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showOscLine ? (
          <path
            d={layout.oscPath}
            stroke={oscColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-hl-osc-line"
          />
        ) : null}

        {showMarkers && showOscLine ? (
          <g data-section="chart-line-hl-osc-markers">
            {layout.markers.map((m) => (
              <circle
                key={`osc-marker-${m.index}`}
                cx={m.cx}
                cy={m.cy}
                r={dotRadius + 2}
                fill={m.crossed === 'up' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onPointClick?.({ point: sample });
                }}
                data-section="chart-line-hl-osc-marker"
                data-cross={m.crossed}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-hl-osc-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.oscBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-hl-osc-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-hl-osc-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={180}
                  height={136}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-osc-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-osc-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-osc-tooltip-high"
                >
                  high {formatPrice(tooltipSample.high)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-osc-tooltip-low"
                >
                  low {formatPrice(tooltipSample.low)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-osc-tooltip-high-sma"
                >
                  highSMA{' '}
                  {tooltipSample.highSma == null
                    ? '--'
                    : formatPrice(tooltipSample.highSma)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-osc-tooltip-low-sma"
                >
                  lowSMA{' '}
                  {tooltipSample.lowSma == null
                    ? '--'
                    : formatPrice(tooltipSample.lowSma)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-osc-tooltip-osc"
                >
                  osc{' '}
                  {tooltipSample.osc == null
                    ? '--'
                    : formatOsc(tooltipSample.osc)}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-osc-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-osc-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-hl-osc-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | high {highThreshold} | low {lowThreshold}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-hl-osc-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            data-series-id="price"
            aria-pressed={!hidden.has('price')}
            onClick={() => handleLegendClick('price')}
            onKeyDown={(e) => handleLegendKey(e, 'price')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              fontSize: 11,
              opacity: hidden.has('price') ? 0.4 : 1,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                background: priceColor,
                borderRadius: 2,
              }}
            />
            close
          </button>
          <button
            type="button"
            data-series-id="osc"
            aria-pressed={!hidden.has('osc')}
            onClick={() => handleLegendClick('osc')}
            onKeyDown={(e) => handleLegendKey(e, 'osc')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              fontSize: 11,
              opacity: hidden.has('osc') ? 0.4 : 1,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                background: oscColor,
                borderRadius: 2,
              }}
            />
            hl osc
          </button>
        </div>
      ) : null}
    </div>
  );
});

ChartLineHlOsc.displayName = 'ChartLineHlOsc';
