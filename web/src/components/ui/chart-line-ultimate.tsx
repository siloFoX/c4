import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ULTIMATE_WIDTH = 560;
export const DEFAULT_CHART_LINE_ULTIMATE_HEIGHT = 360;
export const DEFAULT_CHART_LINE_ULTIMATE_PADDING = 40;
export const DEFAULT_CHART_LINE_ULTIMATE_GAP = 26;
export const DEFAULT_CHART_LINE_ULTIMATE_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_ULTIMATE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ULTIMATE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ULTIMATE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ULTIMATE_SHORT_PERIOD = 7;
export const DEFAULT_CHART_LINE_ULTIMATE_MEDIUM_PERIOD = 14;
export const DEFAULT_CHART_LINE_ULTIMATE_LONG_PERIOD = 28;
export const DEFAULT_CHART_LINE_ULTIMATE_UPPER_THRESHOLD = 70;
export const DEFAULT_CHART_LINE_ULTIMATE_LOWER_THRESHOLD = 30;
export const DEFAULT_CHART_LINE_ULTIMATE_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_ULTIMATE_UO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ULTIMATE_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ULTIMATE_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ULTIMATE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ULTIMATE_AXIS_COLOR = '#cbd5e1';

/** The three lookback ratios are blended at fixed descending weights. */
const ULTIMATE_WEIGHTS = [4, 2, 1] as const;
const ULTIMATE_WEIGHT_SUM = 7;

export type ChartLineUltimateZone = 'overbought' | 'oversold' | 'neutral';

export interface ChartLineUltimatePoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLineUltimateSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  uo: number | null;
  zone: ChartLineUltimateZone;
}

export interface ChartLineUltimateRun {
  series: ChartLineUltimatePoint[];
  shortPeriod: number;
  mediumPeriod: number;
  longPeriod: number;
  upperThreshold: number;
  lowerThreshold: number;
  bp: (number | null)[];
  tr: (number | null)[];
  uo: (number | null)[];
  samples: ChartLineUltimateSample[];
  uoFinal: number;
  uoMin: number;
  uoMax: number;
  overboughtCount: number;
  oversoldCount: number;
  ok: boolean;
}

export interface ChartLineUltimatePriceDot {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  uo: number | null;
  zone: ChartLineUltimateZone;
  px: number;
  py: number;
}

export interface ChartLineUltimateMarker {
  index: number;
  x: number;
  uo: number;
  zone: ChartLineUltimateZone;
  px: number;
  py: number;
}

export interface ChartLineUltimatePanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineUltimateRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineUltimateLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineUltimatePanel;
  uoPanel: ChartLineUltimatePanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  uoYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineUltimatePriceDot[];
  uoPath: string;
  markers: ChartLineUltimateMarker[];
  overboughtRect: ChartLineUltimateRect;
  oversoldRect: ChartLineUltimateRect;
  upperY: number;
  lowerY: number;
  shortPeriod: number;
  mediumPeriod: number;
  longPeriod: number;
  upperThreshold: number;
  lowerThreshold: number;
  uoFinal: number;
  uoMin: number;
  uoMax: number;
  overboughtCount: number;
  oversoldCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineUltimateLayoutOptions {
  data: readonly ChartLineUltimatePoint[];
  shortPeriod?: number;
  mediumPeriod?: number;
  longPeriod?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineUltimateProps {
  data: readonly ChartLineUltimatePoint[];
  shortPeriod?: number;
  mediumPeriod?: number;
  longPeriod?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  uoColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showUo?: boolean;
  showZones?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineUltimatePriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineUltimateFinitePoints(
  points: readonly ChartLineUltimatePoint[] | null | undefined,
): ChartLineUltimatePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineUltimatePoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineUltimatePeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Buying pressure and true range. Buying pressure is the close minus
 * the lower of the bar's low and the prior close; true range is the
 * higher of the bar's high and the prior close minus that same lower
 * bound. Index 0 has no prior close so both read null.
 */
export function computeLineUltimateBpTr(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
): { bp: (number | null)[]; tr: (number | null)[] } {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes)
  ) {
    return { bp: [], tr: [] };
  }
  const n = Math.min(highs.length, lows.length, closes.length);
  const bp: (number | null)[] = new Array(n).fill(null);
  const tr: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const prevClose = closes[i - 1]!;
    const lo = Math.min(lows[i]!, prevClose);
    const hi = Math.max(highs[i]!, prevClose);
    bp[i] = closes[i]! - lo;
    tr[i] = hi - lo;
  }
  return { bp, tr };
}

