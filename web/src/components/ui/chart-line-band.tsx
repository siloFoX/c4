import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_BAND_WIDTH = 560;
export const DEFAULT_CHART_LINE_BAND_HEIGHT = 320;
export const DEFAULT_CHART_LINE_BAND_PADDING = 40;
export const DEFAULT_CHART_LINE_BAND_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_BAND_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_BAND_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_BAND_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_BAND_FILL_OPACITY = 0.18;
export const DEFAULT_CHART_LINE_BAND_BORDER_OPACITY = 0.7;
export const DEFAULT_CHART_LINE_BAND_BORDER_DASH = '4 3';
export const DEFAULT_CHART_LINE_BAND_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_BAND_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_BAND_PALETTE = [
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

export type ChartLineBandKind =
  | 'safe'
  | 'warning'
  | 'critical'
  | 'info'
  | 'neutral'
  | 'custom';

export type ChartLineBandLabelPosition =
  | 'inside-top-left'
  | 'inside-top-right'
  | 'outside-right'
  | 'outside-left'
  | 'none';

interface ChartLineBandKindDef {
  color: string;
  label: string;
}

export const DEFAULT_CHART_LINE_BAND_KINDS: Readonly<
  Record<ChartLineBandKind, ChartLineBandKindDef>
> = {
  safe: { color: '#16a34a', label: 'Safe' },
  warning: { color: '#f59e0b', label: 'Warning' },
  critical: { color: '#dc2626', label: 'Critical' },
  info: { color: '#0891b2', label: 'Info' },
  neutral: { color: '#64748b', label: 'Neutral' },
  custom: { color: '#94a3b8', label: 'Custom' },
};

export interface ChartLineBandPoint {
  x: number;
  y: number;
}

export interface ChartLineBandSeries {
  id: string;
  label: string;
  data: readonly ChartLineBandPoint[];
  color?: string;
}

export interface ChartLineBandSpec {
  id: string;
  label: string;
  yMin: number;
  yMax: number;
  color?: string;
  kind?: ChartLineBandKind;
  opacity?: number;
  borderDashArray?: string;
  showBorder?: boolean;
  labelPosition?: ChartLineBandLabelPosition;
}

export interface NormalisedLineBandSpec {
  id: string;
  label: string;
  yMin: number;
  yMax: number;
  color: string;
  kind: ChartLineBandKind;
  opacity: number;
  borderDashArray: string;
  showBorder: boolean;
  labelPosition: ChartLineBandLabelPosition;
}

export interface ChartLineBandLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  inBands: string[];
}

export interface ChartLineBandLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  points: ChartLineBandLayoutPoint[];
  path: string;
  finiteCount: number;
  totalCount: number;
}

export interface ChartLineBandLayoutBand {
  originalIndex: number;
  spec: NormalisedLineBandSpec;
  pyTop: number;
  pyBottom: number;
  pxLeft: number;
  pxRight: number;
  labelX: number;
  labelY: number;
  labelAnchor: 'start' | 'end' | 'middle';
  inRange: boolean;
}

export interface ComputeLineBandLayoutResult {
  series: ChartLineBandLayoutSeries[];
  bands: ChartLineBandLayoutBand[];
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
  visibleBandCount: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineBandPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineBandPoint).x) &&
    isFiniteNumber((p as ChartLineBandPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineBandDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_BAND_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_BAND_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_BAND_PALETTE.length
  ]!;
}

export function getLineBandFinitePoints(
  points: readonly ChartLineBandPoint[],
): ChartLineBandPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Returns the canonical definition for a band kind. Unknown / missing
 * kinds fall back to the `custom` def.
 */
export function getLineBandKindDef(
  kind: ChartLineBandKind | undefined | null,
): ChartLineBandKindDef {
  if (
    kind &&
    Object.prototype.hasOwnProperty.call(DEFAULT_CHART_LINE_BAND_KINDS, kind)
  ) {
    return DEFAULT_CHART_LINE_BAND_KINDS[kind];
  }
  return DEFAULT_CHART_LINE_BAND_KINDS.custom;
}

