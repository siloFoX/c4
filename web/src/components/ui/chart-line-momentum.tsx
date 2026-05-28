import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_MOMENTUM_WIDTH = 560;
export const DEFAULT_CHART_LINE_MOMENTUM_HEIGHT = 400;
export const DEFAULT_CHART_LINE_MOMENTUM_PADDING = 40;
export const DEFAULT_CHART_LINE_MOMENTUM_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MOMENTUM_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_MOMENTUM_MOMENTUM_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_MOMENTUM_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MOMENTUM_PERIOD = 10;
export const DEFAULT_CHART_LINE_MOMENTUM_SUB_HEIGHT_RATIO = 0.32;
export const DEFAULT_CHART_LINE_MOMENTUM_FILL_OPACITY = 0.2;
export const DEFAULT_CHART_LINE_MOMENTUM_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MOMENTUM_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MOMENTUM_ZERO_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_MOMENTUM_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MOMENTUM_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_MOMENTUM_PALETTE = [
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

export type ChartLineMomentumSign = 'positive' | 'negative' | 'zero';

export interface ChartLineMomentumPoint {
  x: number;
  y: number;
}

export interface ChartLineMomentumSeries {
  id: string;
  label: string;
  data: readonly ChartLineMomentumPoint[];
  color?: string;
  period?: number;
}

export interface ChartLineMomentumSample {
  index: number;
  x: number;
  y: number;
  momentum: number | null;
  sign: ChartLineMomentumSign;
}

export interface ChartLineMomentumLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  momentum: number | null;
  momentumPy: number | null;
  sign: ChartLineMomentumSign;
}

export interface ChartLineMomentumLayoutSeries {
  id: string;
  label: string;
  color: string;
  period: number;
  points: ChartLineMomentumLayoutPoint[];
  path: string;
  momentumPath: string;
  positivePath: string;
  negativePath: string;
  finiteCount: number;
  totalCount: number;
  momentumValidCount: number;
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  latestMomentum: number | null;
  latestSign: ChartLineMomentumSign;
}

export interface ComputeLineMomentumLayoutResult {
  series: ChartLineMomentumLayoutSeries[];
  xTicks: number[];
  yTicks: number[];
  momentumTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  momentumMin: number;
  momentumMax: number;
  innerWidth: number;
  mainHeight: number;
  subHeight: number;
  subTop: number;
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineMomentumLayoutOptions {
  series: readonly ChartLineMomentumSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  period?: number;
  subHeightRatio?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  momentumMin?: number;
  momentumMax?: number;
}

export interface ChartLineMomentumProps {
  series: readonly ChartLineMomentumSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  period?: number;
  subHeightRatio?: number;
  strokeWidth?: number;
  momentumStrokeWidth?: number;
  dotRadius?: number;
  fillOpacity?: number;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  momentumMin?: number;
  momentumMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showSignBadge?: boolean;
  showMomentumFill?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatMomentum?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  momentumLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineMomentumLayoutSeries;
    point: ChartLineMomentumLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineMomentumSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineMomentumDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_MOMENTUM_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineMomentumFinitePoints(
  points: readonly ChartLineMomentumPoint[] | null | undefined,
): ChartLineMomentumPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineMomentumPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineMomentumPeriod(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_MOMENTUM_PERIOD;
  if (value < 1) return 1;
  return Math.floor(value);
}

export function normaliseLineMomentumSubHeightRatio(value: unknown): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_CHART_LINE_MOMENTUM_SUB_HEIGHT_RATIO;
  }
  if (value <= 0) return 0.1;
  if (value >= 1) return 0.9;
  return value;
}

export function classifyLineMomentumSign(
  momentum: number | null,
): ChartLineMomentumSign {
  if (momentum === null || !isFiniteNumber(momentum)) return 'zero';
  if (momentum > 0) return 'positive';
  if (momentum < 0) return 'negative';
  return 'zero';
}

export function computeLineMomentumValues(
  points: readonly ChartLineMomentumPoint[] | null | undefined,
  period?: number,
): (number | null)[] {
  const finite = getLineMomentumFinitePoints(points);
  if (finite.length === 0) return [];
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const p = normaliseLineMomentumPeriod(period);
  const out: (number | null)[] = new Array(sorted.length).fill(null);
  for (let i = p; i < sorted.length; i += 1) {
    const cur = sorted[i]!.y;
    const lag = sorted[i - p]!.y;
    if (isFiniteNumber(cur) && isFiniteNumber(lag)) {
      out[i] = cur - lag;
    }
  }
  return out;
}

