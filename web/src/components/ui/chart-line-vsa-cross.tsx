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
 * ChartLineVsaCross -- pure-SVG dual-panel chart with the close
 * on top and a Volume Spread Analysis effort-vs-result oscillator
 * on the bottom. The indicator surfaces the divergence between
 * relative volume (effort) and relative bar spread (result), with
 * markers at every effort/result crossover of the signal line:
 *
 *   normVolume[i]   = SMA(volume, length)[i] === 0 ? null
 *                       : volume[i] / SMA(volume, length)[i]
 *   spread[i]       = high[i] - low[i]
 *   normSpread[i]   = SMA(spread, length)[i] === 0 ? null
 *                       : spread[i] / SMA(spread, length)[i]
 *   effortResult[i] = normVolume[i] - normSpread[i]
 *   signal[i]       = EMA(effortResult, signalLength)
 *
 * Cross events: `up` (effortResult newly exceeds signal -> regime
 * `absorption`), `down` (newly drops below signal -> regime
 * `ease`). `absorption` means heavy volume with little price
 * movement; `ease` means light volume moving price easily.
 *
 * Bit-exact anchor:
 *
 * - **CONST high - low = D (D > 0), close = K, volume = V (V >
 *   0)**: both SMAs land at their constants via the
 *   `min === max` window-constant precision fix. `normVolume =
 *   V/V = 1`, `normSpread = D/D = 1`, `effortResult = 0`,
 *   `signal = EMA(0) = 0`. Relation `equal` forever, zero
 *   crosses. Verified across multiple (D, V, length,
 *   signalLength) tuples. CONST D = 0 or V = 0 triggers the
 *   divide-by-zero guard -> effortResult = null.
 */

export interface ChartLineVsaCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartLineVsaCrossRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLineVsaCrossCross = 'up' | 'down' | null;

export type ChartLineVsaCrossRegime =
  | 'absorption'
  | 'ease'
  | 'aligned'
  | 'none';

export type ChartLineVsaCrossSeriesId = 'price' | 'effort' | 'signal';

export interface ChartLineVsaCrossSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  normVolume: number | null;
  normSpread: number | null;
  effortResult: number | null;
  signal: number | null;
  relation: ChartLineVsaCrossRelation;
  regime: ChartLineVsaCrossRegime;
  crossed: ChartLineVsaCrossCross;
}

export interface ChartLineVsaCrossRun {
  series: ChartLineVsaCrossPoint[];
  length: number;
  signalLength: number;
  normVolumeValues: Array<number | null>;
  normSpreadValues: Array<number | null>;
  effortResultValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineVsaCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  absorptionCount: number;
  easeCount: number;
  alignedCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineVsaCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  effortResult: number;
  kind: 'up' | 'down';
}

export interface ChartLineVsaCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVsaCrossLayout {
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
  priceDots: ChartLineVsaCrossDot[];
  effortPath: string;
  signalPath: string;
  markers: ChartLineVsaCrossMarker[];
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  run: ChartLineVsaCrossRun;
}

export interface ChartLineVsaCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVsaCrossPoint[];
  length?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  effortColor?: string;
  signalColor?: string;
  absorptionColor?: string;
  easeColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showEffort?: boolean;
  showSignal?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVsaCrossSeriesId[];
  defaultHiddenSeries?: ChartLineVsaCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVsaCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineVsaCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatEffort?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_VSA_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_VSA_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_VSA_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_VSA_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_VSA_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VSA_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VSA_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VSA_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_VSA_CROSS_LENGTH = 20;
export const DEFAULT_CHART_LINE_VSA_CROSS_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_VSA_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VSA_CROSS_EFFORT_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_VSA_CROSS_SIGNAL_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_VSA_CROSS_ABSORPTION_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VSA_CROSS_EASE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VSA_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_VSA_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VSA_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / high / low / close / volume. */
export function getLineVsaCrossFinitePoints(
  data: readonly ChartLineVsaCrossPoint[] | null | undefined,
): ChartLineVsaCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVsaCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume)
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: point.volume,
      });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineVsaCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * SMA with `min === max` window-constant precision fix.
 */
