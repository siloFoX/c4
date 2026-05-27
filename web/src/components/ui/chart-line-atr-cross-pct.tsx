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
 * ChartLineAtrCrossPct -- pure-SVG dual-panel chart with the
 * close in the top panel and the Average True Range (ATR) with
 * its EMA-smoothed signal in the bottom panel, plus an
 * `atrPct = (ATR - signal) / close * 100` deviation channel
 * scaled by the close. The percent treatment surfaces the
 * *relative volatility momentum* (how stretched ATR is above
 * or below its signal, expressed as a percent of the close)
 * separate from the absolute ATR levels, so the magnitude is
 * comparable across instruments at different price levels.
 *
 * Single-series simplified ATR using
 *
 *   TR[i]    = i === 0 ? 0 : |close[i] - close[i-1]|
 *   ATR[i]   = Wilder smooth of TR, length
 *   signal[i] = EMA(ATR, signalLength)
 *   atrPct[i] = close[i] === 0 ? null
 *                              : (ATR[i] - signal[i]) / close[i] * 100
 *
 * Defaults: `length = 14` (canonical), `signalLength = 9`.
 * Regime classifier: `above` (atrPct > 0), `below` (< 0),
 * `at` (= 0), `none` (null).
 *
 * Bit-exact anchors:
 *
 * - **CONST close = K (K > 0)**: every TR = 0 -> ATR = 0 ->
 *   signal EMA of 0s = 0 -> atrPct = 0 / K * 100 = 0 every bar
 *   after warmup. K = 0 triggers divide-by-zero guard -> pct =
 *   null. Verified across multiple K.
 * - **LINEAR UP step = 1**: every TR = 1 (after the first
 *   bar) -> ATR = 1 via the Wilder short-circuit -> signal EMA
 *   of 1s = 1 -> atrPct = (1 - 1) / close * 100 = 0.
 * - **LINEAR DOWN step = -1**: same magnitudes, TR = 1 every
 *   bar -> ATR = 1 -> signal = 1 -> atrPct = 0 (with close > 0
 *   maintained by choosing a start value larger than the bar
 *   count).
 */

export interface ChartLineAtrCrossPctPoint {
  x: number;
  close: number;
}

export type ChartLineAtrCrossPctRegime =
  | 'above'
  | 'below'
  | 'at'
  | 'none';

export type ChartLineAtrCrossPctSeriesId = 'price' | 'atr' | 'signal' | 'pct';

export interface ChartLineAtrCrossPctSample {
  index: number;
  x: number;
  close: number;
  atr: number | null;
  signal: number | null;
  atrPct: number | null;
  regime: ChartLineAtrCrossPctRegime;
}

export interface ChartLineAtrCrossPctRun {
  series: ChartLineAtrCrossPctPoint[];
  length: number;
  signalLength: number;
  atrValues: Array<number | null>;
  signalValues: Array<number | null>;
  pctValues: Array<number | null>;
  samples: ChartLineAtrCrossPctSample[];
  aboveCount: number;
  belowCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineAtrCrossPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAtrCrossPctLayout {
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
  priceDots: ChartLineAtrCrossPctDot[];
  atrPath: string;
  signalPath: string;
  pctPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  run: ChartLineAtrCrossPctRun;
}

export interface ChartLineAtrCrossPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAtrCrossPctPoint[];
  length?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  atrColor?: string;
  signalColor?: string;
  pctColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAtr?: boolean;
  showSignal?: boolean;
  showPct?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAtrCrossPctSeriesId[];
  defaultHiddenSeries?: ChartLineAtrCrossPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAtrCrossPctSeriesId;
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

export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_LENGTH = 14;
export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_ATR_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_PCT_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ATR_CROSS_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineAtrCrossPctFinitePoints(
  data: readonly ChartLineAtrCrossPctPoint[] | null | undefined,
): ChartLineAtrCrossPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAtrCrossPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineAtrCrossPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/**
 * Wilder smoothing: avg[i] = (avg[i-1] * (length - 1) + curr) /
 * length. The initial seed is the simple mean of the first
 * `length` samples. CONST short-circuit (curr === prev) keeps
 * the value bit-exact.
 */
export function applyLineAtrCrossPctWilder(
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

/** SMA-seeded EMA with the precision fix. */
export function applyLineAtrCrossPctEma(
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

export interface LineAtrCrossPctChannels {
  atr: Array<number | null>;
  signal: Array<number | null>;
  pct: Array<number | null>;
}

export function computeLineAtrCrossPct(
  series: readonly ChartLineAtrCrossPctPoint[] | null | undefined,
  options: { length?: number; signalLength?: number } = {},
): LineAtrCrossPctChannels {
  const cleaned = getLineAtrCrossPctFinitePoints(series);
  if (cleaned.length === 0) {
    return { atr: [], signal: [], pct: [] };
  }
  const length = normalizeLineAtrCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_ATR_CROSS_PCT_LENGTH,
  );
  const signalLength = normalizeLineAtrCrossPctLength(
    options.signalLength,
    DEFAULT_CHART_LINE_ATR_CROSS_PCT_SIGNAL_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const tr: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i += 1) {
    tr[i] = Math.abs(closes[i]! - closes[i - 1]!);
  }

  const atrFromIdx1 = applyLineAtrCrossPctWilder(tr.slice(1), length);
  const atr: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < atrFromIdx1.length; i += 1) {
    atr[i + 1] = atrFromIdx1[i] ?? null;
  }

  const signal = applyLineAtrCrossPctEma(atr, signalLength);

  const pct: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const a = atr[i];
    const s = signal[i];
    if (a == null || s == null) continue;
    const c = closes[i]!;
    if (c === 0) continue;
    pct[i] = posZero(((a - s) / c) * 100);
  }

