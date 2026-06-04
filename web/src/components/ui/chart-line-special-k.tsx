import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_SPECIAL_K_WIDTH = 560;
export const DEFAULT_CHART_LINE_SPECIAL_K_HEIGHT = 360;
export const DEFAULT_CHART_LINE_SPECIAL_K_PADDING = 40;
export const DEFAULT_CHART_LINE_SPECIAL_K_GAP = 12;
export const DEFAULT_CHART_LINE_SPECIAL_K_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SPECIAL_K_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SPECIAL_K_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SPECIAL_K_SIGNAL = 100;
export const DEFAULT_CHART_LINE_SPECIAL_K_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_SPECIAL_K_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_SPECIAL_K_SPECIAL_K_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_SPECIAL_K_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_SPECIAL_K_BULL_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SPECIAL_K_BEAR_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SPECIAL_K_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SPECIAL_K_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SPECIAL_K_AXIS_COLOR = '#cbd5e1';

export interface ChartLineSpecialKComponent {
  roc: number;
  sma: number;
  weight: number;
}

/**
 * Martin Pring's canonical daily Special K component table --
 * twelve weighted, smoothed rate-of-change terms spanning
 * lookbacks from 10 to 530 bars.
 */
export const DEFAULT_CHART_LINE_SPECIAL_K_COMPONENTS: ChartLineSpecialKComponent[] =
  [
    { roc: 10, sma: 10, weight: 1 },
    { roc: 15, sma: 10, weight: 2 },
    { roc: 20, sma: 10, weight: 3 },
    { roc: 30, sma: 15, weight: 4 },
    { roc: 50, sma: 50, weight: 1 },
    { roc: 65, sma: 65, weight: 2 },
    { roc: 75, sma: 75, weight: 3 },
    { roc: 100, sma: 100, weight: 4 },
    { roc: 195, sma: 130, weight: 1 },
    { roc: 265, sma: 130, weight: 2 },
    { roc: 390, sma: 130, weight: 3 },
    { roc: 530, sma: 195, weight: 4 },
  ];

export type ChartLineSpecialKZone = 'bull' | 'bear' | 'flat' | 'none';

export interface ChartLineSpecialKPoint {
  x: number;
  value: number;
}

export interface ChartLineSpecialKSample {
  index: number;
  x: number;
  value: number;
  specialK: number | null;
  signal: number | null;
  zone: ChartLineSpecialKZone;
}

