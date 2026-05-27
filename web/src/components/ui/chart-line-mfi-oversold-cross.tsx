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
 * ChartLineMfiOversoldCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Money Flow
 * Index (MFI) line in the bottom panel, marking bullish (exit
 * upward from oversold) / bearish (entry downward into
 * oversold) trigger events at the canonical 20 oversold
 * threshold. Single-threshold cross variant of the MFI family
 * that flags the discrete MFI level-20 entry and exit events
 * distinct from the canonical MFI / signal crossover. Mirror
 * of 11.928 `chart-line-mfi-overbought-cross` using the
 * oversold level (20) instead of the overbought level (80).
 *
 * Close-only adaptation: with no high / low / volume, the
 * directional money flow uses `|delta close|` as both the
 * money-flow magnitude (price * volume proxy) and the
 * directional cue. Positive / negative flows are summed over
 * the rolling `length` window:
 *
 *   delta[i] = close[i] - close[i-1]
 *   posFlow  = sum |delta| where delta > 0  (length window)
 *   negFlow  = sum |delta| where delta < 0  (length window)
 *   mfi[i]   = posFlow > 0 && negFlow > 0
 *                ? 100 - 100 / (1 + posFlow / negFlow)
 *                : posFlow > 0 ? 100
 *                  : negFlow > 0 ? 0
 *                    : 50           (zero-flow neutral fallback)
 *   bullish  : prev mfi <= 20 && cur mfi > 20   (exit upward)
 *   bearish  : prev mfi >= 20 && cur mfi < 20   (entry downward)
 *
 * Defaults: `length = 14` (canonical MFI window),
 * `threshold = 20` (canonical oversold level). Regime
 * classifier `oversold` (mfi <= 20), `neutral` (mfi > 20),
 * `none` (mfi null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: delta = 0 every bar -> posFlow =
 *   negFlow = 0 -> mfi = 50 via the zero-flow neutral
 *   fallback. 50 > 20, regime is `neutral` and the threshold
 *   is never crossed. cross count = 0. Verified across
 *   K = 0..1234.
 * - **LINEAR UP close = i**: delta = +1 every bar -> posFlow
 *   > 0, negFlow = 0 -> mfi = 100 constant once warm.
 *   100 > 20, regime `neutral`. 0 crosses.
 * - **LINEAR DOWN close = -i**: delta = -1 every bar -> posFlow
 *   = 0, negFlow > 0 -> mfi = 0 constant. 0 <= 20, regime
 *   `oversold`. 0 crosses (mfi jumps from null to 0 in one
 *   bar so prev-null skips the strict-inequality detector).
 */

export interface ChartLineMfiOversoldCrossPoint {
  x: number;
  close: number;
}

export type ChartLineMfiOversoldCrossRegime =
  | 'oversold'
  | 'neutral'
  | 'none';

export type ChartLineMfiOversoldCrossSeriesId = 'price' | 'mfi';

export type ChartLineMfiOversoldCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineMfiOversoldCrossCross {
  index: number;
  x: number;
  kind: ChartLineMfiOversoldCrossCrossKind;
}

export interface ChartLineMfiOversoldCrossSample {
  index: number;
  x: number;
  close: number;
  mfi: number | null;
  regime: ChartLineMfiOversoldCrossRegime;
}

export interface ChartLineMfiOversoldCrossRun {
  series: ChartLineMfiOversoldCrossPoint[];
  length: number;
  threshold: number;
  mfiValues: Array<number | null>;
  samples: ChartLineMfiOversoldCrossSample[];
  crosses: ChartLineMfiOversoldCrossCross[];
  oversoldCount: number;
  neutralCount: number;
  noneCount: number;
  exitCount: number;
  entryCount: number;
  ok: boolean;
}

export interface ChartLineMfiOversoldCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMfiOversoldCrossLayout {
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
  priceDots: ChartLineMfiOversoldCrossDot[];
  mfiPath: string;
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
    kind: ChartLineMfiOversoldCrossCrossKind;
  }>;
  run: ChartLineMfiOversoldCrossRun;
}

export interface ChartLineMfiOversoldCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMfiOversoldCrossPoint[];
  length?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  mfiColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMfi?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMfiOversoldCrossSeriesId[];
  defaultHiddenSeries?: ChartLineMfiOversoldCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMfiOversoldCrossSeriesId;
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

