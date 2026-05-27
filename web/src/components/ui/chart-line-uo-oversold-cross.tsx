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
 * ChartLineUoOversoldCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Ultimate
 * Oscillator (UO) line in the bottom panel, marking bullish
 * (cross up through 30 = exit) / bearish (cross down through
 * 30 = entry) weighted multi-timeframe oversold threshold
 * trigger events. Threshold-30 crossover variant of the Larry
 * Williams Ultimate Oscillator family, sharing the bit-exact
 * UO pipeline with the `-zero-cross` / `-mid-cross` /
 * `-overbought-cross` siblings but tracking the canonical
 * oversold line (30) where institutional readers flag the move
 * as a potential reversal cue.
 *
 *   delta_i = close_i - close_{i-1}
 *   bp_i    = max(0,  delta_i)     (buying pressure)
 *   tr_i    = abs(delta_i)         (true range proxy)
 *   avg_n_i = sum(bp, n) / sum(tr, n)  (0 / 0 -> 0.5)
 *   uo_i    = 100 * (4 * avg_short + 2 * avg_mid + avg_long) / 7
 *   bullish (exit)  : prev uo <= 30 && cur uo > 30
 *   bearish (entry) : prev uo >= 30 && cur uo < 30
 *
 * Defaults: `short = 7`, `mid = 14`, `long = 28` (Williams 1976
 * canonical), `threshold = 30` (oversold line). Regime
 * classifier `bullish` (uo >= 30), `bearish` (uo < 30), `none`
 * (uo null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: uo = 50. 50 >= 30, so regime is
 *   `bullish` on every valid bar. cross count = 0. Verified
 *   across K = 0..1234.
 * - **LINEAR UP close = i**: uo = 100. 100 >= 30 -> regime
 *   `bullish`. 0 crosses (uo is constant and never re-crosses).
 * - **LINEAR DOWN close = -i**: uo = 0. 0 < 30 -> regime
 *   `bearish`. 0 crosses. The interesting trigger activity
 *   lives in transients (decline-then-rise pushes uo from 0
 *   through 30 -> bullish exit; rise-then-decline pulls uo
 *   from 100 through 30 -> bearish entry).
 */

export interface ChartLineUoOversoldCrossPoint {
  x: number;
  close: number;
}

export type ChartLineUoOversoldCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineUoOversoldCrossSeriesId = 'price' | 'uo';

export type ChartLineUoOversoldCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineUoOversoldCrossCross {
  index: number;
  x: number;
  kind: ChartLineUoOversoldCrossCrossKind;
}

export interface ChartLineUoOversoldCrossSample {
  index: number;
  x: number;
  close: number;
  uo: number | null;
  regime: ChartLineUoOversoldCrossRegime;
}

export interface ChartLineUoOversoldCrossRun {
  series: ChartLineUoOversoldCrossPoint[];
  short: number;
  mid: number;
  long: number;
  threshold: number;
  uoValues: Array<number | null>;
  samples: ChartLineUoOversoldCrossSample[];
  crosses: ChartLineUoOversoldCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineUoOversoldCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineUoOversoldCrossLayout {
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
  priceDots: ChartLineUoOversoldCrossDot[];
  uoPath: string;
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
    kind: ChartLineUoOversoldCrossCrossKind;
  }>;
  run: ChartLineUoOversoldCrossRun;
}

export interface ChartLineUoOversoldCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineUoOversoldCrossPoint[];
  short?: number;
  mid?: number;
  long?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  uoColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showUo?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineUoOversoldCrossSeriesId[];
  defaultHiddenSeries?: ChartLineUoOversoldCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineUoOversoldCrossSeriesId;
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

export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_SHORT = 7;
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_MID = 14;
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_LONG = 28;
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_THRESHOLD = 30;
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_UO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineUoOversoldCrossFinitePoints(
  data: readonly ChartLineUoOversoldCrossPoint[] | null | undefined,
): ChartLineUoOversoldCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineUoOversoldCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineUoOversoldCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce any finite threshold. */
export function normalizeLineUoOversoldCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

export interface LineUoOversoldCrossPressure {
  bp: Array<number | null>;
  tr: Array<number | null>;
}

export function applyLineUoOversoldCrossPressure(
  closes: readonly number[],
): LineUoOversoldCrossPressure {
  const bp: Array<number | null> = new Array(closes.length).fill(null);
  const tr: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i += 1) {
    const cur = closes[i];
    const prev = closes[i - 1];
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) continue;
    const delta = cur - prev;
    bp[i] = posZero(Math.max(0, delta));
    tr[i] = posZero(Math.abs(delta));
  }
  return { bp, tr };
}

