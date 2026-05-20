import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_SPEARMAN_WIDTH = 560;
export const DEFAULT_CHART_LINE_SPEARMAN_HEIGHT = 320;
export const DEFAULT_CHART_LINE_SPEARMAN_PADDING = 48;
export const DEFAULT_CHART_LINE_SPEARMAN_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SPEARMAN_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_SPEARMAN_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SPEARMAN_STRONG_THRESHOLD = 0.7;
export const DEFAULT_CHART_LINE_SPEARMAN_MODERATE_THRESHOLD = 0.4;
export const DEFAULT_CHART_LINE_SPEARMAN_WEAK_THRESHOLD = 0.2;
export const DEFAULT_CHART_LINE_SPEARMAN_PRIMARY_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SPEARMAN_SECONDARY_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SPEARMAN_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SPEARMAN_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SPEARMAN_NEUTRAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_SPEARMAN_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SPEARMAN_AXIS_COLOR = '#cbd5e1';

export type ChartLineSpearmanStrength =
  | 'strong'
  | 'moderate'
  | 'weak'
  | 'none';

export type ChartLineSpearmanDirection =
  | 'positive'
  | 'negative'
  | 'neutral';

export interface ChartLineSpearmanPoint {
  x: number;
  y: number;
}

export interface ChartLineSpearmanSeries {
  id: string;
  label: string;
  data: readonly ChartLineSpearmanPoint[];
  color?: string;
}

export interface ChartLineSpearmanPair {
  x: number;
  ya: number;
  yb: number;
  indexA: number;
  indexB: number;
}

export interface ChartLineSpearmanResult {
  rho: number;
  ok: boolean;
  pairCount: number;
  strength: ChartLineSpearmanStrength;
  direction: ChartLineSpearmanDirection;
  hasTies: boolean;
}

export interface ChartLineSpearmanLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineSpearmanLayoutSeries {
  id: string;
  label: string;
  role: 'primary' | 'secondary';
  axis: 'left' | 'right';
  color: string;
  points: ChartLineSpearmanLayoutPoint[];
  path: string;
  finiteCount: number;
  totalCount: number;
  yMin: number;
  yMax: number;
}

export interface ChartLineSpearmanLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: { x: number; y: number; width: number; height: number };
  primary: ChartLineSpearmanLayoutSeries | null;
  secondary: ChartLineSpearmanLayoutSeries | null;
  spearman: ChartLineSpearmanResult;
  xTicks: { value: number; px: number }[];
  leftYTicks: { value: number; py: number }[];
  rightYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  primaryYMin: number;
  primaryYMax: number;
  secondaryYMin: number;
  secondaryYMax: number;
  totalPoints: number;
}

export interface ComputeLineSpearmanLayoutOptions {
  primary: ChartLineSpearmanSeries | null;
  secondary: ChartLineSpearmanSeries | null;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  strongThreshold?: number;
  moderateThreshold?: number;
  weakThreshold?: number;
  primaryColor?: string;
  secondaryColor?: string;
  xMin?: number;
  xMax?: number;
  primaryYMin?: number;
  primaryYMax?: number;
  secondaryYMin?: number;
  secondaryYMax?: number;
}

export interface ChartLineSpearmanProps {
  primary: ChartLineSpearmanSeries | null;
  secondary: ChartLineSpearmanSeries | null;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  strongThreshold?: number;
  moderateThreshold?: number;
  weakThreshold?: number;
  primaryColor?: string;
  secondaryColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  neutralColor?: string;
  gridColor?: string;
  axisColor?: string;
  xMin?: number;
  xMax?: number;
  primaryYMin?: number;
  primaryYMax?: number;
  secondaryYMin?: number;
  secondaryYMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showBadge?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatRho?: (n: number) => string;
  xLabel?: string;
  primaryYLabel?: string;
  secondaryYLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineSpearmanLayoutSeries;
    point: ChartLineSpearmanLayoutPoint;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isFinitePoint(p: unknown): p is ChartLineSpearmanPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineSpearmanPoint).x) &&
    isFiniteNumber((p as ChartLineSpearmanPoint).y)
  );
}

