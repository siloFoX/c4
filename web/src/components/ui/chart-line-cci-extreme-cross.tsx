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
 * ChartLineCciExtremeCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the close-only Commodity Channel
 * Index (CCI) line in the bottom panel, marking bullish (cross
 * up through any positive band) / bearish (cross down through
 * any negative band) trigger events at the canonical +/- 100
 * and +/- 200 extreme bands. Dual-band cross variant of the CCI
 * family that flags the discrete CCI level +/- 100 and +/- 200
 * entry / exit events on the same panel.
 *
 *   sma[i]  = SMA(close, length)
 *   md[i]   = avg |close[i-n+1..i] - sma[i]|
 *   cci[i]  = md > 0
 *               ? (close - sma) / (0.015 * md)
 *               : 0
 *   bullish : prev <= +T && cur > +T  for T in {upperMild, upperExtreme}
 *   bearish : prev >= -T && cur < -T  for T in {lowerMild, lowerExtreme}
 *
 * Defaults: `length = 20` (canonical CCI window),
 * `upperMild = +100`, `lowerMild = -100`,
 * `upperExtreme = +200`, `lowerExtreme = -200`. Regime
 * classifier `bullish` (cci >= upperMild),
 * `bullishExtreme` (cci >= upperExtreme),
 * `bearish` (cci <= lowerMild),
 * `bearishExtreme` (cci <= lowerExtreme),
 * `neutral` (between lowerMild and upperMild),
 * `none` (cci null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: sma = K every bar so |close - sma| = 0
 *   every bar -> mean deviation = 0 -> 0/0 short-circuit returns
 *   0. cci = 0 sits firmly between -100 and +100, regime is
 *   `neutral` and the threshold is never crossed. cross count =
 *   0. Verified across K = 0..1234.
 */

export interface ChartLineCciExtremeCrossPoint {
  x: number;
  close: number;
}

export type ChartLineCciExtremeCrossRegime =
  | 'bullishExtreme'
  | 'bullish'
  | 'neutral'
  | 'bearish'
  | 'bearishExtreme'
  | 'none';

export type ChartLineCciExtremeCrossSeriesId = 'price' | 'cci';

export type ChartLineCciExtremeCrossCrossKind =
  | 'bullishMild'
  | 'bullishExtreme'
  | 'bearishMild'
  | 'bearishExtreme';

export interface ChartLineCciExtremeCrossCross {
  index: number;
  x: number;
  kind: ChartLineCciExtremeCrossCrossKind;
}

export interface ChartLineCciExtremeCrossSample {
  index: number;
  x: number;
  close: number;
  cci: number | null;
  regime: ChartLineCciExtremeCrossRegime;
}

export interface ChartLineCciExtremeCrossRun {
  series: ChartLineCciExtremeCrossPoint[];
  length: number;
  upperMild: number;
  lowerMild: number;
  upperExtreme: number;
  lowerExtreme: number;
  cciValues: Array<number | null>;
  samples: ChartLineCciExtremeCrossSample[];
  crosses: ChartLineCciExtremeCrossCross[];
  bullishCount: number;
  bullishExtremeCount: number;
  neutralCount: number;
  bearishCount: number;
  bearishExtremeCount: number;
  noneCount: number;
  bullishMildEntryCount: number;
  bullishExtremeEntryCount: number;
  bearishMildEntryCount: number;
  bearishExtremeEntryCount: number;
  ok: boolean;
}

export interface ChartLineCciExtremeCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCciExtremeCrossLayout {
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
  priceDots: ChartLineCciExtremeCrossDot[];
  cciPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  midY: number;
  upperMildY: number;
  lowerMildY: number;
  upperExtremeY: number;
  lowerExtremeY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineCciExtremeCrossCrossKind;
  }>;
  run: ChartLineCciExtremeCrossRun;
}

export interface ChartLineCciExtremeCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCciExtremeCrossPoint[];
  length?: number;
  upperMild?: number;
  lowerMild?: number;
  upperExtreme?: number;
  lowerExtreme?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  cciColor?: string;
  bullishColor?: string;
  bullishExtremeColor?: string;
  bearishColor?: string;
  bearishExtremeColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCci?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCciExtremeCrossSeriesId[];
  defaultHiddenSeries?: ChartLineCciExtremeCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCciExtremeCrossSeriesId;
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