  return { atr, signal, pct };
}

export function classifyLineAtrCrossPctRegime(
  pct: number | null,
): ChartLineAtrCrossPctRegime {
  if (pct == null) return 'none';
  if (pct > 0) return 'above';
  if (pct < 0) return 'below';
  return 'at';
}

export function runLineAtrCrossPct(
  data: ChartLineAtrCrossPctPoint[],
  options: { length?: number; signalLength?: number } = {},
): ChartLineAtrCrossPctRun {
  const cleaned = getLineAtrCrossPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineAtrCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_ATR_CROSS_PCT_LENGTH,
  );
  const signalLength = normalizeLineAtrCrossPctLength(
    options.signalLength,
    DEFAULT_CHART_LINE_ATR_CROSS_PCT_SIGNAL_LENGTH,
  );

  const channels = computeLineAtrCrossPct(series, { length, signalLength });

  const samples: ChartLineAtrCrossPctSample[] = series.map((p, i) => {
    const atr = channels.atr[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const pct = channels.pct[i] ?? null;
    const regime = classifyLineAtrCrossPctRegime(pct);
    return {
      index: i,
      x: p.x,
      close: p.close,
      atr,
      signal,
      atrPct: pct,
      regime,
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let atCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'above') aboveCount += 1;
    else if (s.regime === 'below') belowCount += 1;
    else if (s.regime === 'at') atCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length + signalLength;

  return {
    series,
    length,
    signalLength,
    atrValues: channels.atr,
    signalValues: channels.signal,
    pctValues: channels.pct,
    samples,
    aboveCount,
    belowCount,
    atCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineAtrCrossPctLayoutOptions {
  data: ChartLineAtrCrossPctPoint[];
  length?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAtrCrossPctLayout(
  opts: ComputeLineAtrCrossPctLayoutOptions,
): ChartLineAtrCrossPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ATR_CROSS_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ATR_CROSS_PCT_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_ATR_CROSS_PCT_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ATR_CROSS_PCT_PANEL_GAP;

  const run = runLineAtrCrossPct(opts.data, {
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
      atrPath: '',
      signalPath: '',
      pctPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
      zeroY: (oscTop + oscBottom) / 2,
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
    if (s.atr != null) {
      if (s.atr < oscMin) oscMin = s.atr;
      if (s.atr > oscMax) oscMax = s.atr;
    }
    if (s.signal != null) {
      if (s.signal < oscMin) oscMin = s.signal;
      if (s.signal > oscMax) oscMax = s.signal;
    }
    if (s.atrPct != null) {
      if (s.atrPct < oscMin) oscMin = s.atrPct;
      if (s.atrPct > oscMax) oscMax = s.atrPct;
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
  const priceDots: ChartLineAtrCrossPctDot[] = [];
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

  let atrPath = '';
  let atrFirst = true;
  for (const s of run.samples) {
    if (s.atr == null) {
      atrFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.atr);
    atrPath += `${atrFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    atrFirst = false;
  }
  atrPath = atrPath.trim();

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

  let pctPath = '';
  let pctFirst = true;
  for (const s of run.samples) {
    if (s.atrPct == null) {
      pctFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.atrPct);
    pctPath += `${pctFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    pctFirst = false;
  }
  pctPath = pctPath.trim();

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
    atrPath,
    signalPath,
    pctPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY: syOsc(0),
    run,
  };
}

export function describeLineAtrCrossPctChart(
  data: ChartLineAtrCrossPctPoint[],
  options: { length?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineAtrCrossPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineAtrCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_ATR_CROSS_PCT_LENGTH,
  );
  const signalLength = normalizeLineAtrCrossPctLength(
    options.signalLength,
    DEFAULT_CHART_LINE_ATR_CROSS_PCT_SIGNAL_LENGTH,
  );
  return (
    `ATR Cross Pct chart over ${cleaned.length} bars (length ` +
    `${length}, signalLength ${signalLength}). Top panel renders ` +
    `the close; bottom panel overlays the Average True Range with ` +
    `its EMA-smoothed signal line and renders the (ATR - signal) ` +
    `/ close * 100 deviation scaled to price magnitude for cross-` +
    `instrument comparable volatility momentum.`
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

export const ChartLineAtrCrossPct = forwardRef<
  HTMLDivElement,
  ChartLineAtrCrossPctProps
>(function ChartLineAtrCrossPct(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_ATR_CROSS_PCT_LENGTH,
    signalLength = DEFAULT_CHART_LINE_ATR_CROSS_PCT_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_ATR_CROSS_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_ATR_CROSS_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_ATR_CROSS_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_ATR_CROSS_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ATR_CROSS_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ATR_CROSS_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ATR_CROSS_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ATR_CROSS_PCT_PRICE_COLOR,
    atrColor = DEFAULT_CHART_LINE_ATR_CROSS_PCT_ATR_COLOR,
    signalColor = DEFAULT_CHART_LINE_ATR_CROSS_PCT_SIGNAL_COLOR,
    pctColor = DEFAULT_CHART_LINE_ATR_CROSS_PCT_PCT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_ATR_CROSS_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_ATR_CROSS_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ATR_CROSS_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAtr = true,
    showSignal = true,
    showPct = true,
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
    () => getLineAtrCrossPctFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAtrCrossPctLayout({
        data: cleaned,
        length,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, signalLength, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineAtrCrossPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineAtrCrossPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineAtrCrossPctSeriesId,
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
        data-section="chart-line-atr-cross-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAtrCrossPctChart(cleaned, { length, signalLength });

  const showPrice = !hidden.has('price');
  const showAtrLine = !hidden.has('atr') && showAtr;
  const showSignalLine = !hidden.has('signal') && showSignal;
  const showPctLine = !hidden.has('pct') && showPct;

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
      aria-label={ariaLabel ?? 'ATR Cross Percent chart'}
      aria-describedby={descId}
      data-section="chart-line-atr-cross-pct"
      data-length={length}
      data-signal-length={signalLength}
      data-total-points={cleaned.length}
      data-above-count={layout.run.aboveCount}
      data-below-count={layout.run.belowCount}
      data-at-count={layout.run.atCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-atr-cross-pct-title"
      >
        {ariaLabel ?? 'ATR Cross Percent chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-atr-cross-pct-aria-desc"
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
        data-section="chart-line-atr-cross-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-atr-cross-pct-grid">
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
                  data-section="chart-line-atr-cross-pct-grid-line-price"
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
                  data-section="chart-line-atr-cross-pct-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-atr-cross-pct-axes">
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
                  data-section="chart-line-atr-cross-pct-tick-price"
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
                  data-section="chart-line-atr-cross-pct-tick-osc"
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
            data-section="chart-line-atr-cross-pct-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-atr-cross-pct-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-atr-cross-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-atr-cross-pct-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showAtrLine ? (
          <path
            d={layout.atrPath}
            stroke={atrColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-atr-cross-pct-atr-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-atr-cross-pct-signal-path"
          />
        ) : null}

        {showPctLine ? (
          <path
            d={layout.pctPath}
            stroke={pctColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-atr-cross-pct-pct-path"
          />
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-atr-cross-pct-hover-targets">
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
                data-section="chart-line-atr-cross-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-atr-cross-pct-tooltip"
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
                  data-section="chart-line-atr-cross-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-cross-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-cross-pct-tooltip-atr"
                >
                  atr{' '}
                  {tooltipSample.atr == null
                    ? '--'
                    : formatOsc(tooltipSample.atr)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-cross-pct-tooltip-signal"
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
                  data-section="chart-line-atr-cross-pct-tooltip-pct"
                >
                  atrPct{' '}
                  {tooltipSample.atrPct == null
                    ? '--'
                    : formatOsc(tooltipSample.atrPct)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-cross-pct-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-cross-pct-tooltip-counts"
                >
                  above {layout.run.aboveCount} | below{' '}
                  {layout.run.belowCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-cross-pct-tooltip-counts2"
                >
                  at {layout.run.atCount} | none {layout.run.noneCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-atr-cross-pct-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | signal {signalLength} | above{' '}
          {layout.run.aboveCount} | below {layout.run.belowCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-atr-cross-pct-legend"
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
              { id: 'atr' as const, color: atrColor, label: 'atr' },
              {
                id: 'signal' as const,
                color: signalColor,
                label: 'signal',
              },
              { id: 'pct' as const, color: pctColor, label: 'atrPct' },
            ] satisfies Array<{
              id: ChartLineAtrCrossPctSeriesId;
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

ChartLineAtrCrossPct.displayName = 'ChartLineAtrCrossPct';
