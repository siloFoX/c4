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
 * ChartLinePpoZeroCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the close-only Percentage Price
 * Oscillator (PPO) line in the bottom panel, marking bullish
 * (cross up through zero) / bearish (cross down through zero)
 * momentum baseline regime transition events. Zero-line cross
 * variant of the PPO family that flags the discrete PPO
 * crossing of the zero baseline. PPO is the percentage
 * version of MACD, scale-invariant for cross-instrument
 * comparison.
 *
 *   fastEma  = EMA(close, fastLength)
 *   slowEma  = EMA(close, slowLength)
 *   ppo[i]   = slowEma != 0
 *                ? (fastEma - slowEma) / |slowEma| * 100
 *                : 0
 *   bullish  : prev ppo <= 0 && cur ppo > 0   (fast crosses above slow)
 *   bearish  : prev ppo >= 0 && cur ppo < 0   (fast crosses below slow)
 *
 * Defaults: `fastLength = 12`, `slowLength = 26` (canonical
 * PPO windows), `threshold = 0` (zero baseline). Regime
 * classifier `bullish` (ppo >= 0), `bearish` (ppo < 0),
 * `none` (ppo null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: fastEma = slowEma = K every bar ->
 *   numerator = 0 -> ppo = 0 (even when K = 0, the slowEma
 *   = 0 guard returns 0 rather than NaN). ppo = 0 sits on
 *   the threshold but the strict-inequality detector never
 *   fires. regime `bullish` (ppo >= 0). cross count = 0.
 *   Verified across K = 0..1234.
 * - **LINEAR UP close = i + 100**: at steady state fastEma
 *   - slowEma = (slowLength - fastLength) / 2 = 7. slowEma
 *   = i + 100 - (slowLength - 1) / 2 grows with i so ppo =
 *   7 / |slowEma| * 100 stays positive but decreases toward
 *   0 as i grows. regime `bullish`. 0 crosses.
 * - **LINEAR DOWN close = 100 - i**: ppo converges to a
 *   negative value with magnitude shrinking as i grows.
 *   regime `bearish`. 0 crosses.
 */

export interface ChartLinePpoZeroCrossPoint {
  x: number;
  close: number;
}

export type ChartLinePpoZeroCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLinePpoZeroCrossSeriesId = 'price' | 'ppo';

export type ChartLinePpoZeroCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLinePpoZeroCrossCross {
  index: number;
  x: number;
  kind: ChartLinePpoZeroCrossCrossKind;
}

export interface ChartLinePpoZeroCrossSample {
  index: number;
  x: number;
  close: number;
  ppo: number | null;
  regime: ChartLinePpoZeroCrossRegime;
}

export interface ChartLinePpoZeroCrossRun {
  series: ChartLinePpoZeroCrossPoint[];
  fastLength: number;
  slowLength: number;
  threshold: number;
  ppoValues: Array<number | null>;
  samples: ChartLinePpoZeroCrossSample[];
  crosses: ChartLinePpoZeroCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLinePpoZeroCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLinePpoZeroCrossLayout {
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
  priceDots: ChartLinePpoZeroCrossDot[];
  ppoPath: string;
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
    kind: ChartLinePpoZeroCrossCrossKind;
  }>;
  run: ChartLinePpoZeroCrossRun;
}

export interface ChartLinePpoZeroCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLinePpoZeroCrossPoint[];
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
  ppoColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPpo?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLinePpoZeroCrossSeriesId[];
  defaultHiddenSeries?: ChartLinePpoZeroCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLinePpoZeroCrossSeriesId;
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

export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_FAST_LENGTH = 12;
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_SLOW_LENGTH = 26;
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_PPO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PPO_ZERO_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLinePpoZeroCrossFinitePoints(
  data: readonly ChartLinePpoZeroCrossPoint[] | null | undefined,
): ChartLinePpoZeroCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLinePpoZeroCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLinePpoZeroCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce any finite threshold. */
export function normalizeLinePpoZeroCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

/** SMA-seeded EMA with CONST short-circuit. */
export function applyLinePpoZeroCrossEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (values.length < length) return out;
  let seedSum = 0;
  let winMin = Infinity;
  let winMax = -Infinity;
  let validSeed = true;
  for (let i = 0; i < length; i += 1) {
    const v = values[i];
    if (v == null) {
      validSeed = false;
      break;
    }
    seedSum += v;
    if (v < winMin) winMin = v;
    if (v > winMax) winMax = v;
  }
  if (!validSeed) return out;
  const seed = winMin === winMax ? winMin : posZero(seedSum / length);
  out[length - 1] = seed;
  const alpha = 2 / (length + 1);
  let prev = seed;
  for (let i = length; i < values.length; i += 1) {
    const v = values[i];
    if (v == null) {
      out[i] = null;
      continue;
    }
    const next = v === prev ? v : posZero(alpha * v + (1 - alpha) * prev);
    out[i] = next;
    prev = next;
  }
  return out;
}

