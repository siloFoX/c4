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
 * ChartLineObvCrossSig -- pure-SVG dual-panel chart with the
 * close in the top panel and the On Balance Volume (OBV) with
 * its EMA-smoothed signal in the bottom panel, marking
 * bullish / bearish cross trigger events. The trigger-focused
 * OBV variant: this primitive isolates the actionable
 * accumulation / distribution trigger events when OBV crosses
 * its signal and paints them as arrow overlays on the price
 * panel for direct charting-overlay use.
 *
 *   OBV[0]    = 0
 *   OBV[i]    = OBV[i-1] +
 *                 (close[i] > close[i-1] ? volume[i]
 *                : close[i] < close[i-1] ? -volume[i]
 *                : 0)
 *   signal[i] = EMA(OBV, signalLength)
 *   bullish  : (OBV - signal) crosses up    (prev <= 0, cur > 0)
 *   bearish  : (OBV - signal) crosses down  (prev >= 0, cur < 0)
 *
 * Defaults: `signalLength = 20`. Regime classifier: `bullish`
 * (OBV > signal), `bearish` (OBV < signal), `neutral` (OBV ===
 * signal), `none` (either side null).
 *
 * Bit-exact anchors:
 *
 * - **CONST {close = K, volume = V}**: every close[i] ===
 *   close[i-1] so OBV stays at 0 forever. signal EMA of 0s =
 *   0. OBV === signal everywhere -> regime `neutral`, cross
 *   count = 0. Verified across multiple K and V tuples.
 * - **LINEAR UP step > 0 with V > 0**: every close[i] >
 *   close[i-1] so OBV grows monotonically. Signal EMA lags
 *   below OBV but the seed lands when OBV is already above
 *   signal -> 0 crosses (no transition observed in the
 *   computed window), regime `bullish` after warmup.
 * - **LINEAR DOWN step < 0 with V > 0**: symmetric, regime
 *   `bearish` after warmup, 0 crosses.
 */

export interface ChartLineObvCrossSigPoint {
  x: number;
  close: number;
  volume: number;
}

export type ChartLineObvCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineObvCrossSigSeriesId = 'price' | 'obv' | 'signal';

export type ChartLineObvCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineObvCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineObvCrossSigCrossKind;
}

export interface ChartLineObvCrossSigSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  obv: number | null;
  signal: number | null;
  regime: ChartLineObvCrossSigRegime;
}

export interface ChartLineObvCrossSigRun {
  series: ChartLineObvCrossSigPoint[];
  signalLength: number;
  obvValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineObvCrossSigSample[];
  crosses: ChartLineObvCrossSigCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineObvCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineObvCrossSigLayout {
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
  priceDots: ChartLineObvCrossSigDot[];
  obvPath: string;
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
    kind: ChartLineObvCrossSigCrossKind;
  }>;
  run: ChartLineObvCrossSigRun;
}

export interface ChartLineObvCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineObvCrossSigPoint[];
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  obvColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showObv?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineObvCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineObvCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineObvCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_SIGNAL_LENGTH = 20;
export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_OBV_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_OBV_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close / volume. */
export function getLineObvCrossSigFinitePoints(
  data: readonly ChartLineObvCrossSigPoint[] | null | undefined,
): ChartLineObvCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineObvCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume)
    ) {
      out.push({ x: point.x, close: point.close, volume: point.volume });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineObvCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** SMA-seeded EMA with the precision fix. */
export function applyLineObvCrossSigEma(
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
        const next = nv === prev ? nv : posZero(alpha * nv + (1 - alpha) * prev);
        out[j] = next;
        prev = next;
      }
      break;
    }
  }
  return out;
}

