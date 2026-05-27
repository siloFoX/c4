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
 * ChartLineSqueezeCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the TTM Squeeze momentum oscillator
 * in the bottom panel, marking bullish / bearish cross trigger
 * events when a Bollinger-inside-Keltner squeeze releases. Cross
 * markers are also painted as arrow overlays on the price panel
 * for direct charting-overlay use.
 *
 * Simplified close-only TTM Squeeze:
 *
 *   TR[i]       = i === 0 ? 0 : |close[i] - close[i-1]|
 *   sma[i]      = SMA(close, length)
 *   stddev[i]   = sample stddev of close window of length
 *   atr[i]      = Wilder smooth of TR over length
 *   bbWidth     = bbMult * stddev[i]
 *   kcWidth     = kcMult * atr[i]
 *   squeezeOn   = bbWidth <= kcWidth
 *   momentum    = close[i] - sma[i]
 *   release     = previous squeezeOn -> current squeezeOn
 *                 transitions from true to false
 *   bullish     : release && momentum > 0
 *   bearish     : release && momentum < 0
 *
 * Defaults: `length = 20`, `bbMult = 2`, `kcMult = 1.5`
 * (canonical TTM Squeeze). Regime classifier: `on` (squeezeOn
 * currently true), `bullish` (most recent release fired with
 * positive momentum), `bearish` (most recent release fired with
 * negative momentum), `none` (warmup / null).
 *
 * Bit-exact anchors:
 *
 * - **CONST close = K**: every TR = 0, stddev = 0, ATR = 0 ->
 *   bbWidth = 0 and kcWidth = 0 -> `squeezeOn = (0 <= 0) =
 *   true` forever. No release transitions trigger -> cross
 *   count = 0. momentum = K - K = 0 every bar -> regime `on`
 *   after warmup.
 * - **LINEAR UP step > 0**: stddev > 0 and ATR is a positive
 *   constant; the canonical multipliers leave bbWidth far
 *   above kcWidth so `squeezeOn = false` from the very first
 *   computable bar. Since prev squeezeOn was never true after
 *   warmup, no release event fires -> cross count = 0.
 * - **LINEAR DOWN step < 0**: symmetric, squeezeOn stays
 *   false, no release events -> cross count = 0.
 */

export interface ChartLineSqueezeCrossPoint {
  x: number;
  close: number;
}

export type ChartLineSqueezeCrossRegime =
  | 'on'
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineSqueezeCrossSeriesId =
  | 'price'
  | 'momentum'
  | 'squeeze';

export type ChartLineSqueezeCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineSqueezeCrossCross {
  index: number;
  x: number;
  kind: ChartLineSqueezeCrossCrossKind;
}

export interface ChartLineSqueezeCrossSample {
  index: number;
  x: number;
  close: number;
  momentum: number | null;
  squeezeOn: boolean | null;
  regime: ChartLineSqueezeCrossRegime;
}

export interface ChartLineSqueezeCrossRun {
  series: ChartLineSqueezeCrossPoint[];
  length: number;
  bbMult: number;
  kcMult: number;
  momentumValues: Array<number | null>;
  squeezeFlags: Array<boolean | null>;
  samples: ChartLineSqueezeCrossSample[];
  crosses: ChartLineSqueezeCrossCross[];
  onCount: number;
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineSqueezeCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSqueezeCrossLayout {
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
  priceDots: ChartLineSqueezeCrossDot[];
  momentumPath: string;
  squeezeMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cy: number;
  }>;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineSqueezeCrossCrossKind;
  }>;
  run: ChartLineSqueezeCrossRun;
}

export interface ChartLineSqueezeCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSqueezeCrossPoint[];
  length?: number;
  bbMult?: number;
  kcMult?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  momentumColor?: string;
  squeezeColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMomentum?: boolean;
  showSqueezeMarkers?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSqueezeCrossSeriesId[];
  defaultHiddenSeries?: ChartLineSqueezeCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSqueezeCrossSeriesId;
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

export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_LENGTH = 20;
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_BB_MULT = 2;
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_KC_MULT = 1.5;
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_MOMENTUM_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_SQUEEZE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SQUEEZE_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineSqueezeCrossFinitePoints(
  data: readonly ChartLineSqueezeCrossPoint[] | null | undefined,
): ChartLineSqueezeCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSqueezeCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineSqueezeCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive finite multiplier. */
export function normalizeLineSqueezeCrossMult(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value > 0) return value;
  return fallback;
}

