import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_SQUEEZE_WIDTH = 560;
export const DEFAULT_CHART_LINE_SQUEEZE_HEIGHT = 360;
export const DEFAULT_CHART_LINE_SQUEEZE_PADDING = 40;
export const DEFAULT_CHART_LINE_SQUEEZE_GAP = 12;
export const DEFAULT_CHART_LINE_SQUEEZE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SQUEEZE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SQUEEZE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SQUEEZE_PERIOD = 20;
export const DEFAULT_CHART_LINE_SQUEEZE_BB_MULT = 2;
export const DEFAULT_CHART_LINE_SQUEEZE_KC_MULT = 1.5;
export const DEFAULT_CHART_LINE_SQUEEZE_PRICE_PANEL_RATIO = 0.58;
export const DEFAULT_CHART_LINE_SQUEEZE_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_SQUEEZE_BB_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SQUEEZE_KC_COLOR = '#d97706';
export const DEFAULT_CHART_LINE_SQUEEZE_COMPRESSION_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_SQUEEZE_ON_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SQUEEZE_OFF_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SQUEEZE_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SQUEEZE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SQUEEZE_AXIS_COLOR = '#cbd5e1';

export type ChartLineSqueezeState = 'on' | 'off' | 'none';

export interface ChartLineSqueezePoint {
  x: number;
  value: number;
}

export interface ChartLineSqueezeSeries {
  mid: (number | null)[];
  bbUpper: (number | null)[];
  bbLower: (number | null)[];
  kcUpper: (number | null)[];
  kcLower: (number | null)[];
  compression: (number | null)[];
}

export interface ChartLineSqueezeSample {
  index: number;
  x: number;
  value: number;
  bbUpper: number | null;
  bbLower: number | null;
  kcUpper: number | null;
  kcLower: number | null;
  compression: number | null;
  state: ChartLineSqueezeState;
}

export interface ChartLineSqueezeRun {
  series: ChartLineSqueezePoint[];
  period: number;
  bbMult: number;
  kcMult: number;
  mid: (number | null)[];
  bbUpper: (number | null)[];
  bbLower: (number | null)[];
  kcUpper: (number | null)[];
  kcLower: (number | null)[];
  compression: (number | null)[];
  samples: ChartLineSqueezeSample[];
  squeezeOnCount: number;
  squeezeOffCount: number;
  longestSqueeze: number;
  finalState: ChartLineSqueezeState;
  ok: boolean;
}

export interface ChartLineSqueezePriceDot {
  index: number;
  x: number;
  value: number;
  bbUpper: number | null;
  bbLower: number | null;
  kcUpper: number | null;
  kcLower: number | null;
  compression: number | null;
  state: ChartLineSqueezeState;
  px: number;
  py: number;
}

export interface ChartLineSqueezeDot {
  index: number;
  x: number;
  state: ChartLineSqueezeState;
  compression: number | null;
  px: number;
  py: number;
}

