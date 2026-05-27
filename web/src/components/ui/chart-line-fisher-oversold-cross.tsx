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
 * ChartLineFisherOversoldCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Fisher Transform
 * line in the bottom panel, marking bullish (cross up through
 * the oversold threshold -2.5) / bearish (cross down through
 * -2.5) Gaussian-normalised momentum oversold trigger events.
 * Oversold-threshold cross variant of the John Ehlers Fisher
 * Transform family that flags the discrete Fisher crossing of
 * the lower extreme reference line.
 *
 * The Fisher Transform takes a price series, normalises it to a
 * `[-1, 1]` channel via the rolling min/max of a fixed window,
 * recursively smooths the channel, and applies an inverse
 * hyperbolic tangent so the resulting distribution is closer to
 * Gaussian. Extreme values become numerically separable from the
 * neutral baseline -- making oversold-threshold crossovers sharp
 * triggers for momentum capitulation / reversal scenarios.
 *
 *   hi[i]  = max(close[i-length+1..i])
 *   lo[i]  = min(close[i-length+1..i])
 *   raw[i] = hi == lo ? 0 : 2 * (close - lo) / (hi - lo) - 1
 *   x[i]   = clamp(0.33 * raw + 0.67 * x[i-1], -0.999, 0.999)
 *   f[i]   = 0.5 * ln((1 + x) / (1 - x)) + 0.5 * f[i-1]
 *
 * Defaults: `length = 10` (Ehlers canonical window),
 * `threshold = -2.5` (canonical oversold line). Regime classifier
 * `bullish` (fisher >= -2.5), `bearish` (fisher < -2.5), `none`
 * (fisher null). Bearish cross signals momentum has pushed below
 * the lower extreme; bullish cross signals exit from the oversold
 * zone.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: hi == lo every window, so raw = 0 every
 *   bar, x stays at 0, fisher stays at 0. fisher = 0 sits well
 *   above the threshold -2.5 -- regime `bullish` (0 >= -2.5,
 *   mirror of the overbought variant where 0 < 2.5 gave bearish).
 *   cross count = 0. Verified across K = 0..1234.
 * - **LINEAR UP close = i**: close = hi every bar after warmup,
 *   raw = 1, x converges to the clamp 0.999, fisher to ~ 7.6.
 *   fisher stays well above -2.5 the entire run -- regime
 *   `bullish`, 0 crosses.
 * - **LINEAR DOWN close = -i**: close = lo every bar, raw = -1,
 *   x converges to -0.999, fisher to ~ -7.6. At some bar after
 *   warmup the fisher crosses down through -2.5 -- emitting one
 *   bearish cross -- then settles bearish thereafter.
 */

export interface ChartLineFisherOversoldCrossPoint {
  x: number;
  close: number;
}

export type ChartLineFisherOversoldCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineFisherOversoldCrossSeriesId = 'price' | 'fisher';

export type ChartLineFisherOversoldCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineFisherOversoldCrossCross {
  index: number;
  x: number;
  kind: ChartLineFisherOversoldCrossCrossKind;
}

export interface ChartLineFisherOversoldCrossSample {
  index: number;
  x: number;
  close: number;
  fisher: number | null;
  regime: ChartLineFisherOversoldCrossRegime;
}

export interface ChartLineFisherOversoldCrossRun {
  series: ChartLineFisherOversoldCrossPoint[];
  length: number;
  threshold: number;
  xValues: Array<number | null>;
  fisherValues: Array<number | null>;
  samples: ChartLineFisherOversoldCrossSample[];
  crosses: ChartLineFisherOversoldCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineFisherOversoldCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineFisherOversoldCrossLayout {
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
  priceDots: ChartLineFisherOversoldCrossDot[];
  fisherPath: string;
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
    kind: ChartLineFisherOversoldCrossCrossKind;
  }>;
  run: ChartLineFisherOversoldCrossRun;
}

export interface ChartLineFisherOversoldCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineFisherOversoldCrossPoint[];
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
  fisherColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFisher?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineFisherOversoldCrossSeriesId[];
  defaultHiddenSeries?: ChartLineFisherOversoldCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineFisherOversoldCrossSeriesId;
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

export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_LENGTH = 10;
export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_THRESHOLD = -2.5;
export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_FISHER_COLOR =
  '#7c3aed';
export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_MID_COLOR = '#cbd5e1';

const FISHER_CLAMP = 0.999;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

