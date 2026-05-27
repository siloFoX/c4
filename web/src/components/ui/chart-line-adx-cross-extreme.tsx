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
 * ChartLineAdxCrossExtreme -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only ADX line in
 * the bottom panel, marking bullish (ADX crosses up above 40
 * strong trend entry) / bearish (ADX crosses down below 20
 * weak trend exit) extreme threshold cross trigger events on
 * a fixed 0-100 oscillator with reference bands. Threshold-
 * cross variant of the ADX family that separates trend
 * strength entry / exit events from the ADX magnitude alone.
 *
 *   TR[i]      = |close[i] - close[i-1]|              (close-only)
 *   plusDM[i]  = max(delta close, 0)
 *   minusDM[i] = max(-delta close, 0)
 *   ATR[i]     = Wilder smooth of TR over length
 *   plusDM_s   = Wilder smooth of plusDM
 *   minusDM_s  = Wilder smooth of minusDM
 *   plusDI     = ATR > 0 ? 100 * plusDM_s / ATR : 0
 *   minusDI    = ATR > 0 ? 100 * minusDM_s / ATR : 0
 *   dx[i]      = sum > 0
 *                  ? 100 * |plusDI - minusDI| / (plusDI + minusDI)
 *                  : 0
 *   adx[i]     = Wilder smooth of dx over length
 *   bullish   : prev <= 40 && cur > 40  (strong trend entry)
 *   bearish   : prev >= 20 && cur < 20  (weak trend exit)
 *
 * Defaults: `length = 14` (canonical Wilder ADX window),
 * `upperThreshold = 40`, `lowerThreshold = 20`. Regime
 * classifier `bullish` (ADX >= upper, strong), `bearish` (ADX
 * < lower, weak), `neutral` (lower <= ADX < upper, moderate),
 * `none` (ADX null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: every delta = 0 -> TR = +DM = -DM = 0
 *   -> ATR = 0 -> +DI = -DI = 0 via zero-ATR guard -> DX = 0
 *   via 0/0 guard -> ADX = 0 via Wilder short-circuit. 0 < 20
 *   so regime is `bearish` (weak). 0 never crosses above 40
 *   and never transitions from >= 20 to < 20 (it starts
 *   already below 20 the moment ADX becomes non-null), so
 *   cross count = 0. Verified across K = 0..1234.
 */

export interface ChartLineAdxCrossExtremePoint {
  x: number;
  close: number;
}

export type ChartLineAdxCrossExtremeRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineAdxCrossExtremeSeriesId = 'price' | 'adx';

export type ChartLineAdxCrossExtremeCrossKind = 'bullish' | 'bearish';

export interface ChartLineAdxCrossExtremeCross {
  index: number;
  x: number;
  kind: ChartLineAdxCrossExtremeCrossKind;
}

export interface ChartLineAdxCrossExtremeSample {
  index: number;
  x: number;
  close: number;
  adx: number | null;
  regime: ChartLineAdxCrossExtremeRegime;
}

export interface ChartLineAdxCrossExtremeRun {
  series: ChartLineAdxCrossExtremePoint[];
  length: number;
  upperThreshold: number;
  lowerThreshold: number;
  adxValues: Array<number | null>;
  samples: ChartLineAdxCrossExtremeSample[];
  crosses: ChartLineAdxCrossExtremeCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineAdxCrossExtremeDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAdxCrossExtremeLayout {
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
  priceDots: ChartLineAdxCrossExtremeDot[];
  adxPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  midY: number;
  upperY: number;
  lowerY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineAdxCrossExtremeCrossKind;
  }>;
  run: ChartLineAdxCrossExtremeRun;
}

export interface ChartLineAdxCrossExtremeProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAdxCrossExtremePoint[];
  length?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  adxColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAdx?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAdxCrossExtremeSeriesId[];
  defaultHiddenSeries?: ChartLineAdxCrossExtremeSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAdxCrossExtremeSeriesId;
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

export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_WIDTH = 720;
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_PADDING = 44;
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_LENGTH = 14;
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_UPPER_THRESHOLD = 40;
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_LOWER_THRESHOLD = 20;
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_ADX_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineAdxCrossExtremeFinitePoints(
  data: readonly ChartLineAdxCrossExtremePoint[] | null | undefined,
): ChartLineAdxCrossExtremePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAdxCrossExtremePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineAdxCrossExtremeLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a finite threshold in [0, 100]. */
export function normalizeLineAdxCrossExtremeThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 0 && value <= 100) return value;
  return fallback;
}

