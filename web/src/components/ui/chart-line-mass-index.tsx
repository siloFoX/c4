import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_MASS_INDEX_WIDTH = 560;
export const DEFAULT_CHART_LINE_MASS_INDEX_HEIGHT = 360;
export const DEFAULT_CHART_LINE_MASS_INDEX_PADDING = 40;
export const DEFAULT_CHART_LINE_MASS_INDEX_GAP = 26;
export const DEFAULT_CHART_LINE_MASS_INDEX_RANGE_PANEL_RATIO = 0.5;
export const DEFAULT_CHART_LINE_MASS_INDEX_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MASS_INDEX_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MASS_INDEX_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MASS_INDEX_EMA_PERIOD = 9;
export const DEFAULT_CHART_LINE_MASS_INDEX_SUM_PERIOD = 25;
export const DEFAULT_CHART_LINE_MASS_INDEX_SETUP_THRESHOLD = 27;
export const DEFAULT_CHART_LINE_MASS_INDEX_TRIGGER_THRESHOLD = 26.5;
export const DEFAULT_CHART_LINE_MASS_INDEX_HIGH_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_MASS_INDEX_LOW_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_MASS_INDEX_BAND_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_MASS_INDEX_MASS_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_MASS_INDEX_SETUP_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MASS_INDEX_TRIGGER_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_MASS_INDEX_BULGE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MASS_INDEX_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MASS_INDEX_AXIS_COLOR = '#cbd5e1';

export type ChartLineMassIndexPhase = 'calm' | 'bulge' | 'signal';

export interface ChartLineMassIndexPoint {
  x: number;
  high: number;
  low: number;
}

export interface ChartLineMassIndexSample {
  index: number;
  x: number;
  high: number;
  low: number;
  range: number;
  massIndex: number | null;
  phase: ChartLineMassIndexPhase;
}

export interface ChartLineMassIndexRun {
  series: ChartLineMassIndexPoint[];
  emaPeriod: number;
  sumPeriod: number;
  setupThreshold: number;
  triggerThreshold: number;
  range: number[];
  single: (number | null)[];
  double: (number | null)[];
  ratio: (number | null)[];
  massIndex: (number | null)[];
  samples: ChartLineMassIndexSample[];
  massIndexFinal: number;
  massIndexMin: number;
  massIndexMax: number;
  bulgeCount: number;
  ok: boolean;
}

export interface ChartLineMassIndexRangeDot {
  index: number;
  x: number;
  high: number;
  low: number;
  range: number;
  massIndex: number | null;
  phase: ChartLineMassIndexPhase;
  px: number;
  highY: number;
  lowY: number;
}

export interface ChartLineMassIndexMarker {
  index: number;
  x: number;
  massIndex: number;
  phase: ChartLineMassIndexPhase;
  px: number;
  py: number;
}

