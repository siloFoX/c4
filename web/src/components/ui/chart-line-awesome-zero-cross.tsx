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
 * ChartLineAwesomeZeroCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Awesome
 * Oscillator (AO) line in the bottom panel, marking bullish
 * (cross up through zero) / bearish (cross down through zero)
 * 5-over-34 SMA midpoint baseline regime transition events.
 * Zero-line cross variant of the Awesome Oscillator family
 * that flags the discrete AO crossing of the zero baseline.
 *
 * Close-only adaptation: with no high/low, the close itself
 * is used as the median price proxy.
 *
 *   fastSma  = SMA(close, fastLength)
 *   slowSma  = SMA(close, slowLength)
 *   ao[i]    = fastSma[i] - slowSma[i]
 *   bullish  : prev ao <= 0 && cur ao > 0   (fast SMA crosses above slow)
 *   bearish  : prev ao >= 0 && cur ao < 0   (fast SMA crosses below slow)
 *
 * Defaults: `fastLength = 5`, `slowLength = 34` (canonical
 * Awesome Oscillator windows), `threshold = 0` (zero
 * baseline). Regime classifier `bullish` (ao >= 0), `bearish`
 * (ao < 0), `none` (ao null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: fastSma = slowSma = K every bar via
 *   the SMA `min === max` short-circuit -> ao = 0. ao = 0
 *   sits on the threshold but the strict-inequality detector
 *   never fires. regime `bullish` (ao >= 0). cross count = 0.
 *   Verified across K = 0..1234.
 * - **LINEAR UP close = i**: at steady state SMA(close, n) =
 *   i - (n-1)/2 so ao = (i - 2) - (i - 16.5) = 14.5 constant.
 *   14.5 > 0, regime `bullish`. 0 crosses.
 * - **LINEAR DOWN close = -i**: ao = -14.5 constant. -14.5 <
 *   0, regime `bearish`. 0 crosses.
 */

export interface ChartLineAwesomeZeroCrossPoint {
  x: number;
  close: number;
}

export type ChartLineAwesomeZeroCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineAwesomeZeroCrossSeriesId = 'price' | 'ao';

export type ChartLineAwesomeZeroCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineAwesomeZeroCrossCross {
  index: number;
  x: number;
  kind: ChartLineAwesomeZeroCrossCrossKind;
}

export interface ChartLineAwesomeZeroCrossSample {
  index: number;
  x: number;
  close: number;
  ao: number | null;
  regime: ChartLineAwesomeZeroCrossRegime;
}

export interface ChartLineAwesomeZeroCrossRun {
  series: ChartLineAwesomeZeroCrossPoint[];
  fastLength: number;
  slowLength: number;
  threshold: number;
  aoValues: Array<number | null>;
  samples: ChartLineAwesomeZeroCrossSample[];
  crosses: ChartLineAwesomeZeroCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineAwesomeZeroCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAwesomeZeroCrossLayout {
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
  priceDots: ChartLineAwesomeZeroCrossDot[];
  aoPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  thresholdY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineAwesomeZeroCrossCrossKind;
  }>;
  run: ChartLineAwesomeZeroCrossRun;
}

export interface ChartLineAwesomeZeroCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAwesomeZeroCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  aoColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAo?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAwesomeZeroCrossSeriesId[];
  defaultHiddenSeries?: ChartLineAwesomeZeroCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAwesomeZeroCrossSeriesId;
    hidden: boolean;
  }) => void;
  formatPrice?: (value: number) => string;
  formatOsc?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_FAST_LENGTH = 5;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_SLOW_LENGTH = 34;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_AO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineAwesomeZeroCrossFinitePoints(
  data: readonly ChartLineAwesomeZeroCrossPoint[] | null | undefined,
): ChartLineAwesomeZeroCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAwesomeZeroCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineAwesomeZeroCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce any finite threshold. */
export function normalizeLineAwesomeZeroCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

/** SMA with CONST short-circuit via min === max. */
export function applyLineAwesomeZeroCrossSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (length === 1) {
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i];
      if (v != null) out[i] = posZero(v);
    }
    return out;
  }
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    let valid = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = values[j];
      if (v == null) {
        valid = false;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!valid) continue;
    out[i] = winMin === winMax ? winMin : posZero(sum / length);
  }
  return out;
}

export interface LineAwesomeZeroCrossChannels {
  fastSma: Array<number | null>;
  slowSma: Array<number | null>;
  ao: Array<number | null>;
}