export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LENGTH = 20;
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_UPPER_MILD = 100;
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LOWER_MILD = -100;
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_UPPER_EXTREME = 200;
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LOWER_EXTREME = -200;
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_CCI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_BULLISH_EXTREME_COLOR =
  '#065f46';
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_BEARISH_EXTREME_COLOR =
  '#7f1d1d';
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_MID_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_OSC_RANGE = 300;
const CCI_FACTOR = 0.015;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineCciExtremeCrossFinitePoints(
  data: readonly ChartLineCciExtremeCrossPoint[] | null | undefined,
): ChartLineCciExtremeCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCciExtremeCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineCciExtremeCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a finite positive threshold. */
export function normalizeLineCciExtremeCrossPositive(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value > 0) return value;
  return fallback;
}

/** Coerce a finite negative threshold. */
export function normalizeLineCciExtremeCrossNegative(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value < 0) return value;
  return fallback;
}

/** SMA with CONST short-circuit via min === max. */
export function applyLineCciExtremeCrossSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (length === 1) {
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i];
      if (v != null) out[i] = posZero(v);
    }
    return out;
  }
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    let valid = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = values[j];
      if (v == null) {
        valid = false;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!valid) continue;
    out[i] = winMin === winMax ? winMin : posZero(sum / length);
  }
  return out;
}

export interface LineCciExtremeCrossChannels {
  cci: Array<number | null>;
}

export function computeLineCciExtremeCross(
  series: readonly ChartLineCciExtremeCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineCciExtremeCrossChannels {
  const cleaned = getLineCciExtremeCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { cci: [] };
  }
  const length = normalizeLineCciExtremeCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const sma = applyLineCciExtremeCrossSma(closes, length);

  const cci: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = length - 1; i < closes.length; i += 1) {
    const mean = sma[i];
    if (mean == null) continue;
    let sumAbsDev = 0;
    for (let j = i - length + 1; j <= i; j += 1) {
      sumAbsDev += Math.abs((closes[j] ?? 0) - mean);
    }
    const md = sumAbsDev / length;
    if (md === 0) {
      cci[i] = 0;
    } else {
      cci[i] = posZero(((closes[i] ?? 0) - mean) / (CCI_FACTOR * md));
    }
  }

  return { cci };
}

export function classifyLineCciExtremeCrossRegime(
  cci: number | null,
  upperMild: number,
  lowerMild: number,
  upperExtreme: number,
  lowerExtreme: number,
): ChartLineCciExtremeCrossRegime {
  if (cci == null) return 'none';
  if (cci >= upperExtreme) return 'bullishExtreme';
  if (cci >= upperMild) return 'bullish';
  if (cci <= lowerExtreme) return 'bearishExtreme';
  if (cci <= lowerMild) return 'bearish';
  return 'neutral';
}

export function detectLineCciExtremeCrossCrosses(
  series: readonly ChartLineCciExtremeCrossPoint[],
  cci: readonly (number | null)[],
  upperMild: number,
  lowerMild: number,
  upperExtreme: number,
  lowerExtreme: number,
): ChartLineCciExtremeCrossCross[] {
  const out: ChartLineCciExtremeCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = cci[i - 1];
    const cur = cci[i];
    if (prev == null || cur == null) continue;
    const x = series[i]!.x;
    if (prev <= upperMild && cur > upperMild) {
      out.push({ index: i, x, kind: 'bullishMild' });
    }
    if (prev <= upperExtreme && cur > upperExtreme) {
      out.push({ index: i, x, kind: 'bullishExtreme' });
    }
    if (prev >= lowerMild && cur < lowerMild) {
      out.push({ index: i, x, kind: 'bearishMild' });
    }
    if (prev >= lowerExtreme && cur < lowerExtreme) {
      out.push({ index: i, x, kind: 'bearishExtreme' });
    }
  }
  return out;
}