export function getLineSpearmanFinitePoints(
  points: readonly ChartLineSpearmanPoint[] | null | undefined,
): ChartLineSpearmanPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Assign **ranks** to a set of values, smallest = rank 1. Tied values
 * receive the *average* of the ranks they span (the "midrank"
 * convention), so a Spearman correlation built on these ranks is the
 * correct tie-corrected coefficient.
 *
 * Example: `[10, 20, 20, 30]` -> `[1, 2.5, 2.5, 4]` (the two 20s span
 * ranks 2 and 3, averaged to 2.5).
 *
 * Returns ranks in the original input order. Empty input -> `[]`.
 */
export function computeRanks(
  values: readonly number[] | null | undefined,
): number[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  const n = values.length;
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n).fill(0);
  let k = 0;
  while (k < n) {
    let j = k;
    while (j + 1 < n && indexed[j + 1]!.v === indexed[k]!.v) {
      j += 1;
    }
    // sorted positions k..j map to 1-based ranks (k+1)..(j+1)
    const avgRank = (k + 1 + (j + 1)) / 2;
    for (let m = k; m <= j; m += 1) {
      ranks[indexed[m]!.i] = avgRank;
    }
    k = j + 1;
  }
  return ranks;
}

function hasTiedValues(values: readonly number[]): boolean {
  return new Set(values).size !== values.length;
}

/**
 * Pairs two series by **exact x match**. One entry per shared x value
 * where both series have a finite sample; `indexA` / `indexB`
 * reference positions in the original input arrays. Non-array /
 * empty / no-overlap inputs -> `[]`.
 */
export function pairLineSpearmanByX(
  a: ChartLineSpearmanSeries | undefined | null,
  b: ChartLineSpearmanSeries | undefined | null,
): ChartLineSpearmanPair[] {
  if (!a || !b) return [];
  const arrA = Array.isArray(a.data) ? a.data : [];
  const arrB = Array.isArray(b.data) ? b.data : [];
  if (arrA.length === 0 || arrB.length === 0) return [];
  const mapA = new Map<number, { y: number; index: number }>();
  for (let i = 0; i < arrA.length; i += 1) {
    const p = arrA[i]!;
    if (!isFinitePoint(p)) continue;
    if (!mapA.has(p.x)) mapA.set(p.x, { y: p.y, index: i });
  }
  if (mapA.size === 0) return [];
  const out: ChartLineSpearmanPair[] = [];
  for (let i = 0; i < arrB.length; i += 1) {
    const p = arrB[i]!;
    if (!isFinitePoint(p)) continue;
    const hit = mapA.get(p.x);
    if (!hit) continue;
    out.push({ x: p.x, ya: hit.y, yb: p.y, indexA: hit.index, indexB: i });
  }
  out.sort((p, q) => p.x - q.x);
  return out;
}

/**
 * **Spearman rank correlation** (Spearman's rho) between paired
 * `(ya, yb)` observations.
 *
 * Spearman's rho is the Pearson correlation of the *ranks* of the two
 * variables:
 *
 *   1. Convert each variable's values to ranks (`computeRanks`, with
 *      midranks for ties).
 *   2. Compute the Pearson correlation of the rank pairs.
 *
 * Because it works on ranks, Spearman measures **monotonic**
 * association of any shape -- not just linear -- and is robust to
 * outliers (ranks compress extreme values). For tie-free data this
 * equals the classic `1 - 6 * sum(d^2) / (n * (n^2 - 1))` formula.
 *
 * Returns `ok = false` (rho NaN) when fewer than 2 pairs, or when
 * either variable is constant (zero rank variance).
 */
export function computeSpearmanCorrelation(
  pairs: readonly ChartLineSpearmanPair[],
): { rho: number; ok: boolean; hasTies: boolean } {
  const n = pairs.length;
  if (n < 2) return { rho: Number.NaN, ok: false, hasTies: false };
  const ya = pairs.map((p) => p.ya);
  const yb = pairs.map((p) => p.yb);
  const hasTies = hasTiedValues(ya) || hasTiedValues(yb);
  const ranksA = computeRanks(ya);
  const ranksB = computeRanks(yb);
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i += 1) {
    sumA += ranksA[i]!;
    sumB += ranksB[i]!;
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const da = ranksA[i]! - meanA;
    const db = ranksB[i]! - meanB;
    sxy += da * db;
    sxx += da * da;
    syy += db * db;
  }
  if (sxx === 0 || syy === 0) {
    return { rho: Number.NaN, ok: false, hasTies };
  }
  let rho = sxy / Math.sqrt(sxx * syy);
  if (rho > 1) rho = 1;
  if (rho < -1) rho = -1;
  return { rho, ok: true, hasTies };
}