export interface ChartLineSpecialKRun {
  series: ChartLineSpecialKPoint[];
  components: ChartLineSpecialKComponent[];
  signalPeriod: number;
  specialK: (number | null)[];
  signal: (number | null)[];
  samples: ChartLineSpecialKSample[];
  specialKFinal: number;
  signalFinal: number;
  bullCount: number;
  bearCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineSpecialKPriceDot {
  index: number;
  x: number;
  value: number;
  specialK: number | null;
  signal: number | null;
  zone: ChartLineSpecialKZone;
  px: number;
  py: number;
}

export interface ChartLineSpecialKMarker {
  index: number;
  x: number;
  specialK: number;
  zone: ChartLineSpecialKZone;
  px: number;
  py: number;
}

export interface ChartLineSpecialKPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineSpecialKLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineSpecialKPanel;
  specialKPanel: ChartLineSpecialKPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  specialKYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  specialKYMin: number;
  specialKYMax: number;
  pricePath: string;
  priceDots: ChartLineSpecialKPriceDot[];
  specialKPath: string;
  signalPath: string;
  markers: ChartLineSpecialKMarker[];
  zeroY: number;
  componentCount: number;
  signalPeriod: number;
  specialKFinal: number;
  signalFinal: number;
  bullCount: number;
  bearCount: number;
  flatCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineSpecialKLayoutOptions {
  data: readonly ChartLineSpecialKPoint[];
  components?: readonly ChartLineSpecialKComponent[];
  signalPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineSpecialKProps {
  data: readonly ChartLineSpecialKPoint[];
  components?: readonly ChartLineSpecialKComponent[];
  signalPeriod?: number;
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
  specialKColor?: string;
  signalColor?: string;
  bullColor?: string;
  bearColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSignal?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineSpecialKPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function getLineSpecialKFinitePoints(
  points: readonly ChartLineSpecialKPoint[] | null | undefined,
): ChartLineSpecialKPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineSpecialKPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Validate a Special K component table. Each entry needs a
 * rate-of-change lookback and a smoothing length of at least 1
 * (fractional values floor) and a finite weight. Invalid entries
 * are dropped; an empty or non-array input -- or a table that
 * loses every entry -- falls back to `fallback`.
 */
export function normalizeLineSpecialKComponents(
  components: readonly ChartLineSpecialKComponent[] | null | undefined,
  fallback: readonly ChartLineSpecialKComponent[],
): ChartLineSpecialKComponent[] {
  if (!Array.isArray(components) || components.length === 0) {
    return fallback.map((c) => ({ ...c }));
  }
  const out: ChartLineSpecialKComponent[] = [];
  for (const c of components) {
    if (!c) continue;
    if (!isFiniteNumber(c.roc) || !isFiniteNumber(c.sma)) continue;
    if (!isFiniteNumber(c.weight)) continue;
    const roc = Math.floor(c.roc);
    const sma = Math.floor(c.sma);
    if (roc < 1 || sma < 1) continue;
    out.push({ roc, sma, weight: c.weight });
  }
  return out.length > 0 ? out : fallback.map((c) => ({ ...c }));
}

/**
 * Coerce a Special K signal smoothing length to a positive
 * integer. A non-finite or sub-1 value falls back to `fallback`.
 */
export function normalizeLineSpecialKSignal(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The percentage rate of change `100 * (close[i] - close[i-p]) /
 * close[i-p]` over a lookback of `period`. Bars before the
 * lookback is reachable, and any bar whose base close is zero,
 * are null.
 */
export function computeLineSpecialKRoc(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = isFiniteNumber(period) ? Math.floor(period) : 0;
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (p < 1) return out;
  for (let i = p; i < n; i += 1) {
    const cur = closes[i];
    const base = closes[i - p];
    if (!isFiniteNumber(cur) || !isFiniteNumber(base) || base === 0) continue;
    out[i] = (100 * (cur - base)) / base;
  }
  return out;
}

function rollingMean(
  values: readonly (number | null)[],
  window: number,
): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const w = window < 1 ? 1 : Math.floor(window);
  for (let i = w - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = i - w + 1; k <= i; k += 1) {
      const v = values[k];
      if (v === null || v === undefined) {
        valid = false;
        break;
      }
      sum += v;
    }
    if (valid) out[i] = sum / w;
  }
  return out;
}

/**
 * One Special K term -- the simple moving average over `smaPeriod`
 * of the rate of change over `rocPeriod`. The weight is applied
 * later by `computeLineSpecialK`. Bars before both windows are
 * full are null.
 */
export function computeLineSpecialKComponent(
  closes: readonly number[] | null | undefined,
  rocPeriod: number,
  smaPeriod: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const roc = computeLineSpecialKRoc(closes, rocPeriod);
  const s = isFiniteNumber(smaPeriod) ? Math.floor(smaPeriod) : 0;
  if (s < 1) return new Array(closes.length).fill(null);
  return rollingMean(roc, s);
}

/**
 * Pring's Special K -- the weighted sum of every smoothed
 * rate-of-change component. A bar is defined only once every
 * component has cleared its warm-up.
 */
export function computeLineSpecialK(
  closes: readonly number[] | null | undefined,
  components: readonly ChartLineSpecialKComponent[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const comps = normalizeLineSpecialKComponents(
    components,
    DEFAULT_CHART_LINE_SPECIAL_K_COMPONENTS,
  );
  const n = closes.length;
  const series = comps.map((c) =>
    computeLineSpecialKComponent(closes, c.roc, c.sma),
  );
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let c = 0; c < comps.length; c += 1) {
      const v = series[c]![i];
      if (v === null || v === undefined) {
        valid = false;
        break;
      }
      sum += comps[c]!.weight * v;
    }
    if (valid) out[i] = sum;
  }
  return out;
}

/**
 * The Special K signal line -- the simple moving average of the
 * Special K over `signalPeriod` bars.
 */
export function computeLineSpecialKSignal(
  closes: readonly number[] | null | undefined,
  components: readonly ChartLineSpecialKComponent[] | null | undefined,
  signalPeriod: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const sk = computeLineSpecialK(closes, components);
  const s = normalizeLineSpecialKSignal(
    signalPeriod,
    DEFAULT_CHART_LINE_SPECIAL_K_SIGNAL,
  );
  return rollingMean(sk, s);
}

function classifyZone(
  specialK: number | null,
  signal: number | null,
): ChartLineSpecialKZone {
  if (specialK === null || signal === null) return 'none';
  if (specialK > signal) return 'bull';
  if (specialK < signal) return 'bear';
  return 'flat';
}

export function runLineSpecialK(
  points: readonly ChartLineSpecialKPoint[] | null | undefined,
  options?: {
    components?: readonly ChartLineSpecialKComponent[];
    signalPeriod?: number;
  },
): ChartLineSpecialKRun {
  const finite = getLineSpecialKFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const components = normalizeLineSpecialKComponents(
    options?.components,
    DEFAULT_CHART_LINE_SPECIAL_K_COMPONENTS,
  );
  const signalPeriod = normalizeLineSpecialKSignal(
    options?.signalPeriod ?? DEFAULT_CHART_LINE_SPECIAL_K_SIGNAL,
    DEFAULT_CHART_LINE_SPECIAL_K_SIGNAL,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      components,
      signalPeriod,
      specialK: [],
      signal: [],
      samples: [],
      specialKFinal: NaN,
      signalFinal: NaN,
      bullCount: 0,
      bearCount: 0,
      flatCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const specialK = computeLineSpecialK(closes, components);
  const signal = computeLineSpecialKSignal(closes, components, signalPeriod);

  const samples: ChartLineSpecialKSample[] = series.map((p, i) => {
    const sk = specialK[i] ?? null;
    const sg = signal[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      specialK: sk,
      signal: sg,
      zone: classifyZone(sk, sg),
    };
  });

  let bullCount = 0;
  let bearCount = 0;
  let flatCount = 0;
  let specialKFinal = NaN;
  let signalFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'bull') bullCount += 1;
    else if (s.zone === 'bear') bearCount += 1;
    else if (s.zone === 'flat') flatCount += 1;
    if (s.specialK !== null) specialKFinal = s.specialK;
    if (s.signal !== null) signalFinal = s.signal;
  }

