import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_WIDTH = 560;
export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_HEIGHT = 320;
export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_PADDING = 40;
export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_ENVELOPE_WIDTH = 1;
export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_BAND_OPACITY = 0.16;
export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_ENVELOPE_OPACITY = 0.55;
export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_ENVELOPE_DASH = '4 3';
export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_WINDOW = 5;
export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_PALETTE = [
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

export type ChartLineRollingMinMaxMode = 'trailing' | 'centered' | 'edge';
export const DEFAULT_CHART_LINE_ROLLING_MIN_MAX_MODE: ChartLineRollingMinMaxMode =
  'trailing';
export const ALL_CHART_LINE_ROLLING_MIN_MAX_MODES: readonly ChartLineRollingMinMaxMode[] =
  ['trailing', 'centered', 'edge'];

export interface ChartLineRollingMinMaxPoint {
  x: number;
  y: number;
}

export interface ChartLineRollingMinMaxSeries {
  id: string;
  label: string;
  data: readonly ChartLineRollingMinMaxPoint[];
  color?: string;
  bandColor?: string;
  window?: number;
  mode?: ChartLineRollingMinMaxMode;
}

export interface RollingMinMaxEntry {
  min: number | null;
  max: number | null;
}

export interface ChartLineRollingMinMaxLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  min: number | null;
  max: number | null;
  pyMin: number | null;
  pyMax: number | null;
}

export interface ChartLineRollingMinMaxLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  bandColor: string;
  window: number;
  mode: ChartLineRollingMinMaxMode;
  points: ChartLineRollingMinMaxLayoutPoint[];
  path: string;
  minPath: string;
  maxPath: string;
  bandPaths: string[];
  validCount: number;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineRollingMinMaxLayoutResult {
  series: ChartLineRollingMinMaxLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  totalPoints: number;
  visibleSeriesCount: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineRollingMinMaxPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineRollingMinMaxPoint).x) &&
    isFiniteNumber((p as ChartLineRollingMinMaxPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineRollingMinMaxDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_ROLLING_MIN_MAX_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_ROLLING_MIN_MAX_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_ROLLING_MIN_MAX_PALETTE.length
  ]!;
}

export function getLineRollingMinMaxFinitePoints(
  points: readonly ChartLineRollingMinMaxPoint[],
): ChartLineRollingMinMaxPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/** Validates window; non-finite / <1 -> 1. Fractional inputs floored. */
export function normaliseLineRollingMinMaxWindow(window: unknown): number {
  if (!isFiniteNumber(window)) return 1;
  const w = Math.floor(window);
  if (w < 1) return 1;
  return w;
}

/**
 * Computes the per-index rolling min and max of a numeric sequence.
 *
 * Each output entry is `{min, max}` with either `null` (window cannot
 * be filled at that index per mode) or the min/max over the window.
 * Non-finite values are skipped within a window. If every value in a
 * window is non-finite, both `min` and `max` are `null` for that
 * index.
 *
 * Modes mirror the moving-average primitive (11.513):
 *
 * - `trailing` (default): window `[i - W + 1, i]`, valid `i >= W-1`.
 * - `centered`: window `[i - half, i + (W - 1 - half)]`, valid when
 *   both ends fit. `half = floor((W - 1) / 2)`.
 * - `edge`: same as trailing but the leading positions take the
 *   available partial window.
 *
 * `window <= 0` / non-finite / non-numeric -> `1` (each entry equals
 * its own value).
 */