/**
 * Validates a band spec. Drops null, missing id/label, or non-finite
 * yMin/yMax. Swaps yMin/yMax when inverted. Defaults `kind` to
 * `'custom'`, `color` to the kind def, `opacity` to the chart default,
 * `labelPosition` to `'inside-top-left'`, `showBorder` to true, and
 * `borderDashArray` to the chart default.
 */
export function normaliseLineBandSpec(
  spec: ChartLineBandSpec | undefined | null,
): NormalisedLineBandSpec | null {
  if (!spec || typeof spec !== 'object') return null;
  if (typeof spec.id !== 'string' || spec.id.length === 0) return null;
  if (typeof spec.label !== 'string') return null;
  if (!isFiniteNumber(spec.yMin) || !isFiniteNumber(spec.yMax)) return null;
  let yMin = spec.yMin;
  let yMax = spec.yMax;
  if (yMin > yMax) [yMin, yMax] = [yMax, yMin];
  const kind = spec.kind ?? 'custom';
  const kindDef = getLineBandKindDef(kind);
  const color = spec.color ?? kindDef.color;
  const opacity = isFiniteNumber(spec.opacity)
    ? Math.min(1, Math.max(0, spec.opacity))
    : DEFAULT_CHART_LINE_BAND_FILL_OPACITY;
  const borderDashArray =
    spec.borderDashArray ?? DEFAULT_CHART_LINE_BAND_BORDER_DASH;
  const showBorder = spec.showBorder !== false;
  const labelPosition = spec.labelPosition ?? 'inside-top-left';
  return {
    id: spec.id,
    label: spec.label,
    yMin,
    yMax,
    color,
    kind,
    opacity,
    borderDashArray,
    showBorder,
    labelPosition,
  };
}

/**
 * Returns true when `y` is finite and falls inclusively inside the
 * band's `[yMin, yMax]`.
 */
export function isPointInLineBand(
  y: number,
  band: { yMin: number; yMax: number },
): boolean {
  if (!isFiniteNumber(y)) return false;
  return y >= band.yMin && y <= band.yMax;
}

/**
 * Returns the ids of every band whose `[yMin, yMax]` contains `y`,
 * in input order.
 */
export function getLineBandMembership(
  y: number,
  bands: readonly { id: string; yMin: number; yMax: number }[],
): string[] {
  const out: string[] = [];
  if (!isFiniteNumber(y) || !Array.isArray(bands)) return out;
  for (const b of bands) {
    if (isPointInLineBand(y, b)) out.push(b.id);
  }
  return out;
}

export interface ComputeLineBandLayoutInput {
  series: readonly ChartLineBandSeries[];
  bands?: readonly ChartLineBandSpec[];
  hiddenSeries?: ReadonlySet<string> | null;
  hiddenBands?: ReadonlySet<string> | null;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineBandLayout(
  input: ComputeLineBandLayoutInput,
): ComputeLineBandLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const empty: ComputeLineBandLayoutResult = {
    series: [],
    bands: [],
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
    visibleBandCount: 0,
  };
  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const seriesArr = Array.isArray(input.series) ? input.series : [];
  const bandsArr = Array.isArray(input.bands) ? input.bands : [];

  // Validate bands first so we can include their y range in the bounds.
  const normalisedBands: NormalisedLineBandSpec[] = [];
  for (const b of bandsArr) {
    const n = normaliseLineBandSpec(b);
    if (n) normalisedBands.push(n);
  }

  const hidden = input.hiddenSeries ?? null;
  const hiddenBands = input.hiddenBands ?? null;
  const visibleSeries = seriesArr.filter(
    (s) => !hidden || !hidden.has(s.id),
  );

