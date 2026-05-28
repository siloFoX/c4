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
 * ChartLineMfiCrossPct -- pure-SVG dual-panel chart with the
 * close in the top panel and the Money Flow Index (MFI) with
 * its EMA-smoothed signal in the bottom panel, plus an
 * `mfiPct = (MFI - signal) / 100 * 100` deviation channel
 * scaled by the full 0..100 MFI range. MFI is a volume-weighted
 * RSI, so the percent treatment surfaces the *volume-weighted
 * momentum magnitude* (how stretched MFI is above or below its
 * signal) separate from the sign-based MFI-over-signal
 * crossings.
 *
 *   tp[i]    = close[i]                       (single-series TP)
 *   rawMF[i] = tp[i] * volume[i]
 *   pos[i]   = tp[i] > tp[i-1] ? rawMF[i] : 0
 *   neg[i]   = tp[i] < tp[i-1] ? rawMF[i] : 0
 *   PSum[i]  = sum(pos[i-length+1 .. i])
 *   NSum[i]  = sum(neg[i-length+1 .. i])
 *   MFI[i]   = PSum === 0 && NSum === 0
 *                ? 50
 *                : NSum === 0
 *                  ? 100
 *                  : 100 - 100 / (1 + PSum / NSum)
 *   signal[i] = EMA(MFI, signalLength)
 *   mfiPct[i] = (MFI[i] - signal[i]) / 100 * 100
 *
 * Defaults: `length = 14` (canonical), `signalLength = 9`.
 * Regime classifier: `above` (mfiPct > 0), `below` (< 0),
 * `at` (= 0), `none` (null).
 *
 * Bit-exact anchors:
 *
 * - **CONST {close = K, volume = V}**: TP[i] === TP[i-1] every
 *   bar so pos = neg = 0 throughout the window. PSum = NSum =
 *   0 -> MFI = 50 every bar. Signal EMA of 50s = 50. mfiPct =
 *   0.
 * - **LINEAR UP step > 0 with V > 0**: TP[i] > TP[i-1] every
 *   bar so only pos counts. NSum = 0 -> MFI = 100 every bar.
 *   Signal EMA of 100s = 100. mfiPct = 0.
 * - **LINEAR DOWN step < 0 with V > 0**: TP[i] < TP[i-1] every
 *   bar so only neg counts. PSum = 0 -> MFI = 0 every bar.
 *   Signal EMA of 0s = 0. mfiPct = 0.
 */

export interface ChartLineMfiCrossPctPoint {
  x: number;
  close: number;
  volume: number;
}

export type ChartLineMfiCrossPctRegime =
  | 'above'
  | 'below'
  | 'at'
  | 'none';

export type ChartLineMfiCrossPctSeriesId =
  | 'price'
  | 'mfi'
  | 'signal'
  | 'pct';

export interface ChartLineMfiCrossPctSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  mfi: number | null;
  signal: number | null;
  mfiPct: number | null;
  regime: ChartLineMfiCrossPctRegime;
}

export interface ChartLineMfiCrossPctRun {
  series: ChartLineMfiCrossPctPoint[];
  length: number;
  signalLength: number;
  mfiValues: Array<number | null>;
  signalValues: Array<number | null>;
  pctValues: Array<number | null>;
  samples: ChartLineMfiCrossPctSample[];
  aboveCount: number;
  belowCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineMfiCrossPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMfiCrossPctLayout {
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
  priceDots: ChartLineMfiCrossPctDot[];
  mfiPath: string;
  signalPath: string;
  pctPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  run: ChartLineMfiCrossPctRun;
}

export interface ChartLineMfiCrossPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMfiCrossPctPoint[];
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
  mfiColor?: string;
  signalColor?: string;
  pctColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMfi?: boolean;
  showSignal?: boolean;
  showPct?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMfiCrossPctSeriesId[];
  defaultHiddenSeries?: ChartLineMfiCrossPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMfiCrossPctSeriesId;
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

export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_LENGTH = 14;
export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_MFI_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_PCT_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MFI_CROSS_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close / volume. */
export function getLineMfiCrossPctFinitePoints(
  data: readonly ChartLineMfiCrossPctPoint[] | null | undefined,
): ChartLineMfiCrossPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMfiCrossPctPoint[] = [];
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
export function normalizeLineMfiCrossPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** SMA-seeded EMA with the precision fix. */
export function applyLineMfiCrossPctEma(
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

export interface LineMfiCrossPctChannels {
  mfi: Array<number | null>;
  signal: Array<number | null>;
  pct: Array<number | null>;
}

export function computeLineMfiCrossPct(
  series: readonly ChartLineMfiCrossPctPoint[] | null | undefined,
  options: { length?: number; signalLength?: number } = {},
): LineMfiCrossPctChannels {
  const cleaned = getLineMfiCrossPctFinitePoints(series);
  if (cleaned.length === 0) {
    return { mfi: [], signal: [], pct: [] };
  }
  const length = normalizeLineMfiCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_MFI_CROSS_PCT_LENGTH,
  );
  const signalLength = normalizeLineMfiCrossPctLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MFI_CROSS_PCT_SIGNAL_LENGTH,
  );