export function runLineCciExtremeCross(
  data: ChartLineCciExtremeCrossPoint[],
  options: {
    length?: number;
    upperMild?: number;
    lowerMild?: number;
    upperExtreme?: number;
    lowerExtreme?: number;
  } = {},
): ChartLineCciExtremeCrossRun {
  const cleaned = getLineCciExtremeCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineCciExtremeCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LENGTH,
  );
  const upperMild = normalizeLineCciExtremeCrossPositive(
    options.upperMild,
    DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_UPPER_MILD,
  );
  const lowerMild = normalizeLineCciExtremeCrossNegative(
    options.lowerMild,
    DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LOWER_MILD,
  );
  const upperExtreme = normalizeLineCciExtremeCrossPositive(
    options.upperExtreme,
    DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_UPPER_EXTREME,
  );
  const lowerExtreme = normalizeLineCciExtremeCrossNegative(
    options.lowerExtreme,
    DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LOWER_EXTREME,
  );

  const channels = computeLineCciExtremeCross(series, { length });

  const samples: ChartLineCciExtremeCrossSample[] = series.map((p, i) => {
    const v = channels.cci[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      cci: v,
      regime: classifyLineCciExtremeCrossRegime(
        v,
        upperMild,
        lowerMild,
        upperExtreme,
        lowerExtreme,
      ),
    };
  });

  const crosses = detectLineCciExtremeCrossCrosses(
    series,
    channels.cci,
    upperMild,
    lowerMild,
    upperExtreme,
    lowerExtreme,
  );

  let bullishCount = 0;
  let bullishExtremeCount = 0;
  let neutralCount = 0;
  let bearishCount = 0;
  let bearishExtremeCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullishExtreme') bullishExtremeCount += 1;
    else if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else if (s.regime === 'bearishExtreme') bearishExtremeCount += 1;
    else noneCount += 1;
  }

  let bullishMildEntryCount = 0;
  let bullishExtremeEntryCount = 0;
  let bearishMildEntryCount = 0;
  let bearishExtremeEntryCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullishMild') bullishMildEntryCount += 1;
    else if (c.kind === 'bullishExtreme') bullishExtremeEntryCount += 1;
    else if (c.kind === 'bearishMild') bearishMildEntryCount += 1;
    else bearishExtremeEntryCount += 1;
  }

  const ok = series.length > length;

  return {
    series,
    length,
    upperMild,
    lowerMild,
    upperExtreme,
    lowerExtreme,
    cciValues: channels.cci,
    samples,
    crosses,
    bullishCount,
    bullishExtremeCount,
    neutralCount,
    bearishCount,
    bearishExtremeCount,
    noneCount,
    bullishMildEntryCount,
    bullishExtremeEntryCount,
    bearishMildEntryCount,
    bearishExtremeEntryCount,
    ok,
  };
}

export interface ComputeLineCciExtremeCrossLayoutOptions {
  data: ChartLineCciExtremeCrossPoint[];
  length?: number;
  upperMild?: number;
  lowerMild?: number;
  upperExtreme?: number;
  lowerExtreme?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineCciExtremeCrossLayout(
  opts: ComputeLineCciExtremeCrossLayoutOptions,
): ChartLineCciExtremeCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_PANEL_GAP;
  const upperMild = normalizeLineCciExtremeCrossPositive(
    opts.upperMild,
    DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_UPPER_MILD,
  );
  const lowerMild = normalizeLineCciExtremeCrossNegative(
    opts.lowerMild,
    DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LOWER_MILD,
  );
  const upperExtreme = normalizeLineCciExtremeCrossPositive(
    opts.upperExtreme,
    DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_UPPER_EXTREME,
  );
  const lowerExtreme = normalizeLineCciExtremeCrossNegative(
    opts.lowerExtreme,
    DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LOWER_EXTREME,
  );

  const run = runLineCciExtremeCross(opts.data, {
    length: opts.length ?? undefined,
    upperMild,
    lowerMild,
    upperExtreme,
    lowerExtreme,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  let oscMin = -DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_OSC_RANGE;
  let oscMax = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_OSC_RANGE;
  for (const v of run.cciValues) {
    if (v == null) continue;
    if (v < oscMin) oscMin = v;
    if (v > oscMax) oscMax = v;
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax) || oscMin === oscMax) {
    oscMin = -DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_OSC_RANGE;
    oscMax = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_OSC_RANGE;
  }
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const midY = syOscBase(0);
  const upperMildY = syOscBase(upperMild);
  const lowerMildY = syOscBase(lowerMild);
  const upperExtremeY = syOscBase(upperExtreme);
  const lowerExtremeY = syOscBase(lowerExtreme);

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
      cciPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      midY,
      upperMildY,
      lowerMildY,
      upperExtremeY,
      lowerExtremeY,
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
  const priceDots: ChartLineCciExtremeCrossDot[] = [];
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

  let cciPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.cci == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.cci);
    cciPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  cciPath = cciPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.cciValues[c.index] ?? 0);
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
    cciPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    midY,
    upperMildY,
    lowerMildY,
    upperExtremeY,
    lowerExtremeY,
    crossMarkers,
    run,
  };
}