/**
 * Classifies `|rho|` into a qualitative strength bucket using the
 * canonical thresholds (strong 0.7 / moderate 0.4 / weak 0.2).
 * Non-finite rho -> 'none'.
 */
export function classifyLineSpearmanStrength(
  rho: number,
  strongThreshold: number = DEFAULT_CHART_LINE_SPEARMAN_STRONG_THRESHOLD,
  moderateThreshold: number = DEFAULT_CHART_LINE_SPEARMAN_MODERATE_THRESHOLD,
  weakThreshold: number = DEFAULT_CHART_LINE_SPEARMAN_WEAK_THRESHOLD,
): ChartLineSpearmanStrength {
  if (!isFiniteNumber(rho)) return 'none';
  const strong = isFiniteNumber(strongThreshold)
    ? strongThreshold
    : DEFAULT_CHART_LINE_SPEARMAN_STRONG_THRESHOLD;
  const moderate = isFiniteNumber(moderateThreshold)
    ? moderateThreshold
    : DEFAULT_CHART_LINE_SPEARMAN_MODERATE_THRESHOLD;
  const weak = isFiniteNumber(weakThreshold)
    ? weakThreshold
    : DEFAULT_CHART_LINE_SPEARMAN_WEAK_THRESHOLD;
  const abs = Math.abs(rho);
  if (abs >= strong) return 'strong';
  if (abs >= moderate) return 'moderate';
  if (abs >= weak) return 'weak';
  return 'none';
}

export function classifyLineSpearmanDirection(
  rho: number,
): ChartLineSpearmanDirection {
  if (!isFiniteNumber(rho)) return 'neutral';
  if (rho > 0) return 'positive';
  if (rho < 0) return 'negative';
  return 'neutral';
}