  return {
    series,
    components,
    signalPeriod,
    specialK,
    signal,
    samples,
    specialKFinal,
    signalFinal,
    bullCount,
    bearCount,
    flatCount,
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

export function computeLineSpecialKLayout(
  options: ComputeLineSpecialKLayoutOptions,
): ChartLineSpecialKLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_SPECIAL_K_GAP,
    tickCount = DEFAULT_CHART_LINE_SPECIAL_K_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_SPECIAL_K_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineSpecialK(data, {
    ...(options.components ? { components: options.components } : {}),
    ...(isFiniteNumber(options.signalPeriod)
      ? { signalPeriod: options.signalPeriod }
      : {}),
  });

  const emptyPanel: ChartLineSpecialKPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineSpecialKLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    specialKPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    specialKYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    specialKYMin: 0,
    specialKYMax: 0,
    pricePath: '',
    priceDots: [],
    specialKPath: '',
    signalPath: '',
    markers: [],
    zeroY: 0,
    componentCount: run.components.length,
    signalPeriod: run.signalPeriod,
    specialKFinal: NaN,
    signalFinal: NaN,
    bullCount: 0,
    bearCount: 0,
    flatCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const skHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineSpecialKPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const specialKPanel: ChartLineSpecialKPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: skHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  let skLo = 0;
  let skHi = 0;
  let hasSk = false;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < priceLo) priceLo = s.value;
    if (s.value > priceHi) priceHi = s.value;
    if (s.specialK !== null) {
      hasSk = true;
      if (s.specialK < skLo) skLo = s.specialK;
      if (s.specialK > skHi) skHi = s.specialK;
    }
    if (s.signal !== null) {
      hasSk = true;
      if (s.signal < skLo) skLo = s.signal;
      if (s.signal > skHi) skHi = s.signal;
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
  if (!hasSk) {
    skLo = -1;
    skHi = 1;
  } else if (skLo === skHi) {
    skLo -= 1;
    skHi += 1;
  }

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const skRange = skHi - skLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectSkY = (v: number): number =>
    specialKPanel.y +
    specialKPanel.height -
    ((v - skLo) / skRange) * specialKPanel.height;

  const priceDots: ChartLineSpecialKPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    specialK: s.specialK,
    signal: s.signal,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const skPts: { px: number; py: number }[] = [];
  const signalPts: { px: number; py: number }[] = [];
  const markers: ChartLineSpecialKMarker[] = [];
  for (const s of run.samples) {
    if (s.specialK !== null) {
      const px = projectX(s.x);
      const py = projectSkY(s.specialK);
      skPts.push({ px, py });
      if (s.zone !== 'none') {
        markers.push({
          index: s.index,
          x: s.x,
          specialK: s.specialK,
          zone: s.zone,
          px,
          py,
        });
      }
    }
    if (s.signal !== null) {
      signalPts.push({ px: projectX(s.x), py: projectSkY(s.signal) });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    specialKPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    specialKYTicks: computeTicks(skLo, skHi, tickCount).map((v) => ({
      value: v,
      py: projectSkY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    specialKYMin: skLo,
    specialKYMax: skHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    specialKPath: buildPath(skPts),
    signalPath: buildPath(signalPts),
    markers,
    zeroY: projectSkY(0),
    componentCount: run.components.length,
    signalPeriod: run.signalPeriod,
    specialKFinal: run.specialKFinal,
    signalFinal: run.signalFinal,
    bullCount: run.bullCount,
    bearCount: run.bearCount,
    flatCount: run.flatCount,
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

export function describeLineSpecialKChart(
  data: readonly ChartLineSpecialKPoint[] | null | undefined,
  options?: {
    components?: readonly ChartLineSpecialKComponent[];
    signalPeriod?: number;
  },
): string {
  const run = runLineSpecialK(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with Pring's Special K (${run.components.length} components): the top panel plots the price; the bottom panel plots the Special K. The Special K sums many weighted and smoothed rate-of-change components measured across lookbacks from the shortest to the longest, rolling short, intermediate and long-term momentum into a single line. A signal line smooths the Special K -- a Special K above its signal line marks bullish momentum, below it bearish. The Special K is bullish on ${run.bullCount} bars, bearish on ${run.bearCount} and flat on ${run.flatCount} across ${run.samples.length} bars.`;
}

const SPECIAL_K_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineSpecialK = forwardRef<
  HTMLDivElement,
  ChartLineSpecialKProps
>(function ChartLineSpecialK(
  props: ChartLineSpecialKProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    components,
    signalPeriod,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_SPECIAL_K_WIDTH,
    height = DEFAULT_CHART_LINE_SPECIAL_K_HEIGHT,
    padding = DEFAULT_CHART_LINE_SPECIAL_K_PADDING,
    gap = DEFAULT_CHART_LINE_SPECIAL_K_GAP,
    tickCount = DEFAULT_CHART_LINE_SPECIAL_K_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_SPECIAL_K_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_SPECIAL_K_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SPECIAL_K_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SPECIAL_K_PRICE_COLOR,
    specialKColor = DEFAULT_CHART_LINE_SPECIAL_K_SPECIAL_K_COLOR,
    signalColor = DEFAULT_CHART_LINE_SPECIAL_K_SIGNAL_COLOR,
    bullColor = DEFAULT_CHART_LINE_SPECIAL_K_BULL_COLOR,
    bearColor = DEFAULT_CHART_LINE_SPECIAL_K_BEAR_COLOR,
    zeroColor = DEFAULT_CHART_LINE_SPECIAL_K_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_SPECIAL_K_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_SPECIAL_K_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSignal = true,
    showZeroLine = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = "Two-panel chart with Pring's Special K",
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
      computeLineSpecialKLayout({
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        ...(components ? { components } : {}),
        ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
      }),
    [
      data,
      width,
      height,
      padding,
      gap,
      tickCount,
      pricePanelRatio,
      components,
      signalPeriod,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineSpecialKChart(data, {
        ...(components ? { components } : {}),
        ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
      }),
    [ariaDescription, data, components, signalPeriod],
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
        data-section="chart-line-special-k"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-special-k-aria-desc"
          style={SPECIAL_K_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const sp = layout.specialKPanel;
  const priceVisible = !hiddenSet.has('price');
  const specialKVisible = !hiddenSet.has('special-k');
  const signalVisible = showSignal && !hiddenSet.has('signal');

  const fmtNullable = (v: number | null): string =>
    v === null ? 'n/a' : formatValue(v);

  const zoneColor = (zone: ChartLineSpecialKZone): string => {
    if (zone === 'bull') return bullColor;
    if (zone === 'bear') return bearColor;
    return specialKColor;
  };

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'special-k', label: 'Special K', color: specialKColor },
    { id: 'signal', label: 'Signal', color: signalColor },
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
      data-section="chart-line-special-k"
      data-empty="false"
      data-component-count={layout.componentCount}
      data-signal-period={layout.signalPeriod}
      data-special-k-final={layout.specialKFinal}
      data-signal-final={layout.signalFinal}
      data-bull-count={layout.bullCount}
      data-bear-count={layout.bearCount}
      data-flat-count={layout.flatCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-special-k-aria-desc"
        style={SPECIAL_K_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-special-k-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-special-k-badge"
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
              data-section="chart-line-special-k-badge-icon"
              aria-hidden="true"
              style={{ color: specialKColor }}
            >
              SK
            </span>
            <span data-section="chart-line-special-k-badge-config">
              {layout.componentCount}c
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-special-k-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-special-k-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`gp-${i}`}
                  data-section="chart-line-special-k-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.specialKYTicks.map((t, i) => (
                <line
                  key={`gk-${i}`}
                  data-section="chart-line-special-k-grid-line"
                  data-panel="special-k"
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
              data-section="chart-line-special-k-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-special-k-axis"
                data-panel="price"
                data-axis="y"
                x1={pp.x}
                y1={pp.y}
                x2={pp.x}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-special-k-axis"
                data-panel="price"
                data-axis="x"
                x1={pp.x}
                y1={pp.y + pp.height}
                x2={pp.x + pp.width}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-special-k-axis"
                data-panel="special-k"
                data-axis="y"
                x1={sp.x}
                y1={sp.y}
                x2={sp.x}
                y2={sp.y + sp.height}
              />
              <line
                data-section="chart-line-special-k-axis"
                data-panel="special-k"
                data-axis="x"
                x1={sp.x}
                y1={sp.y + sp.height}
                x2={sp.x + sp.width}
                y2={sp.y + sp.height}
              />
              {layout.priceYTicks.map((t, i) => (
                <text
                  key={`pyt-${i}`}
                  data-section="chart-line-special-k-tick-label"
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
              {layout.specialKYTicks.map((t, i) => (
                <text
                  key={`kyt-${i}`}
                  data-section="chart-line-special-k-tick-label"
                  data-panel="special-k"
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
                  data-section="chart-line-special-k-tick-label"
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
            data-section="chart-line-special-k-panel-label"
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
            data-section="chart-line-special-k-panel-label"
            data-panel="special-k"
            x={sp.x + 2}
            y={sp.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            Special K
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-special-k-zero-line"
              x1={sp.x}
              x2={sp.x + sp.width}
              y1={layout.zeroY}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-special-k-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-special-k-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-special-k-dot"
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

          {signalVisible && layout.signalPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Special K signal line"
              data-section="chart-line-special-k-signal-line"
              d={layout.signalPath}
              fill="none"
              stroke={signalColor}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {specialKVisible && layout.specialKPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Special K line"
              data-section="chart-line-special-k-special-k-line"
              d={layout.specialKPath}
              fill="none"
              stroke={specialKColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {specialKVisible && showMarkers ? (
            <g data-section="chart-line-special-k-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Special K at x ${formatX(m.x)}: ${formatValue(m.specialK)}, ${m.zone}`}
                    data-section="chart-line-special-k-marker"
                    data-point-index={m.index}
                    data-special-k={m.specialK}
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
                  data-section="chart-line-special-k-tooltip"
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
                  <div data-section="chart-line-special-k-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-special-k-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-special-k-tooltip-sk">
                    special k: {fmtNullable(d.specialK)}
                  </div>
                  <div data-section="chart-line-special-k-tooltip-signal">
                    signal: {fmtNullable(d.signal)}
                  </div>
                  <div data-section="chart-line-special-k-tooltip-zone">
                    zone: {d.zone}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-special-k-legend"
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
                data-section="chart-line-special-k-legend-item"
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
                  data-section="chart-line-special-k-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-special-k-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-special-k-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.bullCount} bull, {layout.bearCount} bear,{' '}
            {layout.flatCount} flat
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineSpecialK.displayName = 'ChartLineSpecialK';
