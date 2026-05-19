import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_NORMALIZE_WIDTH = 560;
export const DEFAULT_CHART_LINE_NORMALIZE_HEIGHT = 320;
export const DEFAULT_CHART_LINE_NORMALIZE_PADDING = 40;
export const DEFAULT_CHART_LINE_NORMALIZE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_NORMALIZE_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_NORMALIZE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_NORMALIZE_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_NORMALIZE_BASELINE_DASH = '4 3';
export const DEFAULT_CHART_LINE_NORMALIZE_BASELINE_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_NORMALIZE_INDEX_BASE = 100;
export const DEFAULT_CHART_LINE_NORMALIZE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_NORMALIZE_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_NORMALIZE_PALETTE = [
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

export type ChartLineNormalizeMode = 'first' | 'value' | 'min';
export const DEFAULT_CHART_LINE_NORMALIZE_MODE: ChartLineNormalizeMode = 'first';
export const ALL_CHART_LINE_NORMALIZE_MODES: readonly ChartLineNormalizeMode[] = [
  'first',
  'value',
  'min',
];

export interface ChartLineNormalizePoint {
  x: number;
  y: number;
}

export interface ChartLineNormalizeSeries {
  id: string;
  label: string;
  data: readonly ChartLineNormalizePoint[];
  color?: string;
  referenceX?: number;
  mode?: ChartLineNormalizeMode;
}

export interface ChartLineNormalizeLayoutPoint {
  index: number;
  x: number;
  y: number;
  normalized: number;
  percentChange: number;
  px: number;
  py: number;
}

export interface ChartLineNormalizeStats {
  reference: number | null;
  ok: boolean;
  finalNormalized: number;
  finalPercentChange: number;
  maxNormalized: number;
  minNormalized: number;
  maxPercentChange: number;
  minPercentChange: number;
  finiteCount: number;
}

export interface ChartLineNormalizeLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  mode: ChartLineNormalizeMode;
  points: ChartLineNormalizeLayoutPoint[];
  path: string;
  stats: ChartLineNormalizeStats;
  reference: number | null;
  referenceOk: boolean;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineNormalizeLayoutResult {
  series: ChartLineNormalizeLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  baselineY: number;
  indexBase: number;
  innerWidth: number;
  innerHeight: number;
  totalPoints: number;
  visibleSeriesCount: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineNormalizePoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineNormalizePoint).x) &&
    isFiniteNumber((p as ChartLineNormalizePoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineNormalizeDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_NORMALIZE_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_NORMALIZE_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_NORMALIZE_PALETTE.length
  ]!;
}

export function getLineNormalizeFinitePoints(
  points: readonly ChartLineNormalizePoint[],
): ChartLineNormalizePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Resolves the y value at a specific reference x via linear
 * interpolation between bracketing samples. The input is expected
 * to be sorted by x ascending. Returns `null` when the input is
 * empty / non-array / the reference x is non-finite. When the
 * reference x falls outside the range, clamps to the nearest
 * endpoint.
 */