export interface ChartLineSqueezePanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineSqueezeLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineSqueezePanel;
  squeezePanel: ChartLineSqueezePanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  squeezeYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  squeezeYMin: number;
  squeezeYMax: number;
  pricePath: string;
  priceDots: ChartLineSqueezePriceDot[];
  bbAreaPath: string;
  kcUpperPath: string;
  kcLowerPath: string;
  compressionPath: string;
  squeezeDots: ChartLineSqueezeDot[];
  zeroY: number;
  period: number;
  bbMult: number;
  kcMult: number;
  squeezeOnCount: number;
  squeezeOffCount: number;
  longestSqueeze: number;
  finalState: ChartLineSqueezeState;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineSqueezeLayoutOptions {
  data: readonly ChartLineSqueezePoint[];
  period?: number;
  bbMult?: number;
  kcMult?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineSqueezeProps {
  data: readonly ChartLineSqueezePoint[];
  period?: number;
  bbMult?: number;
  kcMult?: number;
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
  bbColor?: string;
  kcColor?: string;
  compressionColor?: string;
  squeezeOnColor?: string;
  squeezeOffColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBb?: boolean;
  showKc?: boolean;
  showSqueeze?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineSqueezePriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineSqueezeFinitePoints(
  points: readonly ChartLineSqueezePoint[] | null | undefined,
): ChartLineSqueezePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineSqueezePoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a TTM Squeeze period to a positive integer. A non-finite
 * or sub-1 value falls back to `fallback`; a fractional value
 * floors.
 */
export function normalizeLineSqueezePeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

function normalizeMult(mult: number | undefined, fallback: number): number {
  return isFiniteNumber(mult) && mult > 0 ? mult : fallback;
}

/**
 * The `period`-bar simple moving average of a (nullable) series. A
 * window containing a null is null.
 */
export function computeLineSqueezeSma(
  values: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineSqueezePeriod(period, DEFAULT_CHART_LINE_SQUEEZE_PERIOD);
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
 * The rolling `period`-bar population standard deviation of a
 * (nullable) series. A window containing a null is null.
 */
export function computeLineSqueezeStd(
  values: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineSqueezePeriod(period, DEFAULT_CHART_LINE_SQUEEZE_PERIOD);
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
    if (!valid) continue;
    const mean = sum / p;
    let sq = 0;
    for (let k = 0; k < p; k += 1) {
      const v = values[i - k] as number;
      sq += (v - mean) * (v - mean);
    }
    out[i] = Math.sqrt(sq / p);
  }
  return out;
}

/**
 * The close-only true range -- the absolute bar-to-bar change
 * `abs(close[i] - close[i-1])`. The first bar is null.
 */
export function computeLineSqueezeRange(
  closes: readonly number[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = closes[i];
    const prev = closes[i - 1];
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) continue;
    out[i] = Math.abs(cur - prev);
  }
  return out;
}

/**
 * The TTM Squeeze pipeline: Bollinger Bands and Keltner Channels
 * around a shared `period`-bar moving average of the close. The
 * Bollinger half-width is `bbMult` standard deviations; the
 * Keltner half-width is `kcMult` times the average true range
 * (the moving average of the close-only range). `compression` is
 * the Keltner half-width minus the Bollinger half-width -- it is
 * positive exactly when the Bollinger Bands sit inside the
 * Keltner Channels.
 */
export function computeLineSqueeze(
  closes: readonly number[] | null | undefined,
  period: number,
  bbMult: number,
  kcMult: number,
): ChartLineSqueezeSeries {
  if (!Array.isArray(closes)) {
    return {
      mid: [],
      bbUpper: [],
      bbLower: [],
      kcUpper: [],
      kcLower: [],
      compression: [],
    };
  }
  const p = normalizeLineSqueezePeriod(period, DEFAULT_CHART_LINE_SQUEEZE_PERIOD);
  const bb = normalizeMult(bbMult, DEFAULT_CHART_LINE_SQUEEZE_BB_MULT);
  const kc = normalizeMult(kcMult, DEFAULT_CHART_LINE_SQUEEZE_KC_MULT);
  const mid = computeLineSqueezeSma(closes, p);
  const std = computeLineSqueezeStd(closes, p);
  const range = computeLineSqueezeRange(closes);
  const atr = computeLineSqueezeSma(range, p);
  const n = closes.length;
  const bbUpper: (number | null)[] = new Array(n).fill(null);
  const bbLower: (number | null)[] = new Array(n).fill(null);
  const kcUpper: (number | null)[] = new Array(n).fill(null);
  const kcLower: (number | null)[] = new Array(n).fill(null);
  const compression: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const m = mid[i];
    const s = std[i];
    const a = atr[i];
    if (isFiniteNumber(m) && isFiniteNumber(s)) {
      bbUpper[i] = m + bb * s;
      bbLower[i] = m - bb * s;
    }
    if (isFiniteNumber(m) && isFiniteNumber(a)) {
      kcUpper[i] = m + kc * a;
      kcLower[i] = m - kc * a;
    }
    if (isFiniteNumber(s) && isFiniteNumber(a)) {
      compression[i] = kc * a - bb * s;
    }
  }
  return { mid, bbUpper, bbLower, kcUpper, kcLower, compression };
}

