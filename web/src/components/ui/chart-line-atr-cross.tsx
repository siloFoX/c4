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
 * ChartLineAtrCross -- pure-SVG dual-panel chart with the close on
 * top and a short-vs-long ATR crossover oscillator on the bottom.
 * Detects volatility-regime flips:
 *
 *   trueRange[i] = max(h-l, |h - prevC|, |l - prevC|);  TR[0] = h - l
 *   shortAtr[i]  = Wilder(trueRange, shortLength)[i]
 *   longAtr[i]   = Wilder(trueRange, longLength)[i]
 *   expanding   = prev shortAtr <= prev longAtr  AND  curr shortAtr > curr longAtr
 *   contracting = prev shortAtr >= prev longAtr  AND  curr shortAtr < curr longAtr
 *
 * Wilder smoothing uses an SMA-seeded recursion `(prev * (n - 1) +
 * curr) / n` with the `min === max` seed precision fix so constant
 * inputs collapse to the exact value.
 *
 * Bit-exact anchors:
 * - **CONST h = l = close = K**: TR = 0 everywhere; both ATRs are 0;
 *   the relation never strictly flips so
 *   `expandingCount = contractingCount = 0`. Verified across
 *   `(K, short, long)` sweeps.
 * - **CONSTANT-SPREAD h = K + D, l = K, close = K + D / 2**: TR =
 *   `D` from `i = 0`. Both Wilder ATRs collapse to `D` exactly (min
 *   === max seed + CONST short-circuit). The relation stays equal
 *   so `expanding = contracting = 0` crosses. Verified across
 *   `(K, D, short, long)` sweeps.
 */

export interface ChartLineAtrCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAtrCrossRelation =
  | 'expanding'
  | 'contracting'
  | 'equal'
  | 'none';

export type ChartLineAtrCrossCross = 'up' | 'down' | null;

export type ChartLineAtrCrossSeriesId = 'price' | 'short' | 'long';

export interface ChartLineAtrCrossSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  trueRange: number | null;
  shortAtr: number | null;
  longAtr: number | null;
  relation: ChartLineAtrCrossRelation;
  crossed: ChartLineAtrCrossCross;
}

export interface ChartLineAtrCrossRun {
  series: ChartLineAtrCrossPoint[];
  shortLength: number;
  longLength: number;
  trueRangeValues: Array<number | null>;
  shortAtrValues: Array<number | null>;
  longAtrValues: Array<number | null>;
  samples: ChartLineAtrCrossSample[];
  expandingCrossCount: number;
  contractingCrossCount: number;
  expandingCount: number;
  contractingCount: number;
  equalCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineAtrCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  shortAtr: number;
  kind: 'up' | 'down';
}

export interface ChartLineAtrCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAtrCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  atrTop: number;
  atrBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineAtrCrossDot[];
  shortPath: string;
  longPath: string;
  markers: ChartLineAtrCrossMarker[];
  priceMin: number;
  priceMax: number;
  atrMin: number;
  atrMax: number;
  run: ChartLineAtrCrossRun;
}

export interface ChartLineAtrCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAtrCrossPoint[];
  shortLength?: number;
  longLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  shortColor?: string;
  longColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showShort?: boolean;
  showLong?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAtrCrossSeriesId[];
  defaultHiddenSeries?: ChartLineAtrCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAtrCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineAtrCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatAtr?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ATR_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ATR_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ATR_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_ATR_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ATR_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ATR_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ATR_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ATR_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_ATR_CROSS_SHORT_LENGTH = 7;
export const DEFAULT_CHART_LINE_ATR_CROSS_LONG_LENGTH = 21;
export const DEFAULT_CHART_LINE_ATR_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ATR_CROSS_SHORT_COLOR = '#fbbf24';
export const DEFAULT_CHART_LINE_ATR_CROSS_LONG_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ATR_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ATR_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ATR_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ATR_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite OHLC fields. */
export function getLineAtrCrossFinitePoints(
  data: readonly ChartLineAtrCrossPoint[] | null | undefined,
): ChartLineAtrCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAtrCrossPoint[] = [];
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
export function normalizeLineAtrCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** TR[i] = max(h-l, |h-prevC|, |l-prevC|); TR[0] = h-l. */
export function applyLineAtrCrossTrueRange(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
): Array<number | null> {
  const n = Math.min(highs.length, lows.length, closes.length);
  const out: Array<number | null> = [];
  for (let i = 0; i < n; i += 1) {
    const h = highs[i];
    const l = lows[i];
    if (!isFiniteNumber(h) || !isFiniteNumber(l)) {
      out.push(null);
      continue;
    }
    if (i === 0) {
      out.push(posZero(h - l));
      continue;
    }
    const prevC = closes[i - 1];
    if (!isFiniteNumber(prevC)) {
      out.push(posZero(h - l));
      continue;
    }
    const range = h - l;
    const gapUp = Math.abs(h - prevC);
    const gapDown = Math.abs(l - prevC);
    let tr = range;
    if (gapUp > tr) tr = gapUp;
    if (gapDown > tr) tr = gapDown;
    out.push(posZero(tr));
  }
  return out;
}

