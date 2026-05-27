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
 * ChartLineRmiMidCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the close-only Relative Momentum
 * Index (RMI) line in the bottom panel, marking bullish (cross
 * up through the 50 midline) / bearish (cross down through 50)
 * RSI-with-lookback centerline regime transition events with
 * momentum bias coloring. Midline-50 cross variant of the Roger
 * Altman RMI family that flags the discrete RMI crossing of the
 * neutral 50 centerline for trend confirmation.
 *
 * RMI is RSI with a lookback period: instead of comparing the
 * current close to the previous close, it compares to the close
 * `lookback` bars ago and Wilder-smooths the resulting up/down
 * moves over a `length` window. The lookback turns RSI into a
 * momentum-aware oscillator -- it reads positive only when
 * sustained price gains over the lookback window dominate.
 *
 *   mom_i      = close_i - close_{i - lookback}
 *   gain_i     = max(0,  mom_i)
 *   loss_i     = max(0, -mom_i)
 *   avg_gain_i = Wilder(gain, length, seed = SMA at i = L+N-1)
 *   avg_loss_i = Wilder(loss, length, seed = SMA at i = L+N-1)
 *   rmi_i      = avg_loss == 0
 *                ? (avg_gain == 0 ? 50 : 100)
 *                : 100 - 100 / (1 + avg_gain / avg_loss)
 *   bullish    : prev rmi <= 50 && cur rmi > 50  (momentum up)
 *   bearish    : prev rmi >= 50 && cur rmi < 50  (momentum down)
 *
 * Defaults: `length = 14`, `lookback = 5` (Altman's canonical
 * settings), `threshold = 50` (neutral centerline). Regime
 * classifier `bullish` (rmi >= 50), `bearish` (rmi < 50),
 * `none` (rmi null). Cross markers + price-panel chevrons inherit
 * the bullish / bearish momentum bias coloring so the regime is
 * visually obvious at the crossover bar.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: mom = 0 every bar, gain = loss = 0,
 *   so avg_gain = avg_loss = 0 -> rmi = 50 (the both-zero
 *   neutral fallback). rmi = 50 sits on the threshold but the
 *   strict-inequality detector never fires. regime `bullish`
 *   (rmi >= 50). cross count = 0. Verified across K = 0..1234.
 * - **LINEAR UP close = i**: mom = +lookback every bar, gain =
 *   lookback, loss = 0. avg_loss == 0 with avg_gain > 0, so
 *   rmi = 100. regime `bullish`. 0 crosses.
 * - **LINEAR DOWN close = -i**: mom = -lookback every bar,
 *   gain = 0, loss = lookback. avg_gain = 0, so rmi = 0.
 *   regime `bearish`. 0 crosses.
 */

export interface ChartLineRmiMidCrossPoint {
  x: number;
  close: number;
}

export type ChartLineRmiMidCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineRmiMidCrossSeriesId = 'price' | 'rmi';

export type ChartLineRmiMidCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineRmiMidCrossCross {
  index: number;
  x: number;
  kind: ChartLineRmiMidCrossCrossKind;
}

export interface ChartLineRmiMidCrossSample {
  index: number;
  x: number;
  close: number;
  rmi: number | null;
  regime: ChartLineRmiMidCrossRegime;
}

export interface ChartLineRmiMidCrossRun {
  series: ChartLineRmiMidCrossPoint[];
  length: number;
  lookback: number;
  threshold: number;
  rmiValues: Array<number | null>;
  samples: ChartLineRmiMidCrossSample[];
  crosses: ChartLineRmiMidCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineRmiMidCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineRmiMidCrossLayout {
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
  priceDots: ChartLineRmiMidCrossDot[];
  rmiPath: string;
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
    kind: ChartLineRmiMidCrossCrossKind;
  }>;
  run: ChartLineRmiMidCrossRun;
}

export interface ChartLineRmiMidCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRmiMidCrossPoint[];
  length?: number;
  lookback?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  rmiColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRmi?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRmiMidCrossSeriesId[];
  defaultHiddenSeries?: ChartLineRmiMidCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRmiMidCrossSeriesId;
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

export const DEFAULT_CHART_LINE_RMI_MID_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_LOOKBACK = 5;
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_THRESHOLD = 50;
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_RMI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RMI_MID_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineRmiMidCrossFinitePoints(
  data: readonly ChartLineRmiMidCrossPoint[] | null | undefined,
): ChartLineRmiMidCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRmiMidCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineRmiMidCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce any finite threshold. */
export function normalizeLineRmiMidCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

/**
 * Wilder-style smoothed moving average. SMA-seeded at index
 * `length - 1` of the valid-window, then recursively
 * `(prev * (n - 1) + value) / n`.
 *
 * Returns null for indices where the seed window has not been
 * filled yet.
 */
