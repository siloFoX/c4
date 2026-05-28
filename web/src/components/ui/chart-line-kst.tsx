import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_KST_WIDTH = 560;
export const DEFAULT_CHART_LINE_KST_HEIGHT = 360;
export const DEFAULT_CHART_LINE_KST_PADDING = 40;
export const DEFAULT_CHART_LINE_KST_GAP = 26;
export const DEFAULT_CHART_LINE_KST_PRICE_PANEL_RATIO = 0.54;
export const DEFAULT_CHART_LINE_KST_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KST_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KST_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KST_ROC1_PERIOD = 10;
export const DEFAULT_CHART_LINE_KST_ROC2_PERIOD = 15;
export const DEFAULT_CHART_LINE_KST_ROC3_PERIOD = 20;
export const DEFAULT_CHART_LINE_KST_ROC4_PERIOD = 30;
export const DEFAULT_CHART_LINE_KST_SMA1_PERIOD = 10;
export const DEFAULT_CHART_LINE_KST_SMA2_PERIOD = 10;
export const DEFAULT_CHART_LINE_KST_SMA3_PERIOD = 10;
export const DEFAULT_CHART_LINE_KST_SMA4_PERIOD = 15;
export const DEFAULT_CHART_LINE_KST_SIGNAL_PERIOD = 9;
export const DEFAULT_CHART_LINE_KST_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_KST_KST_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_KST_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_KST_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_KST_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_KST_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_KST_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_KST_AXIS_COLOR = '#cbd5e1';

/** The four rate-of-change legs are summed at fixed ascending weights. */
const KST_WEIGHTS = [1, 2, 3, 4] as const;

export type ChartLineKstSign = 'positive' | 'negative' | 'zero';

export interface ChartLineKstPoint {
  x: number;
  value: number;
}

export interface LineKstConfig {
  roc1Period: number;
  roc2Period: number;
  roc3Period: number;
  roc4Period: number;
  sma1Period: number;
  sma2Period: number;
  sma3Period: number;
  sma4Period: number;
  signalPeriod: number;
}

export interface ChartLineKstSample {
  index: number;
  x: number;
  value: number;
  kst: number | null;
  signal: number | null;
  sign: ChartLineKstSign;
}