export interface LinePpoZeroCrossChannels {
  fastEma: Array<number | null>;
  slowEma: Array<number | null>;
  ppo: Array<number | null>;
}

export function computeLinePpoZeroCross(
  series: readonly ChartLinePpoZeroCrossPoint[] | null | undefined,
  options: { fastLength?: number; slowLength?: number } = {},
): LinePpoZeroCrossChannels {
  const cleaned = getLinePpoZeroCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { fastEma: [], slowEma: [], ppo: [] };
  }
  const fastLength = normalizeLinePpoZeroCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_PPO_ZERO_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLinePpoZeroCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_PPO_ZERO_CROSS_SLOW_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const fastEma = applyLinePpoZeroCrossEma(closes, fastLength);
  const slowEma = applyLinePpoZeroCrossEma(closes, slowLength);

  const ppo: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const f = fastEma[i];
    const s = slowEma[i];
    if (f == null || s == null) continue;
    if (s === 0) {
      ppo[i] = 0;
    } else {
      ppo[i] = posZero(((f - s) / Math.abs(s)) * 100);
    }
  }

  return { fastEma, slowEma, ppo };
}

export function classifyLinePpoZeroCrossRegime(
  ppo: number | null,
  threshold: number,
): ChartLinePpoZeroCrossRegime {
  if (ppo == null) return 'none';
  if (ppo >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLinePpoZeroCrossCrosses(
  series: readonly ChartLinePpoZeroCrossPoint[],
  ppo: readonly (number | null)[],
  threshold: number,
): ChartLinePpoZeroCrossCross[] {
  const out: ChartLinePpoZeroCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = ppo[i - 1];
    const cur = ppo[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLinePpoZeroCross(
  data: ChartLinePpoZeroCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    threshold?: number;
  } = {},
): ChartLinePpoZeroCrossRun {
  const cleaned = getLinePpoZeroCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLinePpoZeroCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_PPO_ZERO_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLinePpoZeroCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_PPO_ZERO_CROSS_SLOW_LENGTH,
  );
  const threshold = normalizeLinePpoZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_PPO_ZERO_CROSS_THRESHOLD,
  );

  const channels = computeLinePpoZeroCross(series, {
    fastLength,
    slowLength,
  });

  const samples: ChartLinePpoZeroCrossSample[] = series.map((p, i) => {
    const v = channels.ppo[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      ppo: v,
      regime: classifyLinePpoZeroCrossRegime(v, threshold),
    };
  });

  const crosses = detectLinePpoZeroCrossCrosses(
    series,
    channels.ppo,
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
    ppoValues: channels.ppo,
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

export interface ComputeLinePpoZeroCrossLayoutOptions {
  data: ChartLinePpoZeroCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLinePpoZeroCrossLayout(
  opts: ComputeLinePpoZeroCrossLayoutOptions,
): ChartLinePpoZeroCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_PPO_ZERO_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_PPO_ZERO_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_PPO_ZERO_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_PPO_ZERO_CROSS_PANEL_GAP;
  const threshold = normalizeLinePpoZeroCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_PPO_ZERO_CROSS_THRESHOLD,
  );

  const run = runLinePpoZeroCross(opts.data, {
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
  for (const v of run.ppoValues) {
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
      ppoPath: '',
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
  const priceDots: ChartLinePpoZeroCrossDot[] = [];
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

  let ppoPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.ppo == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.ppo);
    ppoPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  ppoPath = ppoPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.ppoValues[c.index] ?? threshold);
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
    ppoPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLinePpoZeroCrossChart(
  data: ChartLinePpoZeroCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLinePpoZeroCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fastLength = normalizeLinePpoZeroCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_PPO_ZERO_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLinePpoZeroCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_PPO_ZERO_CROSS_SLOW_LENGTH,
  );
  const threshold = normalizeLinePpoZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_PPO_ZERO_CROSS_THRESHOLD,
  );
  return (
    `PPO Zero Cross chart over ${cleaned.length} bars ` +
    `(fastLength ${fastLength}, slowLength ${slowLength}, ` +
    `threshold ${threshold}). Top panel renders the close ` +
    `with bullish (fast EMA crosses above slow EMA) / bearish ` +
    `(fast EMA crosses below slow EMA) chevron overlays at ` +
    `every PPO zero-line cross; bottom panel renders the ` +
    `close-only Percentage Price Oscillator line on an auto-` +
    `fitted oscillator with the zero baseline reference band ` +
    `and marks PPO level ${threshold} regime trigger events.`
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

export const ChartLinePpoZeroCross = forwardRef<
  HTMLDivElement,
  ChartLinePpoZeroCrossProps
>(function ChartLinePpoZeroCross(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_SLOW_LENGTH,
    threshold = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_PRICE_COLOR,
    ppoColor = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_PPO_COLOR,
    bullishColor = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_PPO_ZERO_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPpo = true,
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
    () => getLinePpoZeroCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLinePpoZeroCrossLayout({
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
    ChartLinePpoZeroCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLinePpoZeroCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLinePpoZeroCrossSeriesId,
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
        data-section="chart-line-ppo-zero-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLinePpoZeroCrossChart(cleaned, {
      fastLength,
      slowLength,
      threshold,
    });

  const showPrice = !hidden.has('price');
  const showPpoLine = !hidden.has('ppo') && showPpo;

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
      aria-label={ariaLabel ?? 'PPO Zero Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-ppo-zero-cross"
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
        data-section="chart-line-ppo-zero-cross-title"
      >
        {ariaLabel ?? 'PPO Zero Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-ppo-zero-cross-aria-desc"
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
        data-section="chart-line-ppo-zero-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-ppo-zero-cross-grid">
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
                  data-section="chart-line-ppo-zero-cross-grid-line-price"
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
                  data-section="chart-line-ppo-zero-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-ppo-zero-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-ppo-zero-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-ppo-zero-cross-axes">
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
                  data-section="chart-line-ppo-zero-cross-tick-price"
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
                  data-section="chart-line-ppo-zero-cross-tick-osc"
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
            data-section="chart-line-ppo-zero-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-ppo-zero-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-ppo-zero-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showPpoLine ? (
          <path
            d={layout.ppoPath}
            stroke={ppoColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ppo-zero-cross-ppo-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-ppo-zero-cross-crosses"
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
                data-section={`chart-line-ppo-zero-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-ppo-zero-cross-overlay-crosses"
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
                data-section={`chart-line-ppo-zero-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-ppo-zero-cross-hover-targets">
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
                data-section="chart-line-ppo-zero-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-ppo-zero-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={232}
                  height={118}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ppo-zero-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ppo-zero-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ppo-zero-cross-tooltip-ppo"
                >
                  PPO{' '}
                  {tooltipSample.ppo == null
                    ? '--'
                    : formatOsc(tooltipSample.ppo)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ppo-zero-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ppo-zero-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ppo-zero-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ppo-zero-cross-tooltip-crosses"
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
          data-section="chart-line-ppo-zero-cross-badge"
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
          data-section="chart-line-ppo-zero-cross-legend"
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
              { id: 'ppo' as const, color: ppoColor, label: 'PPO' },
            ] satisfies Array<{
              id: ChartLinePpoZeroCrossSeriesId;
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

ChartLinePpoZeroCross.displayName = 'ChartLinePpoZeroCross';