export function resolveLineNormalizeYAtX(
  points: readonly ChartLineNormalizePoint[] | undefined | null,
  referenceX: number,
): number | null {
  if (!Array.isArray(points) || points.length === 0) return null;
  if (!isFiniteNumber(referenceX)) return null;
  const sorted = points.filter(isFinitePoint).slice().sort((a, b) => a.x - b.x);
  if (sorted.length === 0) return null;
  if (referenceX <= sorted[0]!.x) return sorted[0]!.y;
  if (referenceX >= sorted[sorted.length - 1]!.x)
    return sorted[sorted.length - 1]!.y;
  // Find the bracketing segment.
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (referenceX === a.x) return a.y;
    if (a.x < referenceX && referenceX <= b.x) {
      if (b.x === a.x) return a.y;
      const t = (referenceX - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
  }
  return sorted[sorted.length - 1]!.y;
}

/**
 * Returns the reference y value used for normalization, based on the
 * requested mode. Returns `null` when no reference can be derived
 * (empty input, non-finite samples, no anchor x supplied for 'value'
 * mode, etc).
 *
 * - `'first'`: y of the first sample in x-sorted order.
 * - `'min'`: minimum finite y across all samples.
 * - `'value'`: y interpolated at `referenceX` (clamped to endpoints
 *   when outside the range).
 */
export function findLineNormalizeReference(
  points: readonly ChartLineNormalizePoint[] | undefined | null,
  mode: ChartLineNormalizeMode,
  referenceX?: number,
): number | null {
  if (!Array.isArray(points) || points.length === 0) return null;
  const finite = points.filter(isFinitePoint);
  if (finite.length === 0) return null;
  const sorted = finite.slice().sort((a, b) => a.x - b.x);
  if (mode === 'first') return sorted[0]!.y;
  if (mode === 'min') {
    let m = sorted[0]!.y;
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i]!.y < m) m = sorted[i]!.y;
    }
    return m;
  }
  if (mode === 'value') {
    if (!isFiniteNumber(referenceX)) return null;
    return resolveLineNormalizeYAtX(sorted, referenceX);
  }
  return null;
}

/**
 * Normalises every finite sample to a common index basis, returning
 * `{normalized: ChartLineNormalizePoint[], reference, ok}`. Each
 * output `y` is `(raw_y / reference) * indexBase`. When `reference`
 * is `null` or `0` the helper returns `{normalized: [], reference,
 * ok: false}` (impossible to rebase).
 *
 * Non-finite samples are dropped before normalization.
 * Non-array input -> `{normalized: [], reference: null, ok: false}`.
 */
export function normalizeLineNormalizeSeries(
  points: readonly ChartLineNormalizePoint[] | undefined | null,
  mode: ChartLineNormalizeMode,
  indexBase: number,
  referenceX?: number,
): {
  normalized: ChartLineNormalizePoint[];
  reference: number | null;
  ok: boolean;
} {
  if (!Array.isArray(points)) {
    return { normalized: [], reference: null, ok: false };
  }
  const reference = findLineNormalizeReference(points, mode, referenceX);
  const safeBase = isFiniteNumber(indexBase)
    ? indexBase
    : DEFAULT_CHART_LINE_NORMALIZE_INDEX_BASE;
  if (reference === null || reference === 0) {
    return { normalized: [], reference, ok: false };
  }
  const out: ChartLineNormalizePoint[] = [];
  for (const p of points) {
    if (!isFinitePoint(p)) continue;
    out.push({ x: p.x, y: (p.y / reference) * safeBase });
  }
  return { normalized: out, reference, ok: true };
}

export function computeLineNormalizeStats(
  points: readonly ChartLineNormalizeLayoutPoint[],
  reference: number | null,
  ok: boolean,
  indexBase: number,
): ChartLineNormalizeStats {
  if (!ok || points.length === 0) {
    return {
      reference,
      ok,
      finalNormalized: 0,
      finalPercentChange: 0,
      maxNormalized: 0,
      minNormalized: 0,
      maxPercentChange: 0,
      minPercentChange: 0,
      finiteCount: 0,
    };
  }
  let max = -Infinity;
  let min = Infinity;
  let maxPct = -Infinity;
  let minPct = Infinity;
  for (const p of points) {
    if (p.normalized > max) max = p.normalized;
    if (p.normalized < min) min = p.normalized;
    if (p.percentChange > maxPct) maxPct = p.percentChange;
    if (p.percentChange < minPct) minPct = p.percentChange;
  }
  const last = points[points.length - 1]!;
  return {
    reference,
    ok,
    finalNormalized: last.normalized,
    finalPercentChange: last.percentChange,
    maxNormalized: max === -Infinity ? indexBase : max,
    minNormalized: min === Infinity ? indexBase : min,
    maxPercentChange: maxPct === -Infinity ? 0 : maxPct,
    minPercentChange: minPct === Infinity ? 0 : minPct,
    finiteCount: points.length,
  };
}