export interface LineUoOversoldCrossChannels {
  uo: Array<number | null>;
  short: number;
  mid: number;
  long: number;
}

export function computeLineUoOversoldCross(
  series: readonly ChartLineUoOversoldCrossPoint[] | null | undefined,
  options: { short?: number; mid?: number; long?: number } = {},
): LineUoOversoldCrossChannels {
  const cleaned = getLineUoOversoldCrossFinitePoints(series);
  const short = normalizeLineUoOversoldCrossLength(
    options.short,
    DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_SHORT,
  );
  const mid = normalizeLineUoOversoldCrossLength(
    options.mid,
    DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_MID,
  );
  const long = normalizeLineUoOversoldCrossLength(
    options.long,
    DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_LONG,
  );
  if (cleaned.length === 0) {
    return { uo: [], short, mid, long };
  }

  const closes = cleaned.map((p) => p.close);
  const { bp, tr } = applyLineUoOversoldCrossPressure(closes);

  const ratio = (n: number, i: number): number | null => {
    let sumBp = 0;
    let sumTr = 0;
    let valid = true;
    if (i - n + 1 < 1) return null;
    for (let j = i - n + 1; j <= i; j += 1) {
      const b = bp[j];
      const t = tr[j];
      if (b == null || t == null) {
        valid = false;
        break;
      }
      sumBp += b;
      sumTr += t;
    }
    if (!valid) return null;
    if (sumTr === 0) return 0.5;
    return sumBp / sumTr;
  };

  const uo: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    if (i < long) continue;
    const as = ratio(short, i);
    const am = ratio(mid, i);
    const al = ratio(long, i);
    if (as == null || am == null || al == null) continue;
    const blended = (4 * as + 2 * am + al) / 7;
    uo[i] = posZero(100 * blended);
  }

  return { uo, short, mid, long };
}

