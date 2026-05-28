import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_EWMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_EWMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_EWMA_PADDING = 40;
export const DEFAULT_CHART_LINE_EWMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_EWMA_RAW_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_EWMA_EWMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_EWMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_EWMA_ALPHA = 0.3;
export const DEFAULT_CHART_LINE_EWMA_RAW_OPACITY = 0.55;
export const DEFAULT_CHART_LINE_EWMA_RESIDUAL_OPACITY = 0.5;
export const DEFAULT_CHART_LINE_EWMA_EWMA_DASH = '';
export const DEFAULT_CHART_LINE_EWMA_PALETTE = [
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
export const DEFAULT_CHART_LINE_EWMA_RAW_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_EWMA_RESIDUAL_POS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_EWMA_RESIDUAL_NEG_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_EWMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_EWMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineEwmaResidualSign = 'positive' | 'negative' | 'zero';

export interface ChartLineEwmaPoint {
  x: number;
  y: number;
}

export interface ChartLineEwmaSeries {
  id: string;
  label: string;
  data: readonly ChartLineEwmaPoint[];
  color?: string;
  alpha?: number;
  span?: number;
  initialEstimate?: number;
  ewmaDashArray?: string;
}

export interface ChartLineEwmaSample {
  index: number;
  x: number;
  raw: number;
  ewma: number;
  residual: number;
  residualSign: ChartLineEwmaResidualSign;
}

export interface ChartLineEwmaLayoutPoint extends ChartLineEwmaSample {
  px: number;
  rawPy: number;
  ewmaPy: number;
}

export interface ChartLineEwmaLayoutSeries {
  id: string;
  label: string;
  color: string;
  alpha: number;
  effectiveSpan: number;
  halfLife: number;
  initialEstimate: number;
  ewmaDashArray: string;
  points: ChartLineEwmaLayoutPoint[];
  rawPath: string;
  ewmaPath: string;
  residualSegments: { x: number; raw: number; ewma: number; rawPy: number; ewmaPy: number; px: number; sign: ChartLineEwmaResidualSign }[];
  finiteCount: number;
  totalCount: number;
  finalEwma: number;
  rmseResidual: number;
  positiveResidualCount: number;
  negativeResidualCount: number;
  zeroResidualCount: number;
  maxAbsResidual: number;
}

export interface ComputeLineEwmaLayoutResult {
  series: ChartLineEwmaLayoutSeries[];
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

export interface ComputeLineEwmaLayoutOptions {
  series: readonly ChartLineEwmaSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  alpha?: number;
  span?: number;
  initialEstimate?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineEwmaProps {
  series: readonly ChartLineEwmaSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  alpha?: number;
  span?: number;
  initialEstimate?: number;
  rawStrokeWidth?: number;
  ewmaStrokeWidth?: number;
  dotRadius?: number;
  rawOpacity?: number;
  residualOpacity?: number;
  ewmaDashArray?: string;
  rawColor?: string;
  residualPosColor?: string;
  residualNegColor?: string;
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
  showHalfLifeBadge?: boolean;
  showRaw?: boolean;
  showResidualSticks?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatAlpha?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineEwmaLayoutSeries;
    point: ChartLineEwmaLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineEwmaSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineEwmaDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_EWMA_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineEwmaFinitePoints(
  points: readonly ChartLineEwmaPoint[] | null | undefined,
): ChartLineEwmaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineEwmaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineEwmaAlpha(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_EWMA_ALPHA;
  if (value <= 0) return 1e-6;
  if (value > 1) return 1;
  return value;
}

export function lineEwmaSpanToAlpha(span: number): number {
  if (!isFiniteNumber(span) || span <= 0) {
    return DEFAULT_CHART_LINE_EWMA_ALPHA;
  }
  // pandas-style: alpha = 2 / (span + 1)
  return 2 / (span + 1);
}

export function lineEwmaAlphaToSpan(alpha: number): number {
  if (!isFiniteNumber(alpha) || alpha <= 0 || alpha >= 1) {
    return Number.POSITIVE_INFINITY;
  }
  return 2 / alpha - 1;
}

export function lineEwmaHalfLife(alpha: number): number {
  if (!isFiniteNumber(alpha) || alpha <= 0) return Number.POSITIVE_INFINITY;
  if (alpha >= 1) return 0;
  return Math.log(2) / -Math.log(1 - alpha);
}

export function classifyLineEwmaResidual(
  residual: number,
): ChartLineEwmaResidualSign {
  if (!isFiniteNumber(residual)) return 'zero';
  if (residual > 0) return 'positive';
  if (residual < 0) return 'negative';
  return 'zero';
}

export interface RunLineEwmaOptions {
  alpha?: number;
  span?: number;
  initialEstimate?: number;
}

export function resolveLineEwmaAlpha(options?: RunLineEwmaOptions): number {
  if (isFiniteNumber(options?.alpha)) {
    return normaliseLineEwmaAlpha(options!.alpha);
  }
  if (isFiniteNumber(options?.span) && options!.span! > 0) {
    return normaliseLineEwmaAlpha(lineEwmaSpanToAlpha(options!.span!));
  }
  return DEFAULT_CHART_LINE_EWMA_ALPHA;
}

export function runLineEwma(
  points: readonly ChartLineEwmaPoint[] | null | undefined,
  options?: RunLineEwmaOptions,
): ChartLineEwmaSample[] {
  const finite = getLineEwmaFinitePoints(points);
  if (finite.length === 0) return [];
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const alpha = resolveLineEwmaAlpha(options);
  const oneMinusAlpha = 1 - alpha;
  const init = isFiniteNumber(options?.initialEstimate)
    ? options!.initialEstimate!
    : sorted[0]!.y;

  const out: ChartLineEwmaSample[] = [];
  let prev = init;
  for (let i = 0; i < sorted.length; i += 1) {
    const raw = sorted[i]!.y;
    const ewma = alpha * raw + oneMinusAlpha * prev;
    const residual = raw - ewma;
    out.push({
      index: i,
      x: sorted[i]!.x,
      raw,
      ewma,
      residual,
      residualSign: classifyLineEwmaResidual(residual),
    });
    prev = ewma;
  }
  return out;
}

function buildPath(points: readonly { px: number; py: number }[]): string {
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

export function computeLineEwmaLayout(
  options: ComputeLineEwmaLayoutOptions,
): ComputeLineEwmaLayoutResult {
  const {
    series = [],
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_EWMA_TICK_COUNT,
    alpha,
    span,
    initialEstimate,
    defaultColors = DEFAULT_CHART_LINE_EWMA_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ComputeLineEwmaLayoutResult = {
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

  const chartAlpha = resolveLineEwmaAlpha({ alpha, span });

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let totalPoints = 0;

  const samplesBySeries = new Map<string, ChartLineEwmaSample[]>();
  const seriesAlpha = new Map<string, number>();
  const seriesInit = new Map<string, number>();
  const seriesDash = new Map<string, string>();

  for (const s of visible) {
    const sAlpha = (() => {
      if (isFiniteNumber(s.alpha)) return normaliseLineEwmaAlpha(s.alpha);
      if (isFiniteNumber(s.span) && s.span! > 0) {
        return normaliseLineEwmaAlpha(lineEwmaSpanToAlpha(s.span!));
      }
      return chartAlpha;
    })();
    seriesAlpha.set(s.id, sAlpha);
    seriesDash.set(s.id, s.ewmaDashArray ?? DEFAULT_CHART_LINE_EWMA_EWMA_DASH);
    const sInit = isFiniteNumber(s.initialEstimate)
      ? s.initialEstimate!
      : isFiniteNumber(initialEstimate)
        ? initialEstimate!
        : getLineEwmaFinitePoints(s.data)[0]?.y ?? 0;
    seriesInit.set(s.id, sInit);
    const samples = runLineEwma(s.data, {
      alpha: sAlpha,
      initialEstimate: sInit,
    });
    samplesBySeries.set(s.id, samples);
    totalPoints += samples.length;
    for (const p of samples) {
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
      const candHi = Math.max(p.raw, p.ewma);
      const candLo = Math.min(p.raw, p.ewma);
      if (candLo < yLo) yLo = candLo;
      if (candHi > yHi) yHi = candHi;
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

  const layoutSeries: ChartLineEwmaLayoutSeries[] = visible.map((s, idx) => {
    const samples = samplesBySeries.get(s.id) ?? [];
    const sAlpha = seriesAlpha.get(s.id) ?? chartAlpha;
    const sInit = seriesInit.get(s.id) ?? 0;
    const sDash = seriesDash.get(s.id) ?? DEFAULT_CHART_LINE_EWMA_EWMA_DASH;
    const color =
      s.color ?? defaultColors[idx % defaultColors.length] ?? DEFAULT_CHART_LINE_EWMA_PALETTE[0]!;

    let positiveCount = 0;
    let negativeCount = 0;
    let zeroCount = 0;
    let sumSq = 0;
    let maxAbs = 0;

    const layoutPoints: ChartLineEwmaLayoutPoint[] = samples.map((p) => {
      if (p.residualSign === 'positive') positiveCount += 1;
      else if (p.residualSign === 'negative') negativeCount += 1;
      else zeroCount += 1;
      sumSq += p.residual * p.residual;
      const absRes = Math.abs(p.residual);
      if (absRes > maxAbs) maxAbs = absRes;
      return {
        ...p,
        px: projectX(p.x),
        rawPy: projectY(p.raw),
        ewmaPy: projectY(p.ewma),
      };
    });

    const rawPath = buildPath(
      layoutPoints.map((p) => ({ px: p.px, py: p.rawPy })),
    );
    const ewmaPath = buildPath(
      layoutPoints.map((p) => ({ px: p.px, py: p.ewmaPy })),
    );

    const residualSegments = layoutPoints.map((p) => ({
      x: p.x,
      raw: p.raw,
      ewma: p.ewma,
      rawPy: p.rawPy,
      ewmaPy: p.ewmaPy,
      px: p.px,
      sign: p.residualSign,
    }));

    const rmse = samples.length > 0 ? Math.sqrt(sumSq / samples.length) : 0;
    const last = samples[samples.length - 1];

    return {
      id: s.id,
      label: s.label,
      color,
      alpha: sAlpha,
      effectiveSpan: lineEwmaAlphaToSpan(sAlpha),
      halfLife: lineEwmaHalfLife(sAlpha),
      initialEstimate: sInit,
      ewmaDashArray: sDash,
      points: layoutPoints,
      rawPath,
      ewmaPath,
      residualSegments,
      finiteCount: samples.length,
      totalCount: s.data?.length ?? 0,
      finalEwma: last?.ewma ?? 0,
      rmseResidual: rmse,
      positiveResidualCount: positiveCount,
      negativeResidualCount: negativeCount,
      zeroResidualCount: zeroCount,
      maxAbsResidual: maxAbs,
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

function defaultFormatAlpha(n: number): string {
  if (!isFiniteNumber(n)) return '';
  return n.toFixed(3);
}

export function describeLineEwmaChart(
  series: readonly ChartLineEwmaSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    alpha?: number;
    span?: number;
    initialEstimate?: number;
    formatValue?: (n: number) => string;
    formatAlpha?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const chartAlpha = resolveLineEwmaAlpha({
    alpha: options?.alpha,
    span: options?.span,
  });
  const fmt = options?.formatValue ?? defaultFormatValue;
  const fmtA = options?.formatAlpha ?? defaultFormatAlpha;

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const sAlpha = (() => {
      if (isFiniteNumber(s.alpha)) return normaliseLineEwmaAlpha(s.alpha);
      if (isFiniteNumber(s.span) && s.span! > 0) {
        return normaliseLineEwmaAlpha(lineEwmaSpanToAlpha(s.span!));
      }
      return chartAlpha;
    })();
    const samples = runLineEwma(s.data, {
      alpha: sAlpha,
      initialEstimate: isFiniteNumber(s.initialEstimate)
        ? s.initialEstimate!
        : isFiniteNumber(options?.initialEstimate)
          ? options!.initialEstimate!
          : undefined,
    });
    totalPoints += samples.length;
    const last = samples[samples.length - 1];
    summaries.push(
      `${s.label}: alpha ${fmtA(sAlpha)} (half-life ${fmt(lineEwmaHalfLife(sAlpha))}); final EWMA ${last ? fmt(last.ewma) : 'n/a'}`,
    );
  }
  if (totalPoints === 0) return 'No data';

  return `Line chart with exponentially-weighted moving average across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineEwma = forwardRef<HTMLDivElement, ChartLineEwmaProps>(
  function ChartLineEwma(
    props: ChartLineEwmaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      series,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_EWMA_WIDTH,
      height = DEFAULT_CHART_LINE_EWMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_EWMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_EWMA_TICK_COUNT,
      alpha = DEFAULT_CHART_LINE_EWMA_ALPHA,
      span,
      initialEstimate,
      rawStrokeWidth = DEFAULT_CHART_LINE_EWMA_RAW_STROKE_WIDTH,
      ewmaStrokeWidth = DEFAULT_CHART_LINE_EWMA_EWMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_EWMA_DOT_RADIUS,
      rawOpacity = DEFAULT_CHART_LINE_EWMA_RAW_OPACITY,
      residualOpacity = DEFAULT_CHART_LINE_EWMA_RESIDUAL_OPACITY,
      ewmaDashArray = DEFAULT_CHART_LINE_EWMA_EWMA_DASH,
      rawColor = DEFAULT_CHART_LINE_EWMA_RAW_COLOR,
      residualPosColor = DEFAULT_CHART_LINE_EWMA_RESIDUAL_POS_COLOR,
      residualNegColor = DEFAULT_CHART_LINE_EWMA_RESIDUAL_NEG_COLOR,
      gridColor = DEFAULT_CHART_LINE_EWMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_EWMA_AXIS_COLOR,
      xMin,
      xMax,
      yMin,
      yMax,
      showAxis = true,
      showGrid = true,
      showDots = true,
      showLegend = true,
      showTooltip = true,
      showHalfLifeBadge = true,
      showRaw = true,
      showResidualSticks = false,
      animate = true,
      className,
      ariaLabel = 'Line chart with exponentially-weighted moving average',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      formatAlpha = defaultFormatAlpha,
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
        computeLineEwmaLayout({
          series,
          hiddenSeries: hiddenSet,
          width,
          height,
          padding,
          tickCount,
          alpha,
          ...(isFiniteNumber(span) ? { span } : {}),
          ...(isFiniteNumber(initialEstimate) ? { initialEstimate } : {}),
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
        alpha,
        span,
        initialEstimate,
        xMin,
        xMax,
        yMin,
        yMax,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineEwmaChart(series, {
          hidden: hiddenSet,
          alpha,
          ...(isFiniteNumber(span) ? { span } : {}),
          ...(isFiniteNumber(initialEstimate) ? { initialEstimate } : {}),
          formatValue,
          formatAlpha,
        }),
      [
        ariaDescription,
        series,
        hiddenSet,
        alpha,
        span,
        initialEstimate,
        formatValue,
        formatAlpha,
      ],
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
      (s: ChartLineEwmaSeries) => {
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
          (acc, s) => acc + getLineEwmaFinitePoints(s.data).length,
          0,
        ),
      [series],
    );

    const dominantAlpha = useMemo<{
      alpha: number;
      halfLife: number;
      seriesId: string;
    }>(() => {
      let best: { alpha: number; halfLife: number; seriesId: string } = {
        alpha: 0,
        halfLife: 0,
        seriesId: '',
      };
      for (const s of layout.series) {
        if (s.alpha > best.alpha) {
          best = {
            alpha: s.alpha,
            halfLife: s.halfLife,
            seriesId: s.id,
          };
        }
      }
      return best;
    }, [layout.series]);

    const badgeColor = layout.series[0]?.color ?? '#0f172a';

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
          data-section="chart-line-ewma"
          data-empty="true"
          data-series-count={series.length}
          data-visible-series-count={0}
          data-total-points={0}
          data-alpha={resolveLineEwmaAlpha({ alpha, span })}
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-ewma-aria-desc"
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
        data-section="chart-line-ewma"
        data-empty="false"
        data-series-count={series.length}
        data-visible-series-count={layout.visibleSeriesCount}
        data-total-points={layout.totalPoints}
        data-alpha={resolveLineEwmaAlpha({ alpha, span })}
        data-dominant-alpha={dominantAlpha.alpha}
        data-dominant-half-life={dominantAlpha.halfLife}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-ewma-aria-desc"
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
          data-section="chart-line-ewma-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showHalfLifeBadge && layout.series.length > 0 ? (
            <div
              data-section="chart-line-ewma-badge"
              data-alpha={dominantAlpha.alpha}
              data-half-life={dominantAlpha.halfLife}
              data-series-id={dominantAlpha.seriesId}
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
                data-section="chart-line-ewma-badge-icon"
                aria-hidden="true"
              >
                α
              </span>
              <span data-section="chart-line-ewma-badge-alpha">
                {formatAlpha(dominantAlpha.alpha)}
              </span>
              <span data-section="chart-line-ewma-badge-label">
                half-life {formatValue(dominantAlpha.halfLife)}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-ewma-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-ewma-grid"
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
                      data-section="chart-line-ewma-grid-line"
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
                      data-section="chart-line-ewma-grid-line"
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
                data-section="chart-line-ewma-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-ewma-axis"
                  data-axis="x"
                  x1={padding}
                  y1={padding + layout.innerHeight}
                  x2={padding + layout.innerWidth}
                  y2={padding + layout.innerHeight}
                />
                <line
                  data-section="chart-line-ewma-axis"
                  data-axis="y"
                  x1={padding}
                  y1={padding}
                  x2={padding}
                  y2={padding + layout.innerHeight}
                />
                <g data-section="chart-line-ewma-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => {
                    const px =
                      padding +
                      ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                        layout.innerWidth;
                    return (
                      <g
                        key={`tx-${i}`}
                        data-section="chart-line-ewma-tick"
                        data-axis="x"
                      >
                        <line
                          x1={px}
                          x2={px}
                          y1={padding + layout.innerHeight}
                          y2={padding + layout.innerHeight + 4}
                        />
                        <text
                          data-section="chart-line-ewma-tick-label"
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
                <g data-section="chart-line-ewma-ticks" data-axis="y">
                  {layout.yTicks.map((t, i) => {
                    const py =
                      padding +
                      layout.innerHeight -
                      ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                        layout.innerHeight;
                    return (
                      <g
                        key={`ty-${i}`}
                        data-section="chart-line-ewma-tick"
                        data-axis="y"
                      >
                        <line x1={padding - 4} x2={padding} y1={py} y2={py} />
                        <text
                          data-section="chart-line-ewma-tick-label"
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
                    data-section="chart-line-ewma-x-label"
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
                    data-section="chart-line-ewma-y-label"
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

            <g data-section="chart-line-ewma-series">
              {layout.series.map((s) => (
                <g
                  key={s.id}
                  data-section="chart-line-ewma-series-group"
                  data-series-id={s.id}
                  data-series-color={s.color}
                  data-series-alpha={s.alpha}
                  data-series-half-life={s.halfLife}
                  data-series-effective-span={s.effectiveSpan}
                  data-series-finite-count={s.finiteCount}
                  data-series-positive-residual-count={s.positiveResidualCount}
                  data-series-negative-residual-count={s.negativeResidualCount}
                  data-series-zero-residual-count={s.zeroResidualCount}
                  data-series-max-abs-residual={s.maxAbsResidual}
                  data-series-rmse={s.rmseResidual}
                  data-series-final-ewma={s.finalEwma}
                >
                  {showResidualSticks
                    ? s.residualSegments.map((seg, i) => {
                        const segColor =
                          seg.sign === 'positive'
                            ? residualPosColor
                            : seg.sign === 'negative'
                              ? residualNegColor
                              : axisColor;
                        return (
                          <line
                            key={`r-${i}`}
                            data-section="chart-line-ewma-residual-stick"
                            data-series-id={s.id}
                            data-point-index={i}
                            data-sign={seg.sign}
                            x1={seg.px}
                            x2={seg.px}
                            y1={seg.rawPy}
                            y2={seg.ewmaPy}
                            stroke={segColor}
                            strokeWidth={1}
                            strokeOpacity={residualOpacity}
                            pointerEvents="none"
                          />
                        );
                      })
                    : null}
                  {showRaw && s.rawPath ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} raw observations`}
                      data-section="chart-line-ewma-raw-path"
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
                  {s.ewmaPath ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} exponentially-weighted moving average (alpha ${formatAlpha(s.alpha)}, half-life ${formatValue(s.halfLife)})`}
                      data-section="chart-line-ewma-ewma-path"
                      data-series-id={s.id}
                      data-kind="ewma"
                      d={s.ewmaPath}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={ewmaStrokeWidth}
                      strokeDasharray={s.ewmaDashArray || ewmaDashArray}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {showDots
                    ? s.points.map((p) => {
                        const isHover =
                          hoverPayload?.seriesId === s.id &&
                          hoverPayload?.pointIndex === p.index;
                        return (
                          <circle
                            key={`d-${p.index}`}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)}; raw ${formatValue(p.raw)}; ewma ${formatValue(p.ewma)}; residual ${formatValue(p.residual)} ${p.residualSign}`}
                            data-section="chart-line-ewma-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-raw={p.raw}
                            data-ewma={p.ewma}
                            data-residual={p.residual}
                            data-residual-sign={p.residualSign}
                            data-hovered={isHover ? 'true' : 'false'}
                            cx={p.px}
                            cy={p.ewmaPy}
                            r={isHover ? dotRadius + 1 : dotRadius}
                            fill={s.color}
                            stroke="#ffffff"
                            strokeWidth={1}
                            onMouseEnter={() => {
                              setHoverPayload({
                                seriesId: s.id,
                                pointIndex: p.index,
                              });
                              setTooltipPos({ px: p.px, py: p.ewmaPy });
                            }}
                            onMouseLeave={clearHover}
                            onFocus={() => {
                              setHoverPayload({
                                seriesId: s.id,
                                pointIndex: p.index,
                              });
                              setTooltipPos({ px: p.px, py: p.ewmaPy });
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
                const resColor =
                  p.residualSign === 'positive'
                    ? residualPosColor
                    : p.residualSign === 'negative'
                      ? residualNegColor
                      : axisColor;
                return (
                  <div
                    data-section="chart-line-ewma-tooltip"
                    data-series-id={s.id}
                    data-point-index={p.index}
                    data-residual-sign={p.residualSign}
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
                      data-section="chart-line-ewma-tooltip-label"
                      style={{ color: s.color, fontWeight: 600 }}
                    >
                      {s.label}
                    </div>
                    <div data-section="chart-line-ewma-tooltip-x">
                      x: {formatX(p.x)}
                    </div>
                    <div data-section="chart-line-ewma-tooltip-raw">
                      raw: {formatValue(p.raw)}
                    </div>
                    <div
                      data-section="chart-line-ewma-tooltip-ewma"
                      style={{ fontWeight: 600 }}
                    >
                      ewma: {formatValue(p.ewma)}
                    </div>
                    <div
                      data-section="chart-line-ewma-tooltip-residual"
                      style={{ color: resColor }}
                    >
                      residual: {p.residual >= 0 ? '+' : ''}
                      {formatValue(p.residual)}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-ewma-legend"
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
                DEFAULT_CHART_LINE_EWMA_PALETTE[0]!;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-section="chart-line-ewma-legend-item"
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
                    data-section="chart-line-ewma-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: swatchColor,
                    }}
                  />
                  <span data-section="chart-line-ewma-legend-label">
                    {s.label}
                  </span>
                  {layoutMatch ? (
                    <span
                      data-section="chart-line-ewma-legend-stats"
                      style={{ fontSize: 10, color: '#64748b' }}
                    >
                      (α {formatAlpha(layoutMatch.alpha)}; hl{' '}
                      {formatValue(layoutMatch.halfLife)})
                    </span>
                  ) : null}
                </button>
              );
            })}
            <span
              data-section="chart-line-ewma-legend-total-points"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {allTotalPoints} total points
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineEwma.displayName = 'ChartLineEwma';
