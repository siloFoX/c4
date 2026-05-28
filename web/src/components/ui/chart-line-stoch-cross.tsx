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
 * ChartLineStochCross -- pure-SVG dual-panel chart with the close
 * line on top and a Stochastic oscillator (%K and %D) on the
 * bottom panel. Markers fire at every %K-vs-%D crossover and are
 * tagged with the overbought / oversold zone at the cross bar:
 *
 *   lowestLow  = min(low [i-kLen+1 .. i])
 *   highestHigh= max(high[i-kLen+1 .. i])
 *   range      = highestHigh - lowestLow
 *   %K         = 100 * (close - lowestLow) / range       if range > 0
 *              = null                                    if range == 0
 *   %D         = SMA(%K, dLength)
 *
 * Cross events: `up` (K newly exceeds D), `down` (K newly drops
 * below D). The `trigger` field then classifies the cross by zone:
 * `oversold` if %K is at/below `oversoldLevel` (default 20),
 * `overbought` if %K is at/above `overboughtLevel` (default 80),
 * otherwise `neutral`. Strong cross events for the user:
 *
 *   oversoldTrigger:    up cross while %K <= oversoldLevel
 *   overboughtTrigger:  down cross while %K >= overboughtLevel
 *
 * Bit-exact anchors (with the `min === max` SMA precision fix):
 *
 * - **CONST h = l = close = K**: highestHigh = lowestLow = K, so
 *   range = 0 and %K is `null` forever. %D is also null. Zero
 *   crosses fire and `zone` is `none`.
 * - **LINEAR UP h = l = close = i+1**: highestHigh = i+1,
 *   lowestLow = i+1-kLen+1, range = kLen-1, close - lowestLow =
 *   kLen-1, so %K = 100 once the window is full. SMA of a
 *   constant 100 = 100 (min===max seed). %K = %D = 100 bit-
 *   exactly; relation stays equal so zero crosses.
 * - **LINEAR DOWN h = l = close = N-i**: lowestLow = N-i,
 *   highestHigh = N-i+kLen-1, range = kLen-1, close - lowestLow
 *   = 0, so %K = 0 once the window is full. %D = 0. Zero crosses.
 *
 * LINEAR UP settles permanently in the overbought zone, LINEAR
 * DOWN in the oversold zone -- but no trigger fires because no
 * crossover ever occurs.
 */

export interface ChartLineStochCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineStochCrossRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLineStochCrossCross = 'up' | 'down' | null;

export type ChartLineStochCrossZone =
  | 'overbought'
  | 'oversold'
  | 'neutral'
  | 'none';

export type ChartLineStochCrossTrigger =
  | 'oversold'
  | 'overbought'
  | 'neutral'
  | null;

export type ChartLineStochCrossSeriesId = 'price' | 'k' | 'd';

export interface ChartLineStochCrossSample {
  index: number;
  x: number;
  close: number;
  k: number | null;
  d: number | null;
  relation: ChartLineStochCrossRelation;
  zone: ChartLineStochCrossZone;
  crossed: ChartLineStochCrossCross;
  trigger: ChartLineStochCrossTrigger;
}

export interface ChartLineStochCrossRun {
  series: ChartLineStochCrossPoint[];
  kLength: number;
  dLength: number;
  overboughtLevel: number;
  oversoldLevel: number;
  kValues: Array<number | null>;
  dValues: Array<number | null>;
  samples: ChartLineStochCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  oversoldTriggerCount: number;
  overboughtTriggerCount: number;
  neutralTriggerCount: number;
  overboughtCount: number;
  oversoldCount: number;
  neutralZoneCount: number;
  ok: boolean;
}

export interface ChartLineStochCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  k: number;
  kind: 'up' | 'down';
  trigger: NonNullable<ChartLineStochCrossTrigger>;
}

