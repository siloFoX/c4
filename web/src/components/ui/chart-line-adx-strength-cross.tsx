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
 * ChartLineAdxStrengthCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Average
 * Directional Index (ADX) line in the bottom panel, marking
 * mild (cross up / down through 25) and strong (cross up / down
 * through 50) trend strength threshold transitions. Dual-band
 * cross variant of the ADX family that flags discrete level
 * `25` and `50` entry / exit events on the same panel.
 *
 *   tr[i]  = |close[i] - close[i-1]|
 *   up[i]  = close[i] - close[i-1]
 *   dn[i]  = close[i-1] - close[i]
 *   +DM[i] = up > dn && up > 0 ? up : 0
 *   -DM[i] = dn > up && dn > 0 ? dn : 0
 *   +DI    = 100 * Wilder(+DM, n) / Wilder(tr, n)
 *   -DI    = 100 * Wilder(-DM, n) / Wilder(tr, n)
 *   DX     = 100 * |+DI - -DI| / (+DI + -DI)
 *   ADX    = Wilder(DX, n)
 *   mildEnter   : prev <= 25 && cur > 25
 *   strongEnter : prev <= 50 && cur > 50
 *   mildExit    : prev >= 25 && cur < 25
 *   strongExit  : prev >= 50 && cur < 50
 *
 * Defaults: `length = 14` (canonical ADX window),
 * `mildThreshold = 25`, `strongThreshold = 50`. Regime
 * classifier `veryStrong` (adx >= 50), `strong` (adx >= 25),
 * `weak` (adx < 25), `none` (adx null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: delta = 0 every bar -> tr = +DM = -DM
 *   = 0 -> Wilder smoothing of zeros = 0 -> +DI = -DI = 0 via
 *   the 0/0 short-circuit -> DX = 0/0 -> Wilder(DX) = 0 -> ADX
 *   = 0 sits firmly below 25, regime is `weak` and the
 *   threshold is never crossed. cross count = 0. Verified
 *   across K = 0..1234.
 * - **LINEAR UP close = i**: all deltas = +1 -> +DM = 1, -DM =
 *   0, tr = 1 -> Wilder seeds at 1 / 0 / 1 -> +DI = 100, -DI
 *   = 0, DX = 100 -> ADX converges to 100. ADX >= 50, regime
 *   `veryStrong` once stable.
 */

export interface ChartLineAdxStrengthCrossPoint {
  x: number;
  close: number;
}

export type ChartLineAdxStrengthCrossRegime =
  | 'veryStrong'
  | 'strong'
  | 'weak'
  | 'none';

export type ChartLineAdxStrengthCrossSeriesId = 'price' | 'adx';

export type ChartLineAdxStrengthCrossCrossKind =
  | 'mildEnter'
  | 'strongEnter'
  | 'mildExit'
  | 'strongExit';

export interface ChartLineAdxStrengthCrossCross {
  index: number;
  x: number;
  kind: ChartLineAdxStrengthCrossCrossKind;
}

export interface ChartLineAdxStrengthCrossSample {
  index: number;
  x: number;
  close: number;
  adx: number | null;
  regime: ChartLineAdxStrengthCrossRegime;
}

export interface ChartLineAdxStrengthCrossRun {
  series: ChartLineAdxStrengthCrossPoint[];
  length: number;
  mildThreshold: number;
  strongThreshold: number;
  adxValues: Array<number | null>;
  samples: ChartLineAdxStrengthCrossSample[];
  crosses: ChartLineAdxStrengthCrossCross[];
  veryStrongCount: number;
  strongCount: number;
  weakCount: number;
  noneCount: number;
  mildEnterCount: number;
  strongEnterCount: number;
  mildExitCount: number;
  strongExitCount: number;
  ok: boolean;
}

export interface ChartLineAdxStrengthCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAdxStrengthCrossLayout {
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
  priceDots: ChartLineAdxStrengthCrossDot[];
  adxPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  mildY: number;
  strongY: number;
  midY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineAdxStrengthCrossCrossKind;
  }>;
  run: ChartLineAdxStrengthCrossRun;
}

export interface ChartLineAdxStrengthCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAdxStrengthCrossPoint[];
  length?: number;
  mildThreshold?: number;
  strongThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  adxColor?: string;
  mildEnterColor?: string;
  strongEnterColor?: string;
  mildExitColor?: string;
  strongExitColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAdx?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAdxStrengthCrossSeriesId[];
  defaultHiddenSeries?: ChartLineAdxStrengthCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAdxStrengthCrossSeriesId;
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

export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_MILD_THRESHOLD = 25;
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_STRONG_THRESHOLD = 50;
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_ADX_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_MILD_ENTER_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_STRONG_ENTER_COLOR =
  '#065f46';
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_MILD_EXIT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_STRONG_EXIT_COLOR = '#7f1d1d';
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineAdxStrengthCrossFinitePoints(
  data: readonly ChartLineAdxStrengthCrossPoint[] | null | undefined,
): ChartLineAdxStrengthCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAdxStrengthCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineAdxStrengthCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a finite threshold in [0, 100]. */
export function normalizeLineAdxStrengthCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 0 && value <= 100) return value;
  return fallback;
}

/** Wilder smoothing with CONST short-circuit. */
export function applyLineAdxStrengthCrossWilder(
  values: readonly number[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (values.length < length) return out;
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    sum += values[i] ?? 0;
  }
  let seed = sum / length;
  let winMin = Infinity;
  let winMax = -Infinity;
  for (let i = 0; i < length; i += 1) {
    const v = values[i] ?? 0;
    if (v < winMin) winMin = v;
    if (v > winMax) winMax = v;
  }
  if (winMin === winMax) seed = winMin;
  out[length - 1] = posZero(seed);
  let prev = seed;
  for (let i = length; i < values.length; i += 1) {
    const v = values[i] ?? 0;
    const next = v === prev ? v : posZero((prev * (length - 1) + v) / length);
    out[i] = next;
    prev = next;
  }
  return out;
}

export interface LineAdxStrengthCrossChannels {
  adx: Array<number | null>;
}

export function computeLineAdxStrengthCross(
  series: readonly ChartLineAdxStrengthCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineAdxStrengthCrossChannels {
  const cleaned = getLineAdxStrengthCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { adx: [] };
  }
  const length = normalizeLineAdxStrengthCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_LENGTH,
  );

  const n = cleaned.length;
  const tr: number[] = new Array(n).fill(0);
  const plusDm: number[] = new Array(n).fill(0);
  const minusDm: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    const c = cleaned[i]?.close ?? 0;
    const p = cleaned[i - 1]?.close ?? 0;
    const up = c - p;
    const dn = p - c;
    tr[i] = Math.abs(up);
    plusDm[i] = up > dn && up > 0 ? up : 0;
    minusDm[i] = dn > up && dn > 0 ? dn : 0;
  }
  // Wilder is applied starting from index 1 (delta-based input)
  const trSeed = tr.slice(1);
  const plusDmSeed = plusDm.slice(1);
  const minusDmSeed = minusDm.slice(1);
  const smoothedTr = applyLineAdxStrengthCrossWilder(trSeed, length);
  const smoothedPlusDm = applyLineAdxStrengthCrossWilder(plusDmSeed, length);
  const smoothedMinusDm = applyLineAdxStrengthCrossWilder(
    minusDmSeed,
    length,
  );

  const dx: Array<number | null> = new Array(n - 1).fill(null);
  for (let j = 0; j < smoothedTr.length; j += 1) {
    const t = smoothedTr[j];
    const pd = smoothedPlusDm[j];
    const md = smoothedMinusDm[j];
    if (t == null || pd == null || md == null) continue;
    const plusDi = t === 0 ? 0 : (pd / t) * 100;
    const minusDi = t === 0 ? 0 : (md / t) * 100;
    const sum = plusDi + minusDi;
    dx[j] = sum === 0 ? 0 : posZero((Math.abs(plusDi - minusDi) / sum) * 100);
  }

  // Wilder smoothing over the non-null DX tail
  const firstDxIndex = dx.findIndex((v) => v != null);
  const adxFromDx: Array<number | null> = new Array(n - 1).fill(null);
  if (firstDxIndex !== -1) {
    const dxNonNull = dx
      .slice(firstDxIndex)
      .map((v) => (v == null ? 0 : v));
    const adxRaw = applyLineAdxStrengthCrossWilder(dxNonNull, length);
    for (let j = 0; j < adxRaw.length; j += 1) {
      adxFromDx[firstDxIndex + j] = adxRaw[j] ?? null;
    }
  }

  const adx: Array<number | null> = new Array(n).fill(null);
  for (let j = 0; j < adxFromDx.length; j += 1) {
    adx[j + 1] = adxFromDx[j] ?? null;
  }

  return { adx };
}

