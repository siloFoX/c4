import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_DECOMPOSE_WIDTH = 560;
export const DEFAULT_CHART_LINE_DECOMPOSE_HEIGHT = 480;
export const DEFAULT_CHART_LINE_DECOMPOSE_PADDING = 40;
export const DEFAULT_CHART_LINE_DECOMPOSE_TICK_COUNT = 4;
export const DEFAULT_CHART_LINE_DECOMPOSE_GAP = 14;
export const DEFAULT_CHART_LINE_DECOMPOSE_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_DECOMPOSE_DOT_RADIUS = 2.5;
export const DEFAULT_CHART_LINE_DECOMPOSE_PERIOD = 12;
export const DEFAULT_CHART_LINE_DECOMPOSE_OBSERVED_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_DECOMPOSE_TREND_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_DECOMPOSE_SEASONAL_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DECOMPOSE_RESIDUAL_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DECOMPOSE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DECOMPOSE_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_DECOMPOSE_RESIDUAL_ZERO_DASH = '4 3';

export type ChartLineDecomposeComponentKind =
  | 'observed'
  | 'trend'
  | 'seasonal'
  | 'residual';

export const LINE_DECOMPOSE_COMPONENT_KINDS: ChartLineDecomposeComponentKind[] = [
  'observed',
  'trend',
  'seasonal',
  'residual',
];

export interface ChartLineDecomposePoint {
  x: number;
  y: number;
}

export interface ChartLineDecomposeSample {
  index: number;
  x: number;
  observed: number;
  trend: number | null;
  seasonal: number | null;
  residual: number | null;
  phase: number;
}

export interface ChartLineDecomposeResult {
  samples: ChartLineDecomposeSample[];
  period: number;
  trendValidCount: number;
  residualValidCount: number;
  seasonalPattern: number[];
  ok: boolean;
}

export interface ChartLineDecomposeLayoutPanel {
  kind: ChartLineDecomposeComponentKind;
  label: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  yMin: number;
  yMax: number;
  yTicks: number[];
  path: string;
  points: {
    index: number;
    x: number;
    y: number | null;
    px: number;
    py: number | null;
  }[];
  validCount: number;
  zeroPy: number | null;
}

export interface ChartLineDecomposeLayout {
  ok: boolean;
  width: number;
  height: number;
  panels: ChartLineDecomposeLayoutPanel[];
  panelMap: Record<ChartLineDecomposeComponentKind, ChartLineDecomposeLayoutPanel | null>;
  xTicks: number[];
  xMin: number;
  xMax: number;
  innerWidth: number;
  innerHeight: number;
  totalPoints: number;
  finiteCount: number;
  period: number;
  decomposition: ChartLineDecomposeResult;
}

export interface ComputeLineDecomposeLayoutOptions {
  data: readonly ChartLineDecomposePoint[];
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  period?: number;
  observedColor?: string;
  trendColor?: string;
  seasonalColor?: string;
  residualColor?: string;
  enabledComponents?: ChartLineDecomposeComponentKind[];
  xMin?: number;
  xMax?: number;
}

