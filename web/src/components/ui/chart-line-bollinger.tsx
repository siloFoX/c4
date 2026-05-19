import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_BOLLINGER_WIDTH = 560;
export const DEFAULT_CHART_LINE_BOLLINGER_HEIGHT = 320;
export const DEFAULT_CHART_LINE_BOLLINGER_PADDING = 40;
export const DEFAULT_CHART_LINE_BOLLINGER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_BOLLINGER_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_BOLLINGER_BAND_STROKE_WIDTH = 1;
export const DEFAULT_CHART_LINE_BOLLINGER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_BOLLINGER_WINDOW = 20;
export const DEFAULT_CHART_LINE_BOLLINGER_K_SIGMA = 2;
export const DEFAULT_CHART_LINE_BOLLINGER_BAND_OPACITY = 0.16;
export const DEFAULT_CHART_LINE_BOLLINGER_MIDDLE_DASH = '4 3';
export const DEFAULT_CHART_LINE_BOLLINGER_PALETTE = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#f59e0b',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#7c3aed',
  '#0d9488',
];
export const DEFAULT_CHART_LINE_BOLLINGER_BAND_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_BOLLINGER_BREAKOUT_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_BOLLINGER_BREAKOUT_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_BOLLINGER_INSIDE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_BOLLINGER_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_BOLLINGER_AXIS_COLOR = '#cbd5e1';

export type ChartLineBollingerState = 'inside' | 'above' | 'below';

export interface ChartLineBollingerPoint {
  x: number;
  y: number;
}

export interface ChartLineBollingerSeries {
  id: string;
  label: string;
  data: readonly ChartLineBollingerPoint[];
  color?: string;
  window?: number;
  kSigma?: number;
  bandColor?: string;
}

export interface ChartLineBollingerSample {
  index: number;
  x: number;
  y: number;
  middle: number | null;
  upper: number | null;
  lower: number | null;
  sigma: number | null;
  bandwidth: number | null;
  percentB: number | null;
  state: ChartLineBollingerState;
}

export interface ChartLineBollingerLayoutPoint extends ChartLineBollingerSample {
  px: number;
  py: number;
  middlePy: number | null;
  upperPy: number | null;
  lowerPy: number | null;
}

export interface ChartLineBollingerLayoutSeries {
  id: string;
  label: string;
  color: string;
  bandColor: string;
  window: number;
  kSigma: number;
  points: ChartLineBollingerLayoutPoint[];
  path: string;
  middlePath: string;
  upperPath: string;
  lowerPath: string;
  bandPath: string;
  finiteCount: number;
  totalCount: number;
  bandValidCount: number;
  aboveCount: number;
  belowCount: number;
  insideCount: number;
  latestPercentB: number | null;
  latestBandwidth: number | null;
  latestState: ChartLineBollingerState;
}

