import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_TDI_WIDTH = 560;
export const DEFAULT_CHART_LINE_TDI_HEIGHT = 360;
export const DEFAULT_CHART_LINE_TDI_PADDING = 40;
export const DEFAULT_CHART_LINE_TDI_GAP = 12;
export const DEFAULT_CHART_LINE_TDI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TDI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TDI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TDI_RSI_PERIOD = 13;
export const DEFAULT_CHART_LINE_TDI_SIGNAL_PERIOD = 7;
export const DEFAULT_CHART_LINE_TDI_BAND_PERIOD = 34;
export const DEFAULT_CHART_LINE_TDI_BAND_MULTIPLIER = 1.6185;
export const DEFAULT_CHART_LINE_TDI_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_TDI_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_TDI_RSI_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TDI_SIGNAL_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TDI_BAND_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TDI_REF_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TDI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TDI_AXIS_COLOR = '#cbd5e1';

export type ChartLineTdiCross = 'bullish' | 'bearish' | 'neutral';

export interface ChartLineTdiPoint {
  x: number;
  value: number;
}

export interface ChartLineTdiBand {
  middle: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
}

export interface ChartLineTdiSeries {
  rsi: (number | null)[];
  signal: (number | null)[];
  bandMiddle: (number | null)[];
  bandUpper: (number | null)[];
  bandLower: (number | null)[];
}

export interface ChartLineTdiSample {
  index: number;
  x: number;
  value: number;
  rsi: number | null;
  signal: number | null;
  bandUpper: number | null;
  bandLower: number | null;
  cross: ChartLineTdiCross;
}

export interface ChartLineTdiRun {
  series: ChartLineTdiPoint[];
  rsiPeriod: number;
  signalPeriod: number;
  bandPeriod: number;
  multiplier: number;
  rsi: (number | null)[];
  signal: (number | null)[];
  bandUpper: (number | null)[];
  bandLower: (number | null)[];
  samples: ChartLineTdiSample[];
  rsiFinal: number;
  signalFinal: number;
  bullishCount: number;
  bearishCount: number;
  ok: boolean;
}

export interface ChartLineTdiPriceDot {
  index: number;
  x: number;
  value: number;
  rsi: number | null;
  signal: number | null;
  cross: ChartLineTdiCross;
  px: number;
  py: number;
}

export interface ChartLineTdiMarker {
  index: number;
  x: number;
  rsi: number;
  cross: ChartLineTdiCross;
  px: number;
  py: number;
}

export interface ChartLineTdiPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineTdiLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineTdiPanel;
  tdiPanel: ChartLineTdiPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  tdiYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  tdiYMin: number;
  tdiYMax: number;
  pricePath: string;
  priceDots: ChartLineTdiPriceDot[];
  rsiPath: string;
  signalPath: string;
  bandAreaPath: string;
  rsiMarkers: ChartLineTdiMarker[];
  refY: number;
  rsiPeriod: number;
  signalPeriod: number;
  bandPeriod: number;
  rsiFinal: number;
  signalFinal: number;
  bullishCount: number;
  bearishCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineTdiLayoutOptions {
  data: readonly ChartLineTdiPoint[];
  rsiPeriod?: number;
  signalPeriod?: number;
  bandPeriod?: number;
  multiplier?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineTdiProps {
  data: readonly ChartLineTdiPoint[];
  rsiPeriod?: number;
  signalPeriod?: number;
  bandPeriod?: number;
  multiplier?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  rsiColor?: string;
  signalColor?: string;
  bandColor?: string;
  refColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRsi?: boolean;
  showSignal?: boolean;
  showBand?: boolean;
  showRefLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineTdiPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineTdiFinitePoints(
  points: readonly ChartLineTdiPoint[] | null | undefined,
): ChartLineTdiPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineTdiPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a Traders Dynamic Index period to a positive integer. A
 * non-finite or sub-1 value falls back to `fallback`; a fractional
 * value floors.
 */
export function normalizeLineTdiPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The RSI of the close, using a simple moving average of the bar
 * gains and losses (Cutler's RSI):
 *
 *   RSI[i] = 100 * avgGain / (avgGain + avgLoss)
 *
 * over the trailing `period` bars. A window with no movement at
 * all reads 50. Bars before the window is full are null.
 */
export function computeLineTdiRsi(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLineTdiPeriod(period, DEFAULT_CHART_LINE_TDI_RSI_PERIOD);
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p + 1) return out;
  const gains: number[] = new Array(n).fill(0);
  const losses: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    const cur = closes[i];
    const prev = closes[i - 1];
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) continue;
    const d = cur - prev;
    if (d > 0) gains[i] = d;
    else if (d < 0) losses[i] = -d;
  }
  for (let i = p; i < n; i += 1) {
    let gSum = 0;
    let lSum = 0;
    for (let k = 0; k < p; k += 1) {
      gSum += gains[i - k] ?? 0;
      lSum += losses[i - k] ?? 0;
    }
    const total = gSum + lSum;
    out[i] = total > 0 ? (100 * gSum) / total : 50;
  }
  return out;
}