export interface ChartLineMassIndexPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineMassIndexLayout {
  ok: boolean;
  width: number;
  height: number;
  rangePanel: ChartLineMassIndexPanel;
  massPanel: ChartLineMassIndexPanel;
  xTicks: { value: number; px: number }[];
  rangeYTicks: { value: number; py: number }[];
  massYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  rangeYMin: number;
  rangeYMax: number;
  massYMin: number;
  massYMax: number;
  highPath: string;
  lowPath: string;
  bandPath: string;
  massPath: string;
  rangeDots: ChartLineMassIndexRangeDot[];
  markers: ChartLineMassIndexMarker[];
  setupY: number;
  triggerY: number;
  emaPeriod: number;
  sumPeriod: number;
  setupThreshold: number;
  triggerThreshold: number;
  massIndexFinal: number;
  massIndexMin: number;
  massIndexMax: number;
  bulgeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineMassIndexLayoutOptions {
  data: readonly ChartLineMassIndexPoint[];
  emaPeriod?: number;
  sumPeriod?: number;
  setupThreshold?: number;
  triggerThreshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  rangePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineMassIndexProps {
  data: readonly ChartLineMassIndexPoint[];
  emaPeriod?: number;
  sumPeriod?: number;
  setupThreshold?: number;
  triggerThreshold?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  rangePanelRatio?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  highColor?: string;
  lowColor?: string;
  bandColor?: string;
  massColor?: string;
  setupColor?: string;
  triggerColor?: string;
  bulgeColor?: string;
  signalColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBand?: boolean;
  showMass?: boolean;
  showThresholds?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineMassIndexRangeDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineMassIndexFinitePoints(
  points: readonly ChartLineMassIndexPoint[] | null | undefined,
): ChartLineMassIndexPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineMassIndexPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineMassIndexPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * An exponential moving average over `period` values, tolerating
 * leading `null` placeholders (the single-EMA series has them). The
 * seed is the simple mean of the first `period` defined values,
 * placed at that value's index; each later defined value folds in at
 * weight `2 / (period + 1)`. Indices before the seed read null.
 */
export function computeLineMassIndexEma(
  src: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  const idx: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const v = src[i];
    if (v !== null && v !== undefined) idx.push(i);
  }
  if (idx.length < p) return out;
  const mult = 2 / (p + 1);
  let sum = 0;
  for (let k = 0; k < p; k += 1) sum += src[idx[k]!] as number;
  let ema = sum / p;
  out[idx[p - 1]!] = ema;
  for (let k = p; k < idx.length; k += 1) {
    const i = idx[k]!;
    ema = (src[i] as number) * mult + ema * (1 - mult);
    out[i] = ema;
  }
  return out;
}

/**
 * Donald Dorsey's Mass Index. The high-low range is smoothed by a
 * single EMA, that single EMA is smoothed again into a double EMA,
 * and their ratio is summed over `sumPeriod` periods. A widening
 * range pushes the single EMA above the double EMA, so the ratio
 * climbs above one and the sum bulges -- the "reversal bulge".
 */
export function computeLineMassIndex(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  emaPeriod: number,
  sumPeriod: number,
): {
  range: number[];
  single: (number | null)[];
  double: (number | null)[];
  ratio: (number | null)[];
  massIndex: (number | null)[];
} {
  if (!Array.isArray(highs) || !Array.isArray(lows)) {
    return { range: [], single: [], double: [], ratio: [], massIndex: [] };
  }
  const n = Math.min(highs.length, lows.length);
  const range: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) range[i] = (highs[i] as number) - (lows[i] as number);
  const single = computeLineMassIndexEma(range, emaPeriod);
  const double = computeLineMassIndexEma(single, emaPeriod);
  const ratio: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const s = single[i];
    const d = double[i];
    if (s !== null && s !== undefined && d !== null && d !== undefined) {
      const raw = d === 0 ? 0 : s / d;
      ratio[i] = raw === 0 ? 0 : raw;
    }
  }
  const sp = sumPeriod < 1 ? 1 : Math.floor(sumPeriod);
  const massIndex: (number | null)[] = new Array(n).fill(null);
  for (let i = sp - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = 0; k < sp; k += 1) {
      const r = ratio[i - k];
      if (r === null || r === undefined) {
        valid = false;
        break;
      }
      sum += r;
    }
    if (valid) massIndex[i] = sum;
  }
  return { range, single, double, ratio, massIndex };
}