export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_THRESHOLD = 20;
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_MFI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineMfiOversoldCrossFinitePoints(
  data: readonly ChartLineMfiOversoldCrossPoint[] | null | undefined,
): ChartLineMfiOversoldCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMfiOversoldCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineMfiOversoldCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a finite threshold in [0, 100]. */
export function normalizeLineMfiOversoldCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 0 && value <= 100) return value;
  return fallback;
}

export interface LineMfiOversoldCrossChannels {
  mfi: Array<number | null>;
}

export function computeLineMfiOversoldCross(
  series: readonly ChartLineMfiOversoldCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineMfiOversoldCrossChannels {
  const cleaned = getLineMfiOversoldCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { mfi: [] };
  }
  const length = normalizeLineMfiOversoldCrossLength(
    options.length,
    DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const n = closes.length;
  const posFlow: number[] = new Array(n).fill(0);
  const negFlow: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    const delta = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    if (delta > 0) posFlow[i] = delta;
    else if (delta < 0) negFlow[i] = -delta;
  }

  const mfi: Array<number | null> = new Array(n).fill(null);
  for (let i = length; i < n; i += 1) {
    let pos = 0;
    let neg = 0;
    for (let j = i - length + 1; j <= i; j += 1) {
      pos += posFlow[j] ?? 0;
      neg += negFlow[j] ?? 0;
    }
    if (pos === 0 && neg === 0) {
      mfi[i] = 50;
    } else if (neg === 0) {
      mfi[i] = 100;
    } else if (pos === 0) {
      mfi[i] = 0;
    } else {
      mfi[i] = posZero(100 - 100 / (1 + pos / neg));
    }
  }

  return { mfi };
}

export function classifyLineMfiOversoldCrossRegime(
  mfi: number | null,
  threshold: number,
): ChartLineMfiOversoldCrossRegime {
  if (mfi == null) return 'none';
  if (mfi <= threshold) return 'oversold';
  return 'neutral';
}