export function applyLineRmiMidCrossWilder(
  values: readonly (number | null)[],
  length: number,
  firstValidIdx: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (firstValidIdx + length - 1 >= values.length) return out;
  let sum = 0;
  for (let j = firstValidIdx; j < firstValidIdx + length; j += 1) {
    const v = values[j];
    if (v == null) return out;
    sum += v;
  }
  const seedIdx = firstValidIdx + length - 1;
  let prev = sum / length;
  out[seedIdx] = posZero(prev);
  for (let i = seedIdx + 1; i < values.length; i += 1) {
    const v = values[i];
    if (v == null) {
      continue;
    }
    prev = (prev * (length - 1) + v) / length;
    out[i] = posZero(prev);
  }
  return out;
}

export interface LineRmiMidCrossChannels {
  rmi: Array<number | null>;
  length: number;
  lookback: number;
}

export function computeLineRmiMidCross(
  series: readonly ChartLineRmiMidCrossPoint[] | null | undefined,
  options: { length?: number; lookback?: number } = {},
): LineRmiMidCrossChannels {
  const cleaned = getLineRmiMidCrossFinitePoints(series);
  const length = normalizeLineRmiMidCrossLength(
    options.length,
    DEFAULT_CHART_LINE_RMI_MID_CROSS_LENGTH,
  );
  const lookback = normalizeLineRmiMidCrossLength(
    options.lookback,
    DEFAULT_CHART_LINE_RMI_MID_CROSS_LOOKBACK,
  );
  if (cleaned.length === 0) {
    return { rmi: [], length, lookback };
  }
  const closes = cleaned.map((p) => p.close);
  const gain: Array<number | null> = new Array(closes.length).fill(null);
  const loss: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = lookback; i < closes.length; i += 1) {
    const cur = closes[i];
    const prev = closes[i - lookback];
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) continue;
    const mom = cur - prev;
    gain[i] = posZero(Math.max(0, mom));
    loss[i] = posZero(Math.max(0, -mom));
  }
  const avgGain = applyLineRmiMidCrossWilder(gain, length, lookback);
  const avgLoss = applyLineRmiMidCrossWilder(loss, length, lookback);

  const rmi: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const g = avgGain[i];
    const l = avgLoss[i];
    if (g == null || l == null) continue;
    if (l === 0) {
      rmi[i] = g === 0 ? 50 : 100;
    } else if (g === 0) {
      rmi[i] = 0;
    } else {
      rmi[i] = posZero(100 - 100 / (1 + g / l));
    }
  }

  return { rmi, length, lookback };
}