  const tp = cleaned.map((p) => p.close);
  const vol = cleaned.map((p) => p.volume);
  const pos: number[] = new Array(cleaned.length).fill(0);
  const neg: number[] = new Array(cleaned.length).fill(0);
  for (let i = 1; i < cleaned.length; i += 1) {
    const rawMf = tp[i]! * vol[i]!;
    if (tp[i]! > tp[i - 1]!) pos[i] = rawMf;
    else if (tp[i]! < tp[i - 1]!) neg[i] = rawMf;
  }

  const mfi: Array<number | null> = new Array(cleaned.length).fill(null);
  // Window starts at index `length` (need `length` differences:
  // indices 1..length so the window covers diff bars 1..length and
  // the MFI lands at bar `length`).
  for (let i = length; i < cleaned.length; i += 1) {
    let pSum = 0;
    let nSum = 0;
    for (let k = i - length + 1; k <= i; k += 1) {
      pSum += pos[k]!;
      nSum += neg[k]!;
    }
    if (pSum === 0 && nSum === 0) {
      mfi[i] = 50;
    } else if (nSum === 0) {
      mfi[i] = 100;
    } else if (pSum === 0) {
      mfi[i] = 0;
    } else {
      mfi[i] = posZero(100 - 100 / (1 + pSum / nSum));
    }
  }

  const signal = applyLineMfiCrossPctEma(mfi, signalLength);

  const pct: Array<number | null> = new Array(cleaned.length).fill(null);
  for (let i = 0; i < cleaned.length; i += 1) {
    const m = mfi[i];
    const s = signal[i];
    if (m == null || s == null) continue;
    pct[i] = posZero(((m - s) / 100) * 100);
  }

  return { mfi, signal, pct };
}

export function classifyLineMfiCrossPctRegime(
  pct: number | null,
): ChartLineMfiCrossPctRegime {
  if (pct == null) return 'none';
  if (pct > 0) return 'above';
  if (pct < 0) return 'below';
  return 'at';
}