export function computeLineAwesomeZeroCross(
  series: readonly ChartLineAwesomeZeroCrossPoint[] | null | undefined,
  options: { fastLength?: number; slowLength?: number } = {},
): LineAwesomeZeroCrossChannels {
  const cleaned = getLineAwesomeZeroCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { fastSma: [], slowSma: [], ao: [] };
  }
  const fastLength = normalizeLineAwesomeZeroCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineAwesomeZeroCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_SLOW_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const fastSma = applyLineAwesomeZeroCrossSma(closes, fastLength);
  const slowSma = applyLineAwesomeZeroCrossSma(closes, slowLength);

  const ao: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const f = fastSma[i];
    const s = slowSma[i];
    if (f == null || s == null) continue;
    ao[i] = posZero(f - s);
  }

  return { fastSma, slowSma, ao };
}

export function classifyLineAwesomeZeroCrossRegime(
  ao: number | null,
  threshold: number,
): ChartLineAwesomeZeroCrossRegime {
  if (ao == null) return 'none';
  if (ao >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineAwesomeZeroCrossCrosses(
  series: readonly ChartLineAwesomeZeroCrossPoint[],
  ao: readonly (number | null)[],
  threshold: number,
): ChartLineAwesomeZeroCrossCross[] {
  const out: ChartLineAwesomeZeroCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = ao[i - 1];
    const cur = ao[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineAwesomeZeroCross(
  data: ChartLineAwesomeZeroCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    threshold?: number;
  } = {},
): ChartLineAwesomeZeroCrossRun {
  const cleaned = getLineAwesomeZeroCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineAwesomeZeroCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineAwesomeZeroCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_SLOW_LENGTH,
  );
  const threshold = normalizeLineAwesomeZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_THRESHOLD,
  );

  const channels = computeLineAwesomeZeroCross(series, {
    fastLength,
    slowLength,
  });

  const samples: ChartLineAwesomeZeroCrossSample[] = series.map((p, i) => {
    const v = channels.ao[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      ao: v,
      regime: classifyLineAwesomeZeroCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineAwesomeZeroCrossCrosses(
    series,
    channels.ao,
    threshold,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else noneCount += 1;
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const ok = series.length > Math.max(fastLength, slowLength);

  return {
    series,
    fastLength,
    slowLength,
    threshold,
    aoValues: channels.ao,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineAwesomeZeroCrossLayoutOptions {
  data: ChartLineAwesomeZeroCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAwesomeZeroCrossLayout(
  opts: ComputeLineAwesomeZeroCrossLayoutOptions,
): ChartLineAwesomeZeroCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_PANEL_GAP;
  const threshold = normalizeLineAwesomeZeroCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_THRESHOLD,
  );

  const run = runLineAwesomeZeroCross(opts.data, {
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
    threshold,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const v of run.aoValues) {
    if (v == null) continue;
    if (v < oscMin) oscMin = v;
    if (v > oscMax) oscMax = v;
  }
  if (oscMin > threshold) oscMin = threshold;
  if (oscMax < threshold) oscMax = threshold;
  if (
    !Number.isFinite(oscMin) ||
    !Number.isFinite(oscMax) ||
    oscMin === oscMax
  ) {
    oscMin = threshold - 1;
    oscMax = threshold + 1;
  } else {
    const padPct = 0.1;
    const range = oscMax - oscMin;
    oscMin -= range * padPct;
    oscMax += range * padPct;
  }
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const thresholdY = syOscBase(threshold);

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
      aoPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      thresholdY,
      crossMarkers: [],
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);

  let pricePath = '';
  const priceDots: ChartLineAwesomeZeroCrossDot[] = [];
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

  let aoPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.ao == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.ao);
    aoPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  aoPath = aoPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.aoValues[c.index] ?? threshold);
    return {
      index: c.index,
      x: c.x,
      cx,
      cyPrice,
      cyOsc,
      kind: c.kind,
    };
  });

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
    aoPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineAwesomeZeroCrossChart(
  data: ChartLineAwesomeZeroCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineAwesomeZeroCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fastLength = normalizeLineAwesomeZeroCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineAwesomeZeroCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_SLOW_LENGTH,
  );
  const threshold = normalizeLineAwesomeZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_THRESHOLD,
  );
  return (
    `Awesome Oscillator Zero Cross chart over ${cleaned.length} ` +
    `bars (fastLength ${fastLength}, slowLength ${slowLength}, ` +
    `threshold ${threshold}). Top panel renders the close with ` +
    `bullish (fast SMA crosses above slow SMA) / bearish (fast ` +
    `SMA crosses below slow SMA) chevron overlays at every AO ` +
    `zero-line cross; bottom panel renders the close-only ` +
    `Awesome Oscillator line on an auto-fitted oscillator with ` +
    `the zero baseline reference band and marks AO level ` +
    `${threshold} regime trigger events.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 3);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineAwesomeZeroCross = forwardRef<
  HTMLDivElement,
  ChartLineAwesomeZeroCrossProps
>(function ChartLineAwesomeZeroCross(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_SLOW_LENGTH,
    threshold = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_PRICE_COLOR,
    aoColor = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_AO_COLOR,
    bullishColor = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAo = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBands = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
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
    () => getLineAwesomeZeroCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAwesomeZeroCrossLayout({
        data: cleaned,
        fastLength,
        slowLength,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      fastLength,
      slowLength,
      threshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineAwesomeZeroCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineAwesomeZeroCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineAwesomeZeroCrossSeriesId,
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
        data-section="chart-line-awesome-zero-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAwesomeZeroCrossChart(cleaned, {
      fastLength,
      slowLength,
      threshold,
    });

  const showPrice = !hidden.has('price');
  const showAoLine = !hidden.has('ao') && showAo;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [layout.oscMin, threshold, layout.oscMax];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Awesome Oscillator Zero Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-awesome-zero-cross"
      data-fast-length={fastLength}
      data-slow-length={slowLength}
      data-threshold={threshold}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-awesome-zero-cross-title"
      >
        {ariaLabel ?? 'Awesome Oscillator Zero Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-awesome-zero-cross-aria-desc"
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
        data-section="chart-line-awesome-zero-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-awesome-zero-cross-grid">
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
                  data-section="chart-line-awesome-zero-cross-grid-line-price"
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
                  data-section="chart-line-awesome-zero-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-awesome-zero-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-awesome-zero-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-awesome-zero-cross-axes">
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
                  data-section="chart-line-awesome-zero-cross-tick-price"
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
                  data-section="chart-line-awesome-zero-cross-tick-osc"
                >
                  {formatOsc(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-awesome-zero-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-awesome-zero-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-awesome-zero-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showAoLine ? (
          <path
            d={layout.aoPath}
            stroke={aoColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-awesome-zero-cross-ao-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-awesome-zero-cross-crosses"
            role="group"
            aria-label="cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <circle
                key={`cross-osc-${m.index}`}
                cx={m.cx}
                cy={m.cyOsc}
                r={4}
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} cross at ${formatX(m.x)}`}
                data-section={`chart-line-awesome-zero-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-awesome-zero-cross-overlay-crosses"
            role="group"
            aria-label="overlay cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                    : `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                }
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)}`}
                data-section={`chart-line-awesome-zero-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-awesome-zero-cross-hover-targets">
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
                data-section="chart-line-awesome-zero-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-awesome-zero-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={236}
                  height={118}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-awesome-zero-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-awesome-zero-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-awesome-zero-cross-tooltip-ao"
                >
                  AO{' '}
                  {tooltipSample.ao == null
                    ? '--'
                    : formatOsc(tooltipSample.ao)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-awesome-zero-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-awesome-zero-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-awesome-zero-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-awesome-zero-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-awesome-zero-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          fast {fastLength} | slow {slowLength} | threshold {threshold} |
          crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-awesome-zero-cross-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              { id: 'price' as const, color: priceColor, label: 'close' },
              { id: 'ao' as const, color: aoColor, label: 'AO' },
            ] satisfies Array<{
              id: ChartLineAwesomeZeroCrossSeriesId;
              color: string;
              label: string;
            }>
          ).map(({ id, color, label }) => (
            <button
              key={id}
              type="button"
              data-series-id={id}
              aria-pressed={!hidden.has(id)}
              onClick={() => handleLegendClick(id)}
              onKeyDown={(e) => handleLegendKey(e, id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                fontSize: 11,
                opacity: hidden.has(id) ? 0.4 : 1,
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
                  background: color,
                  borderRadius: 2,
                }}
              />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

ChartLineAwesomeZeroCross.displayName = 'ChartLineAwesomeZeroCross';