export function classifyLineRmiMidCrossRegime(
  rmi: number | null,
  threshold: number,
): ChartLineRmiMidCrossRegime {
  if (rmi == null) return 'none';
  if (rmi >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineRmiMidCrossCrosses(
  series: readonly ChartLineRmiMidCrossPoint[],
  rmi: readonly (number | null)[],
  threshold: number,
): ChartLineRmiMidCrossCross[] {
  const out: ChartLineRmiMidCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = rmi[i - 1];
    const cur = rmi[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineRmiMidCross(
  data: ChartLineRmiMidCrossPoint[],
  options: {
    length?: number;
    lookback?: number;
    threshold?: number;
  } = {},
): ChartLineRmiMidCrossRun {
  const cleaned = getLineRmiMidCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const threshold = normalizeLineRmiMidCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_RMI_MID_CROSS_THRESHOLD,
  );
  const channels = computeLineRmiMidCross(series, {
    length: options.length ?? undefined,
    lookback: options.lookback ?? undefined,
  });

  const samples: ChartLineRmiMidCrossSample[] = series.map((p, i) => {
    const v = channels.rmi[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      rmi: v,
      regime: classifyLineRmiMidCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineRmiMidCrossCrosses(
    series,
    channels.rmi,
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

  const ok = series.length > channels.length + channels.lookback;

  return {
    series,
    length: channels.length,
    lookback: channels.lookback,
    threshold,
    rmiValues: channels.rmi,
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

export interface ComputeLineRmiMidCrossLayoutOptions {
  data: ChartLineRmiMidCrossPoint[];
  length?: number;
  lookback?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineRmiMidCrossLayout(
  opts: ComputeLineRmiMidCrossLayoutOptions,
): ChartLineRmiMidCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_RMI_MID_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_RMI_MID_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_RMI_MID_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_RMI_MID_CROSS_PANEL_GAP;
  const threshold = normalizeLineRmiMidCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_RMI_MID_CROSS_THRESHOLD,
  );

  const run = runLineRmiMidCross(opts.data, {
    length: opts.length ?? undefined,
    lookback: opts.lookback ?? undefined,
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
      rmiPath: '',
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
  const priceDots: ChartLineRmiMidCrossDot[] = [];
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

  let rmiPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.rmi == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.rmi);
    rmiPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  rmiPath = rmiPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.rmiValues[c.index] ?? threshold);
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
    rmiPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineRmiMidCrossChart(
  data: ChartLineRmiMidCrossPoint[],
  options: {
    length?: number;
    lookback?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineRmiMidCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineRmiMidCrossLength(
    options.length,
    DEFAULT_CHART_LINE_RMI_MID_CROSS_LENGTH,
  );
  const lookback = normalizeLineRmiMidCrossLength(
    options.lookback,
    DEFAULT_CHART_LINE_RMI_MID_CROSS_LOOKBACK,
  );
  const threshold = normalizeLineRmiMidCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_RMI_MID_CROSS_THRESHOLD,
  );
  return (
    `RMI Mid Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, lookback ${lookback}, threshold ` +
    `${threshold}). Top panel renders the close with bullish ` +
    `(RSI-with-lookback centerline cross up) / bearish (cross ` +
    `down) chevron overlays at every Relative Momentum Index ` +
    `centerline crossover with momentum bias coloring; bottom ` +
    `panel renders the close-only RMI line on a fixed 0 to 100 ` +
    `oscillator with the centerline ${threshold} reference band ` +
    `and marks RMI level ${threshold} centerline regime ` +
    `transition events for trend confirmation.`
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

export const ChartLineRmiMidCross = forwardRef<
  HTMLDivElement,
  ChartLineRmiMidCrossProps
>(function ChartLineRmiMidCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_RMI_MID_CROSS_LENGTH,
    lookback = DEFAULT_CHART_LINE_RMI_MID_CROSS_LOOKBACK,
    threshold = DEFAULT_CHART_LINE_RMI_MID_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_RMI_MID_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_RMI_MID_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_RMI_MID_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_RMI_MID_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_RMI_MID_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_RMI_MID_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_RMI_MID_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_RMI_MID_CROSS_PRICE_COLOR,
    rmiColor = DEFAULT_CHART_LINE_RMI_MID_CROSS_RMI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_RMI_MID_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_RMI_MID_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_RMI_MID_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_RMI_MID_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_RMI_MID_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRmi = true,
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
    () => getLineRmiMidCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineRmiMidCrossLayout({
        data: cleaned,
        length,
        lookback,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      lookback,
      threshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineRmiMidCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineRmiMidCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineRmiMidCrossSeriesId,
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
        data-section="chart-line-rmi-mid-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineRmiMidCrossChart(cleaned, { length, lookback, threshold });

  const showPrice = !hidden.has('price');
  const showRmiLine = !hidden.has('rmi') && showRmi;

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
      aria-label={ariaLabel ?? 'RMI Mid Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-rmi-mid-cross"
      data-length={length}
      data-lookback={lookback}
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
        data-section="chart-line-rmi-mid-cross-title"
      >
        {ariaLabel ?? 'RMI Mid Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-rmi-mid-cross-aria-desc"
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
        data-section="chart-line-rmi-mid-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-rmi-mid-cross-grid">
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
                  data-section="chart-line-rmi-mid-cross-grid-line-price"
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
                  data-section="chart-line-rmi-mid-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-rmi-mid-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-rmi-mid-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-rmi-mid-cross-axes">
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
                  data-section="chart-line-rmi-mid-cross-tick-price"
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
                  data-section="chart-line-rmi-mid-cross-tick-osc"
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
            data-section="chart-line-rmi-mid-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-rmi-mid-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-rmi-mid-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showRmiLine ? (
          <path
            d={layout.rmiPath}
            stroke={rmiColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-rmi-mid-cross-rmi-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-rmi-mid-cross-crosses"
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
                data-section={`chart-line-rmi-mid-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-rmi-mid-cross-overlay-crosses"
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
                data-section={`chart-line-rmi-mid-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-rmi-mid-cross-hover-targets">
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
                data-section="chart-line-rmi-mid-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-rmi-mid-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={236}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rmi-mid-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rmi-mid-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rmi-mid-cross-tooltip-rmi"
                >
                  RMI{' '}
                  {tooltipSample.rmi == null
                    ? '--'
                    : formatOsc(tooltipSample.rmi)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rmi-mid-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rmi-mid-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rmi-mid-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rmi-mid-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rmi-mid-cross-tooltip-params"
                >
                  length {layout.run.length} | lookback{' '}
                  {layout.run.lookback}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-rmi-mid-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | lookback {lookback} | threshold {threshold} |
          crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-rmi-mid-cross-legend"
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
              { id: 'rmi' as const, color: rmiColor, label: 'RMI' },
            ] satisfies Array<{
              id: ChartLineRmiMidCrossSeriesId;
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

ChartLineRmiMidCross.displayName = 'ChartLineRmiMidCross';