/**
 * The `period`-bar simple moving average of a (nullable) series. A
 * window containing a null is null.
 */
export function computeLineTdiSma(
  values: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineTdiPeriod(period, DEFAULT_CHART_LINE_TDI_SIGNAL_PERIOD);
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const v = values[i - k];
      if (!isFiniteNumber(v)) {
        valid = false;
        break;
      }
      sum += v;
    }
    out[i] = valid ? sum / p : null;
  }
  return out;
}

/**
 * The volatility band on the RSI -- a Bollinger band: the middle is
 * the `period`-bar moving average of the RSI, the upper and lower
 * sit `multiplier` population standard deviations above and below.
 */
export function computeLineTdiBand(
  rsi: readonly (number | null)[] | null | undefined,
  period: number,
  multiplier: number,
): ChartLineTdiBand {
  if (!Array.isArray(rsi)) return { middle: [], upper: [], lower: [] };
  const p = normalizeLineTdiPeriod(period, DEFAULT_CHART_LINE_TDI_BAND_PERIOD);
  const m =
    isFiniteNumber(multiplier) && multiplier >= 0
      ? multiplier
      : DEFAULT_CHART_LINE_TDI_BAND_MULTIPLIER;
  const middle = computeLineTdiSma(rsi, p);
  const n = rsi.length;
  const upper: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    const mid = middle[i];
    if (!isFiniteNumber(mid)) continue;
    let sq = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const v = rsi[i - k];
      if (!isFiniteNumber(v)) {
        valid = false;
        break;
      }
      sq += (v - mid) * (v - mid);
    }
    if (!valid) continue;
    const std = Math.sqrt(sq / p);
    upper[i] = mid + m * std;
    lower[i] = mid - m * std;
  }
  return { middle, upper, lower };
}

/**
 * The full Traders Dynamic Index pipeline: the RSI of the close, a
 * `signalPeriod` moving average of that RSI, and a `bandPeriod`
 * volatility band around the RSI.
 */
export function computeLineTdi(
  closes: readonly number[] | null | undefined,
  rsiPeriod: number,
  signalPeriod: number,
  bandPeriod: number,
  multiplier: number,
): ChartLineTdiSeries {
  if (!Array.isArray(closes)) {
    return {
      rsi: [],
      signal: [],
      bandMiddle: [],
      bandUpper: [],
      bandLower: [],
    };
  }
  const rsi = computeLineTdiRsi(closes, rsiPeriod);
  const signal = computeLineTdiSma(rsi, signalPeriod);
  const band = computeLineTdiBand(rsi, bandPeriod, multiplier);
  return {
    rsi,
    signal,
    bandMiddle: band.middle,
    bandUpper: band.upper,
    bandLower: band.lower,
  };
}