export function computeRollingMinMax(
  values: readonly number[] | undefined | null,
  window: number,
  mode: ChartLineRollingMinMaxMode = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_MODE,
): RollingMinMaxEntry[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const w = normaliseLineRollingMinMaxWindow(window);
  const out: RollingMinMaxEntry[] = new Array(n)
    .fill(null)
    .map(() => ({ min: null, max: null }));
  if (n === 0) return out;
  const half = Math.floor((w - 1) / 2);
  for (let i = 0; i < n; i += 1) {
    let lo: number;
    let hi: number;
    if (mode === 'centered') {
      lo = i - half;
      hi = i + (w - 1 - half);
      if (lo < 0 || hi >= n) continue;
    } else if (mode === 'edge') {
      lo = Math.max(0, i - w + 1);
      hi = i;
    } else {
      lo = i - w + 1;
      hi = i;
      if (lo < 0) continue;
    }
    let minV = Number.POSITIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    let any = false;
    for (let j = lo; j <= hi; j += 1) {
      const v = values[j]!;
      if (!isFiniteNumber(v)) continue;
      any = true;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    if (any) {
      out[i] = { min: minV, max: maxV };
    }
  }
  return out;
}

/**
 * Walks a list of `{px, pyMin, pyMax}` entries and builds one closed
 * band polygon per run of consecutive entries where both `pyMin` and
 * `pyMax` are finite. Returns an array of `d` strings (one path per
 * run). Single-entry runs yield no polygon (degenerate area).
 */
export function buildLineRollingMinMaxBandPaths(
  points: readonly {
    px: number;
    pyMin: number | null;
    pyMax: number | null;
  }[],
): string[] {
  if (!Array.isArray(points) || points.length === 0) return [];
  const runs: typeof points[] = [];
  let current: typeof points[number][] = [];
  for (const p of points) {
    if (
      isFiniteNumber(p.px) &&
      isFiniteNumber(p.pyMin) &&
      isFiniteNumber(p.pyMax)
    ) {
      current.push(p);
    } else {
      if (current.length > 0) runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  const out: string[] = [];
  for (const run of runs) {
    if (run.length < 2) continue;
    let d = `M ${fmt(run[0]!.px)} ${fmt(run[0]!.pyMax as number)}`;
    for (let i = 1; i < run.length; i += 1) {
      d += ` L ${fmt(run[i]!.px)} ${fmt(run[i]!.pyMax as number)}`;
    }
    for (let i = run.length - 1; i >= 0; i -= 1) {
      d += ` L ${fmt(run[i]!.px)} ${fmt(run[i]!.pyMin as number)}`;
    }
    d += ' Z';
    out.push(d);
  }
  return out;
}

/**
 * Walks a list of `{px, py}` entries and builds an `M ... L ...`
 * path that breaks at `null` / non-finite py (gap rendering).
 */
export function buildLineRollingMinMaxEnvelopePath(
  points: readonly { px: number; py: number | null }[],
): string {
  if (!Array.isArray(points) || points.length === 0) return '';
  const parts: string[] = [];
  let inRun = false;
  for (const p of points) {
    if (
      p.py === null ||
      !isFiniteNumber(p.py) ||
      !isFiniteNumber(p.px)
    ) {
      inRun = false;
      continue;
    }
    if (!inRun) {
      parts.push(`M ${fmt(p.px)} ${fmt(p.py)}`);
      inRun = true;
    } else {
      parts.push(`L ${fmt(p.px)} ${fmt(p.py)}`);
    }
  }
  return parts.join(' ');
}

export interface ComputeLineRollingMinMaxLayoutInput {
  series: readonly ChartLineRollingMinMaxSeries[];
  window?: number;
  mode?: ChartLineRollingMinMaxMode;
  hiddenSeries?: ReadonlySet<string> | null;
  showBand?: boolean;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineRollingMinMaxLayout(
  input: ComputeLineRollingMinMaxLayoutInput,
): ComputeLineRollingMinMaxLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const empty: ComputeLineRollingMinMaxLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
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
  const defaultWindow = normaliseLineRollingMinMaxWindow(
    input.window ?? DEFAULT_CHART_LINE_ROLLING_MIN_MAX_WINDOW,
  );
  const defaultMode =
    input.mode ?? DEFAULT_CHART_LINE_ROLLING_MIN_MAX_MODE;
  const wantBand = input.showBand !== false;

  const intermediates: {
    s: ChartLineRollingMinMaxSeries;
    originalIndex: number;
    finite: ChartLineRollingMinMaxPoint[];
    rolling: RollingMinMaxEntry[];
    window: number;
    mode: ChartLineRollingMinMaxMode;
  }[] = [];

  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const finite = getLineRollingMinMaxFinitePoints(s.data ?? []);
    const w = normaliseLineRollingMinMaxWindow(s.window ?? defaultWindow);
    const mode = s.mode ?? defaultMode;
    const rolling = computeRollingMinMax(
      finite.map((p) => p.y),
      w,
      mode,
    );
    intermediates.push({
      s,
      originalIndex: i,
      finite,
      rolling,
      window: w,
      mode,
    });
    for (let j = 0; j < finite.length; j += 1) {
      const p = finite[j]!;
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      any = true;
      const r = rolling[j]!;
      if (r.min !== null && r.min < yMin) yMin = r.min;
      if (r.max !== null && r.max > yMax) yMax = r.max;
    }
  }
  if (!any) {
    xMin = 0;
    xMax = 1;
    yMin = 0;
    yMax = 1;
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

  const layoutSeries: ChartLineRollingMinMaxLayoutSeries[] = [];
  let totalPoints = 0;
  for (const it of intermediates) {
    const s = it.s;
    const color =
      s.color ?? getLineRollingMinMaxDefaultColor(it.originalIndex);
    const bandColor = s.bandColor ?? color;
    const points: ChartLineRollingMinMaxLayoutPoint[] = [];
    let validCount = 0;
    for (let j = 0; j < it.finite.length; j += 1) {
      const p = it.finite[j]!;
      const r = it.rolling[j]!;
      const px = xToPx(p.x);
      const py = yToPx(p.y);
      const pyMin = r.min !== null ? yToPx(r.min) : null;
      const pyMax = r.max !== null ? yToPx(r.max) : null;
      if (r.min !== null && r.max !== null) validCount += 1;
      points.push({
        index: j,
        x: p.x,
        y: p.y,
        px,
        py,
        min: r.min,
        max: r.max,
        pyMin,
        pyMax,
      });
    }
    let path = '';
    if (points.length > 0) {
      path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
      for (let j = 1; j < points.length; j += 1) {
        path += ` L ${fmt(points[j]!.px)} ${fmt(points[j]!.py)}`;
      }
    }
    const minPath = buildLineRollingMinMaxEnvelopePath(
      points.map((p) => ({ px: p.px, py: p.pyMin })),
    );
    const maxPath = buildLineRollingMinMaxEnvelopePath(
      points.map((p) => ({ px: p.px, py: p.pyMax })),
    );
    const bandPaths = wantBand
      ? buildLineRollingMinMaxBandPaths(
          points.map((p) => ({
            px: p.px,
            pyMin: p.pyMin,
            pyMax: p.pyMax,
          })),
        )
      : [];
    totalPoints += points.length;
    layoutSeries.push({
      id: s.id,
      label: s.label,
      index: it.originalIndex,
      color,
      bandColor,
      window: it.window,
      mode: it.mode,
      points,
      path,
      minPath,
      maxPath,
      bandPaths,
      validCount,
      finiteCount: points.length,
      totalCount: Array.isArray(s.data) ? s.data.length : 0,
    });
  }

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_ROLLING_MIN_MAX_TICK_COUNT;
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
    innerWidth,
    innerHeight,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

export function describeLineRollingMinMaxChart(
  series: readonly ChartLineRollingMinMaxSeries[] | undefined | null,
  windowSize: number = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_WINDOW,
  mode: ChartLineRollingMinMaxMode = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_MODE,
  hidden?: ReadonlySet<string>,
): string {
  if (!series || !Array.isArray(series) || series.length === 0)
    return 'No data';
  const visible = series.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return 'No data';
  let any = false;
  let totalPoints = 0;
  const parts: string[] = [];
  for (const s of visible) {
    const finite = getLineRollingMinMaxFinitePoints(s.data ?? []);
    if (finite.length === 0) continue;
    any = true;
    totalPoints += finite.length;
    const w = normaliseLineRollingMinMaxWindow(s.window ?? windowSize);
    const m = s.mode ?? mode;
    parts.push(`${s.label}: window ${w}, mode ${m}`);
  }
  if (!any) return 'No data';
  return `Rolling min/max envelope chart across ${visible.length} series (${totalPoints} points). ${parts.join('; ')}.`;
}

export interface ChartLineRollingMinMaxPointClick {
  series: ChartLineRollingMinMaxLayoutSeries;
  point: ChartLineRollingMinMaxLayoutPoint;
}

export interface ChartLineRollingMinMaxProps {
  series: readonly ChartLineRollingMinMaxSeries[];
  window?: number;
  mode?: ChartLineRollingMinMaxMode;
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
  envelopeStrokeWidth?: number;
  dotRadius?: number;
  lineOpacity?: number;
  bandOpacity?: number;
  envelopeOpacity?: number;
  envelopeDashArray?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showBand?: boolean;
  showEnvelope?: boolean;
  showLine?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineRollingMinMaxPointClick) => void;
  style?: CSSProperties;
}

export const ChartLineRollingMinMax = forwardRef(function ChartLineRollingMinMax(
  {
    series = [],
    window: chartWindow = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_WINDOW,
    mode = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_MODE,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_WIDTH,
    height = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_HEIGHT,
    padding = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_PADDING,
    tickCount = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_STROKE_WIDTH,
    envelopeStrokeWidth = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_ENVELOPE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_LINE_OPACITY,
    bandOpacity = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_BAND_OPACITY,
    envelopeOpacity = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_ENVELOPE_OPACITY,
    envelopeDashArray = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_ENVELOPE_DASH,
    gridColor = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ROLLING_MIN_MAX_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showBand = true,
    showEnvelope = true,
    showLine = true,
    animate = true,
    className,
    ariaLabel = 'Rolling min/max envelope chart',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    style,
  }: ChartLineRollingMinMaxProps,
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

  const [internalHidden, setInternalHidden] = useState<ReadonlySet<string>>(
    defaultHiddenSeries ?? new Set<string>(),
  );
  const hidden: ReadonlySet<string> =
    hiddenSeries !== undefined ? hiddenSeries : internalHidden;

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineRollingMinMaxLayout({
        series,
        window: chartWindow,
        mode,
        hiddenSeries: hidden,
        showBand,
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
      chartWindow,
      mode,
      hidden,
      showBand,
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
    describeLineRollingMinMaxChart(series, chartWindow, mode, hidden);

  const toggleSeries = useCallback(
    (s: ChartLineRollingMinMaxSeries) => {
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
      data-section="chart-line-rolling-min-max"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-window={chartWindow}
      data-mode={mode}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-rolling-min-max-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-rolling-min-max-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-rolling-min-max-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-rolling-min-max-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-rolling-min-max-grid-line"
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
                  data-section="chart-line-rolling-min-max-grid-line"
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

          {/* Band polygons beneath the line. */}
          {showBand ? (
            <g data-section="chart-line-rolling-min-max-bands">
              {layout.series.map((s) =>
                s.bandPaths.map((d, i) => (
                  <path
                    key={`band-${s.id}-${i}`}
                    data-section="chart-line-rolling-min-max-band"
                    data-series-id={s.id}
                    data-band-index={i}
                    role="graphics-symbol"
                    aria-label={`${s.label}: rolling min/max envelope band`}
                    d={d}
                    fill={s.bandColor}
                    fillOpacity={bandOpacity}
                    stroke="none"
                  />
                )),
              )}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-rolling-min-max-axes">
              <line
                data-section="chart-line-rolling-min-max-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-rolling-min-max-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g
                  data-section="chart-line-rolling-min-max-ticks"
                  data-axis="x"
                >
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-rolling-min-max-tick"
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
                        data-section="chart-line-rolling-min-max-tick-label"
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
                <g
                  data-section="chart-line-rolling-min-max-ticks"
                  data-axis="y"
                >
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-rolling-min-max-tick"
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
                        data-section="chart-line-rolling-min-max-tick-label"
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
                  data-section="chart-line-rolling-min-max-x-label"
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
                  data-section="chart-line-rolling-min-max-y-label"
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

          <g data-section="chart-line-rolling-min-max-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              const dimEnvelope =
                isAnyHovered && !isSeriesHovered
                  ? 0.2
                  : envelopeOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-rolling-min-max-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-band-color={s.bandColor}
                  data-series-window={s.window}
                  data-series-mode={s.mode}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-valid-count={s.validCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  {showEnvelope && s.maxPath ? (
                    <path
                      data-section="chart-line-rolling-min-max-envelope"
                      data-series-id={s.id}
                      data-envelope-kind="max"
                      role="graphics-symbol"
                      aria-label={`${s.label}: rolling max envelope`}
                      d={s.maxPath}
                      fill="none"
                      stroke={s.color}
                      strokeOpacity={dimEnvelope}
                      strokeWidth={envelopeStrokeWidth}
                      strokeDasharray={envelopeDashArray}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {showEnvelope && s.minPath ? (
                    <path
                      data-section="chart-line-rolling-min-max-envelope"
                      data-series-id={s.id}
                      data-envelope-kind="min"
                      role="graphics-symbol"
                      aria-label={`${s.label}: rolling min envelope`}
                      d={s.minPath}
                      fill="none"
                      stroke={s.color}
                      strokeOpacity={dimEnvelope}
                      strokeWidth={envelopeStrokeWidth}
                      strokeDasharray={envelopeDashArray}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {showLine && s.path ? (
                    <path
                      data-section="chart-line-rolling-min-max-path"
                      data-series-id={s.id}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label}: raw line with ${s.finiteCount} points`}
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
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)}${
                          p.min !== null && p.max !== null
                            ? `, rolling min ${fmtValue(p.min)}, rolling max ${fmtValue(p.max)}`
                            : ''
                        }`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-rolling-min-max-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-rolling-min={
                              p.min === null ? '' : String(p.min)
                            }
                            data-rolling-max={
                              p.max === null ? '' : String(p.max)
                            }
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
          const ty = Math.min(Math.max(p.py - 80, 0), height - 116);
          return (
            <div
              data-section="chart-line-rolling-min-max-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 min-w-[200px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-rolling-min-max-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-rolling-min-max-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-rolling-min-max-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
              <div
                data-section="chart-line-rolling-min-max-tooltip-max"
                className="text-slate-500"
              >
                rolling max ({s.window}):{' '}
                {p.max !== null ? fmtValue(p.max) : 'n/a'}
              </div>
              <div
                data-section="chart-line-rolling-min-max-tooltip-min"
                className="text-slate-500"
              >
                rolling min ({s.window}):{' '}
                {p.min !== null ? fmtValue(p.min) : 'n/a'}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-rolling-min-max-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            const visEntry = layout.series.find((ls) => ls.id === s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-rolling-min-max-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-rolling-min-max-legend-button"
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
                    data-section="chart-line-rolling-min-max-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineRollingMinMaxDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-rolling-min-max-legend-label">
                    {s.label}
                  </span>
                  {visEntry ? (
                    <span
                      data-section="chart-line-rolling-min-max-legend-stats"
                      className="text-slate-500"
                    >
                      (window {visEntry.window})
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

ChartLineRollingMinMax.displayName = 'ChartLineRollingMinMax';
