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
 * ChartLineWilliamsRCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the close-only Williams percent R
 * line alongside its EMA-smoothed signal in the bottom panel,
 * marking bullish / bearish %R vs signal cross trigger events.
 * Signal-cross variant of the Williams %R family that flags
 * overbought / oversold regime transition trigger events
 * distinct from the canonical -80 / -20 line readings.
 *
 *   hi[i]     = max(close[i-n+1..i])
 *   lo[i]     = min(close[i-n+1..i])
 *   range[i]  = hi - lo
 *   wr[i]     = range > 0
 *                 ? ((hi - close) / range) * -100
 *                 : -50  (neutral fallback when range collapses)
 *   signal[i] = EMA(wr, signalLength)
 *   bullish  : (wr - signal) crosses up   (prev <= 0, cur > 0)
 *   bearish  : (wr - signal) crosses down (prev >= 0, cur < 0)
 *
 * Defaults: `length = 14` (canonical Williams %R window),
 * `signalLength = 3`. Range is fixed to -100..0 (overbought
 * at -20, oversold at -80, mid at -50). Regime classifier
 * `bullish` (wr > signal), `bearish` (wr < signal), `neutral`
 * (wr === signal), `none` (either null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: range = hi - lo = 0 every bar -> wr =
 *   -50 neutral fallback. signal EMA of -50s = -50 via the
 *   `min === max` precision short-circuit. wr === signal ->
 *   regime `neutral`, cross count = 0. Verified across K =
 *   0..1234.
 */

export interface ChartLineWilliamsRCrossPoint {
  x: number;
  close: number;
}

export type ChartLineWilliamsRCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineWilliamsRCrossSeriesId = 'price' | 'wr' | 'signal';

export type ChartLineWilliamsRCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineWilliamsRCrossCross {
  index: number;
  x: number;
  kind: ChartLineWilliamsRCrossCrossKind;
}

export interface ChartLineWilliamsRCrossSample {
  index: number;
  x: number;
  close: number;
  wr: number | null;
  signal: number | null;
  regime: ChartLineWilliamsRCrossRegime;
}

export interface ChartLineWilliamsRCrossRun {
  series: ChartLineWilliamsRCrossPoint[];
  length: number;
  signalLength: number;
  wrValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineWilliamsRCrossSample[];
  crosses: ChartLineWilliamsRCrossCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineWilliamsRCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineWilliamsRCrossLayout {
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
  priceDots: ChartLineWilliamsRCrossDot[];
  wrPath: string;
  signalPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  midY: number;
  overboughtY: number;
  oversoldY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineWilliamsRCrossCrossKind;
  }>;
  run: ChartLineWilliamsRCrossRun;
}

export interface ChartLineWilliamsRCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineWilliamsRCrossPoint[];
  length?: number;
  signalLength?: number;
  overbought?: number;
  oversold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  wrColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showWr?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineWilliamsRCrossSeriesId[];
  defaultHiddenSeries?: ChartLineWilliamsRCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineWilliamsRCrossSeriesId;
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

export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIGNAL_LENGTH = 3;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_OVERBOUGHT = -20;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_OVERSOLD = -80;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_WR_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineWilliamsRCrossFinitePoints(
  data: readonly ChartLineWilliamsRCrossPoint[] | null | undefined,
): ChartLineWilliamsRCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineWilliamsRCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineWilliamsRCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** SMA-seeded EMA with the precision fix. */
export function applyLineWilliamsRCrossEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);

  let seedSum = 0;
  let seedCount = 0;
  let winMin = Infinity;
  let winMax = -Infinity;
  for (let i = 0; i < values.length && seedCount < length; i += 1) {
    const v = values[i];
    if (v == null) {
      seedSum = 0;
      seedCount = 0;
      winMin = Infinity;
      winMax = -Infinity;
      continue;
    }
    seedSum += v;
    seedCount += 1;
    if (v < winMin) winMin = v;
    if (v > winMax) winMax = v;
    if (seedCount === length) {
      const seed =
        winMin === winMax && Number.isFinite(winMin)
          ? winMin
          : posZero(seedSum / length);
      out[i] = seed;
      let prev = seed;
      for (let j = i + 1; j < values.length; j += 1) {
        const nv = values[j];
        if (nv == null) {
          break;
        }
        const next =
          nv === prev ? nv : posZero(alpha * nv + (1 - alpha) * prev);
        out[j] = next;
        prev = next;
      }
      break;
    }
  }
  return out;
}

