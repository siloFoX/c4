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
 * ChartLineAccumulationCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Accumulation /
 * Distribution Line alongside its EMA-smoothed signal in the
 * bottom panel, marking bullish / bearish A/D Line vs signal
 * cross trigger events. Signal-cross variant of the A/D Line
 * family that flags accumulation versus distribution regime
 * change trigger events distinct from the cumulative A/D Line
 * trend.
 *
 *   hi[i]    = max(close[i-b+1..i])                (close-only)
 *   lo[i]    = min(close[i-b+1..i])
 *   mfm[i]   = hi - lo > 0
 *               ? (2*close - lo - hi) / (hi - lo)  (Money Flow Multiplier)
 *               : 0  (neutral fallback when range collapses)
 *   mfv[i]   = mfm * close                         (volume proxy)
 *   ad[i]    = ad[i-1] + mfv[i]                    (cumulative A/D)
 *   signal[i] = EMA(ad, signalLength)
 *   bullish : (ad - signal) crosses up   (prev <= 0, cur > 0)
 *   bearish : (ad - signal) crosses down (prev >= 0, cur < 0)
 *
 * Defaults: `barLength = 2` (high / low proxy window),
 * `signalLength = 9`. Regime classifier `bullish` (ad >
 * signal), `bearish` (ad < signal), `neutral` (ad === signal),
 * `none` (either null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: hi = lo = K every bar -> range = 0
 *   -> mfm = 0 (neutral fallback). mfv = 0 every bar -> ad =
 *   0 cumulatively. signal EMA of 0s = 0 via the `min === max`
 *   precision short-circuit. ad === signal -> regime
 *   `neutral`, cross count = 0. Verified across K = 0..1234.
 */

export interface ChartLineAccumulationCrossPoint {
  x: number;
  close: number;
}

export type ChartLineAccumulationCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineAccumulationCrossSeriesId = 'price' | 'ad' | 'signal';

export type ChartLineAccumulationCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineAccumulationCrossCross {
  index: number;
  x: number;
  kind: ChartLineAccumulationCrossCrossKind;
}

export interface ChartLineAccumulationCrossSample {
  index: number;
  x: number;
  close: number;
  ad: number | null;
  signal: number | null;
  regime: ChartLineAccumulationCrossRegime;
}

export interface ChartLineAccumulationCrossRun {
  series: ChartLineAccumulationCrossPoint[];
  barLength: number;
  signalLength: number;
  adValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineAccumulationCrossSample[];
  crosses: ChartLineAccumulationCrossCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineAccumulationCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAccumulationCrossLayout {
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
  priceDots: ChartLineAccumulationCrossDot[];
  adPath: string;
  signalPath: string;
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
    kind: ChartLineAccumulationCrossCrossKind;
  }>;
  run: ChartLineAccumulationCrossRun;
}

export interface ChartLineAccumulationCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAccumulationCrossPoint[];
  barLength?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  adColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAd?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAccumulationCrossSeriesId[];
  defaultHiddenSeries?: ChartLineAccumulationCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAccumulationCrossSeriesId;
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

export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_BAR_LENGTH = 2;
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_AD_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ACCUMULATION_CROSS_ZERO_LINE_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineAccumulationCrossFinitePoints(
  data: readonly ChartLineAccumulationCrossPoint[] | null | undefined,
): ChartLineAccumulationCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAccumulationCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineAccumulationCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** SMA-seeded EMA with the precision fix. */
export function applyLineAccumulationCrossEma(
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

export interface LineAccumulationCrossChannels {
  ad: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineAccumulationCross(
  series: readonly ChartLineAccumulationCrossPoint[] | null | undefined,
  options: { barLength?: number; signalLength?: number } = {},
): LineAccumulationCrossChannels {
  const cleaned = getLineAccumulationCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { ad: [], signal: [] };
  }
  const barLength = normalizeLineAccumulationCrossLength(
    options.barLength,
    DEFAULT_CHART_LINE_ACCUMULATION_CROSS_BAR_LENGTH,
  );
  const signalLength = normalizeLineAccumulationCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_ACCUMULATION_CROSS_SIGNAL_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const ad: Array<number | null> = new Array(closes.length).fill(null);
  let cumulative = 0;
  ad[0] = 0;

  for (let i = 0; i < closes.length; i += 1) {
    let hi = -Infinity;
    let lo = Infinity;
    const startJ = Math.max(0, i - barLength + 1);
    for (let j = startJ; j <= i; j += 1) {
      const v = closes[j]!;
      if (v > hi) hi = v;
      if (v < lo) lo = v;
    }
    const range = hi - lo;
    const c = closes[i]!;
    let mfm = 0;
    if (range > 0) {
      mfm = (2 * c - lo - hi) / range;
    }
    const mfv = mfm * c;
    cumulative = posZero(cumulative + mfv);
    ad[i] = cumulative;
  }

  const signal = applyLineAccumulationCrossEma(ad, signalLength);
  return { ad, signal };
}

export function classifyLineAccumulationCrossRegime(
  ad: number | null,
  signal: number | null,
): ChartLineAccumulationCrossRegime {
  if (ad == null || signal == null) return 'none';
  if (ad > signal) return 'bullish';
  if (ad < signal) return 'bearish';
  return 'neutral';
}

export function detectLineAccumulationCrossCrosses(
  series: readonly ChartLineAccumulationCrossPoint[],
  ad: readonly (number | null)[],
  signal: readonly (number | null)[],
): ChartLineAccumulationCrossCross[] {
  const out: ChartLineAccumulationCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prevAd = ad[i - 1];
    const prevSig = signal[i - 1];
    const curAd = ad[i];
    const curSig = signal[i];
    if (
      prevAd == null ||
      prevSig == null ||
      curAd == null ||
      curSig == null
    ) {
      continue;
    }
    const prevDiff = prevAd - prevSig;
    const curDiff = curAd - curSig;
    if (prevDiff <= 0 && curDiff > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prevDiff >= 0 && curDiff < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineAccumulationCross(
  data: ChartLineAccumulationCrossPoint[],
  options: { barLength?: number; signalLength?: number } = {},
): ChartLineAccumulationCrossRun {
  const cleaned = getLineAccumulationCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const barLength = normalizeLineAccumulationCrossLength(
    options.barLength,
    DEFAULT_CHART_LINE_ACCUMULATION_CROSS_BAR_LENGTH,
  );
  const signalLength = normalizeLineAccumulationCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_ACCUMULATION_CROSS_SIGNAL_LENGTH,
  );

  const channels = computeLineAccumulationCross(series, {
    barLength,
    signalLength,
  });

  const samples: ChartLineAccumulationCrossSample[] = series.map((p, i) => {
    const a = channels.ad[i] ?? null;
    const s = channels.signal[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      ad: a,
      signal: s,
      regime: classifyLineAccumulationCrossRegime(a, s),
    };
  });

  const crosses = detectLineAccumulationCrossCrosses(
    series,
    channels.ad,
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

  const ok = series.length > signalLength + barLength;

  return {
    series,
    barLength,
    signalLength,
    adValues: channels.ad,
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

export interface ComputeLineAccumulationCrossLayoutOptions {
  data: ChartLineAccumulationCrossPoint[];
  barLength?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAccumulationCrossLayout(
  opts: ComputeLineAccumulationCrossLayoutOptions,
): ChartLineAccumulationCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ACCUMULATION_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ACCUMULATION_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_ACCUMULATION_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ACCUMULATION_CROSS_PANEL_GAP;

  const run = runLineAccumulationCross(opts.data, {
    barLength: opts.barLength ?? undefined,
    signalLength: opts.signalLength ?? undefined,
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
      adPath: '',
      signalPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
      zeroY: oscBottom,
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
    if (s.ad != null) {
      if (s.ad < oscMin) oscMin = s.ad;
      if (s.ad > oscMax) oscMax = s.ad;
    }
    if (s.signal != null) {
      if (s.signal < oscMin) oscMin = s.signal;
      if (s.signal > oscMax) oscMax = s.signal;
    }
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = -1;
    oscMax = 1;
  }
  if (oscMin > 0) oscMin = 0;
  if (oscMax < 0) oscMax = 0;
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }

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

  const zeroY = syOsc(0);

  let pricePath = '';
  const priceDots: ChartLineAccumulationCrossDot[] = [];
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
    accessor: (s: ChartLineAccumulationCrossSample) => number | null,
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
      const cy = syOsc(v);
      p += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return p.trim();
  };

  const adPath = buildPath((s) => s.ad);
  const signalPath = buildPath((s) => s.signal);

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOsc(run.adValues[c.index] ?? 0);
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
    adPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLineAccumulationCrossChart(
  data: ChartLineAccumulationCrossPoint[],
  options: { barLength?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineAccumulationCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const barLength = normalizeLineAccumulationCrossLength(
    options.barLength,
    DEFAULT_CHART_LINE_ACCUMULATION_CROSS_BAR_LENGTH,
  );
  const signalLength = normalizeLineAccumulationCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_ACCUMULATION_CROSS_SIGNAL_LENGTH,
  );
  return (
    `Accumulation Cross chart over ${cleaned.length} bars ` +
    `(barLength ${barLength}, signalLength ${signalLength}). ` +
    `Top panel renders the close with bullish / bearish arrow ` +
    `overlays at every Accumulation Distribution Line vs signal ` +
    `cross; bottom panel renders the cumulative A/D Line ` +
    `alongside its EMA-smoothed signal and marks accumulation ` +
    `versus distribution regime change trigger events.`
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

export const ChartLineAccumulationCross = forwardRef<
  HTMLDivElement,
  ChartLineAccumulationCrossProps
>(function ChartLineAccumulationCross(props, ref): ReactNode {
  const {
    data,
    barLength = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_BAR_LENGTH,
    signalLength = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_PRICE_COLOR,
    adColor = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_AD_COLOR,
    signalColor = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_GRID_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_ACCUMULATION_CROSS_ZERO_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAd = true,
    showSignal = true,
    showCrosses = true,
    showOverlayCrosses = true,
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
    () => getLineAccumulationCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAccumulationCrossLayout({
        data: cleaned,
        barLength,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      barLength,
      signalLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineAccumulationCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineAccumulationCrossSeriesId,
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
    seriesId: ChartLineAccumulationCrossSeriesId,
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
        data-section="chart-line-accumulation-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAccumulationCrossChart(cleaned, { barLength, signalLength });

  const showPrice = !hidden.has('price');
  const showAdLine = !hidden.has('ad') && showAd;
  const showSignalLine = !hidden.has('signal') && showSignal;

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
      aria-label={ariaLabel ?? 'Accumulation Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-accumulation-cross"
      data-bar-length={barLength}
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
        data-section="chart-line-accumulation-cross-title"
      >
        {ariaLabel ?? 'Accumulation Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-accumulation-cross-aria-desc"
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
        data-section="chart-line-accumulation-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-accumulation-cross-grid">
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
                  data-section="chart-line-accumulation-cross-grid-line-price"
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
                  data-section="chart-line-accumulation-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-accumulation-cross-axes">
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
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroLineColor}
              strokeDasharray="4 4"
              data-section="chart-line-accumulation-cross-zero-line"
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
                  data-section="chart-line-accumulation-cross-tick-price"
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
                  data-section="chart-line-accumulation-cross-tick-osc"
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
            data-section="chart-line-accumulation-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-accumulation-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-accumulation-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showAdLine ? (
          <path
            d={layout.adPath}
            stroke={adColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-accumulation-cross-ad-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-accumulation-cross-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-accumulation-cross-crosses"
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
                data-section={`chart-line-accumulation-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-accumulation-cross-overlay-crosses"
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
                data-section={`chart-line-accumulation-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-accumulation-cross-hover-targets">
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
                data-section="chart-line-accumulation-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-accumulation-cross-tooltip"
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
                  data-section="chart-line-accumulation-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-accumulation-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-accumulation-cross-tooltip-ad"
                >
                  ad{' '}
                  {tooltipSample.ad == null
                    ? '--'
                    : formatOsc(tooltipSample.ad)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-accumulation-cross-tooltip-signal"
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
                  data-section="chart-line-accumulation-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-accumulation-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-accumulation-cross-tooltip-counts2"
                >
                  neutral {layout.run.neutralCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-accumulation-cross-tooltip-crosses"
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
          data-section="chart-line-accumulation-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          bar {barLength} | signal {signalLength} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-accumulation-cross-legend"
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
              { id: 'ad' as const, color: adColor, label: 'A/D' },
              {
                id: 'signal' as const,
                color: signalColor,
                label: 'signal',
              },
            ] satisfies Array<{
              id: ChartLineAccumulationCrossSeriesId;
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

ChartLineAccumulationCross.displayName = 'ChartLineAccumulationCross';