const clamp = (value: number, lo: number, hi: number): number =>
  value < lo ? lo : value > hi ? hi : value;

/** Keep only points with finite x / close. */
export function getLineFisherOversoldCrossFinitePoints(
  data:
    | readonly ChartLineFisherOversoldCrossPoint[]
    | null
    | undefined,
): ChartLineFisherOversoldCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineFisherOversoldCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineFisherOversoldCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce any finite threshold. */
export function normalizeLineFisherOversoldCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

/**
 * Rolling normalised channel `x` computed from the close-only
 * rolling min/max range and recursively smoothed with weights
 * `0.33 / 0.67`. Returns null for indices `< length - 1`.
 */
export function applyLineFisherOversoldCrossNormalize(
  closes: readonly number[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (length < 1 || closes.length === 0) return out;
  let prev = 0;
  for (let i = 0; i < closes.length; i += 1) {
    if (i < length - 1) continue;
    let winHi = -Infinity;
    let winLo = Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = closes[j];
      if (!isFiniteNumber(v)) {
        winHi = NaN;
        winLo = NaN;
        break;
      }
      if (v > winHi) winHi = v;
      if (v < winLo) winLo = v;
    }
    if (!Number.isFinite(winHi) || !Number.isFinite(winLo)) continue;
    const cur = closes[i];
    if (!isFiniteNumber(cur)) continue;
    let raw = 0;
    if (winHi !== winLo) {
      raw = 2 * ((cur - winLo) / (winHi - winLo)) - 1;
    }
    const next = clamp(0.33 * raw + 0.67 * prev, -FISHER_CLAMP, FISHER_CLAMP);
    out[i] = posZero(next);
    prev = next;
  }
  return out;
}

export interface LineFisherOversoldCrossChannels {
  x: Array<number | null>;
  fisher: Array<number | null>;
  length: number;
}

export function computeLineFisherOversoldCross(
  series:
    | readonly ChartLineFisherOversoldCrossPoint[]
    | null
    | undefined,
  options: { length?: number } = {},
): LineFisherOversoldCrossChannels {
  const cleaned = getLineFisherOversoldCrossFinitePoints(series);
  const length = normalizeLineFisherOversoldCrossLength(
    options.length,
    DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_LENGTH,
  );
  if (cleaned.length === 0) {
    return { x: [], fisher: [], length };
  }
  const closes = cleaned.map((p) => p.close);
  const xs = applyLineFisherOversoldCrossNormalize(closes, length);
  const fisher: Array<number | null> = new Array(closes.length).fill(null);
  let prev = 0;
  for (let i = 0; i < closes.length; i += 1) {
    const xi = xs[i];
    if (xi == null) continue;
    const cur = 0.5 * Math.log((1 + xi) / (1 - xi)) + 0.5 * prev;
    fisher[i] = posZero(cur);
    prev = cur;
  }
  return { x: xs, fisher, length };
}

