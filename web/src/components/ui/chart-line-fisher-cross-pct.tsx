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
 * ChartLineFisherCrossPct -- pure-SVG dual-panel chart with the
 * close in the top panel and the Fisher Transform with its EMA-
 * smoothed signal in the bottom panel, plus a `fisherPct =
 * (fisher - signal)` deviation channel. The cross-pct treatment
 * surfaces the *magnitude of gaussian-normalised momentum
 * events* (how stretched the Fisher Transform is above or below
 * its signal) separate from the sign-based crossings.
 *
 * Fisher Transform (single-series, close-only) with the standard
 * 0.66 / 0.67 / 0.5 mixing coefficients:
 *
 *   highest[i] = max(close[i - length + 1 .. i])
 *   lowest[i]  = min(close[i - length + 1 .. i])
 *   norm[i]    = highest === lowest
 *                  ? 0.5
 *                  : (close[i] - lowest) / (highest - lowest)
 *   xRaw[i]    = 0.66 * 2 * (norm[i] - 0.5) + 0.67 * x[i-1]
 *   x[i]       = clamp(xRaw[i], -0.999, 0.999)
 *   fisher[i]  = 0.5 * ln((1 + x[i]) / (1 - x[i])) +
 *                0.5 * fisher[i-1]
 *   signal[i]  = EMA(fisher, signalLength)
 *   fisherPct[i] = fisher[i] - signal[i]
 *
 * Defaults: `length = 10` (canonical Fisher window),
 * `signalLength = 9`. Regime classifier: `above` (fisherPct >
 * 0), `below` (< 0), `at` (= 0), `none` (null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: every highest === lowest = K so
 *   `norm = 0.5` (the midpoint fallback) -> `2 * (norm - 0.5)
 *   = 0` -> `x[i] = 0.67 * x[i-1] = 0` (seeded at 0) ->
 *   `fisher[i] = 0.5 * ln(1) + 0.5 * fisher[i-1] = 0`. signal
 *   EMA of 0s = 0. fisherPct = 0 every bar after warmup.
 *   Verified across multiple K including K = 0.
 */

export interface ChartLineFisherCrossPctPoint {
  x: number;
  close: number;
}

export type ChartLineFisherCrossPctRegime =
  | 'above'
  | 'below'
  | 'at'
  | 'none';

export type ChartLineFisherCrossPctSeriesId =
  | 'price'
  | 'fisher'
  | 'signal'
  | 'pct';

export interface ChartLineFisherCrossPctSample {
  index: number;
  x: number;
  close: number;
  fisher: number | null;
  signal: number | null;
  fisherPct: number | null;
  regime: ChartLineFisherCrossPctRegime;
}

export interface ChartLineFisherCrossPctRun {
  series: ChartLineFisherCrossPctPoint[];
  length: number;
  signalLength: number;
  fisherValues: Array<number | null>;
  signalValues: Array<number | null>;
  pctValues: Array<number | null>;
  samples: ChartLineFisherCrossPctSample[];
  aboveCount: number;
  belowCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineFisherCrossPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineFisherCrossPctLayout {
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
  priceDots: ChartLineFisherCrossPctDot[];
  fisherPath: string;
  signalPath: string;
  pctPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  run: ChartLineFisherCrossPctRun;
}

export interface ChartLineFisherCrossPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineFisherCrossPctPoint[];
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
  fisherColor?: string;
  signalColor?: string;
  pctColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFisher?: boolean;
  showSignal?: boolean;
  showPct?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineFisherCrossPctSeriesId[];
  defaultHiddenSeries?: ChartLineFisherCrossPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineFisherCrossPctSeriesId;
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

export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_LENGTH = 10;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_X_GAIN = 0.66;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_X_DECAY = 0.67;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_FISHER_DECAY = 0.5;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_CLAMP = 0.999;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_FISHER_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_PCT_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_FISHER_CROSS_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineFisherCrossPctFinitePoints(
  data: readonly ChartLineFisherCrossPctPoint[] | null | undefined,
): ChartLineFisherCrossPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineFisherCrossPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineFisherCrossPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** SMA-seeded EMA with the precision fix. */
export function applyLineFisherCrossPctEma(
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

export interface LineFisherCrossPctChannels {
  fisher: Array<number | null>;
  signal: Array<number | null>;
  pct: Array<number | null>;
}

export function computeLineFisherCrossPct(
  series: readonly ChartLineFisherCrossPctPoint[] | null | undefined,
  options: { length?: number; signalLength?: number } = {},
): LineFisherCrossPctChannels {
  const cleaned = getLineFisherCrossPctFinitePoints(series);
  if (cleaned.length === 0) {
    return { fisher: [], signal: [], pct: [] };
  }
  const length = normalizeLineFisherCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_FISHER_CROSS_PCT_LENGTH,
  );
  const signalLength = normalizeLineFisherCrossPctLength(
    options.signalLength,
    DEFAULT_CHART_LINE_FISHER_CROSS_PCT_SIGNAL_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const fisher: Array<number | null> = new Array(closes.length).fill(null);
  let xPrev = 0;
  let fisherPrev = 0;
  const gain = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_X_GAIN;
  const xDecay = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_X_DECAY;
  const fisherDecay = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_FISHER_DECAY;
  const clamp = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_CLAMP;

  for (let i = length - 1; i < closes.length; i += 1) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let k = 0; k < length; k += 1) {
      const v = closes[i - length + 1 + k]!;
      if (v > hh) hh = v;
      if (v < ll) ll = v;
    }
    const norm = hh === ll ? 0.5 : (closes[i]! - ll) / (hh - ll);
    const xRaw = gain * 2 * (norm - 0.5) + xDecay * xPrev;
    const xClamped = Math.max(-clamp, Math.min(clamp, xRaw));
    const fish =
      0.5 * Math.log((1 + xClamped) / (1 - xClamped)) +
      fisherDecay * fisherPrev;
    fisher[i] = posZero(fish);
    xPrev = xClamped;
    fisherPrev = fish;
  }

  const signal = applyLineFisherCrossPctEma(fisher, signalLength);

  const pct: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const f = fisher[i];
    const s = signal[i];
    if (f == null || s == null) continue;
    pct[i] = posZero(f - s);
  }

  return { fisher, signal, pct };
}