/**
 * The buying-pressure to true-range ratio over `period` bars: the sum
 * of buying pressure divided by the sum of true range. A window with
 * zero total true range reads the neutral 0.5. Indices whose window
 * touches a null read null.
 */
export function computeLineUltimateAvg(
  bp: readonly (number | null)[] | null | undefined,
  tr: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(bp) || !Array.isArray(tr)) return [];
  const n = Math.min(bp.length, tr.length);
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let bpSum = 0;
    let trSum = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const b = bp[i - k];
      const t = tr[i - k];
      if (!isDefined(b) || !isDefined(t)) {
        valid = false;
        break;
      }
      bpSum += b;
      trSum += t;
    }
    if (valid) {
      const raw = trSum === 0 ? 0.5 : bpSum / trSum;
      out[i] = raw === 0 ? 0 : raw;
    }
  }
  return out;
}

/**
 * Larry Williams' Ultimate Oscillator. Buying pressure and true range
 * are summed over three lookback windows (short, medium, long); the
 * three ratios are blended at the fixed descending weights 4/2/1 and
 * scaled to 0-100. The shortest window carries the most weight.
 */
export function computeLineUltimate(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
  shortPeriod: number,
  mediumPeriod: number,
  longPeriod: number,
): {
  bp: (number | null)[];
  tr: (number | null)[];
  avg1: (number | null)[];
  avg2: (number | null)[];
  avg3: (number | null)[];
  uo: (number | null)[];
} {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes)
  ) {
    return { bp: [], tr: [], avg1: [], avg2: [], avg3: [], uo: [] };
  }
  const { bp, tr } = computeLineUltimateBpTr(highs, lows, closes);
  const n = bp.length;
  const avg1 = computeLineUltimateAvg(bp, tr, shortPeriod);
  const avg2 = computeLineUltimateAvg(bp, tr, mediumPeriod);
  const avg3 = computeLineUltimateAvg(bp, tr, longPeriod);
  const uo: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const a = avg1[i];
    const b = avg2[i];
    const c = avg3[i];
    if (isDefined(a) && isDefined(b) && isDefined(c)) {
      let u =
        (100 *
          (ULTIMATE_WEIGHTS[0] * a +
            ULTIMATE_WEIGHTS[1] * b +
            ULTIMATE_WEIGHTS[2] * c)) /
        ULTIMATE_WEIGHT_SUM;
      if (u < 0) u = 0;
      if (u > 100) u = 100;
      uo[i] = u === 0 ? 0 : u;
    }
  }
  return { bp, tr, avg1, avg2, avg3, uo };
}

function classifyZone(
  uo: number | null,
  upper: number,
  lower: number,
): ChartLineUltimateZone {
  if (uo === null) return 'neutral';
  if (uo >= upper) return 'overbought';
  if (uo <= lower) return 'oversold';
  return 'neutral';
}