export function applyLineVsaCrossSma(
  values: readonly number[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    let winMin = Infinity;
    let winMax = -Infinity;
    let ok = true;
    for (let k = i - length + 1; k <= i; k += 1) {
      const v = values[k];
      if (v == null) {
        ok = false;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!ok) continue;
    out[i] =
      winMin === winMax && Number.isFinite(winMin)
        ? winMin
        : posZero(sum / length);
  }
  return out;
}

/**
 * SMA-seeded EMA with `min === max` precision fix and CONST short-
 * circuit so constant inputs land bit-exactly on the constant.
 */
export function applyLineVsaCrossEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);
  let smoothed: number | null = null;
  let sum = 0;
  let count = 0;
  let seedMin = Infinity;
  let seedMax = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      smoothed = null;
      sum = 0;
      count = 0;
      seedMin = Infinity;
      seedMax = -Infinity;
      continue;
    }
    if (smoothed == null) {
      sum += v;
      count += 1;
      if (v < seedMin) seedMin = v;
      if (v > seedMax) seedMax = v;
      if (count >= length) {
        smoothed = seedMin === seedMax ? seedMin : sum / length;
        out[i] = posZero(smoothed);
      }
    } else {
      const next =
        v === smoothed ? v : alpha * v + (1 - alpha) * smoothed;
      smoothed = next;
      out[i] = posZero(next);
    }
  }
  return out;
}

export interface LineVsaCrossChannels {
  normVolume: Array<number | null>;
  normSpread: Array<number | null>;
  effortResult: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineVsaCross(
  series: readonly ChartLineVsaCrossPoint[] | null | undefined,
  options: { length?: number; signalLength?: number } = {},
): LineVsaCrossChannels {
  const cleaned = getLineVsaCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { normVolume: [], normSpread: [], effortResult: [], signal: [] };
  }
  const length = normalizeLineVsaCrossLength(
    options.length,
    DEFAULT_CHART_LINE_VSA_CROSS_LENGTH,
  );
  const signalLength = normalizeLineVsaCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_VSA_CROSS_SIGNAL_LENGTH,
  );

  const volumes = cleaned.map((p) => p.volume);
  const spreads = cleaned.map((p) => p.high - p.low);

  const volSma = applyLineVsaCrossSma(volumes, length);
  const spreadSma = applyLineVsaCrossSma(spreads, length);

  const normVolume: Array<number | null> = new Array(cleaned.length).fill(
    null,
  );
  const normSpread: Array<number | null> = new Array(cleaned.length).fill(
    null,
  );
  const effortResult: Array<number | null> = new Array(cleaned.length).fill(
    null,
  );
  for (let i = 0; i < cleaned.length; i += 1) {
    const vs = volSma[i];
    const ss = spreadSma[i];
    if (vs != null && vs !== 0) {
      normVolume[i] = posZero(volumes[i]! / vs);
    }
    if (ss != null && ss !== 0) {
      normSpread[i] = posZero(spreads[i]! / ss);
    }
    const nv = normVolume[i];
    const ns = normSpread[i];
    if (nv == null || ns == null) continue;
    effortResult[i] = posZero(nv - ns);
  }
  const signal = applyLineVsaCrossEma(effortResult, signalLength);
  return { normVolume, normSpread, effortResult, signal };
}

export function classifyLineVsaCrossRelation(
  effortResult: number | null,
  signal: number | null,
): ChartLineVsaCrossRelation {
  if (effortResult == null || signal == null) return 'none';
  if (effortResult > signal) return 'bullish';
  if (effortResult < signal) return 'bearish';
  return 'equal';
}

export function classifyLineVsaCrossRegime(
  relation: ChartLineVsaCrossRelation,
): ChartLineVsaCrossRegime {
  if (relation === 'bullish') return 'absorption';
  if (relation === 'bearish') return 'ease';
  if (relation === 'equal') return 'aligned';
  return 'none';
}

