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
 * ChartLineStochOversoldCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Stochastic %K
 * line in the bottom panel, marking bullish (exit upward) /
 * bearish (entry downward) trigger events at the canonical 20
 * oversold threshold. Single-threshold cross variant of the
 * Stochastic family that flags the discrete %K level-20 entry
 * and exit events distinct from the canonical %K / %D
 * crossover. Mirror of 11.923 `chart-line-stoch-overbought-
 * cross` using the oversold level instead of the overbought
 * level.
 *
 *   range[i] = max(close[i-n+1..i]) - min(close[i-n+1..i])
 *   rawK[i]  = range > 0
 *               ? ((close - lowestClose) / range) * 100
 *               : 50
 *   k[i]     = SMA(rawK, kSmoothing)
 *   bullish : prev <= threshold && cur > threshold  (exit upward)
 *   bearish : prev >= threshold && cur < threshold  (entry downward)
 *
 * Defaults: `length = 14` (canonical Stochastic window),
 * `kSmoothing = 3` (slow %K smoothing), `threshold = 20`.
 * Regime classifier `bearish` (k < threshold, oversold),
 * `neutral` (k >= threshold), `none` (k null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: range = 0 every bar -> rawK = 50
 *   neutral fallback. SMA of 50s = 50 via the `min === max`
 *   short-circuit. 50 > 20, regime is `neutral` and the
 *   threshold is never crossed. cross count = 0. Verified
 *   across K = 0..1234.
 */

export interface ChartLineStochOversoldCrossPoint {
  x: number;
  close: number;
}

export type ChartLineStochOversoldCrossRegime =
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineStochOversoldCrossSeriesId = 'price' | 'k';

export type ChartLineStochOversoldCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineStochOversoldCrossCross {
  index: number;
  x: number;
  kind: ChartLineStochOversoldCrossCrossKind;
}

export interface ChartLineStochOversoldCrossSample {
  index: number;
  x: number;
  close: number;
  k: number | null;
  regime: ChartLineStochOversoldCrossRegime;
}

export interface ChartLineStochOversoldCrossRun {
  series: ChartLineStochOversoldCrossPoint[];
  length: number;
  kSmoothing: number;
  threshold: number;
  kValues: Array<number | null>;
  samples: ChartLineStochOversoldCrossSample[];
  crosses: ChartLineStochOversoldCrossCross[];
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  exitCount: number;
  entryCount: number;
  ok: boolean;
}

export interface ChartLineStochOversoldCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineStochOversoldCrossLayout {
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
  priceDots: ChartLineStochOversoldCrossDot[];
  kPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  midY: number;
  thresholdY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineStochOversoldCrossCrossKind;
  }>;
  run: ChartLineStochOversoldCrossRun;
}

export interface ChartLineStochOversoldCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStochOversoldCrossPoint[];
  length?: number;
  kSmoothing?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showK?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStochOversoldCrossSeriesId[];
  defaultHiddenSeries?: ChartLineStochOversoldCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStochOversoldCrossSeriesId;
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

export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_K_SMOOTHING = 3;
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_THRESHOLD = 20;
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_K_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineStochOversoldCrossFinitePoints(
  data: readonly ChartLineStochOversoldCrossPoint[] | null | undefined,
): ChartLineStochOversoldCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStochOversoldCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineStochOversoldCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a finite threshold in [0, 100]. */
export function normalizeLineStochOversoldCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 0 && value <= 100) return value;
  return fallback;
}

/** SMA with CONST short-circuit via min === max. */
export function applyLineStochOversoldCrossSma(
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

export interface LineStochOversoldCrossChannels {
  k: Array<number | null>;
}

export function computeLineStochOversoldCross(
  series: readonly ChartLineStochOversoldCrossPoint[] | null | undefined,
  options: { length?: number; kSmoothing?: number } = {},
): LineStochOversoldCrossChannels {
  const cleaned = getLineStochOversoldCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { k: [] };
  }
  const length = normalizeLineStochOversoldCrossLength(
    options.length,
    DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_LENGTH,
  );
  const kSmoothing = normalizeLineStochOversoldCrossLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_K_SMOOTHING,
  );

  const closes = cleaned.map((p) => p.close);
  const rawK: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = length - 1; i < closes.length; i += 1) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = closes[j]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const range = hi - lo;
    if (range === 0) {
      rawK[i] = 50;
    } else {
      rawK[i] = posZero(((closes[i]! - lo) / range) * 100);
    }
  }
  const k = applyLineStochOversoldCrossSma(rawK, kSmoothing);
  return { k };
}