export function classifyLineUoOversoldCrossRegime(
  uo: number | null,
  threshold: number,
): ChartLineUoOversoldCrossRegime {
  if (uo == null) return 'none';
  if (uo >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineUoOversoldCrossCrosses(
  series: readonly ChartLineUoOversoldCrossPoint[],
  uo: readonly (number | null)[],
  threshold: number,
): ChartLineUoOversoldCrossCross[] {
  const out: ChartLineUoOversoldCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = uo[i - 1];
    const cur = uo[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineUoOversoldCross(
  data: ChartLineUoOversoldCrossPoint[],
  options: {
    short?: number;
    mid?: number;
    long?: number;
    threshold?: number;
  } = {},
): ChartLineUoOversoldCrossRun {
  const cleaned = getLineUoOversoldCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const threshold = normalizeLineUoOversoldCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_THRESHOLD,
  );

  const channels = computeLineUoOversoldCross(series, {
    short: options.short ?? undefined,
    mid: options.mid ?? undefined,
    long: options.long ?? undefined,
  });

  const samples: ChartLineUoOversoldCrossSample[] = series.map((p, i) => {
    const v = channels.uo[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      uo: v,
      regime: classifyLineUoOversoldCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineUoOversoldCrossCrosses(
    series,
    channels.uo,
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

  const ok = series.length > channels.long;

  return {
    series,
    short: channels.short,
    mid: channels.mid,
    long: channels.long,
    threshold,
    uoValues: channels.uo,
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

export interface ComputeLineUoOversoldCrossLayoutOptions {
  data: ChartLineUoOversoldCrossPoint[];
  short?: number;
  mid?: number;
  long?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineUoOversoldCrossLayout(
  opts: ComputeLineUoOversoldCrossLayoutOptions,
): ChartLineUoOversoldCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_PANEL_GAP;
  const threshold = normalizeLineUoOversoldCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_THRESHOLD,
  );

  const run = runLineUoOversoldCross(opts.data, {
    short: opts.short ?? undefined,
    mid: opts.mid ?? undefined,
    long: opts.long ?? undefined,
    threshold,
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
      uoPath: '',
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
  const priceDots: ChartLineUoOversoldCrossDot[] = [];
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

  let uoPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.uo == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.uo);
    uoPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  uoPath = uoPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.uoValues[c.index] ?? threshold);
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
    uoPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineUoOversoldCrossChart(
  data: ChartLineUoOversoldCrossPoint[],
  options: {
    short?: number;
    mid?: number;
    long?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineUoOversoldCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const short = normalizeLineUoOversoldCrossLength(
    options.short,
    DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_SHORT,
  );
  const mid = normalizeLineUoOversoldCrossLength(
    options.mid,
    DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_MID,
  );
  const long = normalizeLineUoOversoldCrossLength(
    options.long,
    DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_LONG,
  );
  const threshold = normalizeLineUoOversoldCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_THRESHOLD,
  );
  return (
    `UO Oversold Cross chart over ${cleaned.length} bars ` +
    `(short ${short}, mid ${mid}, long ${long}, threshold ` +
    `${threshold}). Top panel renders the close with bullish ` +
    `(oversold K level cross up = exit) / bearish (cross down ` +
    `= entry) chevron overlays at every Ultimate Oscillator ` +
    `oversold threshold crossover; bottom panel renders the ` +
    `close-only UO line on a fixed 0 to 100 oscillator with ` +
    `the ${threshold} oversold reference band and marks UO ` +
    `level ${threshold} trigger events.`
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

export const ChartLineUoOversoldCross = forwardRef<
  HTMLDivElement,
  ChartLineUoOversoldCrossProps
>(function ChartLineUoOversoldCross(props, ref): ReactNode {
  const {
    data,
    short = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_SHORT,
    mid = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_MID,
    long = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_LONG,
    threshold = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_PRICE_COLOR,
    uoColor = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_UO_COLOR,
    bullishColor = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showUo = true,
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
    () => getLineUoOversoldCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineUoOversoldCrossLayout({
        data: cleaned,
        short,
        mid,
        long,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, short, mid, long, threshold, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineUoOversoldCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineUoOversoldCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineUoOversoldCrossSeriesId,
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
        data-section="chart-line-uo-oversold-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineUoOversoldCrossChart(cleaned, {
      short,
      mid,
      long,
      threshold,
    });

  const showPrice = !hidden.has('price');
  const showUoLine = !hidden.has('uo') && showUo;

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
      aria-label={ariaLabel ?? 'UO Oversold Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-uo-oversold-cross"
      data-short={short}
      data-mid={mid}
      data-long={long}
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
        data-section="chart-line-uo-oversold-cross-title"
      >
        {ariaLabel ?? 'UO Oversold Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-uo-oversold-cross-aria-desc"
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
        data-section="chart-line-uo-oversold-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-uo-oversold-cross-grid">
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
                  data-section="chart-line-uo-oversold-cross-grid-line-price"
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
                  data-section="chart-line-uo-oversold-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-uo-oversold-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-uo-oversold-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-uo-oversold-cross-axes">
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
                  data-section="chart-line-uo-oversold-cross-tick-price"
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
                  data-section="chart-line-uo-oversold-cross-tick-osc"
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
            data-section="chart-line-uo-oversold-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-uo-oversold-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-uo-oversold-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showUoLine ? (
          <path
            d={layout.uoPath}
            stroke={uoColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-uo-oversold-cross-uo-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-uo-oversold-cross-crosses"
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
                data-section={`chart-line-uo-oversold-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-uo-oversold-cross-overlay-crosses"
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
                data-section={`chart-line-uo-oversold-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-uo-oversold-cross-hover-targets">
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
                data-section="chart-line-uo-oversold-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-uo-oversold-cross-tooltip"
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
                  data-section="chart-line-uo-oversold-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-uo-oversold-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-uo-oversold-cross-tooltip-uo"
                >
                  UO{' '}
                  {tooltipSample.uo == null
                    ? '--'
                    : formatOsc(tooltipSample.uo)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-uo-oversold-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-uo-oversold-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-uo-oversold-cross-tooltip-entries"
                >
                  exits {layout.run.bullishCrossCount} | entries{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-uo-oversold-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-uo-oversold-cross-tooltip-periods"
                >
                  s/m/l {layout.run.short} / {layout.run.mid} /{' '}
                  {layout.run.long} | T {layout.run.threshold}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-uo-oversold-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          short {short} | mid {mid} | long {long} | threshold {threshold} |
          crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-uo-oversold-cross-legend"
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
              { id: 'uo' as const, color: uoColor, label: 'UO' },
            ] satisfies Array<{
              id: ChartLineUoOversoldCrossSeriesId;
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

ChartLineUoOversoldCross.displayName = 'ChartLineUoOversoldCross';