export function detectLineVsaCrossCrosses(
  effortValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineVsaCrossCross[] {
  const out: ChartLineVsaCrossCross[] = [];
  let prevE: number | null = null;
  let prevS: number | null = null;
  for (let i = 0; i < effortValues.length; i += 1) {
    const e = effortValues[i];
    const s = signalValues[i];
    if (e == null || s == null) {
      out.push(null);
      prevE = null;
      prevS = null;
      continue;
    }
    if (prevE == null || prevS == null) {
      out.push(null);
      prevE = e;
      prevS = s;
      continue;
    }
    if (prevE <= prevS && e > s) {
      out.push('up');
    } else if (prevE >= prevS && e < s) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevE = e;
    prevS = s;
  }
  return out;
}

export function runLineVsaCross(
  data: ChartLineVsaCrossPoint[],
  options: { length?: number; signalLength?: number } = {},
): ChartLineVsaCrossRun {
  const cleaned = getLineVsaCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineVsaCrossLength(
    options.length,
    DEFAULT_CHART_LINE_VSA_CROSS_LENGTH,
  );
  const signalLength = normalizeLineVsaCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_VSA_CROSS_SIGNAL_LENGTH,
  );

  const channels = computeLineVsaCross(series, { length, signalLength });
  const crosses = detectLineVsaCrossCrosses(
    channels.effortResult,
    channels.signal,
  );

  const samples: ChartLineVsaCrossSample[] = series.map((p, i) => {
    const normVolume = channels.normVolume[i] ?? null;
    const normSpread = channels.normSpread[i] ?? null;
    const effortResult = channels.effortResult[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const relation = classifyLineVsaCrossRelation(effortResult, signal);
    const regime = classifyLineVsaCrossRegime(relation);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      volume: p.volume,
      normVolume,
      normSpread,
      effortResult,
      signal,
      relation,
      regime,
      crossed,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let absorptionCount = 0;
  let easeCount = 0;
  let alignedCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.regime === 'absorption') absorptionCount += 1;
    else if (s.regime === 'ease') easeCount += 1;
    else if (s.regime === 'aligned') alignedCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length + signalLength;

  return {
    series = [],
    length,
    signalLength,
    normVolumeValues: channels.normVolume,
    normSpreadValues: channels.normSpread,
    effortResultValues: channels.effortResult,
    signalValues: channels.signal,
    samples,
    upCrossCount,
    downCrossCount,
    absorptionCount,
    easeCount,
    alignedCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineVsaCrossLayoutOptions {
  data: ChartLineVsaCrossPoint[];
  length?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineVsaCrossLayout(
  opts: ComputeLineVsaCrossLayoutOptions,
): ChartLineVsaCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_VSA_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_VSA_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_VSA_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_VSA_CROSS_PANEL_GAP;

  const run = runLineVsaCross(opts.data, {
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
      effortPath: '',
      signalPath: '',
      markers: [],
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
    if (s.effortResult != null) {
      if (s.effortResult < oscMin) oscMin = s.effortResult;
      if (s.effortResult > oscMax) oscMax = s.effortResult;
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
  const priceDots: ChartLineVsaCrossDot[] = [];
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

  const buildPath = (key: 'effortResult' | 'signal'): string => {
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

  const effortPath = buildPath('effortResult');
  const signalPath = buildPath('signal');

  const markers: ChartLineVsaCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.effortResult == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syOsc(s.effortResult),
      effortResult: s.effortResult,
      kind: s.crossed,
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
    effortPath,
    signalPath,
    markers,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY: syOsc(0),
    run,
  };
}

export function describeLineVsaCrossChart(
  data: ChartLineVsaCrossPoint[],
  options: { length?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineVsaCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineVsaCrossLength(
    options.length,
    DEFAULT_CHART_LINE_VSA_CROSS_LENGTH,
  );
  const signalLength = normalizeLineVsaCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_VSA_CROSS_SIGNAL_LENGTH,
  );
  return (
    `VSA Cross chart over ${cleaned.length} bars (length ${length}, ` +
    `signalLength ${signalLength}). Top panel renders the close; ` +
    `bottom panel renders the Volume Spread Analysis effort - ` +
    `result oscillator and its EMA signal with markers at every ` +
    `cross (up -> absorption, down -> ease).`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultEffortFormatter = (value: number): string =>
  formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineVsaCross = forwardRef<
  HTMLDivElement,
  ChartLineVsaCrossProps
>(function ChartLineVsaCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_VSA_CROSS_LENGTH,
    signalLength = DEFAULT_CHART_LINE_VSA_CROSS_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_VSA_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_VSA_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_VSA_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_VSA_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_VSA_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VSA_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VSA_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_VSA_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_VSA_CROSS_PRICE_COLOR,
    effortColor = DEFAULT_CHART_LINE_VSA_CROSS_EFFORT_COLOR,
    signalColor = DEFAULT_CHART_LINE_VSA_CROSS_SIGNAL_COLOR,
    absorptionColor = DEFAULT_CHART_LINE_VSA_CROSS_ABSORPTION_COLOR,
    easeColor = DEFAULT_CHART_LINE_VSA_CROSS_EASE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_VSA_CROSS_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_VSA_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_VSA_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showEffort = true,
    showSignal = true,
    showMarkers = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onCrossClick,
    formatPrice = defaultPriceFormatter,
    formatEffort = defaultEffortFormatter,
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
    () => getLineVsaCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineVsaCrossLayout({
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
    ChartLineVsaCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineVsaCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineVsaCrossSeriesId,
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
        data-section="chart-line-vsa-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineVsaCrossChart(cleaned, { length, signalLength });

  const showPrice = !hidden.has('price');
  const showEffortLine = !hidden.has('effort') && showEffort;
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

  const markerColor = (kind: 'up' | 'down'): string =>
    kind === 'up' ? absorptionColor : easeColor;

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'VSA Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-vsa-cross"
      data-length={length}
      data-signal-length={signalLength}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
      data-absorption-count={layout.run.absorptionCount}
      data-ease-count={layout.run.easeCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-vsa-cross-title"
      >
        {ariaLabel ?? 'VSA Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-vsa-cross-aria-desc"
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
        data-section="chart-line-vsa-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-vsa-cross-grid">
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
                  data-section="chart-line-vsa-cross-grid-line-price"
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
                  data-section="chart-line-vsa-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-vsa-cross-axes">
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
                  data-section="chart-line-vsa-cross-tick-price"
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
                  data-section="chart-line-vsa-cross-tick-osc"
                >
                  {formatEffort(v)}
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
            data-section="chart-line-vsa-cross-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vsa-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-vsa-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-vsa-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vsa-cross-signal"
          />
        ) : null}

        {showEffortLine ? (
          <path
            d={layout.effortPath}
            stroke={effortColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vsa-cross-effort"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-vsa-cross-markers">
            {layout.markers.map((m) => (
              <circle
                key={`marker-${m.index}-${m.kind}`}
                cx={m.cx}
                cy={m.cy}
                r={markerRadius}
                fill={markerColor(m.kind)}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onCrossClick?.({ point: sample });
                }}
                data-section="chart-line-vsa-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-vsa-cross-hover-targets">
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
                data-section="chart-line-vsa-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-vsa-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={208}
                  height={172}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vsa-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vsa-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vsa-cross-tooltip-volume"
                >
                  volume {formatEffort(tooltipSample.volume)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vsa-cross-tooltip-nv"
                >
                  normVolume{' '}
                  {tooltipSample.normVolume == null
                    ? '--'
                    : formatEffort(tooltipSample.normVolume)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vsa-cross-tooltip-ns"
                >
                  normSpread{' '}
                  {tooltipSample.normSpread == null
                    ? '--'
                    : formatEffort(tooltipSample.normSpread)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vsa-cross-tooltip-effort"
                >
                  effort - result{' '}
                  {tooltipSample.effortResult == null
                    ? '--'
                    : formatEffort(tooltipSample.effortResult)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vsa-cross-tooltip-signal"
                >
                  signal{' '}
                  {tooltipSample.signal == null
                    ? '--'
                    : formatEffort(tooltipSample.signal)}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vsa-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vsa-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={142}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vsa-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={156}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vsa-cross-tooltip-counts"
                >
                  up {layout.run.upCrossCount} | down{' '}
                  {layout.run.downCrossCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-vsa-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | signal {signalLength} | absorption{' '}
          {layout.run.absorptionCount} | ease {layout.run.easeCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-vsa-cross-legend"
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
                id: 'effort' as const,
                color: effortColor,
                label: 'effort-result',
              },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineVsaCrossSeriesId;
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

ChartLineVsaCross.displayName = 'ChartLineVsaCross';