export interface ComputeLineBollingerLayoutResult {
  series: ChartLineBollingerLayoutSeries[];
  xTicks: number[];
  yTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineBollingerLayoutOptions {
  series: readonly ChartLineBollingerSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  window?: number;
  kSigma?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineBollingerProps {
  series: readonly ChartLineBollingerSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  window?: number;
  kSigma?: number;
  strokeWidth?: number;
  bandStrokeWidth?: number;
  dotRadius?: number;
  bandOpacity?: number;
  middleDashArray?: string;
  bandColor?: string;
  breakoutUpColor?: string;
  breakoutDownColor?: string;
  insideColor?: string;
  gridColor?: string;
  axisColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showBreakoutBadge?: boolean;
  showBand?: boolean;
  showMiddle?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatPercent?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineBollingerLayoutSeries;
    point: ChartLineBollingerLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineBollingerSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineBollingerDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_BOLLINGER_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineBollingerFinitePoints(
  points: readonly ChartLineBollingerPoint[] | null | undefined,
): ChartLineBollingerPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineBollingerPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineBollingerWindow(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_BOLLINGER_WINDOW;
  if (value < 2) return 2;
  return Math.floor(value);
}

export function normaliseLineBollingerKSigma(value: unknown): number {
  if (!isFiniteNumber(value) || value <= 0) {
    return DEFAULT_CHART_LINE_BOLLINGER_K_SIGMA;
  }
  return value;
}

export function computeRollingMean(
  values: readonly number[] | null | undefined,
  window: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const w = normaliseLineBollingerWindow(window);
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = w - 1; i < values.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = i - w + 1; j <= i; j += 1) {
      const v = values[j];
      if (isFiniteNumber(v)) {
        sum += v;
        count += 1;
      }
    }
    if (count > 0) out[i] = sum / count;
  }
  return out;
}

export function computeRollingStd(
  values: readonly number[] | null | undefined,
  window: number,
  means?: readonly (number | null)[],
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const w = normaliseLineBollingerWindow(window);
  const ms = means ?? computeRollingMean(values, w);
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = w - 1; i < values.length; i += 1) {
    const m = ms[i];
    if (m === null || m === undefined || !isFiniteNumber(m)) continue;
    let varSum = 0;
    let count = 0;
    for (let j = i - w + 1; j <= i; j += 1) {
      const v = values[j];
      if (isFiniteNumber(v)) {
        const d = v - m;
        varSum += d * d;
        count += 1;
      }
    }
    if (count > 0) out[i] = Math.sqrt(varSum / count);
  }
  return out;
}

export function classifyLineBollingerState(
  y: number,
  upper: number | null,
  lower: number | null,
): ChartLineBollingerState {
  if (!isFiniteNumber(y)) return 'inside';
  if (
    upper !== null &&
    isFiniteNumber(upper) &&
    lower !== null &&
    isFiniteNumber(lower)
  ) {
    if (y > upper) return 'above';
    if (y < lower) return 'below';
  }
  return 'inside';
}

export function computeLineBollingerBands(
  points: readonly ChartLineBollingerPoint[] | null | undefined,
  options?: { window?: number; kSigma?: number },
): ChartLineBollingerSample[] {
  const finite = getLineBollingerFinitePoints(points);
  if (finite.length === 0) return [];
  const w = normaliseLineBollingerWindow(options?.window);
  const k = normaliseLineBollingerKSigma(options?.kSigma);
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const ys = sorted.map((p) => p.y);
  const means = computeRollingMean(ys, w);
  const stds = computeRollingStd(ys, w, means);

  return sorted.map((p, i) => {
    const m = means[i] ?? null;
    const s = stds[i] ?? null;
    const mid = m !== null && isFiniteNumber(m) ? m : null;
    const sigma = s !== null && isFiniteNumber(s) ? s : null;
    const upper = mid !== null && sigma !== null ? mid + k * sigma : null;
    const lower = mid !== null && sigma !== null ? mid - k * sigma : null;
    const bandwidth =
      mid !== null && mid !== 0 && upper !== null && lower !== null
        ? (upper - lower) / Math.abs(mid)
        : null;
    let percentB: number | null = null;
    if (upper !== null && lower !== null && upper !== lower) {
      percentB = (p.y - lower) / (upper - lower);
    }
    const state = classifyLineBollingerState(p.y, upper, lower);
    return {
      index: i,
      x: p.x,
      y: p.y,
      middle: mid,
      upper,
      lower,
      sigma,
      bandwidth,
      percentB,
      state,
    };
  });
}

function buildPath(
  points: readonly { px: number; py: number }[],
): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const cmd = i === 0 ? 'M' : 'L';
    parts.push(`${cmd} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  return parts.join(' ');
}

function buildSegmentedPath(
  segments: readonly { px: number; py: number }[][],
): string {
  return segments
    .map((seg) => buildPath(seg))
    .filter(Boolean)
    .join(' ');
}

function buildBandPolygon(
  upper: readonly { px: number; py: number }[],
  lower: readonly { px: number; py: number }[],
): string {
  if (upper.length === 0 || lower.length === 0) return '';
  const forward = upper
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.px.toFixed(3)} ${pt.py.toFixed(3)}`)
    .join(' ');
  const back = [...lower]
    .reverse()
    .map((pt) => `L ${pt.px.toFixed(3)} ${pt.py.toFixed(3)}`)
    .join(' ');
  return `${forward} ${back} Z`;
}

