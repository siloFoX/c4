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
 * ChartLineRelativeVigorSignal -- pure-SVG dual-panel chart with
 * the close on top and the Relative Vigor Index signal-line
 * oscillator on the bottom.
 *
 *   co[i]        = close[i] - open[i]
 *   hl[i]        = high[i]  - low[i]
 *   coSwma[i]    = SWMA(co, 4)[i] = (co[i] + 2*co[i-1] + 2*co[i-2] + co[i-3]) / 6
 *   hlSwma[i]    = SWMA(hl, 4)[i]
 *   sumCo[i]     = sum(coSwma[i - length + 1 .. i])
 *   sumHl[i]     = sum(hlSwma[i - length + 1 .. i])
 *   rvi[i]       = sumHl[i] === 0 ? null : sumCo[i] / sumHl[i]
 *   signal[i]    = SWMA(rvi, 4)[i]
 *
 * The signal line is the canonical Ehlers Relative Vigor Index
 * trigger -- one more 4-bar symmetrically-weighted smoothing on top
 * of the raw RVI. Output is approximately bounded in `[-1, 1]` for
 * well-formed OHLC data.
 *
 * Warmup is `length + 5` bars (SWMA(4) on co/hl needs 3 bars,
 * rolling sum needs `length - 1` more, signal SWMA(4) on rvi needs
 * another 3).
 *
 * Bit-exact anchors:
 * - **CONST OHLC = K**: `co = 0`, `hl = 0`; rolling sums are zero,
 *   so `rvi = 0 / 0 = null` (divide-by-zero guard) and `signal =
 *   null`.
 * - **CONSTANT-SPREAD close = open + D, high = low + R with R > 0**:
 *   `coSwma = 6 * D / 6 = D`, `hlSwma = R`. Sums are `L * D` and
 *   `L * R`; rvi = `D / R`. SWMA of a constant is the constant, so
 *   `signal = D / R` bit-exact for dyadic ratios. Tested
 *   `D / R in {0, 0.5, 1, -0.5, -1}` -> `signal in {0, 0.5, 1, -0.5,
 *   -1}`.
 */

export interface ChartLineRelativeVigorSignalPoint {
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineRelativeVigorSignalZone =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineRelativeVigorSignalCross = 'up' | 'down' | null;

export type ChartLineRelativeVigorSignalSeriesId =
  | 'price'
  | 'rvi'
  | 'signal';

export interface ChartLineRelativeVigorSignalSample {
  index: number;
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
  coSwma: number | null;
  hlSwma: number | null;
  sumCo: number | null;
  sumHl: number | null;
  rvi: number | null;
  signal: number | null;
  zone: ChartLineRelativeVigorSignalZone;
  crossed: ChartLineRelativeVigorSignalCross;
}

export interface ChartLineRelativeVigorSignalRun {
  series: ChartLineRelativeVigorSignalPoint[];
  length: number;
  bullishThreshold: number;
  bearishThreshold: number;
  coSwmaValues: Array<number | null>;
  hlSwmaValues: Array<number | null>;
  sumCoValues: Array<number | null>;
  sumHlValues: Array<number | null>;
  rviValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineRelativeVigorSignalSample[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineRelativeVigorSignalMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  signal: number;
  crossed: 'up' | 'down';
}

export interface ChartLineRelativeVigorSignalDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineRelativeVigorSignalLayout {
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
  priceDots: ChartLineRelativeVigorSignalDot[];
  rviPath: string;
  signalPath: string;
  bullishY: number;
  bearishY: number;
  zeroY: number;
  markers: ChartLineRelativeVigorSignalMarker[];
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  run: ChartLineRelativeVigorSignalRun;
}

export interface ChartLineRelativeVigorSignalProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRelativeVigorSignalPoint[];
  length?: number;
  bullishThreshold?: number;
  bearishThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  rviColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRvi?: boolean;
  showSignal?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRelativeVigorSignalSeriesId[];
  defaultHiddenSeries?: ChartLineRelativeVigorSignalSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRelativeVigorSignalSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineRelativeVigorSignalSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatOsc?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_WIDTH = 720;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_HEIGHT = 460;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_PADDING = 44;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_LENGTH = 10;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_BULLISH_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_BEARISH_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_RVI_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_SIGNAL_COLOR = '#14b8a6';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite OHLC fields. */
export function getLineRelativeVigorSignalFinitePoints(
  data:
    | readonly ChartLineRelativeVigorSignalPoint[]
    | null
    | undefined,
): ChartLineRelativeVigorSignalPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRelativeVigorSignalPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.open) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
    ) {
      out.push({
        x: point.x,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
      });
    }
  }
  return out;
}