export interface ComputeLineNormalizeLayoutInput {
  series: readonly ChartLineNormalizeSeries[];
  mode?: ChartLineNormalizeMode;
  indexBase?: number;
  referenceX?: number;
  hiddenSeries?: ReadonlySet<string> | null;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineNormalizeLayout(
  input: ComputeLineNormalizeLayoutInput,
): ComputeLineNormalizeLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const indexBase = isFiniteNumber(input.indexBase)
    ? input.indexBase
    : DEFAULT_CHART_LINE_NORMALIZE_INDEX_BASE;
  const defaultMode = input.mode ?? DEFAULT_CHART_LINE_NORMALIZE_MODE;
  const defaultRefX = input.referenceX;
  const empty: ComputeLineNormalizeLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    baselineY: 0,
    indexBase,
    innerWidth,
    innerHeight,
    totalPoints: 0,
    visibleSeriesCount: 0,
  };
  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const seriesArr = Array.isArray(input.series) ? input.series : [];
  if (seriesArr.length === 0) return empty;
  const hidden = input.hiddenSeries ?? null;
  const visible = seriesArr.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return empty;

  // Pre-normalise each series so we know the y range over the
  // normalised values.
  const intermediates: {
    s: ChartLineNormalizeSeries;
    originalIndex: number;
    mode: ChartLineNormalizeMode;
    reference: number | null;
    ok: boolean;
    normalized: ChartLineNormalizePoint[];
  }[] = [];

  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const mode = s.mode ?? defaultMode;
    const refX =
      isFiniteNumber(s.referenceX) && mode === 'value'
        ? s.referenceX
        : defaultRefX;
    const result = normalizeLineNormalizeSeries(
      s.data ?? [],
      mode,
      indexBase,
      refX,
    );
    intermediates.push({
      s,
      originalIndex: i,
      mode,
      reference: result.reference,
      ok: result.ok,
      normalized: result.normalized,
    });
    for (const p of result.normalized) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      any = true;
    }
  }
  // Always include indexBase so the baseline line is visible.
  if (indexBase < yMin) yMin = indexBase;
  if (indexBase > yMax) yMax = indexBase;
  if (!any) {
    xMin = 0;
    xMax = 1;
    yMin = indexBase - 0.5;
    yMax = indexBase + 0.5;
  }
  if (xMin === Number.POSITIVE_INFINITY) {
    xMin = 0;
    xMax = 1;
  }
  if (isFiniteNumber(input.xMin)) xMin = input.xMin;
  if (isFiniteNumber(input.xMax)) xMax = input.xMax;
  if (isFiniteNumber(input.yMin)) yMin = input.yMin;
  if (isFiniteNumber(input.yMax)) yMax = input.yMax;
  if (xMax < xMin) [xMin, xMax] = [xMax, xMin];
  if (yMax < yMin) [yMin, yMax] = [yMax, yMin];
  if (xMin === xMax) {
    xMin -= 0.5;
    xMax += 0.5;
  }
  if (yMin === yMax) {
    yMin -= 0.5;
    yMax += 0.5;
  }
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;
  const xToPx = (x: number): number =>
    padding + ((x - xMin) / xRange) * innerWidth;
  const yToPx = (y: number): number =>
    padding + innerHeight - ((y - yMin) / yRange) * innerHeight;
  const baselineY = yToPx(indexBase);

  const layoutSeries: ChartLineNormalizeLayoutSeries[] = [];
  let totalPoints = 0;
  for (const it of intermediates) {
    const points: ChartLineNormalizeLayoutPoint[] = [];
    if (it.ok) {
      // Walk the original-array order so adopters that pre-sorted by
      // x keep their order in the layout. Re-derive normalised value
      // index by indexing into the `normalized` array, which mirrors
      // the order of finite samples encountered.
      let nIdx = 0;
      const arr = Array.isArray(it.s.data) ? it.s.data : [];
      for (let j = 0; j < arr.length; j += 1) {
        const raw = arr[j]!;
        if (!isFinitePoint(raw)) continue;
        const normY = it.normalized[nIdx]!.y;
        nIdx += 1;
        const percent =
          indexBase === 0 ? 0 : ((normY - indexBase) / indexBase) * 100;
        points.push({
          index: j,
          x: raw.x,
          y: raw.y,
          normalized: normY,
          percentChange: percent,
          px: xToPx(raw.x),
          py: yToPx(normY),
        });
      }
    }
    let path = '';
    if (points.length > 0) {
      path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
      for (let j = 1; j < points.length; j += 1) {
        path += ` L ${fmt(points[j]!.px)} ${fmt(points[j]!.py)}`;
      }
    }
    const stats = computeLineNormalizeStats(
      points,
      it.reference,
      it.ok,
      indexBase,
    );
    totalPoints += points.length;
    layoutSeries.push({
      id: it.s.id,
      label: it.s.label,
      index: it.originalIndex,
      color: it.s.color ?? getLineNormalizeDefaultColor(it.originalIndex),
      mode: it.mode,
      points,
      path,
      stats,
      reference: it.reference,
      referenceOk: it.ok,
      finiteCount: points.length,
      totalCount: Array.isArray(it.s.data) ? it.s.data.length : 0,
    });
  }

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_NORMALIZE_TICK_COUNT;
  const stepCount = Math.max(2, Math.floor(tickCount));
  const xTicks: { value: number; position: number }[] = [];
  for (let i = 0; i < stepCount; i += 1) {
    const value = xMin + (xRange * i) / (stepCount - 1);
    xTicks.push({
      value,
      position: padding + ((value - xMin) / xRange) * innerWidth,
    });
  }
  const yTicks: { value: number; position: number }[] = [];
  for (let i = 0; i < stepCount; i += 1) {
    const value = yMin + (yRange * i) / (stepCount - 1);
    yTicks.push({
      value,
      position:
        padding + innerHeight - ((value - yMin) / yRange) * innerHeight,
    });
  }

  return {
    series: layoutSeries,
    xTicks,
    yTicks,
    xMin,
    xMax,
    yMin,
    yMax,
    baselineY,
    indexBase,
    innerWidth,
    innerHeight,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

export function describeLineNormalizeChart(
  series: readonly ChartLineNormalizeSeries[] | undefined | null,
  indexBase: number = DEFAULT_CHART_LINE_NORMALIZE_INDEX_BASE,
  mode: ChartLineNormalizeMode = DEFAULT_CHART_LINE_NORMALIZE_MODE,
  hidden?: ReadonlySet<string>,
  formatValue?: (n: number) => string,
  referenceX?: number,
): string {
  if (!series || !Array.isArray(series) || series.length === 0)
    return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  const visible = series.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return 'No data';
  let any = false;
  let totalPoints = 0;
  const parts: string[] = [];
  for (const s of visible) {
    const sMode = s.mode ?? mode;
    const refX =
      isFiniteNumber(s.referenceX) && sMode === 'value'
        ? s.referenceX
        : referenceX;
    const result = normalizeLineNormalizeSeries(
      s.data ?? [],
      sMode,
      indexBase,
      refX,
    );
    if (!result.ok) continue;
    any = true;
    totalPoints += result.normalized.length;
    const last = result.normalized[result.normalized.length - 1]!;
    const pct = indexBase === 0 ? 0 : ((last.y - indexBase) / indexBase) * 100;
    parts.push(
      `${s.label}: final ${fmtV(last.y)} (${pct >= 0 ? '+' : ''}${fmtV(pct)}%, ref ${fmtV(result.reference as number)})`,
    );
  }
  if (!any) return 'No data';
  return `Normalised line chart (index ${fmtV(indexBase)}) across ${visible.length} series (${totalPoints} points). ${parts.join('; ')}.`;
}

export interface ChartLineNormalizePointClick {
  series: ChartLineNormalizeLayoutSeries;
  point: ChartLineNormalizeLayoutPoint;
}

export interface ChartLineNormalizeProps {
  series: readonly ChartLineNormalizeSeries[];
  indexBase?: number;
  mode?: ChartLineNormalizeMode;
  referenceX?: number;
  baselineLabel?: string;
  hiddenSeries?: ReadonlySet<string>;
  defaultHiddenSeries?: ReadonlySet<string>;
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  lineOpacity?: number;
  baselineDashArray?: string;
  baselineColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showBaseline?: boolean;
  showBaselineLabel?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatPercent?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineNormalizePointClick) => void;
  style?: CSSProperties;
}