export function buildLineMomentumSamples(
  points: readonly ChartLineMomentumPoint[] | null | undefined,
  period?: number,
): ChartLineMomentumSample[] {
  const finite = getLineMomentumFinitePoints(points);
  if (finite.length === 0) return [];
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const momentums = computeLineMomentumValues(sorted, period);
  return sorted.map((p, i) => ({
    index: i,
    x: p.x,
    y: p.y,
    momentum: momentums[i] ?? null,
    sign: classifyLineMomentumSign(momentums[i] ?? null),
  }));
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

function buildSignedPath(
  pts: readonly { px: number; py: number; sign: ChartLineMomentumSign }[],
  target: ChartLineMomentumSign,
): string {
  const segments: { px: number; py: number }[][] = [];
  let cur: { px: number; py: number }[] = [];
  for (const p of pts) {
    if (p.sign === target) {
      cur.push({ px: p.px, py: p.py });
    } else if (cur.length > 0) {
      segments.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) segments.push(cur);
  return segments.map((s) => buildPath(s)).join(' ');
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

export function computeLineMomentumLayout(
  options: ComputeLineMomentumLayoutOptions,
): ComputeLineMomentumLayoutResult {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_MOMENTUM_TICK_COUNT,
    period,
    subHeightRatio,
    defaultColors = DEFAULT_CHART_LINE_MOMENTUM_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
    momentumMin: momMinOverride,
    momentumMax: momMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const subRatio = normaliseLineMomentumSubHeightRatio(subHeightRatio);
  const gap = 16;
  const subHeight = Math.max(0, (innerHeight - gap) * subRatio);
  const mainHeight = Math.max(0, innerHeight - subHeight - gap);
  const subTop = padding + mainHeight + gap;

  const empty: ComputeLineMomentumLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    momentumTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    momentumMin: 0,
    momentumMax: 0,
    innerWidth,
    mainHeight,
    subHeight,
    subTop,
    totalPoints: 0,
    visibleSeriesCount: 0,
  };

  if (innerWidth <= 0 || mainHeight <= 0 || subHeight <= 0) return empty;
  if (!Array.isArray(series) || series.length === 0) return empty;

  const hidden = normaliseHidden(hiddenSeries);
  const visible = series.filter((s) => !hidden.has(s.id));
  if (visible.length === 0) return empty;

  const chartPeriod = normaliseLineMomentumPeriod(period);

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let momMin = Number.POSITIVE_INFINITY;
  let momMax = Number.NEGATIVE_INFINITY;
  let totalPoints = 0;

  const sortedBySeries = new Map<string, ChartLineMomentumPoint[]>();
  const momentumBySeries = new Map<string, (number | null)[]>();
  const periodBySeries = new Map<string, number>();

  for (const s of visible) {
    const finite = getLineMomentumFinitePoints(s.data).slice().sort((a, b) => a.x - b.x);
    sortedBySeries.set(s.id, finite);
    totalPoints += finite.length;
    const seriesPeriod = normaliseLineMomentumPeriod(s.period ?? chartPeriod);
    periodBySeries.set(s.id, seriesPeriod);
    const momentums = computeLineMomentumValues(finite, seriesPeriod);
    momentumBySeries.set(s.id, momentums);
    for (const p of finite) {
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
      if (p.y < yLo) yLo = p.y;
      if (p.y > yHi) yHi = p.y;
    }
    for (const m of momentums) {
      if (m !== null && isFiniteNumber(m)) {
        if (m < momMin) momMin = m;
        if (m > momMax) momMax = m;
      }
    }
  }

  if (totalPoints === 0) return empty;

  if (isFiniteNumber(xMinOverride)) xLo = xMinOverride;
  if (isFiniteNumber(xMaxOverride)) xHi = xMaxOverride;
  if (isFiniteNumber(yMinOverride)) yLo = yMinOverride;
  if (isFiniteNumber(yMaxOverride)) yHi = yMaxOverride;
  if (isFiniteNumber(momMinOverride)) momMin = momMinOverride;
  if (isFiniteNumber(momMaxOverride)) momMax = momMaxOverride;

  if (!Number.isFinite(momMin) || !Number.isFinite(momMax)) {
    momMin = -1;
    momMax = 1;
  }

  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  if (momMin === momMax) {
    momMin -= 0.5;
    momMax += 0.5;
  }

  // Center momentum range on zero so the zero line sits in the middle
  // when both signs are present, otherwise keep the natural envelope.
  if (momMin < 0 && momMax > 0) {
    const absMax = Math.max(Math.abs(momMin), Math.abs(momMax));
    momMin = -absMax;
    momMax = absMax;
  }

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;
  const momRange = momMax - momMin;

  const projectX = (x: number): number =>
    padding + ((x - xLo) / xRange) * innerWidth;
  const projectY = (y: number): number =>
    padding + mainHeight - ((y - yLo) / yRange) * mainHeight;
  const projectMomentum = (m: number): number =>
    subTop + subHeight - ((m - momMin) / momRange) * subHeight;

  const layoutSeries: ChartLineMomentumLayoutSeries[] = visible.map((s, idx) => {
    const finite = sortedBySeries.get(s.id) ?? [];
    const momentums = momentumBySeries.get(s.id) ?? [];
    const color =
      s.color ?? defaultColors[idx % defaultColors.length] ?? DEFAULT_CHART_LINE_MOMENTUM_PALETTE[0]!;
    const seriesPeriod = periodBySeries.get(s.id) ?? chartPeriod;

    let positiveCount = 0;
    let negativeCount = 0;
    let zeroCount = 0;
    let validCount = 0;
    let latestMomentum: number | null = null;
    let latestSign: ChartLineMomentumSign = 'zero';

    const layoutPoints: ChartLineMomentumLayoutPoint[] = finite.map((p, i) => {
      const m = momentums[i] ?? null;
      const sign = classifyLineMomentumSign(m);
      if (m !== null && isFiniteNumber(m)) {
        validCount += 1;
        if (sign === 'positive') positiveCount += 1;
        else if (sign === 'negative') negativeCount += 1;
        else zeroCount += 1;
        latestMomentum = m;
        latestSign = sign;
      }
      return {
        index: i,
        x: p.x,
        y: p.y,
        px: projectX(p.x),
        py: projectY(p.y),
        momentum: m,
        momentumPy: m !== null && isFiniteNumber(m) ? projectMomentum(m) : null,
        sign,
      };
    });

    const path = buildPath(layoutPoints);
    const momentumPoints = layoutPoints
      .filter((p) => p.momentumPy !== null)
      .map((p) => ({ px: p.px, py: p.momentumPy!, sign: p.sign }));
    const momentumPath = buildPath(momentumPoints);
    const positivePath = buildSignedPath(momentumPoints, 'positive');
    const negativePath = buildSignedPath(momentumPoints, 'negative');

    return {
      id: s.id,
      label: s.label,
      color,
      period: seriesPeriod,
      points: layoutPoints,
      path,
      momentumPath,
      positivePath,
      negativePath,
      finiteCount: finite.length,
      totalCount: s.data?.length ?? 0,
      momentumValidCount: validCount,
      positiveCount,
      negativeCount,
      zeroCount,
      latestMomentum,
      latestSign,
    };
  });

  return {
    series: layoutSeries,
    xTicks: computeTicks(xLo, xHi, tickCount),
    yTicks: computeTicks(yLo, yHi, tickCount),
    momentumTicks: computeTicks(momMin, momMax, 3),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    momentumMin: momMin,
    momentumMax: momMax,
    innerWidth,
    mainHeight,
    subHeight,
    subTop,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineMomentumChart(
  series: readonly ChartLineMomentumSeries[] | null | undefined,
  hidden?: ReadonlySet<string> | readonly string[],
  period?: number,
  formatMomentum: (n: number) => string = defaultFormatValue,
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const chartPeriod = normaliseLineMomentumPeriod(period);

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const finite = getLineMomentumFinitePoints(s.data);
    totalPoints += finite.length;
    const seriesPeriod = normaliseLineMomentumPeriod(s.period ?? chartPeriod);
    const momentums = computeLineMomentumValues(finite, seriesPeriod);
    let latest: number | null = null;
    for (let i = momentums.length - 1; i >= 0; i -= 1) {
      const m = momentums[i];
      if (m !== null && isFiniteNumber(m)) {
        latest = m;
        break;
      }
    }
    summaries.push(
      `${s.label}: period ${seriesPeriod}; latest momentum ${
        latest === null ? 'n/a' : formatMomentum(latest)
      }`,
    );
  }
  if (totalPoints === 0) return 'No data';

  return `Line chart with momentum oscillator across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

// (v1.11.1118, TODO 11.1100) Stable empty default for the `series`
// prop so a missing/undefined series never crashes (e.g. the gallery
// passes `data`, not `series`). computeLineMomentumLayout guards its
// input, but the allTotalPoints useMemo called `series.reduce(...)`
// directly -- undefined.reduce threw and tripped the GalleryTile's
// UIErrorBoundary. A module-level const keeps the useMemo deps stable.
const EMPTY_MOMENTUM_SERIES: readonly ChartLineMomentumSeries[] = [];

export const ChartLineMomentum = forwardRef<
  HTMLDivElement,
  ChartLineMomentumProps
>(function ChartLineMomentum(
  props: ChartLineMomentumProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series = EMPTY_MOMENTUM_SERIES,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_MOMENTUM_WIDTH,
    height = DEFAULT_CHART_LINE_MOMENTUM_HEIGHT,
    padding = DEFAULT_CHART_LINE_MOMENTUM_PADDING,
    tickCount = DEFAULT_CHART_LINE_MOMENTUM_TICK_COUNT,
    period = DEFAULT_CHART_LINE_MOMENTUM_PERIOD,
    subHeightRatio = DEFAULT_CHART_LINE_MOMENTUM_SUB_HEIGHT_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_MOMENTUM_STROKE_WIDTH,
    momentumStrokeWidth = DEFAULT_CHART_LINE_MOMENTUM_MOMENTUM_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MOMENTUM_DOT_RADIUS,
    fillOpacity = DEFAULT_CHART_LINE_MOMENTUM_FILL_OPACITY,
    positiveColor = DEFAULT_CHART_LINE_MOMENTUM_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_MOMENTUM_NEGATIVE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_MOMENTUM_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_MOMENTUM_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_MOMENTUM_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    momentumMin,
    momentumMax,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showSignBadge = true,
    showMomentumFill = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with momentum oscillator',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatMomentum = defaultFormatValue,
    formatX = defaultFormatValue,
    xLabel,
    yLabel,
    momentumLabel = 'Momentum',
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
      computeLineMomentumLayout({
        series,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        tickCount,
        period,
        subHeightRatio,
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(yMin) ? { yMin } : {}),
        ...(isFiniteNumber(yMax) ? { yMax } : {}),
        ...(isFiniteNumber(momentumMin) ? { momentumMin } : {}),
        ...(isFiniteNumber(momentumMax) ? { momentumMax } : {}),
      }),
    [
      series,
      hiddenSet,
      width,
      height,
      padding,
      tickCount,
      period,
      subHeightRatio,
      xMin,
      xMax,
      yMin,
      yMax,
      momentumMin,
      momentumMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineMomentumChart(series, hiddenSet, period, formatMomentum),
    [ariaDescription, series, hiddenSet, period, formatMomentum],
  );

  const [hoverPayload, setHoverPayload] = useState<{
    seriesId: string;
    pointIndex: number;
  } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ px: number; py: number } | null>(
    null,
  );

  const clearHover = useCallback(() => {
    setHoverPayload(null);
    setTooltipPos(null);
  }, []);

  const handleToggle = useCallback(
    (s: ChartLineMomentumSeries) => {
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
        (acc, s) => acc + getLineMomentumFinitePoints(s.data).length,
        0,
      ),
    [series],
  );

  const dominantSign = useMemo<{
    sign: ChartLineMomentumSign;
    seriesId: string;
    momentum: number | null;
  }>(() => {
    let best: {
      sign: ChartLineMomentumSign;
      seriesId: string;
      momentum: number | null;
      absVal: number;
    } = { sign: 'zero', seriesId: '', momentum: null, absVal: -1 };
    for (const s of layout.series) {
      if (s.latestMomentum !== null) {
        const a = Math.abs(s.latestMomentum);
        if (a > best.absVal) {
          best = {
            sign: s.latestSign,
            seriesId: s.id,
            momentum: s.latestMomentum,
            absVal: a,
          };
        }
      }
    }
    return { sign: best.sign, seriesId: best.seriesId, momentum: best.momentum };
  }, [layout.series]);

  const badgeColor =
    dominantSign.sign === 'positive'
      ? positiveColor
      : dominantSign.sign === 'negative'
        ? negativeColor
        : zeroColor;

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
        data-section="chart-line-momentum"
        data-empty="true"
        data-series-count={series.length}
        data-visible-series-count={0}
        data-total-points={0}
        data-period={normaliseLineMomentumPeriod(period)}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-momentum-aria-desc"
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
  const subBottom = layout.subTop + layout.subHeight;
  const zeroPy =
    layout.subTop +
    layout.subHeight -
    ((0 - layout.momentumMin) / (layout.momentumMax - layout.momentumMin)) *
      layout.subHeight;
  const zeroLineVisible = layout.momentumMin <= 0 && layout.momentumMax >= 0;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-momentum"
      data-empty="false"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-period={normaliseLineMomentumPeriod(period)}
      data-dominant-sign={dominantSign.sign}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-momentum-aria-desc"
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
        data-section="chart-line-momentum-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showSignBadge && dominantSign.momentum !== null ? (
          <div
            data-section="chart-line-momentum-badge"
            data-sign={dominantSign.sign}
            data-series-id={dominantSign.seriesId}
            data-momentum={dominantSign.momentum}
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
              data-section="chart-line-momentum-badge-icon"
              aria-hidden="true"
            >
              {dominantSign.sign === 'positive'
                ? '▲'
                : dominantSign.sign === 'negative'
                  ? '▼'
                  : '◆'}
            </span>
            <span data-section="chart-line-momentum-badge-value">
              {formatMomentum(dominantSign.momentum)}
            </span>
            <span data-section="chart-line-momentum-badge-label">
              {dominantSign.sign} momentum
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-momentum-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-momentum-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => {
                const py =
                  padding +
                  layout.mainHeight -
                  ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                    layout.mainHeight;
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-momentum-grid-line"
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
                    data-section="chart-line-momentum-grid-line"
                    data-axis="x"
                    x1={px}
                    x2={px}
                    y1={padding}
                    y2={padding + layout.mainHeight}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-momentum-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-momentum-axis"
                data-axis="x"
                data-panel="main"
                x1={padding}
                y1={padding + layout.mainHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.mainHeight}
              />
              <line
                data-section="chart-line-momentum-axis"
                data-axis="y"
                data-panel="main"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.mainHeight}
              />
              <line
                data-section="chart-line-momentum-axis"
                data-axis="x"
                data-panel="sub"
                x1={padding}
                y1={subBottom}
                x2={padding + layout.innerWidth}
                y2={subBottom}
              />
              <line
                data-section="chart-line-momentum-axis"
                data-axis="y"
                data-panel="sub"
                x1={padding}
                y1={layout.subTop}
                x2={padding}
                y2={subBottom}
              />
              <g data-section="chart-line-momentum-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    padding +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.innerWidth;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-momentum-tick"
                      data-axis="x"
                    >
                      <line x1={px} x2={px} y1={subBottom} y2={subBottom + 4} />
                      <text
                        data-section="chart-line-momentum-tick-label"
                        data-axis="x"
                        x={px}
                        y={subBottom + 14}
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
              <g data-section="chart-line-momentum-ticks" data-axis="y" data-panel="main">
                {layout.yTicks.map((t, i) => {
                  const py =
                    padding +
                    layout.mainHeight -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.mainHeight;
                  return (
                    <g
                      key={`tym-${i}`}
                      data-section="chart-line-momentum-tick"
                      data-axis="y"
                      data-panel="main"
                    >
                      <line x1={padding - 4} x2={padding} y1={py} y2={py} />
                      <text
                        data-section="chart-line-momentum-tick-label"
                        data-axis="y"
                        data-panel="main"
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
              <g
                data-section="chart-line-momentum-ticks"
                data-axis="y"
                data-panel="sub"
              >
                {layout.momentumTicks.map((t, i) => {
                  const py =
                    layout.subTop +
                    layout.subHeight -
                    ((t - layout.momentumMin) /
                      (layout.momentumMax - layout.momentumMin)) *
                      layout.subHeight;
                  return (
                    <g
                      key={`tys-${i}`}
                      data-section="chart-line-momentum-tick"
                      data-axis="y"
                      data-panel="sub"
                    >
                      <line x1={padding - 4} x2={padding} y1={py} y2={py} />
                      <text
                        data-section="chart-line-momentum-tick-label"
                        data-axis="y"
                        data-panel="sub"
                        x={padding - 6}
                        y={py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatMomentum(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              {xLabel ? (
                <text
                  data-section="chart-line-momentum-x-label"
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
                  data-section="chart-line-momentum-y-label"
                  data-panel="main"
                  transform={`rotate(-90 12 ${padding + layout.mainHeight / 2})`}
                  x={12}
                  y={padding + layout.mainHeight / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {yLabel}
                </text>
              ) : null}
              <text
                data-section="chart-line-momentum-sub-label"
                data-panel="sub"
                transform={`rotate(-90 12 ${layout.subTop + layout.subHeight / 2})`}
                x={12}
                y={layout.subTop + layout.subHeight / 2}
                textAnchor="middle"
                fontSize={11}
                fill={axisColor}
                stroke="none"
              >
                {momentumLabel}
              </text>
            </g>
          ) : null}

          {zeroLineVisible ? (
            <line
              data-section="chart-line-momentum-zero-line"
              x1={padding}
              x2={padding + layout.innerWidth}
              y1={zeroPy}
              y2={zeroPy}
              stroke={zeroColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          <g data-section="chart-line-momentum-series">
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-momentum-series-group"
                data-series-id={s.id}
                data-series-color={s.color}
                data-series-period={s.period}
                data-series-finite-count={s.finiteCount}
                data-series-momentum-valid-count={s.momentumValidCount}
                data-series-positive-count={s.positiveCount}
                data-series-negative-count={s.negativeCount}
                data-series-zero-count={s.zeroCount}
                data-series-latest-sign={s.latestSign}
              >
                {s.path ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} price line`}
                    data-section="chart-line-momentum-path"
                    data-series-id={s.id}
                    data-kind="main"
                    d={s.path}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showMomentumFill && s.positivePath ? (
                  <path
                    data-section="chart-line-momentum-fill"
                    data-series-id={s.id}
                    data-sign="positive"
                    d={`${s.positivePath} L ${
                      padding + layout.innerWidth
                    } ${zeroPy} L ${padding} ${zeroPy} Z`}
                    fill={positiveColor}
                    fillOpacity={fillOpacity}
                    stroke="none"
                    pointerEvents="none"
                  />
                ) : null}
                {showMomentumFill && s.negativePath ? (
                  <path
                    data-section="chart-line-momentum-fill"
                    data-series-id={s.id}
                    data-sign="negative"
                    d={`${s.negativePath} L ${
                      padding + layout.innerWidth
                    } ${zeroPy} L ${padding} ${zeroPy} Z`}
                    fill={negativeColor}
                    fillOpacity={fillOpacity}
                    stroke="none"
                    pointerEvents="none"
                  />
                ) : null}
                {s.momentumPath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} momentum oscillator period ${s.period}`}
                    data-section="chart-line-momentum-momentum-path"
                    data-series-id={s.id}
                    data-kind="momentum"
                    d={s.momentumPath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={momentumStrokeWidth}
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
                          aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)} y ${formatValue(p.y)}${
                            p.momentum !== null
                              ? `; momentum ${formatMomentum(p.momentum)} ${p.sign}`
                              : '; momentum n/a'
                          }`}
                          data-section="chart-line-momentum-dot"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-x={p.x}
                          data-y={p.y}
                          data-momentum={p.momentum ?? ''}
                          data-sign={p.sign}
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
              const p = s.points[hoverPayload.pointIndex];
              if (!p) return null;
              const tipSignColor =
                p.sign === 'positive'
                  ? positiveColor
                  : p.sign === 'negative'
                    ? negativeColor
                    : zeroColor;
              return (
                <div
                  data-section="chart-line-momentum-tooltip"
                  data-series-id={s.id}
                  data-point-index={p.index}
                  data-sign={p.sign}
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
                  <div
                    data-section="chart-line-momentum-tooltip-label"
                    style={{ color: s.color, fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-momentum-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div
                    data-section="chart-line-momentum-tooltip-y"
                    style={{ fontWeight: 600 }}
                  >
                    y: {formatValue(p.y)}
                  </div>
                  <div
                    data-section="chart-line-momentum-tooltip-momentum"
                    style={{ color: tipSignColor }}
                  >
                    momentum({s.period}):{' '}
                    {p.momentum === null ? 'n/a' : formatMomentum(p.momentum)}
                    {p.momentum !== null ? ` (${p.sign})` : ''}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-momentum-legend"
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
              DEFAULT_CHART_LINE_MOMENTUM_PALETTE[0]!;
            return (
              <button
                key={s.id}
                type="button"
                data-section="chart-line-momentum-legend-item"
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
                  data-section="chart-line-momentum-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: swatchColor,
                  }}
                />
                <span data-section="chart-line-momentum-legend-label">
                  {s.label}
                </span>
                {layoutMatch ? (
                  <span
                    data-section="chart-line-momentum-legend-period"
                    style={{ fontSize: 10, color: '#64748b' }}
                  >
                    (n={layoutMatch.period})
                  </span>
                ) : null}
              </button>
            );
          })}
          <span
            data-section="chart-line-momentum-legend-total-points"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {allTotalPoints} total points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineMomentum.displayName = 'ChartLineMomentum';