/** Coerce a positive integer lookback length (>= 1). */
export function normalizeLineRelativeVigorSignalLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a threshold value in [-1, 1]. */
export function normalizeLineRelativeVigorSignalThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= -1 && threshold <= 1) {
    return threshold;
  }
  return fallback;
}

/**
 * Ehlers' 4-bar symmetrically-weighted moving average:
 *   SWMA(v, 4)[i] = (v[i] + 2 * v[i-1] + 2 * v[i-2] + v[i-3]) / 6
 * Returns null for `i < 3` or when any of the four values is null.
 */
export function applyLineRelativeVigorSignalSwma(
  values: readonly (number | null)[],
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < 3) {
      out.push(null);
      continue;
    }
    const v0 = values[i];
    const v1 = values[i - 1];
    const v2 = values[i - 2];
    const v3 = values[i - 3];
    if (
      v0 == null ||
      v1 == null ||
      v2 == null ||
      v3 == null ||
      !isFiniteNumber(v0) ||
      !isFiniteNumber(v1) ||
      !isFiniteNumber(v2) ||
      !isFiniteNumber(v3)
    ) {
      out.push(null);
      continue;
    }
    out.push(posZero((v0 + 2 * v1 + 2 * v2 + v3) / 6));
  }
  return out;
}

/** Rolling sum across a window of length bars. */
export function applyLineRelativeVigorSignalRollingSum(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? posZero(sum) : null);
  }
  return out;
}

export interface LineRelativeVigorSignalChannels {
  coSwma: Array<number | null>;
  hlSwma: Array<number | null>;
  sumCo: Array<number | null>;
  sumHl: Array<number | null>;
  rvi: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineRelativeVigorSignal(
  series:
    | readonly ChartLineRelativeVigorSignalPoint[]
    | null
    | undefined,
  options: { length?: number } = {},
): LineRelativeVigorSignalChannels {
  const cleaned = getLineRelativeVigorSignalFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      coSwma: [],
      hlSwma: [],
      sumCo: [],
      sumHl: [],
      rvi: [],
      signal: [],
    };
  }
  const length = normalizeLineRelativeVigorSignalLength(
    options.length,
    DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_LENGTH,
  );

  const co: Array<number | null> = cleaned.map((p) =>
    posZero(p.close - p.open),
  );
  const hl: Array<number | null> = cleaned.map((p) =>
    posZero(p.high - p.low),
  );

  const coSwma = applyLineRelativeVigorSignalSwma(co);
  const hlSwma = applyLineRelativeVigorSignalSwma(hl);
  const sumCo = applyLineRelativeVigorSignalRollingSum(coSwma, length);
  const sumHl = applyLineRelativeVigorSignalRollingSum(hlSwma, length);

  const rvi: Array<number | null> = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const c = sumCo[i];
    const h = sumHl[i];
    if (c == null || h == null) {
      rvi.push(null);
      continue;
    }
    if (h === 0) {
      rvi.push(null);
      continue;
    }
    const raw = c / h;
    rvi.push(Number.isFinite(raw) ? posZero(raw) : null);
  }

  const signal = applyLineRelativeVigorSignalSwma(rvi);

  return { coSwma, hlSwma, sumCo, sumHl, rvi, signal };
}