  // Bounds across all visible series + visible bands.
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const s of visibleSeries) {
    for (const p of getLineBandFinitePoints(s.data ?? [])) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      any = true;
    }
  }
  for (const b of normalisedBands) {
    if (hiddenBands && hiddenBands.has(b.id)) continue;
    if (b.yMin < yMin) yMin = b.yMin;
    if (b.yMax > yMax) yMax = b.yMax;
    any = true;
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
  if (yMin === Number.POSITIVE_INFINITY) {
    yMin = 0;
    yMax = 1;
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

  // Build layout series with per-point band membership.
  const layoutSeries: ChartLineBandLayoutSeries[] = [];
  let totalPoints = 0;
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineBandLayoutPoint[] = [];
    for (let j = 0; j < arr.length; j += 1) {
      const p = arr[j]!;
      if (!isFinitePoint(p)) continue;
      const memberships = normalisedBands
        .filter((b) => !hiddenBands || !hiddenBands.has(b.id))
        .filter((b) => isPointInLineBand(p.y, b))
        .map((b) => b.id);
      points.push({
        index: j,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPx(p.y),
        inBands: memberships,
      });
    }
    let path = '';
    if (points.length > 0) {
      path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
      for (let j = 1; j < points.length; j += 1) {
        path += ` L ${fmt(points[j]!.px)} ${fmt(points[j]!.py)}`;
      }
    }
    totalPoints += points.length;
    layoutSeries.push({
      id: s.id,
      label: s.label,
      index: i,
      color: s.color ?? getLineBandDefaultColor(i),
      points,
      path,
      finiteCount: points.length,
      totalCount: arr.length,
    });
  }

  // Build layout bands.
  const layoutBands: ChartLineBandLayoutBand[] = [];
  let visibleBandCount = 0;
  for (let i = 0; i < normalisedBands.length; i += 1) {
    const b = normalisedBands[i]!;
    if (hiddenBands && hiddenBands.has(b.id)) continue;
    const pxLeft = padding;
    const pxRight = padding + innerWidth;
    const pyTop = yToPx(b.yMax);
    const pyBottom = yToPx(b.yMin);
    const inRange = b.yMax >= yMin && b.yMin <= yMax;
    let labelX: number;
    let labelY: number;
    let labelAnchor: 'start' | 'end' | 'middle';
    switch (b.labelPosition) {
      case 'inside-top-right':
        labelX = pxRight - 6;
        labelY = pyTop + 12;
        labelAnchor = 'end';
        break;
      case 'outside-right':
        labelX = pxRight + 6;
        labelY = (pyTop + pyBottom) / 2 + 3;
        labelAnchor = 'start';
        break;
      case 'outside-left':
        labelX = pxLeft - 6;
        labelY = (pyTop + pyBottom) / 2 + 3;
        labelAnchor = 'end';
        break;
      case 'none':
        labelX = 0;
        labelY = 0;
        labelAnchor = 'middle';
        break;
      case 'inside-top-left':
      default:
        labelX = pxLeft + 6;
        labelY = pyTop + 12;
        labelAnchor = 'start';
        break;
    }
    layoutBands.push({
      originalIndex: i,
      spec: b,
      pyTop,
      pyBottom,
      pxLeft,
      pxRight,
      labelX,
      labelY,
      labelAnchor,
      inRange,
    });
    if (inRange) visibleBandCount += 1;
  }

  const tickCount = input.tickCount ?? DEFAULT_CHART_LINE_BAND_TICK_COUNT;
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
    bands: layoutBands,
    xTicks,
    yTicks,
    xMin,
    xMax,
    yMin,
    yMax,
    innerWidth,
    innerHeight,
    totalPoints,
    visibleSeriesCount: visibleSeries.length,
    visibleBandCount,
  };
}

export function describeLineBandChart(
  series: readonly ChartLineBandSeries[] | undefined | null,
  bands?: readonly ChartLineBandSpec[],
  hiddenSeries?: ReadonlySet<string>,
  hiddenBands?: ReadonlySet<string>,
  formatValue?: (n: number) => string,
): string {
  const seriesArr = Array.isArray(series) ? series : [];
  const visibleSeries = seriesArr.filter(
    (s) => !hiddenSeries || !hiddenSeries.has(s.id),
  );
  const bandSpecs = Array.isArray(bands) ? bands : [];
  const norm: NormalisedLineBandSpec[] = [];
  for (const b of bandSpecs) {
    const n = normaliseLineBandSpec(b);
    if (n && (!hiddenBands || !hiddenBands.has(n.id))) norm.push(n);
  }
  if (visibleSeries.length === 0 && norm.length === 0) return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  let pointCount = 0;
  for (const s of visibleSeries) {
    pointCount += getLineBandFinitePoints(s.data ?? []).length;
  }
  if (norm.length === 0) {
    return `Line chart with ${visibleSeries.length} series (${pointCount} points). No reference bands.`;
  }
  const sample = norm
    .slice(0, 3)
    .map(
      (b) =>
        `${b.label} (${b.kind}) ${fmtV(b.yMin)} to ${fmtV(b.yMax)}`,
    )
    .join(', ');
  const extra = norm.length > 3 ? ` and ${norm.length - 3} more` : '';
  return `Line chart with ${visibleSeries.length} series (${pointCount} points) and ${norm.length} reference bands: ${sample}${extra}.`;
}

