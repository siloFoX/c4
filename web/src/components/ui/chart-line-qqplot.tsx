import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_QQPLOT_WIDTH = 640;
export const DEFAULT_CHART_LINE_QQPLOT_HEIGHT = 320;
export const DEFAULT_CHART_LINE_QQPLOT_PADDING = 40;
export const DEFAULT_CHART_LINE_QQPLOT_GAP = 28;
export const DEFAULT_CHART_LINE_QQPLOT_LINE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_QQPLOT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_QQPLOT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_QQPLOT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_QQPLOT_QQ_DOT_RADIUS = 3.5;
export const DEFAULT_CHART_LINE_QQPLOT_SERIES_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_QQPLOT_QQ_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_QQPLOT_REFERENCE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_QQPLOT_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_QQPLOT_AXIS_COLOR = '#cbd5e1';

export interface ChartLineQQPlotPoint {
  x: number;
  value: number;
}

export interface ChartLineQQPlotQuantile {
  rank: number;
  p: number;
  theoretical: number;
  sample: number;
}

export interface ChartLineQQPlotStats {
  mean: number;
  variance: number;
  stddev: number;
  count: number;
}

export interface ChartLineQQPlotRun {
  series: ChartLineQQPlotPoint[];
  sorted: number[];
  quantiles: ChartLineQQPlotQuantile[];
  mean: number;
  variance: number;
  stddev: number;
  count: number;
  referenceSlope: number;
  referenceIntercept: number;
  correlation: number;
  ok: boolean;
}

export interface ChartLineQQPlotSeriesDot {
  index: number;
  x: number;
  value: number;
  px: number;
  py: number;
}

export interface ChartLineQQPlotQuantileDot extends ChartLineQQPlotQuantile {
  index: number;
  residual: number;
  px: number;
  py: number;
}

export interface ChartLineQQPlotPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineQQPlotLayout {
  ok: boolean;
  width: number;
  height: number;
  seriesPanel: ChartLineQQPlotPanel;
  qqPanel: ChartLineQQPlotPanel;
  seriesXTicks: { value: number; px: number }[];
  seriesYTicks: { value: number; py: number }[];
  qqXTicks: { value: number; px: number }[];
  qqYTicks: { value: number; py: number }[];
  seriesXMin: number;
  seriesXMax: number;
  seriesYMin: number;
  seriesYMax: number;
  qqXMin: number;
  qqXMax: number;
  qqYMin: number;
  qqYMax: number;
  linePath: string;
  seriesDots: ChartLineQQPlotSeriesDot[];
  qqDots: ChartLineQQPlotQuantileDot[];
  referencePath: string;
  mean: number;
  variance: number;
  stddev: number;
  count: number;
  correlation: number;
  referenceSlope: number;
  referenceIntercept: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineQQPlotLayoutOptions {
  data: readonly ChartLineQQPlotPoint[];
  width: number;
  height: number;
  padding: number;
  gap?: number;
  linePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineQQPlotProps {
  data: readonly ChartLineQQPlotPoint[];
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  linePanelRatio?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  qqDotRadius?: number;
  seriesColor?: string;
  qqColor?: string;
  referenceColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showSeriesDots?: boolean;
  showReferenceLine?: boolean;
  showPanelLabels?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showFooter?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onSampleClick?: (payload: { point: ChartLineQQPlotSeriesDot }) => void;
  onQuantileClick?: (payload: {
    quantile: ChartLineQQPlotQuantileDot;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineQQPlotFinitePoints(
  points: readonly ChartLineQQPlotPoint[] | null | undefined,
): ChartLineQQPlotPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineQQPlotPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

const ACKLAM_A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
  1.38357751867269e2, -3.066479806614716e1, 2.506628277459239e0,
];
const ACKLAM_B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
  6.680131188771972e1, -1.328068155288572e1,
];
const ACKLAM_C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
  -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
];
const ACKLAM_D = [
  7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
  3.754408661907416e0,
];
const ACKLAM_P_LOW = 0.02425;

/**
 * Inverse of the standard normal CDF -- the probit / quantile
 * function. Uses Peter Acklam's rational approximation (accurate to
 * roughly 1e-9 across the open interval). `p` outside [0, 1] yields
 * NaN; `p` of exactly 0 / 1 yields -Infinity / +Infinity.
 */
export function normalInverseCDF(p: number): number {
  if (!isFiniteNumber(p)) return NaN;
  if (p < 0 || p > 1) return NaN;
  if (p === 0) return Number.NEGATIVE_INFINITY;
  if (p === 1) return Number.POSITIVE_INFINITY;

  if (p < ACKLAM_P_LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((ACKLAM_C[0]! * q + ACKLAM_C[1]!) * q + ACKLAM_C[2]!) * q +
        ACKLAM_C[3]!) *
        q +
        ACKLAM_C[4]!) *
        q +
        ACKLAM_C[5]!) /
      ((((ACKLAM_D[0]! * q + ACKLAM_D[1]!) * q + ACKLAM_D[2]!) * q +
        ACKLAM_D[3]!) *
        q +
        1)
    );
  }
  if (p <= 1 - ACKLAM_P_LOW) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((ACKLAM_A[0]! * r + ACKLAM_A[1]!) * r + ACKLAM_A[2]!) * r +
        ACKLAM_A[3]!) *
        r +
        ACKLAM_A[4]!) *
        r +
        ACKLAM_A[5]!) *
        q) /
      (((((ACKLAM_B[0]! * r + ACKLAM_B[1]!) * r + ACKLAM_B[2]!) * r +
        ACKLAM_B[3]!) *
        r +
        ACKLAM_B[4]!) *
        r +
        1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((ACKLAM_C[0]! * q + ACKLAM_C[1]!) * q + ACKLAM_C[2]!) * q +
      ACKLAM_C[3]!) *
      q +
      ACKLAM_C[4]!) *
      q +
      ACKLAM_C[5]!) /
    ((((ACKLAM_D[0]! * q + ACKLAM_D[1]!) * q + ACKLAM_D[2]!) * q +
      ACKLAM_D[3]!) *
      q +
      1)
  );
}