/** Wilder smoothing with CONST short-circuit. */
export function applyLineSqueezeCrossWilder(
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

export interface LineSqueezeCrossChannels {
  momentum: Array<number | null>;
  squeezeOn: Array<boolean | null>;
}

export function computeLineSqueezeCross(
  series: readonly ChartLineSqueezeCrossPoint[] | null | undefined,
  options: { length?: number; bbMult?: number; kcMult?: number } = {},
): LineSqueezeCrossChannels {
  const cleaned = getLineSqueezeCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { momentum: [], squeezeOn: [] };
  }
  const length = normalizeLineSqueezeCrossLength(
    options.length,
    DEFAULT_CHART_LINE_SQUEEZE_CROSS_LENGTH,
  );
  const bbMult = normalizeLineSqueezeCrossMult(
    options.bbMult,
    DEFAULT_CHART_LINE_SQUEEZE_CROSS_BB_MULT,
  );
  const kcMult = normalizeLineSqueezeCrossMult(
    options.kcMult,
    DEFAULT_CHART_LINE_SQUEEZE_CROSS_KC_MULT,
  );

  const closes = cleaned.map((p) => p.close);

  // SMA + stddev sliding window.
  const momentum: Array<number | null> = new Array(closes.length).fill(null);
  const squeezeOn: Array<boolean | null> = new Array(closes.length).fill(
    null,
  );

  // ATR via Wilder smooth of TR.
  const tr: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i += 1) {
    tr[i] = Math.abs(closes[i]! - closes[i - 1]!);
  }
  const atrFromIdx1 = applyLineSqueezeCrossWilder(tr.slice(1), length);
  const atr: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < atrFromIdx1.length; i += 1) {
    atr[i + 1] = atrFromIdx1[i] ?? null;
  }

  for (let i = length - 1; i < closes.length; i += 1) {
    let sum = 0;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let k = 0; k < length; k += 1) {
      const v = closes[i - k]!;
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    const sma =
      winMin === winMax && Number.isFinite(winMin)
        ? winMin
        : posZero(sum / length);
    const mom = posZero(closes[i]! - sma);
    momentum[i] = mom;
    // Sample standard deviation.
    let sqsum = 0;
    for (let k = 0; k < length; k += 1) {
      const d = closes[i - k]! - sma;
      sqsum += d * d;
    }
    const variance = sqsum / length;
    const std =
      winMin === winMax && Number.isFinite(winMin) ? 0 : Math.sqrt(variance);
    const a = atr[i];
    if (a == null) {
      squeezeOn[i] = null;
    } else {
      squeezeOn[i] = std * bbMult <= a * kcMult;
    }
  }

  return { momentum, squeezeOn };
}

export function classifyLineSqueezeCrossRegime(
  squeezeOn: boolean | null,
  lastReleaseKind: 'bullish' | 'bearish' | null,
): ChartLineSqueezeCrossRegime {
  if (squeezeOn == null) return 'none';
  if (squeezeOn) return 'on';
  if (lastReleaseKind === 'bullish') return 'bullish';
  if (lastReleaseKind === 'bearish') return 'bearish';
  return 'on';
}

