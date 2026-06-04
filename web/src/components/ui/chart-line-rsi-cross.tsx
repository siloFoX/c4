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
 * ChartLineRsiCross -- pure-SVG dual-panel chart with the close on
 * top and a short-vs-long Wilder RSI crossover oscillator on the
 * bottom. Detects momentum-regime flips:
 *
 *   gain[i] = max(0, close[i] - close[i - 1])
 *   loss[i] = max(0, close[i - 1] - close[i])
 *   avgGain = Wilder(gain, n);  avgLoss = Wilder(loss, n)
 *   RSI(n)  = avgLoss === 0 && avgGain === 0 ? 50
 *           : avgLoss === 0 ? 100
 *           : 100 - 100 / (1 + avgGain / avgLoss)
 *
 * `shortRsi` is RSI at `shortLength`, `longRsi` is RSI at
 * `longLength`. Cross events flag the bar where the inequality
 * newly flips (`up` for short > long, `down` for short < long).
 *
 * Bit-exact anchors:
 * - **CONST close = K**: every gain and loss is 0 -> RSI = 50 for
 *   both periods (avgGain = avgLoss = 0 -> neutral fallback).
 *   Relation stays equal so zero crosses.
 * - **LINEAR UP close = i + 1**: every change is +1, gain = 1
 *   constant, loss = 0. Wilder of constant 1 = 1 (min === max
 *   seed + CONST short-circuit). avgLoss = 0 -> RSI = 100 for both
 *   periods. Zero crosses.
 * - **LINEAR DOWN close = N - i**: gain = 0, loss = 1 -> RSI = 0
 *   for both periods. Zero crosses.
 */

export interface ChartLineRsiCrossPoint {
  x: number;
  close: number;
}

export type ChartLineRsiCrossRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLineRsiCrossCross = 'up' | 'down' | null;

export type ChartLineRsiCrossSeriesId = 'price' | 'short' | 'long';

export interface ChartLineRsiCrossSample {
  index: number;
  x: number;
  close: number;
  shortRsi: number | null;
  longRsi: number | null;
  relation: ChartLineRsiCrossRelation;
  crossed: ChartLineRsiCrossCross;
}

export interface ChartLineRsiCrossRun {
  series: ChartLineRsiCrossPoint[];
  shortLength: number;
  longLength: number;
  shortRsiValues: Array<number | null>;
  longRsiValues: Array<number | null>;
  samples: ChartLineRsiCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  bullishCount: number;
  bearishCount: number;
  equalCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineRsiCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  shortRsi: number;
  kind: 'up' | 'down';
}

export interface ChartLineRsiCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineRsiCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  rsiTop: number;
  rsiBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineRsiCrossDot[];
  shortPath: string;
  longPath: string;
  markers: ChartLineRsiCrossMarker[];
  priceMin: number;
  priceMax: number;
  rsiMin: number;
  rsiMax: number;
  midlineY: number;
  run: ChartLineRsiCrossRun;
}

export interface ChartLineRsiCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRsiCrossPoint[];
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
  midlineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showShort?: boolean;
  showLong?: boolean;
  showMarkers?: boolean;
  showMidline?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRsiCrossSeriesId[];
  defaultHiddenSeries?: ChartLineRsiCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRsiCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineRsiCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatRsi?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_RSI_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_RSI_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_RSI_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_RSI_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_RSI_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RSI_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RSI_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RSI_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_RSI_CROSS_SHORT_LENGTH = 7;
export const DEFAULT_CHART_LINE_RSI_CROSS_LONG_LENGTH = 21;
export const DEFAULT_CHART_LINE_RSI_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_RSI_CROSS_SHORT_COLOR = '#fb7185';
export const DEFAULT_CHART_LINE_RSI_CROSS_LONG_COLOR = '#1d4ed8';
export const DEFAULT_CHART_LINE_RSI_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RSI_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RSI_CROSS_MIDLINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_RSI_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RSI_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x and close. */
export function getLineRsiCrossFinitePoints(
  data: readonly ChartLineRsiCrossPoint[] | null | undefined,
): ChartLineRsiCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRsiCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineRsiCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Per-bar (gain, loss) where gain = max(0, dC) and loss = max(0, -dC). */
export function applyLineRsiCrossGainLoss(
  closes: readonly number[],
): { gain: Array<number | null>; loss: Array<number | null> } {
  const gain: Array<number | null> = [];
  const loss: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i === 0) {
      gain.push(null);
      loss.push(null);
      continue;
    }
    const d = closes[i]! - closes[i - 1]!;
    if (!isFiniteNumber(d)) {
      gain.push(null);
      loss.push(null);
      continue;
    }
    gain.push(d > 0 ? posZero(d) : 0);
    loss.push(d < 0 ? posZero(-d) : 0);
  }
  return { gain, loss };
}

