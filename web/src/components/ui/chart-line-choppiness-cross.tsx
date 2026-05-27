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
 * ChartLineChoppinessCross -- pure-SVG dual-panel chart with
 * the close in the top panel and a close-only Choppiness Index
 * line in the bottom panel, marking bullish (CI crosses below
 * 38.2, trending start) / bearish (CI crosses above 61.8,
 * ranging start) threshold cross trigger events. Separates
 * trending vs ranging market regime transitions from the base
 * Choppiness Index line readings.
 *
 *   TR[i]     = i == 0 ? 0 : |close[i] - close[i-1]|
 *   sumTR[i]  = sum(TR, n) over the last n bars
 *   range[i]  = max(close, n) - min(close, n) over last n bars
 *   ci[i]     = range > 0
 *               ? 100 * log10(sumTR / range) / log10(n)
 *               : 50  (neutral fallback when range collapses)
 *   bullish  : prev >= 38.2 && cur < 38.2  (trending start)
 *   bearish  : prev <= 61.8 && cur > 61.8  (ranging start)
 *
 * Defaults: `length = 14` (canonical Choppiness Index window),
 * `trendThreshold = 38.2`, `chopThreshold = 61.8` (the
 * Fibonacci levels from the canonical study). Regime classifier
 * `bullish` (CI < 38.2, trending), `bearish` (CI > 61.8,
 * ranging), `neutral` (between), `none` (null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: TR = 0 every bar -> sumTR = 0, range =
 *   max - min = 0 -> formula degenerates to 0/0, so the
 *   primitive applies the explicit neutral fallback `ci = 50`
 *   on every settled bar. 38.2 < 50 < 61.8 -> regime is
 *   `neutral`, cross count = 0. Verified across K = 0..1234.
 */

export interface ChartLineChoppinessCrossPoint {
  x: number;
  close: number;
}

export type ChartLineChoppinessCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineChoppinessCrossSeriesId = 'price' | 'ci';

export type ChartLineChoppinessCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineChoppinessCrossCross {
  index: number;
  x: number;
  kind: ChartLineChoppinessCrossCrossKind;
}

export interface ChartLineChoppinessCrossSample {
  index: number;
  x: number;
  close: number;
  ci: number | null;
  regime: ChartLineChoppinessCrossRegime;
}

export interface ChartLineChoppinessCrossRun {
  series: ChartLineChoppinessCrossPoint[];
  length: number;
  trendThreshold: number;
  chopThreshold: number;
  ciValues: Array<number | null>;
  samples: ChartLineChoppinessCrossSample[];
  crosses: ChartLineChoppinessCrossCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineChoppinessCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineChoppinessCrossLayout {
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
  priceDots: ChartLineChoppinessCrossDot[];
  ciPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  midY: number;
  trendY: number;
  chopY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineChoppinessCrossCrossKind;
  }>;
  run: ChartLineChoppinessCrossRun;
}

export interface ChartLineChoppinessCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineChoppinessCrossPoint[];
  length?: number;
  trendThreshold?: number;
  chopThreshold?: number;
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
  hiddenSeries?: ChartLineChoppinessCrossSeriesId[];
  defaultHiddenSeries?: ChartLineChoppinessCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineChoppinessCrossSeriesId;
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

export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_TREND_THRESHOLD = 38.2;
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_CHOP_THRESHOLD = 61.8;
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_CI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CHOPPINESS_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineChoppinessCrossFinitePoints(
  data: readonly ChartLineChoppinessCrossPoint[] | null | undefined,
): ChartLineChoppinessCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineChoppinessCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineChoppinessCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a finite threshold in [0, 100]. */
export function normalizeLineChoppinessCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 0 && value <= 100) return value;
  return fallback;
}

export function computeLineChoppinessCross(
  series: readonly ChartLineChoppinessCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): { ci: Array<number | null> } {
  const cleaned = getLineChoppinessCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { ci: [] };
  }
  const length = normalizeLineChoppinessCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CHOPPINESS_CROSS_LENGTH,
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

export function classifyLineChoppinessCrossRegime(
  ci: number | null,
  trendThreshold: number,
  chopThreshold: number,
): ChartLineChoppinessCrossRegime {
  if (ci == null) return 'none';
  if (ci < trendThreshold) return 'bullish';
  if (ci > chopThreshold) return 'bearish';
  return 'neutral';
}