/**
 * Mean, variance and standard deviation of a value set. The variance
 * uses the unbiased `n - 1` denominator (the sample standard
 * deviation); a set of fewer than 2 finite values reports a stddev
 * of 0.
 */
export function computeLineQQPlotStats(
  values: readonly number[] | null | undefined,
): ChartLineQQPlotStats {
  const finite = Array.isArray(values) ? values.filter(isFiniteNumber) : [];
  const n = finite.length;
  if (n === 0) {
    return { mean: NaN, variance: NaN, stddev: NaN, count: 0 };
  }
  let sum = 0;
  for (const v of finite) sum += v;
  const mean = sum / n;
  if (n < 2) {
    return { mean, variance: 0, stddev: 0, count: n };
  }
  let sq = 0;
  for (const v of finite) sq += (v - mean) * (v - mean);
  const variance = sq / (n - 1);
  return { mean, variance, stddev: Math.sqrt(variance), count: n };
}

function pearson(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i += 1) {
    sa += a[i]!;
    sb += b[i]!;
  }
  const ma = sa / n;
  const mb = sb / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i]! - ma;
    const db = b[i]! - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va === 0 || vb === 0) return NaN;
  return cov / Math.sqrt(va * vb);
}

export function runLineQQPlot(
  points: readonly ChartLineQQPlotPoint[] | null | undefined,
): ChartLineQQPlotRun {
  const finite = getLineQQPlotFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const values = finite.map((p) => p.value);
  const stats = computeLineQQPlotStats(values);

  if (stats.count < 2) {
    return {
      series,
      sorted: [...values].sort((a, b) => a - b),
      quantiles: [],
      mean: stats.mean,
      variance: stats.variance,
      stddev: stats.stddev,
      count: stats.count,
      referenceSlope: stats.stddev,
      referenceIntercept: stats.mean,
      correlation: NaN,
      ok: false,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const quantiles: ChartLineQQPlotQuantile[] = sorted.map((v, idx) => {
    const rank = idx + 1;
    const p = (rank - 0.5) / n;
    return {
      rank,
      p,
      theoretical: normalInverseCDF(p),
      sample: v,
    };
  });

  const correlation = pearson(
    quantiles.map((q) => q.theoretical),
    quantiles.map((q) => q.sample),
  );

  return {
    series,
    sorted,
    quantiles,
    mean: stats.mean,
    variance: stats.variance,
    stddev: stats.stddev,
    count: stats.count,
    referenceSlope: stats.stddev,
    referenceIntercept: stats.mean,
    correlation,
    ok: true,
  };
}

function buildPath(
  points: readonly { px: number; py: number }[],
): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
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

export function computeLineQQPlotLayout(
  options: ComputeLineQQPlotLayoutOptions,
): ChartLineQQPlotLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_QQPLOT_GAP,
    linePanelRatio = DEFAULT_CHART_LINE_QQPLOT_LINE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_QQPLOT_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.2, linePanelRatio));

  const emptyPanel: ChartLineQQPlotPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: innerHeight,
  };
  const empty: ChartLineQQPlotLayout = {
    ok: false,
    width,
    height,
    seriesPanel: emptyPanel,
    qqPanel: emptyPanel,
    seriesXTicks: [],
    seriesYTicks: [],
    qqXTicks: [],
    qqYTicks: [],
    seriesXMin: 0,
    seriesXMax: 0,
    seriesYMin: 0,
    seriesYMax: 0,
    qqXMin: 0,
    qqXMax: 0,
    qqYMin: 0,
    qqYMax: 0,
    linePath: '',
    seriesDots: [],
    qqDots: [],
    referencePath: '',
    mean: NaN,
    variance: NaN,
    stddev: NaN,
    count: 0,
    correlation: NaN,
    referenceSlope: NaN,
    referenceIntercept: NaN,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableWidth = innerWidth - gap;
  if (usableWidth <= 0) return empty;

  const run = runLineQQPlot(data);
  if (!run.ok) return empty;

  const seriesPanelW = usableWidth * ratio;
  const qqPanelW = usableWidth - seriesPanelW;
  if (seriesPanelW <= 0 || qqPanelW <= 0) return empty;

  const seriesPanel: ChartLineQQPlotPanel = {
    x: padding,
    y: padding,
    width: seriesPanelW,
    height: innerHeight,
  };
  const qqPanel: ChartLineQQPlotPanel = {
    x: padding + seriesPanelW + gap,
    y: padding,
    width: qqPanelW,
    height: innerHeight,
  };

  // ----- series panel -----
  let sxLo = Number.POSITIVE_INFINITY;
  let sxHi = Number.NEGATIVE_INFINITY;
  let syLo = Number.POSITIVE_INFINITY;
  let syHi = Number.NEGATIVE_INFINITY;
  for (const p of run.series) {
    if (p.x < sxLo) sxLo = p.x;
    if (p.x > sxHi) sxHi = p.x;
    if (p.value < syLo) syLo = p.value;
    if (p.value > syHi) syHi = p.value;
  }
  if (sxLo === sxHi) {
    sxLo -= 0.5;
    sxHi += 0.5;
  }
  if (syLo === syHi) {
    syLo -= 0.5;
    syHi += 0.5;
  }
  const sProjectX = (x: number): number =>
    seriesPanel.x + ((x - sxLo) / (sxHi - sxLo)) * seriesPanel.width;
  const sProjectY = (v: number): number =>
    seriesPanel.y +
    seriesPanel.height -
    ((v - syLo) / (syHi - syLo)) * seriesPanel.height;

  const seriesDots: ChartLineQQPlotSeriesDot[] = run.series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    px: sProjectX(p.x),
    py: sProjectY(p.value),
  }));

  // ----- qq panel -----
  let zLo = Number.POSITIVE_INFINITY;
  let zHi = Number.NEGATIVE_INFINITY;
  let qyLo = Number.POSITIVE_INFINITY;
  let qyHi = Number.NEGATIVE_INFINITY;
  for (const q of run.quantiles) {
    if (q.theoretical < zLo) zLo = q.theoretical;
    if (q.theoretical > zHi) zHi = q.theoretical;
    if (q.sample < qyLo) qyLo = q.sample;
    if (q.sample > qyHi) qyHi = q.sample;
  }
  // expand the y-range so the reference line never clips
  const refAtLo = run.referenceIntercept + run.referenceSlope * zLo;
  const refAtHi = run.referenceIntercept + run.referenceSlope * zHi;
  qyLo = Math.min(qyLo, refAtLo, refAtHi);
  qyHi = Math.max(qyHi, refAtLo, refAtHi);
  if (zLo === zHi) {
    zLo -= 0.5;
    zHi += 0.5;
  }
  if (qyLo === qyHi) {
    qyLo -= 0.5;
    qyHi += 0.5;
  }
  const qProjectX = (z: number): number =>
    qqPanel.x + ((z - zLo) / (zHi - zLo)) * qqPanel.width;
  const qProjectY = (v: number): number =>
    qqPanel.y + qqPanel.height - ((v - qyLo) / (qyHi - qyLo)) * qqPanel.height;

  const qqDots: ChartLineQQPlotQuantileDot[] = run.quantiles.map((q, i) => ({
    ...q,
    index: i,
    residual:
      q.sample - (run.referenceIntercept + run.referenceSlope * q.theoretical),
    px: qProjectX(q.theoretical),
    py: qProjectY(q.sample),
  }));

  const referencePath = buildPath([
    { px: qProjectX(zLo), py: qProjectY(refAtLo) },
    { px: qProjectX(zHi), py: qProjectY(refAtHi) },
  ]);

  return {
    ok: true,
    width,
    height,
    seriesPanel,
    qqPanel,
    seriesXTicks: computeTicks(sxLo, sxHi, tickCount).map((v) => ({
      value: v,
      px: sProjectX(v),
    })),
    seriesYTicks: computeTicks(syLo, syHi, tickCount).map((v) => ({
      value: v,
      py: sProjectY(v),
    })),
    qqXTicks: computeTicks(zLo, zHi, tickCount).map((v) => ({
      value: v,
      px: qProjectX(v),
    })),
    qqYTicks: computeTicks(qyLo, qyHi, tickCount).map((v) => ({
      value: v,
      py: qProjectY(v),
    })),
    seriesXMin: sxLo,
    seriesXMax: sxHi,
    seriesYMin: syLo,
    seriesYMax: syHi,
    qqXMin: zLo,
    qqXMax: zHi,
    qqYMin: qyLo,
    qqYMax: qyHi,
    linePath: buildPath(seriesDots.map((d) => ({ px: d.px, py: d.py }))),
    seriesDots,
    qqDots,
    referencePath,
    mean: run.mean,
    variance: run.variance,
    stddev: run.stddev,
    count: run.count,
    correlation: run.correlation,
    referenceSlope: run.referenceSlope,
    referenceIntercept: run.referenceIntercept,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function formatCorrelation(n: number): string {
  return isFiniteNumber(n) ? n.toFixed(3) : 'n/a';
}

export function describeLineQQPlotChart(
  data: readonly ChartLineQQPlotPoint[] | null | undefined,
  options?: { formatValue?: (n: number) => string },
): string {
  const run = runLineQQPlot(data);
  if (!run.ok) return 'No data';
  const fmt = options?.formatValue ?? defaultFormatValue;
  return `Line chart with a normal Q-Q plot side panel: ${run.count} samples, mean ${fmt(run.mean)}, sd ${fmt(run.stddev)}, Q-Q correlation ${formatCorrelation(run.correlation)} (1.0 = perfectly normal).`;
}

function srOnly(): CSSProperties {
  return {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  };
}

export const ChartLineQQPlot = forwardRef<
  HTMLDivElement,
  ChartLineQQPlotProps
>(function ChartLineQQPlot(
  props: ChartLineQQPlotProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    width = DEFAULT_CHART_LINE_QQPLOT_WIDTH,
    height = DEFAULT_CHART_LINE_QQPLOT_HEIGHT,
    padding = DEFAULT_CHART_LINE_QQPLOT_PADDING,
    gap = DEFAULT_CHART_LINE_QQPLOT_GAP,
    linePanelRatio = DEFAULT_CHART_LINE_QQPLOT_LINE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_QQPLOT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_QQPLOT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_QQPLOT_DOT_RADIUS,
    qqDotRadius = DEFAULT_CHART_LINE_QQPLOT_QQ_DOT_RADIUS,
    seriesColor = DEFAULT_CHART_LINE_QQPLOT_SERIES_COLOR,
    qqColor = DEFAULT_CHART_LINE_QQPLOT_QQ_COLOR,
    referenceColor = DEFAULT_CHART_LINE_QQPLOT_REFERENCE_COLOR,
    gridColor = DEFAULT_CHART_LINE_QQPLOT_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_QQPLOT_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showSeriesDots = true,
    showReferenceLine = true,
    showPanelLabels = true,
    showTooltip = true,
    showConfigBadge = true,
    showFooter = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a normal Q-Q plot side panel',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    onSampleClick,
    onQuantileClick,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const layout = useMemo(
    () =>
      computeLineQQPlotLayout({
        data,
        width,
        height,
        padding,
        gap,
        linePanelRatio,
        tickCount,
      }),
    [data, width, height, padding, gap, linePanelRatio, tickCount],
  );

  const summary = useMemo(
    () => ariaDescription ?? describeLineQQPlotChart(data, { formatValue }),
    [ariaDescription, data, formatValue],
  );

  const [hover, setHover] = useState<
    | { kind: 'series'; index: number }
    | { kind: 'qq'; index: number }
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
        data-section="chart-line-qqplot"
        data-empty="true"
        data-count={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-qqplot-aria-desc" style={srOnly()}>
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const sp = layout.seriesPanel;
  const qp = layout.qqPanel;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-qqplot"
      data-empty="false"
      data-count={layout.count}
      data-mean={layout.mean}
      data-stddev={layout.stddev}
      data-correlation={layout.correlation}
      data-animate={animate ? 'true' : 'false'}
    >
      <span id={descId} data-section="chart-line-qqplot-aria-desc" style={srOnly()}>
        {summary}
      </span>

      <div
        data-section="chart-line-qqplot-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-qqplot-badge"
            data-correlation={layout.correlation}
            data-count={layout.count}
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
            <span data-section="chart-line-qqplot-badge-icon" aria-hidden="true">
              QQ
            </span>
            <span data-section="chart-line-qqplot-badge-correlation">
              r={formatCorrelation(layout.correlation)}
            </span>
            <span data-section="chart-line-qqplot-badge-count">
              n={layout.count}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-qqplot-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-qqplot-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.seriesYTicks.map((t, i) => (
                <line
                  key={`sgy-${i}`}
                  data-section="chart-line-qqplot-grid-line"
                  data-panel="series"
                  x1={sp.x}
                  x2={sp.x + sp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.qqYTicks.map((t, i) => (
                <line
                  key={`qgy-${i}`}
                  data-section="chart-line-qqplot-grid-line"
                  data-panel="qq"
                  x1={qp.x}
                  x2={qp.x + qp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-qqplot-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              {[
                { panel: sp, name: 'series', xt: layout.seriesXTicks, yt: layout.seriesYTicks, fx: formatX, fy: formatValue },
                { panel: qp, name: 'qq', xt: layout.qqXTicks, yt: layout.qqYTicks, fx: formatValue, fy: formatValue },
              ].map((cfg) => (
                <g
                  key={`axis-${cfg.name}`}
                  data-section="chart-line-qqplot-axis-group"
                  data-panel={cfg.name}
                >
                  <line
                    data-section="chart-line-qqplot-axis"
                    data-panel={cfg.name}
                    data-axis="x"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y + cfg.panel.height}
                    x2={cfg.panel.x + cfg.panel.width}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  <line
                    data-section="chart-line-qqplot-axis"
                    data-panel={cfg.name}
                    data-axis="y"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y}
                    x2={cfg.panel.x}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  {cfg.xt.map((t, i) => (
                    <g
                      key={`xt-${cfg.name}-${i}`}
                      data-section="chart-line-qqplot-tick"
                      data-panel={cfg.name}
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={cfg.panel.y + cfg.panel.height}
                        y2={cfg.panel.y + cfg.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-qqplot-tick-label"
                        data-panel={cfg.name}
                        data-axis="x"
                        x={t.px}
                        y={cfg.panel.y + cfg.panel.height + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {cfg.fx(t.value)}
                      </text>
                    </g>
                  ))}
                  {cfg.yt.map((t, i) => (
                    <g
                      key={`yt-${cfg.name}-${i}`}
                      data-section="chart-line-qqplot-tick"
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
                        data-section="chart-line-qqplot-tick-label"
                        data-panel={cfg.name}
                        data-axis="y"
                        x={cfg.panel.x - 6}
                        y={t.py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {cfg.fy(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              ))}
            </g>
          ) : null}

          {showPanelLabels ? (
            <g data-section="chart-line-qqplot-panel-labels">
              <text
                data-section="chart-line-qqplot-panel-label"
                data-panel="series"
                x={sp.x + sp.width / 2}
                y={sp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Series
              </text>
              <text
                data-section="chart-line-qqplot-panel-label"
                data-panel="qq"
                x={qp.x + qp.width / 2}
                y={qp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Q-Q vs Normal
              </text>
            </g>
          ) : null}

          <path
            role="graphics-symbol"
            tabIndex={0}
            aria-label="Series line"
            data-section="chart-line-qqplot-line-path"
            d={layout.linePath}
            fill="none"
            stroke={seriesColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {showSeriesDots ? (
            <g data-section="chart-line-qqplot-series-dots">
              {layout.seriesDots.map((d) => {
                const isHover =
                  hover?.kind === 'series' && hover.index === d.index;
                return (
                  <circle
                    key={`sd-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Sample ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-qqplot-series-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-value={d.value}
                    cx={d.px}
                    cy={d.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={seriesColor}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    onMouseEnter={() => {
                      setHover({ kind: 'series', index: d.index });
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHover({ kind: 'series', index: d.index });
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => onSampleClick?.({ point: d })}
                  />
                );
              })}
            </g>
          ) : null}

          {showReferenceLine && layout.referencePath ? (
            <path
              data-section="chart-line-qqplot-reference-line"
              d={layout.referencePath}
              fill="none"
              stroke={referenceColor}
              strokeWidth={1.5}
              strokeDasharray="5 3"
            />
          ) : null}

          <g data-section="chart-line-qqplot-qq-dots">
            {layout.qqDots.map((q) => {
              const isHover = hover?.kind === 'qq' && hover.index === q.index;
              return (
                <circle
                  key={`qd-${q.index}`}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Quantile ${q.rank}: theoretical ${formatValue(q.theoretical)}, sample ${formatValue(q.sample)}`}
                  data-section="chart-line-qqplot-qq-dot"
                  data-quantile-index={q.index}
                  data-rank={q.rank}
                  data-theoretical={q.theoretical}
                  data-sample={q.sample}
                  cx={q.px}
                  cy={q.py}
                  r={isHover ? qqDotRadius + 1.5 : qqDotRadius}
                  fill={qqColor}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  onMouseEnter={() => {
                    setHover({ kind: 'qq', index: q.index });
                    setTooltipPos({ px: q.px, py: q.py });
                  }}
                  onMouseLeave={clearHover}
                  onFocus={() => {
                    setHover({ kind: 'qq', index: q.index });
                    setTooltipPos({ px: q.px, py: q.py });
                  }}
                  onBlur={clearHover}
                  onClick={() => onQuantileClick?.({ quantile: q })}
                />
              );
            })}
          </g>
        </svg>

        {showTooltip && hover && tooltipPos
          ? (() => {
              if (hover.kind === 'series') {
                const d = layout.seriesDots.find(
                  (x) => x.index === hover.index,
                );
                if (!d) return null;
                return (
                  <div
                    data-section="chart-line-qqplot-tooltip"
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
                      minWidth: 130,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div data-section="chart-line-qqplot-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-qqplot-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                  </div>
                );
              }
              const q = layout.qqDots.find((x) => x.index === hover.index);
              if (!q) return null;
              return (
                <div
                  data-section="chart-line-qqplot-tooltip"
                  data-tooltip-kind="qq"
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
                    minWidth: 170,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-qqplot-tooltip-rank"
                    style={{ color: qqColor, fontWeight: 600 }}
                  >
                    Quantile {q.rank}
                  </div>
                  <div data-section="chart-line-qqplot-tooltip-theoretical">
                    theoretical z: {formatValue(q.theoretical)}
                  </div>
                  <div data-section="chart-line-qqplot-tooltip-sample">
                    sample: {formatValue(q.sample)}
                  </div>
                  <div data-section="chart-line-qqplot-tooltip-residual">
                    residual: {q.residual >= 0 ? '+' : ''}
                    {formatValue(q.residual)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showFooter ? (
        <div
          data-section="chart-line-qqplot-footer"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            fontSize: 10,
            color: '#64748b',
          }}
        >
          <span data-section="chart-line-qqplot-footer-stats">
            n={layout.count} mean={formatValue(layout.mean)} sd=
            {formatValue(layout.stddev)}
          </span>
          <span data-section="chart-line-qqplot-footer-reference">
            reference: sample = {formatValue(layout.referenceIntercept)} +{' '}
            {formatValue(layout.referenceSlope)} z
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineQQPlot.displayName = 'ChartLineQQPlot';