export interface ChartLineStochCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineStochCrossLayout {
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
  priceDots: ChartLineStochCrossDot[];
  kPath: string;
  dPath: string;
  markers: ChartLineStochCrossMarker[];
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  overboughtY: number;
  oversoldY: number;
  midlineY: number;
  run: ChartLineStochCrossRun;
}

export interface ChartLineStochCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStochCrossPoint[];
  kLength?: number;
  dLength?: number;
  overboughtLevel?: number;
  oversoldLevel?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  kColor?: string;
  dColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  midlineColor?: string;
  oversoldTriggerColor?: string;
  overboughtTriggerColor?: string;
  neutralTriggerColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showK?: boolean;
  showD?: boolean;
  showMarkers?: boolean;
  showOverbought?: boolean;
  showOversold?: boolean;
  showMidline?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStochCrossSeriesId[];
  defaultHiddenSeries?: ChartLineStochCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStochCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineStochCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatStoch?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_STOCH_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_STOCH_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_STOCH_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_STOCH_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_STOCH_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STOCH_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STOCH_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STOCH_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_STOCH_CROSS_K_LENGTH = 14;
export const DEFAULT_CHART_LINE_STOCH_CROSS_D_LENGTH = 3;
export const DEFAULT_CHART_LINE_STOCH_CROSS_OVERBOUGHT_LEVEL = 80;
export const DEFAULT_CHART_LINE_STOCH_CROSS_OVERSOLD_LEVEL = 20;
export const DEFAULT_CHART_LINE_STOCH_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STOCH_CROSS_K_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_STOCH_CROSS_D_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_STOCH_CROSS_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STOCH_CROSS_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STOCH_CROSS_MIDLINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_STOCH_CROSS_OVERSOLD_TRIGGER_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STOCH_CROSS_OVERBOUGHT_TRIGGER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STOCH_CROSS_NEUTRAL_TRIGGER_COLOR = '#475569';
export const DEFAULT_CHART_LINE_STOCH_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STOCH_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x, high, low, close. */
export function getLineStochCrossFinitePoints(
  data: readonly ChartLineStochCrossPoint[] | null | undefined,
): ChartLineStochCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStochCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
      });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineStochCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a finite level in [0, 100]. */
export function normalizeLineStochCrossLevel(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 0 && value <= 100) return value;
  return fallback;
}

/**
 * SMA helper with `min === max` precision fix so a constant window
 * lands bit-exactly on its constant.
 */
export function applyLineStochCrossSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += v;
    count += 1;
    if (count > length) {
      const drop = values[i - length];
      if (drop != null && isFiniteNumber(drop)) {
        sum -= drop;
      }
      count = length;
    }
    if (count === length) {
      let winMin = Infinity;
      let winMax = -Infinity;
      for (let k = i - length + 1; k <= i; k += 1) {
        const w = values[k];
        if (w == null) {
          winMin = -Infinity;
          winMax = Infinity;
          break;
        }
        if (w < winMin) winMin = w;
        if (w > winMax) winMax = w;
      }
      out[i] =
        winMin === winMax && Number.isFinite(winMin)
          ? winMin
          : posZero(sum / length);
    }
  }
  return out;
}

/** Compute raw %K series. Null when range = 0 or window incomplete. */
export function computeLineStochCrossK(
  data: readonly ChartLineStochCrossPoint[],
  kLength: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(data.length).fill(null);
  if (kLength < 2 || data.length < kLength) return out;
  for (let i = kLength - 1; i < data.length; i += 1) {
    let lo = Infinity;
    let hi = -Infinity;
    let ok = true;
    for (let k = i - kLength + 1; k <= i; k += 1) {
      const p = data[k];
      if (!p) {
        ok = false;
        break;
      }
      if (p.low < lo) lo = p.low;
      if (p.high > hi) hi = p.high;
    }
    if (!ok) continue;
    const cur = data[i];
    if (!cur) continue;
    const range = hi - lo;
    if (range === 0) continue;
    out[i] = posZero((100 * (cur.close - lo)) / range);
  }
  return out;
}

