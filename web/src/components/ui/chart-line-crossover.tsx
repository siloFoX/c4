import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CROSSOVER_WIDTH = 560;
export const DEFAULT_CHART_LINE_CROSSOVER_HEIGHT = 320;
export const DEFAULT_CHART_LINE_CROSSOVER_PADDING = 40;
export const DEFAULT_CHART_LINE_CROSSOVER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CROSSOVER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CROSSOVER_MARKER_SIZE = 7;
export const DEFAULT_CHART_LINE_CROSSOVER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CROSSOVER_PALETTE = [
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
export const DEFAULT_CHART_LINE_CROSSOVER_PRIMARY_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CROSSOVER_REFERENCE_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_CROSSOVER_GOLDEN_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CROSSOVER_DEATH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CROSSOVER_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CROSSOVER_AXIS_COLOR = '#cbd5e1';

export type ChartLineCrossoverKind = 'golden' | 'death';

export interface ChartLineCrossoverPoint {
  x: number;
  y: number;
}

export interface ChartLineCrossoverSeries {
  id: string;
  label: string;
  data: readonly ChartLineCrossoverPoint[];
  color?: string;
}

export interface ChartLineCrossoverSample {
  index: number;
  x: number;
  primaryY: number;
  referenceY: number;
  diff: number;
}

export interface ChartLineCrossover {
  index: number;
  segmentIndex: number;
  x: number;
  y: number;
  kind: ChartLineCrossoverKind;
  fromDiff: number;
  toDiff: number;
  t: number;
}

export interface ChartLineCrossoverLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineCrossoverLayoutLine {
  id: string;
  label: string;
  color: string;
  visible: boolean;
  points: ChartLineCrossoverLayoutPoint[];
  linePath: string;
  finiteCount: number;
  totalCount: number;
}

export interface ChartLineCrossoverLayoutMarker extends ChartLineCrossover {
  px: number;
  py: number;
  baselinePy: number;
}

export interface ChartLineCrossoverLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: { x: number; y: number; width: number; height: number };
  xTicks: number[];
  yTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  primary: ChartLineCrossoverLayoutLine;
  reference: ChartLineCrossoverLayoutLine;
  crossovers: ChartLineCrossoverLayoutMarker[];
  goldenCount: number;
  deathCount: number;
  crossoverCount: number;
  alignedCount: number;
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineCrossoverLayoutOptions {
  primary: ChartLineCrossoverSeries;
  reference: ChartLineCrossoverSeries;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  primaryColor?: string;
  referenceColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineCrossoverProps {
  primary: ChartLineCrossoverSeries;
  reference: ChartLineCrossoverSeries;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  markerSize?: number;
  dotRadius?: number;
  primaryColor?: string;
  referenceColor?: string;
  goldenColor?: string;
  deathColor?: string;
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
  showConfigBadge?: boolean;
  showMarkers?: boolean;
  showMarkerGuides?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onCrossoverClick?: (payload: {
    crossover: ChartLineCrossoverLayoutMarker;
  }) => void;
  onPointClick?: (payload: {
    series: ChartLineCrossoverLayoutLine;
    point: ChartLineCrossoverLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineCrossoverDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_CROSSOVER_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineCrossoverFinitePoints(
  points: readonly ChartLineCrossoverPoint[] | null | undefined,
): ChartLineCrossoverPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineCrossoverPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

/**
 * Align two point series on the x values they share. Only x values
 * present in BOTH series produce an aligned sample; the result is
 * sorted ascending by x. `diff` is `primaryY - referenceY` -- the
 * signal whose zero crossings are the crossover points.
 */
export function alignLineCrossoverSamples(
  primaryPoints: readonly ChartLineCrossoverPoint[] | null | undefined,
  referencePoints: readonly ChartLineCrossoverPoint[] | null | undefined,
): ChartLineCrossoverSample[] {
  const primFinite = getLineCrossoverFinitePoints(primaryPoints);
  const refFinite = getLineCrossoverFinitePoints(referencePoints);
  const refByX = new Map<number, number>();
  for (const p of refFinite) refByX.set(p.x, p.y);

  const aligned: { x: number; primaryY: number; referenceY: number }[] = [];
  for (const p of primFinite) {
    const refY = refByX.get(p.x);
    if (refY !== undefined) {
      aligned.push({ x: p.x, primaryY: p.y, referenceY: refY });
    }
  }
  aligned.sort((a, b) => a.x - b.x);
  return aligned.map((s, i) => ({
    index: i,
    x: s.x,
    primaryY: s.primaryY,
    referenceY: s.referenceY,
    diff: s.primaryY - s.referenceY,
  }));
}

/**
 * Detect crossover points from aligned samples. A crossover sits
 * between two consecutive samples whose `diff` values have strictly
 * opposite signs (`d0 * d1 < 0`). The crossing point is found by
 * linear interpolation of the diff to zero:
 * `t = d0 / (d0 - d1)`, `x = x0 + t * (x1 - x0)`,
 * `y = primaryY0 + t * (primaryY1 - primaryY0)` (both series are
 * equal at the crossing, so either series yields the same y).
 *
 * `kind` is `golden` when the diff rises through zero (the primary
 * crosses ABOVE the reference) and `death` when it falls through
 * zero (the primary crosses BELOW). A sample sitting exactly on zero
 * does not trigger a crossover -- a strict sign change is required.
 */
export function detectLineCrossovers(
  samples: readonly ChartLineCrossoverSample[] | null | undefined,
): ChartLineCrossover[] {
  if (!Array.isArray(samples) || samples.length < 2) return [];
  const crossovers: ChartLineCrossover[] = [];
  for (let i = 1; i < samples.length; i += 1) {
    const s0 = samples[i - 1]!;
    const s1 = samples[i]!;
    const d0 = s0.diff;
    const d1 = s1.diff;
    if (d0 * d1 < 0) {
      const t = d0 / (d0 - d1);
      crossovers.push({
        index: crossovers.length,
        segmentIndex: i,
        x: s0.x + t * (s1.x - s0.x),
        y: s0.primaryY + t * (s1.primaryY - s0.primaryY),
        kind: d1 > 0 ? 'golden' : 'death',
        fromDiff: d0,
        toDiff: d1,
        t,
      });
    }
  }
  return crossovers;
}

export function runLineCrossover(
  primary: ChartLineCrossoverSeries | null | undefined,
  reference: ChartLineCrossoverSeries | null | undefined,
): {
  samples: ChartLineCrossoverSample[];
  crossovers: ChartLineCrossover[];
  goldenCount: number;
  deathCount: number;
  crossoverCount: number;
  alignedCount: number;
} {
  const samples = alignLineCrossoverSamples(primary?.data, reference?.data);
  const crossovers = detectLineCrossovers(samples);
  let goldenCount = 0;
  let deathCount = 0;
  for (const c of crossovers) {
    if (c.kind === 'golden') goldenCount += 1;
    else deathCount += 1;
  }
  return {
    samples,
    crossovers,
    goldenCount,
    deathCount,
    crossoverCount: crossovers.length,
    alignedCount: samples.length,
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

function projectLine(
  series: ChartLineCrossoverSeries,
  color: string,
  visible: boolean,
  projectX: (x: number) => number,
  projectY: (y: number) => number,
): ChartLineCrossoverLayoutLine {
  const finite = getLineCrossoverFinitePoints(series.data);
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const points: ChartLineCrossoverLayoutPoint[] = sorted.map((p, i) => ({
    index: i,
    x: p.x,
    y: p.y,
    px: projectX(p.x),
    py: projectY(p.y),
  }));
  return {
    id: series.id,
    label: series.label,
    color,
    visible,
    points,
    linePath: buildPath(points.map((p) => ({ px: p.px, py: p.py }))),
    finiteCount: finite.length,
    totalCount: series.data?.length ?? 0,
  };
}

export function computeLineCrossoverLayout(
  options: ComputeLineCrossoverLayoutOptions,
): ChartLineCrossoverLayout {
  const {
    primary,
    reference,
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_CROSSOVER_TICK_COUNT,
    primaryColor = DEFAULT_CHART_LINE_CROSSOVER_PRIMARY_COLOR,
    referenceColor = DEFAULT_CHART_LINE_CROSSOVER_REFERENCE_COLOR,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const panel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };
  const emptyLine: ChartLineCrossoverLayoutLine = {
    id: '',
    label: '',
    color: '',
    visible: false,
    points: [],
    linePath: '',
    finiteCount: 0,
    totalCount: 0,
  };
  const empty: ChartLineCrossoverLayout = {
    ok: false,
    width,
    height,
    panel,
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    innerWidth,
    innerHeight,
    primary: emptyLine,
    reference: emptyLine,
    crossovers: [],
    goldenCount: 0,
    deathCount: 0,
    crossoverCount: 0,
    alignedCount: 0,
    totalPoints: 0,
    visibleSeriesCount: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!primary || !reference) return empty;

  const hidden = normaliseHidden(hiddenSeries);
  const primaryVisible = !hidden.has(primary.id);
  const referenceVisible = !hidden.has(reference.id);

  const primFinite = getLineCrossoverFinitePoints(primary.data);
  const refFinite = getLineCrossoverFinitePoints(reference.data);

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let totalPoints = 0;

  const consider = (pts: readonly ChartLineCrossoverPoint[]): void => {
    for (const p of pts) {
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
      if (p.y < yLo) yLo = p.y;
      if (p.y > yHi) yHi = p.y;
    }
  };
  if (primaryVisible) {
    consider(primFinite);
    totalPoints += primFinite.length;
  }
  if (referenceVisible) {
    consider(refFinite);
    totalPoints += refFinite.length;
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
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (y: number): number =>
    panel.y + panel.height - ((y - yLo) / yRange) * panel.height;

  const primaryLine = projectLine(
    primary,
    primary.color ?? primaryColor,
    primaryVisible,
    projectX,
    projectY,
  );
  const referenceLine = projectLine(
    reference,
    reference.color ?? referenceColor,
    referenceVisible,
    projectX,
    projectY,
  );

  const showCross = primaryVisible && referenceVisible;
  const run = runLineCrossover(primary, reference);
  const baselinePy = panel.y + panel.height;
  const crossovers: ChartLineCrossoverLayoutMarker[] = showCross
    ? run.crossovers.map((c) => ({
        ...c,
        px: projectX(c.x),
        py: projectY(c.y),
        baselinePy,
      }))
    : [];

  let goldenCount = 0;
  let deathCount = 0;
  for (const c of crossovers) {
    if (c.kind === 'golden') goldenCount += 1;
    else deathCount += 1;
  }

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount),
    yTicks: computeTicks(yLo, yHi, tickCount),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    innerWidth,
    innerHeight,
    primary: primaryLine,
    reference: referenceLine,
    crossovers,
    goldenCount,
    deathCount,
    crossoverCount: crossovers.length,
    alignedCount: showCross ? run.alignedCount : 0,
    totalPoints,
    visibleSeriesCount:
      (primaryVisible ? 1 : 0) + (referenceVisible ? 1 : 0),
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineCrossoverChart(
  primary: ChartLineCrossoverSeries | null | undefined,
  reference: ChartLineCrossoverSeries | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
  },
): string {
  if (!primary || !reference) return 'No data';
  const hidden = normaliseHidden(options?.hidden);
  if (hidden.has(primary.id) || hidden.has(reference.id)) {
    return 'No data';
  }
  const run = runLineCrossover(primary, reference);
  if (run.alignedCount === 0) {
    return `Line crossover chart: ${primary.label} vs ${reference.label}, no shared x values to compare.`;
  }
  return `Line crossover chart: ${primary.label} vs ${reference.label}, ${run.goldenCount} golden crosses and ${run.deathCount} death crosses across ${run.alignedCount} aligned points.`;
}

export const ChartLineCrossover = forwardRef<
  HTMLDivElement,
  ChartLineCrossoverProps
>(function ChartLineCrossover(
  props: ChartLineCrossoverProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    primary,
    reference,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_CROSSOVER_WIDTH,
    height = DEFAULT_CHART_LINE_CROSSOVER_HEIGHT,
    padding = DEFAULT_CHART_LINE_CROSSOVER_PADDING,
    tickCount = DEFAULT_CHART_LINE_CROSSOVER_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CROSSOVER_STROKE_WIDTH,
    markerSize = DEFAULT_CHART_LINE_CROSSOVER_MARKER_SIZE,
    dotRadius = DEFAULT_CHART_LINE_CROSSOVER_DOT_RADIUS,
    primaryColor = DEFAULT_CHART_LINE_CROSSOVER_PRIMARY_COLOR,
    referenceColor = DEFAULT_CHART_LINE_CROSSOVER_REFERENCE_COLOR,
    goldenColor = DEFAULT_CHART_LINE_CROSSOVER_GOLDEN_COLOR,
    deathColor = DEFAULT_CHART_LINE_CROSSOVER_DEATH_COLOR,
    gridColor = DEFAULT_CHART_LINE_CROSSOVER_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CROSSOVER_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showLegend = true,
    showTooltip = true,
    showConfigBadge = true,
    showMarkers = true,
    showMarkerGuides = true,
    animate = true,
    className,
    ariaLabel = 'Line crossover chart marking golden-cross and death-cross points',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    xLabel,
    yLabel,
    onCrossoverClick,
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

  const markerHalf =
    isFiniteNumber(markerSize) && markerSize > 0 ? markerSize : 0;

  const layout = useMemo(
    () =>
      computeLineCrossoverLayout({
        primary,
        reference,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        tickCount,
        primaryColor,
        referenceColor,
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(yMin) ? { yMin } : {}),
        ...(isFiniteNumber(yMax) ? { yMax } : {}),
      }),
    [
      primary,
      reference,
      hiddenSet,
      width,
      height,
      padding,
      tickCount,
      primaryColor,
      referenceColor,
      xMin,
      xMax,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineCrossoverChart(primary, reference, { hidden: hiddenSet }),
    [ariaDescription, primary, reference, hiddenSet],
  );

  const [hoverPayload, setHoverPayload] = useState<
    | { type: 'crossover'; index: number }
    | { type: 'point'; seriesKind: 'primary' | 'reference'; index: number }
    | null
  >(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHoverPayload(null);
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

  const allTotalPoints = useMemo(
    () =>
      getLineCrossoverFinitePoints(primary?.data).length +
      getLineCrossoverFinitePoints(reference?.data).length,
    [primary, reference],
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
        data-section="chart-line-crossover"
        data-empty="true"
        data-golden-count={0}
        data-death-count={0}
        data-crossover-count={0}
        data-aligned-count={0}
        data-total-points={0}
        data-visible-series-count={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-crossover-aria-desc"
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
  const lines: { kind: 'primary' | 'reference'; line: ChartLineCrossoverLayoutLine }[] =
    [
      { kind: 'primary', line: layout.primary },
      { kind: 'reference', line: layout.reference },
    ];

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-crossover"
      data-empty="false"
      data-golden-count={layout.goldenCount}
      data-death-count={layout.deathCount}
      data-crossover-count={layout.crossoverCount}
      data-aligned-count={layout.alignedCount}
      data-total-points={layout.totalPoints}
      data-visible-series-count={layout.visibleSeriesCount}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-crossover-aria-desc"
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
        data-section="chart-line-crossover-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-crossover-badge"
            data-golden-count={layout.goldenCount}
            data-death-count={layout.deathCount}
            data-aligned-count={layout.alignedCount}
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
              data-section="chart-line-crossover-badge-icon"
              aria-hidden="true"
            >
              XO
            </span>
            <span
              data-section="chart-line-crossover-badge-golden"
              style={{ color: goldenColor }}
            >
              gold={layout.goldenCount}
            </span>
            <span
              data-section="chart-line-crossover-badge-death"
              style={{ color: deathColor }}
            >
              death={layout.deathCount}
            </span>
            <span data-section="chart-line-crossover-badge-aligned">
              aligned={layout.alignedCount}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-crossover-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-crossover-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => {
                const py =
                  layout.panel.y +
                  layout.panel.height -
                  ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                    layout.panel.height;
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-crossover-grid-line"
                    data-axis="y"
                    x1={layout.panel.x}
                    x2={layout.panel.x + layout.panel.width}
                    y1={py}
                    y2={py}
                  />
                );
              })}
              {layout.xTicks.map((t, i) => {
                const px =
                  layout.panel.x +
                  ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                    layout.panel.width;
                return (
                  <line
                    key={`gx-${i}`}
                    data-section="chart-line-crossover-grid-line"
                    data-axis="x"
                    x1={px}
                    x2={px}
                    y1={layout.panel.y}
                    y2={layout.panel.y + layout.panel.height}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-crossover-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-crossover-axis"
                data-axis="x"
                x1={layout.panel.x}
                y1={layout.panel.y + layout.panel.height}
                x2={layout.panel.x + layout.panel.width}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-crossover-axis"
                data-axis="y"
                x1={layout.panel.x}
                y1={layout.panel.y}
                x2={layout.panel.x}
                y2={layout.panel.y + layout.panel.height}
              />
              <g data-section="chart-line-crossover-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-crossover-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.panel.y + layout.panel.height}
                        y2={layout.panel.y + layout.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-crossover-tick-label"
                        data-axis="x"
                        x={px}
                        y={layout.panel.y + layout.panel.height + 14}
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
              <g data-section="chart-line-crossover-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-crossover-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-crossover-tick-label"
                        data-axis="y"
                        x={layout.panel.x - 6}
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
                  data-section="chart-line-crossover-x-label"
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
              {yLabel ? (
                <text
                  data-section="chart-line-crossover-y-label"
                  transform={`rotate(-90 12 ${layout.panel.y + layout.panel.height / 2})`}
                  x={12}
                  y={layout.panel.y + layout.panel.height / 2}
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

          <g data-section="chart-line-crossover-series">
            {lines.map(({ kind, line }) =>
              line.visible && line.linePath ? (
                <g
                  key={kind}
                  data-section="chart-line-crossover-series-group"
                  data-series-kind={kind}
                  data-series-id={line.id}
                  data-series-color={line.color}
                  data-series-finite-count={line.finiteCount}
                >
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${line.label} line`}
                    data-section="chart-line-crossover-line-path"
                    data-series-kind={kind}
                    data-series-id={line.id}
                    d={line.linePath}
                    fill="none"
                    stroke={line.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {showDots
                    ? line.points.map((p) => {
                        const isHover =
                          hoverPayload?.type === 'point' &&
                          hoverPayload.seriesKind === kind &&
                          hoverPayload.index === p.index;
                        return (
                          <circle
                            key={`d-${p.index}`}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={`${line.label} point ${p.index + 1} at x ${formatX(p.x)}, y ${formatValue(p.y)}`}
                            data-section="chart-line-crossover-dot"
                            data-series-kind={kind}
                            data-series-id={line.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-hovered={isHover ? 'true' : 'false'}
                            cx={p.px}
                            cy={p.py}
                            r={isHover ? dotRadius + 1 : dotRadius}
                            fill={line.color}
                            stroke="#ffffff"
                            strokeWidth={1}
                            onMouseEnter={() => {
                              setHoverPayload({
                                type: 'point',
                                seriesKind: kind,
                                index: p.index,
                              });
                              setTooltipPos({ px: p.px, py: p.py });
                            }}
                            onMouseLeave={clearHover}
                            onFocus={() => {
                              setHoverPayload({
                                type: 'point',
                                seriesKind: kind,
                                index: p.index,
                              });
                              setTooltipPos({ px: p.px, py: p.py });
                            }}
                            onBlur={clearHover}
                            onClick={() =>
                              onPointClick?.({ series: line, point: p })
                            }
                          />
                        );
                      })
                    : null}
                </g>
              ) : null,
            )}
          </g>

          {showMarkers ? (
            <g data-section="chart-line-crossover-markers">
              {layout.crossovers.map((c) => {
                const color =
                  c.kind === 'golden' ? goldenColor : deathColor;
                const shape =
                  c.kind === 'golden'
                    ? `M ${c.px} ${c.py - markerHalf} L ${c.px - markerHalf} ${c.py + markerHalf} L ${c.px + markerHalf} ${c.py + markerHalf} Z`
                    : `M ${c.px} ${c.py + markerHalf} L ${c.px - markerHalf} ${c.py - markerHalf} L ${c.px + markerHalf} ${c.py - markerHalf} Z`;
                return (
                  <g
                    key={`x-${c.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${c.kind === 'golden' ? 'Golden' : 'Death'} cross at x ${formatX(c.x)}, value ${formatValue(c.y)}`}
                    data-section="chart-line-crossover-marker"
                    data-kind={c.kind}
                    data-crossover-index={c.index}
                    data-segment-index={c.segmentIndex}
                    data-x={c.x}
                    data-y={c.y}
                    onMouseEnter={() => {
                      setHoverPayload({ type: 'crossover', index: c.index });
                      setTooltipPos({ px: c.px, py: c.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverPayload({ type: 'crossover', index: c.index });
                      setTooltipPos({ px: c.px, py: c.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => onCrossoverClick?.({ crossover: c })}
                  >
                    {showMarkerGuides ? (
                      <line
                        data-section="chart-line-crossover-marker-guide"
                        data-kind={c.kind}
                        x1={c.px}
                        x2={c.px}
                        y1={c.py}
                        y2={c.baselinePy}
                        stroke={color}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        strokeOpacity={0.6}
                      />
                    ) : null}
                    <path
                      data-section="chart-line-crossover-marker-shape"
                      data-kind={c.kind}
                      d={shape}
                      fill={color}
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoverPayload && tooltipPos
          ? (() => {
              if (hoverPayload.type === 'crossover') {
                const c = layout.crossovers.find(
                  (x) => x.index === hoverPayload.index,
                );
                if (!c) return null;
                const color =
                  c.kind === 'golden' ? goldenColor : deathColor;
                return (
                  <div
                    data-section="chart-line-crossover-tooltip"
                    data-tooltip-kind="crossover"
                    data-crossover-index={c.index}
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
                      data-section="chart-line-crossover-tooltip-kind"
                      style={{ color, fontWeight: 600 }}
                    >
                      {c.kind === 'golden'
                        ? 'Golden cross'
                        : 'Death cross'}
                    </div>
                    <div data-section="chart-line-crossover-tooltip-x">
                      x: {formatX(c.x)}
                    </div>
                    <div data-section="chart-line-crossover-tooltip-y">
                      y: {formatValue(c.y)}
                    </div>
                    <div data-section="chart-line-crossover-tooltip-diff">
                      diff: {formatValue(c.fromDiff)} -&gt;{' '}
                      {formatValue(c.toDiff)}
                    </div>
                  </div>
                );
              }
              const line =
                hoverPayload.seriesKind === 'primary'
                  ? layout.primary
                  : layout.reference;
              const p = line.points.find(
                (x) => x.index === hoverPayload.index,
              );
              if (!p) return null;
              return (
                <div
                  data-section="chart-line-crossover-tooltip"
                  data-tooltip-kind="point"
                  data-series-kind={hoverPayload.seriesKind}
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
                    minWidth: 150,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-crossover-tooltip-label"
                    style={{ color: line.color, fontWeight: 600 }}
                  >
                    {line.label}
                  </div>
                  <div data-section="chart-line-crossover-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div data-section="chart-line-crossover-tooltip-y">
                    y: {formatValue(p.y)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-crossover-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          {lines.map(({ kind, line }) => {
            const isHidden = hiddenSet.has(line.id);
            return (
              <button
                key={kind}
                type="button"
                data-section="chart-line-crossover-legend-item"
                data-series-kind={kind}
                data-series-id={line.id}
                data-hidden={isHidden ? 'true' : 'false'}
                onClick={() => handleToggle(line.id)}
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
                  data-section="chart-line-crossover-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: line.color,
                  }}
                />
                <span data-section="chart-line-crossover-legend-label">
                  {line.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-crossover-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.goldenCount} golden / {layout.deathCount} death
          </span>
          <span
            data-section="chart-line-crossover-legend-total-points"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {allTotalPoints} total points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineCrossover.displayName = 'ChartLineCrossover';