export function classifyLineStochOversoldCrossRegime(
  k: number | null,
  threshold: number,
): ChartLineStochOversoldCrossRegime {
  if (k == null) return 'none';
  if (k < threshold) return 'bearish';
  return 'neutral';
}

export function detectLineStochOversoldCrossCrosses(
  series: readonly ChartLineStochOversoldCrossPoint[],
  k: readonly (number | null)[],
  threshold: number,
): ChartLineStochOversoldCrossCross[] {
  const out: ChartLineStochOversoldCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = k[i - 1];
    const cur = k[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineStochOversoldCross(
  data: ChartLineStochOversoldCrossPoint[],
  options: {
    length?: number;
    kSmoothing?: number;
    threshold?: number;
  } = {},
): ChartLineStochOversoldCrossRun {
  const cleaned = getLineStochOversoldCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineStochOversoldCrossLength(
    options.length,
    DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_LENGTH,
  );
  const kSmoothing = normalizeLineStochOversoldCrossLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_K_SMOOTHING,
  );
  const threshold = normalizeLineStochOversoldCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_THRESHOLD,
  );

  const channels = computeLineStochOversoldCross(series, {
    length,
    kSmoothing,
  });

  const samples: ChartLineStochOversoldCrossSample[] = series.map((p, i) => {
    const v = channels.k[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      k: v,
      regime: classifyLineStochOversoldCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineStochOversoldCrossCrosses(
    series,
    channels.k,
    threshold,
  );

  let bearishCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'bearish') bearishCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else noneCount += 1;
  }
  let exitCount = 0;
  let entryCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') exitCount += 1;
    else entryCount += 1;
  }

  const ok = series.length > length + kSmoothing;

  return {
    series,
    length,
    kSmoothing,
    threshold,
    kValues: channels.k,
    samples,
    crosses,
    bearishCount,
    neutralCount,
    noneCount,
    exitCount,
    entryCount,
    ok,
  };
}

