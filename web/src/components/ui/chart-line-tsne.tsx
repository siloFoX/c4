import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_TSNE_WIDTH = 720;
export const DEFAULT_CHART_LINE_TSNE_HEIGHT = 320;
export const DEFAULT_CHART_LINE_TSNE_PADDING = 40;
export const DEFAULT_CHART_LINE_TSNE_GAP = 24;
export const DEFAULT_CHART_LINE_TSNE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TSNE_MAIN_PANEL_RATIO = 0.58;
export const DEFAULT_CHART_LINE_TSNE_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_TSNE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TSNE_EMBEDDING_DOT_RADIUS = 3.5;
export const DEFAULT_CHART_LINE_TSNE_PCA_MAX_ITERATIONS = 128;
export const DEFAULT_CHART_LINE_TSNE_PALETTE = [
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
export const DEFAULT_CHART_LINE_TSNE_EMBEDDING_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TSNE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TSNE_AXIS_COLOR = '#cbd5e1';

export interface ChartLineTsnePoint {
  x: number;
  y: number;
}

export interface ChartLineTsneSeries {
  id: string;
  label: string;
  data: readonly ChartLineTsnePoint[];
  color?: string;
}

export interface ChartLineTsnePcaResult {
  ok: boolean;
  sampleCount: number;
  dimensions: number;
  mean: number[];
  components: number[][];
  eigenvalues: number[];
  totalVariance: number;
  explainedVariance: number[];
  embedding: { e1: number; e2: number }[];
}

export interface ChartLineTsneMatrix {
  xs: number[];
  matrix: number[][];
  channelCount: number;
  sampleCount: number;
}

export interface ChartLineTsneLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineTsneLayoutChannel {
  id: string;
  label: string;
  color: string;
  points: ChartLineTsneLayoutPoint[];
  path: string;
  finiteCount: number;
  totalCount: number;
}

export interface ChartLineTsneEmbeddingPoint {
  index: number;
  x: number;
  e1: number;
  e2: number;
  px: number;
  py: number;
  opacity: number;
}

export interface ChartLineTsneLayout {
  ok: boolean;
  width: number;
  height: number;
  mainPanel: { x: number; y: number; width: number; height: number };
  embeddingPanel: { x: number; y: number; width: number; height: number };
  channels: ChartLineTsneLayoutChannel[];
  embeddingPoints: ChartLineTsneEmbeddingPoint[];
  trajectoryPath: string;
  pca: ChartLineTsnePcaResult;
  xTicks: number[];
  mainYTicks: number[];
  e1Ticks: number[];
  e2Ticks: number[];
  xMin: number;
  xMax: number;
  mainYMin: number;
  mainYMax: number;
  e1Min: number;
  e1Max: number;
  e2Min: number;
  e2Max: number;
  totalPoints: number;
  channelCount: number;
}

export interface ComputeLineTsneLayoutOptions {
  series: readonly ChartLineTsneSeries[];
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  mainPanelRatio?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineTsneProps {
  series: readonly ChartLineTsneSeries[];
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  mainPanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  embeddingDotRadius?: number;
  embeddingColor?: string;
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
  showBadge?: boolean;
  showTrajectory?: boolean;
  showEmbeddingDots?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatEmbedding?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    channel: ChartLineTsneLayoutChannel;
    point: ChartLineTsneLayoutPoint;
  }) => void;
  onEmbeddingPointClick?: (payload: {
    point: ChartLineTsneEmbeddingPoint;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineTsneDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_TSNE_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineTsneFinitePoints(
  points: readonly ChartLineTsnePoint[] | null | undefined,
): ChartLineTsnePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineTsnePoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

/**
 * Builds the observation matrix for the embedding: pairs every series
 * (channel) by **exact x match**. One row per x value present in
 * *every* channel with a finite sample; each row is the vector of the
 * channels' y-values at that x, in series order. `channelCount` is the
 * dimensionality D, `sampleCount` is the number of rows N.
 */
export function buildLineTsneMatrix(
  series: readonly ChartLineTsneSeries[] | null | undefined,
): ChartLineTsneMatrix {
  if (!Array.isArray(series) || series.length === 0) {
    return { xs: [], matrix: [], channelCount: 0, sampleCount: 0 };
  }
  const D = series.length;
  const perChannel: Map<number, number>[] = series.map((s) => {
    const m = new Map<number, number>();
    const arr = Array.isArray(s.data) ? s.data : [];
    for (const p of arr) {
      if (!p || !isFiniteNumber(p.x) || !isFiniteNumber(p.y)) continue;
      if (!m.has(p.x)) m.set(p.x, p.y);
    }
    return m;
  });
  const first = perChannel[0]!;
  const sharedXs: number[] = [];
  for (const x of first.keys()) {
    let inAll = true;
    for (let d = 1; d < D; d += 1) {
      if (!perChannel[d]!.has(x)) {
        inAll = false;
        break;
      }
    }
    if (inAll) sharedXs.push(x);
  }
  sharedXs.sort((a, b) => a - b);
  const matrix: number[][] = sharedXs.map((x) =>
    perChannel.map((m) => m.get(x)!),
  );
  return {
    xs: sharedXs,
    matrix,
    channelCount: D,
    sampleCount: sharedXs.length,
  };
}

function vectorNorm(v: readonly number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

function dotProduct(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) s += a[i]! * b[i]!;
  return s;
}

function matrixTimesVector(
  m: readonly number[][],
  v: readonly number[],
): number[] {
  return m.map((row) => dotProduct(row, v));
}

/**
 * Force a deterministic sign on an eigenvector: the component with the
 * largest absolute value is made positive. This makes the PCA
 * projection reproducible regardless of which sign power iteration
 * happens to land on.
 */
function signFixVector(v: readonly number[]): number[] {
  let maxAbs = -1;
  let maxIdx = 0;
  for (let i = 0; i < v.length; i += 1) {
    const a = Math.abs(v[i]!);
    if (a > maxAbs) {
      maxAbs = a;
      maxIdx = i;
    }
  }
  if (v[maxIdx]! < 0) return v.map((x) => -x);
  return [...v];
}

function orthogonalize(
  v: readonly number[],
  against: readonly number[],
): number[] {
  const proj = dotProduct(v, against);
  return v.map((x, i) => x - proj * against[i]!);
}

function buildSeedVector(
  dimensions: number,
  against: readonly number[] | null,
): number[] {
  // A deterministic seed with distinct components is very unlikely to
  // be orthogonal to the dominant eigenvector.
  let seed: number[] = [];
  for (let i = 0; i < dimensions; i += 1) seed.push(i + 1);
  if (against) {
    seed = orthogonalize(seed, against);
    if (vectorNorm(seed) < 1e-9) {
      // Seed was parallel to `against` -- fall back to a basis vector
      // orthogonalised against it.
      for (let k = 0; k < dimensions; k += 1) {
        const basis = new Array<number>(dimensions).fill(0);
        basis[k] = 1;
        const o = orthogonalize(basis, against);
        if (vectorNorm(o) > 1e-9) {
          seed = o;
          break;
        }
      }
    }
  }
  const norm = vectorNorm(seed);
  if (norm < 1e-12) {
    const fallback = new Array<number>(dimensions).fill(0);
    if (dimensions > 0) fallback[0] = 1;
    return fallback;
  }
  return seed.map((x) => x / norm);
}

function powerIterate(
  covariance: readonly number[][],
  against: readonly number[] | null,
  maxIterations: number,
): number[] {
  const D = covariance.length;
  let v = buildSeedVector(D, against);
  for (let iter = 0; iter < maxIterations; iter += 1) {
    let w = matrixTimesVector(covariance, v);
    if (against) w = orthogonalize(w, against);
    const norm = vectorNorm(w);
    if (norm < 1e-12) break; // degenerate -- keep the last valid vector
    const next = w.map((x) => x / norm);
    let diff = 0;
    for (let i = 0; i < D; i += 1) {
      const d = next[i]! - v[i]!;
      diff += d * d;
    }
    v = next;
    if (diff < 1e-22) break;
  }
  return v;
}

function quadraticForm(
  covariance: readonly number[][],
  v: readonly number[],
): number {
  return dotProduct(v, matrixTimesVector(covariance, v));
}

/**
 * Simple **PCA projection** to 2 dimensions.
 *
 * Given an `N x D` observation matrix the projection:
 *  1. centres every column on its mean,
 *  2. forms the `D x D` covariance matrix,
 *  3. extracts the top-2 principal components by power iteration with
 *     deflation (PC2 is iterated in the subspace orthogonal to PC1),
 *  4. projects each centred observation onto PC1 / PC2.
 *
 * The eigenvectors are sign-fixed for a deterministic, reproducible
 * embedding. This is the "simple PCA-based projection" placeholder for
 * a t-SNE-style nonlinear embedding -- a fast, deterministic linear
 * stand-in.
 *
 * `ok = false` when there are fewer than 2 valid rows or fewer than 2
 * dimensions.
 */
export function computePcaProjection(
  matrix: readonly (readonly number[])[] | null | undefined,
  maxIterations: number = DEFAULT_CHART_LINE_TSNE_PCA_MAX_ITERATIONS,
): ChartLineTsnePcaResult {
  const rowsIn = Array.isArray(matrix) ? matrix : [];
  const D =
    rowsIn.length > 0 && Array.isArray(rowsIn[0]) ? rowsIn[0]!.length : 0;
  const notOk: ChartLineTsnePcaResult = {
    ok: false,
    sampleCount: rowsIn.length,
    dimensions: D,
    mean: [],
    components: [],
    eigenvalues: [],
    totalVariance: 0,
    explainedVariance: [],
    embedding: [],
  };
  if (D < 2) return notOk;
  const rows = rowsIn.filter(
    (r): r is readonly number[] =>
      Array.isArray(r) &&
      r.length === D &&
      r.every((v) => isFiniteNumber(v)),
  );
  const n = rows.length;
  if (n < 2) return { ...notOk, sampleCount: n };

  const mean = new Array<number>(D).fill(0);
  for (const row of rows) {
    for (let d = 0; d < D; d += 1) mean[d] += row[d]!;
  }
  for (let d = 0; d < D; d += 1) mean[d] /= n;

  const centered = rows.map((row) => row.map((v, d) => v - mean[d]!));

  const covariance: number[][] = [];
  for (let d1 = 0; d1 < D; d1 += 1) {
    covariance.push(new Array<number>(D).fill(0));
  }
  for (const row of centered) {
    for (let d1 = 0; d1 < D; d1 += 1) {
      for (let d2 = 0; d2 < D; d2 += 1) {
        covariance[d1]![d2] = covariance[d1]![d2]! + row[d1]! * row[d2]!;
      }
    }
  }
  for (let d1 = 0; d1 < D; d1 += 1) {
    for (let d2 = 0; d2 < D; d2 += 1) {
      covariance[d1]![d2] = covariance[d1]![d2]! / n;
    }
  }

  let totalVariance = 0;
  for (let d = 0; d < D; d += 1) totalVariance += covariance[d]![d]!;

  const pc1 = powerIterate(covariance, null, maxIterations);
  const lambda1 = quadraticForm(covariance, pc1);

  // Deflate: remove the PC1 component before iterating for PC2.
  const deflated: number[][] = covariance.map((row, d1) =>
    row.map((v, d2) => v - lambda1 * pc1[d1]! * pc1[d2]!),
  );
  const pc2 = powerIterate(deflated, pc1, maxIterations);
  const lambda2 = quadraticForm(covariance, pc2);

  const fixedPc1 = signFixVector(pc1);
  const fixedPc2 = signFixVector(pc2);

  const embedding = centered.map((row) => ({
    e1: dotProduct(row, fixedPc1),
    e2: dotProduct(row, fixedPc2),
  }));

  const explainedVariance =
    totalVariance > 0
      ? [lambda1 / totalVariance, lambda2 / totalVariance]
      : [0, 0];

  return {
    ok: true,
    sampleCount: n,
    dimensions: D,
    mean,
    components: [fixedPc1, fixedPc2],
    eigenvalues: [lambda1, lambda2],
    totalVariance,
    explainedVariance,
    embedding,
  };
}

export function runLineTsne(
  series: readonly ChartLineTsneSeries[] | null | undefined,
  maxIterations: number = DEFAULT_CHART_LINE_TSNE_PCA_MAX_ITERATIONS,
): {
  matrix: ChartLineTsneMatrix;
  pca: ChartLineTsnePcaResult;
} {
  const matrix = buildLineTsneMatrix(series);
  const pca = computePcaProjection(matrix.matrix, maxIterations);
  return { matrix, pca };
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

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

function normaliseMainPanelRatio(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_TSNE_MAIN_PANEL_RATIO;
  if (value < 0.2) return 0.2;
  if (value > 0.8) return 0.8;
  return value;
}

export function computeLineTsneLayout(
  options: ComputeLineTsneLayoutOptions,
): ChartLineTsneLayout {
  const {
    series,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_TSNE_GAP,
    tickCount = DEFAULT_CHART_LINE_TSNE_TICK_COUNT,
    mainPanelRatio,
    defaultColors = DEFAULT_CHART_LINE_TSNE_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = normaliseMainPanelRatio(mainPanelRatio);
  const usableWidth = Math.max(0, innerWidth - gap);
  const mainWidth = usableWidth * ratio;
  const embeddingWidth = usableWidth - mainWidth;

  const channelCount = Array.isArray(series) ? series.length : 0;
  const { matrix, pca } = runLineTsne(series);

  const mainPanel = {
    x: padding,
    y: padding,
    width: mainWidth,
    height: innerHeight,
  };
  const embeddingPanel = {
    x: padding + mainWidth + gap,
    y: padding,
    width: embeddingWidth,
    height: innerHeight,
  };

  const empty: ChartLineTsneLayout = {
    ok: false,
    width,
    height,
    mainPanel,
    embeddingPanel,
    channels: [],
    embeddingPoints: [],
    trajectoryPath: '',
    pca,
    xTicks: [],
    mainYTicks: [],
    e1Ticks: [],
    e2Ticks: [],
    xMin: 0,
    xMax: 0,
    mainYMin: 0,
    mainYMax: 0,
    e1Min: -1,
    e1Max: 1,
    e2Min: -1,
    e2Max: 1,
    totalPoints: 0,
    channelCount,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!Array.isArray(series) || series.length === 0) return empty;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let totalPoints = 0;

  for (const s of series) {
    for (const p of getLineTsneFinitePoints(s.data)) {
      totalPoints += 1;
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
      if (p.y < yLo) yLo = p.y;
      if (p.y > yHi) yHi = p.y;
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
    mainPanel.x + ((x - xLo) / xRange) * mainPanel.width;
  const projectY = (y: number): number =>
    mainPanel.y + mainPanel.height - ((y - yLo) / yRange) * mainPanel.height;

  const channels: ChartLineTsneLayoutChannel[] = series.map((s, idx) => {
    const finite = getLineTsneFinitePoints(s.data)
      .slice()
      .sort((a, b) => a.x - b.x);
    const color =
      s.color ??
      defaultColors[idx % defaultColors.length] ??
      DEFAULT_CHART_LINE_TSNE_PALETTE[0]!;
    const points: ChartLineTsneLayoutPoint[] = finite.map((p, i) => ({
      index: i,
      x: p.x,
      y: p.y,
      px: projectX(p.x),
      py: projectY(p.y),
    }));
    return {
      id: s.id,
      label: s.label,
      color,
      points,
      path: buildPath(points),
      finiteCount: points.length,
      totalCount: s.data?.length ?? 0,
    };
  });

  // Embedding panel.
  let e1Lo = Number.POSITIVE_INFINITY;
  let e1Hi = Number.NEGATIVE_INFINITY;
  let e2Lo = Number.POSITIVE_INFINITY;
  let e2Hi = Number.NEGATIVE_INFINITY;
  if (pca.ok) {
    for (const e of pca.embedding) {
      if (e.e1 < e1Lo) e1Lo = e.e1;
      if (e.e1 > e1Hi) e1Hi = e.e1;
      if (e.e2 < e2Lo) e2Lo = e.e2;
      if (e.e2 > e2Hi) e2Hi = e.e2;
    }
  }
  if (e1Lo === Number.POSITIVE_INFINITY) {
    e1Lo = -1;
    e1Hi = 1;
  }
  if (e2Lo === Number.POSITIVE_INFINITY) {
    e2Lo = -1;
    e2Hi = 1;
  }
  // Always include the origin (the data centroid) and add padding.
  if (e1Lo > 0) e1Lo = 0;
  if (e1Hi < 0) e1Hi = 0;
  if (e2Lo > 0) e2Lo = 0;
  if (e2Hi < 0) e2Hi = 0;
  if (e1Lo === e1Hi) {
    e1Lo -= 1;
    e1Hi += 1;
  }
  if (e2Lo === e2Hi) {
    e2Lo -= 1;
    e2Hi += 1;
  }
  const e1Pad = (e1Hi - e1Lo) * 0.08;
  const e2Pad = (e2Hi - e2Lo) * 0.08;
  e1Lo -= e1Pad;
  e1Hi += e1Pad;
  e2Lo -= e2Pad;
  e2Hi += e2Pad;
  const e1Range = e1Hi - e1Lo;
  const e2Range = e2Hi - e2Lo;
  const projectE1 = (e: number): number =>
    embeddingPanel.x + ((e - e1Lo) / e1Range) * embeddingPanel.width;
  const projectE2 = (e: number): number =>
    embeddingPanel.y +
    embeddingPanel.height -
    ((e - e2Lo) / e2Range) * embeddingPanel.height;

  const embeddingPoints: ChartLineTsneEmbeddingPoint[] = pca.ok
    ? pca.embedding.map((e, i) => {
        const denom = pca.embedding.length > 1 ? pca.embedding.length - 1 : 1;
        return {
          index: i,
          x: matrix.xs[i] ?? i,
          e1: e.e1,
          e2: e.e2,
          px: projectE1(e.e1),
          py: projectE2(e.e2),
          opacity: 0.35 + 0.65 * (i / denom),
        };
      })
    : [];
  const trajectoryPath = buildPath(embeddingPoints);

  return {
    ok: true,
    width,
    height,
    mainPanel,
    embeddingPanel,
    channels,
    embeddingPoints,
    trajectoryPath,
    pca,
    xTicks: computeTicks(xLo, xHi, tickCount),
    mainYTicks: computeTicks(yLo, yHi, tickCount),
    e1Ticks: computeTicks(e1Lo, e1Hi, tickCount),
    e2Ticks: computeTicks(e2Lo, e2Hi, tickCount),
    xMin: xLo,
    xMax: xHi,
    mainYMin: yLo,
    mainYMax: yHi,
    e1Min: e1Lo,
    e1Max: e1Hi,
    e2Min: e2Lo,
    e2Max: e2Hi,
    totalPoints,
    channelCount,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function defaultFormatEmbedding(n: number): string {
  if (!isFiniteNumber(n)) return '';
  return n.toFixed(2);
}

export function describeLineTsneChart(
  series: readonly ChartLineTsneSeries[] | null | undefined,
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const { pca } = runLineTsne(series);
  const channelText = `${series.length} channel${series.length === 1 ? '' : 's'}`;
  if (!pca.ok) {
    return `Line chart with a 2D PCA embedding side panel across ${channelText}. Embedding unavailable (need at least 2 channels and 2 shared time points).`;
  }
  const variancePct = Math.round(
    (pca.explainedVariance[0]! + pca.explainedVariance[1]!) * 100,
  );
  return `Line chart with a 2D PCA embedding side panel across ${channelText}. The embedding projects ${pca.sampleCount} time points from ${pca.dimensions} dimensions onto the top 2 principal components, capturing ${variancePct}% of the total variance.`;
}

export const ChartLineTsne = forwardRef<HTMLDivElement, ChartLineTsneProps>(
  function ChartLineTsne(
    props: ChartLineTsneProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      series,
      width = DEFAULT_CHART_LINE_TSNE_WIDTH,
      height = DEFAULT_CHART_LINE_TSNE_HEIGHT,
      padding = DEFAULT_CHART_LINE_TSNE_PADDING,
      gap = DEFAULT_CHART_LINE_TSNE_GAP,
      tickCount = DEFAULT_CHART_LINE_TSNE_TICK_COUNT,
      mainPanelRatio = DEFAULT_CHART_LINE_TSNE_MAIN_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_TSNE_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_TSNE_DOT_RADIUS,
      embeddingDotRadius = DEFAULT_CHART_LINE_TSNE_EMBEDDING_DOT_RADIUS,
      embeddingColor = DEFAULT_CHART_LINE_TSNE_EMBEDDING_COLOR,
      gridColor = DEFAULT_CHART_LINE_TSNE_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_TSNE_AXIS_COLOR,
      xMin,
      xMax,
      yMin,
      yMax,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showLegend = true,
      showTooltip = true,
      showBadge = true,
      showTrajectory = true,
      showEmbeddingDots = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a 2D PCA embedding side panel',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      formatEmbedding = defaultFormatEmbedding,
      xLabel,
      yLabel,
      onPointClick,
      onEmbeddingPointClick,
      style,
    } = props;

    const reactId = useId();
    const descId = `${reactId}-desc`;

    const layout = useMemo(
      () =>
        computeLineTsneLayout({
          series,
          width,
          height,
          padding,
          gap,
          tickCount,
          mainPanelRatio,
          ...(isFiniteNumber(xMin) ? { xMin } : {}),
          ...(isFiniteNumber(xMax) ? { xMax } : {}),
          ...(isFiniteNumber(yMin) ? { yMin } : {}),
          ...(isFiniteNumber(yMax) ? { yMax } : {}),
        }),
      [
        series,
        width,
        height,
        padding,
        gap,
        tickCount,
        mainPanelRatio,
        xMin,
        xMax,
        yMin,
        yMax,
      ],
    );

    const summary = useMemo(
      () => ariaDescription ?? describeLineTsneChart(series),
      [ariaDescription, series],
    );

    const [hover, setHover] = useState<
      | { kind: 'series'; channelId: string; pointIndex: number }
      | { kind: 'embedding'; pointIndex: number }
      | null
    >(null);
    const [tooltipPos, setTooltipPos] = useState<{
      px: number;
      py: number;
    } | null>(null);

    const clearHover = useCallback(() => {
      setHover(null);
      setTooltipPos(null);
    }, []);

    const explainedPct = useMemo(() => {
      if (!layout.pca.ok) return 0;
      return Math.round(
        (layout.pca.explainedVariance[0]! +
          layout.pca.explainedVariance[1]!) *
          100,
      );
    }, [layout.pca]);

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
          data-section="chart-line-tsne"
          data-empty="true"
          data-channel-count={layout.channelCount}
          data-sample-count={0}
          data-pca-ok="false"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-tsne-aria-desc"
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
    const originPx =
      layout.embeddingPanel.x +
      ((0 - layout.e1Min) / (layout.e1Max - layout.e1Min)) *
        layout.embeddingPanel.width;
    const originPy =
      layout.embeddingPanel.y +
      layout.embeddingPanel.height -
      ((0 - layout.e2Min) / (layout.e2Max - layout.e2Min)) *
        layout.embeddingPanel.height;

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-tsne"
        data-empty="false"
        data-channel-count={layout.channelCount}
        data-sample-count={layout.pca.sampleCount}
        data-pca-ok={layout.pca.ok ? 'true' : 'false'}
        data-explained-variance={explainedPct}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-tsne-aria-desc"
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
          data-section="chart-line-tsne-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showBadge ? (
            <div
              data-section="chart-line-tsne-badge"
              data-channel-count={layout.channelCount}
              data-sample-count={layout.pca.sampleCount}
              data-pca-ok={layout.pca.ok ? 'true' : 'false'}
              data-explained-variance={explainedPct}
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                padding: '2px 6px',
                borderRadius: 4,
                background: '#ffffffd9',
                color: embeddingColor,
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                gap: 4,
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <span
                data-section="chart-line-tsne-badge-icon"
                aria-hidden="true"
              >
                PCA
              </span>
              <span data-section="chart-line-tsne-badge-dims">
                d={layout.pca.ok ? layout.pca.dimensions : layout.channelCount}
              </span>
              <span data-section="chart-line-tsne-badge-samples">
                n={layout.pca.sampleCount}
              </span>
              <span data-section="chart-line-tsne-badge-variance">
                {layout.pca.ok ? `var=${explainedPct}%` : 'embedding n/a'}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-tsne-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-tsne-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.mainYTicks.map((t, i) => {
                  const py =
                    layout.mainPanel.y +
                    layout.mainPanel.height -
                    ((t - layout.mainYMin) /
                      (layout.mainYMax - layout.mainYMin)) *
                      layout.mainPanel.height;
                  return (
                    <line
                      key={`mgy-${i}`}
                      data-section="chart-line-tsne-grid-line"
                      data-panel="main"
                      x1={layout.mainPanel.x}
                      x2={layout.mainPanel.x + layout.mainPanel.width}
                      y1={py}
                      y2={py}
                    />
                  );
                })}
                {layout.e2Ticks.map((t, i) => {
                  const py =
                    layout.embeddingPanel.y +
                    layout.embeddingPanel.height -
                    ((t - layout.e2Min) / (layout.e2Max - layout.e2Min)) *
                      layout.embeddingPanel.height;
                  return (
                    <line
                      key={`egy-${i}`}
                      data-section="chart-line-tsne-grid-line"
                      data-panel="embedding"
                      x1={layout.embeddingPanel.x}
                      x2={
                        layout.embeddingPanel.x + layout.embeddingPanel.width
                      }
                      y1={py}
                      y2={py}
                    />
                  );
                })}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-tsne-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-tsne-axis"
                  data-panel="main"
                  data-axis="x"
                  x1={layout.mainPanel.x}
                  y1={layout.mainPanel.y + layout.mainPanel.height}
                  x2={layout.mainPanel.x + layout.mainPanel.width}
                  y2={layout.mainPanel.y + layout.mainPanel.height}
                />
                <line
                  data-section="chart-line-tsne-axis"
                  data-panel="main"
                  data-axis="y"
                  x1={layout.mainPanel.x}
                  y1={layout.mainPanel.y}
                  x2={layout.mainPanel.x}
                  y2={layout.mainPanel.y + layout.mainPanel.height}
                />
                <line
                  data-section="chart-line-tsne-axis"
                  data-panel="embedding"
                  data-axis="x"
                  x1={layout.embeddingPanel.x}
                  y1={layout.embeddingPanel.y + layout.embeddingPanel.height}
                  x2={
                    layout.embeddingPanel.x + layout.embeddingPanel.width
                  }
                  y2={layout.embeddingPanel.y + layout.embeddingPanel.height}
                />
                <line
                  data-section="chart-line-tsne-axis"
                  data-panel="embedding"
                  data-axis="y"
                  x1={layout.embeddingPanel.x}
                  y1={layout.embeddingPanel.y}
                  x2={layout.embeddingPanel.x}
                  y2={layout.embeddingPanel.y + layout.embeddingPanel.height}
                />
                <g
                  data-section="chart-line-tsne-ticks"
                  data-panel="main"
                  data-axis="x"
                >
                  {layout.xTicks.map((t, i) => {
                    const px =
                      layout.mainPanel.x +
                      ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                        layout.mainPanel.width;
                    return (
                      <g
                        key={`tx-${i}`}
                        data-section="chart-line-tsne-tick"
                        data-panel="main"
                        data-axis="x"
                      >
                        <line
                          x1={px}
                          x2={px}
                          y1={layout.mainPanel.y + layout.mainPanel.height}
                          y2={layout.mainPanel.y + layout.mainPanel.height + 4}
                        />
                        <text
                          data-section="chart-line-tsne-tick-label"
                          data-panel="main"
                          data-axis="x"
                          x={px}
                          y={layout.mainPanel.y + layout.mainPanel.height + 14}
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
                <g
                  data-section="chart-line-tsne-ticks"
                  data-panel="main"
                  data-axis="y"
                >
                  {layout.mainYTicks.map((t, i) => {
                    const py =
                      layout.mainPanel.y +
                      layout.mainPanel.height -
                      ((t - layout.mainYMin) /
                        (layout.mainYMax - layout.mainYMin)) *
                        layout.mainPanel.height;
                    return (
                      <g
                        key={`tmy-${i}`}
                        data-section="chart-line-tsne-tick"
                        data-panel="main"
                        data-axis="y"
                      >
                        <line
                          x1={layout.mainPanel.x - 4}
                          x2={layout.mainPanel.x}
                          y1={py}
                          y2={py}
                        />
                        <text
                          data-section="chart-line-tsne-tick-label"
                          data-panel="main"
                          data-axis="y"
                          x={layout.mainPanel.x - 6}
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
                <g
                  data-section="chart-line-tsne-ticks"
                  data-panel="embedding"
                  data-axis="x"
                >
                  {layout.e1Ticks.map((t, i) => {
                    const px =
                      layout.embeddingPanel.x +
                      ((t - layout.e1Min) / (layout.e1Max - layout.e1Min)) *
                        layout.embeddingPanel.width;
                    return (
                      <g
                        key={`te1-${i}`}
                        data-section="chart-line-tsne-tick"
                        data-panel="embedding"
                        data-axis="x"
                      >
                        <line
                          x1={px}
                          x2={px}
                          y1={
                            layout.embeddingPanel.y +
                            layout.embeddingPanel.height
                          }
                          y2={
                            layout.embeddingPanel.y +
                            layout.embeddingPanel.height +
                            4
                          }
                        />
                        <text
                          data-section="chart-line-tsne-tick-label"
                          data-panel="embedding"
                          data-axis="x"
                          x={px}
                          y={
                            layout.embeddingPanel.y +
                            layout.embeddingPanel.height +
                            14
                          }
                          textAnchor="middle"
                          fontSize={10}
                          fill={axisColor}
                          stroke="none"
                        >
                          {formatEmbedding(t)}
                        </text>
                      </g>
                    );
                  })}
                </g>
                {xLabel ? (
                  <text
                    data-section="chart-line-tsne-x-label"
                    x={layout.mainPanel.x + layout.mainPanel.width / 2}
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
                    data-section="chart-line-tsne-y-label"
                    transform={`rotate(-90 12 ${layout.mainPanel.y + layout.mainPanel.height / 2})`}
                    x={12}
                    y={layout.mainPanel.y + layout.mainPanel.height / 2}
                    textAnchor="middle"
                    fontSize={11}
                    fill={axisColor}
                    stroke="none"
                  >
                    {yLabel}
                  </text>
                ) : null}
                <text
                  data-section="chart-line-tsne-embedding-x-label"
                  x={
                    layout.embeddingPanel.x + layout.embeddingPanel.width / 2
                  }
                  y={height - 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  PC1
                </text>
              </g>
            ) : null}

            <g data-section="chart-line-tsne-series">
              {layout.channels.map((c) => (
                <g
                  key={c.id}
                  data-section="chart-line-tsne-series-group"
                  data-series-id={c.id}
                  data-series-color={c.color}
                  data-series-finite-count={c.finiteCount}
                  data-series-total-count={c.totalCount}
                >
                  {c.path ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${c.label} channel`}
                      data-section="chart-line-tsne-path"
                      data-series-id={c.id}
                      d={c.path}
                      fill="none"
                      stroke={c.color}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {showDots
                    ? c.points.map((p) => {
                        const isHover =
                          hover?.kind === 'series' &&
                          hover.channelId === c.id &&
                          hover.pointIndex === p.index;
                        return (
                          <circle
                            key={`d-${p.index}`}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={`${c.label} at x ${formatX(p.x)}, y ${formatValue(p.y)}`}
                            data-section="chart-line-tsne-dot"
                            data-series-id={c.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-hovered={isHover ? 'true' : 'false'}
                            cx={p.px}
                            cy={p.py}
                            r={isHover ? dotRadius + 1 : dotRadius}
                            fill={c.color}
                            stroke="#ffffff"
                            strokeWidth={1}
                            onMouseEnter={() => {
                              setHover({
                                kind: 'series',
                                channelId: c.id,
                                pointIndex: p.index,
                              });
                              setTooltipPos({ px: p.px, py: p.py });
                            }}
                            onMouseLeave={clearHover}
                            onFocus={() => {
                              setHover({
                                kind: 'series',
                                channelId: c.id,
                                pointIndex: p.index,
                              });
                              setTooltipPos({ px: p.px, py: p.py });
                            }}
                            onBlur={clearHover}
                            onClick={() =>
                              onPointClick?.({ channel: c, point: p })
                            }
                          />
                        );
                      })
                    : null}
                </g>
              ))}
            </g>

            <g data-section="chart-line-tsne-embedding">
              <line
                data-section="chart-line-tsne-embedding-origin"
                data-axis="x"
                x1={layout.embeddingPanel.x}
                x2={layout.embeddingPanel.x + layout.embeddingPanel.width}
                y1={originPy}
                y2={originPy}
                stroke={axisColor}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <line
                data-section="chart-line-tsne-embedding-origin"
                data-axis="y"
                x1={originPx}
                x2={originPx}
                y1={layout.embeddingPanel.y}
                y2={layout.embeddingPanel.y + layout.embeddingPanel.height}
                stroke={axisColor}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {showTrajectory && layout.trajectoryPath ? (
                <path
                  data-section="chart-line-tsne-embedding-trajectory"
                  d={layout.trajectoryPath}
                  fill="none"
                  stroke={embeddingColor}
                  strokeWidth={1}
                  strokeOpacity={0.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              ) : null}
              {showEmbeddingDots
                ? layout.embeddingPoints.map((p) => {
                    const isHover =
                      hover?.kind === 'embedding' &&
                      hover.pointIndex === p.index;
                    return (
                      <circle
                        key={`emb-${p.index}`}
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={`Embedded time point at x ${formatX(p.x)}: PC1 ${formatEmbedding(p.e1)}, PC2 ${formatEmbedding(p.e2)}`}
                        data-section="chart-line-tsne-embedding-point"
                        data-point-index={p.index}
                        data-x={p.x}
                        data-e1={p.e1}
                        data-e2={p.e2}
                        data-hovered={isHover ? 'true' : 'false'}
                        cx={p.px}
                        cy={p.py}
                        r={isHover ? embeddingDotRadius + 1 : embeddingDotRadius}
                        fill={embeddingColor}
                        fillOpacity={p.opacity}
                        stroke="#ffffff"
                        strokeWidth={1}
                        onMouseEnter={() => {
                          setHover({
                            kind: 'embedding',
                            pointIndex: p.index,
                          });
                          setTooltipPos({ px: p.px, py: p.py });
                        }}
                        onMouseLeave={clearHover}
                        onFocus={() => {
                          setHover({
                            kind: 'embedding',
                            pointIndex: p.index,
                          });
                          setTooltipPos({ px: p.px, py: p.py });
                        }}
                        onBlur={clearHover}
                        onClick={() =>
                          onEmbeddingPointClick?.({ point: p })
                        }
                      />
                    );
                  })
                : null}
            </g>
          </svg>

          {showTooltip && hover && tooltipPos
            ? (() => {
                if (hover.kind === 'series') {
                  const c = layout.channels.find(
                    (x) => x.id === hover.channelId,
                  );
                  const p = c?.points.find(
                    (x) => x.index === hover.pointIndex,
                  );
                  if (!c || !p) return null;
                  return (
                    <div
                      data-section="chart-line-tsne-tooltip"
                      data-tooltip-kind="series"
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
                        data-section="chart-line-tsne-tooltip-label"
                        style={{ color: c.color, fontWeight: 600 }}
                      >
                        {c.label}
                      </div>
                      <div data-section="chart-line-tsne-tooltip-x">
                        x: {formatX(p.x)}
                      </div>
                      <div data-section="chart-line-tsne-tooltip-y">
                        y: {formatValue(p.y)}
                      </div>
                    </div>
                  );
                }
                const p = layout.embeddingPoints.find(
                  (x) => x.index === hover.pointIndex,
                );
                if (!p) return null;
                return (
                  <div
                    data-section="chart-line-tsne-tooltip"
                    data-tooltip-kind="embedding"
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
                      data-section="chart-line-tsne-tooltip-label"
                      style={{ color: embeddingColor, fontWeight: 600 }}
                    >
                      Embedded point
                    </div>
                    <div data-section="chart-line-tsne-tooltip-time">
                      time x: {formatX(p.x)}
                    </div>
                    <div data-section="chart-line-tsne-tooltip-pc1">
                      PC1: {formatEmbedding(p.e1)}
                    </div>
                    <div data-section="chart-line-tsne-tooltip-pc2">
                      PC2: {formatEmbedding(p.e2)}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-tsne-legend"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 8,
              alignItems: 'center',
            }}
          >
            {layout.channels.map((c) => (
              <span
                key={c.id}
                data-section="chart-line-tsne-legend-item"
                data-series-id={c.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  data-section="chart-line-tsne-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: c.color,
                  }}
                />
                <span data-section="chart-line-tsne-legend-label">
                  {c.label}
                </span>
              </span>
            ))}
            <span
              data-section="chart-line-tsne-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.pca.ok
                ? `2D PCA embedding: ${layout.pca.sampleCount} points, ${explainedPct}% variance`
                : 'embedding unavailable'}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineTsne.displayName = 'ChartLineTsne';