export interface ChartLineKstRun {
  series: ChartLineKstPoint[];
  config: LineKstConfig;
  rcma1: (number | null)[];
  rcma2: (number | null)[];
  rcma3: (number | null)[];
  rcma4: (number | null)[];
  kst: (number | null)[];
  signal: (number | null)[];
  samples: ChartLineKstSample[];
  kstFinal: number;
  signalFinal: number;
  kstMin: number;
  kstMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineKstPriceDot {
  index: number;
  x: number;
  value: number;
  kst: number | null;
  signal: number | null;
  sign: ChartLineKstSign;
  px: number;
  py: number;
}

export interface ChartLineKstMarker {
  index: number;
  x: number;
  kst: number;
  sign: ChartLineKstSign;
  px: number;
  py: number;
}

export interface ChartLineKstPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineKstLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineKstPanel;
  kstPanel: ChartLineKstPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  kstYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  kstYBound: number;
  pricePath: string;
  priceDots: ChartLineKstPriceDot[];
  kstPath: string;
  signalPath: string;
  markers: ChartLineKstMarker[];
  zeroY: number;
  config: LineKstConfig;
  kstFinal: number;
  signalFinal: number;
  kstMin: number;
  kstMax: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface LineKstOptions {
  roc1Period?: number;
  roc2Period?: number;
  roc3Period?: number;
  roc4Period?: number;
  sma1Period?: number;
  sma2Period?: number;
  sma3Period?: number;
  sma4Period?: number;
  signalPeriod?: number;
}

export interface ComputeLineKstLayoutOptions extends LineKstOptions {
  data: readonly ChartLineKstPoint[];
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineKstProps extends LineKstOptions {
  data: readonly ChartLineKstPoint[];
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
  kstColor?: string;
  signalColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showKst?: boolean;
  showSignal?: boolean;
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
  onPointClick?: (payload: { point: ChartLineKstPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineKstFinitePoints(
  points: readonly ChartLineKstPoint[] | null | undefined,
): ChartLineKstPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineKstPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineKstPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The percentage rate of change over `period` bars:
 * `100 * (value[i] - value[i-period]) / value[i-period]`. Indices
 * before the lookback read null; a zero base reads zero.
 */
export function computeLineKstRoc(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p; i < n; i += 1) {
    const base = values[i - p]!;
    const raw = base === 0 ? 0 : (100 * (values[i]! - base)) / base;
    out[i] = raw === 0 ? 0 : raw;
  }
  return out;
}

/**
 * A simple moving average over `period` values, tolerating leading
 * `null` placeholders. Each index whose window of `period` values is
 * fully defined reads their mean; the rest read null.
 */
export function computeLineKstSma(
  src: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const v = src[i - k];
      if (v === null || v === undefined) {
        valid = false;
        break;
      }
      sum += v;
    }
    if (valid) {
      const mean = sum / p;
      out[i] = mean === 0 ? 0 : mean;
    }
  }
  return out;
}

/**
 * Martin Pring's Know Sure Thing. Four rate-of-change series of
 * increasing lookback are each smoothed by a simple moving average
 * (giving the RCMA legs), then summed at the fixed ascending weights
 * 1/2/3/4 -- the slower, more reliable legs carry the most weight.
 * The signal line is a simple moving average of the KST.
 */
export function computeLineKst(
  values: readonly number[] | null | undefined,
  config: LineKstConfig,
): {
  rcma1: (number | null)[];
  rcma2: (number | null)[];
  rcma3: (number | null)[];
  rcma4: (number | null)[];
  kst: (number | null)[];
  signal: (number | null)[];
} {
  if (!Array.isArray(values)) {
    return {
      rcma1: [],
      rcma2: [],
      rcma3: [],
      rcma4: [],
      kst: [],
      signal: [],
    };
  }
  const n = values.length;
  const rcma1 = computeLineKstSma(
    computeLineKstRoc(values, config.roc1Period),
    config.sma1Period,
  );
  const rcma2 = computeLineKstSma(
    computeLineKstRoc(values, config.roc2Period),
    config.sma2Period,
  );
  const rcma3 = computeLineKstSma(
    computeLineKstRoc(values, config.roc3Period),
    config.sma3Period,
  );
  const rcma4 = computeLineKstSma(
    computeLineKstRoc(values, config.roc4Period),
    config.sma4Period,
  );
  const kst: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const a = rcma1[i];
    const b = rcma2[i];
    const c = rcma3[i];
    const d = rcma4[i];
    if (
      a !== null &&
      a !== undefined &&
      b !== null &&
      b !== undefined &&
      c !== null &&
      c !== undefined &&
      d !== null &&
      d !== undefined
    ) {
      const raw =
        a * KST_WEIGHTS[0] +
        b * KST_WEIGHTS[1] +
        c * KST_WEIGHTS[2] +
        d * KST_WEIGHTS[3];
      kst[i] = raw === 0 ? 0 : raw;
    }
  }
  const signal = computeLineKstSma(kst, config.signalPeriod);
  return { rcma1, rcma2, rcma3, rcma4, kst, signal };
}

function classifySign(v: number | null): ChartLineKstSign {
  if (v === null) return 'zero';
  if (v > 0) return 'positive';
  if (v < 0) return 'negative';
  return 'zero';
}

function resolveConfig(options?: LineKstOptions): LineKstConfig {
  return {
    roc1Period: normalizeLineKstPeriod(
      options?.roc1Period ?? DEFAULT_CHART_LINE_KST_ROC1_PERIOD,
      DEFAULT_CHART_LINE_KST_ROC1_PERIOD,
    ),
    roc2Period: normalizeLineKstPeriod(
      options?.roc2Period ?? DEFAULT_CHART_LINE_KST_ROC2_PERIOD,
      DEFAULT_CHART_LINE_KST_ROC2_PERIOD,
    ),
    roc3Period: normalizeLineKstPeriod(
      options?.roc3Period ?? DEFAULT_CHART_LINE_KST_ROC3_PERIOD,
      DEFAULT_CHART_LINE_KST_ROC3_PERIOD,
    ),
    roc4Period: normalizeLineKstPeriod(
      options?.roc4Period ?? DEFAULT_CHART_LINE_KST_ROC4_PERIOD,
      DEFAULT_CHART_LINE_KST_ROC4_PERIOD,
    ),
    sma1Period: normalizeLineKstPeriod(
      options?.sma1Period ?? DEFAULT_CHART_LINE_KST_SMA1_PERIOD,
      DEFAULT_CHART_LINE_KST_SMA1_PERIOD,
    ),
    sma2Period: normalizeLineKstPeriod(
      options?.sma2Period ?? DEFAULT_CHART_LINE_KST_SMA2_PERIOD,
      DEFAULT_CHART_LINE_KST_SMA2_PERIOD,
    ),
    sma3Period: normalizeLineKstPeriod(
      options?.sma3Period ?? DEFAULT_CHART_LINE_KST_SMA3_PERIOD,
      DEFAULT_CHART_LINE_KST_SMA3_PERIOD,
    ),
    sma4Period: normalizeLineKstPeriod(
      options?.sma4Period ?? DEFAULT_CHART_LINE_KST_SMA4_PERIOD,
      DEFAULT_CHART_LINE_KST_SMA4_PERIOD,
    ),
    signalPeriod: normalizeLineKstPeriod(
      options?.signalPeriod ?? DEFAULT_CHART_LINE_KST_SIGNAL_PERIOD,
      DEFAULT_CHART_LINE_KST_SIGNAL_PERIOD,
    ),
  };
}

export function runLineKst(
  points: readonly ChartLineKstPoint[] | null | undefined,
  options?: LineKstOptions,
): ChartLineKstRun {
  const finite = getLineKstFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const config = resolveConfig(options);
  const n = series.length;

  if (n < 2) {
    return {
      series,
      config,
      rcma1: [],
      rcma2: [],
      rcma3: [],
      rcma4: [],
      kst: [],
      signal: [],
      samples: [],
      kstFinal: NaN,
      signalFinal: NaN,
      kstMin: NaN,
      kstMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { rcma1, rcma2, rcma3, rcma4, kst, signal } = computeLineKst(
    values,
    config,
  );

  const samples: ChartLineKstSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    kst: kst[i] ?? null,
    signal: signal[i] ?? null,
    sign: classifySign(kst[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (arr[i] !== null && arr[i] !== undefined) return arr[i] as number;
    }
    return NaN;
  };

  let kstMin = NaN;
  let kstMax = NaN;
  let positiveCount = 0;
  let negativeCount = 0;
  for (const s of samples) {
    if (s.kst !== null) {
      if (Number.isNaN(kstMin) || s.kst < kstMin) kstMin = s.kst;
      if (Number.isNaN(kstMax) || s.kst > kstMax) kstMax = s.kst;
    }
    if (s.sign === 'positive') positiveCount += 1;
    if (s.sign === 'negative') negativeCount += 1;
  }

  return {
    series = [],
    config,
    rcma1,
    rcma2,
    rcma3,
    rcma4,
    kst,
    signal,
    samples,
    kstFinal: lastDefined(kst),
    signalFinal: lastDefined(signal),
    kstMin,
    kstMax,
    positiveCount,
    negativeCount,
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

function pickOptions(options: LineKstOptions): LineKstOptions {
  const o: LineKstOptions = {};
  if (isFiniteNumber(options.roc1Period)) o.roc1Period = options.roc1Period;
  if (isFiniteNumber(options.roc2Period)) o.roc2Period = options.roc2Period;
  if (isFiniteNumber(options.roc3Period)) o.roc3Period = options.roc3Period;
  if (isFiniteNumber(options.roc4Period)) o.roc4Period = options.roc4Period;
  if (isFiniteNumber(options.sma1Period)) o.sma1Period = options.sma1Period;
  if (isFiniteNumber(options.sma2Period)) o.sma2Period = options.sma2Period;
  if (isFiniteNumber(options.sma3Period)) o.sma3Period = options.sma3Period;
  if (isFiniteNumber(options.sma4Period)) o.sma4Period = options.sma4Period;
  if (isFiniteNumber(options.signalPeriod)) {
    o.signalPeriod = options.signalPeriod;
  }
  return o;
}

export function computeLineKstLayout(
  options: ComputeLineKstLayoutOptions,
): ChartLineKstLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_KST_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_KST_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_KST_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineKstPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineKst(data, pickOptions(options));
  const empty: ChartLineKstLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    kstPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    kstYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    kstYBound: 0,
    pricePath: '',
    priceDots: [],
    kstPath: '',
    signalPath: '',
    markers: [],
    zeroY: 0,
    config: run.config,
    kstFinal: NaN,
    signalFinal: NaN,
    kstMin: NaN,
    kstMax: NaN,
    positiveCount: 0,
    negativeCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const kstH = usableHeight - priceH;
  if (priceH <= 0 || kstH <= 0) return empty;

  const pricePanel: ChartLineKstPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const kstPanel: ChartLineKstPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: kstH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let bound = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < pyLo) pyLo = s.value;
    if (s.value > pyHi) pyHi = s.value;
    if (s.kst !== null && Math.abs(s.kst) > bound) bound = Math.abs(s.kst);
    if (s.signal !== null && Math.abs(s.signal) > bound) {
      bound = Math.abs(s.signal);
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }
  if (bound <= 0) bound = 1;

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectKstY = (v: number): number =>
    kstPanel.y +
    kstPanel.height -
    ((v + bound) / (2 * bound)) * kstPanel.height;

  const priceDots: ChartLineKstPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    kst: s.kst,
    signal: s.signal,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const kstPts: { px: number; py: number }[] = [];
  const signalPts: { px: number; py: number }[] = [];
  const markers: ChartLineKstMarker[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    if (s.kst !== null) {
      const py = projectKstY(s.kst);
      kstPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        kst: s.kst,
        sign: s.sign,
        px,
        py,
      });
    }
    if (s.signal !== null) {
      signalPts.push({ px, py: projectKstY(s.signal) });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    kstPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    kstYTicks: computeTicks(-bound, bound, tickCount).map((v) => ({
      value: v,
      py: projectKstY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    kstYBound: bound,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    kstPath: buildPath(kstPts),
    signalPath: buildPath(signalPts),
    markers,
    zeroY: projectKstY(0),
    config: run.config,
    kstFinal: run.kstFinal,
    signalFinal: run.signalFinal,
    kstMin: run.kstMin,
    kstMax: run.kstMax,
    positiveCount: run.positiveCount,
    negativeCount: run.negativeCount,
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

export function describeLineKstChart(
  data: readonly ChartLineKstPoint[] | null | undefined,
  options?: LineKstOptions,
): string {
  const run = runLineKst(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Know Sure Thing (KST) momentum panel: the KST sums four smoothed rate-of-change readings, each weighted by its speed, into one oscillator that swings around zero; the signal line is a simple moving average of the KST, and a cross of the two marks a momentum shift. ${run.positiveCount} readings above and ${run.negativeCount} below the zero line across ${run.samples.length} periods.`;
}

const KST_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineKst = forwardRef<HTMLDivElement, ChartLineKstProps>(
  function ChartLineKst(
    props: ChartLineKstProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      roc1Period,
      roc2Period,
      roc3Period,
      roc4Period,
      sma1Period,
      sma2Period,
      sma3Period,
      sma4Period,
      signalPeriod,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_KST_WIDTH,
      height = DEFAULT_CHART_LINE_KST_HEIGHT,
      padding = DEFAULT_CHART_LINE_KST_PADDING,
      gap = DEFAULT_CHART_LINE_KST_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_KST_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_KST_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_KST_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_KST_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_KST_PRICE_COLOR,
      kstColor = DEFAULT_CHART_LINE_KST_KST_COLOR,
      signalColor = DEFAULT_CHART_LINE_KST_SIGNAL_COLOR,
      positiveColor = DEFAULT_CHART_LINE_KST_POSITIVE_COLOR,
      negativeColor = DEFAULT_CHART_LINE_KST_NEGATIVE_COLOR,
      zeroColor = DEFAULT_CHART_LINE_KST_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_KST_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_KST_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showKst = true,
      showSignal = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Know Sure Thing momentum panel',
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

    const kstOptions = useMemo(
      () =>
        pickOptions({
          ...(isFiniteNumber(roc1Period) ? { roc1Period } : {}),
          ...(isFiniteNumber(roc2Period) ? { roc2Period } : {}),
          ...(isFiniteNumber(roc3Period) ? { roc3Period } : {}),
          ...(isFiniteNumber(roc4Period) ? { roc4Period } : {}),
          ...(isFiniteNumber(sma1Period) ? { sma1Period } : {}),
          ...(isFiniteNumber(sma2Period) ? { sma2Period } : {}),
          ...(isFiniteNumber(sma3Period) ? { sma3Period } : {}),
          ...(isFiniteNumber(sma4Period) ? { sma4Period } : {}),
          ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
        }),
      [
        roc1Period,
        roc2Period,
        roc3Period,
        roc4Period,
        sma1Period,
        sma2Period,
        sma3Period,
        sma4Period,
        signalPeriod,
      ],
    );

    const layout = useMemo(
      () =>
        computeLineKstLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
          ...kstOptions,
        }),
      [data, width, height, padding, gap, pricePanelRatio, tickCount, kstOptions],
    );

    const summary = useMemo(
      () => ariaDescription ?? describeLineKstChart(data, kstOptions),
      [ariaDescription, data, kstOptions],
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

    const signColor = useCallback(
      (s: ChartLineKstSign): string =>
        s === 'positive'
          ? positiveColor
          : s === 'negative'
            ? negativeColor
            : kstColor,
      [positiveColor, negativeColor, kstColor],
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
          data-section="chart-line-kst"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-kst-aria-desc"
            style={KST_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const kp = layout.kstPanel;
    const cfg = layout.config;
    const priceVisible = !hiddenSet.has('price');
    const kstVisible = showKst && !hiddenSet.has('kst');
    const signalVisible = showSignal && !hiddenSet.has('signal');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'kst', label: 'KST', color: kstColor },
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
        data-section="chart-line-kst"
        data-empty="false"
        data-roc1-period={cfg.roc1Period}
        data-roc2-period={cfg.roc2Period}
        data-roc3-period={cfg.roc3Period}
        data-roc4-period={cfg.roc4Period}
        data-signal-period={cfg.signalPeriod}
        data-kst-final={layout.kstFinal}
        data-positive-count={layout.positiveCount}
        data-negative-count={layout.negativeCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-kst-aria-desc"
          style={KST_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-kst-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-kst-badge"
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
                data-section="chart-line-kst-badge-icon"
                aria-hidden="true"
                style={{ color: kstColor }}
              >
                KST
              </span>
              <span data-section="chart-line-kst-badge-roc">
                {cfg.roc1Period}/{cfg.roc2Period}/{cfg.roc3Period}/
                {cfg.roc4Period}
              </span>
              <span data-section="chart-line-kst-badge-signal">
                s={cfg.signalPeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-kst-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-kst-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-kst-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.kstYTicks.map((t, i) => (
                  <line
                    key={`kgy-${i}`}
                    data-section="chart-line-kst-grid-line"
                    data-panel="kst"
                    x1={kp.x}
                    x2={kp.x + kp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showZeroLine ? (
              <line
                data-section="chart-line-kst-zero-line"
                x1={kp.x}
                x2={kp.x + kp.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-kst-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: kp, name: 'kst', yt: layout.kstYTicks },
                ].map((cfgEntry) => (
                  <g
                    key={`axis-${cfgEntry.name}`}
                    data-section="chart-line-kst-axis-group"
                    data-panel={cfgEntry.name}
                  >
                    <line
                      data-section="chart-line-kst-axis"
                      data-panel={cfgEntry.name}
                      data-axis="x"
                      x1={cfgEntry.panel.x}
                      y1={cfgEntry.panel.y + cfgEntry.panel.height}
                      x2={cfgEntry.panel.x + cfgEntry.panel.width}
                      y2={cfgEntry.panel.y + cfgEntry.panel.height}
                    />
                    <line
                      data-section="chart-line-kst-axis"
                      data-panel={cfgEntry.name}
                      data-axis="y"
                      x1={cfgEntry.panel.x}
                      y1={cfgEntry.panel.y}
                      x2={cfgEntry.panel.x}
                      y2={cfgEntry.panel.y + cfgEntry.panel.height}
                    />
                    {cfgEntry.yt.map((t, i) => (
                      <g
                        key={`yt-${cfgEntry.name}-${i}`}
                        data-section="chart-line-kst-tick"
                        data-panel={cfgEntry.name}
                        data-axis="y"
                      >
                        <line
                          x1={cfgEntry.panel.x - 4}
                          x2={cfgEntry.panel.x}
                          y1={t.py}
                          y2={t.py}
                        />
                        <text
                          data-section="chart-line-kst-tick-label"
                          data-panel={cfgEntry.name}
                          data-axis="y"
                          x={cfgEntry.panel.x - 6}
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
                <g data-section="chart-line-kst-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-kst-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={kp.y + kp.height}
                        y2={kp.y + kp.height + 4}
                      />
                      <text
                        data-section="chart-line-kst-tick-label"
                        data-axis="x"
                        x={t.px}
                        y={kp.y + kp.height + 14}
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

            <g data-section="chart-line-kst-panel-labels">
              <text
                data-section="chart-line-kst-panel-label"
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
                data-section="chart-line-kst-panel-label"
                data-panel="kst"
                x={kp.x + kp.width / 2}
                y={kp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                KST
              </text>
            </g>

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-kst-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-kst-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-kst-dot"
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
                data-section="chart-line-kst-signal-line"
                d={layout.signalPath}
                fill="none"
                stroke={signalColor}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {kstVisible && layout.kstPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="KST line"
                data-section="chart-line-kst-kst-line"
                d={layout.kstPath}
                fill="none"
                stroke={kstColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {kstVisible ? (
              <g data-section="chart-line-kst-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`KST at x ${formatX(m.x)}: ${formatValue(m.kst)} (${m.sign})`}
                      data-section="chart-line-kst-marker"
                      data-point-index={m.index}
                      data-kst={m.kst}
                      data-sign={m.sign}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={signColor(m.sign)}
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
                    data-section="chart-line-kst-tooltip"
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
                    <div data-section="chart-line-kst-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-kst-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-kst-tooltip-kst">
                      kst: {d.kst === null ? 'n/a' : formatValue(d.kst)}
                    </div>
                    <div data-section="chart-line-kst-tooltip-signal">
                      signal:{' '}
                      {d.signal === null ? 'n/a' : formatValue(d.signal)}
                    </div>
                    <div data-section="chart-line-kst-tooltip-sign">
                      sign: {d.sign}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-kst-legend"
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
                  data-section="chart-line-kst-legend-item"
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
                    data-section="chart-line-kst-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-kst-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-kst-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.positiveCount} above, {layout.negativeCount} below
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineKst.displayName = 'ChartLineKst';