export function runLineUltimate(
  points: readonly ChartLineUltimatePoint[] | null | undefined,
  options?: {
    shortPeriod?: number;
    mediumPeriod?: number;
    longPeriod?: number;
    upperThreshold?: number;
    lowerThreshold?: number;
  },
): ChartLineUltimateRun {
  const finite = getLineUltimateFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const shortPeriod = normalizeLineUltimatePeriod(
    options?.shortPeriod ?? DEFAULT_CHART_LINE_ULTIMATE_SHORT_PERIOD,
    DEFAULT_CHART_LINE_ULTIMATE_SHORT_PERIOD,
  );
  const mediumPeriod = normalizeLineUltimatePeriod(
    options?.mediumPeriod ?? DEFAULT_CHART_LINE_ULTIMATE_MEDIUM_PERIOD,
    DEFAULT_CHART_LINE_ULTIMATE_MEDIUM_PERIOD,
  );
  const longPeriod = normalizeLineUltimatePeriod(
    options?.longPeriod ?? DEFAULT_CHART_LINE_ULTIMATE_LONG_PERIOD,
    DEFAULT_CHART_LINE_ULTIMATE_LONG_PERIOD,
  );
  const upperThreshold = isFiniteNumber(options?.upperThreshold)
    ? (options!.upperThreshold as number)
    : DEFAULT_CHART_LINE_ULTIMATE_UPPER_THRESHOLD;
  const lowerThreshold = isFiniteNumber(options?.lowerThreshold)
    ? (options!.lowerThreshold as number)
    : DEFAULT_CHART_LINE_ULTIMATE_LOWER_THRESHOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      shortPeriod,
      mediumPeriod,
      longPeriod,
      upperThreshold,
      lowerThreshold,
      bp: [],
      tr: [],
      uo: [],
      samples: [],
      uoFinal: NaN,
      uoMin: NaN,
      uoMax: NaN,
      overboughtCount: 0,
      oversoldCount: 0,
      ok: false,
    };
  }

  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const closes = series.map((p) => p.close);
  const { bp, tr, uo } = computeLineUltimate(
    highs,
    lows,
    closes,
    shortPeriod,
    mediumPeriod,
    longPeriod,
  );

  const samples: ChartLineUltimateSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    high: p.high,
    low: p.low,
    close: p.close,
    uo: uo[i] ?? null,
    zone: classifyZone(uo[i] ?? null, upperThreshold, lowerThreshold),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let uoMin = NaN;
  let uoMax = NaN;
  let overboughtCount = 0;
  let oversoldCount = 0;
  for (const s of samples) {
    if (s.uo !== null) {
      if (Number.isNaN(uoMin) || s.uo < uoMin) uoMin = s.uo;
      if (Number.isNaN(uoMax) || s.uo > uoMax) uoMax = s.uo;
    }
    if (s.zone === 'overbought') overboughtCount += 1;
    if (s.zone === 'oversold') oversoldCount += 1;
  }

  return {
    series,
    shortPeriod,
    mediumPeriod,
    longPeriod,
    upperThreshold,
    lowerThreshold,
    bp,
    tr,
    uo,
    samples,
    uoFinal: lastDefined(uo),
    uoMin,
    uoMax,
    overboughtCount,
    oversoldCount,
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

export function computeLineUltimateLayout(
  options: ComputeLineUltimateLayoutOptions,
): ChartLineUltimateLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_ULTIMATE_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_ULTIMATE_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_ULTIMATE_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineUltimatePanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const emptyRect: ChartLineUltimateRect = { x: 0, y: 0, width: 0, height: 0 };
  const run = runLineUltimate(data, {
    ...(isFiniteNumber(options.shortPeriod)
      ? { shortPeriod: options.shortPeriod }
      : {}),
    ...(isFiniteNumber(options.mediumPeriod)
      ? { mediumPeriod: options.mediumPeriod }
      : {}),
    ...(isFiniteNumber(options.longPeriod)
      ? { longPeriod: options.longPeriod }
      : {}),
    ...(isFiniteNumber(options.upperThreshold)
      ? { upperThreshold: options.upperThreshold }
      : {}),
    ...(isFiniteNumber(options.lowerThreshold)
      ? { lowerThreshold: options.lowerThreshold }
      : {}),
  });
  const empty: ChartLineUltimateLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    uoPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    uoYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    uoPath: '',
    markers: [],
    overboughtRect: emptyRect,
    oversoldRect: emptyRect,
    upperY: 0,
    lowerY: 0,
    shortPeriod: run.shortPeriod,
    mediumPeriod: run.mediumPeriod,
    longPeriod: run.longPeriod,
    upperThreshold: run.upperThreshold,
    lowerThreshold: run.lowerThreshold,
    uoFinal: NaN,
    uoMin: NaN,
    uoMax: NaN,
    overboughtCount: 0,
    oversoldCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const uoH = usableHeight - priceH;
  if (priceH <= 0 || uoH <= 0) return empty;

  const pricePanel: ChartLineUltimatePanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const uoPanel: ChartLineUltimatePanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: uoH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.close < pyLo) pyLo = s.close;
    if (s.close > pyHi) pyHi = s.close;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectUoY = (v: number): number => {
    const c = v < 0 ? 0 : v > 100 ? 100 : v;
    return uoPanel.y + uoPanel.height - (c / 100) * uoPanel.height;
  };

  const priceDots: ChartLineUltimatePriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    high: s.high,
    low: s.low,
    close: s.close,
    uo: s.uo,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.close),
  }));

  const uoPts: { px: number; py: number }[] = [];
  const markers: ChartLineUltimateMarker[] = [];
  for (const s of run.samples) {
    if (s.uo !== null) {
      const px = projectX(s.x);
      const py = projectUoY(s.uo);
      uoPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        uo: s.uo,
        zone: s.zone,
        px,
        py,
      });
    }
  }

  const upperY = projectUoY(run.upperThreshold);
  const lowerY = projectUoY(run.lowerThreshold);
  const topY = projectUoY(100);
  const bottomY = projectUoY(0);

  return {
    ok: true,
    width,
    height,
    pricePanel,
    uoPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    uoYTicks: computeTicks(0, 100, tickCount).map((v) => ({
      value: v,
      py: projectUoY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    uoPath: buildPath(uoPts),
    markers,
    overboughtRect: {
      x: uoPanel.x,
      y: topY,
      width: uoPanel.width,
      height: upperY - topY,
    },
    oversoldRect: {
      x: uoPanel.x,
      y: lowerY,
      width: uoPanel.width,
      height: bottomY - lowerY,
    },
    upperY,
    lowerY,
    shortPeriod: run.shortPeriod,
    mediumPeriod: run.mediumPeriod,
    longPeriod: run.longPeriod,
    upperThreshold: run.upperThreshold,
    lowerThreshold: run.lowerThreshold,
    uoFinal: run.uoFinal,
    uoMin: run.uoMin,
    uoMax: run.uoMax,
    overboughtCount: run.overboughtCount,
    oversoldCount: run.oversoldCount,
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

export function describeLineUltimateChart(
  data: readonly ChartLineUltimatePoint[] | null | undefined,
  options?: {
    shortPeriod?: number;
    mediumPeriod?: number;
    longPeriod?: number;
    upperThreshold?: number;
    lowerThreshold?: number;
  },
): string {
  const run = runLineUltimate(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with an Ultimate Oscillator panel on a 0-100 scale (lookbacks ${run.shortPeriod}/${run.mediumPeriod}/${run.longPeriod}): the Ultimate Oscillator blends three buying pressure to true range ratios over short, medium and long lookback windows, weighted 4/2/1, into one momentum reading; readings at or above ${run.upperThreshold} are overbought and at or below ${run.lowerThreshold} oversold. ${run.overboughtCount} overbought and ${run.oversoldCount} oversold readings across ${run.samples.length} periods.`;
}

const ULTIMATE_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineUltimate = forwardRef<
  HTMLDivElement,
  ChartLineUltimateProps
>(function ChartLineUltimate(
  props: ChartLineUltimateProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    shortPeriod,
    mediumPeriod,
    longPeriod,
    upperThreshold,
    lowerThreshold,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_ULTIMATE_WIDTH,
    height = DEFAULT_CHART_LINE_ULTIMATE_HEIGHT,
    padding = DEFAULT_CHART_LINE_ULTIMATE_PADDING,
    gap = DEFAULT_CHART_LINE_ULTIMATE_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_ULTIMATE_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_ULTIMATE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ULTIMATE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ULTIMATE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ULTIMATE_PRICE_COLOR,
    uoColor = DEFAULT_CHART_LINE_ULTIMATE_UO_COLOR,
    overboughtColor = DEFAULT_CHART_LINE_ULTIMATE_OVERBOUGHT_COLOR,
    oversoldColor = DEFAULT_CHART_LINE_ULTIMATE_OVERSOLD_COLOR,
    gridColor = DEFAULT_CHART_LINE_ULTIMATE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ULTIMATE_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showUo = true,
    showZones = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with an Ultimate Oscillator panel',
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
      computeLineUltimateLayout({
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        ...(isFiniteNumber(shortPeriod) ? { shortPeriod } : {}),
        ...(isFiniteNumber(mediumPeriod) ? { mediumPeriod } : {}),
        ...(isFiniteNumber(longPeriod) ? { longPeriod } : {}),
        ...(isFiniteNumber(upperThreshold) ? { upperThreshold } : {}),
        ...(isFiniteNumber(lowerThreshold) ? { lowerThreshold } : {}),
      }),
    [
      data,
      width,
      height,
      padding,
      gap,
      pricePanelRatio,
      tickCount,
      shortPeriod,
      mediumPeriod,
      longPeriod,
      upperThreshold,
      lowerThreshold,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineUltimateChart(data, {
        ...(isFiniteNumber(shortPeriod) ? { shortPeriod } : {}),
        ...(isFiniteNumber(mediumPeriod) ? { mediumPeriod } : {}),
        ...(isFiniteNumber(longPeriod) ? { longPeriod } : {}),
        ...(isFiniteNumber(upperThreshold) ? { upperThreshold } : {}),
        ...(isFiniteNumber(lowerThreshold) ? { lowerThreshold } : {}),
      }),
    [
      ariaDescription,
      data,
      shortPeriod,
      mediumPeriod,
      longPeriod,
      upperThreshold,
      lowerThreshold,
    ],
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

  const zoneColor = useCallback(
    (z: ChartLineUltimateZone): string =>
      z === 'overbought'
        ? overboughtColor
        : z === 'oversold'
          ? oversoldColor
          : uoColor,
    [overboughtColor, oversoldColor, uoColor],
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
        data-section="chart-line-ultimate"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-ultimate-aria-desc"
          style={ULTIMATE_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const up = layout.uoPanel;
  const priceVisible = !hiddenSet.has('price');
  const uoVisible = showUo && !hiddenSet.has('uo');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'uo', label: 'Ultimate', color: uoColor },
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
      data-section="chart-line-ultimate"
      data-empty="false"
      data-short-period={layout.shortPeriod}
      data-medium-period={layout.mediumPeriod}
      data-long-period={layout.longPeriod}
      data-upper-threshold={layout.upperThreshold}
      data-lower-threshold={layout.lowerThreshold}
      data-uo-final={layout.uoFinal}
      data-overbought-count={layout.overboughtCount}
      data-oversold-count={layout.oversoldCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-ultimate-aria-desc"
        style={ULTIMATE_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-ultimate-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-ultimate-badge"
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
              data-section="chart-line-ultimate-badge-icon"
              aria-hidden="true"
              style={{ color: uoColor }}
            >
              ULT
            </span>
            <span data-section="chart-line-ultimate-badge-periods">
              {layout.shortPeriod}/{layout.mediumPeriod}/{layout.longPeriod}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-ultimate-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-ultimate-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`pgy-${i}`}
                  data-section="chart-line-ultimate-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.uoYTicks.map((t, i) => (
                <line
                  key={`ugy-${i}`}
                  data-section="chart-line-ultimate-grid-line"
                  data-panel="uo"
                  x1={up.x}
                  x2={up.x + up.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showZones ? (
            <g data-section="chart-line-ultimate-zones">
              <rect
                data-section="chart-line-ultimate-overbought-zone"
                x={layout.overboughtRect.x}
                y={layout.overboughtRect.y}
                width={layout.overboughtRect.width}
                height={layout.overboughtRect.height}
                fill={overboughtColor}
                fillOpacity={0.12}
              />
              <rect
                data-section="chart-line-ultimate-oversold-zone"
                x={layout.oversoldRect.x}
                y={layout.oversoldRect.y}
                width={layout.oversoldRect.width}
                height={layout.oversoldRect.height}
                fill={oversoldColor}
                fillOpacity={0.12}
              />
              <line
                data-section="chart-line-ultimate-threshold-line"
                data-kind="upper"
                x1={up.x}
                x2={up.x + up.width}
                y1={layout.upperY}
                y2={layout.upperY}
                stroke={overboughtColor}
                strokeWidth={1}
                strokeDasharray="5 3"
              />
              <line
                data-section="chart-line-ultimate-threshold-line"
                data-kind="lower"
                x1={up.x}
                x2={up.x + up.width}
                y1={layout.lowerY}
                y2={layout.lowerY}
                stroke={oversoldColor}
                strokeWidth={1}
                strokeDasharray="5 3"
              />
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-ultimate-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              {[
                { panel: pp, name: 'price', yt: layout.priceYTicks },
                { panel: up, name: 'uo', yt: layout.uoYTicks },
              ].map((cfg) => (
                <g
                  key={`axis-${cfg.name}`}
                  data-section="chart-line-ultimate-axis-group"
                  data-panel={cfg.name}
                >
                  <line
                    data-section="chart-line-ultimate-axis"
                    data-panel={cfg.name}
                    data-axis="x"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y + cfg.panel.height}
                    x2={cfg.panel.x + cfg.panel.width}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  <line
                    data-section="chart-line-ultimate-axis"
                    data-panel={cfg.name}
                    data-axis="y"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y}
                    x2={cfg.panel.x}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  {cfg.yt.map((t, i) => (
                    <g
                      key={`yt-${cfg.name}-${i}`}
                      data-section="chart-line-ultimate-tick"
                      data-panel={cfg.name}
                      data-axis="y"
                    >
                      <line
                        x1={cfg.panel.x - 4}
                        x2={cfg.panel.x}
                        y1={t.py}
                        y2={t.py}
                      />
                      <text
                        data-section="chart-line-ultimate-tick-label"
                        data-panel={cfg.name}
                        data-axis="y"
                        x={cfg.panel.x - 6}
                        y={t.py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatValue(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              ))}
              <g data-section="chart-line-ultimate-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`tx-${i}`}
                    data-section="chart-line-ultimate-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={up.y + up.height}
                      y2={up.y + up.height + 4}
                    />
                    <text
                      data-section="chart-line-ultimate-tick-label"
                      data-axis="x"
                      x={t.px}
                      y={up.y + up.height + 14}
                      textAnchor="middle"
                      fontSize={10}
                      fill={axisColor}
                      stroke="none"
                    >
                      {formatX(t.value)}
                    </text>
                  </g>
                ))}
              </g>
            </g>
          ) : null}

          <g data-section="chart-line-ultimate-panel-labels">
            <text
              data-section="chart-line-ultimate-panel-label"
              data-panel="price"
              x={pp.x + pp.width / 2}
              y={pp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Price
            </text>
            <text
              data-section="chart-line-ultimate-panel-label"
              data-panel="uo"
              x={up.x + up.width / 2}
              y={up.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Ultimate Oscillator
            </text>
          </g>

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-ultimate-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-ultimate-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                    data-section="chart-line-ultimate-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-value={d.close}
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

          {uoVisible && layout.uoPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Ultimate Oscillator line"
              data-section="chart-line-ultimate-uo-line"
              d={layout.uoPath}
              fill="none"
              stroke={uoColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {uoVisible ? (
            <g data-section="chart-line-ultimate-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Ultimate Oscillator at x ${formatX(m.x)}: ${formatValue(m.uo)} (${m.zone})`}
                    data-section="chart-line-ultimate-marker"
                    data-point-index={m.index}
                    data-uo={m.uo}
                    data-zone={m.zone}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={zoneColor(m.zone)}
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
                  data-section="chart-line-ultimate-tooltip"
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
                  <div data-section="chart-line-ultimate-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div data-section="chart-line-ultimate-tooltip-high">
                    high: {formatValue(d.high)}
                  </div>
                  <div data-section="chart-line-ultimate-tooltip-low">
                    low: {formatValue(d.low)}
                  </div>
                  <div
                    data-section="chart-line-ultimate-tooltip-close"
                    style={{ fontWeight: 600 }}
                  >
                    close: {formatValue(d.close)}
                  </div>
                  <div data-section="chart-line-ultimate-tooltip-uo">
                    uo: {d.uo === null ? 'n/a' : formatValue(d.uo)}
                  </div>
                  <div data-section="chart-line-ultimate-tooltip-zone">
                    zone: {d.zone}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-ultimate-legend"
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
                data-section="chart-line-ultimate-legend-item"
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
                  data-section="chart-line-ultimate-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-ultimate-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-ultimate-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.overboughtCount} overbought, {layout.oversoldCount}{' '}
            oversold
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineUltimate.displayName = 'ChartLineUltimate';