export interface ChartLineBandPointClick {
  series: ChartLineBandLayoutSeries;
  point: ChartLineBandLayoutPoint;
}

export interface ChartLineBandClick {
  band: ChartLineBandLayoutBand;
}

export interface ChartLineBandBandToggle {
  band: NormalisedLineBandSpec;
  hidden: boolean;
}

export interface ChartLineBandProps {
  series: readonly ChartLineBandSeries[];
  bands?: readonly ChartLineBandSpec[];
  hiddenSeries?: ReadonlySet<string>;
  defaultHiddenSeries?: ReadonlySet<string>;
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  hiddenBands?: ReadonlySet<string>;
  defaultHiddenBands?: ReadonlySet<string>;
  onHiddenBandsChange?: (hidden: ReadonlySet<string>) => void;
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
  bandBorderOpacity?: number;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showBandLegend?: boolean;
  showTooltip?: boolean;
  showBandLabels?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineBandPointClick) => void;
  onBandClick?: (info: ChartLineBandClick) => void;
  onBandToggle?: (info: ChartLineBandBandToggle) => void;
  style?: CSSProperties;
}

export const ChartLineBand = forwardRef(function ChartLineBand(
  {
    series = [],
    bands,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    hiddenBands,
    defaultHiddenBands,
    onHiddenBandsChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_BAND_WIDTH,
    height = DEFAULT_CHART_LINE_BAND_HEIGHT,
    padding = DEFAULT_CHART_LINE_BAND_PADDING,
    tickCount = DEFAULT_CHART_LINE_BAND_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_BAND_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_BAND_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_BAND_LINE_OPACITY,
    bandBorderOpacity = DEFAULT_CHART_LINE_BAND_BORDER_OPACITY,
    gridColor = DEFAULT_CHART_LINE_BAND_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_BAND_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showBandLegend = true,
    showTooltip = true,
    showBandLabels = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with reference band',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    onBandClick,
    onBandToggle,
    style,
  }: ChartLineBandProps,
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

  const [internalHiddenSer, setInternalHiddenSer] = useState<
    ReadonlySet<string>
  >(defaultHiddenSeries ?? new Set<string>());
  const hiddenSer: ReadonlySet<string> =
    hiddenSeries !== undefined ? hiddenSeries : internalHiddenSer;

  const [internalHiddenBands, setInternalHiddenBands] = useState<
    ReadonlySet<string>
  >(defaultHiddenBands ?? new Set<string>());
  const hiddenBandsResolved: ReadonlySet<string> =
    hiddenBands !== undefined ? hiddenBands : internalHiddenBands;

  const [hoveredPointKey, setHoveredPointKey] = useState<string | null>(null);
  const [hoveredBandId, setHoveredBandId] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineBandLayout({
        series,
        ...(bands ? { bands } : {}),
        hiddenSeries: hiddenSer,
        hiddenBands: hiddenBandsResolved,
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
      bands,
      hiddenSer,
      hiddenBandsResolved,
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
    describeLineBandChart(
      series,
      bands,
      hiddenSer,
      hiddenBandsResolved,
      fmtValue,
    );

  const toggleSeries = useCallback(
    (s: ChartLineBandSeries) => {
      const next = new Set(hiddenSer);
      if (next.has(s.id)) next.delete(s.id);
      else next.add(s.id);
      if (hiddenSeries === undefined) setInternalHiddenSer(next);
      if (onHiddenSeriesChange) onHiddenSeriesChange(next);
    },
    [hiddenSer, hiddenSeries, onHiddenSeriesChange],
  );

  const toggleBand = useCallback(
    (band: NormalisedLineBandSpec) => {
      const next = new Set(hiddenBandsResolved);
      const willHide = !next.has(band.id);
      if (willHide) next.add(band.id);
      else next.delete(band.id);
      if (hiddenBands === undefined) setInternalHiddenBands(next);
      if (onHiddenBandsChange) onHiddenBandsChange(next);
      if (onBandToggle) onBandToggle({ band, hidden: willHide });
    },
    [hiddenBandsResolved, hiddenBands, onHiddenBandsChange, onBandToggle],
  );

  const rootClass = [
    'relative inline-block w-full max-w-full text-xs text-slate-700',
    animate ? 'motion-safe:animate-fade-in' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const allNormalisedBands = useMemo(() => {
    const arr: NormalisedLineBandSpec[] = [];
    for (const b of bands ?? []) {
      const n = normaliseLineBandSpec(b);
      if (n) arr.push(n);
    }
    return arr;
  }, [bands]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={ariaDescId}
      data-section="chart-line-band"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-band-count={allNormalisedBands.length}
      data-visible-band-count={layout.visibleBandCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-band-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-band-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-band-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-band-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-band-grid-line"
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
                  data-section="chart-line-band-grid-line"
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

          {/* Bands beneath axes / lines so series lines remain readable. */}
          <g data-section="chart-line-band-bands">
            {layout.bands.map((b) => {
              const isHovered = hoveredBandId === b.spec.id;
              const ymin = Math.min(b.pyTop, b.pyBottom);
              const ymax = Math.max(b.pyTop, b.pyBottom);
              const ht = Math.max(0, ymax - ymin);
              return (
                <g
                  key={b.spec.id}
                  data-section="chart-line-band-band"
                  data-band-id={b.spec.id}
                  data-band-kind={b.spec.kind}
                  data-band-color={b.spec.color}
                  data-band-y-min={b.spec.yMin}
                  data-band-y-max={b.spec.yMax}
                  data-band-hovered={isHovered ? 'true' : 'false'}
                  data-band-in-range={b.inRange ? 'true' : 'false'}
                >
                  <rect
                    data-section="chart-line-band-rect"
                    data-band-id={b.spec.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Band ${b.spec.label} (${b.spec.kind}): ${b.spec.yMin} to ${b.spec.yMax}`}
                    x={b.pxLeft}
                    y={ymin}
                    width={layout.innerWidth}
                    height={ht}
                    fill={b.spec.color}
                    fillOpacity={isHovered ? Math.min(1, b.spec.opacity * 1.8) : b.spec.opacity}
                    stroke="none"
                    onMouseEnter={() => setHoveredBandId(b.spec.id)}
                    onMouseLeave={() => setHoveredBandId(null)}
                    onFocus={() => setHoveredBandId(b.spec.id)}
                    onBlur={() => setHoveredBandId(null)}
                    onClick={() => {
                      if (onBandClick) onBandClick({ band: b });
                    }}
                  />
                  {b.spec.showBorder ? (
                    <>
                      <line
                        data-section="chart-line-band-border"
                        data-band-id={b.spec.id}
                        data-edge="top"
                        x1={b.pxLeft}
                        y1={b.pyTop}
                        x2={b.pxRight}
                        y2={b.pyTop}
                        stroke={b.spec.color}
                        strokeOpacity={bandBorderOpacity}
                        strokeDasharray={b.spec.borderDashArray}
                        strokeWidth={1}
                      />
                      <line
                        data-section="chart-line-band-border"
                        data-band-id={b.spec.id}
                        data-edge="bottom"
                        x1={b.pxLeft}
                        y1={b.pyBottom}
                        x2={b.pxRight}
                        y2={b.pyBottom}
                        stroke={b.spec.color}
                        strokeOpacity={bandBorderOpacity}
                        strokeDasharray={b.spec.borderDashArray}
                        strokeWidth={1}
                      />
                    </>
                  ) : null}
                  {showBandLabels &&
                  b.spec.labelPosition !== 'none' &&
                  b.inRange ? (
                    <text
                      data-section="chart-line-band-label"
                      data-band-id={b.spec.id}
                      x={b.labelX}
                      y={b.labelY}
                      textAnchor={b.labelAnchor}
                      fontSize={10}
                      fill={b.spec.color}
                      style={{ pointerEvents: 'none' }}
                    >
                      {b.spec.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>

          {showAxis ? (
            <g data-section="chart-line-band-axes">
              <line
                data-section="chart-line-band-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-band-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-band-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-band-tick"
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
                        data-section="chart-line-band-tick-label"
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
                <g data-section="chart-line-band-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-band-tick"
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
                        data-section="chart-line-band-tick-label"
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
                  data-section="chart-line-band-x-label"
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
                  data-section="chart-line-band-y-label"
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

          {/* Series paths + dots on top of the bands. */}
          <g data-section="chart-line-band-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredPointKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredPointKey!.startsWith(`${s.id}::`);
              const dim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-band-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-band-path"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: line with ${s.finiteCount} points`}
                    d={s.path}
                    fill="none"
                    stroke={s.color}
                    strokeOpacity={dim}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {showDots
                    ? s.points.map((p) => {
                        const key = `${s.id}::${p.index}`;
                        const isHovered = hoveredPointKey === key;
                        const opacity =
                          isAnyHovered && !isHovered ? 0.3 : 1;
                        const inBandsStr = p.inBands.join(',');
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)}${inBandsStr ? `, inside bands ${inBandsStr}` : ''}`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-band-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-in-bands={inBandsStr}
                            data-band-count={p.inBands.length}
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
                            onMouseEnter={() => setHoveredPointKey(key)}
                            onMouseLeave={() => setHoveredPointKey(null)}
                            onFocus={() => setHoveredPointKey(key)}
                            onBlur={() => setHoveredPointKey(null)}
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

        {showTooltip && hoveredPointKey ? (() => {
          const sep = hoveredPointKey.indexOf('::');
          if (sep < 0) return null;
          const sid = hoveredPointKey.slice(0, sep);
          const idx = Number(hoveredPointKey.slice(sep + 2));
          const s = layout.series.find((x) => x.id === sid);
          if (!s) return null;
          const p = s.points.find((x) => x.index === idx);
          if (!p) return null;
          const tx = Math.min(Math.max(p.px + 8, 0), width - 220);
          const ty = Math.min(Math.max(p.py - 56, 0), height - 88);
          const bandNames = p.inBands.map((bid) => {
            const band = layout.bands.find((b) => b.spec.id === bid);
            return band ? band.spec.label : bid;
          });
          return (
            <div
              data-section="chart-line-band-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 min-w-[200px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-band-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-band-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-band-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
              <div
                data-section="chart-line-band-tooltip-bands"
                className="text-slate-500"
              >
                bands: {bandNames.length > 0 ? bandNames.join(', ') : 'none'}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-band-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hiddenSer.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-band-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-band-legend-button"
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
                    data-section="chart-line-band-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineBandDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-band-legend-label">
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {showBandLegend && allNormalisedBands.length > 0 ? (
        <ul
          data-section="chart-line-band-band-legend"
          className="mt-1 flex flex-wrap gap-x-3 gap-y-1"
        >
          {allNormalisedBands.map((b) => {
            const isHidden = hiddenBandsResolved.has(b.id);
            return (
              <li
                key={b.id}
                data-section="chart-line-band-band-legend-item"
                data-band-id={b.id}
                data-band-kind={b.kind}
                data-band-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-band-band-legend-button"
                  data-band-id={b.id}
                  aria-pressed={!isHidden}
                  onClick={() => toggleBand(b)}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5',
                    isHidden ? 'opacity-50' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span
                    data-section="chart-line-band-band-legend-swatch"
                    className="inline-block h-3 w-4 rounded-sm"
                    style={{
                      backgroundColor: b.color,
                      opacity: b.opacity,
                    }}
                  />
                  <span data-section="chart-line-band-band-legend-label">
                    {b.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

ChartLineBand.displayName = 'ChartLineBand';