export function detectLineChoppinessCrossCrosses(
  series: readonly ChartLineChoppinessCrossPoint[],
  ci: readonly (number | null)[],
  trendThreshold: number,
  chopThreshold: number,
): ChartLineChoppinessCrossCross[] {
  const out: ChartLineChoppinessCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = ci[i - 1];
    const cur = ci[i];
    if (prev == null || cur == null) continue;
    if (prev >= trendThreshold && cur < trendThreshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev <= chopThreshold && cur > chopThreshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineChoppinessCross(
  data: ChartLineChoppinessCrossPoint[],
  options: {
    length?: number;
    trendThreshold?: number;
    chopThreshold?: number;
  } = {},
): ChartLineChoppinessCrossRun {
  const cleaned = getLineChoppinessCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineChoppinessCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CHOPPINESS_CROSS_LENGTH,
  );
  const trendThreshold = normalizeLineChoppinessCrossThreshold(
    options.trendThreshold,
    DEFAULT_CHART_LINE_CHOPPINESS_CROSS_TREND_THRESHOLD,
  );
  const chopThreshold = normalizeLineChoppinessCrossThreshold(
    options.chopThreshold,
    DEFAULT_CHART_LINE_CHOPPINESS_CROSS_CHOP_THRESHOLD,
  );

  const channels = computeLineChoppinessCross(series, { length });

  const samples: ChartLineChoppinessCrossSample[] = series.map((p, i) => {
    const c = channels.ci[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      ci: c,
      regime: classifyLineChoppinessCrossRegime(
        c,
        trendThreshold,
        chopThreshold,
      ),
    };
  });

  const crosses = detectLineChoppinessCrossCrosses(
    series,
    channels.ci,
    trendThreshold,
    chopThreshold,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length;

  return {
    series,
    length,
    trendThreshold,
    chopThreshold,
    ciValues: channels.ci,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineChoppinessCrossLayoutOptions {
  data: ChartLineChoppinessCrossPoint[];
  length?: number;
  trendThreshold?: number;
  chopThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineChoppinessCrossLayout(
  opts: ComputeLineChoppinessCrossLayoutOptions,
): ChartLineChoppinessCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_CHOPPINESS_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_CHOPPINESS_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_CHOPPINESS_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_CHOPPINESS_CROSS_PANEL_GAP;
  const trendThreshold = normalizeLineChoppinessCrossThreshold(
    opts.trendThreshold,
    DEFAULT_CHART_LINE_CHOPPINESS_CROSS_TREND_THRESHOLD,
  );
  const chopThreshold = normalizeLineChoppinessCrossThreshold(
    opts.chopThreshold,
    DEFAULT_CHART_LINE_CHOPPINESS_CROSS_CHOP_THRESHOLD,
  );

  const run = runLineChoppinessCross(opts.data, {
    length: opts.length ?? undefined,
    trendThreshold,
    chopThreshold,
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
  const trendY = syOscBase(trendThreshold);
  const chopY = syOscBase(chopThreshold);

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
      midY,
      trendY,
      chopY,
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
  const priceDots: ChartLineChoppinessCrossDot[] = [];
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
  let ciFirst = true;
  for (const s of run.samples) {
    if (s.ci == null) {
      ciFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.ci);
    ciPath += `${ciFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    ciFirst = false;
  }
  ciPath = ciPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.ciValues[c.index] ?? 50);
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
    midY,
    trendY,
    chopY,
    crossMarkers,
    run,
  };
}

export function describeLineChoppinessCrossChart(
  data: ChartLineChoppinessCrossPoint[],
  options: {
    length?: number;
    trendThreshold?: number;
    chopThreshold?: number;
  } = {},
): string {
  const cleaned = getLineChoppinessCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineChoppinessCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CHOPPINESS_CROSS_LENGTH,
  );
  const trendThreshold = normalizeLineChoppinessCrossThreshold(
    options.trendThreshold,
    DEFAULT_CHART_LINE_CHOPPINESS_CROSS_TREND_THRESHOLD,
  );
  const chopThreshold = normalizeLineChoppinessCrossThreshold(
    options.chopThreshold,
    DEFAULT_CHART_LINE_CHOPPINESS_CROSS_CHOP_THRESHOLD,
  );
  return (
    `Choppiness Cross chart over ${cleaned.length} bars (length ` +
    `${length}, thresholds ${trendThreshold} / ${chopThreshold}` +
    `). Top panel renders the close with bullish (trending) / ` +
    `bearish (ranging) arrow overlays at every Choppiness ` +
    `Index threshold cross; bottom panel renders the close-only ` +
    `CI line on a fixed 0-100 oscillator and marks trending vs ` +
    `ranging market regime transitions.`
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

export const ChartLineChoppinessCross = forwardRef<
  HTMLDivElement,
  ChartLineChoppinessCrossProps
>(function ChartLineChoppinessCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_LENGTH,
    trendThreshold = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_TREND_THRESHOLD,
    chopThreshold = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_CHOP_THRESHOLD,
    width = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_PRICE_COLOR,
    ciColor = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_CI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_CHOPPINESS_CROSS_MID_COLOR,
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
    () => getLineChoppinessCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineChoppinessCrossLayout({
        data: cleaned,
        length,
        trendThreshold,
        chopThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      trendThreshold,
      chopThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineChoppinessCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineChoppinessCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineChoppinessCrossSeriesId,
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
        data-section="chart-line-choppiness-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineChoppinessCrossChart(cleaned, {
      length,
      trendThreshold,
      chopThreshold,
    });

  const showPrice = !hidden.has('price');
  const showCiLine = !hidden.has('ci') && showCi;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [0, trendThreshold, 50, chopThreshold, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Choppiness Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-choppiness-cross"
      data-length={length}
      data-trend-threshold={trendThreshold}
      data-chop-threshold={chopThreshold}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-neutral-count={layout.run.neutralCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-choppiness-cross-title"
      >
        {ariaLabel ?? 'Choppiness Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-choppiness-cross-aria-desc"
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
        data-section="chart-line-choppiness-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-choppiness-cross-grid">
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
                  data-section="chart-line-choppiness-cross-grid-line-price"
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
                  data-section="chart-line-choppiness-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-choppiness-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.chopY}
              x2={layout.innerRight}
              y2={layout.chopY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-choppiness-cross-band-chop"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.midY}
              x2={layout.innerRight}
              y2={layout.midY}
              stroke={midColor}
              strokeDasharray="2 4"
              data-section="chart-line-choppiness-cross-band-mid"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.trendY}
              x2={layout.innerRight}
              y2={layout.trendY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-choppiness-cross-band-trend"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-choppiness-cross-axes">
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
                  data-section="chart-line-choppiness-cross-tick-price"
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
                  data-section="chart-line-choppiness-cross-tick-osc"
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
            data-section="chart-line-choppiness-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-choppiness-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-choppiness-cross-price-dot"
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
            data-section="chart-line-choppiness-cross-ci-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-choppiness-cross-crosses"
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
                data-section={`chart-line-choppiness-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-choppiness-cross-overlay-crosses"
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
                data-section={`chart-line-choppiness-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-choppiness-cross-hover-targets">
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
                data-section="chart-line-choppiness-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-choppiness-cross-tooltip"
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
                  data-section="chart-line-choppiness-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-choppiness-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-choppiness-cross-tooltip-ci"
                >
                  ci{' '}
                  {tooltipSample.ci == null
                    ? '--'
                    : formatOsc(tooltipSample.ci)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-choppiness-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-choppiness-cross-tooltip-counts"
                >
                  trending {layout.run.bullishCount} | ranging{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-choppiness-cross-tooltip-counts2"
                >
                  neutral {layout.run.neutralCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-choppiness-cross-tooltip-crosses"
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
          data-section="chart-line-choppiness-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | trend {trendThreshold} | chop {chopThreshold}{' '}
          | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-choppiness-cross-legend"
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
              {
                id: 'ci' as const,
                color: ciColor,
                label: 'Choppiness',
              },
            ] satisfies Array<{
              id: ChartLineChoppinessCrossSeriesId;
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

ChartLineChoppinessCross.displayName = 'ChartLineChoppinessCross';