export function describeLineCciExtremeCrossChart(
  data: ChartLineCciExtremeCrossPoint[],
  options: {
    length?: number;
    upperMild?: number;
    lowerMild?: number;
    upperExtreme?: number;
    lowerExtreme?: number;
  } = {},
): string {
  const cleaned = getLineCciExtremeCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineCciExtremeCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LENGTH,
  );
  const upperMild = normalizeLineCciExtremeCrossPositive(
    options.upperMild,
    DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_UPPER_MILD,
  );
  const lowerMild = normalizeLineCciExtremeCrossNegative(
    options.lowerMild,
    DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LOWER_MILD,
  );
  const upperExtreme = normalizeLineCciExtremeCrossPositive(
    options.upperExtreme,
    DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_UPPER_EXTREME,
  );
  const lowerExtreme = normalizeLineCciExtremeCrossNegative(
    options.lowerExtreme,
    DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LOWER_EXTREME,
  );
  return (
    `CCI Extreme Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, upperMild ${upperMild}, lowerMild ` +
    `${lowerMild}, upperExtreme ${upperExtreme}, lowerExtreme ` +
    `${lowerExtreme}). Top panel renders the close with bullish ` +
    `/ bearish arrow overlays at every CCI extreme band cross; ` +
    `bottom panel renders the close-only CCI line on a dual-band ` +
    `oscillator with the +/- mild and +/- extreme reference lines ` +
    `and marks CCI level entry events.`
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
  kind: ChartLineCciExtremeCrossCrossKind,
  mildBull: string,
  extremeBull: string,
  mildBear: string,
  extremeBear: string,
): string => {
  switch (kind) {
    case 'bullishMild':
      return mildBull;
    case 'bullishExtreme':
      return extremeBull;
    case 'bearishMild':
      return mildBear;
    case 'bearishExtreme':
      return extremeBear;
  }
};

export const ChartLineCciExtremeCross = forwardRef<
  HTMLDivElement,
  ChartLineCciExtremeCrossProps
