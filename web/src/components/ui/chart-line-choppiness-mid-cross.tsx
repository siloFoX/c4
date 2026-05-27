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
 * ChartLineChoppinessMidCross -- pure-SVG dual-panel chart with
 * the close in the top panel and a close-only Choppiness Index
 * line in the bottom panel, marking bullish (CI crosses below
 * 50, trending bias start) / bearish (CI crosses above 50,
 * ranging bias start) midline-cross regime transition events.
 * Splits the Choppiness Index range into trending-side
 * (CI < 50) vs ranging-side (CI >= 50) halves around the
 * canonical 50 centerline.
 *
 *   TR[i]     = i == 0 ? 0 : |close[i] - close[i-1]|
 *   sumTR[i]  = sum(TR, n) over the last n bars
 *   range[i]  = max(close, n) - min(close, n) over last n bars
 *   ci[i]     = range > 0
 *               ? 100 * log10(sumTR / range) / log10(n)
 *               : 50  (neutral fallback when range collapses)
 *   bullish  : prev >= 50 && cur < 50  (trending start)
 *   bearish  : prev <= 50 && cur > 50  (ranging start)
 *
 * Defaults: `length = 14` (canonical Choppiness Index window),
 * `threshold = 50` (midline / centerline). Regime classifier
 * `bullish` (ci < 50, trending bias), `bearish` (ci >= 50,
 * ranging bias), `none` (ci null). The classifier inverts the
 * standard "bullish = above threshold" convention to honor the
 * Choppiness Index semantics where LOW values indicate strong
 * trending (the actionable / momentum-friendly regime).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: TR = 0 every bar -> sumTR = 0, range =
 *   max - min = 0 -> formula degenerates to 0/0, so the
 *   primitive applies the explicit neutral fallback `ci = 50`
 *   on every settled bar. 50 sits on the threshold; regime
 *   `bearish` (ci >= 50, ranging side). cross count = 0.
 *   Verified across K = 0..1234.
 * - **LINEAR UP close = i**: TR = 1 for every bar >= 1 (since
 *   |close[i] - close[i-1]| = 1), tr[0] = 0 by convention. At
 *   the seed bar i = length - 1 the window includes tr[0] so
 *   sumTR = length - 1; range = length - 1 -> ratio = 1 ->
 *   ci = 0 (the floor). From i = length onward tr[0] drops out
 *   of the window, sumTR = length, range = length - 1 -> ratio
 *   = length / (length - 1), giving ci = 100 * log10(ratio) /
 *   log10(length). For length = 14 this is ~ 2.808 -- still
 *   well below 50 -> regime `bullish` (trending). 0 crosses
 *   (ci jumps from null directly to 0 then to ~ 2.808).
 * - **LINEAR DOWN close = -i**: same shape by symmetry.
 * - **Saw-tooth (alternating bodies, e.g. 10, 11, 10, 11, ...)**:
 *   tr = 1 for every i >= 1. From i = length the full window
 *   has sumTR = length and range = 1 -> ci = 100 (the ceiling).
 *   The canonical "fully ranging" anchor at the opposite
 *   extreme.
 */

export interface ChartLineChoppinessMidCrossPoint {
  x: number;
  close: number;
}

export type ChartLineChoppinessMidCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineChoppinessMidCrossSeriesId = 'price' | 'ci';

export type ChartLineChoppinessMidCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineChoppinessMidCrossCross {
  index: number;
  x: number;
  kind: ChartLineChoppinessMidCrossCrossKind;
}

export interface ChartLineChoppinessMidCrossSample {
  index: number;
  x: number;
  close: number;
  ci: number | null;
  regime: ChartLineChoppinessMidCrossRegime;
}

export interface ChartLineChoppinessMidCrossRun {
  series: ChartLineChoppinessMidCrossPoint[];
  length: number;
  threshold: number;
  ciValues: Array<number | null>;
  samples: ChartLineChoppinessMidCrossSample[];
  crosses: ChartLineChoppinessMidCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineChoppinessMidCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineChoppinessMidCrossLayout {
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
  priceDots: ChartLineChoppinessMidCrossDot[];
  ciPath: string;
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
    kind: ChartLineChoppinessMidCrossCrossKind;
  }>;
  run: ChartLineChoppinessMidCrossRun;
}

export interface ChartLineChoppinessMidCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineChoppinessMidCrossPoint[];
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
  ciColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCi?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineChoppinessMidCrossSeriesId[];
  defaultHiddenSeries?: ChartLineChoppinessMidCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineChoppinessMidCrossSeriesId;
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

export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_THRESHOLD = 50;
export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_CI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineChoppinessMidCrossFinitePoints(
  data: readonly ChartLineChoppinessMidCrossPoint[] | null | undefined,
): ChartLineChoppinessMidCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineChoppinessMidCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineChoppinessMidCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a finite threshold in [0, 100]. */
export function normalizeLineChoppinessMidCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 0 && value <= 100) return value;
  return fallback;
}

export function computeLineChoppinessMidCross(
  series:
    | readonly ChartLineChoppinessMidCrossPoint[]
    | null
    | undefined,
  options: { length?: number } = {},
): { ci: Array<number | null> } {
  const cleaned = getLineChoppinessMidCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { ci: [] };
  }
  const length = normalizeLineChoppinessMidCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const tr: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i += 1) {
    tr[i] = Math.abs(closes[i]! - closes[i - 1]!);
  }
  const logN = Math.log10(length);
  const ci: Array<number | null> = new Array(closes.length).fill(null);

  for (let i = length - 1; i < closes.length; i += 1) {
    let sumTR = 0;
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      sumTR += tr[j]!;
      const v = closes[j]!;
      if (v > hi) hi = v;
      if (v < lo) lo = v;
    }
    const range = hi - lo;
    if (range <= 0 || sumTR <= 0) {
      ci[i] = 50;
    } else {
      ci[i] = posZero((100 * Math.log10(sumTR / range)) / logN);
    }
  }
  return { ci };
}

/**
 * Choppiness regime inverts the standard "bullish = above
 * threshold" convention: LOW CI = trending = `bullish`, HIGH
 * CI (>= threshold) = ranging = `bearish`. With the canonical
 * 50 midline this splits the [0, 100] range into trending vs
 * ranging halves.
 */
export function classifyLineChoppinessMidCrossRegime(
  ci: number | null,
  threshold: number,
): ChartLineChoppinessMidCrossRegime {
  if (ci == null) return 'none';
  if (ci < threshold) return 'bullish';
  return 'bearish';
}

