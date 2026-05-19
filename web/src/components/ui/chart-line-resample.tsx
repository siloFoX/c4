import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_RESAMPLE_WIDTH = 560;
export const DEFAULT_CHART_LINE_RESAMPLE_HEIGHT = 320;
export const DEFAULT_CHART_LINE_RESAMPLE_PADDING = 40;
export const DEFAULT_CHART_LINE_RESAMPLE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RESAMPLE_RAW_STROKE_WIDTH = 1;
export const DEFAULT_CHART_LINE_RESAMPLE_RESAMPLED_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_RESAMPLE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RESAMPLE_RAW_OPACITY = 0.3;
export const DEFAULT_CHART_LINE_RESAMPLE_TARGET = 100;
export const DEFAULT_CHART_LINE_RESAMPLE_PALETTE = [
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
export const DEFAULT_CHART_LINE_RESAMPLE_RAW_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RESAMPLE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RESAMPLE_AXIS_COLOR = '#cbd5e1';

export type ChartLineResampleMode =
  | 'lttb'
  | 'stride'
  | 'mean'
  | 'minmax'
  | 'linear-upsample';

export const LINE_RESAMPLE_MODES: ChartLineResampleMode[] = [
  'lttb',
  'stride',
  'mean',
  'minmax',
  'linear-upsample',
];

export interface ChartLineResamplePoint {
  x: number;
  y: number;
}

export interface ChartLineResampleSample extends ChartLineResamplePoint {
  originalIndex: number;
  synthesized: boolean;
}

export interface ChartLineResampleSeries {
  id: string;
  label: string;
  data: readonly ChartLineResamplePoint[];
  color?: string;
  mode?: ChartLineResampleMode;
  target?: number;
}

export interface ChartLineResampleLayoutPoint extends ChartLineResampleSample {
  index: number;
  px: number;
  py: number;
}

export interface ChartLineResampleLayoutSeries {
  id: string;
  label: string;
  color: string;
  mode: ChartLineResampleMode;
  target: number;
  rawPoints: { index: number; x: number; y: number; px: number; py: number }[];
  resampledPoints: ChartLineResampleLayoutPoint[];
  rawPath: string;
  resampledPath: string;
  rawCount: number;
  resampledCount: number;
  finiteCount: number;
  totalCount: number;
  reductionRatio: number;
}

export interface ComputeLineResampleLayoutResult {
  series: ChartLineResampleLayoutSeries[];
  xTicks: number[];
  yTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  totalRawPoints: number;
  totalResampledPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineResampleLayoutOptions {
  series: readonly ChartLineResampleSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  mode?: ChartLineResampleMode;
  target?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineResampleProps {
  series: readonly ChartLineResampleSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  mode?: ChartLineResampleMode;
  defaultMode?: ChartLineResampleMode;
  onModeChange?: (mode: ChartLineResampleMode) => void;
  target?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  rawStrokeWidth?: number;
  resampledStrokeWidth?: number;
  dotRadius?: number;
  rawOpacity?: number;
  rawColor?: string;
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
  showReductionBadge?: boolean;
  showRaw?: boolean;
  showModeToggle?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatRatio?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineResampleLayoutSeries;
    point: ChartLineResampleLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineResampleSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineResampleDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_RESAMPLE_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineResampleFinitePoints(
  points: readonly ChartLineResamplePoint[] | null | undefined,
): { x: number; y: number; originalIndex: number }[] {
  if (!Array.isArray(points)) return [];
  const out: { x: number; y: number; originalIndex: number }[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (!!p && isFiniteNumber(p.x) && isFiniteNumber(p.y)) {
      out.push({ x: p.x, y: p.y, originalIndex: i });
    }
  }
  return out;
}

export function normaliseLineResampleTarget(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_RESAMPLE_TARGET;
  if (value < 2) return 2;
  return Math.floor(value);
}

export function normaliseLineResampleMode(value: unknown): ChartLineResampleMode {
  if (
    typeof value === 'string' &&
    LINE_RESAMPLE_MODES.includes(value as ChartLineResampleMode)
  ) {
    return value as ChartLineResampleMode;
  }
  return 'lttb';
}

function toSample(
  p: { x: number; y: number; originalIndex: number },
  synthesized: boolean,
): ChartLineResampleSample {
  return {
    x: p.x,
    y: p.y,
    originalIndex: p.originalIndex,
    synthesized,
  };
}

export function lineResampleStride(
  points: readonly ChartLineResamplePoint[] | null | undefined,
  target: number,
): ChartLineResampleSample[] {
  const finite = getLineResampleFinitePoints(points);
  if (finite.length === 0) return [];
  const t = normaliseLineResampleTarget(target);
  if (finite.length <= t) return finite.map((p) => toSample(p, false));
  const stride = (finite.length - 1) / (t - 1);
  const out: ChartLineResampleSample[] = [];
  for (let i = 0; i < t; i += 1) {
    const idx = Math.round(i * stride);
    const p = finite[idx]!;
    out.push(toSample(p, false));
  }
  return out;
}

export function lineResampleMean(
  points: readonly ChartLineResamplePoint[] | null | undefined,
  target: number,
): ChartLineResampleSample[] {
  const finite = getLineResampleFinitePoints(points);
  if (finite.length === 0) return [];
  const t = normaliseLineResampleTarget(target);
  if (finite.length <= t) return finite.map((p) => toSample(p, false));
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const out: ChartLineResampleSample[] = [];
  const bucketSize = sorted.length / t;
  for (let i = 0; i < t; i += 1) {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(sorted.length, Math.floor((i + 1) * bucketSize));
    if (end <= start) continue;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    let representativeIdx = start;
    for (let j = start; j < end; j += 1) {
      sumX += sorted[j]!.x;
      sumY += sorted[j]!.y;
      count += 1;
    }
    if (count > 0) {
      const meanX = sumX / count;
      // Pick the original index closest to the bucket's centre x for
      // hover continuity; representative remains a synthesized point.
      let bestDiff = Number.POSITIVE_INFINITY;
      for (let j = start; j < end; j += 1) {
        const d = Math.abs(sorted[j]!.x - meanX);
        if (d < bestDiff) {
          bestDiff = d;
          representativeIdx = j;
        }
      }
      out.push({
        x: meanX,
        y: sumY / count,
        originalIndex: sorted[representativeIdx]!.originalIndex,
        synthesized: true,
      });
    }
  }
  return out;
}

export function lineResampleMinMax(
  points: readonly ChartLineResamplePoint[] | null | undefined,
  target: number,
): ChartLineResampleSample[] {
  const finite = getLineResampleFinitePoints(points);
  if (finite.length === 0) return [];
  const t = normaliseLineResampleTarget(target);
  if (finite.length <= t) return finite.map((p) => toSample(p, false));
  // To keep both min and max we need at least 2 slots per bucket.
  // Split target into pairs of buckets and emit min then max per bucket
  // ordered by x for path continuity.
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const buckets = Math.max(1, Math.floor(t / 2));
  const out: ChartLineResampleSample[] = [];
  const bucketSize = sorted.length / buckets;
  for (let i = 0; i < buckets; i += 1) {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(sorted.length, Math.floor((i + 1) * bucketSize));
    if (end <= start) continue;
    let minIdx = start;
    let maxIdx = start;
    for (let j = start; j < end; j += 1) {
      if (sorted[j]!.y < sorted[minIdx]!.y) minIdx = j;
      if (sorted[j]!.y > sorted[maxIdx]!.y) maxIdx = j;
    }
    if (minIdx === maxIdx) {
      out.push(toSample(sorted[minIdx]!, false));
    } else if (minIdx < maxIdx) {
      out.push(toSample(sorted[minIdx]!, false));
      out.push(toSample(sorted[maxIdx]!, false));
    } else {
      out.push(toSample(sorted[maxIdx]!, false));
      out.push(toSample(sorted[minIdx]!, false));
    }
  }
  return out;
}

export function lineResampleLttb(
  points: readonly ChartLineResamplePoint[] | null | undefined,
  target: number,
): ChartLineResampleSample[] {
  const finite = getLineResampleFinitePoints(points);
  if (finite.length === 0) return [];
  const t = normaliseLineResampleTarget(target);
  if (finite.length <= t) return finite.map((p) => toSample(p, false));
  if (t < 3) return lineResampleStride(points, t);
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const N = sorted.length;
  const out: ChartLineResampleSample[] = [];
  // Always keep the first sample.
  out.push(toSample(sorted[0]!, false));

  const bucketSize = (N - 2) / (t - 2);
  let prevA = 0;
  for (let i = 0; i < t - 2; i += 1) {
    const start = Math.floor((i + 1) * bucketSize) + 1;
    const end = Math.min(N - 1, Math.floor((i + 2) * bucketSize) + 1);
    const nextStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextEnd = Math.min(N - 1, Math.floor((i + 2) * bucketSize) + 1);
    // Average point of the next bucket (used as the third triangle vertex)
    let avgX = 0;
    let avgY = 0;
    let avgCount = 0;
    for (let j = nextStart; j < nextEnd; j += 1) {
      avgX += sorted[j]!.x;
      avgY += sorted[j]!.y;
      avgCount += 1;
    }
    if (avgCount === 0) {
      avgX = sorted[N - 1]!.x;
      avgY = sorted[N - 1]!.y;
      avgCount = 1;
    }
    avgX /= avgCount;
    avgY /= avgCount;

    const ax = sorted[prevA]!.x;
    const ay = sorted[prevA]!.y;

    let maxArea = -1;
    let maxAreaIdx = start;
    for (let j = start; j < end; j += 1) {
      const bx = sorted[j]!.x;
      const by = sorted[j]!.y;
      // Triangle area with vertices A, B (candidate), C (avg of next
      // bucket)
      const area = Math.abs(
        (ax - avgX) * (by - ay) - (ax - bx) * (avgY - ay),
      ) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        maxAreaIdx = j;
      }
    }
    out.push(toSample(sorted[maxAreaIdx]!, false));
    prevA = maxAreaIdx;
  }

  out.push(toSample(sorted[N - 1]!, false));
  return out;
}

export function lineResampleLinearUpsample(
  points: readonly ChartLineResamplePoint[] | null | undefined,
  target: number,
): ChartLineResampleSample[] {
  const finite = getLineResampleFinitePoints(points);
  if (finite.length === 0) return [];
  const t = normaliseLineResampleTarget(target);
  if (finite.length >= t) return finite.map((p) => toSample(p, false));
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  if (sorted.length === 1) {
    return [toSample(sorted[0]!, false)];
  }
  const x0 = sorted[0]!.x;
  const xN = sorted[sorted.length - 1]!.x;
  if (x0 === xN) {
    return sorted.map((p) => toSample(p, false));
  }
  const out: ChartLineResampleSample[] = [];
  let cursor = 0;
  for (let i = 0; i < t; i += 1) {
    const ratio = i / (t - 1);
    const x = x0 + (xN - x0) * ratio;
    while (
      cursor < sorted.length - 2 &&
      sorted[cursor + 1]!.x < x
    ) {
      cursor += 1;
    }
    const a = sorted[cursor]!;
    const b = sorted[cursor + 1]!;
    if (b === undefined || a.x === b.x) {
      out.push({
        x: a.x,
        y: a.y,
        originalIndex: a.originalIndex,
        synthesized: false,
      });
      continue;
    }
    const t01 = (x - a.x) / (b.x - a.x);
    const y = a.y + (b.y - a.y) * t01;
    // Exactly at a sample: not synthesized; else synthesized
    const isExactA = Math.abs(x - a.x) < 1e-12;
    const isExactB = Math.abs(x - b.x) < 1e-12;
    if (isExactA) {
      out.push({
        x: a.x,
        y: a.y,
        originalIndex: a.originalIndex,
        synthesized: false,
      });
    } else if (isExactB) {
      out.push({
        x: b.x,
        y: b.y,
        originalIndex: b.originalIndex,
        synthesized: false,
      });
    } else {
      out.push({
        x,
        y,
        originalIndex: a.originalIndex,
        synthesized: true,
      });
    }
  }
  return out;
}

export function applyLineResample(
  points: readonly ChartLineResamplePoint[] | null | undefined,
  mode: ChartLineResampleMode,
  target: number,
): ChartLineResampleSample[] {
  switch (mode) {
    case 'stride':
      return lineResampleStride(points, target);
    case 'mean':
      return lineResampleMean(points, target);
    case 'minmax':
      return lineResampleMinMax(points, target);
    case 'linear-upsample':
      return lineResampleLinearUpsample(points, target);
    case 'lttb':
    default:
      return lineResampleLttb(points, target);
  }
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

export function computeLineResampleLayout(
  options: ComputeLineResampleLayoutOptions,
): ComputeLineResampleLayoutResult {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_RESAMPLE_TICK_COUNT,
    mode = 'lttb',
    target = DEFAULT_CHART_LINE_RESAMPLE_TARGET,
    defaultColors = DEFAULT_CHART_LINE_RESAMPLE_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ComputeLineResampleLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    innerWidth,
    innerHeight,
    totalRawPoints: 0,
    totalResampledPoints: 0,
    visibleSeriesCount: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!Array.isArray(series) || series.length === 0) return empty;

  const hidden = normaliseHidden(hiddenSeries);
  const visible = series.filter((s) => !hidden.has(s.id));
  if (visible.length === 0) return empty;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let totalRaw = 0;
  let totalResampled = 0;

  const rawBySeries = new Map<
    string,
    { x: number; y: number; originalIndex: number }[]
  >();
  const resampledBySeries = new Map<string, ChartLineResampleSample[]>();
  const modeBySeries = new Map<string, ChartLineResampleMode>();
  const targetBySeries = new Map<string, number>();

  for (const s of visible) {
    const finite = getLineResampleFinitePoints(s.data);
    rawBySeries.set(s.id, finite);
    totalRaw += finite.length;
    const seriesMode = normaliseLineResampleMode(s.mode ?? mode);
    const seriesTarget = normaliseLineResampleTarget(s.target ?? target);
    modeBySeries.set(s.id, seriesMode);
    targetBySeries.set(s.id, seriesTarget);
    const resampled = applyLineResample(s.data, seriesMode, seriesTarget);
    resampledBySeries.set(s.id, resampled);
    totalResampled += resampled.length;
    for (const p of finite) {
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
      if (p.y < yLo) yLo = p.y;
      if (p.y > yHi) yHi = p.y;
    }
    // Resampled points may include synthesized values just outside the
    // raw x-range bounds (mean buckets, linear upsample), but generally
    // stay within. Still expand the bounds defensively.
    for (const p of resampled) {
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
      if (p.y < yLo) yLo = p.y;
      if (p.y > yHi) yHi = p.y;
    }
  }

  if (totalRaw === 0) return empty;

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

  const layoutSeries: ChartLineResampleLayoutSeries[] = visible.map(
    (s, idx) => {
      const finite = rawBySeries.get(s.id) ?? [];
      const resampled = resampledBySeries.get(s.id) ?? [];
      const sMode = modeBySeries.get(s.id) ?? mode;
      const sTarget = targetBySeries.get(s.id) ?? target;
      const color =
        s.color ?? defaultColors[idx % defaultColors.length] ?? DEFAULT_CHART_LINE_RESAMPLE_PALETTE[0]!;

      const rawPoints = finite.map((p, i) => ({
        index: i,
        x: p.x,
        y: p.y,
        px: projectX(p.x),
        py: projectY(p.y),
      }));
      const resampledPoints: ChartLineResampleLayoutPoint[] = resampled.map(
        (p, i) => ({
          ...p,
          index: i,
          px: projectX(p.x),
          py: projectY(p.y),
        }),
      );

      const rawPath = buildPath(rawPoints);
      const resampledPath = buildPath(resampledPoints);

      const rawCount = finite.length;
      const resampledCount = resampled.length;
      const reductionRatio =
        rawCount > 0 ? resampledCount / rawCount : 0;

      return {
        id: s.id,
        label: s.label,
        color,
        mode: sMode,
        target: sTarget,
        rawPoints,
        resampledPoints,
        rawPath,
        resampledPath,
        rawCount,
        resampledCount,
        finiteCount: finite.length,
        totalCount: s.data?.length ?? 0,
        reductionRatio,
      };
    },
  );

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
    totalRawPoints: totalRaw,
    totalResampledPoints: totalResampled,
    visibleSeriesCount: visible.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function defaultFormatRatio(n: number): string {
  if (!isFiniteNumber(n)) return '';
  return `${(n * 100).toFixed(1)}%`;
}

export function describeLineResampleChart(
  series: readonly ChartLineResampleSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    mode?: ChartLineResampleMode;
    target?: number;
    formatRatio?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const chartMode = normaliseLineResampleMode(options?.mode);
  const chartTarget = normaliseLineResampleTarget(options?.target);
  const fmtR = options?.formatRatio ?? defaultFormatRatio;

  let totalRaw = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const finite = getLineResampleFinitePoints(s.data);
    const sMode = normaliseLineResampleMode(s.mode ?? chartMode);
    const sTarget = normaliseLineResampleTarget(s.target ?? chartTarget);
    const resampled = applyLineResample(s.data, sMode, sTarget);
    totalRaw += finite.length;
    const ratio = finite.length > 0 ? resampled.length / finite.length : 0;
    summaries.push(
      `${s.label}: ${sMode} -> ${resampled.length}/${finite.length} (${fmtR(ratio)})`,
    );
  }
  if (totalRaw === 0) return 'No data';

  return `Line chart with downsample/upsample toggle across ${visible.length} series (${totalRaw} raw points). ${summaries.join('; ')}.`;
}

const MODE_LABEL: Record<ChartLineResampleMode, string> = {
  lttb: 'LTTB',
  stride: 'Stride',
  mean: 'Mean',
  minmax: 'Min/Max',
  'linear-upsample': 'Upsample',
};

export const ChartLineResample = forwardRef<
  HTMLDivElement,
  ChartLineResampleProps
>(function ChartLineResample(
  props: ChartLineResampleProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    mode: controlledMode,
    defaultMode = 'lttb',
    onModeChange,
    target = DEFAULT_CHART_LINE_RESAMPLE_TARGET,
    width = DEFAULT_CHART_LINE_RESAMPLE_WIDTH,
    height = DEFAULT_CHART_LINE_RESAMPLE_HEIGHT,
    padding = DEFAULT_CHART_LINE_RESAMPLE_PADDING,
    tickCount = DEFAULT_CHART_LINE_RESAMPLE_TICK_COUNT,
    rawStrokeWidth = DEFAULT_CHART_LINE_RESAMPLE_RAW_STROKE_WIDTH,
    resampledStrokeWidth = DEFAULT_CHART_LINE_RESAMPLE_RESAMPLED_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_RESAMPLE_DOT_RADIUS,
    rawOpacity = DEFAULT_CHART_LINE_RESAMPLE_RAW_OPACITY,
    rawColor = DEFAULT_CHART_LINE_RESAMPLE_RAW_COLOR,
    gridColor = DEFAULT_CHART_LINE_RESAMPLE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_RESAMPLE_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showReductionBadge = true,
    showRaw = true,
    showModeToggle = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with resample mode toggle',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    formatRatio = defaultFormatRatio,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const isControlledHidden = controlledHidden !== undefined;
  const [uncontrolledHidden, setUncontrolledHidden] = useState<Set<string>>(
    () => normaliseHidden(defaultHiddenSeries),
  );
  const hiddenSet = isControlledHidden
    ? normaliseHidden(controlledHidden)
    : uncontrolledHidden;

  const isControlledMode = controlledMode !== undefined;
  const [uncontrolledMode, setUncontrolledMode] = useState<ChartLineResampleMode>(
    () => normaliseLineResampleMode(defaultMode),
  );
  const effectiveMode = isControlledMode
    ? normaliseLineResampleMode(controlledMode)
    : uncontrolledMode;

  const layout = useMemo(
    () =>
      computeLineResampleLayout({
        series,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        tickCount,
        mode: effectiveMode,
        target,
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
      effectiveMode,
      target,
      xMin,
      xMax,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineResampleChart(series, {
        hidden: hiddenSet,
        mode: effectiveMode,
        target,
        formatRatio,
      }),
    [ariaDescription, series, hiddenSet, effectiveMode, target, formatRatio],
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
    (s: ChartLineResampleSeries) => {
      const next = new Set(hiddenSet);
      const willHide = !next.has(s.id);
      if (willHide) next.add(s.id);
      else next.delete(s.id);
      if (!isControlledHidden) setUncontrolledHidden(next);
      onHiddenSeriesChange?.(next);
      onSeriesToggle?.({ series: s, hidden: willHide });
    },
    [hiddenSet, isControlledHidden, onHiddenSeriesChange, onSeriesToggle],
  );

  const handleModeChange = useCallback(
    (next: ChartLineResampleMode) => {
      if (!isControlledMode) setUncontrolledMode(next);
      onModeChange?.(next);
    },
    [isControlledMode, onModeChange],
  );

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
        data-section="chart-line-resample"
        data-empty="true"
        data-series-count={series.length}
        data-visible-series-count={0}
        data-total-raw-points={0}
        data-total-resampled-points={0}
        data-mode={effectiveMode}
        data-target={normaliseLineResampleTarget(target)}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-resample-aria-desc"
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
  const overallRatio =
    layout.totalRawPoints > 0
      ? layout.totalResampledPoints / layout.totalRawPoints
      : 0;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-resample"
      data-empty="false"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-raw-points={layout.totalRawPoints}
      data-total-resampled-points={layout.totalResampledPoints}
      data-mode={effectiveMode}
      data-target={normaliseLineResampleTarget(target)}
      data-reduction-ratio={overallRatio}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-resample-aria-desc"
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
        data-section="chart-line-resample-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showReductionBadge ? (
          <div
            data-section="chart-line-resample-badge"
            data-mode={effectiveMode}
            data-reduction-ratio={overallRatio}
            data-resampled-count={layout.totalResampledPoints}
            data-raw-count={layout.totalRawPoints}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: layout.series[0]?.color ?? '#0f172a',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-resample-badge-icon"
              aria-hidden="true"
            >
              ↓
            </span>
            <span data-section="chart-line-resample-badge-mode">
              {MODE_LABEL[effectiveMode]}
            </span>
            <span data-section="chart-line-resample-badge-counts">
              {layout.totalResampledPoints}/{layout.totalRawPoints}
            </span>
            <span data-section="chart-line-resample-badge-ratio">
              ({formatRatio(overallRatio)})
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-resample-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-resample-grid"
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
                    data-section="chart-line-resample-grid-line"
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
                    data-section="chart-line-resample-grid-line"
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
              data-section="chart-line-resample-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-resample-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
              />
              <line
                data-section="chart-line-resample-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
              />
              <g data-section="chart-line-resample-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    padding +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.innerWidth;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-resample-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={padding + layout.innerHeight}
                        y2={padding + layout.innerHeight + 4}
                      />
                      <text
                        data-section="chart-line-resample-tick-label"
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
              <g data-section="chart-line-resample-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    padding +
                    layout.innerHeight -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.innerHeight;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-resample-tick"
                      data-axis="y"
                    >
                      <line x1={padding - 4} x2={padding} y1={py} y2={py} />
                      <text
                        data-section="chart-line-resample-tick-label"
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
                  data-section="chart-line-resample-x-label"
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
                  data-section="chart-line-resample-y-label"
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

          <g data-section="chart-line-resample-series">
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-resample-series-group"
                data-series-id={s.id}
                data-series-color={s.color}
                data-series-mode={s.mode}
                data-series-target={s.target}
                data-series-raw-count={s.rawCount}
                data-series-resampled-count={s.resampledCount}
                data-series-reduction-ratio={s.reductionRatio}
                data-series-finite-count={s.finiteCount}
              >
                {showRaw && s.rawPath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} raw (${s.rawCount} points)`}
                    data-section="chart-line-resample-raw-path"
                    data-series-id={s.id}
                    data-kind="raw"
                    d={s.rawPath}
                    fill="none"
                    stroke={rawColor}
                    strokeWidth={rawStrokeWidth}
                    strokeOpacity={rawOpacity}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {s.resampledPath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} resampled via ${MODE_LABEL[s.mode]} to ${s.resampledCount} of ${s.rawCount} points`}
                    data-section="chart-line-resample-resampled-path"
                    data-series-id={s.id}
                    data-kind="resampled"
                    d={s.resampledPath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={resampledStrokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showDots
                  ? s.resampledPoints.map((p) => {
                      const isHover =
                        hoverPayload?.seriesId === s.id &&
                        hoverPayload?.pointIndex === p.index;
                      return (
                        <circle
                          key={`d-${p.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} resampled point ${p.index + 1} at x ${formatX(p.x)} y ${formatValue(p.y)}${p.synthesized ? ' (synthesized)' : ''}`}
                          data-section="chart-line-resample-dot"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-x={p.x}
                          data-y={p.y}
                          data-original-index={p.originalIndex}
                          data-synthesized={p.synthesized ? 'true' : 'false'}
                          data-hovered={isHover ? 'true' : 'false'}
                          cx={p.px}
                          cy={p.py}
                          r={isHover ? dotRadius + 1 : dotRadius}
                          fill={s.color}
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
              const p = s.resampledPoints[hoverPayload.pointIndex];
              if (!p) return null;
              return (
                <div
                  data-section="chart-line-resample-tooltip"
                  data-series-id={s.id}
                  data-point-index={p.index}
                  data-synthesized={p.synthesized ? 'true' : 'false'}
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
                    minWidth: 160,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-resample-tooltip-label"
                    style={{ color: s.color, fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-resample-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div
                    data-section="chart-line-resample-tooltip-y"
                    style={{ fontWeight: 600 }}
                  >
                    y: {formatValue(p.y)}
                  </div>
                  <div data-section="chart-line-resample-tooltip-source">
                    {p.synthesized
                      ? `synthesized (${MODE_LABEL[s.mode]})`
                      : `original #${p.originalIndex + 1}`}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      <div
        data-section="chart-line-resample-controls"
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginTop: 8,
        }}
      >
        {showModeToggle ? (
          <div
            data-section="chart-line-resample-mode-toggle"
            role="radiogroup"
            aria-label="Resample mode"
            style={{
              display: 'inline-flex',
              gap: 4,
              alignItems: 'center',
              fontSize: 11,
            }}
          >
            {LINE_RESAMPLE_MODES.map((m) => {
              const active = m === effectiveMode;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active ? 'true' : 'false'}
                  data-section="chart-line-resample-mode-button"
                  data-mode={m}
                  data-active={active ? 'true' : 'false'}
                  onClick={() => handleModeChange(m)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    border: '1px solid',
                    borderColor: active ? '#0f172a' : '#cbd5e1',
                    background: active ? '#0f172a' : 'transparent',
                    color: active ? '#f8fafc' : '#334155',
                    cursor: 'pointer',
                  }}
                >
                  {MODE_LABEL[m]}
                </button>
              );
            })}
          </div>
        ) : null}

        {showLegend ? (
          <div
            data-section="chart-line-resample-legend"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              fontSize: 11,
            }}
          >
            {series.map((s) => {
              const isHidden = hiddenSet.has(s.id);
              const layoutMatch = layout.series.find((x) => x.id === s.id);
              const swatchColor =
                s.color ??
                layoutMatch?.color ??
                DEFAULT_CHART_LINE_RESAMPLE_PALETTE[0]!;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-section="chart-line-resample-legend-item"
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
                    data-section="chart-line-resample-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: swatchColor,
                    }}
                  />
                  <span data-section="chart-line-resample-legend-label">
                    {s.label}
                  </span>
                  {layoutMatch ? (
                    <span
                      data-section="chart-line-resample-legend-stats"
                      style={{ fontSize: 10, color: '#64748b' }}
                    >
                      ({layoutMatch.resampledCount}/{layoutMatch.rawCount})
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
});

ChartLineResample.displayName = 'ChartLineResample';
