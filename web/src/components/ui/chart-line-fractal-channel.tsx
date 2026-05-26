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
 * ChartLineFractalChannel -- pure-SVG single-panel chart that
 * overlays a Fractal Channel envelope on a price line. The channel
 * tracks the highest and lowest Bill Williams fractal pivot values
 * within a fixed-bar lookback window:
 *
 *   isUpperFractal[i] = high[i] is strict max of high[i - 2 .. i + 2]
 *   isLowerFractal[i] = low[i]  is strict min of low [i - 2 .. i + 2]
 *   (a fractal at index i is "confirmed" `fractalLookback` bars later
 *    -- the conventional lookahead requirement for Bill Williams
 *    fractals)
 *
 *   upper[i] = max(confirmed upper fractal high
 *                  for indices in [max(0, i - length + 1) .. i])
 *   lower[i] = min(confirmed lower fractal low
 *                  for indices in [max(0, i - length + 1) .. i])
 *
 * When no confirmed fractal of the relevant side exists inside the
 * window, the corresponding channel value is `null`. The channel is
 * piece-wise constant between fractal events and drops when an old
 * fractal scrolls off the lookback window.
 *
 * Bit-exact anchors:
 * - **CONST h = l = K**: no fractals confirm (the strict-max test
 *   fails on flat sequences), so `upper = lower = null` everywhere.
 * - **SAWTOOTH**: pattern where every confirmed upper fractal has
 *   the same high `K_u` and every confirmed lower fractal has the
 *   same low `K_l`, with density tight enough that each side has
 *   at least one fractal inside every lookback window. Then
 *   `upper = K_u` and `lower = K_l` bit-exact (max / min of
 *   identical IEEE 754 doubles is exact).
 */

export interface ChartLineFractalChannelPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineFractalChannelZone =
  | 'above'
  | 'below'
  | 'inside'
  | 'none';

export type ChartLineFractalChannelCross = 'up' | 'down' | null;

export type ChartLineFractalChannelSeriesId =
  | 'price'
  | 'upper'
  | 'lower';

export interface ChartLineFractalChannelSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  isUpperFractal: boolean;
  isLowerFractal: boolean;
  upper: number | null;
  lower: number | null;
  width: number | null;
  zone: ChartLineFractalChannelZone;
  crossed: ChartLineFractalChannelCross;
}

export interface ChartLineFractalChannelRun {
  series: ChartLineFractalChannelPoint[];
  length: number;
  fractalLookback: number;
  upperFractalValues: Array<number | null>;
  lowerFractalValues: Array<number | null>;
  upperValues: Array<number | null>;
  lowerValues: Array<number | null>;
  widthValues: Array<number | null>;
  samples: ChartLineFractalChannelSample[];
  aboveCount: number;
  belowCount: number;
  insideCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  upperFractalCount: number;
  lowerFractalCount: number;
  ok: boolean;
}

export interface ChartLineFractalChannelDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineFractalChannelMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  kind: 'upper-fractal' | 'lower-fractal';
}

export interface ChartLineFractalChannelLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineFractalChannelDot[];
  upperPath: string;
  lowerPath: string;
  markers: ChartLineFractalChannelMarker[];
  yMin: number;
  yMax: number;
  run: ChartLineFractalChannelRun;
}

export interface ChartLineFractalChannelProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineFractalChannelPoint[];
  length?: number;
  fractalLookback?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  upperColor?: string;
  lowerColor?: string;
  upperFractalColor?: string;
  lowerFractalColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showUpper?: boolean;
  showLower?: boolean;
  showFractalMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineFractalChannelSeriesId[];
  defaultHiddenSeries?: ChartLineFractalChannelSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineFractalChannelSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineFractalChannelSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_FRACTAL_CHANNEL_WIDTH = 720;
export const DEFAULT_CHART_LINE_FRACTAL_CHANNEL_HEIGHT = 360;
export const DEFAULT_CHART_LINE_FRACTAL_CHANNEL_PADDING = 44;
export const DEFAULT_CHART_LINE_FRACTAL_CHANNEL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FRACTAL_CHANNEL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_FRACTAL_CHANNEL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FRACTAL_CHANNEL_LENGTH = 50;
export const DEFAULT_CHART_LINE_FRACTAL_CHANNEL_FRACTAL_LOOKBACK = 2;
export const DEFAULT_CHART_LINE_FRACTAL_CHANNEL_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_FRACTAL_CHANNEL_UPPER_COLOR = '#7c2d12';
export const DEFAULT_CHART_LINE_FRACTAL_CHANNEL_LOWER_COLOR = '#14532d';
export const DEFAULT_CHART_LINE_FRACTAL_CHANNEL_UPPER_FRACTAL_COLOR = '#ef4444';
export const DEFAULT_CHART_LINE_FRACTAL_CHANNEL_LOWER_FRACTAL_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_FRACTAL_CHANNEL_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_FRACTAL_CHANNEL_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite OHLC fields. */
export function getLineFractalChannelFinitePoints(
  data: readonly ChartLineFractalChannelPoint[] | null | undefined,
): ChartLineFractalChannelPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineFractalChannelPoint[] = [];
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