function classifyCross(
  rsi: number | null,
  signal: number | null,
): ChartLineTdiCross {
  if (rsi === null || signal === null) return 'neutral';
  if (rsi > signal) return 'bullish';
  if (rsi < signal) return 'bearish';
  return 'neutral';
}

export function runLineTdi(
  points: readonly ChartLineTdiPoint[] | null | undefined,
  options?: {
    rsiPeriod?: number;
    signalPeriod?: number;
    bandPeriod?: number;
    multiplier?: number;
  },
): ChartLineTdiRun {
  const finite = getLineTdiFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const rsiPeriod = normalizeLineTdiPeriod(
    options?.rsiPeriod ?? DEFAULT_CHART_LINE_TDI_RSI_PERIOD,
    DEFAULT_CHART_LINE_TDI_RSI_PERIOD,
  );
  const signalPeriod = normalizeLineTdiPeriod(
    options?.signalPeriod ?? DEFAULT_CHART_LINE_TDI_SIGNAL_PERIOD,
    DEFAULT_CHART_LINE_TDI_SIGNAL_PERIOD,
  );
  const bandPeriod = normalizeLineTdiPeriod(
    options?.bandPeriod ?? DEFAULT_CHART_LINE_TDI_BAND_PERIOD,
    DEFAULT_CHART_LINE_TDI_BAND_PERIOD,
  );
  const multiplier =
    isFiniteNumber(options?.multiplier) && (options?.multiplier ?? -1) >= 0
      ? (options?.multiplier as number)
      : DEFAULT_CHART_LINE_TDI_BAND_MULTIPLIER;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      rsiPeriod,
      signalPeriod,
      bandPeriod,
      multiplier,
      rsi: [],
      signal: [],
      bandUpper: [],
      bandLower: [],
      samples: [],
      rsiFinal: NaN,
      signalFinal: NaN,
      bullishCount: 0,
      bearishCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const { rsi, signal, bandUpper, bandLower } = computeLineTdi(
    closes,
    rsiPeriod,
    signalPeriod,
    bandPeriod,
    multiplier,
  );

  const samples: ChartLineTdiSample[] = series.map((p, i) => {
    const r = rsi[i] ?? null;
    const s = signal[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      rsi: r,
      signal: s,
      bandUpper: bandUpper[i] ?? null,
      bandLower: bandLower[i] ?? null,
      cross: classifyCross(r, s),
    };
  });

  let bullishCount = 0;
  let bearishCount = 0;
  let rFinal = NaN;
  let sFinal = NaN;
  for (const s of samples) {
    if (s.cross === 'bullish') bullishCount += 1;
    else if (s.cross === 'bearish') bearishCount += 1;
    if (s.rsi !== null) rFinal = s.rsi;
    if (s.signal !== null) sFinal = s.signal;
  }

  return {
    series = [],
    rsiPeriod,
    signalPeriod,
    bandPeriod,
    multiplier,
    rsi,
    signal,
    bandUpper,
    bandLower,
    samples,
    rsiFinal: rFinal,
    signalFinal: sFinal,
    bullishCount,
    bearishCount,
    ok: true,
  };
}

function buildPath(points: readonly { px: number; py: number }[]): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  return parts.join(' ');
}