export function classifyLineRelativeVigorSignalZone(
  value: number | null,
  bullishThreshold: number,
  bearishThreshold: number,
): ChartLineRelativeVigorSignalZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > bullishThreshold) return 'bullish';
  if (value < bearishThreshold) return 'bearish';
  return 'neutral';
}

export function detectLineRelativeVigorSignalCrosses(
  values: readonly (number | null)[],
  bullishThreshold: number,
  bearishThreshold: number,
): ChartLineRelativeVigorSignalCross[] {
  const out: ChartLineRelativeVigorSignalCross[] = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev == null) {
      out.push(null);
      prev = v;
      continue;
    }
    if (prev <= bullishThreshold && v > bullishThreshold) {
      out.push('up');
    } else if (prev >= bearishThreshold && v < bearishThreshold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

export function runLineRelativeVigorSignal(
  data: ChartLineRelativeVigorSignalPoint[],
  options: {
    length?: number;
    bullishThreshold?: number;
    bearishThreshold?: number;
  } = {},
): ChartLineRelativeVigorSignalRun {
  const cleaned = getLineRelativeVigorSignalFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineRelativeVigorSignalLength(
    options.length,
    DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_LENGTH,
  );
  const bullishThreshold = normalizeLineRelativeVigorSignalThreshold(
    options.bullishThreshold,
    DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_BULLISH_THRESHOLD,
  );
  const bearishThreshold = normalizeLineRelativeVigorSignalThreshold(
    options.bearishThreshold,
    DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_BEARISH_THRESHOLD,
  );

  const channels = computeLineRelativeVigorSignal(series, { length });
  const crosses = detectLineRelativeVigorSignalCrosses(
    channels.signal,
    bullishThreshold,
    bearishThreshold,
  );

  const samples: ChartLineRelativeVigorSignalSample[] = series.map(
    (p, i) => {
      const coSwma = channels.coSwma[i] ?? null;
      const hlSwma = channels.hlSwma[i] ?? null;
      const sumCo = channels.sumCo[i] ?? null;
      const sumHl = channels.sumHl[i] ?? null;
      const rvi = channels.rvi[i] ?? null;
      const signal = channels.signal[i] ?? null;
      const zone = classifyLineRelativeVigorSignalZone(
        signal,
        bullishThreshold,
        bearishThreshold,
      );
      const crossed = crosses[i] ?? null;
      return {
        index: i,
        x: p.x,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        coSwma,
        hlSwma,
        sumCo,
        sumHl,
        rvi,
        signal,
        zone,
        crossed,
      };
    },
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const s of samples) {
    if (s.zone === 'bullish') bullishCount += 1;
    else if (s.zone === 'bearish') bearishCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    else noneCount += 1;
    if (s.crossed === 'up') bullishCrossCount += 1;
    else if (s.crossed === 'down') bearishCrossCount += 1;
  }

  const ok = series.length >= length + 6;

  return {
    series,
    length,
    bullishThreshold,
    bearishThreshold,
    coSwmaValues: channels.coSwma,
    hlSwmaValues: channels.hlSwma,
    sumCoValues: channels.sumCo,
    sumHlValues: channels.sumHl,
    rviValues: channels.rvi,
    signalValues: channels.signal,
    samples,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineRelativeVigorSignalLayoutOptions {
  data: ChartLineRelativeVigorSignalPoint[];
  length?: number;
  bullishThreshold?: number;
  bearishThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineRelativeVigorSignalLayout(
  opts: ComputeLineRelativeVigorSignalLayoutOptions,
): ChartLineRelativeVigorSignalLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_PANEL_GAP;

  const run = runLineRelativeVigorSignal(opts.data, {
    length: opts.length ?? undefined,
    bullishThreshold: opts.bullishThreshold ?? undefined,
    bearishThreshold: opts.bearishThreshold ?? undefined,
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
      rviPath: '',
      signalPath: '',
      bullishY: oscTop,
      bearishY: oscBottom,
      zeroY: (oscTop + oscBottom) / 2,
      markers: [],
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.low < priceMin) priceMin = s.low;
    if (s.high > priceMax) priceMax = s.high;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  let oscMin = -1;
  let oscMax = 1;
  for (const s of run.samples) {
    if (s.rvi != null) {
      if (s.rvi < oscMin) oscMin = s.rvi;
      if (s.rvi > oscMax) oscMax = s.rvi;
    }
    if (s.signal != null) {
      if (s.signal < oscMin) oscMin = s.signal;
      if (s.signal > oscMax) oscMax = s.signal;
    }
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

  let pricePath = '';
  const priceDots: ChartLineRelativeVigorSignalDot[] = [];
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

  const buildPath = (key: 'rvi' | 'signal'): string => {
    let p = '';
    let first = true;
    for (const s of run.samples) {
      const v = s[key];
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

  const rviPath = buildPath('rvi');
  const signalPath = buildPath('signal');

  const markers: ChartLineRelativeVigorSignalMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.signal == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syOsc(s.signal),
      close: s.close,
      signal: s.signal,
      crossed: s.crossed,
    });
  }

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
    rviPath,
    signalPath,
    bullishY: syOsc(run.bullishThreshold),
    bearishY: syOsc(run.bearishThreshold),
    zeroY: syOsc(0),
    markers,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    run,
  };
}

export function describeLineRelativeVigorSignalChart(
  data: ChartLineRelativeVigorSignalPoint[],
  options: {
    length?: number;
    bullishThreshold?: number;
    bearishThreshold?: number;
  } = {},
): string {
  const cleaned = getLineRelativeVigorSignalFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineRelativeVigorSignalLength(
    options.length,
    DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_LENGTH,
  );
  const bullishThreshold = normalizeLineRelativeVigorSignalThreshold(
    options.bullishThreshold,
    DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_BULLISH_THRESHOLD,
  );
  const bearishThreshold = normalizeLineRelativeVigorSignalThreshold(
    options.bearishThreshold,
    DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_BEARISH_THRESHOLD,
  );
  return (
    `Relative Vigor Signal chart over ${cleaned.length} bars ` +
    `(length ${length}, bullishThreshold ${bullishThreshold}, ` +
    `bearishThreshold ${bearishThreshold}). Top panel renders the ` +
    `close; bottom panel renders the SWMA-smoothed RVI signal line ` +
    `from the rolling-sum ratio of SWMA(close-open) to SWMA(high-low).`
  );
}

const formatNumber = (value: number, digits = 4): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineRelativeVigorSignal = forwardRef<
  HTMLDivElement,
  ChartLineRelativeVigorSignalProps
>(function ChartLineRelativeVigorSignal(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_LENGTH,
    bullishThreshold = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_BULLISH_THRESHOLD,
    bearishThreshold = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_BEARISH_THRESHOLD,
    width = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_WIDTH,
    height = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_HEIGHT,
    padding = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_PADDING,
    panelGap = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_PRICE_COLOR,
    rviColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_RVI_COLOR,
    signalColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRvi = true,
    showSignal = true,
    showMarkers = true,
    showThresholds = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
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
    () => getLineRelativeVigorSignalFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineRelativeVigorSignalLayout({
        data: cleaned,
        length,
        bullishThreshold,
        bearishThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      bullishThreshold,
      bearishThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineRelativeVigorSignalSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineRelativeVigorSignalSeriesId,
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
    seriesId: ChartLineRelativeVigorSignalSeriesId,
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
        data-section="chart-line-relative-vigor-signal-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineRelativeVigorSignalChart(cleaned, {
      length,
      bullishThreshold,
      bearishThreshold,
    });

  const showPrice = !hidden.has('price');
  const showRviLine = !hidden.has('rvi') && showRvi;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'Relative Vigor Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-relative-vigor-signal"
      data-length={length}
      data-bullish-threshold={bullishThreshold}
      data-bearish-threshold={bearishThreshold}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-relative-vigor-signal-title"
      >
        {ariaLabel ?? 'Relative Vigor Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-relative-vigor-signal-aria-desc"
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
        data-section="chart-line-relative-vigor-signal-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-relative-vigor-signal-grid">
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
                  data-section="chart-line-relative-vigor-signal-grid-line-price"
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
                  data-section="chart-line-relative-vigor-signal-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-relative-vigor-signal-axes">
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
                  data-section="chart-line-relative-vigor-signal-tick-price"
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
                  data-section="chart-line-relative-vigor-signal-tick-osc"
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
            data-section="chart-line-relative-vigor-signal-zero-line"
          />
        ) : null}

        {showThresholds &&
        (bullishThreshold !== 0 || bearishThreshold !== 0) ? (
          <g data-section="chart-line-relative-vigor-signal-thresholds">
            <line
              x1={layout.innerLeft}
              y1={layout.bullishY}
              x2={layout.innerRight}
              y2={layout.bullishY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-relative-vigor-signal-bullish-line"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.bearishY}
              x2={layout.innerRight}
              y2={layout.bearishY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-relative-vigor-signal-bearish-line"
            />
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-relative-vigor-signal-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-relative-vigor-signal-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-relative-vigor-signal-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showRviLine ? (
          <path
            d={layout.rviPath}
            stroke={rviColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-relative-vigor-signal-rvi-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-relative-vigor-signal-signal-path"
          />
        ) : null}

        {showMarkers && showSignalLine ? (
          <g data-section="chart-line-relative-vigor-signal-markers">
            {layout.markers.map((m) => (
              <circle
                key={`signal-marker-${m.index}`}
                cx={m.cx}
                cy={m.cy}
                r={dotRadius + 2}
                fill={m.crossed === 'up' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onPointClick?.({ point: sample });
                }}
                data-section="chart-line-relative-vigor-signal-marker"
                data-cross={m.crossed}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-relative-vigor-signal-hover-targets">
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
                data-section="chart-line-relative-vigor-signal-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-relative-vigor-signal-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={200}
                  height={150}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-relative-vigor-signal-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-relative-vigor-signal-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-relative-vigor-signal-tooltip-co"
                >
                  coSwma{' '}
                  {tooltipSample.coSwma == null
                    ? '--'
                    : formatOsc(tooltipSample.coSwma)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-relative-vigor-signal-tooltip-hl"
                >
                  hlSwma{' '}
                  {tooltipSample.hlSwma == null
                    ? '--'
                    : formatOsc(tooltipSample.hlSwma)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-relative-vigor-signal-tooltip-sumCo"
                >
                  sumCo{' '}
                  {tooltipSample.sumCo == null
                    ? '--'
                    : formatOsc(tooltipSample.sumCo)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-relative-vigor-signal-tooltip-sumHl"
                >
                  sumHl{' '}
                  {tooltipSample.sumHl == null
                    ? '--'
                    : formatOsc(tooltipSample.sumHl)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-relative-vigor-signal-tooltip-rvi"
                >
                  rvi{' '}
                  {tooltipSample.rvi == null
                    ? '--'
                    : formatOsc(tooltipSample.rvi)}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-relative-vigor-signal-tooltip-signal"
                >
                  signal{' '}
                  {tooltipSample.signal == null
                    ? '--'
                    : formatOsc(tooltipSample.signal)}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-relative-vigor-signal-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={142}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-relative-vigor-signal-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-relative-vigor-signal-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | bull {bullishThreshold} | bear{' '}
          {bearishThreshold}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-relative-vigor-signal-legend"
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
              { id: 'rvi' as const, color: rviColor, label: 'rvi' },
              {
                id: 'signal' as const,
                color: signalColor,
                label: 'signal',
              },
            ] satisfies Array<{
              id: ChartLineRelativeVigorSignalSeriesId;
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

ChartLineRelativeVigorSignal.displayName = 'ChartLineRelativeVigorSignal';