function splitContiguousBandRuns(
  points: readonly ChartLineBollingerLayoutPoint[],
): {
  upper: { px: number; py: number }[];
  lower: { px: number; py: number }[];
}[] {
  const runs: {
    upper: { px: number; py: number }[];
    lower: { px: number; py: number }[];
  }[] = [];
  let cur: {
    upper: { px: number; py: number }[];
    lower: { px: number; py: number }[];
  } | null = null;
  for (const p of points) {
    if (p.upperPy !== null && p.lowerPy !== null) {
      if (!cur) cur = { upper: [], lower: [] };
      cur.upper.push({ px: p.px, py: p.upperPy });
      cur.lower.push({ px: p.px, py: p.lowerPy });
    } else if (cur) {
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) runs.push(cur);
  return runs;
}

function splitContiguousNonNull(
  points: readonly ChartLineBollingerLayoutPoint[],
  pick: (p: ChartLineBollingerLayoutPoint) => number | null,
): { px: number; py: number }[][] {
  const runs: { px: number; py: number }[][] = [];
  let cur: { px: number; py: number }[] = [];
  for (const p of points) {
    const py = pick(p);
    if (py !== null) {
      cur.push({ px: p.px, py });
    } else if (cur.length > 0) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) runs.push(cur);
  return runs;
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

export function computeLineBollingerLayout(
  options: ComputeLineBollingerLayoutOptions,
): ComputeLineBollingerLayoutResult {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_BOLLINGER_TICK_COUNT,
    window,
    kSigma,
    defaultColors = DEFAULT_CHART_LINE_BOLLINGER_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ComputeLineBollingerLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    innerWidth,
    innerHeight,
    totalPoints: 0,
    visibleSeriesCount: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!Array.isArray(series) || series.length === 0) return empty;

  const hidden = normaliseHidden(hiddenSeries);
  const visible = series.filter((s) => !hidden.has(s.id));
  if (visible.length === 0) return empty;

  const chartWindow = normaliseLineBollingerWindow(window);
  const chartK = normaliseLineBollingerKSigma(kSigma);

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let totalPoints = 0;

  const samplesBySeries = new Map<string, ChartLineBollingerSample[]>();
  const seriesParams = new Map<string, { window: number; kSigma: number }>();

  for (const s of visible) {
    const seriesWindow = normaliseLineBollingerWindow(s.window ?? chartWindow);
    const seriesK = normaliseLineBollingerKSigma(s.kSigma ?? chartK);
    seriesParams.set(s.id, { window: seriesWindow, kSigma: seriesK });
    const samples = computeLineBollingerBands(s.data, {
      window: seriesWindow,
      kSigma: seriesK,
    });
    samplesBySeries.set(s.id, samples);
    totalPoints += samples.length;
    for (const p of samples) {
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
      if (p.y < yLo) yLo = p.y;
      if (p.y > yHi) yHi = p.y;
      if (p.upper !== null && isFiniteNumber(p.upper) && p.upper > yHi) yHi = p.upper;
      if (p.lower !== null && isFiniteNumber(p.lower) && p.lower < yLo) yLo = p.lower;
    }
  }

  if (totalPoints === 0) return empty;

  if (isFiniteNumber(xMinOverride)) xLo = xMinOverride;
  if (isFiniteNumber(xMaxOverride)) xHi = xMaxOverride;
  if (isFiniteNumber(yMinOverride)) yLo = yMinOverride;
  if (isFiniteNumber(yMaxOverride)) yHi = yMaxOverride;

  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;

  const projectX = (x: number): number =>
    padding + ((x - xLo) / xRange) * innerWidth;
  const projectY = (y: number): number =>
    padding + innerHeight - ((y - yLo) / yRange) * innerHeight;

  const layoutSeries: ChartLineBollingerLayoutSeries[] = visible.map((s, idx) => {
    const samples = samplesBySeries.get(s.id) ?? [];
    const params = seriesParams.get(s.id) ?? {
      window: chartWindow,
      kSigma: chartK,
    };
    const color =
      s.color ?? defaultColors[idx % defaultColors.length] ?? DEFAULT_CHART_LINE_BOLLINGER_PALETTE[0]!;
    const bandColor = s.bandColor ?? DEFAULT_CHART_LINE_BOLLINGER_BAND_COLOR;

    let aboveCount = 0;
    let belowCount = 0;
    let insideCount = 0;
    let bandValidCount = 0;
    let latestPercentB: number | null = null;
    let latestBandwidth: number | null = null;
    let latestState: ChartLineBollingerState = 'inside';

    const layoutPoints: ChartLineBollingerLayoutPoint[] = samples.map((p) => {
      if (p.upper !== null && p.lower !== null) bandValidCount += 1;
      if (p.state === 'above') aboveCount += 1;
      else if (p.state === 'below') belowCount += 1;
      else insideCount += 1;
      if (p.percentB !== null) latestPercentB = p.percentB;
      if (p.bandwidth !== null) latestBandwidth = p.bandwidth;
      latestState = p.state;
      return {
        ...p,
        px: projectX(p.x),
        py: projectY(p.y),
        middlePy: p.middle !== null ? projectY(p.middle) : null,
        upperPy: p.upper !== null ? projectY(p.upper) : null,
        lowerPy: p.lower !== null ? projectY(p.lower) : null,
      };
    });

    const path = buildPath(layoutPoints);
    const middleRuns = splitContiguousNonNull(layoutPoints, (p) => p.middlePy);
    const upperRuns = splitContiguousNonNull(layoutPoints, (p) => p.upperPy);
    const lowerRuns = splitContiguousNonNull(layoutPoints, (p) => p.lowerPy);
    const middlePath = buildSegmentedPath(middleRuns);
    const upperPath = buildSegmentedPath(upperRuns);
    const lowerPath = buildSegmentedPath(lowerRuns);

    const bandRuns = splitContiguousBandRuns(layoutPoints);
    const bandPath = bandRuns
      .map((r) => buildBandPolygon(r.upper, r.lower))
      .filter(Boolean)
      .join(' ');

    return {
      id: s.id,
      label: s.label,
      color,
      bandColor,
      window: params.window,
      kSigma: params.kSigma,
      points: layoutPoints,
      path,
      middlePath,
      upperPath,
      lowerPath,
      bandPath,
      finiteCount: samples.length,
      totalCount: s.data?.length ?? 0,
      bandValidCount,
      aboveCount,
      belowCount,
      insideCount,
      latestPercentB,
      latestBandwidth,
      latestState,
    };
  });

  return {
    series: layoutSeries,
    xTicks: computeTicks(xLo, xHi, tickCount),
    yTicks: computeTicks(yLo, yHi, tickCount),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    innerWidth,
    innerHeight,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function defaultFormatPercent(n: number): string {
  if (!isFiniteNumber(n)) return '';
  return `${(n * 100).toFixed(1)}%`;
}

export function describeLineBollingerChart(
  series: readonly ChartLineBollingerSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    window?: number;
    kSigma?: number;
    formatValue?: (n: number) => string;
    formatPercent?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const chartWindow = normaliseLineBollingerWindow(options?.window);
  const chartK = normaliseLineBollingerKSigma(options?.kSigma);
  const pct = options?.formatPercent ?? defaultFormatPercent;

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const seriesWindow = normaliseLineBollingerWindow(s.window ?? chartWindow);
    const seriesK = normaliseLineBollingerKSigma(s.kSigma ?? chartK);
    const samples = computeLineBollingerBands(s.data, {
      window: seriesWindow,
      kSigma: seriesK,
    });
    totalPoints += samples.length;
    let latest: ChartLineBollingerSample | null = null;
    for (let i = samples.length - 1; i >= 0; i -= 1) {
      const sm = samples[i]!;
      if (sm.percentB !== null) {
        latest = sm;
        break;
      }
    }
    summaries.push(
      `${s.label}: window ${seriesWindow}; k ${seriesK}; latest %B ${latest?.percentB === null || latest === null ? 'n/a' : pct(latest.percentB ?? 0)}`,
    );
  }
  if (totalPoints === 0) return 'No data';

  return `Line chart with Bollinger Bands across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineBollinger = forwardRef<
  HTMLDivElement,
  ChartLineBollingerProps
>(function ChartLineBollinger(
  props: ChartLineBollingerProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_BOLLINGER_WIDTH,
    height = DEFAULT_CHART_LINE_BOLLINGER_HEIGHT,
    padding = DEFAULT_CHART_LINE_BOLLINGER_PADDING,
    tickCount = DEFAULT_CHART_LINE_BOLLINGER_TICK_COUNT,
    window = DEFAULT_CHART_LINE_BOLLINGER_WINDOW,
    kSigma = DEFAULT_CHART_LINE_BOLLINGER_K_SIGMA,
    strokeWidth = DEFAULT_CHART_LINE_BOLLINGER_STROKE_WIDTH,
    bandStrokeWidth = DEFAULT_CHART_LINE_BOLLINGER_BAND_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_BOLLINGER_DOT_RADIUS,
    bandOpacity = DEFAULT_CHART_LINE_BOLLINGER_BAND_OPACITY,
    middleDashArray = DEFAULT_CHART_LINE_BOLLINGER_MIDDLE_DASH,
    bandColor = DEFAULT_CHART_LINE_BOLLINGER_BAND_COLOR,
    breakoutUpColor = DEFAULT_CHART_LINE_BOLLINGER_BREAKOUT_UP_COLOR,
    breakoutDownColor = DEFAULT_CHART_LINE_BOLLINGER_BREAKOUT_DOWN_COLOR,
    insideColor = DEFAULT_CHART_LINE_BOLLINGER_INSIDE_COLOR,
    gridColor = DEFAULT_CHART_LINE_BOLLINGER_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_BOLLINGER_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showBreakoutBadge = true,
    showBand = true,
    showMiddle = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with Bollinger Bands',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    formatPercent = defaultFormatPercent,
    xLabel,
    yLabel,
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
      computeLineBollingerLayout({
        series,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        tickCount,
        window,
        kSigma,
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(yMin) ? { yMin } : {}),
        ...(isFiniteNumber(yMax) ? { yMax } : {}),
      }),
    [
      series,
      hiddenSet,
      width,
      height,
      padding,
      tickCount,
      window,
      kSigma,
      xMin,
      xMax,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineBollingerChart(series, {
        hidden: hiddenSet,
        window,
        kSigma,
        formatValue,
        formatPercent,
      }),
    [ariaDescription, series, hiddenSet, window, kSigma, formatValue, formatPercent],
  );

  const [hoverPayload, setHoverPayload] = useState<{
    seriesId: string;
    pointIndex: number;
  } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHoverPayload(null);
    setTooltipPos(null);
  }, []);

  const handleToggle = useCallback(
    (s: ChartLineBollingerSeries) => {
      const next = new Set(hiddenSet);
      const willHide = !next.has(s.id);
      if (willHide) next.add(s.id);
      else next.delete(s.id);
      if (!isControlled) setUncontrolled(next);
      onHiddenSeriesChange?.(next);
      onSeriesToggle?.({ series: s, hidden: willHide });
    },
    [hiddenSet, isControlled, onHiddenSeriesChange, onSeriesToggle],
  );

  const allTotalPoints = useMemo(
    () =>
      series.reduce(
        (acc, s) => acc + getLineBollingerFinitePoints(s.data).length,
        0,
      ),
    [series],
  );

  const totalBreakouts = useMemo(
    () =>
      layout.series.reduce((acc, s) => acc + s.aboveCount + s.belowCount, 0),
    [layout.series],
  );

  const dominantBreakout = useMemo<{
    state: ChartLineBollingerState;
    seriesId: string;
    percentB: number | null;
  }>(() => {
    let best: {
      state: ChartLineBollingerState;
      seriesId: string;
      percentB: number | null;
      score: number;
    } = { state: 'inside', seriesId: '', percentB: null, score: -1 };
    for (const s of layout.series) {
      if (s.latestState !== 'inside') {
        const score = Math.abs(s.latestPercentB ?? 0);
        if (score > best.score) {
          best = {
            state: s.latestState,
            seriesId: s.id,
            percentB: s.latestPercentB,
            score,
          };
        }
      }
    }
    return {
      state: best.state,
      seriesId: best.seriesId,
      percentB: best.percentB,
    };
  }, [layout.series]);

  const badgeColor =
    dominantBreakout.state === 'above'
      ? breakoutUpColor
      : dominantBreakout.state === 'below'
        ? breakoutDownColor
        : insideColor;

  const containerStyle: CSSProperties = {
    width,
    height,
    position: 'relative',
    ...(style ?? {}),
  };

  if (layout.series.length === 0) {
    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={className}
        style={containerStyle}
        data-section="chart-line-bollinger"
        data-empty="true"
        data-series-count={series.length}
        data-visible-series-count={0}
        data-total-points={0}
        data-window={normaliseLineBollingerWindow(window)}
        data-k-sigma={normaliseLineBollingerKSigma(kSigma)}
        data-breakout-count={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-bollinger-aria-desc"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            clipPath: 'inset(50%)',
            whiteSpace: 'nowrap',
          }}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-bollinger"
      data-empty="false"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-window={normaliseLineBollingerWindow(window)}
      data-k-sigma={normaliseLineBollingerKSigma(kSigma)}
      data-breakout-count={totalBreakouts}
      data-dominant-state={dominantBreakout.state}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-bollinger-aria-desc"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          clipPath: 'inset(50%)',
          whiteSpace: 'nowrap',
        }}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-bollinger-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showBreakoutBadge ? (
          <div
            data-section="chart-line-bollinger-badge"
            data-state={dominantBreakout.state}
            data-series-id={dominantBreakout.seriesId}
            data-percent-b={dominantBreakout.percentB ?? ''}
            data-breakout-count={totalBreakouts}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: badgeColor,
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-bollinger-badge-icon"
              aria-hidden="true"
            >
              {dominantBreakout.state === 'above'
                ? '▲'
                : dominantBreakout.state === 'below'
                  ? '▼'
                  : '◆'}
            </span>
            <span data-section="chart-line-bollinger-badge-count">
              {totalBreakouts}
            </span>
            <span data-section="chart-line-bollinger-badge-label">
              {totalBreakouts === 0
                ? 'inside bands'
                : `breakout${totalBreakouts === 1 ? '' : 's'}`}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-bollinger-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-bollinger-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => {
                const py =
                  padding +
                  layout.innerHeight -
                  ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                    layout.innerHeight;
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-bollinger-grid-line"
                    data-axis="y"
                    x1={padding}
                    x2={padding + layout.innerWidth}
                    y1={py}
                    y2={py}
                  />
                );
              })}
              {layout.xTicks.map((t, i) => {
                const px =
                  padding +
                  ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                    layout.innerWidth;
                return (
                  <line
                    key={`gx-${i}`}
                    data-section="chart-line-bollinger-grid-line"
                    data-axis="x"
                    x1={px}
                    x2={px}
                    y1={padding}
                    y2={padding + layout.innerHeight}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-bollinger-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-bollinger-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
              />
              <line
                data-section="chart-line-bollinger-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
              />
              <g data-section="chart-line-bollinger-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    padding +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.innerWidth;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-bollinger-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={padding + layout.innerHeight}
                        y2={padding + layout.innerHeight + 4}
                      />
                      <text
                        data-section="chart-line-bollinger-tick-label"
                        data-axis="x"
                        x={px}
                        y={padding + layout.innerHeight + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatX(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              <g data-section="chart-line-bollinger-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    padding +
                    layout.innerHeight -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.innerHeight;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-bollinger-tick"
                      data-axis="y"
                    >
                      <line x1={padding - 4} x2={padding} y1={py} y2={py} />
                      <text
                        data-section="chart-line-bollinger-tick-label"
                        data-axis="y"
                        x={padding - 6}
                        y={py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatValue(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              {xLabel ? (
                <text
                  data-section="chart-line-bollinger-x-label"
                  x={padding + layout.innerWidth / 2}
                  y={height - 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {xLabel}
                </text>
              ) : null}
              {yLabel ? (
                <text
                  data-section="chart-line-bollinger-y-label"
                  transform={`rotate(-90 12 ${padding + layout.innerHeight / 2})`}
                  x={12}
                  y={padding + layout.innerHeight / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {yLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          <g data-section="chart-line-bollinger-series">
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-bollinger-series-group"
                data-series-id={s.id}
                data-series-color={s.color}
                data-series-band-color={s.bandColor}
                data-series-window={s.window}
                data-series-k-sigma={s.kSigma}
                data-series-finite-count={s.finiteCount}
                data-series-band-valid-count={s.bandValidCount}
                data-series-above-count={s.aboveCount}
                data-series-below-count={s.belowCount}
                data-series-inside-count={s.insideCount}
                data-series-latest-state={s.latestState}
              >
                {showBand && s.bandPath ? (
                  <path
                    data-section="chart-line-bollinger-band"
                    data-series-id={s.id}
                    d={s.bandPath}
                    fill={s.bandColor}
                    fillOpacity={bandOpacity}
                    stroke="none"
                    pointerEvents="none"
                  />
                ) : null}
                {showBand && s.upperPath ? (
                  <path
                    role="graphics-symbol"
                    aria-label={`${s.label} upper Bollinger band (window ${s.window}, k ${s.kSigma})`}
                    data-section="chart-line-bollinger-band-line"
                    data-series-id={s.id}
                    data-kind="upper"
                    d={s.upperPath}
                    fill="none"
                    stroke={s.bandColor}
                    strokeWidth={bandStrokeWidth}
                  />
                ) : null}
                {showBand && s.lowerPath ? (
                  <path
                    role="graphics-symbol"
                    aria-label={`${s.label} lower Bollinger band (window ${s.window}, k ${s.kSigma})`}
                    data-section="chart-line-bollinger-band-line"
                    data-series-id={s.id}
                    data-kind="lower"
                    d={s.lowerPath}
                    fill="none"
                    stroke={s.bandColor}
                    strokeWidth={bandStrokeWidth}
                  />
                ) : null}
                {showMiddle && s.middlePath ? (
                  <path
                    role="graphics-symbol"
                    aria-label={`${s.label} middle Bollinger band (SMA${s.window})`}
                    data-section="chart-line-bollinger-band-line"
                    data-series-id={s.id}
                    data-kind="middle"
                    d={s.middlePath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={bandStrokeWidth}
                    strokeDasharray={middleDashArray}
                  />
                ) : null}
                {s.path ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} price line`}
                    data-section="chart-line-bollinger-path"
                    data-series-id={s.id}
                    data-kind="price"
                    d={s.path}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showDots
                  ? s.points.map((p) => {
                      const isHover =
                        hoverPayload?.seriesId === s.id &&
                        hoverPayload?.pointIndex === p.index;
                      const dotColor =
                        p.state === 'above'
                          ? breakoutUpColor
                          : p.state === 'below'
                            ? breakoutDownColor
                            : insideColor;
                      return (
                        <circle
                          key={`d-${p.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)} y ${formatValue(p.y)}${
                            p.state === 'inside'
                              ? '; inside bands'
                              : `; breakout ${p.state}`
                          }${p.percentB !== null ? `; %B ${formatPercent(p.percentB)}` : ''}`}
                          data-section="chart-line-bollinger-dot"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-x={p.x}
                          data-y={p.y}
                          data-middle={p.middle ?? ''}
                          data-upper={p.upper ?? ''}
                          data-lower={p.lower ?? ''}
                          data-percent-b={p.percentB ?? ''}
                          data-bandwidth={p.bandwidth ?? ''}
                          data-state={p.state}
                          data-hovered={isHover ? 'true' : 'false'}
                          cx={p.px}
                          cy={p.py}
                          r={p.state === 'inside' ? dotRadius : dotRadius + 1}
                          fill={dotColor}
                          stroke="#ffffff"
                          strokeWidth={1}
                          onMouseEnter={() => {
                            setHoverPayload({
                              seriesId: s.id,
                              pointIndex: p.index,
                            });
                            setTooltipPos({ px: p.px, py: p.py });
                          }}
                          onMouseLeave={clearHover}
                          onFocus={() => {
                            setHoverPayload({
                              seriesId: s.id,
                              pointIndex: p.index,
                            });
                            setTooltipPos({ px: p.px, py: p.py });
                          }}
                          onBlur={clearHover}
                          onClick={() =>
                            onPointClick?.({ series: s, point: p })
                          }
                        />
                      );
                    })
                  : null}
              </g>
            ))}
          </g>
        </svg>

        {showTooltip && hoverPayload && tooltipPos
          ? (() => {
              const s = layout.series.find((x) => x.id === hoverPayload.seriesId);
              if (!s) return null;
              const p = s.points[hoverPayload.pointIndex];
              if (!p) return null;
              const tipStateColor =
                p.state === 'above'
                  ? breakoutUpColor
                  : p.state === 'below'
                    ? breakoutDownColor
                    : insideColor;
              return (
                <div
                  data-section="chart-line-bollinger-tooltip"
                  data-series-id={s.id}
                  data-point-index={p.index}
                  data-state={p.state}
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
                  <div
                    data-section="chart-line-bollinger-tooltip-label"
                    style={{ color: s.color, fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-bollinger-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div
                    data-section="chart-line-bollinger-tooltip-y"
                    style={{ fontWeight: 600 }}
                  >
                    y: {formatValue(p.y)}
                  </div>
                  <div data-section="chart-line-bollinger-tooltip-middle">
                    middle:{' '}
                    {p.middle === null ? 'n/a' : formatValue(p.middle)}
                  </div>
                  <div data-section="chart-line-bollinger-tooltip-upper">
                    upper:{' '}
                    {p.upper === null ? 'n/a' : formatValue(p.upper)}
                  </div>
                  <div data-section="chart-line-bollinger-tooltip-lower">
                    lower:{' '}
                    {p.lower === null ? 'n/a' : formatValue(p.lower)}
                  </div>
                  <div
                    data-section="chart-line-bollinger-tooltip-state"
                    style={{ color: tipStateColor }}
                  >
                    {p.state === 'inside'
                      ? 'inside bands'
                      : `breakout ${p.state}`}
                    {p.percentB !== null
                      ? ` (%B ${formatPercent(p.percentB)})`
                      : ''}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-bollinger-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          {series.map((s) => {
            const isHidden = hiddenSet.has(s.id);
            const layoutMatch = layout.series.find((x) => x.id === s.id);
            const swatchColor =
              s.color ??
              layoutMatch?.color ??
              DEFAULT_CHART_LINE_BOLLINGER_PALETTE[0]!;
            return (
              <button
                key={s.id}
                type="button"
                data-section="chart-line-bollinger-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
                onClick={() => handleToggle(s)}
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
                  data-section="chart-line-bollinger-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: swatchColor,
                  }}
                />
                <span data-section="chart-line-bollinger-legend-label">
                  {s.label}
                </span>
                {layoutMatch ? (
                  <span
                    data-section="chart-line-bollinger-legend-stats"
                    style={{ fontSize: 10, color: '#64748b' }}
                  >
                    (BB({layoutMatch.window}, {layoutMatch.kSigma});
                    {' '}{layoutMatch.aboveCount + layoutMatch.belowCount} breakouts)
                  </span>
                ) : null}
              </button>
            );
          })}
          <span
            data-section="chart-line-bollinger-legend-total-points"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {allTotalPoints} total points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineBollinger.displayName = 'ChartLineBollinger';