export function classifyLineFisherCrossPctRegime(
  pct: number | null,
): ChartLineFisherCrossPctRegime {
  if (pct == null) return 'none';
  if (pct > 0) return 'above';
  if (pct < 0) return 'below';
  return 'at';
}

export function runLineFisherCrossPct(
  data: ChartLineFisherCrossPctPoint[],
  options: { length?: number; signalLength?: number } = {},
): ChartLineFisherCrossPctRun {
  const cleaned = getLineFisherCrossPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineFisherCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_FISHER_CROSS_PCT_LENGTH,
  );
  const signalLength = normalizeLineFisherCrossPctLength(
    options.signalLength,
    DEFAULT_CHART_LINE_FISHER_CROSS_PCT_SIGNAL_LENGTH,
  );

  const channels = computeLineFisherCrossPct(series, {
    length,
    signalLength,
  });

  const samples: ChartLineFisherCrossPctSample[] = series.map((p, i) => {
    const fisher = channels.fisher[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const pct = channels.pct[i] ?? null;
    const regime = classifyLineFisherCrossPctRegime(pct);
    return {
      index: i,
      x: p.x,
      close: p.close,
      fisher,
      signal,
      fisherPct: pct,
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
    fisherValues: channels.fisher,
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

export interface ComputeLineFisherCrossPctLayoutOptions {
  data: ChartLineFisherCrossPctPoint[];
  length?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineFisherCrossPctLayout(
  opts: ComputeLineFisherCrossPctLayoutOptions,
): ChartLineFisherCrossPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_FISHER_CROSS_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_FISHER_CROSS_PCT_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_FISHER_CROSS_PCT_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_FISHER_CROSS_PCT_PANEL_GAP;

  const run = runLineFisherCrossPct(opts.data, {
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
      fisherPath: '',
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
    if (s.fisher != null) {
      if (s.fisher < oscMin) oscMin = s.fisher;
      if (s.fisher > oscMax) oscMax = s.fisher;
    }
    if (s.signal != null) {
      if (s.signal < oscMin) oscMin = s.signal;
      if (s.signal > oscMax) oscMax = s.signal;
    }
    if (s.fisherPct != null) {
      if (s.fisherPct < oscMin) oscMin = s.fisherPct;
      if (s.fisherPct > oscMax) oscMax = s.fisherPct;
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
  const priceDots: ChartLineFisherCrossPctDot[] = [];
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
  let fisherFirst = true;
  for (const s of run.samples) {
    if (s.fisher == null) {
      fisherFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.fisher);
    fisherPath += `${fisherFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    fisherFirst = false;
  }
  fisherPath = fisherPath.trim();

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
    if (s.fisherPct == null) {
      pctFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.fisherPct);
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
    fisherPath,
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

export function describeLineFisherCrossPctChart(
  data: ChartLineFisherCrossPctPoint[],
  options: { length?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineFisherCrossPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineFisherCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_FISHER_CROSS_PCT_LENGTH,
  );
  const signalLength = normalizeLineFisherCrossPctLength(
    options.signalLength,
    DEFAULT_CHART_LINE_FISHER_CROSS_PCT_SIGNAL_LENGTH,
  );
  return (
    `Fisher Cross Pct chart over ${cleaned.length} bars (length ` +
    `${length}, signalLength ${signalLength}). Top panel renders ` +
    `the close; bottom panel overlays the Fisher Transform with ` +
    `its EMA-smoothed signal line and renders the (fisher - ` +
    `signal) deviation surfacing the magnitude of gaussian-` +
    `normalised momentum events separate from the sign-based ` +
    `crossings.`
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

export const ChartLineFisherCrossPct = forwardRef<
  HTMLDivElement,
  ChartLineFisherCrossPctProps
>(function ChartLineFisherCrossPct(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_LENGTH,
    signalLength = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_PRICE_COLOR,
    fisherColor = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_FISHER_COLOR,
    signalColor = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_SIGNAL_COLOR,
    pctColor = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_PCT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_FISHER_CROSS_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showFisher = true,
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
    () => getLineFisherCrossPctFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineFisherCrossPctLayout({
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
    ChartLineFisherCrossPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineFisherCrossPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineFisherCrossPctSeriesId,
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
        data-section="chart-line-fisher-cross-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineFisherCrossPctChart(cleaned, { length, signalLength });

  const showPrice = !hidden.has('price');
  const showFisherLine = !hidden.has('fisher') && showFisher;
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
      aria-label={ariaLabel ?? 'Fisher Cross Percent chart'}
      aria-describedby={descId}
      data-section="chart-line-fisher-cross-pct"
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
        data-section="chart-line-fisher-cross-pct-title"
      >
        {ariaLabel ?? 'Fisher Cross Percent chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-fisher-cross-pct-aria-desc"
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
        data-section="chart-line-fisher-cross-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-fisher-cross-pct-grid">
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
                  data-section="chart-line-fisher-cross-pct-grid-line-price"
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
                  data-section="chart-line-fisher-cross-pct-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-fisher-cross-pct-axes">
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
                  data-section="chart-line-fisher-cross-pct-tick-price"
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
                  data-section="chart-line-fisher-cross-pct-tick-osc"
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
            data-section="chart-line-fisher-cross-pct-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fisher-cross-pct-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-fisher-cross-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-fisher-cross-pct-price-dot"
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
            data-section="chart-line-fisher-cross-pct-fisher-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fisher-cross-pct-signal-path"
          />
        ) : null}

        {showPctLine ? (
          <path
            d={layout.pctPath}
            stroke={pctColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fisher-cross-pct-pct-path"
          />
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-fisher-cross-pct-hover-targets">
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
                data-section="chart-line-fisher-cross-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-fisher-cross-pct-tooltip"
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
                  data-section="chart-line-fisher-cross-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-cross-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-cross-pct-tooltip-fisher"
                >
                  fisher{' '}
                  {tooltipSample.fisher == null
                    ? '--'
                    : formatOsc(tooltipSample.fisher)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-cross-pct-tooltip-signal"
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
                  data-section="chart-line-fisher-cross-pct-tooltip-pct"
                >
                  fisherPct{' '}
                  {tooltipSample.fisherPct == null
                    ? '--'
                    : formatOsc(tooltipSample.fisherPct)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-cross-pct-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-cross-pct-tooltip-counts"
                >
                  above {layout.run.aboveCount} | below{' '}
                  {layout.run.belowCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-cross-pct-tooltip-counts2"
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
          data-section="chart-line-fisher-cross-pct-badge"
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
          data-section="chart-line-fisher-cross-pct-legend"
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
                id: 'fisher' as const,
                color: fisherColor,
                label: 'fisher',
              },
              {
                id: 'signal' as const,
                color: signalColor,
                label: 'signal',
              },
              { id: 'pct' as const, color: pctColor, label: 'fisherPct' },
            ] satisfies Array<{
              id: ChartLineFisherCrossPctSeriesId;
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

ChartLineFisherCrossPct.displayName = 'ChartLineFisherCrossPct';