export interface ComputeLineStochOversoldCrossLayoutOptions {
  data: ChartLineStochOversoldCrossPoint[];
  length?: number;
  kSmoothing?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineStochOversoldCrossLayout(
  opts: ComputeLineStochOversoldCrossLayoutOptions,
): ChartLineStochOversoldCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_PANEL_GAP;
  const threshold = normalizeLineStochOversoldCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_THRESHOLD,
  );

  const run = runLineStochOversoldCross(opts.data, {
    length: opts.length ?? undefined,
    kSmoothing: opts.kSmoothing ?? undefined,
    threshold,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  const oscMin = 0;
  const oscMax = 100;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const midY = syOscBase(50);
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
      kPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      midY,
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
  const priceDots: ChartLineStochOversoldCrossDot[] = [];
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

  let kPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.k == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.k);
    kPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  kPath = kPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.kValues[c.index] ?? 50);
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
    kPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    midY,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineStochOversoldCrossChart(
  data: ChartLineStochOversoldCrossPoint[],
  options: {
    length?: number;
    kSmoothing?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineStochOversoldCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineStochOversoldCrossLength(
    options.length,
    DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_LENGTH,
  );
  const kSmoothing = normalizeLineStochOversoldCrossLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_K_SMOOTHING,
  );
  const threshold = normalizeLineStochOversoldCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_THRESHOLD,
  );
  return (
    `Stochastic Oversold Cross chart over ${cleaned.length} ` +
    `bars (length ${length}, kSmoothing ${kSmoothing}, ` +
    `threshold ${threshold}). Top panel renders the close with ` +
    `bullish (exit upward) / bearish (entry downward) arrow ` +
    `overlays at every Stochastic %K threshold cross; bottom ` +
    `panel renders the close-only Stochastic %K line on a ` +
    `fixed 0-100 oscillator with the threshold and 50 ` +
    `reference bands and marks %K level ${threshold} trigger ` +
    `entry / exit events.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 2);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineStochOversoldCross = forwardRef<
  HTMLDivElement,
  ChartLineStochOversoldCrossProps
>(function ChartLineStochOversoldCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_LENGTH,
    kSmoothing = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_K_SMOOTHING,
    threshold = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_PRICE_COLOR,
    kColor = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_K_COLOR,
    bullishColor = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_STOCH_OVERSOLD_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showK = true,
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
    () => getLineStochOversoldCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineStochOversoldCrossLayout({
        data: cleaned,
        length,
        kSmoothing,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      kSmoothing,
      threshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineStochOversoldCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineStochOversoldCrossSeriesId,
  ) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineStochOversoldCrossSeriesId,
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
        data-section="chart-line-stoch-oversold-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineStochOversoldCrossChart(cleaned, {
      length,
      kSmoothing,
      threshold,
    });

  const showPrice = !hidden.has('price');
  const showKLine = !hidden.has('k') && showK;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [0, threshold, 50, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Stochastic Oversold Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-stoch-oversold-cross"
      data-length={length}
      data-k-smoothing={kSmoothing}
      data-threshold={threshold}
      data-total-points={cleaned.length}
      data-bearish-count={layout.run.bearishCount}
      data-neutral-count={layout.run.neutralCount}
      data-exit-count={layout.run.exitCount}
      data-entry-count={layout.run.entryCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-stoch-oversold-cross-title"
      >
        {ariaLabel ?? 'Stochastic Oversold Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-stoch-oversold-cross-aria-desc"
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
        data-section="chart-line-stoch-oversold-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-stoch-oversold-cross-grid">
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
                  data-section="chart-line-stoch-oversold-cross-grid-line-price"
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
                  data-section="chart-line-stoch-oversold-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-stoch-oversold-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-stoch-oversold-cross-band-threshold"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.midY}
              x2={layout.innerRight}
              y2={layout.midY}
              stroke={midColor}
              strokeDasharray="2 4"
              data-section="chart-line-stoch-oversold-cross-band-mid"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-stoch-oversold-cross-axes">
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
                  data-section="chart-line-stoch-oversold-cross-tick-price"
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
                  data-section="chart-line-stoch-oversold-cross-tick-osc"
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
            data-section="chart-line-stoch-oversold-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-stoch-oversold-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-stoch-oversold-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showKLine ? (
          <path
            d={layout.kPath}
            stroke={kColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-oversold-cross-k-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-stoch-oversold-cross-crosses"
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
                data-section={`chart-line-stoch-oversold-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-stoch-oversold-cross-overlay-crosses"
            role="group"
            aria-label="overlay cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                    : `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                }
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)}`}
                data-section={`chart-line-stoch-oversold-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-stoch-oversold-cross-hover-targets">
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
                data-section="chart-line-stoch-oversold-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-stoch-oversold-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={216}
                  height={118}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-oversold-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-oversold-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-oversold-cross-tooltip-k"
                >
                  %K{' '}
                  {tooltipSample.k == null
                    ? '--'
                    : formatOsc(tooltipSample.k)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-oversold-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-oversold-cross-tooltip-counts"
                >
                  oversold {layout.run.bearishCount} | normal{' '}
                  {layout.run.neutralCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-oversold-cross-tooltip-entries"
                >
                  exits {layout.run.exitCount} | entries{' '}
                  {layout.run.entryCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-oversold-cross-tooltip-crosses"
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
          data-section="chart-line-stoch-oversold-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | k {kSmoothing} | threshold {threshold} |
          crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-stoch-oversold-cross-legend"
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
              { id: 'k' as const, color: kColor, label: '%K' },
            ] satisfies Array<{
              id: ChartLineStochOversoldCrossSeriesId;
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

ChartLineStochOversoldCross.displayName = 'ChartLineStochOversoldCross';