export interface LineObvCrossSigChannels {
  obv: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineObvCrossSig(
  series: readonly ChartLineObvCrossSigPoint[] | null | undefined,
  options: { signalLength?: number } = {},
): LineObvCrossSigChannels {
  const cleaned = getLineObvCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { obv: [], signal: [] };
  }
  const signalLength = normalizeLineObvCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_OBV_CROSS_SIG_SIGNAL_LENGTH,
  );

  const obv: Array<number | null> = new Array(cleaned.length).fill(null);
  obv[0] = 0;
  for (let i = 1; i < cleaned.length; i += 1) {
    const prev = obv[i - 1]!;
    const close = cleaned[i]!.close;
    const closePrev = cleaned[i - 1]!.close;
    const vol = cleaned[i]!.volume;
    let delta = 0;
    if (close > closePrev) delta = vol;
    else if (close < closePrev) delta = -vol;
    obv[i] = posZero(prev + delta);
  }

  const signal = applyLineObvCrossSigEma(obv, signalLength);

  return { obv, signal };
}

export function classifyLineObvCrossSigRegime(
  obv: number | null,
  signal: number | null,
): ChartLineObvCrossSigRegime {
  if (obv == null || signal == null) return 'none';
  if (obv > signal) return 'bullish';
  if (obv < signal) return 'bearish';
  return 'neutral';
}