function normaliseHidden(
  hidden: ReadonlySet<string> | readonly string[] | null | undefined,
): Set<string> {
  if (!hidden) return new Set();
  if (hidden instanceof Set) return new Set(hidden);
  if (Array.isArray(hidden)) return new Set(hidden);
  return new Set();
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function computeLineTdiLayout(
  options: ComputeLineTdiLayoutOptions,
): ChartLineTdiLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_TDI_GAP,
    tickCount = DEFAULT_CHART_LINE_TDI_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_TDI_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineTdi(data, {
    ...(isFiniteNumber(options.rsiPeriod)
      ? { rsiPeriod: options.rsiPeriod }
      : {}),
    ...(isFiniteNumber(options.signalPeriod)
      ? { signalPeriod: options.signalPeriod }
      : {}),
    ...(isFiniteNumber(options.bandPeriod)
      ? { bandPeriod: options.bandPeriod }
      : {}),
    ...(isFiniteNumber(options.multiplier)
      ? { multiplier: options.multiplier }
      : {}),
  });

  const emptyPanel: ChartLineTdiPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineTdiLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    tdiPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    tdiYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    tdiYMin: 0,
    tdiYMax: 0,
    pricePath: '',
    priceDots: [],
    rsiPath: '',
    signalPath: '',
    bandAreaPath: '',
    rsiMarkers: [],
    refY: 0,
    rsiPeriod: run.rsiPeriod,
    signalPeriod: run.signalPeriod,
    bandPeriod: run.bandPeriod,
    rsiFinal: NaN,
    signalFinal: NaN,
    bullishCount: 0,
    bearishCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const tdiHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineTdiPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const tdiPanel: ChartLineTdiPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: tdiHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  let tdiLo = Number.POSITIVE_INFINITY;
  let tdiHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < priceLo) priceLo = s.value;
    if (s.value > priceHi) priceHi = s.value;
    for (const v of [s.rsi, s.signal, s.bandUpper, s.bandLower]) {
      if (v !== null) {
        if (v < tdiLo) tdiLo = v;
        if (v > tdiHi) tdiHi = v;
      }
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }
  if (!isFiniteNumber(tdiLo) || !isFiniteNumber(tdiHi) || tdiLo === tdiHi) {
    tdiLo = 0;
    tdiHi = 100;
  }

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const tdiRange = tdiHi - tdiLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectTdiY = (v: number): number =>
    tdiPanel.y + tdiPanel.height - ((v - tdiLo) / tdiRange) * tdiPanel.height;

  const priceDots: ChartLineTdiPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    rsi: s.rsi,
    signal: s.signal,
    cross: s.cross,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const rsiPts: { px: number; py: number }[] = [];
  const signalPts: { px: number; py: number }[] = [];
  const upperPts: { px: number; py: number }[] = [];
  const lowerPts: { px: number; py: number }[] = [];
  const rsiMarkers: ChartLineTdiMarker[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    if (s.rsi !== null) {
      const py = projectTdiY(s.rsi);
      rsiPts.push({ px, py });
      rsiMarkers.push({
        index: s.index,
        x: s.x,
        rsi: s.rsi,
        cross: s.cross,
        px,
        py,
      });
    }
    if (s.signal !== null) signalPts.push({ px, py: projectTdiY(s.signal) });
    if (s.bandUpper !== null) {
      upperPts.push({ px, py: projectTdiY(s.bandUpper) });
    }
    if (s.bandLower !== null) {
      lowerPts.push({ px, py: projectTdiY(s.bandLower) });
    }
  }

  let bandAreaPath = '';
  if (upperPts.length > 0 && upperPts.length === lowerPts.length) {
    const forward = upperPts
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`,
      )
      .join(' ');
    const back = [...lowerPts]
      .reverse()
      .map((p) => `L ${p.px.toFixed(3)} ${p.py.toFixed(3)}`)
      .join(' ');
    bandAreaPath = `${forward} ${back} Z`;
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    tdiPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    tdiYTicks: computeTicks(tdiLo, tdiHi, tickCount).map((v) => ({
      value: v,
      py: projectTdiY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    tdiYMin: tdiLo,
    tdiYMax: tdiHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    rsiPath: buildPath(rsiPts),
    signalPath: buildPath(signalPts),
    bandAreaPath,
    rsiMarkers,
    refY: projectTdiY(50),
    rsiPeriod: run.rsiPeriod,
    signalPeriod: run.signalPeriod,
    bandPeriod: run.bandPeriod,
    rsiFinal: run.rsiFinal,
    signalFinal: run.signalFinal,
    bullishCount: run.bullishCount,
    bearishCount: run.bearishCount,
    totalPoints: run.samples.length,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineTdiChart(
  data: readonly ChartLineTdiPoint[] | null | undefined,
  options?: {
    rsiPeriod?: number;
    signalPeriod?: number;
    bandPeriod?: number;
    multiplier?: number;
  },
): string {
  const run = runLineTdi(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Traders Dynamic Index (rsi ${run.rsiPeriod}, signal ${run.signalPeriod}, band ${run.bandPeriod}): the top panel plots the raw price; the bottom panel plots the TDI. The TDI combines an RSI line of the close, a smoothed signal line -- a ${run.signalPeriod}-bar moving average of that RSI -- and a volatility band, a Bollinger band on the RSI. When the RSI line is above the signal the trend is bullish, below it bearish; the band shows how volatile the RSI itself has been. The RSI reads bullish on ${run.bullishCount} bars and bearish on ${run.bearishCount} across ${run.samples.length} bars.`;
}