>(function ChartLineCciExtremeCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LENGTH,
    upperMild = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_UPPER_MILD,
    lowerMild = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LOWER_MILD,
    upperExtreme = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_UPPER_EXTREME,
    lowerExtreme = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LOWER_EXTREME,
    width = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_PRICE_COLOR,
    cciColor = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_CCI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_BULLISH_COLOR,
    bullishExtremeColor = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_BULLISH_EXTREME_COLOR,
    bearishColor = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_BEARISH_COLOR,
    bearishExtremeColor = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_BEARISH_EXTREME_COLOR,
    axisColor = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCci = true,
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
    () => getLineCciExtremeCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineCciExtremeCrossLayout({
        data: cleaned,
        length,
        upperMild,
        lowerMild,
        upperExtreme,
        lowerExtreme,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      upperMild,
      lowerMild,
      upperExtreme,
      lowerExtreme,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineCciExtremeCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineCciExtremeCrossSeriesId,
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
    seriesId: ChartLineCciExtremeCrossSeriesId,
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
        data-section="chart-line-cci-extreme-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineCciExtremeCrossChart(cleaned, {
      length,
      upperMild,
      lowerMild,
      upperExtreme,
      lowerExtreme,
    });

  const showPrice = !hidden.has('price');
  const showCciLine = !hidden.has('cci') && showCci;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [
    layout.oscMin,
    lowerExtreme,
    lowerMild,
    0,
    upperMild,
    upperExtreme,
    layout.oscMax,
  ];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'CCI Extreme Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-cci-extreme-cross"
      data-length={length}
      data-upper-mild={upperMild}
      data-lower-mild={lowerMild}
      data-upper-extreme={upperExtreme}
      data-lower-extreme={lowerExtreme}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bullish-extreme-count={layout.run.bullishExtremeCount}
      data-neutral-count={layout.run.neutralCount}
      data-bearish-count={layout.run.bearishCount}
      data-bearish-extreme-count={layout.run.bearishExtremeCount}
      data-bullish-mild-entry-count={layout.run.bullishMildEntryCount}
      data-bullish-extreme-entry-count={
        layout.run.bullishExtremeEntryCount
      }
      data-bearish-mild-entry-count={layout.run.bearishMildEntryCount}
      data-bearish-extreme-entry-count={
        layout.run.bearishExtremeEntryCount
      }
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-cci-extreme-cross-title"
      >
        {ariaLabel ?? 'CCI Extreme Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-cci-extreme-cross-aria-desc"
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
        data-section="chart-line-cci-extreme-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-cci-extreme-cross-grid">
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
                  data-section="chart-line-cci-extreme-cross-grid-line-price"
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
                  data-section="chart-line-cci-extreme-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-cci-extreme-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.upperExtremeY}
              x2={layout.innerRight}
              y2={layout.upperExtremeY}
              stroke={midColor}
              strokeDasharray="6 4"
              data-section="chart-line-cci-extreme-cross-band-upper-extreme"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.upperMildY}
              x2={layout.innerRight}
              y2={layout.upperMildY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-cci-extreme-cross-band-upper-mild"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.midY}
              x2={layout.innerRight}
              y2={layout.midY}
              stroke={midColor}
              strokeDasharray="2 4"
              data-section="chart-line-cci-extreme-cross-band-mid"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.lowerMildY}
              x2={layout.innerRight}
              y2={layout.lowerMildY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-cci-extreme-cross-band-lower-mild"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.lowerExtremeY}
              x2={layout.innerRight}
              y2={layout.lowerExtremeY}
              stroke={midColor}
              strokeDasharray="6 4"
              data-section="chart-line-cci-extreme-cross-band-lower-extreme"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-cci-extreme-cross-axes">
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
                  data-section="chart-line-cci-extreme-cross-tick-price"
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
                  data-section="chart-line-cci-extreme-cross-tick-osc"
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
            data-section="chart-line-cci-extreme-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-cci-extreme-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-cci-extreme-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showCciLine ? (
          <path
            d={layout.cciPath}
            stroke={cciColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-cci-extreme-cross-cci-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-cci-extreme-cross-crosses"
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
                  bullishColor,
                  bullishExtremeColor,
                  bearishColor,
                  bearishExtremeColor,
                )}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} cross at ${formatX(m.x)}`}
                data-section={`chart-line-cci-extreme-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-cci-extreme-cross-overlay-crosses"
            role="group"
            aria-label="overlay cross markers"
          >
            {layout.crossMarkers.map((m) => {
              const isBullish =
                m.kind === 'bullishMild' || m.kind === 'bullishExtreme';
              return (
                <polygon
                  key={`cross-overlay-${m.index}-${m.kind}`}
                  points={
                    isBullish
                      ? `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                      : `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                  }
                  fill={colorForCross(
                    m.kind,
                    bullishColor,
                    bullishExtremeColor,
                    bearishColor,
                    bearishExtremeColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`${m.kind} overlay at ${formatX(m.x)}`}
                  data-section={`chart-line-cci-extreme-cross-overlay-${m.kind}`}
                />
              );
            })}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-cci-extreme-cross-hover-targets">
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
                data-section="chart-line-cci-extreme-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-cci-extreme-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={236}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-extreme-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-extreme-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-extreme-cross-tooltip-cci"
                >
                  CCI{' '}
                  {tooltipSample.cci == null
                    ? '--'
                    : formatOsc(tooltipSample.cci)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-extreme-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-extreme-cross-tooltip-counts"
                >
                  bull {layout.run.bullishCount}/{
                    layout.run.bullishExtremeCount
                  }{' '}
                  | bear {layout.run.bearishCount}/{
                    layout.run.bearishExtremeCount
                  }
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-extreme-cross-tooltip-neutral"
                >
                  neutral {layout.run.neutralCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-extreme-cross-tooltip-entries"
                >
                  entries +M{layout.run.bullishMildEntryCount} +E
                  {layout.run.bullishExtremeEntryCount} -M
                  {layout.run.bearishMildEntryCount} -E
                  {layout.run.bearishExtremeEntryCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-extreme-cross-tooltip-crosses"
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
          data-section="chart-line-cci-extreme-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | bands {lowerExtreme}/{lowerMild}/{upperMild}/
          {upperExtreme} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-cci-extreme-cross-legend"
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
              { id: 'cci' as const, color: cciColor, label: 'CCI' },
            ] satisfies Array<{
              id: ChartLineCciExtremeCrossSeriesId;
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

ChartLineCciExtremeCross.displayName = 'ChartLineCciExtremeCross';