export function classifyLineFisherOversoldCrossRegime(
  fisher: number | null,
  threshold: number,
): ChartLineFisherOversoldCrossRegime {
  if (fisher == null) return 'none';
  if (fisher >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineFisherOversoldCrossCrosses(
  series: readonly ChartLineFisherOversoldCrossPoint[],
  fisher: readonly (number | null)[],
  threshold: number,
): ChartLineFisherOversoldCrossCross[] {
  const out: ChartLineFisherOversoldCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = fisher[i - 1];
    const cur = fisher[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineFisherOversoldCross(
  data: ChartLineFisherOversoldCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): ChartLineFisherOversoldCrossRun {
  const cleaned = getLineFisherOversoldCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const threshold = normalizeLineFisherOversoldCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_THRESHOLD,
  );
  const channels = computeLineFisherOversoldCross(series, {
    length: options.length ?? undefined,
  });

  const samples: ChartLineFisherOversoldCrossSample[] = series.map(
    (p, i) => {
      const v = channels.fisher[i] ?? null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        fisher: v,
        regime: classifyLineFisherOversoldCrossRegime(v, threshold),
      };
    },
  );

  const crosses = detectLineFisherOversoldCrossCrosses(
    series,
    channels.fisher,
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

  const ok = series.length > channels.length;

  return {
    series,
    length: channels.length,
    threshold,
    xValues: channels.x,
    fisherValues: channels.fisher,
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

export interface ComputeLineFisherOversoldCrossLayoutOptions {
  data: ChartLineFisherOversoldCrossPoint[];
  length?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineFisherOversoldCrossLayout(
  opts: ComputeLineFisherOversoldCrossLayoutOptions,
): ChartLineFisherOversoldCrossLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_PANEL_GAP;
  const threshold = normalizeLineFisherOversoldCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_THRESHOLD,
  );

  const run = runLineFisherOversoldCross(opts.data, {
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
  for (const v of run.fisherValues) {
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
      fisherPath: '',
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
  const priceDots: ChartLineFisherOversoldCrossDot[] = [];
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

  let fisherPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.fisher == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.fisher);
    fisherPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  fisherPath = fisherPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.fisherValues[c.index] ?? threshold);
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
    fisherPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineFisherOversoldCrossChart(
  data: ChartLineFisherOversoldCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineFisherOversoldCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineFisherOversoldCrossLength(
    options.length,
    DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_LENGTH,
  );
  const threshold = normalizeLineFisherOversoldCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_THRESHOLD,
  );
  return (
    `Fisher Oversold Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, threshold ${threshold}). Top panel ` +
    `renders the close with bullish (Gaussian-normalised momentum ` +
    `oversold cross up) / bearish (cross down) chevron overlays ` +
    `at every Fisher Transform oversold threshold cross; bottom ` +
    `panel renders the close-only Fisher line on an auto-fitted ` +
    `oscillator with the oversold ${threshold} reference band and ` +
    `marks Fisher level ${threshold} oversold trigger events.`
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

export const ChartLineFisherOversoldCross = forwardRef<
  HTMLDivElement,
  ChartLineFisherOversoldCrossProps
>(function ChartLineFisherOversoldCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_LENGTH,
    threshold = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_PRICE_COLOR,
    fisherColor = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_FISHER_COLOR,
    bullishColor = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_FISHER_OVERSOLD_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showFisher = true,
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
    () => getLineFisherOversoldCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineFisherOversoldCrossLayout({
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
    ChartLineFisherOversoldCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineFisherOversoldCrossSeriesId,
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
    seriesId: ChartLineFisherOversoldCrossSeriesId,
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
        data-section="chart-line-fisher-oversold-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineFisherOversoldCrossChart(cleaned, { length, threshold });

  const showPrice = !hidden.has('price');
  const showFisherLine = !hidden.has('fisher') && showFisher;

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
      aria-label={ariaLabel ?? 'Fisher Oversold Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-fisher-oversold-cross"
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
        data-section="chart-line-fisher-oversold-cross-title"
      >
        {ariaLabel ?? 'Fisher Oversold Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-fisher-oversold-cross-aria-desc"
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
        data-section="chart-line-fisher-oversold-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-fisher-oversold-cross-grid">
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
                  data-section="chart-line-fisher-oversold-cross-grid-line-price"
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
                  data-section="chart-line-fisher-oversold-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-fisher-oversold-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-fisher-oversold-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-fisher-oversold-cross-axes">
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
                  data-section="chart-line-fisher-oversold-cross-tick-price"
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
                  data-section="chart-line-fisher-oversold-cross-tick-osc"
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
            data-section="chart-line-fisher-oversold-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-fisher-oversold-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-fisher-oversold-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showFisherLine ? (
          <path
            d={layout.fisherPath}
            stroke={fisherColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fisher-oversold-cross-fisher-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-fisher-oversold-cross-crosses"
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
                data-section={`chart-line-fisher-oversold-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-fisher-oversold-cross-overlay-crosses"
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
                data-section={`chart-line-fisher-oversold-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-fisher-oversold-cross-hover-targets">
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
                data-section="chart-line-fisher-oversold-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-fisher-oversold-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={232}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-oversold-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-oversold-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-oversold-cross-tooltip-fisher"
                >
                  Fisher{' '}
                  {tooltipSample.fisher == null
                    ? '--'
                    : formatOsc(tooltipSample.fisher)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-oversold-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-oversold-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-oversold-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-oversold-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-oversold-cross-tooltip-length"
                >
                  length {layout.run.length}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-fisher-oversold-cross-badge"
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
          data-section="chart-line-fisher-oversold-cross-legend"
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
              { id: 'fisher' as const, color: fisherColor, label: 'Fisher' },
            ] satisfies Array<{
              id: ChartLineFisherOversoldCrossSeriesId;
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

ChartLineFisherOversoldCross.displayName = 'ChartLineFisherOversoldCross';