export function runLineMfiCrossPct(
  data: ChartLineMfiCrossPctPoint[],
  options: { length?: number; signalLength?: number } = {},
): ChartLineMfiCrossPctRun {
  const cleaned = getLineMfiCrossPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineMfiCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_MFI_CROSS_PCT_LENGTH,
  );
  const signalLength = normalizeLineMfiCrossPctLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MFI_CROSS_PCT_SIGNAL_LENGTH,
  );

  const channels = computeLineMfiCrossPct(series, { length, signalLength });

  const samples: ChartLineMfiCrossPctSample[] = series.map((p, i) => {
    const mfi = channels.mfi[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const pct = channels.pct[i] ?? null;
    const regime = classifyLineMfiCrossPctRegime(pct);
    return {
      index: i,
      x: p.x,
      close: p.close,
      volume: p.volume,
      mfi,
      signal,
      mfiPct: pct,
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
    series = [],
    length,
    signalLength,
    mfiValues: channels.mfi,
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

export interface ComputeLineMfiCrossPctLayoutOptions {
  data: ChartLineMfiCrossPctPoint[];
  length?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineMfiCrossPctLayout(
  opts: ComputeLineMfiCrossPctLayoutOptions,
): ChartLineMfiCrossPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_MFI_CROSS_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_MFI_CROSS_PCT_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_MFI_CROSS_PCT_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_MFI_CROSS_PCT_PANEL_GAP;

  const run = runLineMfiCrossPct(opts.data, {
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
      mfiPath: '',
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
    if (s.mfi != null) {
      if (s.mfi < oscMin) oscMin = s.mfi;
      if (s.mfi > oscMax) oscMax = s.mfi;
    }
    if (s.signal != null) {
      if (s.signal < oscMin) oscMin = s.signal;
      if (s.signal > oscMax) oscMax = s.signal;
    }
    if (s.mfiPct != null) {
      if (s.mfiPct < oscMin) oscMin = s.mfiPct;
      if (s.mfiPct > oscMax) oscMax = s.mfiPct;
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
  const priceDots: ChartLineMfiCrossPctDot[] = [];
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

  let mfiPath = '';
  let mfiFirst = true;
  for (const s of run.samples) {
    if (s.mfi == null) {
      mfiFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.mfi);
    mfiPath += `${mfiFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    mfiFirst = false;
  }
  mfiPath = mfiPath.trim();

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
    if (s.mfiPct == null) {
      pctFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.mfiPct);
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
    mfiPath,
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

export function describeLineMfiCrossPctChart(
  data: ChartLineMfiCrossPctPoint[],
  options: { length?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineMfiCrossPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineMfiCrossPctLength(
    options.length,
    DEFAULT_CHART_LINE_MFI_CROSS_PCT_LENGTH,
  );
  const signalLength = normalizeLineMfiCrossPctLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MFI_CROSS_PCT_SIGNAL_LENGTH,
  );
  return (
    `MFI Cross Pct chart over ${cleaned.length} bars (length ` +
    `${length}, signalLength ${signalLength}). Top panel renders ` +
    `the close; bottom panel overlays the Money Flow Index with ` +
    `its EMA-smoothed signal line and renders the (MFI - signal) ` +
    `deviation scaled by the 0..100 MFI range to surface volume- ` +
    `weighted momentum magnitude separate from the MFI-over- ` +
    `signal crossings.`
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

export const ChartLineMfiCrossPct = forwardRef<
  HTMLDivElement,
  ChartLineMfiCrossPctProps
>(function ChartLineMfiCrossPct(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_MFI_CROSS_PCT_LENGTH,
    signalLength = DEFAULT_CHART_LINE_MFI_CROSS_PCT_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_MFI_CROSS_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_MFI_CROSS_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_MFI_CROSS_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_MFI_CROSS_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MFI_CROSS_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MFI_CROSS_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MFI_CROSS_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MFI_CROSS_PCT_PRICE_COLOR,
    mfiColor = DEFAULT_CHART_LINE_MFI_CROSS_PCT_MFI_COLOR,
    signalColor = DEFAULT_CHART_LINE_MFI_CROSS_PCT_SIGNAL_COLOR,
    pctColor = DEFAULT_CHART_LINE_MFI_CROSS_PCT_PCT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_MFI_CROSS_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_MFI_CROSS_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MFI_CROSS_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMfi = true,
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
    () => getLineMfiCrossPctFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineMfiCrossPctLayout({
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
    ChartLineMfiCrossPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineMfiCrossPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineMfiCrossPctSeriesId,
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
        data-section="chart-line-mfi-cross-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineMfiCrossPctChart(cleaned, { length, signalLength });

  const showPrice = !hidden.has('price');
  const showMfiLine = !hidden.has('mfi') && showMfi;
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
      aria-label={ariaLabel ?? 'MFI Cross Percent chart'}
      aria-describedby={descId}
      data-section="chart-line-mfi-cross-pct"
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
        data-section="chart-line-mfi-cross-pct-title"
      >
        {ariaLabel ?? 'MFI Cross Percent chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-mfi-cross-pct-aria-desc"
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
        data-section="chart-line-mfi-cross-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-mfi-cross-pct-grid">
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
                  data-section="chart-line-mfi-cross-pct-grid-line-price"
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
                  data-section="chart-line-mfi-cross-pct-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-mfi-cross-pct-axes">
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
                  data-section="chart-line-mfi-cross-pct-tick-price"
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
                  data-section="chart-line-mfi-cross-pct-tick-osc"
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
            data-section="chart-line-mfi-cross-pct-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-mfi-cross-pct-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-mfi-cross-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-mfi-cross-pct-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showMfiLine ? (
          <path
            d={layout.mfiPath}
            stroke={mfiColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-mfi-cross-pct-mfi-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-mfi-cross-pct-signal-path"
          />
        ) : null}

        {showPctLine ? (
          <path
            d={layout.pctPath}
            stroke={pctColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-mfi-cross-pct-pct-path"
          />
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-mfi-cross-pct-hover-targets">
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
                data-section="chart-line-mfi-cross-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-mfi-cross-pct-tooltip"
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
                  data-section="chart-line-mfi-cross-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-cross-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-cross-pct-tooltip-mfi"
                >
                  mfi{' '}
                  {tooltipSample.mfi == null
                    ? '--'
                    : formatOsc(tooltipSample.mfi)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-cross-pct-tooltip-signal"
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
                  data-section="chart-line-mfi-cross-pct-tooltip-pct"
                >
                  mfiPct{' '}
                  {tooltipSample.mfiPct == null
                    ? '--'
                    : formatOsc(tooltipSample.mfiPct)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-cross-pct-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-cross-pct-tooltip-counts"
                >
                  above {layout.run.aboveCount} | below{' '}
                  {layout.run.belowCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-cross-pct-tooltip-counts2"
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
          data-section="chart-line-mfi-cross-pct-badge"
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
          data-section="chart-line-mfi-cross-pct-legend"
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
              { id: 'mfi' as const, color: mfiColor, label: 'mfi' },
              {
                id: 'signal' as const,
                color: signalColor,
                label: 'signal',
              },
              { id: 'pct' as const, color: pctColor, label: 'mfiPct' },
            ] satisfies Array<{
              id: ChartLineMfiCrossPctSeriesId;
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

ChartLineMfiCrossPct.displayName = 'ChartLineMfiCrossPct';