export function classifyLineAdxStrengthCrossRegime(
  adx: number | null,
  mildThreshold: number,
  strongThreshold: number,
): ChartLineAdxStrengthCrossRegime {
  if (adx == null) return 'none';
  if (adx >= strongThreshold) return 'veryStrong';
  if (adx >= mildThreshold) return 'strong';
  return 'weak';
}

export function detectLineAdxStrengthCrossCrosses(
  series: readonly ChartLineAdxStrengthCrossPoint[],
  adx: readonly (number | null)[],
  mildThreshold: number,
  strongThreshold: number,
): ChartLineAdxStrengthCrossCross[] {
  const out: ChartLineAdxStrengthCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = adx[i - 1];
    const cur = adx[i];
    if (prev == null || cur == null) continue;
    const x = series[i]!.x;
    if (prev <= mildThreshold && cur > mildThreshold) {
      out.push({ index: i, x, kind: 'mildEnter' });
    }
    if (prev <= strongThreshold && cur > strongThreshold) {
      out.push({ index: i, x, kind: 'strongEnter' });
    }
    if (prev >= strongThreshold && cur < strongThreshold) {
      out.push({ index: i, x, kind: 'strongExit' });
    }
    if (prev >= mildThreshold && cur < mildThreshold) {
      out.push({ index: i, x, kind: 'mildExit' });
    }
  }
  return out;
}

export function runLineAdxStrengthCross(
  data: ChartLineAdxStrengthCrossPoint[],
  options: {
    length?: number;
    mildThreshold?: number;
    strongThreshold?: number;
  } = {},
): ChartLineAdxStrengthCrossRun {
  const cleaned = getLineAdxStrengthCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineAdxStrengthCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_LENGTH,
  );
  const mildThreshold = normalizeLineAdxStrengthCrossThreshold(
    options.mildThreshold,
    DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_MILD_THRESHOLD,
  );
  const strongThreshold = normalizeLineAdxStrengthCrossThreshold(
    options.strongThreshold,
    DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_STRONG_THRESHOLD,
  );

  const channels = computeLineAdxStrengthCross(series, { length });

  const samples: ChartLineAdxStrengthCrossSample[] = series.map((p, i) => {
    const v = channels.adx[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      adx: v,
      regime: classifyLineAdxStrengthCrossRegime(
        v,
        mildThreshold,
        strongThreshold,
      ),
    };
  });

  const crosses = detectLineAdxStrengthCrossCrosses(
    series,
    channels.adx,
    mildThreshold,
    strongThreshold,
  );

  let veryStrongCount = 0;
  let strongCount = 0;
  let weakCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'veryStrong') veryStrongCount += 1;
    else if (s.regime === 'strong') strongCount += 1;
    else if (s.regime === 'weak') weakCount += 1;
    else noneCount += 1;
  }

  let mildEnterCount = 0;
  let strongEnterCount = 0;
  let mildExitCount = 0;
  let strongExitCount = 0;
  for (const c of crosses) {
    if (c.kind === 'mildEnter') mildEnterCount += 1;
    else if (c.kind === 'strongEnter') strongEnterCount += 1;
    else if (c.kind === 'mildExit') mildExitCount += 1;
    else strongExitCount += 1;
  }

  const ok = series.length > length * 2;

  return {
    series,
    length,
    mildThreshold,
    strongThreshold,
    adxValues: channels.adx,
    samples,
    crosses,
    veryStrongCount,
    strongCount,
    weakCount,
    noneCount,
    mildEnterCount,
    strongEnterCount,
    mildExitCount,
    strongExitCount,
    ok,
  };
}