const TDI_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineTdi = forwardRef<HTMLDivElement, ChartLineTdiProps>(
  function ChartLineTdi(
    props: ChartLineTdiProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      rsiPeriod,
      signalPeriod,
      bandPeriod,
      multiplier,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_TDI_WIDTH,
      height = DEFAULT_CHART_LINE_TDI_HEIGHT,
      padding = DEFAULT_CHART_LINE_TDI_PADDING,
      gap = DEFAULT_CHART_LINE_TDI_GAP,
      tickCount = DEFAULT_CHART_LINE_TDI_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_TDI_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_TDI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_TDI_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_TDI_PRICE_COLOR,
      rsiColor = DEFAULT_CHART_LINE_TDI_RSI_COLOR,
      signalColor = DEFAULT_CHART_LINE_TDI_SIGNAL_COLOR,
      bandColor = DEFAULT_CHART_LINE_TDI_BAND_COLOR,
      refColor = DEFAULT_CHART_LINE_TDI_REF_COLOR,
      gridColor = DEFAULT_CHART_LINE_TDI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_TDI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showRsi = true,
      showSignal = true,
      showBand = true,
      showRefLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a Traders Dynamic Index',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      onPointClick,
      onSeriesToggle,
      style,
    } = props;

    const reactId = useId();
    const descId = `${reactId}-desc`;

    const isControlled = controlledHidden !== undefined;
    const [uncontrolled, setUncontrolled] = useState<Set<string>>(() =>
      normaliseHidden(defaultHiddenSeries),
    );
    const hiddenSet = isControlled
      ? normaliseHidden(controlledHidden)
      : uncontrolled;

    const layout = useMemo(
      () =>
        computeLineTdiLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
          ...(isFiniteNumber(rsiPeriod) ? { rsiPeriod } : {}),
          ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
          ...(isFiniteNumber(bandPeriod) ? { bandPeriod } : {}),
          ...(isFiniteNumber(multiplier) ? { multiplier } : {}),
        }),
      [
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        rsiPeriod,
        signalPeriod,
        bandPeriod,
        multiplier,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineTdiChart(data, {
          ...(isFiniteNumber(rsiPeriod) ? { rsiPeriod } : {}),
          ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
          ...(isFiniteNumber(bandPeriod) ? { bandPeriod } : {}),
          ...(isFiniteNumber(multiplier) ? { multiplier } : {}),
        }),
      [ariaDescription, data, rsiPeriod, signalPeriod, bandPeriod, multiplier],
    );

    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{
      px: number;
      py: number;
    } | null>(null);

    const clearHover = useCallback(() => {
      setHoverIndex(null);
      setTooltipPos(null);
    }, []);

    const handleToggle = useCallback(
      (seriesId: string) => {
        const next = new Set(hiddenSet);
        const willHide = !next.has(seriesId);
        if (willHide) next.add(seriesId);
        else next.delete(seriesId);
        if (!isControlled) setUncontrolled(next);
        onHiddenSeriesChange?.(next);
        onSeriesToggle?.({ seriesId, hidden: willHide });
      },
      [hiddenSet, isControlled, onHiddenSeriesChange, onSeriesToggle],
    );

    const containerStyle: CSSProperties = {
      width,
      height,
      position: 'relative',
      ...(style ?? {}),
    };

    if (!layout.ok) {
      return (
        <div
          ref={ref}
          role="region"
          aria-label={ariaLabel}
          aria-describedby={descId}
          className={className}
          style={containerStyle}
          data-section="chart-line-tdi"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-tdi-aria-desc"
            style={TDI_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const tp = layout.tdiPanel;
    const priceVisible = !hiddenSet.has('price');
    const rsiVisible = showRsi && !hiddenSet.has('rsi');
    const signalVisible = showSignal && !hiddenSet.has('signal');
    const bandVisible = showBand && !hiddenSet.has('band');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'rsi', label: 'RSI', color: rsiColor },
      { id: 'signal', label: 'Signal', color: signalColor },
      { id: 'band', label: 'Band', color: bandColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={
          [className, animateClass].filter(Boolean).join(' ') || undefined
        }
        style={containerStyle}
        data-section="chart-line-tdi"
        data-empty="false"
        data-rsi-period={layout.rsiPeriod}
        data-signal-period={layout.signalPeriod}
        data-band-period={layout.bandPeriod}
        data-rsi-final={layout.rsiFinal}
        data-signal-final={layout.signalFinal}
        data-bullish-count={layout.bullishCount}
        data-bearish-count={layout.bearishCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-tdi-aria-desc"
          style={TDI_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-tdi-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-tdi-badge"
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                padding: '2px 6px',
                borderRadius: 4,
                background: '#ffffffd9',
                color: '#0f172a',
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                gap: 4,
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <span
                data-section="chart-line-tdi-badge-icon"
                aria-hidden="true"
                style={{ color: rsiColor }}
              >
                TDI
              </span>
              <span data-section="chart-line-tdi-badge-config">
                {layout.rsiPeriod}/{layout.signalPeriod}/{layout.bandPeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-tdi-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-tdi-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-tdi-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.tdiYTicks.map((t, i) => (
                  <line
                    key={`gt-${i}`}
                    data-section="chart-line-tdi-grid-line"
                    data-panel="tdi"
                    x1={tp.x}
                    x2={tp.x + tp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-tdi-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-tdi-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-tdi-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-tdi-axis"
                  data-panel="tdi"
                  data-axis="y"
                  x1={tp.x}
                  y1={tp.y}
                  x2={tp.x}
                  y2={tp.y + tp.height}
                />
                <line
                  data-section="chart-line-tdi-axis"
                  data-panel="tdi"
                  data-axis="x"
                  x1={tp.x}
                  y1={tp.y + tp.height}
                  x2={tp.x + tp.width}
                  y2={tp.y + tp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-tdi-tick-label"
                    data-panel="price"
                    data-axis="y"
                    x={pp.x - 6}
                    y={t.py + 3}
                    textAnchor="end"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatValue(t.value)}
                  </text>
                ))}
                {layout.tdiYTicks.map((t, i) => (
                  <text
                    key={`tyt-${i}`}
                    data-section="chart-line-tdi-tick-label"
                    data-panel="tdi"
                    data-axis="y"
                    x={tp.x - 6}
                    y={t.py + 3}
                    textAnchor="end"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatValue(t.value)}
                  </text>
                ))}
                {layout.xTicks.map((t, i) => (
                  <text
                    key={`xt-${i}`}
                    data-section="chart-line-tdi-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={tp.y + tp.height + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatX(t.value)}
                  </text>
                ))}
              </g>
            ) : null}

            <text
              data-section="chart-line-tdi-panel-label"
              data-panel="price"
              x={pp.x + 2}
              y={pp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Price
            </text>
            <text
              data-section="chart-line-tdi-panel-label"
              data-panel="tdi"
              x={tp.x + 2}
              y={tp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              TDI
            </text>

            {showRefLine ? (
              <line
                data-section="chart-line-tdi-ref-line"
                x1={tp.x}
                x2={tp.x + tp.width}
                y1={layout.refY}
                y2={layout.refY}
                stroke={refColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {bandVisible && layout.bandAreaPath ? (
              <path
                data-section="chart-line-tdi-band-area"
                d={layout.bandAreaPath}
                fill={bandColor}
                fillOpacity={0.14}
                stroke="none"
              />
            ) : null}

            {signalVisible && layout.signalPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="TDI signal line"
                data-section="chart-line-tdi-signal-line"
                d={layout.signalPath}
                fill="none"
                stroke={signalColor}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {rsiVisible && layout.rsiPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="TDI RSI line"
                data-section="chart-line-tdi-rsi-line"
                d={layout.rsiPath}
                fill="none"
                stroke={rsiColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-tdi-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-tdi-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-tdi-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.value}
                      cx={d.px}
                      cy={d.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={priceColor}
                      stroke="#ffffff"
                      strokeWidth={1}
                      onMouseEnter={() => {
                        setHoverIndex(d.index);
                        setTooltipPos({ px: d.px, py: d.py });
                      }}
                      onMouseLeave={clearHover}
                      onFocus={() => {
                        setHoverIndex(d.index);
                        setTooltipPos({ px: d.px, py: d.py });
                      }}
                      onBlur={clearHover}
                      onClick={() => onPointClick?.({ point: d })}
                    />
                  );
                })}
              </g>
            ) : null}

            {rsiVisible ? (
              <g data-section="chart-line-tdi-markers">
                {layout.rsiMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`TDI RSI at x ${formatX(m.x)}: ${formatValue(m.rsi)}, ${m.cross}`}
                      data-section="chart-line-tdi-marker"
                      data-point-index={m.index}
                      data-rsi={m.rsi}
                      data-cross={m.cross}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={rsiColor}
                      stroke="#ffffff"
                      strokeWidth={1}
                      onMouseEnter={() => {
                        setHoverIndex(m.index);
                        setTooltipPos({ px: m.px, py: m.py });
                      }}
                      onMouseLeave={clearHover}
                      onFocus={() => {
                        setHoverIndex(m.index);
                        setTooltipPos({ px: m.px, py: m.py });
                      }}
                      onBlur={clearHover}
                      onClick={() => {
                        const d = layout.priceDots.find(
                          (x) => x.index === m.index,
                        );
                        if (d) onPointClick?.({ point: d });
                      }}
                    />
                  );
                })}
              </g>
            ) : null}
          </svg>

          {showTooltip && hoverIndex !== null && tooltipPos
            ? (() => {
                const d = layout.priceDots.find((x) => x.index === hoverIndex);
                if (!d) return null;
                return (
                  <div
                    data-section="chart-line-tdi-tooltip"
                    data-point-index={d.index}
                    style={{
                      position: 'absolute',
                      left: tooltipPos.px + 8,
                      top: tooltipPos.py + 8,
                      background: '#0f172a',
                      color: '#f8fafc',
                      padding: '6px 8px',
                      fontSize: 11,
                      borderRadius: 4,
                      pointerEvents: 'none',
                      minWidth: 150,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div data-section="chart-line-tdi-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-tdi-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-tdi-tooltip-rsi">
                      rsi: {fmtNullable(d.rsi)}
                    </div>
                    <div data-section="chart-line-tdi-tooltip-signal">
                      signal: {fmtNullable(d.signal)}
                    </div>
                    <div data-section="chart-line-tdi-tooltip-cross">
                      cross: {d.cross}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-tdi-legend"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 8,
              alignItems: 'center',
            }}
          >
            {legendItems.map((item) => {
              const isHidden = hiddenSet.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  data-section="chart-line-tdi-legend-item"
                  data-series-id={item.id}
                  data-hidden={isHidden ? 'true' : 'false'}
                  onClick={() => handleToggle(item.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    opacity: isHidden ? 0.5 : 1,
                  }}
                >
                  <span
                    data-section="chart-line-tdi-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-tdi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-tdi-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.bullishCount} bullish, {layout.bearishCount} bearish
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineTdi.displayName = 'ChartLineTdi';