export function detectLineChoppinessMidCrossCrosses(
  series: readonly ChartLineChoppinessMidCrossPoint[],
  ci: readonly (number | null)[],
  threshold: number,
): ChartLineChoppinessMidCrossCross[] {
  const out: ChartLineChoppinessMidCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = ci[i - 1];
    const cur = ci[i];
    if (prev == null || cur == null) continue;
    // CI crossing DOWN through the midline -> trending start = bullish.
    if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev <= threshold && cur > threshold) {
      // CI crossing UP through the midline -> ranging start = bearish.
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineChoppinessMidCross(
  data: ChartLineChoppinessMidCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): ChartLineChoppinessMidCrossRun {
  const cleaned = getLineChoppinessMidCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineChoppinessMidCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_LENGTH,
  );
  const threshold = normalizeLineChoppinessMidCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_THRESHOLD,
  );

  const channels = computeLineChoppinessMidCross(series, { length });

  const samples: ChartLineChoppinessMidCrossSample[] = series.map((p, i) => {
    const v = channels.ci[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      ci: v,
      regime: classifyLineChoppinessMidCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineChoppinessMidCrossCrosses(
    series,
    channels.ci,
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

  const ok = series.length > length;

  return {
    series,
    length,
    threshold,
    ciValues: channels.ci,
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

export interface ComputeLineChoppinessMidCrossLayoutOptions {
  data: ChartLineChoppinessMidCrossPoint[];
  length?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineChoppinessMidCrossLayout(
  opts: ComputeLineChoppinessMidCrossLayoutOptions,
): ChartLineChoppinessMidCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_PANEL_GAP;
  const threshold = normalizeLineChoppinessMidCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_THRESHOLD,
  );

  const run = runLineChoppinessMidCross(opts.data, {
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

  // CI is bounded to [0, 100] by construction, so the osc panel
  // uses a fixed range with the threshold (default 50) sitting
  // exactly at the midline.
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
      ciPath: '',
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
  const priceDots: ChartLineChoppinessMidCrossDot[] = [];
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

  let ciPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.ci == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.ci);
    ciPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  ciPath = ciPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.ciValues[c.index] ?? threshold);
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
    ciPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineChoppinessMidCrossChart(
  data: ChartLineChoppinessMidCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineChoppinessMidCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineChoppinessMidCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_LENGTH,
  );
  const threshold = normalizeLineChoppinessMidCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_THRESHOLD,
  );
  return (
    `Choppiness Mid Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, threshold ${threshold}). Top panel ` +
    `renders the close with bullish (CI crosses below the ` +
    `midline, trending start) / bearish (CI crosses above the ` +
    `midline, ranging start) chevron overlays at every ` +
    `Choppiness Index midline crossover; bottom panel renders ` +
    `the close-only CI line on a fixed 0 to 100 oscillator with ` +
    `the midline ${threshold} reference band and marks CI level ` +
    `${threshold} trending versus ranging regime baseline ` +
    `transition events.`
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

export const ChartLineChoppinessMidCross = forwardRef<
  HTMLDivElement,
  ChartLineChoppinessMidCrossProps
>(function ChartLineChoppinessMidCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_LENGTH,
    threshold = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_PRICE_COLOR,
    ciColor = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_CI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCi = true,
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
    () => getLineChoppinessMidCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineChoppinessMidCrossLayout({
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
    ChartLineChoppinessMidCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineChoppinessMidCrossSeriesId,
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
    seriesId: ChartLineChoppinessMidCrossSeriesId,
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
        data-section="chart-line-choppiness-mid-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineChoppinessMidCrossChart(cleaned, { length, threshold });

  const showPrice = !hidden.has('price');
  const showCiLine = !hidden.has('ci') && showCi;

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
      aria-label={ariaLabel ?? 'Choppiness Mid Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-choppiness-mid-cross"
      data-length={length}
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
        data-section="chart-line-choppiness-mid-cross-title"
      >
        {ariaLabel ?? 'Choppiness Mid Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-choppiness-mid-cross-aria-desc"
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
        data-section="chart-line-choppiness-mid-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-choppiness-mid-cross-grid">
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
                  data-section="chart-line-choppiness-mid-cross-grid-line-price"
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
                  data-section="chart-line-choppiness-mid-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-choppiness-mid-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-choppiness-mid-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-choppiness-mid-cross-axes">
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
                  data-section="chart-line-choppiness-mid-cross-tick-price"
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
                  data-section="chart-line-choppiness-mid-cross-tick-osc"
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
            data-section="chart-line-choppiness-mid-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-choppiness-mid-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-choppiness-mid-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showCiLine ? (
          <path
            d={layout.ciPath}
            stroke={ciColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-choppiness-mid-cross-ci-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-choppiness-mid-cross-crosses"
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
                data-section={`chart-line-choppiness-mid-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-choppiness-mid-cross-overlay-crosses"
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
                data-section={`chart-line-choppiness-mid-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-choppiness-mid-cross-hover-targets">
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
                data-section="chart-line-choppiness-mid-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-choppiness-mid-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={244}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-choppiness-mid-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-choppiness-mid-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-choppiness-mid-cross-tooltip-ci"
                >
                  CI{' '}
                  {tooltipSample.ci == null
                    ? '--'
                    : formatOsc(tooltipSample.ci)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-choppiness-mid-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-choppiness-mid-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-choppiness-mid-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-choppiness-mid-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-choppiness-mid-cross-tooltip-params"
                >
                  length {layout.run.length} | threshold{' '}
                  {layout.run.threshold}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-choppiness-mid-cross-badge"
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
          data-section="chart-line-choppiness-mid-cross-legend"
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
              { id: 'ci' as const, color: ciColor, label: 'CI' },
            ] satisfies Array<{
              id: ChartLineChoppinessMidCrossSeriesId;
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

ChartLineChoppinessMidCross.displayName = 'ChartLineChoppinessMidCross';