export interface LineStochCrossChannels {
  k: Array<number | null>;
  d: Array<number | null>;
}

export function computeLineStochCross(
  series: readonly ChartLineStochCrossPoint[] | null | undefined,
  options: { kLength?: number; dLength?: number } = {},
): LineStochCrossChannels {
  const cleaned = getLineStochCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { k: [], d: [] };
  }
  const kLength = normalizeLineStochCrossLength(
    options.kLength,
    DEFAULT_CHART_LINE_STOCH_CROSS_K_LENGTH,
  );
  const dLength = normalizeLineStochCrossLength(
    options.dLength,
    DEFAULT_CHART_LINE_STOCH_CROSS_D_LENGTH,
  );
  const k = computeLineStochCrossK(cleaned, kLength);
  const d = applyLineStochCrossSma(k, dLength);
  return { k, d };
}

export function classifyLineStochCrossRelation(
  k: number | null,
  d: number | null,
): ChartLineStochCrossRelation {
  if (k == null || d == null) return 'none';
  if (k > d) return 'bullish';
  if (k < d) return 'bearish';
  return 'equal';
}

export function classifyLineStochCrossZone(
  k: number | null,
  overboughtLevel: number,
  oversoldLevel: number,
): ChartLineStochCrossZone {
  if (k == null) return 'none';
  if (k >= overboughtLevel) return 'overbought';
  if (k <= oversoldLevel) return 'oversold';
  return 'neutral';
}

export function detectLineStochCrossCrosses(
  kValues: readonly (number | null)[],
  dValues: readonly (number | null)[],
): ChartLineStochCrossCross[] {
  const out: ChartLineStochCrossCross[] = [];
  let prevK: number | null = null;
  let prevD: number | null = null;
  for (let i = 0; i < kValues.length; i += 1) {
    const k = kValues[i];
    const d = dValues[i];
    if (k == null || d == null) {
      out.push(null);
      prevK = null;
      prevD = null;
      continue;
    }
    if (prevK == null || prevD == null) {
      out.push(null);
      prevK = k;
      prevD = d;
      continue;
    }
    if (prevK <= prevD && k > d) {
      out.push('up');
    } else if (prevK >= prevD && k < d) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevK = k;
    prevD = d;
  }
  return out;
}

export function classifyLineStochCrossTrigger(
  cross: ChartLineStochCrossCross,
  k: number | null,
  overboughtLevel: number,
  oversoldLevel: number,
): ChartLineStochCrossTrigger {
  if (cross == null || k == null) return null;
  if (cross === 'up' && k <= oversoldLevel) return 'oversold';
  if (cross === 'down' && k >= overboughtLevel) return 'overbought';
  return 'neutral';
}