/**
 * Wilder smoothing with SMA seed + `min === max` precision fix.
 * `next = v === prev ? v : (prev * (n - 1) + v) / n` keeps constants
 * exact.
 */
export function applyLineAtrCrossWilder(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  let smoothed: number | null = null;
  let sum = 0;
  let count = 0;
  let seedMin = Infinity;
  let seedMax = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      smoothed = null;
      sum = 0;
      count = 0;
      seedMin = Infinity;
      seedMax = -Infinity;
      continue;
    }
    if (smoothed == null) {
      sum += v;
      count += 1;
      if (v < seedMin) seedMin = v;
      if (v > seedMax) seedMax = v;
      if (count >= length) {
        smoothed = seedMin === seedMax ? seedMin : sum / length;
        out[i] = posZero(smoothed);
      }
    } else {
      const next =
        v === smoothed
          ? v
          : (smoothed * (length - 1) + v) / length;
      smoothed = next;
      out[i] = posZero(next);
    }
  }
  return out;
}

export interface LineAtrCrossChannels {
  trueRange: Array<number | null>;
  shortAtr: Array<number | null>;
  longAtr: Array<number | null>;
}

export function computeLineAtrCross(
  series: readonly ChartLineAtrCrossPoint[] | null | undefined,
  options: { shortLength?: number; longLength?: number } = {},
): LineAtrCrossChannels {
  const cleaned = getLineAtrCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { trueRange: [], shortAtr: [], longAtr: [] };
  }
  const shortLength = normalizeLineAtrCrossLength(
    options.shortLength,
    DEFAULT_CHART_LINE_ATR_CROSS_SHORT_LENGTH,
  );
  const longLength = normalizeLineAtrCrossLength(
    options.longLength,
    DEFAULT_CHART_LINE_ATR_CROSS_LONG_LENGTH,
  );
  const trueRange = applyLineAtrCrossTrueRange(
    cleaned.map((p) => p.high),
    cleaned.map((p) => p.low),
    cleaned.map((p) => p.close),
  );
  return {
    trueRange,
    shortAtr: applyLineAtrCrossWilder(trueRange, shortLength),
    longAtr: applyLineAtrCrossWilder(trueRange, longLength),
  };
}

export function classifyLineAtrCrossRelation(
  shortAtr: number | null,
  longAtr: number | null,
): ChartLineAtrCrossRelation {
  if (shortAtr == null || longAtr == null) return 'none';
  if (shortAtr > longAtr) return 'expanding';
  if (shortAtr < longAtr) return 'contracting';
  return 'equal';
}

export function detectLineAtrCrossCrosses(
  shorts: readonly (number | null)[],
  longs: readonly (number | null)[],
): ChartLineAtrCrossCross[] {
  const out: ChartLineAtrCrossCross[] = [];
  let prevShort: number | null = null;
  let prevLong: number | null = null;
  for (let i = 0; i < shorts.length; i += 1) {
    const s = shorts[i];
    const l = longs[i];
    if (s == null || l == null) {
      out.push(null);
      prevShort = null;
      prevLong = null;
      continue;
    }
    if (prevShort == null || prevLong == null) {
      out.push(null);
      prevShort = s;
      prevLong = l;
      continue;
    }
    if (prevShort <= prevLong && s > l) {
      out.push('up');
    } else if (prevShort >= prevLong && s < l) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevShort = s;
    prevLong = l;
  }
  return out;
}