export interface ComputeLineAdxStrengthCrossLayoutOptions {
  data: ChartLineAdxStrengthCrossPoint[];
  length?: number;
  mildThreshold?: number;
  strongThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAdxStrengthCrossLayout(
  opts: ComputeLineAdxStrengthCrossLayoutOptions,
): ChartLineAdxStrengthCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_PANEL_GAP;
  const mildThreshold = normalizeLineAdxStrengthCrossThreshold(
    opts.mildThreshold,
    DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_MILD_THRESHOLD,
  );
  const strongThreshold = normalizeLineAdxStrengthCrossThreshold(
    opts.strongThreshold,
    DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_STRONG_THRESHOLD,
  );

  const run = runLineAdxStrengthCross(opts.data, {
    length: opts.length ?? undefined,
    mildThreshold,
    strongThreshold,
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
  const mildY = syOscBase(mildThreshold);
  const strongY = syOscBase(strongThreshold);
  const midY = syOscBase(50);

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
      adxPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      mildY,
      strongY,
      midY,
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
  const priceDots: ChartLineAdxStrengthCrossDot[] = [];
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

  let adxPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.adx == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.adx);
    adxPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  adxPath = adxPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.adxValues[c.index] ?? 0);
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
    adxPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    mildY,
    strongY,
    midY,
    crossMarkers,
    run,
  };
}