export function runLineMassIndex(
  points: readonly ChartLineMassIndexPoint[] | null | undefined,
  options?: {
    emaPeriod?: number;
    sumPeriod?: number;
    setupThreshold?: number;
    triggerThreshold?: number;
  },
): ChartLineMassIndexRun {
  const finite = getLineMassIndexFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const emaPeriod = normalizeLineMassIndexPeriod(
    options?.emaPeriod ?? DEFAULT_CHART_LINE_MASS_INDEX_EMA_PERIOD,
    DEFAULT_CHART_LINE_MASS_INDEX_EMA_PERIOD,
  );
  const sumPeriod = normalizeLineMassIndexPeriod(
    options?.sumPeriod ?? DEFAULT_CHART_LINE_MASS_INDEX_SUM_PERIOD,
    DEFAULT_CHART_LINE_MASS_INDEX_SUM_PERIOD,
  );
  const setupThreshold = isFiniteNumber(options?.setupThreshold)
    ? (options!.setupThreshold as number)
    : DEFAULT_CHART_LINE_MASS_INDEX_SETUP_THRESHOLD;
  const triggerThreshold = isFiniteNumber(options?.triggerThreshold)
    ? (options!.triggerThreshold as number)
    : DEFAULT_CHART_LINE_MASS_INDEX_TRIGGER_THRESHOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      emaPeriod,
      sumPeriod,
      setupThreshold,
      triggerThreshold,
      range: [],
      single: [],
      double: [],
      ratio: [],
      massIndex: [],
      samples: [],
      massIndexFinal: NaN,
      massIndexMin: NaN,
      massIndexMax: NaN,
      bulgeCount: 0,
      ok: false,
    };
  }

  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const { range, single, double, ratio, massIndex } = computeLineMassIndex(
    highs,
    lows,
    emaPeriod,
    sumPeriod,
  );

  const samples: ChartLineMassIndexSample[] = [];
  let armed = false;
  let bulgeCount = 0;
  let massIndexMin = NaN;
  let massIndexMax = NaN;
  let massIndexFinal = NaN;
  for (let i = 0; i < n; i += 1) {
    const mi = massIndex[i] ?? null;
    let phase: ChartLineMassIndexPhase = 'calm';
    if (mi !== null) {
      if (mi >= setupThreshold) {
        phase = 'bulge';
        armed = true;
      } else if (armed && mi < triggerThreshold) {
        phase = 'signal';
        armed = false;
        bulgeCount += 1;
      } else {
        phase = 'calm';
      }
      if (Number.isNaN(massIndexMin) || mi < massIndexMin) massIndexMin = mi;
      if (Number.isNaN(massIndexMax) || mi > massIndexMax) massIndexMax = mi;
      massIndexFinal = mi;
    }
    samples.push({
      index: i,
      x: series[i]!.x,
      high: series[i]!.high,
      low: series[i]!.low,
      range: range[i]!,
      massIndex: mi,
      phase,
    });
  }

  return {
    series = [],
    emaPeriod,
    sumPeriod,
    setupThreshold,
    triggerThreshold,
    range,
    single,
    double,
    ratio,
    massIndex,
    samples,
    massIndexFinal,
    massIndexMin,
    massIndexMax,
    bulgeCount,
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

function buildBandPath(
  highPts: readonly { px: number; py: number }[],
  lowPts: readonly { px: number; py: number }[],
): string {
  if (highPts.length === 0 || lowPts.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < highPts.length; i += 1) {
    const p = highPts[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  for (let i = lowPts.length - 1; i >= 0; i -= 1) {
    const p = lowPts[i]!;
    parts.push(`L ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  parts.push('Z');
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

export function computeLineMassIndexLayout(
  options: ComputeLineMassIndexLayoutOptions,
): ChartLineMassIndexLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_MASS_INDEX_GAP,
    rangePanelRatio = DEFAULT_CHART_LINE_MASS_INDEX_RANGE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_MASS_INDEX_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, rangePanelRatio));

  const emptyPanel: ChartLineMassIndexPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineMassIndex(data, {
    ...(isFiniteNumber(options.emaPeriod)
      ? { emaPeriod: options.emaPeriod }
      : {}),
    ...(isFiniteNumber(options.sumPeriod)
      ? { sumPeriod: options.sumPeriod }
      : {}),
    ...(isFiniteNumber(options.setupThreshold)
      ? { setupThreshold: options.setupThreshold }
      : {}),
    ...(isFiniteNumber(options.triggerThreshold)
      ? { triggerThreshold: options.triggerThreshold }
      : {}),
  });
  const empty: ChartLineMassIndexLayout = {
    ok: false,
    width,
    height,
    rangePanel: emptyPanel,
    massPanel: emptyPanel,
    xTicks: [],
    rangeYTicks: [],
    massYTicks: [],
    xMin: 0,
    xMax: 0,
    rangeYMin: 0,
    rangeYMax: 0,
    massYMin: 0,
    massYMax: 0,
    highPath: '',
    lowPath: '',
    bandPath: '',
    massPath: '',
    rangeDots: [],
    markers: [],
    setupY: 0,
    triggerY: 0,
    emaPeriod: run.emaPeriod,
    sumPeriod: run.sumPeriod,
    setupThreshold: run.setupThreshold,
    triggerThreshold: run.triggerThreshold,
    massIndexFinal: NaN,
    massIndexMin: NaN,
    massIndexMax: NaN,
    bulgeCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const rangeH = usableHeight * ratio;
  const massH = usableHeight - rangeH;
  if (rangeH <= 0 || massH <= 0) return empty;

  const rangePanel: ChartLineMassIndexPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: rangeH,
  };
  const massPanel: ChartLineMassIndexPanel = {
    x: padding,
    y: padding + rangeH + gap,
    width: innerWidth,
    height: massH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.low < pyLo) pyLo = s.low;
    if (s.high > pyHi) pyHi = s.high;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }

  let miLo = Number.isNaN(run.massIndexMin)
    ? run.triggerThreshold
    : Math.min(run.massIndexMin, run.triggerThreshold);
  let miHi = Number.isNaN(run.massIndexMax)
    ? run.setupThreshold
    : Math.max(run.massIndexMax, run.setupThreshold);
  if (miLo >= miHi) {
    const mid = (miLo + miHi) / 2;
    miLo = mid - 1;
    miHi = mid + 1;
  }
  const miPad = (miHi - miLo) * 0.08;
  miLo -= miPad;
  miHi += miPad;

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    rangePanel.x + ((x - xLo) / xRange) * rangePanel.width;
  const projectRangeY = (v: number): number =>
    rangePanel.y +
    rangePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * rangePanel.height;
  const projectMassY = (v: number): number =>
    massPanel.y +
    massPanel.height -
    ((v - miLo) / (miHi - miLo)) * massPanel.height;

  const rangeDots: ChartLineMassIndexRangeDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    high: s.high,
    low: s.low,
    range: s.range,
    massIndex: s.massIndex,
    phase: s.phase,
    px: projectX(s.x),
    highY: projectRangeY(s.high),
    lowY: projectRangeY(s.low),
  }));

  const highPts = rangeDots.map((d) => ({ px: d.px, py: d.highY }));
  const lowPts = rangeDots.map((d) => ({ px: d.px, py: d.lowY }));

  const massPts: { px: number; py: number }[] = [];
  const markers: ChartLineMassIndexMarker[] = [];
  for (const s of run.samples) {
    if (s.massIndex !== null) {
      const px = projectX(s.x);
      const py = projectMassY(s.massIndex);
      massPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        massIndex: s.massIndex,
        phase: s.phase,
        px,
        py,
      });
    }
  }

  return {
    ok: true,
    width,
    height,
    rangePanel,
    massPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    rangeYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectRangeY(v),
    })),
    massYTicks: computeTicks(miLo, miHi, tickCount).map((v) => ({
      value: v,
      py: projectMassY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    rangeYMin: pyLo,
    rangeYMax: pyHi,
    massYMin: miLo,
    massYMax: miHi,
    highPath: buildPath(highPts),
    lowPath: buildPath(lowPts),
    bandPath: buildBandPath(highPts, lowPts),
    massPath: buildPath(massPts),
    rangeDots,
    markers,
    setupY: projectMassY(run.setupThreshold),
    triggerY: projectMassY(run.triggerThreshold),
    emaPeriod: run.emaPeriod,
    sumPeriod: run.sumPeriod,
    setupThreshold: run.setupThreshold,
    triggerThreshold: run.triggerThreshold,
    massIndexFinal: run.massIndexFinal,
    massIndexMin: run.massIndexMin,
    massIndexMax: run.massIndexMax,
    bulgeCount: run.bulgeCount,
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

export function describeLineMassIndexChart(
  data: readonly ChartLineMassIndexPoint[] | null | undefined,
  options?: {
    emaPeriod?: number;
    sumPeriod?: number;
    setupThreshold?: number;
    triggerThreshold?: number;
  },
): string {
  const run = runLineMassIndex(data, options);
  if (!run.ok) return 'No data';
  const plural = run.bulgeCount === 1 ? '' : 's';
  return `Line chart with a Mass Index panel (EMA ${run.emaPeriod}, sum ${run.sumPeriod}): the Mass Index sums the ratio of a single to a double exponential moving average of the high-low range over ${run.sumPeriod} periods, bulging when the range expands; a rise above ${run.setupThreshold} followed by a drop below ${run.triggerThreshold} is the reversal bulge signal. ${run.bulgeCount} reversal bulge${plural} detected across ${run.samples.length} periods.`;
}

const MASS_INDEX_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineMassIndex = forwardRef<
  HTMLDivElement,
  ChartLineMassIndexProps
>(function ChartLineMassIndex(
  props: ChartLineMassIndexProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    emaPeriod,
    sumPeriod,
    setupThreshold,
    triggerThreshold,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_MASS_INDEX_WIDTH,
    height = DEFAULT_CHART_LINE_MASS_INDEX_HEIGHT,
    padding = DEFAULT_CHART_LINE_MASS_INDEX_PADDING,
    gap = DEFAULT_CHART_LINE_MASS_INDEX_GAP,
    rangePanelRatio = DEFAULT_CHART_LINE_MASS_INDEX_RANGE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_MASS_INDEX_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MASS_INDEX_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MASS_INDEX_DOT_RADIUS,
    highColor = DEFAULT_CHART_LINE_MASS_INDEX_HIGH_COLOR,
    lowColor = DEFAULT_CHART_LINE_MASS_INDEX_LOW_COLOR,
    bandColor = DEFAULT_CHART_LINE_MASS_INDEX_BAND_COLOR,
    massColor = DEFAULT_CHART_LINE_MASS_INDEX_MASS_COLOR,
    setupColor = DEFAULT_CHART_LINE_MASS_INDEX_SETUP_COLOR,
    triggerColor = DEFAULT_CHART_LINE_MASS_INDEX_TRIGGER_COLOR,
    bulgeColor = DEFAULT_CHART_LINE_MASS_INDEX_BULGE_COLOR,
    signalColor = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_COLOR,
    gridColor = DEFAULT_CHART_LINE_MASS_INDEX_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_MASS_INDEX_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showBand = true,
    showMass = true,
    showThresholds = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a Mass Index reversal panel',
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
      computeLineMassIndexLayout({
        data,
        width,
        height,
        padding,
        gap,
        rangePanelRatio,
        tickCount,
        ...(isFiniteNumber(emaPeriod) ? { emaPeriod } : {}),
        ...(isFiniteNumber(sumPeriod) ? { sumPeriod } : {}),
        ...(isFiniteNumber(setupThreshold) ? { setupThreshold } : {}),
        ...(isFiniteNumber(triggerThreshold) ? { triggerThreshold } : {}),
      }),
    [
      data,
      width,
      height,
      padding,
      gap,
      rangePanelRatio,
      tickCount,
      emaPeriod,
      sumPeriod,
      setupThreshold,
      triggerThreshold,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineMassIndexChart(data, {
        ...(isFiniteNumber(emaPeriod) ? { emaPeriod } : {}),
        ...(isFiniteNumber(sumPeriod) ? { sumPeriod } : {}),
        ...(isFiniteNumber(setupThreshold) ? { setupThreshold } : {}),
        ...(isFiniteNumber(triggerThreshold) ? { triggerThreshold } : {}),
      }),
    [ariaDescription, data, emaPeriod, sumPeriod, setupThreshold, triggerThreshold],
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

  const phaseColor = useCallback(
    (ph: ChartLineMassIndexPhase): string =>
      ph === 'bulge' ? bulgeColor : ph === 'signal' ? signalColor : massColor,
    [bulgeColor, signalColor, massColor],
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
        data-section="chart-line-mass-index"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-mass-index-aria-desc"
          style={MASS_INDEX_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const rp = layout.rangePanel;
  const mp = layout.massPanel;
  const highVisible = !hiddenSet.has('high');
  const lowVisible = !hiddenSet.has('low');
  const massVisible = showMass && !hiddenSet.has('mass');
  const bandVisible = showBand && highVisible && lowVisible;

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'high', label: 'High', color: highColor },
    { id: 'low', label: 'Low', color: lowColor },
    { id: 'mass', label: 'Mass Index', color: massColor },
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
      data-section="chart-line-mass-index"
      data-empty="false"
      data-ema-period={layout.emaPeriod}
      data-sum-period={layout.sumPeriod}
      data-setup-threshold={layout.setupThreshold}
      data-trigger-threshold={layout.triggerThreshold}
      data-mass-index-final={layout.massIndexFinal}
      data-bulge-count={layout.bulgeCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-mass-index-aria-desc"
        style={MASS_INDEX_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-mass-index-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-mass-index-badge"
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
              data-section="chart-line-mass-index-badge-icon"
              aria-hidden="true"
              style={{ color: massColor }}
            >
              MASS
            </span>
            <span data-section="chart-line-mass-index-badge-ema">
              e={layout.emaPeriod}
            </span>
            <span data-section="chart-line-mass-index-badge-sum">
              s={layout.sumPeriod}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-mass-index-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-mass-index-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.rangeYTicks.map((t, i) => (
                <line
                  key={`rgy-${i}`}
                  data-section="chart-line-mass-index-grid-line"
                  data-panel="range"
                  x1={rp.x}
                  x2={rp.x + rp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.massYTicks.map((t, i) => (
                <line
                  key={`mgy-${i}`}
                  data-section="chart-line-mass-index-grid-line"
                  data-panel="mass"
                  x1={mp.x}
                  x2={mp.x + mp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showThresholds ? (
            <g data-section="chart-line-mass-index-thresholds">
              <line
                data-section="chart-line-mass-index-threshold-line"
                data-kind="setup"
                x1={mp.x}
                x2={mp.x + mp.width}
                y1={layout.setupY}
                y2={layout.setupY}
                stroke={setupColor}
                strokeWidth={1}
                strokeDasharray="5 3"
              />
              <line
                data-section="chart-line-mass-index-threshold-line"
                data-kind="trigger"
                x1={mp.x}
                x2={mp.x + mp.width}
                y1={layout.triggerY}
                y2={layout.triggerY}
                stroke={triggerColor}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-mass-index-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              {[
                { panel: rp, name: 'range', yt: layout.rangeYTicks },
                { panel: mp, name: 'mass', yt: layout.massYTicks },
              ].map((cfg) => (
                <g
                  key={`axis-${cfg.name}`}
                  data-section="chart-line-mass-index-axis-group"
                  data-panel={cfg.name}
                >
                  <line
                    data-section="chart-line-mass-index-axis"
                    data-panel={cfg.name}
                    data-axis="x"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y + cfg.panel.height}
                    x2={cfg.panel.x + cfg.panel.width}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  <line
                    data-section="chart-line-mass-index-axis"
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
                      data-section="chart-line-mass-index-tick"
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
                        data-section="chart-line-mass-index-tick-label"
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
              <g data-section="chart-line-mass-index-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`tx-${i}`}
                    data-section="chart-line-mass-index-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={mp.y + mp.height}
                      y2={mp.y + mp.height + 4}
                    />
                    <text
                      data-section="chart-line-mass-index-tick-label"
                      data-axis="x"
                      x={t.px}
                      y={mp.y + mp.height + 14}
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

          <g data-section="chart-line-mass-index-panel-labels">
            <text
              data-section="chart-line-mass-index-panel-label"
              data-panel="range"
              x={rp.x + rp.width / 2}
              y={rp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Range
            </text>
            <text
              data-section="chart-line-mass-index-panel-label"
              data-panel="mass"
              x={mp.x + mp.width / 2}
              y={mp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Mass Index
            </text>
          </g>

          {bandVisible ? (
            <path
              data-section="chart-line-mass-index-band"
              d={layout.bandPath}
              fill={bandColor}
              fillOpacity={0.45}
              stroke="none"
            />
          ) : null}

          {highVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="High line"
              data-section="chart-line-mass-index-high-path"
              d={layout.highPath}
              fill="none"
              stroke={highColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {lowVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Low line"
              data-section="chart-line-mass-index-low-path"
              d={layout.lowPath}
              fill="none"
              stroke={lowColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {showDots ? (
            <g data-section="chart-line-mass-index-dots">
              {layout.rangeDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <g key={`d-${d.index}`}>
                    {highVisible ? (
                      <circle
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, high ${formatValue(d.high)}`}
                        data-section="chart-line-mass-index-dot"
                        data-kind="high"
                        data-point-index={d.index}
                        data-x={d.x}
                        data-value={d.high}
                        cx={d.px}
                        cy={d.highY}
                        r={isHover ? dotRadius + 1.5 : dotRadius}
                        fill={highColor}
                        stroke="#ffffff"
                        strokeWidth={1}
                        onMouseEnter={() => {
                          setHoverIndex(d.index);
                          setTooltipPos({ px: d.px, py: d.highY });
                        }}
                        onMouseLeave={clearHover}
                        onFocus={() => {
                          setHoverIndex(d.index);
                          setTooltipPos({ px: d.px, py: d.highY });
                        }}
                        onBlur={clearHover}
                        onClick={() => onPointClick?.({ point: d })}
                      />
                    ) : null}
                    {lowVisible ? (
                      <circle
                        data-section="chart-line-mass-index-dot"
                        data-kind="low"
                        data-point-index={d.index}
                        data-x={d.x}
                        data-value={d.low}
                        cx={d.px}
                        cy={d.lowY}
                        r={isHover ? dotRadius + 1.5 : dotRadius}
                        fill={lowColor}
                        stroke="#ffffff"
                        strokeWidth={1}
                        onMouseEnter={() => {
                          setHoverIndex(d.index);
                          setTooltipPos({ px: d.px, py: d.lowY });
                        }}
                        onMouseLeave={clearHover}
                      />
                    ) : null}
                  </g>
                );
              })}
            </g>
          ) : null}

          {massVisible && layout.massPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Mass Index line"
              data-section="chart-line-mass-index-mass-line"
              d={layout.massPath}
              fill="none"
              stroke={massColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {massVisible ? (
            <g data-section="chart-line-mass-index-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Mass Index at x ${formatX(m.x)}: ${formatValue(m.massIndex)} (${m.phase})`}
                    data-section="chart-line-mass-index-marker"
                    data-point-index={m.index}
                    data-mass-index={m.massIndex}
                    data-phase={m.phase}
                    cx={m.px}
                    cy={m.py}
                    r={
                      m.phase === 'calm'
                        ? isHover
                          ? dotRadius + 1.5
                          : dotRadius
                        : isHover
                          ? dotRadius + 2.5
                          : dotRadius + 1
                    }
                    fill={phaseColor(m.phase)}
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
                      const d = layout.rangeDots.find(
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
              const d = layout.rangeDots.find((x) => x.index === hoverIndex);
              if (!d) return null;
              return (
                <div
                  data-section="chart-line-mass-index-tooltip"
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
                  <div data-section="chart-line-mass-index-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div data-section="chart-line-mass-index-tooltip-high">
                    high: {formatValue(d.high)}
                  </div>
                  <div data-section="chart-line-mass-index-tooltip-low">
                    low: {formatValue(d.low)}
                  </div>
                  <div data-section="chart-line-mass-index-tooltip-range">
                    range: {formatValue(d.range)}
                  </div>
                  <div
                    data-section="chart-line-mass-index-tooltip-mass"
                    style={{ fontWeight: 600 }}
                  >
                    mass:{' '}
                    {d.massIndex === null ? 'n/a' : formatValue(d.massIndex)}
                  </div>
                  <div data-section="chart-line-mass-index-tooltip-phase">
                    phase: {d.phase}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-mass-index-legend"
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
                data-section="chart-line-mass-index-legend-item"
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
                  data-section="chart-line-mass-index-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-mass-index-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-mass-index-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.bulgeCount} bulge{layout.bulgeCount === 1 ? '' : 's'}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineMassIndex.displayName = 'ChartLineMassIndex';