/** Coerce a positive integer lookback length (>= 2). */
export function normalizeLineFractalChannelLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive integer fractal lookback (>= 1). */
export function normalizeLineFractalChannelFractalLookback(
  lookback: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(lookback) && lookback >= 1) return Math.floor(lookback);
  return fallback;
}

/** Strict upper fractal: high[i] > all neighbours in i +/- lookback. */
export function detectLineFractalChannelUpperFractals(
  highs: readonly number[],
  lookback: number,
): boolean[] {
  const n = highs.length;
  const out: boolean[] = new Array(n).fill(false);
  for (let i = lookback; i < n - lookback; i += 1) {
    const center = highs[i]!;
    let isMax = true;
    for (let j = 1; j <= lookback; j += 1) {
      if (highs[i - j]! >= center || highs[i + j]! >= center) {
        isMax = false;
        break;
      }
    }
    if (isMax) out[i] = true;
  }
  return out;
}

/** Strict lower fractal: low[i] < all neighbours in i +/- lookback. */
export function detectLineFractalChannelLowerFractals(
  lows: readonly number[],
  lookback: number,
): boolean[] {
  const n = lows.length;
  const out: boolean[] = new Array(n).fill(false);
  for (let i = lookback; i < n - lookback; i += 1) {
    const center = lows[i]!;
    let isMin = true;
    for (let j = 1; j <= lookback; j += 1) {
      if (lows[i - j]! <= center || lows[i + j]! <= center) {
        isMin = false;
        break;
      }
    }
    if (isMin) out[i] = true;
  }
  return out;
}

export interface LineFractalChannelChannels {
  upperFractal: boolean[];
  lowerFractal: boolean[];
  upperFractalAt: Array<number | null>;
  lowerFractalAt: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
  width: Array<number | null>;
}

export function computeLineFractalChannel(
  series: readonly ChartLineFractalChannelPoint[] | null | undefined,
  options: {
    length?: number;
    fractalLookback?: number;
  } = {},
): LineFractalChannelChannels {
  const cleaned = getLineFractalChannelFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      upperFractal: [],
      lowerFractal: [],
      upperFractalAt: [],
      lowerFractalAt: [],
      upper: [],
      lower: [],
      width: [],
    };
  }
  const length = normalizeLineFractalChannelLength(
    options.length,
    DEFAULT_CHART_LINE_FRACTAL_CHANNEL_LENGTH,
  );
  const fractalLookback = normalizeLineFractalChannelFractalLookback(
    options.fractalLookback,
    DEFAULT_CHART_LINE_FRACTAL_CHANNEL_FRACTAL_LOOKBACK,
  );

  const highs = cleaned.map((p) => p.high);
  const lows = cleaned.map((p) => p.low);
  const upperFractal = detectLineFractalChannelUpperFractals(
    highs,
    fractalLookback,
  );
  const lowerFractal = detectLineFractalChannelLowerFractals(
    lows,
    fractalLookback,
  );

  // upperFractalAt[i] = upper fractal value confirmed exactly at this index
  // (i.e. the pivot lives at index i - fractalLookback). Null when no
  // upper fractal confirms here.
  const upperFractalAt: Array<number | null> = new Array(
    cleaned.length,
  ).fill(null);
  const lowerFractalAt: Array<number | null> = new Array(
    cleaned.length,
  ).fill(null);
  for (let i = 0; i < cleaned.length; i += 1) {
    const pivotIdx = i - fractalLookback;
    if (pivotIdx < 0) continue;
    if (upperFractal[pivotIdx]) upperFractalAt[i] = highs[pivotIdx]!;
    if (lowerFractal[pivotIdx]) lowerFractalAt[i] = lows[pivotIdx]!;
  }

  // Rolling max / min of the confirmed-fractal series across `length`
  // bars (null where no fractal confirmation lives inside the window).
  const upper: Array<number | null> = new Array(cleaned.length).fill(null);
  const lower: Array<number | null> = new Array(cleaned.length).fill(null);
  const widthOut: Array<number | null> = new Array(cleaned.length).fill(
    null,
  );
  for (let i = 0; i < cleaned.length; i += 1) {
    const start = Math.max(0, i - length + 1);
    let uMax: number | null = null;
    let lMin: number | null = null;
    for (let k = start; k <= i; k += 1) {
      const uv = upperFractalAt[k];
      if (uv != null) {
        if (uMax == null || uv > uMax) uMax = uv;
      }
      const lv = lowerFractalAt[k];
      if (lv != null) {
        if (lMin == null || lv < lMin) lMin = lv;
      }
    }
    upper[i] = uMax == null ? null : posZero(uMax);
    lower[i] = lMin == null ? null : posZero(lMin);
    if (uMax != null && lMin != null) {
      widthOut[i] = posZero(uMax - lMin);
    }
  }

  return {
    upperFractal,
    lowerFractal,
    upperFractalAt,
    lowerFractalAt,
    upper,
    lower,
    width: widthOut,
  };
}

