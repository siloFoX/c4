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
 * ChartLineTrixOverboughtCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only TRIX line in the
 * bottom panel, marking bullish (cross up through the overbought
 * threshold 0.1, entry into the overbought zone) / bearish (cross
 * down through 0.1, exit from the overbought zone) triple-
 * smoothed momentum overbought trigger events. Overbought-
 * threshold cross variant of the TRIX family that flags the
 * discrete TRIX crossing of the canonical upper-extreme momentum
 * reference line (canonical TRIX % is small, so 0.1 sits at the
 * pre-noise threshold most analysts use).
 *
 *   ema1[i]  = EMA(close, length)
 *   ema2[i]  = EMA(ema1, length)
 *   ema3[i]  = EMA(ema2, length)
 *   trix[i]  = ema3[i-1] != 0
 *                ? (ema3[i] - ema3[i-1]) / |ema3[i-1]| * 100
 *                : 0
 *   bullish  : prev trix <= 0.1 && cur trix > 0.1  (overbought in)
 *   bearish  : prev trix >= 0.1 && cur trix < 0.1  (overbought out)
 *
 * Defaults: `length = 15` (canonical TRIX window),
 * `threshold = 0.1` (canonical overbought line for the TRIX
 * percent scale). Regime classifier `bullish` (trix >= 0.1, in
 * overbought zone), `bearish` (trix < 0.1, below overbought),
 * `none` (trix null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: ema1 = ema2 = ema3 = K every bar so the
 *   change `ema3[i] - ema3[i-1] = 0` -> trix = 0 (even when
 *   K = 0, the ema3 = 0 guard returns 0 rather than NaN).
 *   trix = 0 sits below the threshold 0.1 -- regime `bearish`
 *   (0 < 0.1, opposite of the zero-cross variant where 0 sat on
 *   threshold 0 and read bullish). cross count = 0. Verified
 *   across K = 0..1234.
 * - **LINEAR UP close = i**: at steady state each EMA adds
 *   `(length - 1)/2` units of lag so ema3 increases by ~1 per
 *   bar. trix ~ 100 / ema3 -> early on this is large and well
 *   above 0.1, but decays toward 0 as i grows. 0 crosses while
 *   trix stays above 0.1.
 * - **LINEAR DOWN close = -i**: trix ~ -100 / |ema3| -> negative
 *   the entire run, regime `bearish`. 0 crosses.
 */

export interface ChartLineTrixOverboughtCrossPoint {
  x: number;
  close: number;
}

export type ChartLineTrixOverboughtCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineTrixOverboughtCrossSeriesId = 'price' | 'trix';

export type ChartLineTrixOverboughtCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineTrixOverboughtCrossCross {
  index: number;
  x: number;
  kind: ChartLineTrixOverboughtCrossCrossKind;
}

export interface ChartLineTrixOverboughtCrossSample {
  index: number;
  x: number;
  close: number;
  trix: number | null;
  regime: ChartLineTrixOverboughtCrossRegime;
}

export interface ChartLineTrixOverboughtCrossRun {
  series: ChartLineTrixOverboughtCrossPoint[];
  length: number;
  threshold: number;
  trixValues: Array<number | null>;
  samples: ChartLineTrixOverboughtCrossSample[];
  crosses: ChartLineTrixOverboughtCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineTrixOverboughtCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTrixOverboughtCrossLayout {
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
  priceDots: ChartLineTrixOverboughtCrossDot[];
  trixPath: string;
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
    kind: ChartLineTrixOverboughtCrossCrossKind;
  }>;
  run: ChartLineTrixOverboughtCrossRun;
}

export interface ChartLineTrixOverboughtCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTrixOverboughtCrossPoint[];
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
  trixColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTrix?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTrixOverboughtCrossSeriesId[];
  defaultHiddenSeries?: ChartLineTrixOverboughtCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTrixOverboughtCrossSeriesId;
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

export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_LENGTH = 15;
export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_THRESHOLD = 0.1;
export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_TRIX_COLOR =
  '#7c3aed';
export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_AXIS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_GRID_COLOR =
  '#e2e8f0';
export const DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineTrixOverboughtCrossFinitePoints(
  data:
    | readonly ChartLineTrixOverboughtCrossPoint[]
    | null
    | undefined,
): ChartLineTrixOverboughtCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTrixOverboughtCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineTrixOverboughtCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce any finite threshold. */
export function normalizeLineTrixOverboughtCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

/** SMA-seeded EMA with CONST short-circuit. */
export function applyLineTrixOverboughtCrossEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  let seedStart = -1;
  for (let i = 0; i + length <= values.length; i += 1) {
    let valid = true;
    for (let j = i; j < i + length; j += 1) {
      if (values[j] == null) {
        valid = false;
        break;
      }
    }
    if (valid) {
      seedStart = i;
      break;
    }
  }
  if (seedStart < 0) return out;
  let seedSum = 0;
  let winMin = Infinity;
  let winMax = -Infinity;
  for (let i = seedStart; i < seedStart + length; i += 1) {
    const v = values[i] ?? 0;
    seedSum += v;
    if (v < winMin) winMin = v;
    if (v > winMax) winMax = v;
  }
  const seed = winMin === winMax ? winMin : posZero(seedSum / length);
  const seedIndex = seedStart + length - 1;
  out[seedIndex] = seed;
  const alpha = 2 / (length + 1);
  let prev = seed;
  for (let i = seedIndex + 1; i < values.length; i += 1) {
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

export interface LineTrixOverboughtCrossChannels {
  ema1: Array<number | null>;
  ema2: Array<number | null>;
  ema3: Array<number | null>;
  trix: Array<number | null>;
}

export function computeLineTrixOverboughtCross(
  series:
    | readonly ChartLineTrixOverboughtCrossPoint[]
    | null
    | undefined,
  options: { length?: number } = {},
): LineTrixOverboughtCrossChannels {
  const cleaned = getLineTrixOverboughtCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { ema1: [], ema2: [], ema3: [], trix: [] };
  }
  const length = normalizeLineTrixOverboughtCrossLength(
    options.length,
    DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const ema1 = applyLineTrixOverboughtCrossEma(closes, length);
  const ema2 = applyLineTrixOverboughtCrossEma(ema1, length);
  const ema3 = applyLineTrixOverboughtCrossEma(ema2, length);

  const trix: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i += 1) {
    const cur = ema3[i];
    const prev = ema3[i - 1];
    if (cur == null || prev == null) continue;
    if (prev === 0) {
      trix[i] = 0;
    } else {
      trix[i] = posZero(((cur - prev) / Math.abs(prev)) * 100);
    }
  }

  return { ema1, ema2, ema3, trix };
}

export function classifyLineTrixOverboughtCrossRegime(
  trix: number | null,
  threshold: number,
): ChartLineTrixOverboughtCrossRegime {
  if (trix == null) return 'none';
  if (trix >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineTrixOverboughtCrossCrosses(
  series: readonly ChartLineTrixOverboughtCrossPoint[],
  trix: readonly (number | null)[],
  threshold: number,
): ChartLineTrixOverboughtCrossCross[] {
  const out: ChartLineTrixOverboughtCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = trix[i - 1];
    const cur = trix[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineTrixOverboughtCross(
  data: ChartLineTrixOverboughtCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): ChartLineTrixOverboughtCrossRun {
  const cleaned = getLineTrixOverboughtCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineTrixOverboughtCrossLength(
    options.length,
    DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_LENGTH,
  );
  const threshold = normalizeLineTrixOverboughtCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_THRESHOLD,
  );

  const channels = computeLineTrixOverboughtCross(series, { length });

  const samples: ChartLineTrixOverboughtCrossSample[] = series.map((p, i) => {
    const v = channels.trix[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      trix: v,
      regime: classifyLineTrixOverboughtCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineTrixOverboughtCrossCrosses(
    series,
    channels.trix,
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

  const ok = series.length > 3 * length;

  return {
    series,
    length,
    threshold,
    trixValues: channels.trix,
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

export interface ComputeLineTrixOverboughtCrossLayoutOptions {
  data: ChartLineTrixOverboughtCrossPoint[];
  length?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineTrixOverboughtCrossLayout(
  opts: ComputeLineTrixOverboughtCrossLayoutOptions,
): ChartLineTrixOverboughtCrossLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_PANEL_GAP;
  const threshold = normalizeLineTrixOverboughtCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_THRESHOLD,
  );

  const run = runLineTrixOverboughtCross(opts.data, {
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

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const v of run.trixValues) {
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
      trixPath: '',
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
  const priceDots: ChartLineTrixOverboughtCrossDot[] = [];
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

  let trixPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.trix == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.trix);
    trixPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  trixPath = trixPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.trixValues[c.index] ?? threshold);
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
    trixPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineTrixOverboughtCrossChart(
  data: ChartLineTrixOverboughtCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineTrixOverboughtCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineTrixOverboughtCrossLength(
    options.length,
    DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_LENGTH,
  );
  const threshold = normalizeLineTrixOverboughtCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_THRESHOLD,
  );
  return (
    `TRIX Overbought Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, threshold ${threshold}). Top panel ` +
    `renders the close with bullish (triple-smoothed momentum ` +
    `overbought cross up, entry) / bearish (cross down, exit) ` +
    `chevron overlays at every TRIX overbought threshold cross; ` +
    `bottom panel renders the close-only TRIX line on an auto- ` +
    `fitted oscillator with the overbought ${threshold} ` +
    `reference band and marks TRIX level ${threshold} overbought ` +
    `trigger events.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineTrixOverboughtCross = forwardRef<
  HTMLDivElement,
  ChartLineTrixOverboughtCrossProps
>(function ChartLineTrixOverboughtCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_LENGTH,
    threshold = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_PRICE_COLOR,
    trixColor = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_TRIX_COLOR,
    bullishColor = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_TRIX_OVERBOUGHT_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTrix = true,
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
    () => getLineTrixOverboughtCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineTrixOverboughtCrossLayout({
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
    ChartLineTrixOverboughtCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineTrixOverboughtCrossSeriesId,
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
    seriesId: ChartLineTrixOverboughtCrossSeriesId,
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
        data-section="chart-line-trix-overbought-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineTrixOverboughtCrossChart(cleaned, { length, threshold });

  const showPrice = !hidden.has('price');
  const showTrixLine = !hidden.has('trix') && showTrix;

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
      aria-label={ariaLabel ?? 'TRIX Overbought Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-trix-overbought-cross"
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
        data-section="chart-line-trix-overbought-cross-title"
      >
        {ariaLabel ?? 'TRIX Overbought Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-trix-overbought-cross-aria-desc"
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
        data-section="chart-line-trix-overbought-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-trix-overbought-cross-grid">
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
                  data-section="chart-line-trix-overbought-cross-grid-line-price"
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
                  data-section="chart-line-trix-overbought-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-trix-overbought-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-trix-overbought-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-trix-overbought-cross-axes">
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
                  data-section="chart-line-trix-overbought-cross-tick-price"
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
                  data-section="chart-line-trix-overbought-cross-tick-osc"
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
            data-section="chart-line-trix-overbought-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-trix-overbought-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-trix-overbought-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showTrixLine ? (
          <path
            d={layout.trixPath}
            stroke={trixColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-trix-overbought-cross-trix-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-trix-overbought-cross-crosses"
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
                data-section={`chart-line-trix-overbought-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-trix-overbought-cross-overlay-crosses"
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
                data-section={`chart-line-trix-overbought-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-trix-overbought-cross-hover-targets">
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
                data-section="chart-line-trix-overbought-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-trix-overbought-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={228}
                  height={118}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-overbought-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-overbought-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-overbought-cross-tooltip-trix"
                >
                  TRIX{' '}
                  {tooltipSample.trix == null
                    ? '--'
                    : formatOsc(tooltipSample.trix)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-overbought-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-overbought-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-overbought-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-overbought-cross-tooltip-crosses"
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
          data-section="chart-line-trix-overbought-cross-badge"
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
          data-section="chart-line-trix-overbought-cross-legend"
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
              { id: 'trix' as const, color: trixColor, label: 'TRIX' },
            ] satisfies Array<{
              id: ChartLineTrixOverboughtCrossSeriesId;
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

ChartLineTrixOverboughtCross.displayName = 'ChartLineTrixOverboughtCross';