export function detectLineSqueezeCrossCrosses(
  series: readonly ChartLineSqueezeCrossPoint[],
  squeezeOn: readonly (boolean | null)[],
  momentum: readonly (number | null)[],
): ChartLineSqueezeCrossCross[] {
  const out: ChartLineSqueezeCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = squeezeOn[i - 1];
    const cur = squeezeOn[i];
    if (prev !== true || cur !== false) continue;
    const m = momentum[i];
    if (m == null) continue;
    if (m > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (m < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineSqueezeCross(
  data: ChartLineSqueezeCrossPoint[],
  options: { length?: number; bbMult?: number; kcMult?: number } = {},
): ChartLineSqueezeCrossRun {
  const cleaned = getLineSqueezeCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineSqueezeCrossLength(
    options.length,
    DEFAULT_CHART_LINE_SQUEEZE_CROSS_LENGTH,
  );
  const bbMult = normalizeLineSqueezeCrossMult(
    options.bbMult,
    DEFAULT_CHART_LINE_SQUEEZE_CROSS_BB_MULT,
  );
  const kcMult = normalizeLineSqueezeCrossMult(
    options.kcMult,
    DEFAULT_CHART_LINE_SQUEEZE_CROSS_KC_MULT,
  );

  const channels = computeLineSqueezeCross(series, {
    length,
    bbMult,
    kcMult,
  });

  const crosses = detectLineSqueezeCrossCrosses(
    series,
    channels.squeezeOn,
    channels.momentum,
  );

  // Build samples with regime tracking based on most recent release.
  let lastReleaseKind: 'bullish' | 'bearish' | null = null;
  let crossIdx = 0;
  const samples: ChartLineSqueezeCrossSample[] = series.map((p, i) => {
    if (
      crossIdx < crosses.length &&
      crosses[crossIdx]!.index === i
    ) {
      lastReleaseKind = crosses[crossIdx]!.kind;
      crossIdx += 1;
    }
    const squeezeOn = channels.squeezeOn[i] ?? null;
    const regime = classifyLineSqueezeCrossRegime(squeezeOn, lastReleaseKind);
    return {
      index: i,
      x: p.x,
      close: p.close,
      momentum: channels.momentum[i] ?? null,
      squeezeOn,
      regime,
    };
  });

  let onCount = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'on') onCount += 1;
    else if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length;

  return {
    series,
    length,
    bbMult,
    kcMult,
    momentumValues: channels.momentum,
    squeezeFlags: channels.squeezeOn,
    samples,
    crosses,
    onCount,
    bullishCount,
    bearishCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineSqueezeCrossLayoutOptions {
  data: ChartLineSqueezeCrossPoint[];
  length?: number;
  bbMult?: number;
  kcMult?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineSqueezeCrossLayout(
  opts: ComputeLineSqueezeCrossLayoutOptions,
): ChartLineSqueezeCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_SQUEEZE_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_SQUEEZE_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_SQUEEZE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_SQUEEZE_CROSS_PANEL_GAP;

  const run = runLineSqueezeCross(opts.data, {
    length: opts.length ?? undefined,
    bbMult: opts.bbMult ?? undefined,
    kcMult: opts.kcMult ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

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
      momentumPath: '',
      squeezeMarkers: [],
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
      zeroY: (oscTop + oscBottom) / 2,
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

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const s of run.samples) {
    if (s.momentum == null) continue;
    if (s.momentum < oscMin) oscMin = s.momentum;
    if (s.momentum > oscMax) oscMax = s.momentum;
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = -1;
    oscMax = 1;
  }
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }
  if (oscMin > 0) oscMin = 0;
  if (oscMax < 0) oscMax = 0;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syOsc = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

  let pricePath = '';
  const priceDots: ChartLineSqueezeCrossDot[] = [];
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

  let momentumPath = '';
  let momentumFirst = true;
  for (const s of run.samples) {
    if (s.momentum == null) {
      momentumFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.momentum);
    momentumPath += `${momentumFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    momentumFirst = false;
  }
  momentumPath = momentumPath.trim();

  const squeezeMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cy: number;
  }> = [];
  for (const s of run.samples) {
    if (s.squeezeOn !== true) continue;
    const cx = sx(s.x);
    const cy = oscBottom - 4;
    squeezeMarkers.push({ index: s.index, x: s.x, cx, cy });
  }

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOsc(run.momentumValues[c.index] ?? 0);
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
    momentumPath,
    squeezeMarkers,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY: syOsc(0),
    crossMarkers,
    run,
  };
}

export function describeLineSqueezeCrossChart(
  data: ChartLineSqueezeCrossPoint[],
  options: { length?: number; bbMult?: number; kcMult?: number } = {},
): string {
  const cleaned = getLineSqueezeCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineSqueezeCrossLength(
    options.length,
    DEFAULT_CHART_LINE_SQUEEZE_CROSS_LENGTH,
  );
  const bbMult = normalizeLineSqueezeCrossMult(
    options.bbMult,
    DEFAULT_CHART_LINE_SQUEEZE_CROSS_BB_MULT,
  );
  const kcMult = normalizeLineSqueezeCrossMult(
    options.kcMult,
    DEFAULT_CHART_LINE_SQUEEZE_CROSS_KC_MULT,
  );
  return (
    `TTM Squeeze Cross chart over ${cleaned.length} bars (length ` +
    `${length}, bbMult ${bbMult}, kcMult ${kcMult}). Top panel ` +
    `renders the close with bullish / bearish arrow overlays at ` +
    `every squeeze release; bottom panel renders the momentum ` +
    `oscillator (close - SMA) with squeeze-on markers and marks ` +
    `Bollinger-inside-Keltner squeeze release events.`
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

export const ChartLineSqueezeCross = forwardRef<
  HTMLDivElement,
  ChartLineSqueezeCrossProps
>(function ChartLineSqueezeCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_SQUEEZE_CROSS_LENGTH,
    bbMult = DEFAULT_CHART_LINE_SQUEEZE_CROSS_BB_MULT,
    kcMult = DEFAULT_CHART_LINE_SQUEEZE_CROSS_KC_MULT,
    width = DEFAULT_CHART_LINE_SQUEEZE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_SQUEEZE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_SQUEEZE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_SQUEEZE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_SQUEEZE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SQUEEZE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SQUEEZE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SQUEEZE_CROSS_PRICE_COLOR,
    momentumColor = DEFAULT_CHART_LINE_SQUEEZE_CROSS_MOMENTUM_COLOR,
    squeezeColor = DEFAULT_CHART_LINE_SQUEEZE_CROSS_SQUEEZE_COLOR,
    bullishColor = DEFAULT_CHART_LINE_SQUEEZE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_SQUEEZE_CROSS_BEARISH_COLOR,
    zeroColor = DEFAULT_CHART_LINE_SQUEEZE_CROSS_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_SQUEEZE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_SQUEEZE_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMomentum = true,
    showSqueezeMarkers = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
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
    () => getLineSqueezeCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineSqueezeCrossLayout({
        data: cleaned,
        length,
        bbMult,
        kcMult,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, bbMult, kcMult, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineSqueezeCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineSqueezeCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineSqueezeCrossSeriesId,
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
        data-section="chart-line-squeeze-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineSqueezeCrossChart(cleaned, { length, bbMult, kcMult });

  const showPrice = !hidden.has('price');
  const showMomentumLine = !hidden.has('momentum') && showMomentum;
  const showSqueezeMarkersLine =
    !hidden.has('squeeze') && showSqueezeMarkers;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickOscValues.push(
      layout.oscMin + ((layout.oscMax - layout.oscMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'TTM Squeeze Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-squeeze-cross"
      data-length={length}
      data-bb-mult={bbMult}
      data-kc-mult={kcMult}
      data-total-points={cleaned.length}
      data-on-count={layout.run.onCount}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-squeeze-cross-title"
      >
        {ariaLabel ?? 'TTM Squeeze Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-squeeze-cross-aria-desc"
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
        data-section="chart-line-squeeze-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-squeeze-cross-grid">
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
                  data-section="chart-line-squeeze-cross-grid-line-price"
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
                  data-section="chart-line-squeeze-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-squeeze-cross-axes">
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
                  data-section="chart-line-squeeze-cross-tick-price"
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
                  data-section="chart-line-squeeze-cross-tick-osc"
                >
                  {formatOsc(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroY}
            x2={layout.innerRight}
            y2={layout.zeroY}
            stroke={zeroColor}
            strokeDasharray="2 4"
            data-section="chart-line-squeeze-cross-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-squeeze-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-squeeze-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-squeeze-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showMomentumLine ? (
          <path
            d={layout.momentumPath}
            stroke={momentumColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-squeeze-cross-momentum-path"
          />
        ) : null}

        {showSqueezeMarkersLine ? (
          <g
            data-section="chart-line-squeeze-cross-squeeze-markers"
            role="group"
            aria-label="squeeze on markers"
          >
            {layout.squeezeMarkers.map((m) => (
              <circle
                key={`squeeze-${m.index}`}
                cx={m.cx}
                cy={m.cy}
                r={3}
                fill={squeezeColor}
                data-section="chart-line-squeeze-cross-squeeze-marker"
              />
            ))}
          </g>
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-squeeze-cross-crosses"
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
                data-section={`chart-line-squeeze-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-squeeze-cross-overlay-crosses"
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
                data-section={`chart-line-squeeze-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-squeeze-cross-hover-targets">
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
                data-section="chart-line-squeeze-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-squeeze-cross-tooltip"
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
                  data-section="chart-line-squeeze-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-squeeze-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-squeeze-cross-tooltip-momentum"
                >
                  momentum{' '}
                  {tooltipSample.momentum == null
                    ? '--'
                    : formatOsc(tooltipSample.momentum)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-squeeze-cross-tooltip-squeeze"
                >
                  squeeze{' '}
                  {tooltipSample.squeezeOn == null
                    ? '--'
                    : tooltipSample.squeezeOn
                      ? 'on'
                      : 'off'}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-squeeze-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-squeeze-cross-tooltip-counts"
                >
                  on {layout.run.onCount} | bullish{' '}
                  {layout.run.bullishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-squeeze-cross-tooltip-counts2"
                >
                  bearish {layout.run.bearishCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-squeeze-cross-tooltip-crosses"
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
          data-section="chart-line-squeeze-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | bb {bbMult} | kc {kcMult} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-squeeze-cross-legend"
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
                id: 'momentum' as const,
                color: momentumColor,
                label: 'momentum',
              },
              {
                id: 'squeeze' as const,
                color: squeezeColor,
                label: 'squeeze',
              },
            ] satisfies Array<{
              id: ChartLineSqueezeCrossSeriesId;
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

ChartLineSqueezeCross.displayName = 'ChartLineSqueezeCross';