/** Wilder smoothing with CONST short-circuit. */
export function applyLineAdxCrossExtremeWilder(
  values: readonly number[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (values.length < length) return out;
  let sum = 0;
  for (let i = 0; i < length; i += 1) sum += values[i]!;
  const seed = posZero(sum / length);
  out[length - 1] = seed;
  let prev = seed;
  for (let i = length; i < values.length; i += 1) {
    const v = values[i]!;
    const next =
      v === prev ? v : posZero((prev * (length - 1) + v) / length);
    out[i] = next;
    prev = next;
  }
  return out;
}

export interface LineAdxCrossExtremeChannels {
  adx: Array<number | null>;
}

export function computeLineAdxCrossExtreme(
  series: readonly ChartLineAdxCrossExtremePoint[] | null | undefined,
  options: { length?: number } = {},
): LineAdxCrossExtremeChannels {
  const cleaned = getLineAdxCrossExtremeFinitePoints(series);
  if (cleaned.length === 0) {
    return { adx: [] };
  }
  const length = normalizeLineAdxCrossExtremeLength(
    options.length,
    DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const tr: number[] = new Array(closes.length).fill(0);
  const plusDM: number[] = new Array(closes.length).fill(0);
  const minusDM: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i += 1) {
    const delta = closes[i]! - closes[i - 1]!;
    tr[i] = Math.abs(delta);
    if (delta > 0) plusDM[i] = delta;
    else if (delta < 0) minusDM[i] = -delta;
  }

  const atrIdx1 = applyLineAdxCrossExtremeWilder(tr.slice(1), length);
  const plusIdx1 = applyLineAdxCrossExtremeWilder(plusDM.slice(1), length);
  const minusIdx1 = applyLineAdxCrossExtremeWilder(minusDM.slice(1), length);

  const atr: Array<number | null> = new Array(closes.length).fill(null);
  const plusS: Array<number | null> = new Array(closes.length).fill(null);
  const minusS: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < atrIdx1.length; i += 1) {
    atr[i + 1] = atrIdx1[i] ?? null;
    plusS[i + 1] = plusIdx1[i] ?? null;
    minusS[i + 1] = minusIdx1[i] ?? null;
  }

  const dx: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const a = atr[i];
    const p = plusS[i];
    const m = minusS[i];
    if (a == null || p == null || m == null) continue;
    let plusDI = 0;
    let minusDI = 0;
    if (a > 0) {
      plusDI = (100 * p) / a;
      minusDI = (100 * m) / a;
    }
    const sum = plusDI + minusDI;
    if (sum <= 0) {
      dx[i] = 0;
    } else {
      dx[i] = posZero((100 * Math.abs(plusDI - minusDI)) / sum);
    }
  }

  // ADX = Wilder smoothing of DX starting from first valid DX
  let firstDx = -1;
  for (let i = 0; i < dx.length; i += 1) {
    if (dx[i] != null) {
      firstDx = i;
      break;
    }
  }

  const adx: Array<number | null> = new Array(closes.length).fill(null);
  if (firstDx >= 0) {
    const dxTail: number[] = [];
    for (let i = firstDx; i < dx.length; i += 1) {
      dxTail.push(dx[i] ?? 0);
    }
    const adxTail = applyLineAdxCrossExtremeWilder(dxTail, length);
    for (let i = 0; i < adxTail.length; i += 1) {
      adx[firstDx + i] = adxTail[i] ?? null;
    }
  }

  return { adx };
}

export function classifyLineAdxCrossExtremeRegime(
  adx: number | null,
  upperThreshold: number,
  lowerThreshold: number,
): ChartLineAdxCrossExtremeRegime {
  if (adx == null) return 'none';
  if (adx >= upperThreshold) return 'bullish';
  if (adx < lowerThreshold) return 'bearish';
  return 'neutral';
}