export function computeLineSpearman(
  primary: ChartLineSpearmanSeries | undefined | null,
  secondary: ChartLineSpearmanSeries | undefined | null,
  strongThreshold?: number,
  moderateThreshold?: number,
  weakThreshold?: number,
): ChartLineSpearmanResult {
  const pairs = pairLineSpearmanByX(primary, secondary);
  const { rho, ok, hasTies } = computeSpearmanCorrelation(pairs);
  return {
    rho: ok ? rho : Number.NaN,
    ok,
    pairCount: pairs.length,
    strength: classifyLineSpearmanStrength(
      rho,
      strongThreshold,
      moderateThreshold,
      weakThreshold,
    ),
    direction: classifyLineSpearmanDirection(rho),
    hasTies,
  };
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

export function computeLineSpearmanLayout(
  options: ComputeLineSpearmanLayoutOptions,
): ChartLineSpearmanLayout {
  const {
    primary,
    secondary,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_SPEARMAN_TICK_COUNT,
    strongThreshold,
    moderateThreshold,
    weakThreshold,
    primaryColor = DEFAULT_CHART_LINE_SPEARMAN_PRIMARY_COLOR,
    secondaryColor = DEFAULT_CHART_LINE_SPEARMAN_SECONDARY_COLOR,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    primaryYMin: aMinOverride,
    primaryYMax: aMaxOverride,
    secondaryYMin: bMinOverride,
    secondaryYMax: bMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const spearman = computeLineSpearman(
    primary,
    secondary,
    strongThreshold,
    moderateThreshold,
    weakThreshold,
  );
  const panel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };
  const empty: ChartLineSpearmanLayout = {
    ok: false,
    width,
    height,
    panel,
    primary: null,
    secondary: null,
    spearman,
    xTicks: [],
    leftYTicks: [],
    rightYTicks: [],
    xMin: 0,
    xMax: 1,
    primaryYMin: 0,
    primaryYMax: 1,
    secondaryYMin: 0,
    secondaryYMax: 1,
    totalPoints: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const primaryFinite = getLineSpearmanFinitePoints(primary?.data);
  const secondaryFinite = getLineSpearmanFinitePoints(secondary?.data);
  if (primaryFinite.length === 0 && secondaryFinite.length === 0) {
    return empty;
  }

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let aLo = Number.POSITIVE_INFINITY;
  let aHi = Number.NEGATIVE_INFINITY;
  let bLo = Number.POSITIVE_INFINITY;
  let bHi = Number.NEGATIVE_INFINITY;

  for (const p of primaryFinite) {
    if (p.x < xLo) xLo = p.x;
    if (p.x > xHi) xHi = p.x;
    if (p.y < aLo) aLo = p.y;
    if (p.y > aHi) aHi = p.y;
  }
  for (const p of secondaryFinite) {
    if (p.x < xLo) xLo = p.x;
    if (p.x > xHi) xHi = p.x;
    if (p.y < bLo) bLo = p.y;
    if (p.y > bHi) bHi = p.y;
  }
  if (aLo === Number.POSITIVE_INFINITY) {
    aLo = 0;
    aHi = 1;
  }
  if (bLo === Number.POSITIVE_INFINITY) {
    bLo = 0;
    bHi = 1;
  }

  if (isFiniteNumber(xMinOverride)) xLo = xMinOverride;
  if (isFiniteNumber(xMaxOverride)) xHi = xMaxOverride;
  if (isFiniteNumber(aMinOverride)) aLo = aMinOverride;
  if (isFiniteNumber(aMaxOverride)) aHi = aMaxOverride;
  if (isFiniteNumber(bMinOverride)) bLo = bMinOverride;
  if (isFiniteNumber(bMaxOverride)) bHi = bMaxOverride;

  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (aLo === aHi) {
    aLo -= 0.5;
    aHi += 0.5;
  }
  if (bLo === bHi) {
    bLo -= 0.5;
    bHi += 0.5;
  }

  const xRange = xHi - xLo;
  const aRange = aHi - aLo;
  const bRange = bHi - bLo;
  const xToPx = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const aToPy = (y: number): number =>
    panel.y + panel.height - ((y - aLo) / aRange) * panel.height;
  const bToPy = (y: number): number =>
    panel.y + panel.height - ((y - bLo) / bRange) * panel.height;

  const buildSeries = (
    s: ChartLineSpearmanSeries | null | undefined,
    role: 'primary' | 'secondary',
    axis: 'left' | 'right',
    fallbackColor: string,
    yToPy: (y: number) => number,
    yMin: number,
    yMax: number,
  ): ChartLineSpearmanLayoutSeries | null => {
    if (!s) return null;
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineSpearmanLayoutPoint[] = [];
    for (let j = 0; j < arr.length; j += 1) {
      const p = arr[j]!;
      if (!isFinitePoint(p)) continue;
      points.push({
        index: j,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPy(p.y),
      });
    }
    return {
      id: s.id,
      label: s.label,
      role,
      axis,
      color: s.color ?? fallbackColor,
      points,
      path: buildPath(points),
      finiteCount: points.length,
      totalCount: arr.length,
      yMin,
      yMax,
    };
  };

  const primaryLayout = buildSeries(
    primary,
    'primary',
    'left',
    primaryColor,
    aToPy,
    aLo,
    aHi,
  );
  const secondaryLayout = buildSeries(
    secondary,
    'secondary',
    'right',
    secondaryColor,
    bToPy,
    bLo,
    bHi,
  );

  return {
    ok: true,
    width,
    height,
    panel,
    primary: primaryLayout,
    secondary: secondaryLayout,
    spearman,
    xTicks: computeTicks(xLo, xHi, tickCount).map((value) => ({
      value,
      px: xToPx(value),
    })),
    leftYTicks: computeTicks(aLo, aHi, tickCount).map((value) => ({
      value,
      py: aToPy(value),
    })),
    rightYTicks: computeTicks(bLo, bHi, tickCount).map((value) => ({
      value,
      py: bToPy(value),
    })),
    xMin: xLo,
    xMax: xHi,
    primaryYMin: aLo,
    primaryYMax: aHi,
    secondaryYMin: bLo,
    secondaryYMax: bHi,
    totalPoints:
      (primaryLayout?.finiteCount ?? 0) +
      (secondaryLayout?.finiteCount ?? 0),
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function defaultFormatRho(n: number): string {
  if (!isFiniteNumber(n)) return 'n/a';
  return n.toFixed(3);
}

export function describeLineSpearmanChart(
  primary: ChartLineSpearmanSeries | undefined | null,
  secondary: ChartLineSpearmanSeries | undefined | null,
  formatRho?: (n: number) => string,
): string {
  if (!primary && !secondary) return 'No data';
  const fmt = formatRho ?? defaultFormatRho;
  const result = computeLineSpearman(primary, secondary);
  const pieces: string[] = [];
  if (primary) {
    const n = getLineSpearmanFinitePoints(primary.data).length;
    pieces.push(`${primary.label} (left axis, ${n} points)`);
  }
  if (secondary) {
    const n = getLineSpearmanFinitePoints(secondary.data).length;
    pieces.push(`${secondary.label} (right axis, ${n} points)`);
  }
  if (pieces.length === 0) return 'No data';
  if (!result.ok) {
    return `Dual-axis Spearman rank-correlation chart: ${pieces.join(' and ')}. No rank correlation computable (need at least 2 paired finite samples with non-constant values).`;
  }
  const ties = result.hasTies ? ', ties present' : '';
  return `Dual-axis Spearman rank-correlation chart: ${pieces.join(' and ')}. Spearman rho = ${fmt(result.rho)} (${result.strength} ${result.direction}) across ${result.pairCount} paired samples${ties}.`;
}

export const ChartLineSpearman = forwardRef<
  HTMLDivElement,
  ChartLineSpearmanProps
>(function ChartLineSpearman(
  props: ChartLineSpearmanProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    primary,
    secondary,
    width = DEFAULT_CHART_LINE_SPEARMAN_WIDTH,
    height = DEFAULT_CHART_LINE_SPEARMAN_HEIGHT,
    padding = DEFAULT_CHART_LINE_SPEARMAN_PADDING,
    tickCount = DEFAULT_CHART_LINE_SPEARMAN_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SPEARMAN_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SPEARMAN_DOT_RADIUS,
    strongThreshold = DEFAULT_CHART_LINE_SPEARMAN_STRONG_THRESHOLD,
    moderateThreshold = DEFAULT_CHART_LINE_SPEARMAN_MODERATE_THRESHOLD,
    weakThreshold = DEFAULT_CHART_LINE_SPEARMAN_WEAK_THRESHOLD,
    primaryColor = DEFAULT_CHART_LINE_SPEARMAN_PRIMARY_COLOR,
    secondaryColor = DEFAULT_CHART_LINE_SPEARMAN_SECONDARY_COLOR,
    positiveColor = DEFAULT_CHART_LINE_SPEARMAN_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_SPEARMAN_NEGATIVE_COLOR,
    neutralColor = DEFAULT_CHART_LINE_SPEARMAN_NEUTRAL_COLOR,
    gridColor = DEFAULT_CHART_LINE_SPEARMAN_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_SPEARMAN_AXIS_COLOR,
    xMin,
    xMax,
    primaryYMin,
    primaryYMax,
    secondaryYMin,
    secondaryYMax,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showLegend = true,
    showTooltip = true,
    showBadge = true,
    animate = true,
    className,
    ariaLabel = 'Dual-axis line chart with Spearman rank-correlation badge',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    formatRho = defaultFormatRho,
    xLabel,
    primaryYLabel,
    secondaryYLabel,
    onPointClick,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const layout = useMemo(
    () =>
      computeLineSpearmanLayout({
        primary,
        secondary,
        width,
        height,
        padding,
        tickCount,
        strongThreshold,
        moderateThreshold,
        weakThreshold,
        primaryColor,
        secondaryColor,
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(primaryYMin) ? { primaryYMin } : {}),
        ...(isFiniteNumber(primaryYMax) ? { primaryYMax } : {}),
        ...(isFiniteNumber(secondaryYMin) ? { secondaryYMin } : {}),
        ...(isFiniteNumber(secondaryYMax) ? { secondaryYMax } : {}),
      }),
    [
      primary,
      secondary,
      width,
      height,
      padding,
      tickCount,
      strongThreshold,
      moderateThreshold,
      weakThreshold,
      primaryColor,
      secondaryColor,
      xMin,
      xMax,
      primaryYMin,
      primaryYMax,
      secondaryYMin,
      secondaryYMax,
    ],
  );

  const summary = useMemo(
    () => ariaDescription ?? describeLineSpearmanChart(primary, secondary, formatRho),
    [ariaDescription, primary, secondary, formatRho],
  );

  const [hoverPayload, setHoverPayload] = useState<{
    role: 'primary' | 'secondary';
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

  const directionColor =
    layout.spearman.direction === 'positive'
      ? positiveColor
      : layout.spearman.direction === 'negative'
        ? negativeColor
        : neutralColor;

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
        data-section="chart-line-spearman"
        data-empty="true"
        data-pair-count={0}
        data-spearman-ok="false"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-spearman-aria-desc"
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
  const seriesList = [layout.primary, layout.secondary].filter(
    (s): s is ChartLineSpearmanLayoutSeries => s !== null,
  );

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-spearman"
      data-empty="false"
      data-total-points={layout.totalPoints}
      data-pair-count={layout.spearman.pairCount}
      data-spearman-ok={layout.spearman.ok ? 'true' : 'false'}
      data-rho={isFiniteNumber(layout.spearman.rho) ? layout.spearman.rho : ''}
      data-strength={layout.spearman.strength}
      data-direction={layout.spearman.direction}
      data-has-ties={layout.spearman.hasTies ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-spearman-aria-desc"
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
        data-section="chart-line-spearman-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showBadge ? (
          <div
            data-section="chart-line-spearman-badge"
            data-rho={
              isFiniteNumber(layout.spearman.rho) ? layout.spearman.rho : ''
            }
            data-strength={layout.spearman.strength}
            data-direction={layout.spearman.direction}
            data-pair-count={layout.spearman.pairCount}
            data-has-ties={layout.spearman.hasTies ? 'true' : 'false'}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: directionColor,
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-spearman-badge-icon"
              aria-hidden="true"
            >
              SR
            </span>
            <span data-section="chart-line-spearman-badge-rho">
              rho={formatRho(layout.spearman.rho)}
            </span>
            <span data-section="chart-line-spearman-badge-strength">
              {layout.spearman.strength} {layout.spearman.direction}
            </span>
            <span data-section="chart-line-spearman-badge-pairs">
              n={layout.spearman.pairCount}
            </span>
            {layout.spearman.hasTies ? (
              <span data-section="chart-line-spearman-badge-ties">ties</span>
            ) : null}
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-spearman-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-spearman-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.leftYTicks.map((t, i) => (
                <line
                  key={`gy-${i}`}
                  data-section="chart-line-spearman-grid-line"
                  data-axis="y"
                  x1={layout.panel.x}
                  x2={layout.panel.x + layout.panel.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.xTicks.map((t, i) => (
                <line
                  key={`gx-${i}`}
                  data-section="chart-line-spearman-grid-line"
                  data-axis="x"
                  x1={t.px}
                  x2={t.px}
                  y1={layout.panel.y}
                  y2={layout.panel.y + layout.panel.height}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-spearman-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-spearman-axis"
                data-axis="x"
                x1={layout.panel.x}
                y1={layout.panel.y + layout.panel.height}
                x2={layout.panel.x + layout.panel.width}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-spearman-axis"
                data-axis="left"
                x1={layout.panel.x}
                y1={layout.panel.y}
                x2={layout.panel.x}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-spearman-axis"
                data-axis="right"
                x1={layout.panel.x + layout.panel.width}
                y1={layout.panel.y}
                x2={layout.panel.x + layout.panel.width}
                y2={layout.panel.y + layout.panel.height}
              />
              <g data-section="chart-line-spearman-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`tx-${i}`}
                    data-section="chart-line-spearman-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={layout.panel.y + layout.panel.height}
                      y2={layout.panel.y + layout.panel.height + 4}
                    />
                    <text
                      data-section="chart-line-spearman-tick-label"
                      data-axis="x"
                      x={t.px}
                      y={layout.panel.y + layout.panel.height + 14}
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
              <g data-section="chart-line-spearman-ticks" data-axis="left">
                {layout.leftYTicks.map((t, i) => (
                  <g
                    key={`tl-${i}`}
                    data-section="chart-line-spearman-tick"
                    data-axis="left"
                  >
                    <line
                      x1={layout.panel.x - 4}
                      x2={layout.panel.x}
                      y1={t.py}
                      y2={t.py}
                    />
                    <text
                      data-section="chart-line-spearman-tick-label"
                      data-axis="left"
                      x={layout.panel.x - 6}
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
              <g data-section="chart-line-spearman-ticks" data-axis="right">
                {layout.rightYTicks.map((t, i) => (
                  <g
                    key={`tr-${i}`}
                    data-section="chart-line-spearman-tick"
                    data-axis="right"
                  >
                    <line
                      x1={layout.panel.x + layout.panel.width}
                      x2={layout.panel.x + layout.panel.width + 4}
                      y1={t.py}
                      y2={t.py}
                    />
                    <text
                      data-section="chart-line-spearman-tick-label"
                      data-axis="right"
                      x={layout.panel.x + layout.panel.width + 6}
                      y={t.py + 3}
                      textAnchor="start"
                      fontSize={10}
                      fill={axisColor}
                      stroke="none"
                    >
                      {formatValue(t.value)}
                    </text>
                  </g>
                ))}
              </g>
              {xLabel ? (
                <text
                  data-section="chart-line-spearman-x-label"
                  x={layout.panel.x + layout.panel.width / 2}
                  y={height - 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {xLabel}
                </text>
              ) : null}
              {primaryYLabel ? (
                <text
                  data-section="chart-line-spearman-y-label"
                  data-axis="left"
                  transform={`rotate(-90 12 ${layout.panel.y + layout.panel.height / 2})`}
                  x={12}
                  y={layout.panel.y + layout.panel.height / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {primaryYLabel}
                </text>
              ) : null}
              {secondaryYLabel ? (
                <text
                  data-section="chart-line-spearman-y-label"
                  data-axis="right"
                  transform={`rotate(90 ${width - 12} ${layout.panel.y + layout.panel.height / 2})`}
                  x={width - 12}
                  y={layout.panel.y + layout.panel.height / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {secondaryYLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          <g data-section="chart-line-spearman-series">
            {seriesList.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-spearman-series-group"
                data-series-id={s.id}
                data-role={s.role}
                data-axis={s.axis}
                data-series-color={s.color}
                data-series-finite-count={s.finiteCount}
                data-series-total-count={s.totalCount}
              >
                {s.path ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} (${s.axis} axis)`}
                    data-section="chart-line-spearman-path"
                    data-series-id={s.id}
                    data-role={s.role}
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
                        hoverPayload?.role === s.role &&
                        hoverPayload?.pointIndex === p.index;
                      return (
                        <circle
                          key={`d-${p.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)}, y ${formatValue(p.y)}`}
                          data-section="chart-line-spearman-dot"
                          data-series-id={s.id}
                          data-role={s.role}
                          data-point-index={p.index}
                          data-x={p.x}
                          data-y={p.y}
                          data-hovered={isHover ? 'true' : 'false'}
                          cx={p.px}
                          cy={p.py}
                          r={isHover ? dotRadius + 1 : dotRadius}
                          fill={s.color}
                          stroke="#ffffff"
                          strokeWidth={1}
                          onMouseEnter={() => {
                            setHoverPayload({
                              role: s.role,
                              pointIndex: p.index,
                            });
                            setTooltipPos({ px: p.px, py: p.py });
                          }}
                          onMouseLeave={clearHover}
                          onFocus={() => {
                            setHoverPayload({
                              role: s.role,
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
              const s = seriesList.find((x) => x.role === hoverPayload.role);
              if (!s) return null;
              const p = s.points.find(
                (x) => x.index === hoverPayload.pointIndex,
              );
              if (!p) return null;
              return (
                <div
                  data-section="chart-line-spearman-tooltip"
                  data-role={s.role}
                  data-point-index={p.index}
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
                    data-section="chart-line-spearman-tooltip-label"
                    style={{ color: s.color, fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-spearman-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div data-section="chart-line-spearman-tooltip-y">
                    y: {formatValue(p.y)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-spearman-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          {seriesList.map((s) => (
            <span
              key={s.id}
              data-section="chart-line-spearman-legend-item"
              data-series-id={s.id}
              data-role={s.role}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                data-section="chart-line-spearman-legend-swatch"
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: s.color,
                }}
              />
              <span data-section="chart-line-spearman-legend-label">
                {s.label} ({s.axis})
              </span>
            </span>
          ))}
          <span
            data-section="chart-line-spearman-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            Spearman rho {formatRho(layout.spearman.rho)} ({layout.spearman.pairCount} pairs)
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineSpearman.displayName = 'ChartLineSpearman';