function classifyState(
  bbUpper: number | null,
  bbLower: number | null,
  kcUpper: number | null,
  kcLower: number | null,
): ChartLineSqueezeState {
  if (
    bbUpper === null ||
    bbLower === null ||
    kcUpper === null ||
    kcLower === null
  ) {
    return 'none';
  }
  return bbUpper < kcUpper && bbLower > kcLower ? 'on' : 'off';
}

export function runLineSqueeze(
  points: readonly ChartLineSqueezePoint[] | null | undefined,
  options?: { period?: number; bbMult?: number; kcMult?: number },
): ChartLineSqueezeRun {
  const finite = getLineSqueezeFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineSqueezePeriod(
    options?.period ?? DEFAULT_CHART_LINE_SQUEEZE_PERIOD,
    DEFAULT_CHART_LINE_SQUEEZE_PERIOD,
  );
  const bbMult = normalizeMult(
    options?.bbMult,
    DEFAULT_CHART_LINE_SQUEEZE_BB_MULT,
  );
  const kcMult = normalizeMult(
    options?.kcMult,
    DEFAULT_CHART_LINE_SQUEEZE_KC_MULT,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      bbMult,
      kcMult,
      mid: [],
      bbUpper: [],
      bbLower: [],
      kcUpper: [],
      kcLower: [],
      compression: [],
      samples: [],
      squeezeOnCount: 0,
      squeezeOffCount: 0,
      longestSqueeze: 0,
      finalState: 'none',
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const { mid, bbUpper, bbLower, kcUpper, kcLower, compression } =
    computeLineSqueeze(closes, period, bbMult, kcMult);

  const samples: ChartLineSqueezeSample[] = series.map((p, i) => {
    const bu = bbUpper[i] ?? null;
    const bl = bbLower[i] ?? null;
    const ku = kcUpper[i] ?? null;
    const kl = kcLower[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      bbUpper: bu,
      bbLower: bl,
      kcUpper: ku,
      kcLower: kl,
      compression: compression[i] ?? null,
      state: classifyState(bu, bl, ku, kl),
    };
  });

  let squeezeOnCount = 0;
  let squeezeOffCount = 0;
  let longestSqueeze = 0;
  let currentRun = 0;
  let finalState: ChartLineSqueezeState = 'none';
  for (const s of samples) {
    if (s.state === 'on') {
      squeezeOnCount += 1;
      currentRun += 1;
      if (currentRun > longestSqueeze) longestSqueeze = currentRun;
    } else {
      if (s.state === 'off') squeezeOffCount += 1;
      currentRun = 0;
    }
    if (s.state !== 'none') finalState = s.state;
  }

  return {
    series,
    period,
    bbMult,
    kcMult,
    mid,
    bbUpper,
    bbLower,
    kcUpper,
    kcLower,
    compression,
    samples,
    squeezeOnCount,
    squeezeOffCount,
    longestSqueeze,
    finalState,
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

export function computeLineSqueezeLayout(
  options: ComputeLineSqueezeLayoutOptions,
): ChartLineSqueezeLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_SQUEEZE_GAP,
    tickCount = DEFAULT_CHART_LINE_SQUEEZE_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_SQUEEZE_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineSqueeze(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.bbMult) ? { bbMult: options.bbMult } : {}),
    ...(isFiniteNumber(options.kcMult) ? { kcMult: options.kcMult } : {}),
  });

  const emptyPanel: ChartLineSqueezePanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineSqueezeLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    squeezePanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    squeezeYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    squeezeYMin: 0,
    squeezeYMax: 0,
    pricePath: '',
    priceDots: [],
    bbAreaPath: '',
    kcUpperPath: '',
    kcLowerPath: '',
    compressionPath: '',
    squeezeDots: [],
    zeroY: 0,
    period: run.period,
    bbMult: run.bbMult,
    kcMult: run.kcMult,
    squeezeOnCount: 0,
    squeezeOffCount: 0,
    longestSqueeze: 0,
    finalState: 'none',
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const squeezeHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineSqueezePanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const squeezePanel: ChartLineSqueezePanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: squeezeHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  let compLo = 0;
  let compHi = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    for (const v of [s.value, s.bbUpper, s.bbLower, s.kcUpper, s.kcLower]) {
      if (v !== null) {
        if (v < priceLo) priceLo = v;
        if (v > priceHi) priceHi = v;
      }
    }
    if (s.compression !== null) {
      if (s.compression < compLo) compLo = s.compression;
      if (s.compression > compHi) compHi = s.compression;
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
  if (compLo === compHi) {
    compLo -= 1;
    compHi += 1;
  }

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const compRange = compHi - compLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectSqueezeY = (v: number): number =>
    squeezePanel.y +
    squeezePanel.height -
    ((v - compLo) / compRange) * squeezePanel.height;

  const priceDots: ChartLineSqueezePriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    bbUpper: s.bbUpper,
    bbLower: s.bbLower,
    kcUpper: s.kcUpper,
    kcLower: s.kcLower,
    compression: s.compression,
    state: s.state,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const bbUpperPts: { px: number; py: number }[] = [];
  const bbLowerPts: { px: number; py: number }[] = [];
  const kcUpperPts: { px: number; py: number }[] = [];
  const kcLowerPts: { px: number; py: number }[] = [];
  const compPts: { px: number; py: number }[] = [];
  const squeezeDots: ChartLineSqueezeDot[] = [];
  const zeroY = projectSqueezeY(0);
  for (const s of run.samples) {
    const px = projectX(s.x);
    if (s.bbUpper !== null) bbUpperPts.push({ px, py: projectPriceY(s.bbUpper) });
    if (s.bbLower !== null) bbLowerPts.push({ px, py: projectPriceY(s.bbLower) });
    if (s.kcUpper !== null) kcUpperPts.push({ px, py: projectPriceY(s.kcUpper) });
    if (s.kcLower !== null) kcLowerPts.push({ px, py: projectPriceY(s.kcLower) });
    if (s.compression !== null) {
      compPts.push({ px, py: projectSqueezeY(s.compression) });
    }
    if (s.state !== 'none') {
      squeezeDots.push({
        index: s.index,
        x: s.x,
        state: s.state,
        compression: s.compression,
        px,
        py: zeroY,
      });
    }
  }

  let bbAreaPath = '';
  if (bbUpperPts.length > 0 && bbUpperPts.length === bbLowerPts.length) {
    const forward = bbUpperPts
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`,
      )
      .join(' ');
    const back = [...bbLowerPts]
      .reverse()
      .map((p) => `L ${p.px.toFixed(3)} ${p.py.toFixed(3)}`)
      .join(' ');
    bbAreaPath = `${forward} ${back} Z`;
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    squeezePanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    squeezeYTicks: computeTicks(compLo, compHi, tickCount).map((v) => ({
      value: v,
      py: projectSqueezeY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    squeezeYMin: compLo,
    squeezeYMax: compHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    bbAreaPath,
    kcUpperPath: buildPath(kcUpperPts),
    kcLowerPath: buildPath(kcLowerPts),
    compressionPath: buildPath(compPts),
    squeezeDots,
    zeroY,
    period: run.period,
    bbMult: run.bbMult,
    kcMult: run.kcMult,
    squeezeOnCount: run.squeezeOnCount,
    squeezeOffCount: run.squeezeOffCount,
    longestSqueeze: run.longestSqueeze,
    finalState: run.finalState,
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

export function describeLineSqueezeChart(
  data: readonly ChartLineSqueezePoint[] | null | undefined,
  options?: { period?: number; bbMult?: number; kcMult?: number },
): string {
  const run = runLineSqueeze(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a TTM Squeeze (period ${run.period}): the top panel plots the price with the Bollinger Bands as a shaded area and the Keltner Channels as two lines; the bottom panel plots the squeeze. The squeeze is ON when the Bollinger Bands sit fully inside the Keltner Channels -- a low-volatility coil that often precedes a sharp move -- and OFF when they expand outside. The squeeze is on for ${run.squeezeOnCount} bars and off for ${run.squeezeOffCount} across ${run.samples.length} bars; the longest unbroken squeeze runs ${run.longestSqueeze} bars.`;
}

const SQUEEZE_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineSqueeze = forwardRef<
  HTMLDivElement,
  ChartLineSqueezeProps
>(function ChartLineSqueeze(
  props: ChartLineSqueezeProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    bbMult,
    kcMult,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_SQUEEZE_WIDTH,
    height = DEFAULT_CHART_LINE_SQUEEZE_HEIGHT,
    padding = DEFAULT_CHART_LINE_SQUEEZE_PADDING,
    gap = DEFAULT_CHART_LINE_SQUEEZE_GAP,
    tickCount = DEFAULT_CHART_LINE_SQUEEZE_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_SQUEEZE_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_SQUEEZE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SQUEEZE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SQUEEZE_PRICE_COLOR,
    bbColor = DEFAULT_CHART_LINE_SQUEEZE_BB_COLOR,
    kcColor = DEFAULT_CHART_LINE_SQUEEZE_KC_COLOR,
    compressionColor = DEFAULT_CHART_LINE_SQUEEZE_COMPRESSION_COLOR,
    squeezeOnColor = DEFAULT_CHART_LINE_SQUEEZE_ON_COLOR,
    squeezeOffColor = DEFAULT_CHART_LINE_SQUEEZE_OFF_COLOR,
    zeroColor = DEFAULT_CHART_LINE_SQUEEZE_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_SQUEEZE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_SQUEEZE_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showBb = true,
    showKc = true,
    showSqueeze = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Two-panel chart with a TTM Squeeze',
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
      computeLineSqueezeLayout({
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(bbMult) ? { bbMult } : {}),
        ...(isFiniteNumber(kcMult) ? { kcMult } : {}),
      }),
    [
      data,
      width,
      height,
      padding,
      gap,
      tickCount,
      pricePanelRatio,
      period,
      bbMult,
      kcMult,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineSqueezeChart(data, {
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(bbMult) ? { bbMult } : {}),
        ...(isFiniteNumber(kcMult) ? { kcMult } : {}),
      }),
    [ariaDescription, data, period, bbMult, kcMult],
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
        data-section="chart-line-squeeze"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-squeeze-aria-desc"
          style={SQUEEZE_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const sp = layout.squeezePanel;
  const priceVisible = !hiddenSet.has('price');
  const bbVisible = showBb && !hiddenSet.has('bb');
  const kcVisible = showKc && !hiddenSet.has('kc');
  const squeezeVisible = showSqueeze && !hiddenSet.has('squeeze');

  const fmtNullable = (v: number | null): string =>
    v === null ? 'n/a' : formatValue(v);

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'bb', label: 'Bollinger', color: bbColor },
    { id: 'kc', label: 'Keltner', color: kcColor },
    { id: 'squeeze', label: 'Squeeze', color: compressionColor },
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
      data-section="chart-line-squeeze"
      data-empty="false"
      data-period={layout.period}
      data-bb-mult={layout.bbMult}
      data-kc-mult={layout.kcMult}
      data-squeeze-on-count={layout.squeezeOnCount}
      data-squeeze-off-count={layout.squeezeOffCount}
      data-longest-squeeze={layout.longestSqueeze}
      data-final-state={layout.finalState}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-squeeze-aria-desc"
        style={SQUEEZE_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-squeeze-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-squeeze-badge"
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
              data-section="chart-line-squeeze-badge-icon"
              aria-hidden="true"
              style={{ color: compressionColor }}
            >
              SQZ
            </span>
            <span data-section="chart-line-squeeze-badge-config">
              {layout.period}/{layout.bbMult}/{layout.kcMult}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-squeeze-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-squeeze-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`gp-${i}`}
                  data-section="chart-line-squeeze-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.squeezeYTicks.map((t, i) => (
                <line
                  key={`gs-${i}`}
                  data-section="chart-line-squeeze-grid-line"
                  data-panel="squeeze"
                  x1={sp.x}
                  x2={sp.x + sp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-squeeze-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-squeeze-axis"
                data-panel="price"
                data-axis="y"
                x1={pp.x}
                y1={pp.y}
                x2={pp.x}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-squeeze-axis"
                data-panel="price"
                data-axis="x"
                x1={pp.x}
                y1={pp.y + pp.height}
                x2={pp.x + pp.width}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-squeeze-axis"
                data-panel="squeeze"
                data-axis="y"
                x1={sp.x}
                y1={sp.y}
                x2={sp.x}
                y2={sp.y + sp.height}
              />
              <line
                data-section="chart-line-squeeze-axis"
                data-panel="squeeze"
                data-axis="x"
                x1={sp.x}
                y1={sp.y + sp.height}
                x2={sp.x + sp.width}
                y2={sp.y + sp.height}
              />
              {layout.priceYTicks.map((t, i) => (
                <text
                  key={`pyt-${i}`}
                  data-section="chart-line-squeeze-tick-label"
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
              {layout.squeezeYTicks.map((t, i) => (
                <text
                  key={`syt-${i}`}
                  data-section="chart-line-squeeze-tick-label"
                  data-panel="squeeze"
                  data-axis="y"
                  x={sp.x - 6}
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
                  data-section="chart-line-squeeze-tick-label"
                  data-axis="x"
                  x={t.px}
                  y={sp.y + sp.height + 14}
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
            data-section="chart-line-squeeze-panel-label"
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
            data-section="chart-line-squeeze-panel-label"
            data-panel="squeeze"
            x={sp.x + 2}
            y={sp.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            Squeeze
          </text>

          {bbVisible && layout.bbAreaPath ? (
            <path
              data-section="chart-line-squeeze-bb-area"
              d={layout.bbAreaPath}
              fill={bbColor}
              fillOpacity={0.16}
              stroke={bbColor}
              strokeWidth={1}
              strokeOpacity={0.5}
            />
          ) : null}

          {kcVisible && layout.kcUpperPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Keltner Channel upper"
              data-section="chart-line-squeeze-kc-upper"
              d={layout.kcUpperPath}
              fill="none"
              stroke={kcColor}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              strokeLinecap="round"
            />
          ) : null}

          {kcVisible && layout.kcLowerPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Keltner Channel lower"
              data-section="chart-line-squeeze-kc-lower"
              d={layout.kcLowerPath}
              fill="none"
              stroke={kcColor}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              strokeLinecap="round"
            />
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-squeeze-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-squeeze-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-squeeze-dot"
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

          {squeezeVisible && showZeroLine ? (
            <line
              data-section="chart-line-squeeze-zero-line"
              x1={sp.x}
              x2={sp.x + sp.width}
              y1={layout.zeroY}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {squeezeVisible && layout.compressionPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Squeeze compression line"
              data-section="chart-line-squeeze-compression-line"
              d={layout.compressionPath}
              fill="none"
              stroke={compressionColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {squeezeVisible ? (
            <g data-section="chart-line-squeeze-squeeze-dots">
              {layout.squeezeDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`s-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Squeeze ${d.state} at x ${formatX(d.x)}`}
                    data-section="chart-line-squeeze-squeeze-dot"
                    data-point-index={d.index}
                    data-state={d.state}
                    cx={d.px}
                    cy={d.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={d.state === 'on' ? squeezeOnColor : squeezeOffColor}
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
                    onClick={() => {
                      const pd = layout.priceDots.find(
                        (x) => x.index === d.index,
                      );
                      if (pd) onPointClick?.({ point: pd });
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
                  data-section="chart-line-squeeze-tooltip"
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
                  <div data-section="chart-line-squeeze-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-squeeze-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-squeeze-tooltip-compression">
                    compression: {fmtNullable(d.compression)}
                  </div>
                  <div data-section="chart-line-squeeze-tooltip-state">
                    squeeze: {d.state}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-squeeze-legend"
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
                data-section="chart-line-squeeze-legend-item"
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
                  data-section="chart-line-squeeze-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-squeeze-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-squeeze-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.squeezeOnCount} on, {layout.squeezeOffCount} off, longest{' '}
            {layout.longestSqueeze}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineSqueeze.displayName = 'ChartLineSqueeze';