export function runLineAtrCross(
  data: ChartLineAtrCrossPoint[],
  options: { shortLength?: number; longLength?: number } = {},
): ChartLineAtrCrossRun {
  const cleaned = getLineAtrCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const shortLength = normalizeLineAtrCrossLength(
    options.shortLength,
    DEFAULT_CHART_LINE_ATR_CROSS_SHORT_LENGTH,
  );
  const longLength = normalizeLineAtrCrossLength(
    options.longLength,
    DEFAULT_CHART_LINE_ATR_CROSS_LONG_LENGTH,
  );

  const channels = computeLineAtrCross(series, { shortLength, longLength });
  const crosses = detectLineAtrCrossCrosses(
    channels.shortAtr,
    channels.longAtr,
  );

  const samples: ChartLineAtrCrossSample[] = series.map((p, i) => {
    const trueRange = channels.trueRange[i] ?? null;
    const shortAtr = channels.shortAtr[i] ?? null;
    const longAtr = channels.longAtr[i] ?? null;
    const relation = classifyLineAtrCrossRelation(shortAtr, longAtr);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      trueRange,
      shortAtr,
      longAtr,
      relation,
      crossed,
    };
  });

  let expandingCrossCount = 0;
  let contractingCrossCount = 0;
  let expandingCount = 0;
  let contractingCount = 0;
  let equalCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') expandingCrossCount += 1;
    else if (s.crossed === 'down') contractingCrossCount += 1;
    if (s.relation === 'expanding') expandingCount += 1;
    else if (s.relation === 'contracting') contractingCount += 1;
    else if (s.relation === 'equal') equalCount += 1;
    else noneCount += 1;
  }

  const ok = series.length >= Math.max(shortLength, longLength);

  return {
    series = [],
    shortLength,
    longLength,
    trueRangeValues: channels.trueRange,
    shortAtrValues: channels.shortAtr,
    longAtrValues: channels.longAtr,
    samples,
    expandingCrossCount,
    contractingCrossCount,
    expandingCount,
    contractingCount,
    equalCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineAtrCrossLayoutOptions {
  data: ChartLineAtrCrossPoint[];
  shortLength?: number;
  longLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAtrCrossLayout(
  opts: ComputeLineAtrCrossLayoutOptions,
): ChartLineAtrCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ATR_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ATR_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_ATR_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_ATR_CROSS_PANEL_GAP;

  const run = runLineAtrCross(opts.data, {
    shortLength: opts.shortLength ?? undefined,
    longLength: opts.longLength ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const atrTop = priceBottom + panelGap;
  const atrBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      atrTop,
      atrBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      shortPath: '',
      longPath: '',
      markers: [],
      priceMin: 0,
      priceMax: 0,
      atrMin: 0,
      atrMax: 1,
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

  let atrMin = 0;
  let atrMax = -Infinity;
  for (const s of run.samples) {
    if (s.shortAtr != null && s.shortAtr > atrMax) atrMax = s.shortAtr;
    if (s.longAtr != null && s.longAtr > atrMax) atrMax = s.longAtr;
  }
  if (!Number.isFinite(atrMax)) atrMax = 1;
  if (atrMin === atrMax) atrMax += 1;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syAtr = (y: number): number =>
    atrBottom - ((y - atrMin) / (atrMax - atrMin)) * (atrBottom - atrTop);

  let pricePath = '';
  const priceDots: ChartLineAtrCrossDot[] = [];
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

  const buildPath = (key: 'shortAtr' | 'longAtr'): string => {
    let p = '';
    let first = true;
    for (const s of run.samples) {
      const v = s[key];
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = syAtr(v);
      p += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return p.trim();
  };

  const shortPath = buildPath('shortAtr');
  const longPath = buildPath('longAtr');

  const markers: ChartLineAtrCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.shortAtr == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syAtr(s.shortAtr),
      shortAtr: s.shortAtr,
      kind: s.crossed,
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
    atrTop,
    atrBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    shortPath,
    longPath,
    markers,
    priceMin,
    priceMax,
    atrMin,
    atrMax,
    run,
  };
}

export function describeLineAtrCrossChart(
  data: ChartLineAtrCrossPoint[],
  options: { shortLength?: number; longLength?: number } = {},
): string {
  const cleaned = getLineAtrCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const shortLength = normalizeLineAtrCrossLength(
    options.shortLength,
    DEFAULT_CHART_LINE_ATR_CROSS_SHORT_LENGTH,
  );
  const longLength = normalizeLineAtrCrossLength(
    options.longLength,
    DEFAULT_CHART_LINE_ATR_CROSS_LONG_LENGTH,
  );
  return (
    `ATR Cross chart over ${cleaned.length} bars ` +
    `(shortLength ${shortLength}, longLength ${longLength}). Top ` +
    `panel renders the close; bottom panel renders the short and ` +
    `long Wilder ATRs with markers at every expanding (short > long) ` +
    `or contracting (short < long) volatility-regime cross.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultAtrFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineAtrCross = forwardRef<
  HTMLDivElement,
  ChartLineAtrCrossProps
>(function ChartLineAtrCross(props, ref): ReactNode {
  const {
    data,
    shortLength = DEFAULT_CHART_LINE_ATR_CROSS_SHORT_LENGTH,
    longLength = DEFAULT_CHART_LINE_ATR_CROSS_LONG_LENGTH,
    width = DEFAULT_CHART_LINE_ATR_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_ATR_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ATR_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_ATR_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ATR_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ATR_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ATR_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_ATR_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ATR_CROSS_PRICE_COLOR,
    shortColor = DEFAULT_CHART_LINE_ATR_CROSS_SHORT_COLOR,
    longColor = DEFAULT_CHART_LINE_ATR_CROSS_LONG_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ATR_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ATR_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ATR_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ATR_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showShort = true,
    showLong = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onCrossClick,
    formatPrice = defaultPriceFormatter,
    formatAtr = defaultAtrFormatter,
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
    () => getLineAtrCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAtrCrossLayout({
        data: cleaned,
        shortLength,
        longLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, shortLength, longLength, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineAtrCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineAtrCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineAtrCrossSeriesId,
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
        data-section="chart-line-atr-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAtrCrossChart(cleaned, { shortLength, longLength });

  const showPrice = !hidden.has('price');
  const showShortLine = !hidden.has('short') && showShort;
  const showLongLine = !hidden.has('long') && showLong;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickAtrValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickAtrValues.push(
      layout.atrMin + ((layout.atrMax - layout.atrMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'ATR Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-atr-cross"
      data-short-length={shortLength}
      data-long-length={longLength}
      data-total-points={cleaned.length}
      data-expanding-cross-count={layout.run.expandingCrossCount}
      data-contracting-cross-count={layout.run.contractingCrossCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-atr-cross-title"
      >
        {ariaLabel ?? 'ATR Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-atr-cross-aria-desc"
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
        data-section="chart-line-atr-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-atr-cross-grid">
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
                  data-section="chart-line-atr-cross-grid-line-price"
                />
              );
            })}
            {tickAtrValues.map((v, i) => {
              const y =
                layout.atrBottom -
                ((v - layout.atrMin) /
                  (layout.atrMax - layout.atrMin)) *
                  (layout.atrBottom - layout.atrTop);
              return (
                <line
                  key={`grid-atr-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-atr-cross-grid-line-atr"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-atr-cross-axes">
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
              y1={layout.atrTop}
              x2={layout.innerLeft}
              y2={layout.atrBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.atrBottom}
              x2={layout.innerRight}
              y2={layout.atrBottom}
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
                  data-section="chart-line-atr-cross-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickAtrValues.map((v, i) => {
              const y =
                layout.atrBottom -
                ((v - layout.atrMin) /
                  (layout.atrMax - layout.atrMin)) *
                  (layout.atrBottom - layout.atrTop);
              return (
                <text
                  key={`tick-atr-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-atr-cross-tick-atr"
                >
                  {formatAtr(v)}
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
            data-section="chart-line-atr-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-atr-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-atr-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showLongLine ? (
          <path
            d={layout.longPath}
            stroke={longColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-atr-cross-long"
          />
        ) : null}

        {showShortLine ? (
          <path
            d={layout.shortPath}
            stroke={shortColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-atr-cross-short"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-atr-cross-markers">
            {layout.markers.map((m) => (
              <circle
                key={`marker-${m.index}-${m.kind}`}
                cx={m.cx}
                cy={m.cy}
                r={markerRadius}
                fill={m.kind === 'up' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onCrossClick?.({ point: sample });
                }}
                data-section="chart-line-atr-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-atr-cross-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.atrBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-atr-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-atr-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={190}
                  height={136}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-cross-tooltip-tr"
                >
                  tr{' '}
                  {tooltipSample.trueRange == null
                    ? '--'
                    : formatAtr(tooltipSample.trueRange)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-cross-tooltip-short"
                >
                  short{' '}
                  {tooltipSample.shortAtr == null
                    ? '--'
                    : formatAtr(tooltipSample.shortAtr)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-cross-tooltip-long"
                >
                  long{' '}
                  {tooltipSample.longAtr == null
                    ? '--'
                    : formatAtr(tooltipSample.longAtr)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-cross-tooltip-counts"
                >
                  expand {layout.run.expandingCrossCount} | contract{' '}
                  {layout.run.contractingCrossCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-atr-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          short {shortLength} | long {longLength} | expand{' '}
          {layout.run.expandingCrossCount} | contract{' '}
          {layout.run.contractingCrossCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-atr-cross-legend"
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
              { id: 'short' as const, color: shortColor, label: 'short atr' },
              { id: 'long' as const, color: longColor, label: 'long atr' },
            ] satisfies Array<{
              id: ChartLineAtrCrossSeriesId;
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

ChartLineAtrCross.displayName = 'ChartLineAtrCross';