export function detectLineAdxCrossExtremeCrosses(
  series: readonly ChartLineAdxCrossExtremePoint[],
  adx: readonly (number | null)[],
  upperThreshold: number,
  lowerThreshold: number,
): ChartLineAdxCrossExtremeCross[] {
  const out: ChartLineAdxCrossExtremeCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = adx[i - 1];
    const cur = adx[i];
    if (prev == null || cur == null) continue;
    if (prev <= upperThreshold && cur > upperThreshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= lowerThreshold && cur < lowerThreshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineAdxCrossExtreme(
  data: ChartLineAdxCrossExtremePoint[],
  options: {
    length?: number;
    upperThreshold?: number;
    lowerThreshold?: number;
  } = {},
): ChartLineAdxCrossExtremeRun {
  const cleaned = getLineAdxCrossExtremeFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineAdxCrossExtremeLength(
    options.length,
    DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_LENGTH,
  );
  const upperThreshold = normalizeLineAdxCrossExtremeThreshold(
    options.upperThreshold,
    DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_UPPER_THRESHOLD,
  );
  const lowerThreshold = normalizeLineAdxCrossExtremeThreshold(
    options.lowerThreshold,
    DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_LOWER_THRESHOLD,
  );

  const channels = computeLineAdxCrossExtreme(series, { length });

  const samples: ChartLineAdxCrossExtremeSample[] = series.map((p, i) => {
    const a = channels.adx[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      adx: a,
      regime: classifyLineAdxCrossExtremeRegime(
        a,
        upperThreshold,
        lowerThreshold,
      ),
    };
  });

  const crosses = detectLineAdxCrossExtremeCrosses(
    series,
    channels.adx,
    upperThreshold,
    lowerThreshold,
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

  const ok = series.length > length * 2;

  return {
    series,
    length,
    upperThreshold,
    lowerThreshold,
    adxValues: channels.adx,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineAdxCrossExtremeLayoutOptions {
  data: ChartLineAdxCrossExtremePoint[];
  length?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAdxCrossExtremeLayout(
  opts: ComputeLineAdxCrossExtremeLayoutOptions,
): ChartLineAdxCrossExtremeLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_PANEL_GAP;
  const upperThreshold = normalizeLineAdxCrossExtremeThreshold(
    opts.upperThreshold,
    DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_UPPER_THRESHOLD,
  );
  const lowerThreshold = normalizeLineAdxCrossExtremeThreshold(
    opts.lowerThreshold,
    DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_LOWER_THRESHOLD,
  );

  const run = runLineAdxCrossExtreme(opts.data, {
    length: opts.length ?? undefined,
    upperThreshold,
    lowerThreshold,
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
  const upperY = syOscBase(upperThreshold);
  const lowerY = syOscBase(lowerThreshold);

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
      adxPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      midY,
      upperY,
      lowerY,
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
  const priceDots: ChartLineAdxCrossExtremeDot[] = [];
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

  let adxPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.adx == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.adx);
    adxPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  adxPath = adxPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.adxValues[c.index] ?? 50);
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
    adxPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    midY,
    upperY,
    lowerY,
    crossMarkers,
    run,
  };
}

export function describeLineAdxCrossExtremeChart(
  data: ChartLineAdxCrossExtremePoint[],
  options: {
    length?: number;
    upperThreshold?: number;
    lowerThreshold?: number;
  } = {},
): string {
  const cleaned = getLineAdxCrossExtremeFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineAdxCrossExtremeLength(
    options.length,
    DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_LENGTH,
  );
  const upperThreshold = normalizeLineAdxCrossExtremeThreshold(
    options.upperThreshold,
    DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_UPPER_THRESHOLD,
  );
  const lowerThreshold = normalizeLineAdxCrossExtremeThreshold(
    options.lowerThreshold,
    DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_LOWER_THRESHOLD,
  );
  return (
    `ADX Cross Extreme chart over ${cleaned.length} bars (length ` +
    `${length}, upperThreshold ${upperThreshold}, ` +
    `lowerThreshold ${lowerThreshold}). Top panel renders the ` +
    `close with bullish (strong trend entry) / bearish (weak ` +
    `trend exit) arrow overlays at every ADX extreme threshold ` +
    `cross; bottom panel renders the close-only ADX line on a ` +
    `fixed 0-100 oscillator with reference bands and marks ` +
    `trend strength entry and weak trend exit events.`
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

export const ChartLineAdxCrossExtreme = forwardRef<
  HTMLDivElement,
  ChartLineAdxCrossExtremeProps
>(function ChartLineAdxCrossExtreme(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_LENGTH,
    upperThreshold = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_UPPER_THRESHOLD,
    lowerThreshold = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_LOWER_THRESHOLD,
    width = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_WIDTH,
    height = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_HEIGHT,
    padding = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_PADDING,
    panelGap = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_PRICE_COLOR,
    adxColor = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_ADX_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_ADX_CROSS_EXTREME_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAdx = true,
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
    () => getLineAdxCrossExtremeFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAdxCrossExtremeLayout({
        data: cleaned,
        length,
        upperThreshold,
        lowerThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      upperThreshold,
      lowerThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineAdxCrossExtremeSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineAdxCrossExtremeSeriesId,
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
    seriesId: ChartLineAdxCrossExtremeSeriesId,
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
        data-section="chart-line-adx-cross-extreme-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAdxCrossExtremeChart(cleaned, {
      length,
      upperThreshold,
      lowerThreshold,
    });

  const showPrice = !hidden.has('price');
  const showAdxLine = !hidden.has('adx') && showAdx;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [0, lowerThreshold, 50, upperThreshold, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'ADX Cross Extreme chart'}
      aria-describedby={descId}
      data-section="chart-line-adx-cross-extreme"
      data-length={length}
      data-upper-threshold={upperThreshold}
      data-lower-threshold={lowerThreshold}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-neutral-count={layout.run.neutralCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-adx-cross-extreme-title"
      >
        {ariaLabel ?? 'ADX Cross Extreme chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-adx-cross-extreme-aria-desc"
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
        data-section="chart-line-adx-cross-extreme-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-adx-cross-extreme-grid">
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
                  data-section="chart-line-adx-cross-extreme-grid-line-price"
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
                  data-section="chart-line-adx-cross-extreme-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-adx-cross-extreme-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.upperY}
              x2={layout.innerRight}
              y2={layout.upperY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-adx-cross-extreme-band-upper"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.midY}
              x2={layout.innerRight}
              y2={layout.midY}
              stroke={midColor}
              strokeDasharray="2 4"
              data-section="chart-line-adx-cross-extreme-band-mid"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.lowerY}
              x2={layout.innerRight}
              y2={layout.lowerY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-adx-cross-extreme-band-lower"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-adx-cross-extreme-axes">
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
                  data-section="chart-line-adx-cross-extreme-tick-price"
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
                  data-section="chart-line-adx-cross-extreme-tick-osc"
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
            data-section="chart-line-adx-cross-extreme-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-adx-cross-extreme-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-adx-cross-extreme-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showAdxLine ? (
          <path
            d={layout.adxPath}
            stroke={adxColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-adx-cross-extreme-adx-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-adx-cross-extreme-crosses"
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
                data-section={`chart-line-adx-cross-extreme-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-adx-cross-extreme-overlay-crosses"
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
                data-section={`chart-line-adx-cross-extreme-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-adx-cross-extreme-hover-targets">
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
                data-section="chart-line-adx-cross-extreme-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-adx-cross-extreme-tooltip"
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
                  data-section="chart-line-adx-cross-extreme-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-cross-extreme-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-cross-extreme-tooltip-adx"
                >
                  adx{' '}
                  {tooltipSample.adx == null
                    ? '--'
                    : formatOsc(tooltipSample.adx)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-cross-extreme-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-cross-extreme-tooltip-counts"
                >
                  strong {layout.run.bullishCount} | weak{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-cross-extreme-tooltip-counts2"
                >
                  moderate {layout.run.neutralCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-cross-extreme-tooltip-crosses"
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
          data-section="chart-line-adx-cross-extreme-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | upper {upperThreshold} | lower{' '}
          {lowerThreshold} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-adx-cross-extreme-legend"
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
              { id: 'adx' as const, color: adxColor, label: 'ADX' },
            ] satisfies Array<{
              id: ChartLineAdxCrossExtremeSeriesId;
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

ChartLineAdxCrossExtreme.displayName = 'ChartLineAdxCrossExtreme';