export interface LineWilliamsRCrossChannels {
  wr: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineWilliamsRCross(
  series: readonly ChartLineWilliamsRCrossPoint[] | null | undefined,
  options: { length?: number; signalLength?: number } = {},
): LineWilliamsRCrossChannels {
  const cleaned = getLineWilliamsRCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { wr: [], signal: [] };
  }
  const length = normalizeLineWilliamsRCrossLength(
    options.length,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_LENGTH,
  );
  const signalLength = normalizeLineWilliamsRCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIGNAL_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const wr: Array<number | null> = new Array(closes.length).fill(null);

  for (let i = length - 1; i < closes.length; i += 1) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = closes[j]!;
      if (v > hi) hi = v;
      if (v < lo) lo = v;
    }
    const range = hi - lo;
    if (range <= 0) {
      wr[i] = -50;
    } else {
      wr[i] = posZero(((hi - closes[i]!) / range) * -100);
    }
  }

  const signal = applyLineWilliamsRCrossEma(wr, signalLength);
  return { wr, signal };
}

export function classifyLineWilliamsRCrossRegime(
  wr: number | null,
  signal: number | null,
): ChartLineWilliamsRCrossRegime {
  if (wr == null || signal == null) return 'none';
  if (wr > signal) return 'bullish';
  if (wr < signal) return 'bearish';
  return 'neutral';
}