export function detectLineObvCrossSigCrosses(
  series: readonly ChartLineObvCrossSigPoint[],
  obv: readonly (number | null)[],
  signal: readonly (number | null)[],
): ChartLineObvCrossSigCross[] {
  const out: ChartLineObvCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prevObv = obv[i - 1];
    const prevSig = signal[i - 1];
    const curObv = obv[i];
    const curSig = signal[i];
    if (
      prevObv == null ||
      prevSig == null ||
      curObv == null ||
      curSig == null
    ) {
      continue;
    }
    const prevDiff = prevObv - prevSig;
    const curDiff = curObv - curSig;
    if (prevDiff <= 0 && curDiff > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prevDiff >= 0 && curDiff < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineObvCrossSig(
  data: ChartLineObvCrossSigPoint[],
  options: { signalLength?: number } = {},
): ChartLineObvCrossSigRun {
  const cleaned = getLineObvCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const signalLength = normalizeLineObvCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_OBV_CROSS_SIG_SIGNAL_LENGTH,
  );

  const channels = computeLineObvCrossSig(series, { signalLength });

  const samples: ChartLineObvCrossSigSample[] = series.map((p, i) => {
    const obv = channels.obv[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const regime = classifyLineObvCrossSigRegime(obv, signal);
    return {
      index: i,
      x: p.x,
      close: p.close,
      volume: p.volume,
      obv,
      signal,
      regime,
    };
  });

  const crosses = detectLineObvCrossSigCrosses(
    series,
    channels.obv,
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

  const ok = series.length > signalLength;

  return {
    series,
    signalLength,
    obvValues: channels.obv,
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

export interface ComputeLineObvCrossSigLayoutOptions {
  data: ChartLineObvCrossSigPoint[];
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineObvCrossSigLayout(
  opts: ComputeLineObvCrossSigLayoutOptions,
): ChartLineObvCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_OBV_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_OBV_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_OBV_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_OBV_CROSS_SIG_PANEL_GAP;

  const run = runLineObvCrossSig(opts.data, {
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
      obvPath: '',
      signalPath: '',
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
    if (s.obv != null) {
      if (s.obv < oscMin) oscMin = s.obv;
      if (s.obv > oscMax) oscMax = s.obv;
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
  const priceDots: ChartLineObvCrossSigDot[] = [];
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

  let obvPath = '';
  let obvFirst = true;
  for (const s of run.samples) {
    if (s.obv == null) {
      obvFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.obv);
    obvPath += `${obvFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    obvFirst = false;
  }
  obvPath = obvPath.trim();

  let signalPath = '';
  let signalFirst = true;
  for (const s of run.samples) {
    if (s.signal == null) {
      signalFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.signal);
    signalPath += `${signalFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    signalFirst = false;
  }
  signalPath = signalPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOsc(run.obvValues[c.index] ?? 0);
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
    obvPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY: syOsc(0),
    crossMarkers,
    run,
  };
}

export function describeLineObvCrossSigChart(
  data: ChartLineObvCrossSigPoint[],
  options: { signalLength?: number } = {},
): string {
  const cleaned = getLineObvCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const signalLength = normalizeLineObvCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_OBV_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `OBV Cross Signal chart over ${cleaned.length} bars ` +
    `(signalLength ${signalLength}). Top panel renders the ` +
    `close with bullish / bearish arrow overlays at every cross ` +
    `trigger; bottom panel overlays the On Balance Volume with ` +
    `its EMA-smoothed signal line and marks accumulation / ` +
    `distribution trigger events.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 0);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineObvCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineObvCrossSigProps
>(function ChartLineObvCrossSig(props, ref): ReactNode {
  const {
    data,
    signalLength = DEFAULT_CHART_LINE_OBV_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_OBV_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_OBV_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_OBV_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_OBV_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_OBV_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_OBV_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_OBV_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_OBV_CROSS_SIG_PRICE_COLOR,
    obvColor = DEFAULT_CHART_LINE_OBV_CROSS_SIG_OBV_COLOR,
    signalColor = DEFAULT_CHART_LINE_OBV_CROSS_SIG_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_OBV_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_OBV_CROSS_SIG_BEARISH_COLOR,
    zeroColor = DEFAULT_CHART_LINE_OBV_CROSS_SIG_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_OBV_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_OBV_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showObv = true,
    showSignal = true,
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
    () => getLineObvCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineObvCrossSigLayout({
        data: cleaned,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, signalLength, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineObvCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineObvCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineObvCrossSigSeriesId,
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
        data-section="chart-line-obv-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineObvCrossSigChart(cleaned, { signalLength });

  const showPrice = !hidden.has('price');
  const showObvLine = !hidden.has('obv') && showObv;
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
      aria-label={ariaLabel ?? 'OBV Cross Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-obv-cross-sig"
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
        data-section="chart-line-obv-cross-sig-title"
      >
        {ariaLabel ?? 'OBV Cross Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-obv-cross-sig-aria-desc"
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
        data-section="chart-line-obv-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-obv-cross-sig-grid">
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
                  data-section="chart-line-obv-cross-sig-grid-line-price"
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
                  data-section="chart-line-obv-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-obv-cross-sig-axes">
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
                  data-section="chart-line-obv-cross-sig-tick-price"
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
                  data-section="chart-line-obv-cross-sig-tick-osc"
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
            data-section="chart-line-obv-cross-sig-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-obv-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-obv-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-obv-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showObvLine ? (
          <path
            d={layout.obvPath}
            stroke={obvColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-obv-cross-sig-obv-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-obv-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-obv-cross-sig-crosses"
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
                data-section={`chart-line-obv-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-obv-cross-sig-overlay-crosses"
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
                data-section={`chart-line-obv-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-obv-cross-sig-hover-targets">
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
                data-section="chart-line-obv-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-obv-cross-sig-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={208}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-cross-sig-tooltip-obv"
                >
                  obv{' '}
                  {tooltipSample.obv == null
                    ? '--'
                    : formatOsc(tooltipSample.obv)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-cross-sig-tooltip-signal"
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
                  data-section="chart-line-obv-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-cross-sig-tooltip-counts2"
                >
                  neutral {layout.run.neutralCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-cross-sig-tooltip-crosses"
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
          data-section="chart-line-obv-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          signal {signalLength} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-obv-cross-sig-legend"
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
              { id: 'obv' as const, color: obvColor, label: 'obv' },
              {
                id: 'signal' as const,
                color: signalColor,
                label: 'signal',
              },
            ] satisfies Array<{
              id: ChartLineObvCrossSigSeriesId;
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

ChartLineObvCrossSig.displayName = 'ChartLineObvCrossSig';