export function detectLineMfiOversoldCrossCrosses(
  series: readonly ChartLineMfiOversoldCrossPoint[],
  mfi: readonly (number | null)[],
  threshold: number,
): ChartLineMfiOversoldCrossCross[] {
  const out: ChartLineMfiOversoldCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = mfi[i - 1];
    const cur = mfi[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineMfiOversoldCross(
  data: ChartLineMfiOversoldCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): ChartLineMfiOversoldCrossRun {
  const cleaned = getLineMfiOversoldCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineMfiOversoldCrossLength(
    options.length,
    DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_LENGTH,
  );
  const threshold = normalizeLineMfiOversoldCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_THRESHOLD,
  );

  const channels = computeLineMfiOversoldCross(series, { length });

  const samples: ChartLineMfiOversoldCrossSample[] = series.map((p, i) => {
    const v = channels.mfi[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      mfi: v,
      regime: classifyLineMfiOversoldCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineMfiOversoldCrossCrosses(
    series,
    channels.mfi,
    threshold,
  );

  let oversoldCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'oversold') oversoldCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else noneCount += 1;
  }
  let exitCount = 0;
  let entryCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') exitCount += 1;
    else entryCount += 1;
  }

  const ok = series.length > length + 1;

  return {
    series,
    length,
    threshold,
    mfiValues: channels.mfi,
    samples,
    crosses,
    oversoldCount,
    neutralCount,
    noneCount,
    exitCount,
    entryCount,
    ok,
  };
}

export interface ComputeLineMfiOversoldCrossLayoutOptions {
  data: ChartLineMfiOversoldCrossPoint[];
  length?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineMfiOversoldCrossLayout(
  opts: ComputeLineMfiOversoldCrossLayoutOptions,
): ChartLineMfiOversoldCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_PANEL_GAP;
  const threshold = normalizeLineMfiOversoldCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_THRESHOLD,
  );

  const run = runLineMfiOversoldCross(opts.data, {
    length: opts.length ?? undefined,
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
      mfiPath: '',
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
  const priceDots: ChartLineMfiOversoldCrossDot[] = [];
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

  let mfiPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.mfi == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.mfi);
    mfiPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  mfiPath = mfiPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.mfiValues[c.index] ?? 50);
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
    mfiPath,
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

export function describeLineMfiOversoldCrossChart(
  data: ChartLineMfiOversoldCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineMfiOversoldCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineMfiOversoldCrossLength(
    options.length,
    DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_LENGTH,
  );
  const threshold = normalizeLineMfiOversoldCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_THRESHOLD,
  );
  return (
    `MFI Oversold Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, threshold ${threshold}). Top panel ` +
    `renders the close with bullish (exit upward from oversold) ` +
    `/ bearish (entry downward into oversold) chevron overlays ` +
    `at every MFI threshold cross; bottom panel renders the ` +
    `close-only Money Flow Index line on a fixed 0-100 ` +
    `oscillator with the threshold and 50 reference bands and ` +
    `marks MFI level ${threshold} trigger entry / exit events.`
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

export const ChartLineMfiOversoldCross = forwardRef<
  HTMLDivElement,
  ChartLineMfiOversoldCrossProps
>(function ChartLineMfiOversoldCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_LENGTH,
    threshold = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_PRICE_COLOR,
    mfiColor = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_MFI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMfi = true,
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
    () => getLineMfiOversoldCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineMfiOversoldCrossLayout({
        data: cleaned,
        length,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, threshold, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineMfiOversoldCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineMfiOversoldCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineMfiOversoldCrossSeriesId,
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
        data-section="chart-line-mfi-oversold-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineMfiOversoldCrossChart(cleaned, { length, threshold });

  const showPrice = !hidden.has('price');
  const showMfiLine = !hidden.has('mfi') && showMfi;

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
      aria-label={ariaLabel ?? 'MFI Oversold Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-mfi-oversold-cross"
      data-length={length}
      data-threshold={threshold}
      data-total-points={cleaned.length}
      data-oversold-count={layout.run.oversoldCount}
      data-neutral-count={layout.run.neutralCount}
      data-exit-count={layout.run.exitCount}
      data-entry-count={layout.run.entryCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-mfi-oversold-cross-title"
      >
        {ariaLabel ?? 'MFI Oversold Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-mfi-oversold-cross-aria-desc"
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
        data-section="chart-line-mfi-oversold-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-mfi-oversold-cross-grid">
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
                  data-section="chart-line-mfi-oversold-cross-grid-line-price"
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
                  data-section="chart-line-mfi-oversold-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-mfi-oversold-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-mfi-oversold-cross-band-threshold"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.midY}
              x2={layout.innerRight}
              y2={layout.midY}
              stroke={midColor}
              strokeDasharray="2 4"
              data-section="chart-line-mfi-oversold-cross-band-mid"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-mfi-oversold-cross-axes">
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
                  data-section="chart-line-mfi-oversold-cross-tick-price"
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
                  data-section="chart-line-mfi-oversold-cross-tick-osc"
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
            data-section="chart-line-mfi-oversold-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-mfi-oversold-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-mfi-oversold-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showMfiLine ? (
          <path
            d={layout.mfiPath}
            stroke={mfiColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-mfi-oversold-cross-mfi-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-mfi-oversold-cross-crosses"
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
                data-section={`chart-line-mfi-oversold-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-mfi-oversold-cross-overlay-crosses"
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
                data-section={`chart-line-mfi-oversold-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-mfi-oversold-cross-hover-targets">
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
                data-section="chart-line-mfi-oversold-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-mfi-oversold-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={220}
                  height={118}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-oversold-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-oversold-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-oversold-cross-tooltip-mfi"
                >
                  MFI{' '}
                  {tooltipSample.mfi == null
                    ? '--'
                    : formatOsc(tooltipSample.mfi)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-oversold-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-oversold-cross-tooltip-counts"
                >
                  oversold {layout.run.oversoldCount} | normal{' '}
                  {layout.run.neutralCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-oversold-cross-tooltip-entries"
                >
                  exits {layout.run.exitCount} | entries{' '}
                  {layout.run.entryCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-oversold-cross-tooltip-crosses"
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
          data-section="chart-line-mfi-oversold-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | threshold {threshold} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-mfi-oversold-cross-legend"
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
              { id: 'mfi' as const, color: mfiColor, label: 'MFI' },
            ] satisfies Array<{
              id: ChartLineMfiOversoldCrossSeriesId;
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

ChartLineMfiOversoldCross.displayName = 'ChartLineMfiOversoldCross';