export function runLineStochCross(
  data: ChartLineStochCrossPoint[],
  options: {
    kLength?: number;
    dLength?: number;
    overboughtLevel?: number;
    oversoldLevel?: number;
  } = {},
): ChartLineStochCrossRun {
  const cleaned = getLineStochCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const kLength = normalizeLineStochCrossLength(
    options.kLength,
    DEFAULT_CHART_LINE_STOCH_CROSS_K_LENGTH,
  );
  const dLength = normalizeLineStochCrossLength(
    options.dLength,
    DEFAULT_CHART_LINE_STOCH_CROSS_D_LENGTH,
  );
  const overboughtLevel = normalizeLineStochCrossLevel(
    options.overboughtLevel,
    DEFAULT_CHART_LINE_STOCH_CROSS_OVERBOUGHT_LEVEL,
  );
  const oversoldLevel = normalizeLineStochCrossLevel(
    options.oversoldLevel,
    DEFAULT_CHART_LINE_STOCH_CROSS_OVERSOLD_LEVEL,
  );

  const channels = computeLineStochCross(series, { kLength, dLength });
  const crosses = detectLineStochCrossCrosses(channels.k, channels.d);

  const samples: ChartLineStochCrossSample[] = series.map((p, i) => {
    const k = channels.k[i] ?? null;
    const d = channels.d[i] ?? null;
    const relation = classifyLineStochCrossRelation(k, d);
    const zone = classifyLineStochCrossZone(
      k,
      overboughtLevel,
      oversoldLevel,
    );
    const crossed = crosses[i] ?? null;
    const trigger = classifyLineStochCrossTrigger(
      crossed,
      k,
      overboughtLevel,
      oversoldLevel,
    );
    return {
      index: i,
      x: p.x,
      close: p.close,
      k,
      d,
      relation,
      zone,
      crossed,
      trigger,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let oversoldTriggerCount = 0;
  let overboughtTriggerCount = 0;
  let neutralTriggerCount = 0;
  let overboughtCount = 0;
  let oversoldCount = 0;
  let neutralZoneCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.trigger === 'oversold') oversoldTriggerCount += 1;
    else if (s.trigger === 'overbought') overboughtTriggerCount += 1;
    else if (s.trigger === 'neutral') neutralTriggerCount += 1;
    if (s.zone === 'overbought') overboughtCount += 1;
    else if (s.zone === 'oversold') oversoldCount += 1;
    else if (s.zone === 'neutral') neutralZoneCount += 1;
  }

  const ok = series.length > kLength + dLength;

  return {
    series = [],
    kLength,
    dLength,
    overboughtLevel,
    oversoldLevel,
    kValues: channels.k,
    dValues: channels.d,
    samples,
    upCrossCount,
    downCrossCount,
    oversoldTriggerCount,
    overboughtTriggerCount,
    neutralTriggerCount,
    overboughtCount,
    oversoldCount,
    neutralZoneCount,
    ok,
  };
}

export interface ComputeLineStochCrossLayoutOptions {
  data: ChartLineStochCrossPoint[];
  kLength?: number;
  dLength?: number;
  overboughtLevel?: number;
  oversoldLevel?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineStochCrossLayout(
  opts: ComputeLineStochCrossLayoutOptions,
): ChartLineStochCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_STOCH_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_STOCH_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_STOCH_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_STOCH_CROSS_PANEL_GAP;

  const run = runLineStochCross(opts.data, {
    kLength: opts.kLength ?? undefined,
    dLength: opts.dLength ?? undefined,
    overboughtLevel: opts.overboughtLevel ?? undefined,
    oversoldLevel: opts.oversoldLevel ?? undefined,
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
      kPath: '',
      dPath: '',
      markers: [],
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      overboughtY: 0,
      oversoldY: 0,
      midlineY: (oscTop + oscBottom) / 2,
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
  const syOsc = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

  let pricePath = '';
  const priceDots: ChartLineStochCrossDot[] = [];
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

  const buildPath = (key: 'k' | 'd'): string => {
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

  const kPath = buildPath('k');
  const dPath = buildPath('d');

  const markers: ChartLineStochCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.k == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syOsc(s.k),
      k: s.k,
      kind: s.crossed,
      trigger: s.trigger ?? 'neutral',
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
    kPath,
    dPath,
    markers,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    overboughtY: syOsc(run.overboughtLevel),
    oversoldY: syOsc(run.oversoldLevel),
    midlineY: syOsc(50),
    run,
  };
}

export function describeLineStochCrossChart(
  data: ChartLineStochCrossPoint[],
  options: {
    kLength?: number;
    dLength?: number;
    overboughtLevel?: number;
    oversoldLevel?: number;
  } = {},
): string {
  const cleaned = getLineStochCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const kLength = normalizeLineStochCrossLength(
    options.kLength,
    DEFAULT_CHART_LINE_STOCH_CROSS_K_LENGTH,
  );
  const dLength = normalizeLineStochCrossLength(
    options.dLength,
    DEFAULT_CHART_LINE_STOCH_CROSS_D_LENGTH,
  );
  const overboughtLevel = normalizeLineStochCrossLevel(
    options.overboughtLevel,
    DEFAULT_CHART_LINE_STOCH_CROSS_OVERBOUGHT_LEVEL,
  );
  const oversoldLevel = normalizeLineStochCrossLevel(
    options.oversoldLevel,
    DEFAULT_CHART_LINE_STOCH_CROSS_OVERSOLD_LEVEL,
  );
  return (
    `Stoch Cross chart over ${cleaned.length} bars ` +
    `(kLength ${kLength}, dLength ${dLength}, ` +
    `overboughtLevel ${overboughtLevel}, oversoldLevel ` +
    `${oversoldLevel}). Top panel renders the close; bottom panel ` +
    `renders the Stochastic %K and %D lines with markers at every ` +
    `crossover (tagged oversold when %K <= oversoldLevel at the ` +
    `cross bar, overbought when >= overboughtLevel, neutral ` +
    `otherwise).`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultStochFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineStochCross = forwardRef<
  HTMLDivElement,
  ChartLineStochCrossProps
>(function ChartLineStochCross(props, ref): ReactNode {
  const {
    data,
    kLength = DEFAULT_CHART_LINE_STOCH_CROSS_K_LENGTH,
    dLength = DEFAULT_CHART_LINE_STOCH_CROSS_D_LENGTH,
    overboughtLevel = DEFAULT_CHART_LINE_STOCH_CROSS_OVERBOUGHT_LEVEL,
    oversoldLevel = DEFAULT_CHART_LINE_STOCH_CROSS_OVERSOLD_LEVEL,
    width = DEFAULT_CHART_LINE_STOCH_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_STOCH_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_STOCH_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_STOCH_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_STOCH_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_STOCH_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STOCH_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_STOCH_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STOCH_CROSS_PRICE_COLOR,
    kColor = DEFAULT_CHART_LINE_STOCH_CROSS_K_COLOR,
    dColor = DEFAULT_CHART_LINE_STOCH_CROSS_D_COLOR,
    overboughtColor = DEFAULT_CHART_LINE_STOCH_CROSS_OVERBOUGHT_COLOR,
    oversoldColor = DEFAULT_CHART_LINE_STOCH_CROSS_OVERSOLD_COLOR,
    midlineColor = DEFAULT_CHART_LINE_STOCH_CROSS_MIDLINE_COLOR,
    oversoldTriggerColor = DEFAULT_CHART_LINE_STOCH_CROSS_OVERSOLD_TRIGGER_COLOR,
    overboughtTriggerColor = DEFAULT_CHART_LINE_STOCH_CROSS_OVERBOUGHT_TRIGGER_COLOR,
    neutralTriggerColor = DEFAULT_CHART_LINE_STOCH_CROSS_NEUTRAL_TRIGGER_COLOR,
    axisColor = DEFAULT_CHART_LINE_STOCH_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_STOCH_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showK = true,
    showD = true,
    showMarkers = true,
    showOverbought = true,
    showOversold = true,
    showMidline = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onCrossClick,
    formatPrice = defaultPriceFormatter,
    formatStoch = defaultStochFormatter,
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
    () => getLineStochCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineStochCrossLayout({
        data: cleaned,
        kLength,
        dLength,
        overboughtLevel,
        oversoldLevel,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      kLength,
      dLength,
      overboughtLevel,
      oversoldLevel,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineStochCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineStochCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineStochCrossSeriesId,
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
        data-section="chart-line-stoch-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineStochCrossChart(cleaned, {
      kLength,
      dLength,
      overboughtLevel,
      oversoldLevel,
    });

  const showPrice = !hidden.has('price');
  const showKLine = !hidden.has('k') && showK;
  const showDLine = !hidden.has('d') && showD;

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

  const markerColor = (
    trigger: NonNullable<ChartLineStochCrossTrigger>,
  ): string => {
    if (trigger === 'oversold') return oversoldTriggerColor;
    if (trigger === 'overbought') return overboughtTriggerColor;
    return neutralTriggerColor;
  };

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Stochastic Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-stoch-cross"
      data-k-length={kLength}
      data-d-length={dLength}
      data-overbought-level={overboughtLevel}
      data-oversold-level={oversoldLevel}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
      data-oversold-trigger-count={layout.run.oversoldTriggerCount}
      data-overbought-trigger-count={layout.run.overboughtTriggerCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-stoch-cross-title"
      >
        {ariaLabel ?? 'Stochastic Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-stoch-cross-aria-desc"
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
        data-section="chart-line-stoch-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-stoch-cross-grid">
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
                  data-section="chart-line-stoch-cross-grid-line-price"
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
                  data-section="chart-line-stoch-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-stoch-cross-axes">
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
                  data-section="chart-line-stoch-cross-tick-price"
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
                  data-section="chart-line-stoch-cross-tick-osc"
                >
                  {formatStoch(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showOverbought ? (
          <line
            x1={layout.innerLeft}
            y1={layout.overboughtY}
            x2={layout.innerRight}
            y2={layout.overboughtY}
            stroke={overboughtColor}
            strokeDasharray="3 3"
            data-section="chart-line-stoch-cross-overbought"
          />
        ) : null}

        {showOversold ? (
          <line
            x1={layout.innerLeft}
            y1={layout.oversoldY}
            x2={layout.innerRight}
            y2={layout.oversoldY}
            stroke={oversoldColor}
            strokeDasharray="3 3"
            data-section="chart-line-stoch-cross-oversold"
          />
        ) : null}

        {showMidline ? (
          <line
            x1={layout.innerLeft}
            y1={layout.midlineY}
            x2={layout.innerRight}
            y2={layout.midlineY}
            stroke={midlineColor}
            strokeDasharray="2 4"
            data-section="chart-line-stoch-cross-midline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-stoch-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-stoch-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showDLine ? (
          <path
            d={layout.dPath}
            stroke={dColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-cross-d"
          />
        ) : null}

        {showKLine ? (
          <path
            d={layout.kPath}
            stroke={kColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-cross-k"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-stoch-cross-markers">
            {layout.markers.map((m) => (
              <circle
                key={`marker-${m.index}-${m.kind}`}
                cx={m.cx}
                cy={m.cy}
                r={markerRadius}
                fill={markerColor(m.trigger)}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onCrossClick?.({ point: sample });
                }}
                data-section="chart-line-stoch-cross-marker"
                data-kind={m.kind}
                data-trigger={m.trigger}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-stoch-cross-hover-targets">
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
                data-section="chart-line-stoch-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-stoch-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={196}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-tooltip-k"
                >
                  %K{' '}
                  {tooltipSample.k == null
                    ? '--'
                    : formatStoch(tooltipSample.k)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-tooltip-d"
                >
                  %D{' '}
                  {tooltipSample.d == null
                    ? '--'
                    : formatStoch(tooltipSample.d)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-tooltip-trigger"
                >
                  trigger {tooltipSample.trigger ?? '--'}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-tooltip-counts"
                >
                  oversold {layout.run.oversoldTriggerCount} | overbought{' '}
                  {layout.run.overboughtTriggerCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-stoch-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          %K {kLength} | %D {dLength} | OB {overboughtLevel} | OS{' '}
          {oversoldLevel} | up {layout.run.upCrossCount} | down{' '}
          {layout.run.downCrossCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-stoch-cross-legend"
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
              { id: 'k' as const, color: kColor, label: '%K' },
              { id: 'd' as const, color: dColor, label: '%D' },
            ] satisfies Array<{
              id: ChartLineStochCrossSeriesId;
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

ChartLineStochCross.displayName = 'ChartLineStochCross';
