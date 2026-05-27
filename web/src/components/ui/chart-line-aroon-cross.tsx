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
 * ChartLineAroonCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the Aroon Up / Aroon Down lines in
 * the bottom panel, marking bullish / bearish Aroon Up vs Down
 * crossover trigger events. The crossover panel separates trend
 * regime transition events from the base Aroon line readings.
 *
 *   barsSinceHigh[i] = bars since highest close in last (n+1)
 *   barsSinceLow[i]  = bars since lowest close in last (n+1)
 *   aroonUp[i]       = ((n - barsSinceHigh) / n) * 100
 *   aroonDown[i]     = ((n - barsSinceLow) / n) * 100
 *   bullish         : (up - down) crosses up   (prev <= 0, cur > 0)
 *   bearish         : (up - down) crosses down (prev >= 0, cur < 0)
 *
 * Tie break: the most recent bar wins, so a CONST series yields
 * barsSinceHigh = 0 and barsSinceLow = 0 on every settled bar.
 * Defaults `length = 14`. Regime classifier `bullish` (up >
 * down), `bearish` (up < down), `neutral` (up === down), `none`
 * (either null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: every close equals K, so the most
 *   recent bar is both the highest and the lowest. Therefore
 *   barsSinceHigh = barsSinceLow = 0, Aroon Up = Aroon Down =
 *   100, diff = 0, regime `neutral`, cross count = 0. Verified
 *   across K = 0..1234.
 */

export interface ChartLineAroonCrossPoint {
  x: number;
  close: number;
}

export type ChartLineAroonCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineAroonCrossSeriesId = 'price' | 'up' | 'down';

export type ChartLineAroonCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineAroonCrossCross {
  index: number;
  x: number;
  kind: ChartLineAroonCrossCrossKind;
}

export interface ChartLineAroonCrossSample {
  index: number;
  x: number;
  close: number;
  aroonUp: number | null;
  aroonDown: number | null;
  regime: ChartLineAroonCrossRegime;
}

export interface ChartLineAroonCrossRun {
  series: ChartLineAroonCrossPoint[];
  length: number;
  upValues: Array<number | null>;
  downValues: Array<number | null>;
  samples: ChartLineAroonCrossSample[];
  crosses: ChartLineAroonCrossCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineAroonCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAroonCrossLayout {
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
  priceDots: ChartLineAroonCrossDot[];
  upPath: string;
  downPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  midY: number;
  topY: number;
  bottomY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineAroonCrossCrossKind;
  }>;
  run: ChartLineAroonCrossRun;
}

export interface ChartLineAroonCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAroonCrossPoint[];
  length?: number;
  upperBand?: number;
  lowerBand?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  upColor?: string;
  downColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showUp?: boolean;
  showDown?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAroonCrossSeriesId[];
  defaultHiddenSeries?: ChartLineAroonCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAroonCrossSeriesId;
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

export const DEFAULT_CHART_LINE_AROON_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_AROON_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_AROON_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_AROON_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_AROON_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_AROON_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_AROON_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_AROON_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_AROON_CROSS_UPPER_BAND = 70;
export const DEFAULT_CHART_LINE_AROON_CROSS_LOWER_BAND = 30;
export const DEFAULT_CHART_LINE_AROON_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_AROON_CROSS_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_AROON_CROSS_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_AROON_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_AROON_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_AROON_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_AROON_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_AROON_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineAroonCrossFinitePoints(
  data: readonly ChartLineAroonCrossPoint[] | null | undefined,
): ChartLineAroonCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAroonCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineAroonCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export interface LineAroonCrossChannels {
  up: Array<number | null>;
  down: Array<number | null>;
}

/**
 * Compute Aroon Up / Aroon Down channels on the close series.
 * For each settled bar (i >= n), scan the window [i-n, i] and
 * pick the most recent maximum (Aroon Up) and minimum (Aroon
 * Down). Tie-breaks always prefer the latest bar.
 */
export function computeLineAroonCross(
  series: readonly ChartLineAroonCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineAroonCrossChannels {
  const cleaned = getLineAroonCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { up: [], down: [] };
  }
  const length = normalizeLineAroonCrossLength(
    options.length,
    DEFAULT_CHART_LINE_AROON_CROSS_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const up: Array<number | null> = new Array(closes.length).fill(null);
  const down: Array<number | null> = new Array(closes.length).fill(null);

  for (let i = length; i < closes.length; i += 1) {
    let maxVal = -Infinity;
    let minVal = Infinity;
    let maxIdx = i;
    let minIdx = i;
    for (let j = i - length; j <= i; j += 1) {
      const v = closes[j]!;
      if (v >= maxVal) {
        maxVal = v;
        maxIdx = j;
      }
      if (v <= minVal) {
        minVal = v;
        minIdx = j;
      }
    }
    const barsSinceHigh = i - maxIdx;
    const barsSinceLow = i - minIdx;
    up[i] = posZero(((length - barsSinceHigh) / length) * 100);
    down[i] = posZero(((length - barsSinceLow) / length) * 100);
  }
  return { up, down };
}

export function classifyLineAroonCrossRegime(
  up: number | null,
  down: number | null,
): ChartLineAroonCrossRegime {
  if (up == null || down == null) return 'none';
  if (up > down) return 'bullish';
  if (up < down) return 'bearish';
  return 'neutral';
}

export function detectLineAroonCrossCrosses(
  series: readonly ChartLineAroonCrossPoint[],
  up: readonly (number | null)[],
  down: readonly (number | null)[],
): ChartLineAroonCrossCross[] {
  const out: ChartLineAroonCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prevUp = up[i - 1];
    const prevDown = down[i - 1];
    const curUp = up[i];
    const curDown = down[i];
    if (
      prevUp == null ||
      prevDown == null ||
      curUp == null ||
      curDown == null
    ) {
      continue;
    }
    const prevDiff = prevUp - prevDown;
    const curDiff = curUp - curDown;
    if (prevDiff <= 0 && curDiff > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prevDiff >= 0 && curDiff < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineAroonCross(
  data: ChartLineAroonCrossPoint[],
  options: { length?: number } = {},
): ChartLineAroonCrossRun {
  const cleaned = getLineAroonCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineAroonCrossLength(
    options.length,
    DEFAULT_CHART_LINE_AROON_CROSS_LENGTH,
  );

  const channels = computeLineAroonCross(series, { length });

  const samples: ChartLineAroonCrossSample[] = series.map((p, i) => {
    const u = channels.up[i] ?? null;
    const d = channels.down[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      aroonUp: u,
      aroonDown: d,
      regime: classifyLineAroonCrossRegime(u, d),
    };
  });

  const crosses = detectLineAroonCrossCrosses(
    series,
    channels.up,
    channels.down,
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

  const ok = series.length > length + 1;

  return {
    series,
    length,
    upValues: channels.up,
    downValues: channels.down,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineAroonCrossLayoutOptions {
  data: ChartLineAroonCrossPoint[];
  length?: number;
  upperBand?: number;
  lowerBand?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAroonCrossLayout(
  opts: ComputeLineAroonCrossLayoutOptions,
): ChartLineAroonCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_AROON_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_AROON_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_AROON_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_AROON_CROSS_PANEL_GAP;
  const upperBand =
    opts.upperBand ?? DEFAULT_CHART_LINE_AROON_CROSS_UPPER_BAND;
  const lowerBand =
    opts.lowerBand ?? DEFAULT_CHART_LINE_AROON_CROSS_LOWER_BAND;

  const run = runLineAroonCross(opts.data, {
    length: opts.length ?? undefined,
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
  const topY = syOscBase(upperBand);
  const bottomY = syOscBase(lowerBand);

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
      upPath: '',
      downPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      midY,
      topY,
      bottomY,
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
  const priceDots: ChartLineAroonCrossDot[] = [];
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

  let upPath = '';
  let upFirst = true;
  for (const s of run.samples) {
    if (s.aroonUp == null) {
      upFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.aroonUp);
    upPath += `${upFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    upFirst = false;
  }
  upPath = upPath.trim();

  let downPath = '';
  let downFirst = true;
  for (const s of run.samples) {
    if (s.aroonDown == null) {
      downFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.aroonDown);
    downPath += `${downFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    downFirst = false;
  }
  downPath = downPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.upValues[c.index] ?? 50);
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
    upPath,
    downPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    midY,
    topY,
    bottomY,
    crossMarkers,
    run,
  };
}

export function describeLineAroonCrossChart(
  data: ChartLineAroonCrossPoint[],
  options: { length?: number } = {},
): string {
  const cleaned = getLineAroonCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineAroonCrossLength(
    options.length,
    DEFAULT_CHART_LINE_AROON_CROSS_LENGTH,
  );
  return (
    `Aroon Cross chart over ${cleaned.length} bars (length ` +
    `${length}). Top panel renders the close with bullish / ` +
    `bearish arrow overlays at every Aroon Up vs Aroon Down ` +
    `cross; bottom panel renders Aroon Up alongside Aroon Down ` +
    `and marks trend regime transition events at the high or ` +
    `low extremes of the Aroon range.`
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

export const ChartLineAroonCross = forwardRef<
  HTMLDivElement,
  ChartLineAroonCrossProps
>(function ChartLineAroonCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_AROON_CROSS_LENGTH,
    upperBand = DEFAULT_CHART_LINE_AROON_CROSS_UPPER_BAND,
    lowerBand = DEFAULT_CHART_LINE_AROON_CROSS_LOWER_BAND,
    width = DEFAULT_CHART_LINE_AROON_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_AROON_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_AROON_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_AROON_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_AROON_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_AROON_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_AROON_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_AROON_CROSS_PRICE_COLOR,
    upColor = DEFAULT_CHART_LINE_AROON_CROSS_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_AROON_CROSS_DOWN_COLOR,
    bullishColor = DEFAULT_CHART_LINE_AROON_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_AROON_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_AROON_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_AROON_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_AROON_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showUp = true,
    showDown = true,
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
    () => getLineAroonCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAroonCrossLayout({
        data: cleaned,
        length,
        upperBand,
        lowerBand,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      upperBand,
      lowerBand,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineAroonCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineAroonCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineAroonCrossSeriesId,
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
        data-section="chart-line-aroon-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAroonCrossChart(cleaned, { length });

  const showPrice = !hidden.has('price');
  const showUpLine = !hidden.has('up') && showUp;
  const showDownLine = !hidden.has('down') && showDown;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [0, 30, 50, 70, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Aroon Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-aroon-cross"
      data-length={length}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-neutral-count={layout.run.neutralCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-aroon-cross-title"
      >
        {ariaLabel ?? 'Aroon Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-aroon-cross-aria-desc"
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
        data-section="chart-line-aroon-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-aroon-cross-grid">
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
                  data-section="chart-line-aroon-cross-grid-line-price"
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
                  data-section="chart-line-aroon-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-aroon-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.topY}
              x2={layout.innerRight}
              y2={layout.topY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-aroon-cross-band-top"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.midY}
              x2={layout.innerRight}
              y2={layout.midY}
              stroke={midColor}
              strokeDasharray="2 4"
              data-section="chart-line-aroon-cross-band-mid"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.bottomY}
              x2={layout.innerRight}
              y2={layout.bottomY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-aroon-cross-band-bottom"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-aroon-cross-axes">
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
                  data-section="chart-line-aroon-cross-tick-price"
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
                  data-section="chart-line-aroon-cross-tick-osc"
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
            data-section="chart-line-aroon-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-aroon-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-aroon-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showUpLine ? (
          <path
            d={layout.upPath}
            stroke={upColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-aroon-cross-up-path"
          />
        ) : null}

        {showDownLine ? (
          <path
            d={layout.downPath}
            stroke={downColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-aroon-cross-down-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-aroon-cross-crosses"
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
                data-section={`chart-line-aroon-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-aroon-cross-overlay-crosses"
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
                data-section={`chart-line-aroon-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-aroon-cross-hover-targets">
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
                data-section="chart-line-aroon-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-aroon-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={216}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-aroon-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-aroon-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-aroon-cross-tooltip-up"
                >
                  up{' '}
                  {tooltipSample.aroonUp == null
                    ? '--'
                    : formatOsc(tooltipSample.aroonUp)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-aroon-cross-tooltip-down"
                >
                  down{' '}
                  {tooltipSample.aroonDown == null
                    ? '--'
                    : formatOsc(tooltipSample.aroonDown)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-aroon-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-aroon-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-aroon-cross-tooltip-counts2"
                >
                  neutral {layout.run.neutralCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-aroon-cross-tooltip-crosses"
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
          data-section="chart-line-aroon-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | bands {upperBand}/{lowerBand} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-aroon-cross-legend"
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
              { id: 'up' as const, color: upColor, label: 'Aroon Up' },
              {
                id: 'down' as const,
                color: downColor,
                label: 'Aroon Down',
              },
            ] satisfies Array<{
              id: ChartLineAroonCrossSeriesId;
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

ChartLineAroonCross.displayName = 'ChartLineAroonCross';