export function describeLineAdxStrengthCrossChart(
  data: ChartLineAdxStrengthCrossPoint[],
  options: {
    length?: number;
    mildThreshold?: number;
    strongThreshold?: number;
  } = {},
): string {
  const cleaned = getLineAdxStrengthCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineAdxStrengthCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_LENGTH,
  );
  const mildThreshold = normalizeLineAdxStrengthCrossThreshold(
    options.mildThreshold,
    DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_MILD_THRESHOLD,
  );
  const strongThreshold = normalizeLineAdxStrengthCrossThreshold(
    options.strongThreshold,
    DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_STRONG_THRESHOLD,
  );
  return (
    `ADX Strength Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, mildThreshold ${mildThreshold}, ` +
    `strongThreshold ${strongThreshold}). Top panel renders ` +
    `the close with trend-strength entry / exit chevron ` +
    `overlays at every ADX threshold cross; bottom panel ` +
    `renders the close-only Average Directional Index line on ` +
    `a fixed 0-100 oscillator with mild (${mildThreshold}) and ` +
    `strong (${strongThreshold}) reference bands and marks ADX ` +
    `level entry / exit events.`
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

const colorForCross = (
  kind: ChartLineAdxStrengthCrossCrossKind,
  mildEnter: string,
  strongEnter: string,
  mildExit: string,
  strongExit: string,
): string => {
  switch (kind) {
    case 'mildEnter':
      return mildEnter;
    case 'strongEnter':
      return strongEnter;
    case 'mildExit':
      return mildExit;
    case 'strongExit':
      return strongExit;
  }
};

export const ChartLineAdxStrengthCross = forwardRef<
  HTMLDivElement,
  ChartLineAdxStrengthCrossProps
>(function ChartLineAdxStrengthCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_LENGTH,
    mildThreshold = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_MILD_THRESHOLD,
    strongThreshold = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_STRONG_THRESHOLD,
    width = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_PRICE_COLOR,
    adxColor = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_ADX_COLOR,
    mildEnterColor = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_MILD_ENTER_COLOR,
    strongEnterColor = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_STRONG_ENTER_COLOR,
    mildExitColor = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_MILD_EXIT_COLOR,
    strongExitColor = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_STRONG_EXIT_COLOR,
    axisColor = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAdx = true,
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
    () => getLineAdxStrengthCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAdxStrengthCrossLayout({
        data: cleaned,
        length,
        mildThreshold,
        strongThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      mildThreshold,
      strongThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineAdxStrengthCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineAdxStrengthCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineAdxStrengthCrossSeriesId,
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
        data-section="chart-line-adx-strength-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAdxStrengthCrossChart(cleaned, {
      length,
      mildThreshold,
      strongThreshold,
    });

  const showPrice = !hidden.has('price');
  const showAdxLine = !hidden.has('adx') && showAdx;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [0, mildThreshold, 50, strongThreshold, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'ADX Strength Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-adx-strength-cross"
      data-length={length}
      data-mild-threshold={mildThreshold}
      data-strong-threshold={strongThreshold}
      data-total-points={cleaned.length}
      data-very-strong-count={layout.run.veryStrongCount}
      data-strong-count={layout.run.strongCount}
      data-weak-count={layout.run.weakCount}
      data-mild-enter-count={layout.run.mildEnterCount}
      data-strong-enter-count={layout.run.strongEnterCount}
      data-mild-exit-count={layout.run.mildExitCount}
      data-strong-exit-count={layout.run.strongExitCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-adx-strength-cross-title"
      >
        {ariaLabel ?? 'ADX Strength Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-adx-strength-cross-aria-desc"
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
        data-section="chart-line-adx-strength-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-adx-strength-cross-grid">
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
                  data-section="chart-line-adx-strength-cross-grid-line-price"
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
                  data-section="chart-line-adx-strength-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-adx-strength-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.strongY}
              x2={layout.innerRight}
              y2={layout.strongY}
              stroke={midColor}
              strokeDasharray="6 4"
              data-section="chart-line-adx-strength-cross-band-strong"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.mildY}
              x2={layout.innerRight}
              y2={layout.mildY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-adx-strength-cross-band-mild"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-adx-strength-cross-axes">
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
                  data-section="chart-line-adx-strength-cross-tick-price"
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
                  data-section="chart-line-adx-strength-cross-tick-osc"
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
            data-section="chart-line-adx-strength-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-adx-strength-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-adx-strength-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showAdxLine ? (
          <path
            d={layout.adxPath}
            stroke={adxColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-adx-strength-cross-adx-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-adx-strength-cross-crosses"
            role="group"
            aria-label="cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <circle
                key={`cross-osc-${m.index}-${m.kind}`}
                cx={m.cx}
                cy={m.cyOsc}
                r={4}
                fill={colorForCross(
                  m.kind,
                  mildEnterColor,
                  strongEnterColor,
                  mildExitColor,
                  strongExitColor,
                )}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} cross at ${formatX(m.x)}`}
                data-section={`chart-line-adx-strength-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-adx-strength-cross-overlay-crosses"
            role="group"
            aria-label="overlay cross markers"
          >
            {layout.crossMarkers.map((m) => {
              const isEnter =
                m.kind === 'mildEnter' || m.kind === 'strongEnter';
              return (
                <polygon
                  key={`cross-overlay-${m.index}-${m.kind}`}
                  points={
                    isEnter
                      ? `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                      : `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                  }
                  fill={colorForCross(
                    m.kind,
                    mildEnterColor,
                    strongEnterColor,
                    mildExitColor,
                    strongExitColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`${m.kind} overlay at ${formatX(m.x)}`}
                  data-section={`chart-line-adx-strength-cross-overlay-${m.kind}`}
                />
              );
            })}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-adx-strength-cross-hover-targets">
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
                data-section="chart-line-adx-strength-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-adx-strength-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={232}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-strength-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-strength-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-strength-cross-tooltip-adx"
                >
                  ADX{' '}
                  {tooltipSample.adx == null
                    ? '--'
                    : formatOsc(tooltipSample.adx)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-strength-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-strength-cross-tooltip-counts"
                >
                  v.strong {layout.run.veryStrongCount} | strong{' '}
                  {layout.run.strongCount} | weak {layout.run.weakCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-strength-cross-tooltip-entries"
                >
                  enter mild {layout.run.mildEnterCount} | strong{' '}
                  {layout.run.strongEnterCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-strength-cross-tooltip-exits"
                >
                  exit mild {layout.run.mildExitCount} | strong{' '}
                  {layout.run.strongExitCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-strength-cross-tooltip-crosses"
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
          data-section="chart-line-adx-strength-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | thresholds {mildThreshold}/{strongThreshold} |
          crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-adx-strength-cross-legend"
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
              { id: 'adx' as const, color: adxColor, label: 'ADX' },
            ] satisfies Array<{
              id: ChartLineAdxStrengthCrossSeriesId;
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

ChartLineAdxStrengthCross.displayName = 'ChartLineAdxStrengthCross';