export interface ChartLineDecomposeProps {
  data: readonly ChartLineDecomposePoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  observedColor?: string;
  trendColor?: string;
  seasonalColor?: string;
  residualColor?: string;
  gridColor?: string;
  axisColor?: string;
  residualZeroDashArray?: string;
  xMin?: number;
  xMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showPeriodBadge?: boolean;
  showResidualZero?: boolean;
  hiddenComponents?: ReadonlySet<ChartLineDecomposeComponentKind> | readonly ChartLineDecomposeComponentKind[];
  defaultHiddenComponents?: ReadonlySet<ChartLineDecomposeComponentKind> | readonly ChartLineDecomposeComponentKind[];
  onHiddenComponentsChange?: (
    hidden: ReadonlySet<ChartLineDecomposeComponentKind>,
  ) => void;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  onPointClick?: (payload: {
    panel: ChartLineDecomposeLayoutPanel;
    point: {
      index: number;
      x: number;
      y: number | null;
      px: number;
      py: number | null;
    };
    sample: ChartLineDecomposeSample;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineDecomposeFinitePoints(
  points: readonly ChartLineDecomposePoint[] | null | undefined,
): ChartLineDecomposePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineDecomposePoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineDecomposePeriod(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_DECOMPOSE_PERIOD;
  if (value < 2) return 2;
  return Math.floor(value);
}

export function computeCenteredMovingAverage(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normaliseLineDecomposePeriod(period);
  const N = values.length;
  const out: (number | null)[] = new Array(N).fill(null);
  if (N < p) return out;

  if (p % 2 === 1) {
    const half = Math.floor(p / 2);
    for (let i = half; i < N - half; i += 1) {
      let sum = 0;
      let count = 0;
      for (let j = i - half; j <= i + half; j += 1) {
        const v = values[j];
        if (isFiniteNumber(v)) {
          sum += v;
          count += 1;
        }
      }
      if (count > 0) out[i] = sum / count;
    }
  } else {
    // Centered moving average for even period: 2xN weights where first
    // and last entries each contribute 1/2.
    const half = p / 2;
    for (let i = half; i < N - half; i += 1) {
      let sum = 0;
      let weight = 0;
      for (let j = i - half; j <= i + half; j += 1) {
        const v = values[j];
        if (!isFiniteNumber(v)) continue;
        const w = j === i - half || j === i + half ? 0.5 : 1;
        sum += v * w;
        weight += w;
      }
      if (weight > 0) out[i] = sum / weight;
    }
  }
  return out;
}

export function computeLineDecomposeSeasonalPattern(
  detrended: readonly (number | null)[] | null | undefined,
  period: number,
): number[] {
  const p = normaliseLineDecomposePeriod(period);
  if (!Array.isArray(detrended)) return new Array(p).fill(0);

  const phaseSums = new Array(p).fill(0);
  const phaseCounts = new Array(p).fill(0);
  for (let i = 0; i < detrended.length; i += 1) {
    const v = detrended[i];
    if (v === null || v === undefined || !isFiniteNumber(v)) continue;
    const phase = ((i % p) + p) % p;
    phaseSums[phase] += v;
    phaseCounts[phase] += 1;
  }

  const pattern: number[] = new Array(p).fill(0);
  let patternSum = 0;
  let patternValid = 0;
  for (let k = 0; k < p; k += 1) {
    if (phaseCounts[k] > 0) {
      pattern[k] = phaseSums[k] / phaseCounts[k];
      patternSum += pattern[k];
      patternValid += 1;
    }
  }
  // Center the seasonal pattern so its mean is 0 (additive decomposition
  // convention).
  if (patternValid > 0) {
    const meanOfPattern = patternSum / patternValid;
    for (let k = 0; k < p; k += 1) {
      pattern[k] -= meanOfPattern;
    }
  }
  return pattern;
}

export function computeLineDecomposition(
  points: readonly ChartLineDecomposePoint[] | null | undefined,
  period?: number,
): ChartLineDecomposeResult {
  const p = normaliseLineDecomposePeriod(period);
  const finite = getLineDecomposeFinitePoints(points);
  if (finite.length === 0) {
    return {
      samples: [],
      period: p,
      trendValidCount: 0,
      residualValidCount: 0,
      seasonalPattern: new Array(p).fill(0),
      ok: false,
    };
  }
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const ys = sorted.map((s) => s.y);
  const trend = computeCenteredMovingAverage(ys, p);
  const detrended: (number | null)[] = ys.map((y, i) => {
    const t = trend[i];
    if (t === null || t === undefined) return null;
    return y - t;
  });
  const seasonalPattern = computeLineDecomposeSeasonalPattern(detrended, p);

  let trendValid = 0;
  let residualValid = 0;
  const samples: ChartLineDecomposeSample[] = sorted.map((s, i) => {
    const t = trend[i];
    const phase = ((i % p) + p) % p;
    const seasonal = seasonalPattern[phase] ?? 0;
    let residual: number | null = null;
    if (t !== null && t !== undefined && isFiniteNumber(t)) {
      trendValid += 1;
      residual = s.y - t - seasonal;
      residualValid += 1;
    }
    return {
      index: i,
      x: s.x,
      observed: s.y,
      trend: t === null || t === undefined ? null : t,
      seasonal,
      residual,
      phase,
    };
  });

  return {
    samples,
    period: p,
    trendValidCount: trendValid,
    residualValidCount: residualValid,
    seasonalPattern,
    ok: true,
  };
}

const COMPONENT_LABEL: Record<ChartLineDecomposeComponentKind, string> = {
  observed: 'Observed',
  trend: 'Trend',
  seasonal: 'Seasonal',
  residual: 'Residual',
};

function buildPath(
  points: readonly { px: number; py: number | null }[],
): string {
  const parts: string[] = [];
  let openSegment = false;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    if (p.py === null || !isFiniteNumber(p.py)) {
      openSegment = false;
      continue;
    }
    const cmd = !openSegment ? 'M' : 'L';
    parts.push(`${cmd} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
    openSegment = true;
  }
  return parts.join(' ');
}

function normaliseHiddenComponents(
  hidden:
    | ReadonlySet<ChartLineDecomposeComponentKind>
    | readonly ChartLineDecomposeComponentKind[]
    | null
    | undefined,
): Set<ChartLineDecomposeComponentKind> {
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

export function computeLineDecomposeLayout(
  options: ComputeLineDecomposeLayoutOptions,
): ChartLineDecomposeLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_DECOMPOSE_GAP,
    tickCount = DEFAULT_CHART_LINE_DECOMPOSE_TICK_COUNT,
    period,
    observedColor = DEFAULT_CHART_LINE_DECOMPOSE_OBSERVED_COLOR,
    trendColor = DEFAULT_CHART_LINE_DECOMPOSE_TREND_COLOR,
    seasonalColor = DEFAULT_CHART_LINE_DECOMPOSE_SEASONAL_COLOR,
    residualColor = DEFAULT_CHART_LINE_DECOMPOSE_RESIDUAL_COLOR,
    enabledComponents = LINE_DECOMPOSE_COMPONENT_KINDS,
    xMin: xMinOverride,
    xMax: xMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const enabled = enabledComponents.length > 0
    ? enabledComponents.filter((k) => LINE_DECOMPOSE_COMPONENT_KINDS.includes(k))
    : LINE_DECOMPOSE_COMPONENT_KINDS;
  const numPanels = enabled.length;

  const empty: ChartLineDecomposeLayout = {
    ok: false,
    width,
    height,
    panels: [],
    panelMap: {
      observed: null,
      trend: null,
      seasonal: null,
      residual: null,
    },
    xTicks: [],
    xMin: 0,
    xMax: 0,
    innerWidth,
    innerHeight,
    totalPoints: 0,
    finiteCount: 0,
    period: normaliseLineDecomposePeriod(period),
    decomposition: {
      samples: [],
      period: normaliseLineDecomposePeriod(period),
      trendValidCount: 0,
      residualValidCount: 0,
      seasonalPattern: new Array(normaliseLineDecomposePeriod(period)).fill(0),
      ok: false,
    },
  };

  if (innerWidth <= 0 || innerHeight <= 0 || numPanels <= 0) return empty;

  const decomposition = computeLineDecomposition(data, period);
  if (!decomposition.ok || decomposition.samples.length === 0) return empty;

  const totalGap = gap * (numPanels - 1);
  const panelHeight = Math.max(0, (innerHeight - totalGap) / numPanels);
  if (panelHeight <= 0) return empty;

  const xLo = isFiniteNumber(xMinOverride)
    ? xMinOverride
    : decomposition.samples[0]!.x;
  const xHi = isFiniteNumber(xMaxOverride)
    ? xMaxOverride
    : decomposition.samples[decomposition.samples.length - 1]!.x;
  const xRange = Math.max(1e-12, xHi - xLo);

  const projectX = (x: number): number =>
    padding + ((x - xLo) / xRange) * innerWidth;

  const componentValues: Record<
    ChartLineDecomposeComponentKind,
    (number | null)[]
  > = {
    observed: decomposition.samples.map((s) => s.observed),
    trend: decomposition.samples.map((s) => s.trend),
    seasonal: decomposition.samples.map((s) => s.seasonal),
    residual: decomposition.samples.map((s) => s.residual),
  };

  const componentColor: Record<ChartLineDecomposeComponentKind, string> = {
    observed: observedColor,
    trend: trendColor,
    seasonal: seasonalColor,
    residual: residualColor,
  };

  const panels: ChartLineDecomposeLayoutPanel[] = enabled.map((kind, panelIdx) => {
    const panelY = padding + panelIdx * (panelHeight + gap);
    const values = componentValues[kind];
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    let validCount = 0;
    for (const v of values) {
      if (v === null || !isFiniteNumber(v)) continue;
      validCount += 1;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (validCount === 0) {
      lo = -1;
      hi = 1;
    }
    if (lo === hi) {
      lo -= 0.5;
      hi += 0.5;
    }
    // Residual / seasonal panels: pad symmetrically around 0 so the
    // zero reference line stays centered when both signs are present.
    if ((kind === 'residual' || kind === 'seasonal') && lo < 0 && hi > 0) {
      const absMax = Math.max(Math.abs(lo), Math.abs(hi));
      lo = -absMax;
      hi = absMax;
    }
    const yRange = hi - lo;
    const projectY = (y: number): number =>
      panelY + panelHeight - ((y - lo) / yRange) * panelHeight;

    const points = decomposition.samples.map((s, i) => {
      const v = values[i];
      const valid = v !== null && isFiniteNumber(v);
      return {
        index: i,
        x: s.x,
        y: valid ? (v as number) : null,
        px: projectX(s.x),
        py: valid ? projectY(v as number) : null,
      };
    });
    const path = buildPath(points);
    const zeroPy = lo <= 0 && hi >= 0 ? projectY(0) : null;

    return {
      kind,
      label: COMPONENT_LABEL[kind],
      color: componentColor[kind],
      x: padding,
      y: panelY,
      width: innerWidth,
      height: panelHeight,
      yMin: lo,
      yMax: hi,
      yTicks: computeTicks(lo, hi, 3),
      path,
      points,
      validCount,
      zeroPy,
    };
  });

  const panelMap: Record<
    ChartLineDecomposeComponentKind,
    ChartLineDecomposeLayoutPanel | null
  > = {
    observed: null,
    trend: null,
    seasonal: null,
    residual: null,
  };
  for (const panel of panels) panelMap[panel.kind] = panel;

  return {
    ok: true,
    width,
    height,
    panels,
    panelMap,
    xTicks: computeTicks(xLo, xHi, tickCount),
    xMin: xLo,
    xMax: xHi,
    innerWidth,
    innerHeight,
    totalPoints: decomposition.samples.length,
    finiteCount: decomposition.samples.length,
    period: decomposition.period,
    decomposition,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineDecomposeChart(
  data: readonly ChartLineDecomposePoint[] | null | undefined,
  options?: {
    period?: number;
    formatValue?: (n: number) => string;
  },
): string {
  const decomposition = computeLineDecomposition(data, options?.period);
  if (!decomposition.ok || decomposition.samples.length === 0) return 'No data';
  const fmt = options?.formatValue ?? defaultFormatValue;
  return `Seasonal decomposition chart: ${decomposition.samples.length} samples; period ${decomposition.period}; ${decomposition.trendValidCount} trend-valid samples; ${decomposition.residualValidCount} residual-valid samples. Seasonal pattern range: ${fmt(Math.min(...decomposition.seasonalPattern))} to ${fmt(Math.max(...decomposition.seasonalPattern))}.`;
}

export const ChartLineDecompose = forwardRef<
  HTMLDivElement,
  ChartLineDecomposeProps
>(function ChartLineDecompose(
  props: ChartLineDecomposeProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period = DEFAULT_CHART_LINE_DECOMPOSE_PERIOD,
    width = DEFAULT_CHART_LINE_DECOMPOSE_WIDTH,
    height = DEFAULT_CHART_LINE_DECOMPOSE_HEIGHT,
    padding = DEFAULT_CHART_LINE_DECOMPOSE_PADDING,
    gap = DEFAULT_CHART_LINE_DECOMPOSE_GAP,
    tickCount = DEFAULT_CHART_LINE_DECOMPOSE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DECOMPOSE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DECOMPOSE_DOT_RADIUS,
    observedColor = DEFAULT_CHART_LINE_DECOMPOSE_OBSERVED_COLOR,
    trendColor = DEFAULT_CHART_LINE_DECOMPOSE_TREND_COLOR,
    seasonalColor = DEFAULT_CHART_LINE_DECOMPOSE_SEASONAL_COLOR,
    residualColor = DEFAULT_CHART_LINE_DECOMPOSE_RESIDUAL_COLOR,
    gridColor = DEFAULT_CHART_LINE_DECOMPOSE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_DECOMPOSE_AXIS_COLOR,
    residualZeroDashArray = DEFAULT_CHART_LINE_DECOMPOSE_RESIDUAL_ZERO_DASH,
    xMin,
    xMax,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showLegend = true,
    showTooltip = true,
    showPeriodBadge = true,
    showResidualZero = true,
    hiddenComponents: controlledHidden,
    defaultHiddenComponents,
    onHiddenComponentsChange,
    animate = true,
    className,
    ariaLabel = 'Seasonal decomposition chart (observed / trend / seasonal / residual)',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    xLabel,
    onPointClick,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const isControlled = controlledHidden !== undefined;
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    Set<ChartLineDecomposeComponentKind>
  >(() => normaliseHiddenComponents(defaultHiddenComponents));
  const hiddenSet = isControlled
    ? normaliseHiddenComponents(controlledHidden)
    : uncontrolledHidden;

  const enabledComponents = useMemo<ChartLineDecomposeComponentKind[]>(
    () => LINE_DECOMPOSE_COMPONENT_KINDS.filter((k) => !hiddenSet.has(k)),
    [hiddenSet],
  );

  const layout = useMemo(
    () =>
      computeLineDecomposeLayout({
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        period,
        observedColor,
        trendColor,
        seasonalColor,
        residualColor,
        enabledComponents,
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
      }),
    [
      data,
      width,
      height,
      padding,
      gap,
      tickCount,
      period,
      observedColor,
      trendColor,
      seasonalColor,
      residualColor,
      enabledComponents,
      xMin,
      xMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineDecomposeChart(data, {
        period,
        formatValue,
      }),
    [ariaDescription, data, period, formatValue],
  );

  const [hoverPayload, setHoverPayload] = useState<{
    kind: ChartLineDecomposeComponentKind;
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

  const handleToggleComponent = useCallback(
    (kind: ChartLineDecomposeComponentKind) => {
      const next = new Set(hiddenSet);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      if (!isControlled) setUncontrolledHidden(next);
      onHiddenComponentsChange?.(next);
    },
    [hiddenSet, isControlled, onHiddenComponentsChange],
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
        data-section="chart-line-decompose"
        data-empty="true"
        data-period={normaliseLineDecomposePeriod(period)}
        data-total-points={0}
        data-trend-valid-count={0}
        data-residual-valid-count={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-decompose-aria-desc"
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
  const lastPanel = layout.panels[layout.panels.length - 1];
  const lastPanelBottom = lastPanel ? lastPanel.y + lastPanel.height : padding;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-decompose"
      data-empty="false"
      data-period={layout.period}
      data-total-points={layout.totalPoints}
      data-trend-valid-count={layout.decomposition.trendValidCount}
      data-residual-valid-count={layout.decomposition.residualValidCount}
      data-panel-count={layout.panels.length}
      data-hidden-count={hiddenSet.size}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-decompose-aria-desc"
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
        data-section="chart-line-decompose-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showPeriodBadge ? (
          <div
            data-section="chart-line-decompose-badge"
            data-period={layout.period}
            data-trend-valid-count={layout.decomposition.trendValidCount}
            data-residual-valid-count={layout.decomposition.residualValidCount}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: trendColor,
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-decompose-badge-icon"
              aria-hidden="true"
            >
              ⌬
            </span>
            <span data-section="chart-line-decompose-badge-period">
              period {layout.period}
            </span>
            <span data-section="chart-line-decompose-badge-counts">
              {layout.totalPoints} samples
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-decompose-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-decompose-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.panels.map((panel) =>
                panel.yTicks.map((t, i) => {
                  const py =
                    panel.y +
                    panel.height -
                    ((t - panel.yMin) / (panel.yMax - panel.yMin)) *
                      panel.height;
                  return (
                    <line
                      key={`g-${panel.kind}-y-${i}`}
                      data-section="chart-line-decompose-grid-line"
                      data-panel={panel.kind}
                      data-axis="y"
                      x1={panel.x}
                      x2={panel.x + panel.width}
                      y1={py}
                      y2={py}
                    />
                  );
                }),
              )}
              {layout.xTicks.map((t, i) => {
                const px =
                  padding +
                  ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                    layout.innerWidth;
                return (
                  <line
                    key={`g-x-${i}`}
                    data-section="chart-line-decompose-grid-line"
                    data-axis="x"
                    x1={px}
                    x2={px}
                    y1={padding}
                    y2={lastPanelBottom}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-decompose-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              {layout.panels.map((panel) => (
                <g
                  key={`ax-${panel.kind}`}
                  data-section="chart-line-decompose-axis-group"
                  data-panel={panel.kind}
                >
                  <line
                    data-section="chart-line-decompose-axis"
                    data-panel={panel.kind}
                    data-axis="y"
                    x1={panel.x}
                    y1={panel.y}
                    x2={panel.x}
                    y2={panel.y + panel.height}
                  />
                  <line
                    data-section="chart-line-decompose-axis"
                    data-panel={panel.kind}
                    data-axis="x"
                    x1={panel.x}
                    y1={panel.y + panel.height}
                    x2={panel.x + panel.width}
                    y2={panel.y + panel.height}
                  />
                  {panel.yTicks.map((t, i) => {
                    const py =
                      panel.y +
                      panel.height -
                      ((t - panel.yMin) / (panel.yMax - panel.yMin)) *
                        panel.height;
                    return (
                      <g
                        key={`ty-${panel.kind}-${i}`}
                        data-section="chart-line-decompose-tick"
                        data-panel={panel.kind}
                        data-axis="y"
                      >
                        <line x1={panel.x - 4} x2={panel.x} y1={py} y2={py} />
                        <text
                          data-section="chart-line-decompose-tick-label"
                          data-panel={panel.kind}
                          data-axis="y"
                          x={panel.x - 6}
                          y={py + 3}
                          textAnchor="end"
                          fontSize={9}
                          fill={axisColor}
                          stroke="none"
                        >
                          {formatValue(t)}
                        </text>
                      </g>
                    );
                  })}
                  <text
                    data-section="chart-line-decompose-panel-label"
                    data-panel={panel.kind}
                    x={panel.x + panel.width - 4}
                    y={panel.y + 12}
                    textAnchor="end"
                    fontSize={10}
                    fontWeight={600}
                    fill={panel.color}
                    stroke="none"
                  >
                    {panel.label}
                  </text>
                </g>
              ))}
              <g
                data-section="chart-line-decompose-x-ticks"
                data-axis="x"
              >
                {layout.xTicks.map((t, i) => {
                  const px =
                    padding +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.innerWidth;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-decompose-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={lastPanelBottom}
                        y2={lastPanelBottom + 4}
                      />
                      <text
                        data-section="chart-line-decompose-tick-label"
                        data-axis="x"
                        x={px}
                        y={lastPanelBottom + 14}
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
              {xLabel ? (
                <text
                  data-section="chart-line-decompose-x-label"
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
            </g>
          ) : null}

          <g data-section="chart-line-decompose-panels">
            {layout.panels.map((panel) => (
              <g
                key={`p-${panel.kind}`}
                data-section="chart-line-decompose-panel"
                data-panel={panel.kind}
                data-color={panel.color}
                data-valid-count={panel.validCount}
              >
                {showResidualZero &&
                (panel.kind === 'residual' || panel.kind === 'seasonal') &&
                panel.zeroPy !== null ? (
                  <line
                    data-section="chart-line-decompose-zero-line"
                    data-panel={panel.kind}
                    x1={panel.x}
                    x2={panel.x + panel.width}
                    y1={panel.zeroPy}
                    y2={panel.zeroPy}
                    stroke={axisColor}
                    strokeWidth={1}
                    strokeDasharray={residualZeroDashArray}
                  />
                ) : null}
                {panel.path ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${panel.label} panel`}
                    data-section="chart-line-decompose-path"
                    data-panel={panel.kind}
                    data-kind={panel.kind}
                    d={panel.path}
                    fill="none"
                    stroke={panel.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showDots
                  ? panel.points
                      .filter((p) => p.py !== null)
                      .map((p) => {
                        const isHover =
                          hoverPayload?.kind === panel.kind &&
                          hoverPayload?.pointIndex === p.index;
                        const sample = layout.decomposition.samples[p.index]!;
                        return (
                          <circle
                            key={`d-${panel.kind}-${p.index}`}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={`${panel.label} point ${p.index + 1} at x ${formatX(p.x)} y ${formatValue(p.y ?? 0)}`}
                            data-section="chart-line-decompose-dot"
                            data-panel={panel.kind}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y ?? ''}
                            data-hovered={isHover ? 'true' : 'false'}
                            cx={p.px}
                            cy={p.py ?? 0}
                            r={isHover ? dotRadius + 1 : dotRadius}
                            fill={panel.color}
                            stroke="#ffffff"
                            strokeWidth={1}
                            onMouseEnter={() => {
                              setHoverPayload({
                                kind: panel.kind,
                                pointIndex: p.index,
                              });
                              setTooltipPos({ px: p.px, py: p.py ?? 0 });
                            }}
                            onMouseLeave={clearHover}
                            onFocus={() => {
                              setHoverPayload({
                                kind: panel.kind,
                                pointIndex: p.index,
                              });
                              setTooltipPos({ px: p.px, py: p.py ?? 0 });
                            }}
                            onBlur={clearHover}
                            onClick={() =>
                              onPointClick?.({
                                panel,
                                point: p,
                                sample,
                              })
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
              const panel = layout.panelMap[hoverPayload.kind];
              if (!panel) return null;
              const point = panel.points.find(
                (p) => p.index === hoverPayload.pointIndex,
              );
              if (!point) return null;
              const sample = layout.decomposition.samples[point.index];
              if (!sample) return null;
              return (
                <div
                  data-section="chart-line-decompose-tooltip"
                  data-panel={panel.kind}
                  data-point-index={point.index}
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
                    data-section="chart-line-decompose-tooltip-label"
                    style={{ color: panel.color, fontWeight: 600 }}
                  >
                    {panel.label}
                  </div>
                  <div data-section="chart-line-decompose-tooltip-x">
                    x: {formatX(sample.x)}
                  </div>
                  <div data-section="chart-line-decompose-tooltip-observed">
                    obs: {formatValue(sample.observed)}
                  </div>
                  <div data-section="chart-line-decompose-tooltip-trend">
                    trend:{' '}
                    {sample.trend === null ? 'n/a' : formatValue(sample.trend)}
                  </div>
                  <div data-section="chart-line-decompose-tooltip-seasonal">
                    seasonal: {formatValue(sample.seasonal ?? 0)}
                  </div>
                  <div data-section="chart-line-decompose-tooltip-residual">
                    residual:{' '}
                    {sample.residual === null
                      ? 'n/a'
                      : formatValue(sample.residual)}
                  </div>
                  <div data-section="chart-line-decompose-tooltip-phase">
                    phase: {sample.phase}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-decompose-legend"
          role="group"
          aria-label="Component toggles"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
            fontSize: 11,
          }}
        >
          {LINE_DECOMPOSE_COMPONENT_KINDS.map((kind) => {
            const isHidden = hiddenSet.has(kind);
            const color =
              kind === 'observed'
                ? observedColor
                : kind === 'trend'
                  ? trendColor
                  : kind === 'seasonal'
                    ? seasonalColor
                    : residualColor;
            return (
              <button
                key={kind}
                type="button"
                data-section="chart-line-decompose-legend-item"
                data-kind={kind}
                data-hidden={isHidden ? 'true' : 'false'}
                aria-pressed={isHidden ? 'false' : 'true'}
                onClick={() => handleToggleComponent(kind)}
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
                  data-section="chart-line-decompose-legend-swatch"
                  data-kind={kind}
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: color,
                  }}
                />
                <span data-section="chart-line-decompose-legend-label">
                  {COMPONENT_LABEL[kind]}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});

ChartLineDecompose.displayName = 'ChartLineDecompose';