export const ChartLineNormalize = forwardRef(function ChartLineNormalize(
  {
    series,
    indexBase = DEFAULT_CHART_LINE_NORMALIZE_INDEX_BASE,
    mode = DEFAULT_CHART_LINE_NORMALIZE_MODE,
    referenceX,
    baselineLabel = 'Base',
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_NORMALIZE_WIDTH,
    height = DEFAULT_CHART_LINE_NORMALIZE_HEIGHT,
    padding = DEFAULT_CHART_LINE_NORMALIZE_PADDING,
    tickCount = DEFAULT_CHART_LINE_NORMALIZE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_NORMALIZE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_NORMALIZE_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_NORMALIZE_LINE_OPACITY,
    baselineDashArray = DEFAULT_CHART_LINE_NORMALIZE_BASELINE_DASH,
    baselineColor = DEFAULT_CHART_LINE_NORMALIZE_BASELINE_COLOR,
    gridColor = DEFAULT_CHART_LINE_NORMALIZE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_NORMALIZE_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showBaseline = true,
    showBaselineLabel = true,
    animate = true,
    className,
    ariaLabel = 'Normalised line chart',
    ariaDescription,
    formatValue,
    formatX,
    formatPercent,
    xLabel,
    yLabel,
    onPointClick,
    style,
  }: ChartLineNormalizeProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const reactId = useId();
  const ariaDescId = `${reactId}-desc`;
  const fmtValue = useCallback(
    (n: number) => (formatValue ? formatValue(n) : String(n)),
    [formatValue],
  );
  const fmtX = useCallback(
    (n: number) => (formatX ? formatX(n) : String(n)),
    [formatX],
  );
  const fmtPct = useCallback(
    (n: number) =>
      formatPercent
        ? formatPercent(n)
        : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`,
    [formatPercent],
  );

  const [internalHidden, setInternalHidden] = useState<ReadonlySet<string>>(
    defaultHiddenSeries ?? new Set<string>(),
  );
  const hidden: ReadonlySet<string> =
    hiddenSeries !== undefined ? hiddenSeries : internalHidden;

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineNormalizeLayout({
        series,
        mode,
        indexBase,
        ...(referenceX !== undefined ? { referenceX } : {}),
        hiddenSeries: hidden,
        ...(xMin !== undefined ? { xMin } : {}),
        ...(xMax !== undefined ? { xMax } : {}),
        ...(yMin !== undefined ? { yMin } : {}),
        ...(yMax !== undefined ? { yMax } : {}),
        width,
        height,
        padding,
        tickCount,
      }),
    [
      series,
      mode,
      indexBase,
      referenceX,
      hidden,
      xMin,
      xMax,
      yMin,
      yMax,
      width,
      height,
      padding,
      tickCount,
    ],
  );

  const description =
    ariaDescription ??
    describeLineNormalizeChart(
      series,
      indexBase,
      mode,
      hidden,
      fmtValue,
      referenceX,
    );

  const toggleSeries = useCallback(
    (s: ChartLineNormalizeSeries) => {
      const next = new Set(hidden);
      if (next.has(s.id)) next.delete(s.id);
      else next.add(s.id);
      if (hiddenSeries === undefined) setInternalHidden(next);
      if (onHiddenSeriesChange) onHiddenSeriesChange(next);
    },
    [hidden, hiddenSeries, onHiddenSeriesChange],
  );

  const rootClass = [
    'relative inline-block w-full max-w-full text-xs text-slate-700',
    animate ? 'motion-safe:animate-fade-in' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={ariaDescId}
      data-section="chart-line-normalize"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-index-base={indexBase}
      data-mode={mode}
      data-reference-x={
        isFiniteNumber(referenceX) ? String(referenceX) : ''
      }
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-normalize-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-normalize-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-normalize-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-normalize-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-normalize-grid-line"
                  data-axis="x"
                  data-tick-value={t.value}
                  x1={t.position}
                  y1={padding}
                  x2={t.position}
                  y2={padding + layout.innerHeight}
                  stroke={gridColor}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                />
              ))}
              {layout.yTicks.map((t) => (
                <line
                  key={`grid-y-${t.value}`}
                  data-section="chart-line-normalize-grid-line"
                  data-axis="y"
                  data-tick-value={t.value}
                  x1={padding}
                  y1={t.position}
                  x2={padding + layout.innerWidth}
                  y2={t.position}
                  stroke={gridColor}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-normalize-axes">
              <line
                data-section="chart-line-normalize-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-normalize-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-normalize-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-normalize-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.position}
                        y1={padding + layout.innerHeight}
                        x2={t.position}
                        y2={padding + layout.innerHeight + 4}
                        stroke={axisColor}
                        strokeWidth={1}
                      />
                      <text
                        data-section="chart-line-normalize-tick-label"
                        data-axis="x"
                        data-tick-value={t.value}
                        x={t.position}
                        y={padding + layout.innerHeight + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill="currentColor"
                      >
                        {fmtX(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              ) : null}
              {layout.yTicks.length > 0 ? (
                <g data-section="chart-line-normalize-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-normalize-tick"
                      data-axis="y"
                    >
                      <line
                        x1={padding}
                        y1={t.position}
                        x2={padding - 4}
                        y2={t.position}
                        stroke={axisColor}
                        strokeWidth={1}
                      />
                      <text
                        data-section="chart-line-normalize-tick-label"
                        data-axis="y"
                        data-tick-value={t.value}
                        x={padding - 6}
                        y={t.position + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill="currentColor"
                      >
                        {fmtValue(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              ) : null}
              {xLabel ? (
                <text
                  data-section="chart-line-normalize-x-label"
                  x={padding + layout.innerWidth / 2}
                  y={padding + layout.innerHeight + 30}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                >
                  {xLabel}
                </text>
              ) : null}
              {yLabel ? (
                <text
                  data-section="chart-line-normalize-y-label"
                  x={padding - 30}
                  y={padding + layout.innerHeight / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  transform={`rotate(-90 ${padding - 30} ${padding + layout.innerHeight / 2})`}
                >
                  {yLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          {/* Baseline horizontal rule at indexBase */}
          {showBaseline ? (
            <g data-section="chart-line-normalize-baseline">
              <line
                data-section="chart-line-normalize-baseline-line"
                data-index-base={indexBase}
                data-baseline-y={layout.baselineY}
                role="graphics-symbol"
                aria-label={`${baselineLabel}: ${fmtValue(indexBase)}`}
                x1={padding}
                y1={layout.baselineY}
                x2={padding + layout.innerWidth}
                y2={layout.baselineY}
                stroke={baselineColor}
                strokeDasharray={baselineDashArray}
                strokeWidth={1.5}
              />
              {showBaselineLabel ? (
                <text
                  data-section="chart-line-normalize-baseline-label"
                  data-index-base={indexBase}
                  x={padding + layout.innerWidth - 6}
                  y={layout.baselineY - 4}
                  textAnchor="end"
                  fontSize={10}
                  fill={baselineColor}
                  style={{ pointerEvents: 'none' }}
                >
                  {baselineLabel}: {fmtValue(indexBase)}
                </text>
              ) : null}
            </g>
          ) : null}

          {/* Series lines + dots */}
          <g data-section="chart-line-normalize-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-normalize-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-mode={s.mode}
                  data-series-reference={
                    s.reference === null ? '' : String(s.reference)
                  }
                  data-series-reference-ok={s.referenceOk ? 'true' : 'false'}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-final-normalized={s.stats.finalNormalized}
                  data-series-final-percent={s.stats.finalPercentChange}
                  data-series-max-normalized={s.stats.maxNormalized}
                  data-series-min-normalized={s.stats.minNormalized}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  {s.path ? (
                    <path
                      data-section="chart-line-normalize-path"
                      data-series-id={s.id}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label}: normalised line with ${s.finiteCount} points`}
                      d={s.path}
                      fill="none"
                      stroke={s.color}
                      strokeOpacity={dim}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {showDots
                    ? s.points.map((p) => {
                        const key = `${s.id}::${p.index}`;
                        const isHovered = hoveredKey === key;
                        const opacity =
                          isAnyHovered && !isHovered ? 0.3 : 1;
                        const aria = `${s.label}: x=${fmtX(p.x)}, raw=${fmtValue(p.y)}, normalised=${fmtValue(p.normalized)}, ${fmtPct(p.percentChange)} from base`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-normalize-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-normalized={p.normalized}
                            data-percent={p.percentChange}
                            data-hovered={isHovered ? 'true' : 'false'}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={aria}
                            cx={p.px}
                            cy={p.py}
                            r={isHovered ? dotRadius + 1 : dotRadius}
                            fill={s.color}
                            fillOpacity={opacity}
                            stroke={s.color}
                            strokeWidth={1}
                            onMouseEnter={() => setHoveredKey(key)}
                            onMouseLeave={() => setHoveredKey(null)}
                            onFocus={() => setHoveredKey(key)}
                            onBlur={() => setHoveredKey(null)}
                            onClick={() => {
                              if (onPointClick) {
                                onPointClick({ series: s, point: p });
                              }
                            }}
                          />
                        );
                      })
                    : null}
                </g>
              );
            })}
          </g>
        </svg>

        {showTooltip && hoveredKey ? (() => {
          const sep = hoveredKey.indexOf('::');
          if (sep < 0) return null;
          const sid = hoveredKey.slice(0, sep);
          const idx = Number(hoveredKey.slice(sep + 2));
          const s = layout.series.find((x) => x.id === sid);
          if (!s) return null;
          const p = s.points.find((x) => x.index === idx);
          if (!p) return null;
          const tx = Math.min(Math.max(p.px + 8, 0), width - 220);
          const ty = Math.min(Math.max(p.py - 72, 0), height - 110);
          const pctColor =
            p.percentChange > 0
              ? '#16a34a'
              : p.percentChange < 0
                ? '#dc2626'
                : 'inherit';
          return (
            <div
              data-section="chart-line-normalize-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 min-w-[200px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-normalize-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-normalize-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-normalize-tooltip-raw"
                className="text-slate-500"
              >
                raw: {fmtValue(p.y)}
              </div>
              <div
                data-section="chart-line-normalize-tooltip-normalized"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                index: {fmtValue(p.normalized)}
              </div>
              <div
                data-section="chart-line-normalize-tooltip-percent"
                style={{ color: pctColor }}
              >
                {fmtPct(p.percentChange)} from base
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-normalize-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            const visEntry = layout.series.find((ls) => ls.id === s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-normalize-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-normalize-legend-button"
                  data-series-id={s.id}
                  aria-pressed={!isHidden}
                  onClick={() => toggleSeries(s)}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5',
                    isHidden ? 'opacity-50' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span
                    data-section="chart-line-normalize-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineNormalizeDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-normalize-legend-label">
                    {s.label}
                  </span>
                  {visEntry && visEntry.referenceOk ? (
                    <span
                      data-section="chart-line-normalize-legend-stats"
                      className="text-slate-500"
                    >
                      ({fmtPct(visEntry.stats.finalPercentChange)})
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

ChartLineNormalize.displayName = 'ChartLineNormalize';