export function classifyLineFractalChannelZone(
  close: number,
  upper: number | null,
  lower: number | null,
): ChartLineFractalChannelZone {
  if (upper == null || lower == null) return 'none';
  if (close > upper) return 'above';
  if (close < lower) return 'below';
  return 'inside';
}

export function detectLineFractalChannelCrosses(
  closes: readonly number[],
  uppers: readonly (number | null)[],
  lowers: readonly (number | null)[],
): ChartLineFractalChannelCross[] {
  const out: ChartLineFractalChannelCross[] = [];
  let prevZone: ChartLineFractalChannelZone = 'none';
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i]!;
    const u = uppers[i] ?? null;
    const l = lowers[i] ?? null;
    const zone = classifyLineFractalChannelZone(c, u, l);
    if (prevZone === 'none' || zone === 'none') {
      out.push(null);
    } else if (prevZone === 'inside' && zone === 'above') {
      out.push('up');
    } else if (prevZone === 'inside' && zone === 'below') {
      out.push('down');
    } else {
      out.push(null);
    }
    prevZone = zone;
  }
  return out;
}

export function runLineFractalChannel(
  data: ChartLineFractalChannelPoint[],
  options: {
    length?: number;
    fractalLookback?: number;
  } = {},
): ChartLineFractalChannelRun {
  const cleaned = getLineFractalChannelFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineFractalChannelLength(
    options.length,
    DEFAULT_CHART_LINE_FRACTAL_CHANNEL_LENGTH,
  );
  const fractalLookback = normalizeLineFractalChannelFractalLookback(
    options.fractalLookback,
    DEFAULT_CHART_LINE_FRACTAL_CHANNEL_FRACTAL_LOOKBACK,
  );

  const channels = computeLineFractalChannel(series, {
    length,
    fractalLookback,
  });

  const closes = series.map((p) => p.close);
  const crosses = detectLineFractalChannelCrosses(
    closes,
    channels.upper,
    channels.lower,
  );

  const upperFractalValues: Array<number | null> = series.map((p, i) =>
    channels.upperFractal[i] ? p.high : null,
  );
  const lowerFractalValues: Array<number | null> = series.map((p, i) =>
    channels.lowerFractal[i] ? p.low : null,
  );

  const samples: ChartLineFractalChannelSample[] = series.map((p, i) => {
    const isUpperFractal = !!channels.upperFractal[i];
    const isLowerFractal = !!channels.lowerFractal[i];
    const upper = channels.upper[i] ?? null;
    const lower = channels.lower[i] ?? null;
    const width = channels.width[i] ?? null;
    const zone = classifyLineFractalChannelZone(p.close, upper, lower);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      isUpperFractal,
      isLowerFractal,
      upper,
      lower,
      width,
      zone,
      crossed,
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let insideCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  let upperFractalCount = 0;
  let lowerFractalCount = 0;
  for (const s of samples) {
    if (s.zone === 'above') aboveCount += 1;
    else if (s.zone === 'below') belowCount += 1;
    else if (s.zone === 'inside') insideCount += 1;
    else noneCount += 1;
    if (s.crossed === 'up') bullishCrossCount += 1;
    else if (s.crossed === 'down') bearishCrossCount += 1;
    if (s.isUpperFractal) upperFractalCount += 1;
    if (s.isLowerFractal) lowerFractalCount += 1;
  }

  const ok = series.length >= 2 * fractalLookback + 1;

  return {
    series,
    length,
    fractalLookback,
    upperFractalValues,
    lowerFractalValues,
    upperValues: channels.upper,
    lowerValues: channels.lower,
    widthValues: channels.width,
    samples,
    aboveCount,
    belowCount,
    insideCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    upperFractalCount,
    lowerFractalCount,
    ok,
  };
}

export interface ComputeLineFractalChannelLayoutOptions {
  data: ChartLineFractalChannelPoint[];
  length?: number;
  fractalLookback?: number;
  width?: number;
  height?: number;
  padding?: number;
}

export function computeLineFractalChannelLayout(
  opts: ComputeLineFractalChannelLayoutOptions,
): ChartLineFractalChannelLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_FRACTAL_CHANNEL_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_FRACTAL_CHANNEL_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_FRACTAL_CHANNEL_PADDING;

  const run = runLineFractalChannel(opts.data, {
    length: opts.length ?? undefined,
    fractalLookback: opts.fractalLookback ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      innerLeft,
      innerRight,
      innerTop,
      innerBottom,
      pricePath: '',
      priceDots: [],
      upperPath: '',
      lowerPath: '',
      markers: [],
      yMin: 0,
      yMax: 1,
      run,
    };
  }

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const s of run.samples) {
    if (s.low < yMin) yMin = s.low;
    if (s.high > yMax) yMax = s.high;
    if (s.upper != null && s.upper > yMax) yMax = s.upper;
    if (s.lower != null && s.lower < yMin) yMin = s.lower;
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0;
    yMax = 1;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const sy = (y: number): number =>
    innerBottom - ((y - yMin) / (yMax - yMin)) * (innerBottom - innerTop);

  let pricePath = '';
  const priceDots: ChartLineFractalChannelDot[] = [];
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = sy(s.close);
    pricePath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    priceDots.push({
      index: s.index,
      x: s.x,
      cx,
      cy,
      close: s.close,
    });
  }

  const buildBandPath = (key: 'upper' | 'lower'): string => {
    let p = '';
    let first = true;
    for (const s of run.samples) {
      const v = s[key];
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = sy(v);
      p += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return p.trim();
  };

  const upperPath = buildBandPath('upper');
  const lowerPath = buildBandPath('lower');

  const markers: ChartLineFractalChannelMarker[] = [];
  for (const s of run.samples) {
    if (s.isUpperFractal) {
      markers.push({
        index: s.index,
        x: s.x,
        cx: sx(s.x),
        cy: sy(s.high),
        kind: 'upper-fractal',
      });
    }
    if (s.isLowerFractal) {
      markers.push({
        index: s.index,
        x: s.x,
        cx: sx(s.x),
        cy: sy(s.low),
        kind: 'lower-fractal',
      });
    }
  }

  return {
    ok: true,
    width,
    height,
    padding,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    pricePath: pricePath.trim(),
    priceDots,
    upperPath,
    lowerPath,
    markers,
    yMin,
    yMax,
    run,
  };
}

export function describeLineFractalChannelChart(
  data: ChartLineFractalChannelPoint[],
  options: {
    length?: number;
    fractalLookback?: number;
  } = {},
): string {
  const cleaned = getLineFractalChannelFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineFractalChannelLength(
    options.length,
    DEFAULT_CHART_LINE_FRACTAL_CHANNEL_LENGTH,
  );
  const fractalLookback = normalizeLineFractalChannelFractalLookback(
    options.fractalLookback,
    DEFAULT_CHART_LINE_FRACTAL_CHANNEL_FRACTAL_LOOKBACK,
  );
  return (
    `Fractal Channel chart over ${cleaned.length} bars ` +
    `(length ${length}, fractalLookback ${fractalLookback}). ` +
    `Single panel with the close line wrapped by an envelope formed ` +
    `from the highest and lowest Bill Williams fractal pivot levels ` +
    `inside the lookback window.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineFractalChannel = forwardRef<
  HTMLDivElement,
  ChartLineFractalChannelProps
>(function ChartLineFractalChannel(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_FRACTAL_CHANNEL_LENGTH,
    fractalLookback = DEFAULT_CHART_LINE_FRACTAL_CHANNEL_FRACTAL_LOOKBACK,
    width = DEFAULT_CHART_LINE_FRACTAL_CHANNEL_WIDTH,
    height = DEFAULT_CHART_LINE_FRACTAL_CHANNEL_HEIGHT,
    padding = DEFAULT_CHART_LINE_FRACTAL_CHANNEL_PADDING,
    tickCount = DEFAULT_CHART_LINE_FRACTAL_CHANNEL_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_FRACTAL_CHANNEL_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_FRACTAL_CHANNEL_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_FRACTAL_CHANNEL_PRICE_COLOR,
    upperColor = DEFAULT_CHART_LINE_FRACTAL_CHANNEL_UPPER_COLOR,
    lowerColor = DEFAULT_CHART_LINE_FRACTAL_CHANNEL_LOWER_COLOR,
    upperFractalColor = DEFAULT_CHART_LINE_FRACTAL_CHANNEL_UPPER_FRACTAL_COLOR,
    lowerFractalColor = DEFAULT_CHART_LINE_FRACTAL_CHANNEL_LOWER_FRACTAL_COLOR,
    axisColor = DEFAULT_CHART_LINE_FRACTAL_CHANNEL_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_FRACTAL_CHANNEL_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showUpper = true,
    showLower = true,
    showFractalMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultPriceFormatter,
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
    () => getLineFractalChannelFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineFractalChannelLayout({
        data: cleaned,
        length,
        fractalLookback,
        width,
        height,
        padding,
      }),
    [cleaned, length, fractalLookback, width, height, padding],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineFractalChannelSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineFractalChannelSeriesId,
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
    seriesId: ChartLineFractalChannelSeriesId,
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
        data-section="chart-line-fractal-channel-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineFractalChannelChart(cleaned, {
      length,
      fractalLookback,
    });

  const showPrice = !hidden.has('price');
  const showUpperLine = !hidden.has('upper') && showUpper;
  const showLowerLine = !hidden.has('lower') && showLower;

  const tickValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickValues.push(
      layout.yMin + ((layout.yMax - layout.yMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'Fractal Channel chart'}
      aria-describedby={descId}
      data-section="chart-line-fractal-channel"
      data-length={length}
      data-fractal-lookback={fractalLookback}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-fractal-channel-title"
      >
        {ariaLabel ?? 'Fractal Channel chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-fractal-channel-aria-desc"
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
        data-section="chart-line-fractal-channel-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-fractal-channel-grid">
            {tickValues.map((v, i) => {
              const y =
                layout.innerBottom -
                ((v - layout.yMin) / (layout.yMax - layout.yMin)) *
                  (layout.innerBottom - layout.innerTop);
              return (
                <line
                  key={`grid-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-fractal-channel-grid-line"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-fractal-channel-axes">
            <line
              x1={layout.innerLeft}
              y1={layout.innerTop}
              x2={layout.innerLeft}
              y2={layout.innerBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.innerBottom}
              x2={layout.innerRight}
              y2={layout.innerBottom}
              stroke={axisColor}
            />
            {tickValues.map((v, i) => {
              const y =
                layout.innerBottom -
                ((v - layout.yMin) / (layout.yMax - layout.yMin)) *
                  (layout.innerBottom - layout.innerTop);
              return (
                <text
                  key={`tick-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-fractal-channel-tick"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showUpperLine ? (
          <path
            d={layout.upperPath}
            stroke={upperColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fractal-channel-upper"
          />
        ) : null}

        {showLowerLine ? (
          <path
            d={layout.lowerPath}
            stroke={lowerColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fractal-channel-lower"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fractal-channel-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-fractal-channel-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-fractal-channel-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showFractalMarkers ? (
          <g data-section="chart-line-fractal-channel-markers">
            {layout.markers.map((m) => (
              <circle
                key={`marker-${m.index}-${m.kind}`}
                cx={m.cx}
                cy={m.cy}
                r={dotRadius + 1}
                fill={
                  m.kind === 'upper-fractal'
                    ? upperFractalColor
                    : lowerFractalColor
                }
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onPointClick?.({ point: sample });
                }}
                data-section="chart-line-fractal-channel-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-fractal-channel-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.innerTop}
                width={10}
                height={layout.innerBottom - layout.innerTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-fractal-channel-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.innerTop + 8})`}
                data-section="chart-line-fractal-channel-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={180}
                  height={120}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-channel-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-channel-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-channel-tooltip-upper"
                >
                  upper{' '}
                  {tooltipSample.upper == null
                    ? '--'
                    : formatPrice(tooltipSample.upper)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-channel-tooltip-lower"
                >
                  lower{' '}
                  {tooltipSample.lower == null
                    ? '--'
                    : formatPrice(tooltipSample.lower)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-channel-tooltip-width"
                >
                  width{' '}
                  {tooltipSample.width == null
                    ? '--'
                    : formatPrice(tooltipSample.width)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-channel-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-channel-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-fractal-channel-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | lookback {fractalLookback}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-fractal-channel-legend"
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
              { id: 'upper' as const, color: upperColor, label: 'upper' },
              { id: 'lower' as const, color: lowerColor, label: 'lower' },
            ] satisfies Array<{
              id: ChartLineFractalChannelSeriesId;
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

ChartLineFractalChannel.displayName = 'ChartLineFractalChannel';