export function detectLineWilliamsRCrossCrosses(
  series: readonly ChartLineWilliamsRCrossPoint[],
  wr: readonly (number | null)[],
  signal: readonly (number | null)[],
): ChartLineWilliamsRCrossCross[] {
  const out: ChartLineWilliamsRCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prevWr = wr[i - 1];
    const prevSig = signal[i - 1];
    const curWr = wr[i];
    const curSig = signal[i];
    if (
      prevWr == null ||
      prevSig == null ||
      curWr == null ||
      curSig == null
    ) {
      continue;
    }
    const prevDiff = prevWr - prevSig;
    const curDiff = curWr - curSig;
    if (prevDiff <= 0 && curDiff > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prevDiff >= 0 && curDiff < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineWilliamsRCross(
  data: ChartLineWilliamsRCrossPoint[],
  options: { length?: number; signalLength?: number } = {},
): ChartLineWilliamsRCrossRun {
  const cleaned = getLineWilliamsRCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineWilliamsRCrossLength(
    options.length,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_LENGTH,
  );
  const signalLength = normalizeLineWilliamsRCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIGNAL_LENGTH,
  );

  const channels = computeLineWilliamsRCross(series, {
    length,
    signalLength,
  });

  const samples: ChartLineWilliamsRCrossSample[] = series.map((p, i) => {
    const w = channels.wr[i] ?? null;
    const s = channels.signal[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      wr: w,
      signal: s,
      regime: classifyLineWilliamsRCrossRegime(w, s),
    };
  });

  const crosses = detectLineWilliamsRCrossCrosses(
    series,
    channels.wr,
    channels.signal,
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

  const ok = series.length > length + signalLength;

  return {
    series,
    length,
    signalLength,
    wrValues: channels.wr,
    signalValues: channels.signal,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineWilliamsRCrossLayoutOptions {
  data: ChartLineWilliamsRCrossPoint[];
  length?: number;
  signalLength?: number;
  overbought?: number;
  oversold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineWilliamsRCrossLayout(
  opts: ComputeLineWilliamsRCrossLayoutOptions,
): ChartLineWilliamsRCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_PANEL_GAP;
  const overbought =
    opts.overbought ?? DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_OVERBOUGHT;
  const oversold =
    opts.oversold ?? DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_OVERSOLD;

  const run = runLineWilliamsRCross(opts.data, {
    length: opts.length ?? undefined,
    signalLength: opts.signalLength ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  const oscMin = -100;
  const oscMax = 0;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const midY = syOscBase(-50);
  const overboughtY = syOscBase(overbought);
  const oversoldY = syOscBase(oversold);

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
      wrPath: '',
      signalPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      midY,
      overboughtY,
      oversoldY,
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
  const priceDots: ChartLineWilliamsRCrossDot[] = [];
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

  const buildPath = (
    accessor: (s: ChartLineWilliamsRCrossSample) => number | null,
  ): string => {
    let p = '';
    let first = true;
    for (const s of run.samples) {
      const v = accessor(s);
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = syOscBase(v);
      p += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return p.trim();
  };

  const wrPath = buildPath((s) => s.wr);
  const signalPath = buildPath((s) => s.signal);

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.wrValues[c.index] ?? -50);
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
    wrPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    midY,
    overboughtY,
    oversoldY,
    crossMarkers,
    run,
  };
}

export function describeLineWilliamsRCrossChart(
  data: ChartLineWilliamsRCrossPoint[],
  options: { length?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineWilliamsRCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineWilliamsRCrossLength(
    options.length,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_LENGTH,
  );
  const signalLength = normalizeLineWilliamsRCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIGNAL_LENGTH,
  );
  return (
    `Williams %R Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, signalLength ${signalLength}). Top ` +
    `panel renders the close with bullish / bearish arrow ` +
    `overlays at every %R vs signal cross; bottom panel ` +
    `renders the Williams %R line alongside its EMA-smoothed ` +
    `signal on a fixed -100..0 oscillator and marks overbought` +
    ` / oversold regime trigger events at -20 and -80.`
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

export const ChartLineWilliamsRCross = forwardRef<
  HTMLDivElement,
  ChartLineWilliamsRCrossProps
>(function ChartLineWilliamsRCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_LENGTH,
    signalLength = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIGNAL_LENGTH,
    overbought = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_OVERBOUGHT,
    oversold = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_OVERSOLD,
    width = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_PRICE_COLOR,
    wrColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_WR_COLOR,
    signalColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showWr = true,
    showSignal = true,
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
    () => getLineWilliamsRCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineWilliamsRCrossLayout({
        data: cleaned,
        length,
        signalLength,
        overbought,
        oversold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      signalLength,
      overbought,
      oversold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineWilliamsRCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineWilliamsRCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineWilliamsRCrossSeriesId,
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
        data-section="chart-line-williams-r-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineWilliamsRCrossChart(cleaned, { length, signalLength });

  const showPrice = !hidden.has('price');
  const showWrLine = !hidden.has('wr') && showWr;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [-100, -80, -50, -20, 0];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Williams %R Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-williams-r-cross"
      data-length={length}
      data-signal-length={signalLength}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-neutral-count={layout.run.neutralCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-williams-r-cross-title"
      >
        {ariaLabel ?? 'Williams %R Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-williams-r-cross-aria-desc"
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
        data-section="chart-line-williams-r-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-williams-r-cross-grid">
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
                  data-section="chart-line-williams-r-cross-grid-line-price"
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
                  data-section="chart-line-williams-r-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-williams-r-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.overboughtY}
              x2={layout.innerRight}
              y2={layout.overboughtY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-williams-r-cross-band-overbought"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.midY}
              x2={layout.innerRight}
              y2={layout.midY}
              stroke={midColor}
              strokeDasharray="2 4"
              data-section="chart-line-williams-r-cross-band-mid"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oversoldY}
              x2={layout.innerRight}
              y2={layout.oversoldY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-williams-r-cross-band-oversold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-williams-r-cross-axes">
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
                  data-section="chart-line-williams-r-cross-tick-price"
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
                  data-section="chart-line-williams-r-cross-tick-osc"
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
            data-section="chart-line-williams-r-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-williams-r-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-williams-r-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showWrLine ? (
          <path
            d={layout.wrPath}
            stroke={wrColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-williams-r-cross-wr-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-williams-r-cross-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-williams-r-cross-crosses"
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
                data-section={`chart-line-williams-r-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-williams-r-cross-overlay-crosses"
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
                data-section={`chart-line-williams-r-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-williams-r-cross-hover-targets">
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
                data-section="chart-line-williams-r-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-williams-r-cross-tooltip"
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
                  data-section="chart-line-williams-r-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-r-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-r-cross-tooltip-wr"
                >
                  %R{' '}
                  {tooltipSample.wr == null
                    ? '--'
                    : formatOsc(tooltipSample.wr)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-r-cross-tooltip-signal"
                >
                  signal{' '}
                  {tooltipSample.signal == null
                    ? '--'
                    : formatOsc(tooltipSample.signal)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-r-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-r-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-r-cross-tooltip-counts2"
                >
                  neutral {layout.run.neutralCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-r-cross-tooltip-crosses"
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
          data-section="chart-line-williams-r-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | signal {signalLength} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-williams-r-cross-legend"
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
              { id: 'wr' as const, color: wrColor, label: '%R' },
              {
                id: 'signal' as const,
                color: signalColor,
                label: 'signal',
              },
            ] satisfies Array<{
              id: ChartLineWilliamsRCrossSeriesId;
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

ChartLineWilliamsRCross.displayName = 'ChartLineWilliamsRCross';