/**
 * Wilder smoothing with SMA seed + `min === max` precision fix.
 * `next = v === smoothed ? v : (smoothed * (n - 1) + v) / n` keeps
 * constants exact.
 */
export function applyLineRsiCrossWilder(
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

/** Build the RSI series from already-smoothed average gain/loss. */
export function applyLineRsiCrossFromAvg(
  avgGain: readonly (number | null)[],
  avgLoss: readonly (number | null)[],
): Array<number | null> {
  const n = Math.min(avgGain.length, avgLoss.length);
  const out: Array<number | null> = [];
  for (let i = 0; i < n; i += 1) {
    const g = avgGain[i];
    const l = avgLoss[i];
    if (g == null || l == null) {
      out.push(null);
      continue;
    }
    if (g === 0 && l === 0) {
      out.push(50);
      continue;
    }
    if (l === 0) {
      out.push(100);
      continue;
    }
    if (g === 0) {
      out.push(0);
      continue;
    }
    const rs = g / l;
    const rsi = 100 - 100 / (1 + rs);
    out.push(Number.isFinite(rsi) ? posZero(rsi) : null);
  }
  return out;
}

export interface LineRsiCrossChannels {
  shortRsi: Array<number | null>;
  longRsi: Array<number | null>;
}

export function computeLineRsiCross(
  series: readonly ChartLineRsiCrossPoint[] | null | undefined,
  options: { shortLength?: number; longLength?: number } = {},
): LineRsiCrossChannels {
  const cleaned = getLineRsiCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { shortRsi: [], longRsi: [] };
  }
  const shortLength = normalizeLineRsiCrossLength(
    options.shortLength,
    DEFAULT_CHART_LINE_RSI_CROSS_SHORT_LENGTH,
  );
  const longLength = normalizeLineRsiCrossLength(
    options.longLength,
    DEFAULT_CHART_LINE_RSI_CROSS_LONG_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const { gain, loss } = applyLineRsiCrossGainLoss(closes);
  const shortRsi = applyLineRsiCrossFromAvg(
    applyLineRsiCrossWilder(gain, shortLength),
    applyLineRsiCrossWilder(loss, shortLength),
  );
  const longRsi = applyLineRsiCrossFromAvg(
    applyLineRsiCrossWilder(gain, longLength),
    applyLineRsiCrossWilder(loss, longLength),
  );
  return { shortRsi, longRsi };
}

export function classifyLineRsiCrossRelation(
  shortRsi: number | null,
  longRsi: number | null,
): ChartLineRsiCrossRelation {
  if (shortRsi == null || longRsi == null) return 'none';
  if (shortRsi > longRsi) return 'bullish';
  if (shortRsi < longRsi) return 'bearish';
  return 'equal';
}

export function detectLineRsiCrossCrosses(
  shorts: readonly (number | null)[],
  longs: readonly (number | null)[],
): ChartLineRsiCrossCross[] {
  const out: ChartLineRsiCrossCross[] = [];
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

export function runLineRsiCross(
  data: ChartLineRsiCrossPoint[],
  options: { shortLength?: number; longLength?: number } = {},
): ChartLineRsiCrossRun {
  const cleaned = getLineRsiCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const shortLength = normalizeLineRsiCrossLength(
    options.shortLength,
    DEFAULT_CHART_LINE_RSI_CROSS_SHORT_LENGTH,
  );
  const longLength = normalizeLineRsiCrossLength(
    options.longLength,
    DEFAULT_CHART_LINE_RSI_CROSS_LONG_LENGTH,
  );

  const channels = computeLineRsiCross(series, { shortLength, longLength });
  const crosses = detectLineRsiCrossCrosses(
    channels.shortRsi,
    channels.longRsi,
  );

  const samples: ChartLineRsiCrossSample[] = series.map((p, i) => {
    const shortRsi = channels.shortRsi[i] ?? null;
    const longRsi = channels.longRsi[i] ?? null;
    const relation = classifyLineRsiCrossRelation(shortRsi, longRsi);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      shortRsi,
      longRsi,
      relation,
      crossed,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let equalCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.relation === 'bullish') bullishCount += 1;
    else if (s.relation === 'bearish') bearishCount += 1;
    else if (s.relation === 'equal') equalCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > Math.max(shortLength, longLength);

  return {
    series,
    shortLength,
    longLength,
    shortRsiValues: channels.shortRsi,
    longRsiValues: channels.longRsi,
    samples,
    upCrossCount,
    downCrossCount,
    bullishCount,
    bearishCount,
    equalCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineRsiCrossLayoutOptions {
  data: ChartLineRsiCrossPoint[];
  shortLength?: number;
  longLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineRsiCrossLayout(
  opts: ComputeLineRsiCrossLayoutOptions,
): ChartLineRsiCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_RSI_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_RSI_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_RSI_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_RSI_CROSS_PANEL_GAP;

  const run = runLineRsiCross(opts.data, {
    shortLength: opts.shortLength ?? undefined,
    longLength: opts.longLength ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const rsiTop = priceBottom + panelGap;
  const rsiBottom = priceBottom + panelGap + usable * 0.45;

  const rsiMin = 0;
  const rsiMax = 100;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      rsiTop,
      rsiBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      shortPath: '',
      longPath: '',
      markers: [],
      priceMin: 0,
      priceMax: 0,
      rsiMin,
      rsiMax,
      midlineY: (rsiTop + rsiBottom) / 2,
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
  const syRsi = (y: number): number =>
    rsiBottom - ((y - rsiMin) / (rsiMax - rsiMin)) * (rsiBottom - rsiTop);

  let pricePath = '';
  const priceDots: ChartLineRsiCrossDot[] = [];
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

  const buildPath = (key: 'shortRsi' | 'longRsi'): string => {
    let p = '';
    let first = true;
    for (const s of run.samples) {
      const v = s[key];
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = syRsi(v);
      p += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return p.trim();
  };

  const shortPath = buildPath('shortRsi');
  const longPath = buildPath('longRsi');

  const markers: ChartLineRsiCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.shortRsi == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syRsi(s.shortRsi),
      shortRsi: s.shortRsi,
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
    rsiTop,
    rsiBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    shortPath,
    longPath,
    markers,
    priceMin,
    priceMax,
    rsiMin,
    rsiMax,
    midlineY: syRsi(50),
    run,
  };
}

export function describeLineRsiCrossChart(
  data: ChartLineRsiCrossPoint[],
  options: { shortLength?: number; longLength?: number } = {},
): string {
  const cleaned = getLineRsiCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const shortLength = normalizeLineRsiCrossLength(
    options.shortLength,
    DEFAULT_CHART_LINE_RSI_CROSS_SHORT_LENGTH,
  );
  const longLength = normalizeLineRsiCrossLength(
    options.longLength,
    DEFAULT_CHART_LINE_RSI_CROSS_LONG_LENGTH,
  );
  return (
    `RSI Cross chart over ${cleaned.length} bars ` +
    `(shortLength ${shortLength}, longLength ${longLength}). Top ` +
    `panel renders the close; bottom panel renders the short and ` +
    `long Wilder RSI lines with markers at every momentum-regime ` +
    `cross (short > long bullish, short < long bearish).`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultRsiFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineRsiCross = forwardRef<
  HTMLDivElement,
  ChartLineRsiCrossProps
>(function ChartLineRsiCross(props, ref): ReactNode {
  const {
    data,
    shortLength = DEFAULT_CHART_LINE_RSI_CROSS_SHORT_LENGTH,
    longLength = DEFAULT_CHART_LINE_RSI_CROSS_LONG_LENGTH,
    width = DEFAULT_CHART_LINE_RSI_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_RSI_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_RSI_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_RSI_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_RSI_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_RSI_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_RSI_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_RSI_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_RSI_CROSS_PRICE_COLOR,
    shortColor = DEFAULT_CHART_LINE_RSI_CROSS_SHORT_COLOR,
    longColor = DEFAULT_CHART_LINE_RSI_CROSS_LONG_COLOR,
    bullishColor = DEFAULT_CHART_LINE_RSI_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_RSI_CROSS_BEARISH_COLOR,
    midlineColor = DEFAULT_CHART_LINE_RSI_CROSS_MIDLINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_RSI_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_RSI_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showShort = true,
    showLong = true,
    showMarkers = true,
    showMidline = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onCrossClick,
    formatPrice = defaultPriceFormatter,
    formatRsi = defaultRsiFormatter,
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
    () => getLineRsiCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineRsiCrossLayout({
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
    ChartLineRsiCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineRsiCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineRsiCrossSeriesId,
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
        data-section="chart-line-rsi-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineRsiCrossChart(cleaned, { shortLength, longLength });

  const showPrice = !hidden.has('price');
  const showShortLine = !hidden.has('short') && showShort;
  const showLongLine = !hidden.has('long') && showLong;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickRsiValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickRsiValues.push(
      layout.rsiMin + ((layout.rsiMax - layout.rsiMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'RSI Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-rsi-cross"
      data-short-length={shortLength}
      data-long-length={longLength}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-rsi-cross-title"
      >
        {ariaLabel ?? 'RSI Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-rsi-cross-aria-desc"
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
        data-section="chart-line-rsi-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-rsi-cross-grid">
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
                  data-section="chart-line-rsi-cross-grid-line-price"
                />
              );
            })}
            {tickRsiValues.map((v, i) => {
              const y =
                layout.rsiBottom -
                ((v - layout.rsiMin) /
                  (layout.rsiMax - layout.rsiMin)) *
                  (layout.rsiBottom - layout.rsiTop);
              return (
                <line
                  key={`grid-rsi-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-rsi-cross-grid-line-rsi"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-rsi-cross-axes">
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
              y1={layout.rsiTop}
              x2={layout.innerLeft}
              y2={layout.rsiBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.rsiBottom}
              x2={layout.innerRight}
              y2={layout.rsiBottom}
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
                  data-section="chart-line-rsi-cross-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickRsiValues.map((v, i) => {
              const y =
                layout.rsiBottom -
                ((v - layout.rsiMin) /
                  (layout.rsiMax - layout.rsiMin)) *
                  (layout.rsiBottom - layout.rsiTop);
              return (
                <text
                  key={`tick-rsi-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-rsi-cross-tick-rsi"
                >
                  {formatRsi(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showMidline ? (
          <line
            x1={layout.innerLeft}
            y1={layout.midlineY}
            x2={layout.innerRight}
            y2={layout.midlineY}
            stroke={midlineColor}
            strokeDasharray="2 4"
            data-section="chart-line-rsi-cross-midline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-rsi-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-rsi-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-rsi-cross-price-dot"
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
            data-section="chart-line-rsi-cross-long"
          />
        ) : null}

        {showShortLine ? (
          <path
            d={layout.shortPath}
            stroke={shortColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-rsi-cross-short"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-rsi-cross-markers">
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
                data-section="chart-line-rsi-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-rsi-cross-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.rsiBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-rsi-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-rsi-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={180}
                  height={122}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-cross-tooltip-short"
                >
                  short{' '}
                  {tooltipSample.shortRsi == null
                    ? '--'
                    : formatRsi(tooltipSample.shortRsi)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-cross-tooltip-long"
                >
                  long{' '}
                  {tooltipSample.longRsi == null
                    ? '--'
                    : formatRsi(tooltipSample.longRsi)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-cross-tooltip-counts"
                >
                  up {layout.run.upCrossCount} | down{' '}
                  {layout.run.downCrossCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-rsi-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          short {shortLength} | long {longLength} | up{' '}
          {layout.run.upCrossCount} | down {layout.run.downCrossCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-rsi-cross-legend"
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
              { id: 'short' as const, color: shortColor, label: 'short rsi' },
              { id: 'long' as const, color: longColor, label: 'long rsi' },
            ] satisfies Array<{
              id: ChartLineRsiCrossSeriesId;
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

ChartLineRsiCross.displayName = 'ChartLineRsiCross';
