import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_EVENT_WIDTH = 560;
export const DEFAULT_CHART_LINE_EVENT_HEIGHT = 320;
export const DEFAULT_CHART_LINE_EVENT_PADDING = 40;
export const DEFAULT_CHART_LINE_EVENT_TRACK_HEIGHT = 22;
export const DEFAULT_CHART_LINE_EVENT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_EVENT_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_EVENT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_EVENT_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_EVENT_RULE_OPACITY = 0.4;
export const DEFAULT_CHART_LINE_EVENT_RULE_DASH = '3 3';
export const DEFAULT_CHART_LINE_EVENT_ICON_RADIUS = 7;
export const DEFAULT_CHART_LINE_EVENT_TRACK_GAP = 4;
export const DEFAULT_CHART_LINE_EVENT_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_EVENT_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_EVENT_TRACK_BG = '#f8fafc';
export const DEFAULT_CHART_LINE_EVENT_PALETTE = [
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

export type ChartLineEventKind =
  | 'release'
  | 'incident'
  | 'maintenance'
  | 'milestone'
  | 'info'
  | 'custom';

export type ChartLineEventIcon =
  | 'circle'
  | 'triangle'
  | 'square'
  | 'diamond'
  | 'cross'
  | 'star';

interface ChartLineEventKindDef {
  color: string;
  icon: ChartLineEventIcon;
  label: string;
}

export const DEFAULT_CHART_LINE_EVENT_KINDS: Readonly<
  Record<ChartLineEventKind, ChartLineEventKindDef>
> = {
  release: { color: '#16a34a', icon: 'circle', label: 'Release' },
  incident: { color: '#dc2626', icon: 'triangle', label: 'Incident' },
  maintenance: { color: '#f59e0b', icon: 'square', label: 'Maintenance' },
  milestone: { color: '#9333ea', icon: 'star', label: 'Milestone' },
  info: { color: '#0891b2', icon: 'diamond', label: 'Info' },
  custom: { color: '#64748b', icon: 'cross', label: 'Custom' },
};

export const ALL_CHART_LINE_EVENT_KINDS: readonly ChartLineEventKind[] = [
  'release',
  'incident',
  'maintenance',
  'milestone',
  'info',
  'custom',
];

export interface ChartLineEventPoint {
  x: number;
  y: number;
}

export interface ChartLineEventSeries {
  id: string;
  label: string;
  data: readonly ChartLineEventPoint[];
  color?: string;
}

export interface ChartLineEventEvent {
  id: string;
  x: number;
  title: string;
  description?: string;
  kind?: ChartLineEventKind;
  color?: string;
  icon?: ChartLineEventIcon;
  timestampLabel?: string;
}

export interface ChartLineEventLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineEventLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  points: ChartLineEventLayoutPoint[];
  path: string;
  finiteCount: number;
  totalCount: number;
}

export interface ChartLineEventLayoutEvent {
  id: string;
  originalIndex: number;
  x: number;
  px: number;
  trackCx: number;
  trackCy: number;
  iconPath: string;
  iconLineMarkup: string;
  ruleY1: number;
  ruleY2: number;
  title: string;
  description: string;
  kind: ChartLineEventKind;
  color: string;
  icon: ChartLineEventIcon;
  timestampLabel: string;
  inRange: boolean;
}

export interface ComputeLineEventLayoutResult {
  series: ChartLineEventLayoutSeries[];
  events: ChartLineEventLayoutEvent[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  trackTop: number;
  trackBottom: number;
  trackCenterY: number;
  totalPoints: number;
  visibleSeriesCount: number;
  visibleEventCount: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineEventPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineEventPoint).x) &&
    isFiniteNumber((p as ChartLineEventPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineEventDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_EVENT_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_EVENT_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_EVENT_PALETTE.length
  ]!;
}

export function getLineEventFinitePoints(
  points: readonly ChartLineEventPoint[],
): ChartLineEventPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Resolves the kind definition for an event. Unknown kinds (or
 * `kind` missing) fall back to the `custom` definition.
 */
export function getLineEventKindDef(
  kind: ChartLineEventKind | undefined | null,
): ChartLineEventKindDef {
  if (
    kind &&
    Object.prototype.hasOwnProperty.call(DEFAULT_CHART_LINE_EVENT_KINDS, kind)
  ) {
    return DEFAULT_CHART_LINE_EVENT_KINDS[kind];
  }
  return DEFAULT_CHART_LINE_EVENT_KINDS.custom;
}

/**
 * Builds an SVG `d` attribute string for an event icon centered at
 * `(cx, cy)` with outer radius `r`. The `cross` icon emits two
 * sub-paths via `M ... L ... M ... L`.
 *
 * Non-finite cx/cy/r returns an empty string.
 */
export function buildLineEventIconPath(
  icon: ChartLineEventIcon,
  cx: number,
  cy: number,
  r: number,
): string {
  if (!isFiniteNumber(cx) || !isFiniteNumber(cy) || !isFiniteNumber(r))
    return '';
  if (r <= 0) return '';
  if (icon === 'circle') {
    return `M ${fmt(cx - r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(cx + r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(cx - r)} ${fmt(cy)} Z`;
  }
  if (icon === 'triangle') {
    return `M ${fmt(cx)} ${fmt(cy - r)} L ${fmt(cx + r)} ${fmt(cy + r)} L ${fmt(cx - r)} ${fmt(cy + r)} Z`;
  }
  if (icon === 'square') {
    return `M ${fmt(cx - r)} ${fmt(cy - r)} L ${fmt(cx + r)} ${fmt(cy - r)} L ${fmt(cx + r)} ${fmt(cy + r)} L ${fmt(cx - r)} ${fmt(cy + r)} Z`;
  }
  if (icon === 'diamond') {
    return `M ${fmt(cx)} ${fmt(cy - r)} L ${fmt(cx + r)} ${fmt(cy)} L ${fmt(cx)} ${fmt(cy + r)} L ${fmt(cx - r)} ${fmt(cy)} Z`;
  }
  if (icon === 'cross') {
    return `M ${fmt(cx - r)} ${fmt(cy - r)} L ${fmt(cx + r)} ${fmt(cy + r)} M ${fmt(cx + r)} ${fmt(cy - r)} L ${fmt(cx - r)} ${fmt(cy + r)}`;
  }
  if (icon === 'star') {
    const outer = r;
    const inner = r * 0.4;
    const parts: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const isOuter = i % 2 === 0;
      const rr = isOuter ? outer : inner;
      const theta = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = cx + rr * Math.cos(theta);
      const y = cy + rr * Math.sin(theta);
      parts.push(`${i === 0 ? 'M' : 'L'} ${fmt(x)} ${fmt(y)}`);
    }
    parts.push('Z');
    return parts.join(' ');
  }
  return '';
}

/**
 * Filters the input events to those with a finite `x` and a non-empty
 * `id` / `title`. Preserves input order (so adopters can rely on
 * z-ordering by array index).
 */
export function getLineEventValidEvents(
  events: readonly ChartLineEventEvent[] | undefined | null,
): ChartLineEventEvent[] {
  if (!Array.isArray(events)) return [];
  const out: ChartLineEventEvent[] = [];
  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    if (!isFiniteNumber(e.x)) continue;
    if (typeof e.id !== 'string' || e.id.length === 0) continue;
    if (typeof e.title !== 'string') continue;
    out.push(e);
  }
  return out;
}

export interface ComputeLineEventLayoutInput {
  series: readonly ChartLineEventSeries[];
  events?: readonly ChartLineEventEvent[];
  hiddenSeries?: ReadonlySet<string> | null;
  hiddenKinds?: ReadonlySet<ChartLineEventKind | string> | null;
  iconRadius?: number;
  trackHeight?: number;
  trackGap?: number;
  showEventTrack?: boolean;
  showEventRule?: boolean;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineEventLayout(
  input: ComputeLineEventLayoutInput,
): ComputeLineEventLayoutResult {
  const padding = Math.max(0, input.padding);
  const showTrack = input.showEventTrack !== false;
  const trackHeight = showTrack
    ? Math.max(0, input.trackHeight ?? DEFAULT_CHART_LINE_EVENT_TRACK_HEIGHT)
    : 0;
  const trackGap = showTrack
    ? Math.max(0, input.trackGap ?? DEFAULT_CHART_LINE_EVENT_TRACK_GAP)
    : 0;
  const innerWidth = Math.max(0, input.width - padding * 2);
  const plotTop = padding + trackHeight + trackGap;
  const innerHeight = Math.max(0, input.height - plotTop - padding);

  const empty: ComputeLineEventLayoutResult = {
    series: [],
    events: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    innerWidth,
    innerHeight,
    trackTop: padding,
    trackBottom: padding + trackHeight,
    trackCenterY: padding + trackHeight / 2,
    totalPoints: 0,
    visibleSeriesCount: 0,
    visibleEventCount: 0,
  };
  if (innerWidth <= 0 || innerHeight <= 0) return empty;

  const seriesArr = Array.isArray(input.series) ? input.series : [];
  const eventsArr = getLineEventValidEvents(input.events);
  const hidden = input.hiddenSeries ?? null;
  const hiddenKinds = input.hiddenKinds ?? null;
  const visibleSeries = seriesArr.filter(
    (s) => !hidden || !hidden.has(s.id),
  );

  // Bounds across all visible series + events.
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const s of visibleSeries) {
    for (const p of getLineEventFinitePoints(s.data ?? [])) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      any = true;
    }
  }
  // Events expand the x range so their rules land inside the plot.
  for (const e of eventsArr) {
    const kind = (e.kind ?? 'custom') as ChartLineEventKind;
    if (hiddenKinds && hiddenKinds.has(kind)) continue;
    if (e.x < xMin) xMin = e.x;
    if (e.x > xMax) xMax = e.x;
    any = true;
  }
  if (!any) {
    xMin = 0;
    xMax = 1;
    yMin = 0;
    yMax = 1;
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
    plotTop + innerHeight - ((y - yMin) / yRange) * innerHeight;

  // Build layout series.
  const layoutSeries: ChartLineEventLayoutSeries[] = [];
  let totalPoints = 0;
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineEventLayoutPoint[] = [];
    for (let j = 0; j < arr.length; j += 1) {
      const p = arr[j]!;
      if (!isFinitePoint(p)) continue;
      points.push({
        index: j,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPx(p.y),
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
      color: s.color ?? getLineEventDefaultColor(i),
      points,
      path,
      finiteCount: points.length,
      totalCount: arr.length,
    });
  }

  // Build layout events.
  const iconRadius = Math.max(
    1,
    input.iconRadius ?? DEFAULT_CHART_LINE_EVENT_ICON_RADIUS,
  );
  const trackCenterY = empty.trackCenterY;
  const showRule = input.showEventRule !== false;
  const layoutEvents: ChartLineEventLayoutEvent[] = [];
  let visibleEventCount = 0;
  for (let i = 0; i < eventsArr.length; i += 1) {
    const e = eventsArr[i]!;
    const kind = (e.kind ?? 'custom') as ChartLineEventKind;
    if (hiddenKinds && hiddenKinds.has(kind)) continue;
    const def = getLineEventKindDef(kind);
    const icon = e.icon ?? def.icon;
    const color = e.color ?? def.color;
    const inRange = e.x >= xMin && e.x <= xMax;
    const px = xToPx(e.x);
    const trackCx = px;
    const trackCy = trackCenterY;
    const iconPath = buildLineEventIconPath(
      icon,
      trackCx,
      trackCy,
      iconRadius,
    );
    layoutEvents.push({
      id: e.id,
      originalIndex: i,
      x: e.x,
      px,
      trackCx,
      trackCy,
      iconPath,
      iconLineMarkup: '',
      ruleY1: showRule ? padding + trackHeight + trackGap : 0,
      ruleY2: showRule ? plotTop + innerHeight : 0,
      title: e.title,
      description: e.description ?? '',
      kind,
      color,
      icon,
      timestampLabel: e.timestampLabel ?? '',
      inRange,
    });
    if (inRange) visibleEventCount += 1;
  }

  const tickCount = input.tickCount ?? DEFAULT_CHART_LINE_EVENT_TICK_COUNT;
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
        plotTop + innerHeight - ((value - yMin) / yRange) * innerHeight,
    });
  }

  return {
    series: layoutSeries,
    events: layoutEvents,
    xTicks,
    yTicks,
    xMin,
    xMax,
    yMin,
    yMax,
    innerWidth,
    innerHeight,
    trackTop: padding,
    trackBottom: padding + trackHeight,
    trackCenterY,
    totalPoints,
    visibleSeriesCount: visibleSeries.length,
    visibleEventCount,
  };
}

export function describeLineEventChart(
  series: readonly ChartLineEventSeries[] | undefined | null,
  events?: readonly ChartLineEventEvent[],
  hiddenSeries?: ReadonlySet<string>,
  hiddenKinds?: ReadonlySet<ChartLineEventKind | string>,
): string {
  const seriesArr = Array.isArray(series) ? series : [];
  const visibleSeries = seriesArr.filter(
    (s) => !hiddenSeries || !hiddenSeries.has(s.id),
  );
  const validEvents = getLineEventValidEvents(events);
  const visibleEvents = validEvents.filter(
    (e) => !hiddenKinds || !hiddenKinds.has(e.kind ?? 'custom'),
  );
  if (visibleSeries.length === 0 && visibleEvents.length === 0)
    return 'No data';
  let pointCount = 0;
  for (const s of visibleSeries) {
    pointCount += getLineEventFinitePoints(s.data ?? []).length;
  }
  if (visibleEvents.length === 0) {
    return `Line chart with ${visibleSeries.length} series (${pointCount} points). No events.`;
  }
  const sample = visibleEvents
    .slice(0, 3)
    .map((e) => `${e.title} (${e.kind ?? 'custom'})`)
    .join(', ');
  const extra =
    visibleEvents.length > 3 ? ` and ${visibleEvents.length - 3} more` : '';
  return `Line chart with event markers across ${visibleSeries.length} series (${pointCount} points) and ${visibleEvents.length} events: ${sample}${extra}.`;
}

export interface ChartLineEventPointClick {
  series: ChartLineEventLayoutSeries;
  point: ChartLineEventLayoutPoint;
}

export interface ChartLineEventEventClick {
  event: ChartLineEventLayoutEvent;
}

export interface ChartLineEventKindToggle {
  kind: ChartLineEventKind;
  hidden: boolean;
}

export interface ChartLineEventProps {
  series: readonly ChartLineEventSeries[];
  events?: readonly ChartLineEventEvent[];
  hiddenSeries?: ReadonlySet<string>;
  defaultHiddenSeries?: ReadonlySet<string>;
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  hiddenKinds?: ReadonlySet<ChartLineEventKind>;
  defaultHiddenKinds?: ReadonlySet<ChartLineEventKind>;
  onHiddenKindsChange?: (hidden: ReadonlySet<ChartLineEventKind>) => void;
  iconRadius?: number;
  trackHeight?: number;
  trackGap?: number;
  trackBgColor?: string;
  ruleDashArray?: string;
  ruleOpacity?: number;
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
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showKindLegend?: boolean;
  showTooltip?: boolean;
  showEventTrack?: boolean;
  showEventRule?: boolean;
  showTrackBg?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineEventPointClick) => void;
  onEventClick?: (info: ChartLineEventEventClick) => void;
  onKindToggle?: (info: ChartLineEventKindToggle) => void;
  style?: CSSProperties;
}

export const ChartLineEvent = forwardRef(function ChartLineEvent(
  {
    series,
    events,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    hiddenKinds,
    defaultHiddenKinds,
    onHiddenKindsChange,
    iconRadius = DEFAULT_CHART_LINE_EVENT_ICON_RADIUS,
    trackHeight = DEFAULT_CHART_LINE_EVENT_TRACK_HEIGHT,
    trackGap = DEFAULT_CHART_LINE_EVENT_TRACK_GAP,
    trackBgColor = DEFAULT_CHART_LINE_EVENT_TRACK_BG,
    ruleDashArray = DEFAULT_CHART_LINE_EVENT_RULE_DASH,
    ruleOpacity = DEFAULT_CHART_LINE_EVENT_RULE_OPACITY,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_EVENT_WIDTH,
    height = DEFAULT_CHART_LINE_EVENT_HEIGHT,
    padding = DEFAULT_CHART_LINE_EVENT_PADDING,
    tickCount = DEFAULT_CHART_LINE_EVENT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_EVENT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_EVENT_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_EVENT_LINE_OPACITY,
    gridColor = DEFAULT_CHART_LINE_EVENT_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_EVENT_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showKindLegend = true,
    showTooltip = true,
    showEventTrack = true,
    showEventRule = true,
    showTrackBg = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with event markers',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    onEventClick,
    onKindToggle,
    style,
  }: ChartLineEventProps,
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
  const hiddenSer: ReadonlySet<string> =
    hiddenSeries !== undefined ? hiddenSeries : internalHidden;

  const [internalHiddenKinds, setInternalHiddenKinds] = useState<
    ReadonlySet<ChartLineEventKind>
  >(defaultHiddenKinds ?? new Set<ChartLineEventKind>());
  const hiddenKindsResolved: ReadonlySet<ChartLineEventKind> =
    hiddenKinds !== undefined ? hiddenKinds : internalHiddenKinds;

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineEventLayout({
        series,
        ...(events ? { events } : {}),
        hiddenSeries: hiddenSer,
        hiddenKinds: hiddenKindsResolved,
        iconRadius,
        trackHeight,
        trackGap,
        showEventTrack,
        showEventRule,
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
      events,
      hiddenSer,
      hiddenKindsResolved,
      iconRadius,
      trackHeight,
      trackGap,
      showEventTrack,
      showEventRule,
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
    describeLineEventChart(series, events, hiddenSer, hiddenKindsResolved);

  const toggleSeries = useCallback(
    (s: ChartLineEventSeries) => {
      const next = new Set(hiddenSer);
      if (next.has(s.id)) next.delete(s.id);
      else next.add(s.id);
      if (hiddenSeries === undefined) setInternalHidden(next);
      if (onHiddenSeriesChange) onHiddenSeriesChange(next);
    },
    [hiddenSer, hiddenSeries, onHiddenSeriesChange],
  );

  const toggleKind = useCallback(
    (kind: ChartLineEventKind) => {
      const next = new Set(hiddenKindsResolved);
      const willHide = !next.has(kind);
      if (willHide) next.add(kind);
      else next.delete(kind);
      if (hiddenKinds === undefined) setInternalHiddenKinds(next);
      if (onHiddenKindsChange) onHiddenKindsChange(next);
      if (onKindToggle) onKindToggle({ kind, hidden: willHide });
    },
    [hiddenKindsResolved, hiddenKinds, onHiddenKindsChange, onKindToggle],
  );

  const rootClass = [
    'relative inline-block w-full max-w-full text-xs text-slate-700',
    animate ? 'motion-safe:animate-fade-in' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  // Determine which kinds appear in the data, for the kind legend.
  const presentKinds = useMemo(() => {
    const s = new Set<ChartLineEventKind>();
    for (const e of getLineEventValidEvents(events)) {
      s.add((e.kind ?? 'custom') as ChartLineEventKind);
    }
    return Array.from(s);
  }, [events]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={ariaDescId}
      data-section="chart-line-event"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-event-count={getLineEventValidEvents(events).length}
      data-visible-event-count={layout.visibleEventCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-event-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-event-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-event-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showEventTrack && showTrackBg && trackHeight > 0 ? (
            <rect
              data-section="chart-line-event-track-bg"
              x={padding}
              y={layout.trackTop}
              width={layout.innerWidth}
              height={trackHeight}
              fill={trackBgColor}
              stroke="none"
            />
          ) : null}

          {showGrid ? (
            <g data-section="chart-line-event-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-event-grid-line"
                  data-axis="x"
                  data-tick-value={t.value}
                  x1={t.position}
                  y1={layout.trackBottom + trackGap}
                  x2={t.position}
                  y2={layout.trackBottom + trackGap + layout.innerHeight}
                  stroke={gridColor}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                />
              ))}
              {layout.yTicks.map((t) => (
                <line
                  key={`grid-y-${t.value}`}
                  data-section="chart-line-event-grid-line"
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
            <g data-section="chart-line-event-axes">
              <line
                data-section="chart-line-event-axis"
                data-axis="x"
                x1={padding}
                y1={layout.trackBottom + trackGap + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={layout.trackBottom + trackGap + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-event-axis"
                data-axis="y"
                x1={padding}
                y1={layout.trackBottom + trackGap}
                x2={padding}
                y2={layout.trackBottom + trackGap + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-event-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-event-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.position}
                        y1={
                          layout.trackBottom + trackGap + layout.innerHeight
                        }
                        x2={t.position}
                        y2={
                          layout.trackBottom +
                          trackGap +
                          layout.innerHeight +
                          4
                        }
                        stroke={axisColor}
                        strokeWidth={1}
                      />
                      <text
                        data-section="chart-line-event-tick-label"
                        data-axis="x"
                        data-tick-value={t.value}
                        x={t.position}
                        y={
                          layout.trackBottom +
                          trackGap +
                          layout.innerHeight +
                          14
                        }
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
                <g data-section="chart-line-event-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-event-tick"
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
                        data-section="chart-line-event-tick-label"
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
                  data-section="chart-line-event-x-label"
                  x={padding + layout.innerWidth / 2}
                  y={
                    layout.trackBottom +
                    trackGap +
                    layout.innerHeight +
                    30
                  }
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                >
                  {xLabel}
                </text>
              ) : null}
              {yLabel ? (
                <text
                  data-section="chart-line-event-y-label"
                  x={padding - 30}
                  y={
                    layout.trackBottom + trackGap + layout.innerHeight / 2
                  }
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  transform={`rotate(-90 ${padding - 30} ${layout.trackBottom + trackGap + layout.innerHeight / 2})`}
                >
                  {yLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          {/* Event rules below icons */}
          {showEventRule && showEventTrack ? (
            <g data-section="chart-line-event-rules">
              {layout.events
                .filter((e) => e.inRange)
                .map((e) => (
                  <line
                    key={`rule-${e.id}`}
                    data-section="chart-line-event-rule"
                    data-event-id={e.id}
                    data-event-kind={e.kind}
                    x1={e.px}
                    y1={e.ruleY1}
                    x2={e.px}
                    y2={e.ruleY2}
                    stroke={e.color}
                    strokeOpacity={ruleOpacity}
                    strokeDasharray={ruleDashArray}
                    strokeWidth={1}
                  />
                ))}
            </g>
          ) : null}

          {/* Series lines + dots */}
          <g data-section="chart-line-event-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-event-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-event-path"
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
                        const isHovered = hoveredKey === key;
                        const opacity =
                          isAnyHovered && !isHovered ? 0.3 : 1;
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)}`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-event-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
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

          {/* Event icons on the track */}
          {showEventTrack ? (
            <g data-section="chart-line-event-track">
              {layout.events
                .filter((e) => e.inRange)
                .map((e) => {
                  const isHovered = hoveredEventId === e.id;
                  const useStrokeOnly = e.icon === 'cross';
                  return (
                    <path
                      key={`event-${e.id}`}
                      data-section="chart-line-event-icon"
                      data-event-id={e.id}
                      data-event-kind={e.kind}
                      data-event-icon={e.icon}
                      data-event-color={e.color}
                      data-event-x={e.x}
                      data-event-hovered={isHovered ? 'true' : 'false'}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Event ${e.title} (${e.kind}) at x ${e.x}`}
                      d={e.iconPath}
                      fill={useStrokeOnly ? 'none' : e.color}
                      fillOpacity={
                        useStrokeOnly ? 0 : isHovered ? 1 : 0.85
                      }
                      stroke={e.color}
                      strokeWidth={useStrokeOnly ? 2 : 1}
                      onMouseEnter={() => setHoveredEventId(e.id)}
                      onMouseLeave={() => setHoveredEventId(null)}
                      onFocus={() => setHoveredEventId(e.id)}
                      onBlur={() => setHoveredEventId(null)}
                      onClick={() => {
                        if (onEventClick) onEventClick({ event: e });
                      }}
                    />
                  );
                })}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoveredEventId ? (() => {
          const e = layout.events.find((x) => x.id === hoveredEventId);
          if (!e || !e.inRange) return null;
          const tx = Math.min(Math.max(e.px + 8, 0), width - 220);
          const ty = Math.min(
            Math.max(e.trackCy + iconRadius + 4, 0),
            height - 90,
          );
          return (
            <div
              data-section="chart-line-event-tooltip"
              data-event-id={e.id}
              data-event-kind={e.kind}
              className="pointer-events-none absolute z-10 min-w-[200px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-event-tooltip-title"
                className="font-medium"
              >
                {e.title}
              </div>
              <div
                data-section="chart-line-event-tooltip-kind"
                className="text-slate-600"
              >
                {getLineEventKindDef(e.kind).label} - x {fmtX(e.x)}
                {e.timestampLabel ? ` (${e.timestampLabel})` : ''}
              </div>
              {e.description ? (
                <div
                  data-section="chart-line-event-tooltip-description"
                  className="mt-1 text-slate-500"
                >
                  {e.description}
                </div>
              ) : null}
            </div>
          );
        })() : null}

        {showTooltip && hoveredKey && !hoveredEventId ? (() => {
          const sep = hoveredKey.indexOf('::');
          if (sep < 0) return null;
          const sid = hoveredKey.slice(0, sep);
          const idx = Number(hoveredKey.slice(sep + 2));
          const s = layout.series.find((x) => x.id === sid);
          if (!s) return null;
          const p = s.points.find((x) => x.index === idx);
          if (!p) return null;
          const tx = Math.min(Math.max(p.px + 8, 0), width - 180);
          const ty = Math.min(Math.max(p.py - 48, 0), height - 64);
          return (
            <div
              data-section="chart-line-event-point-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 min-w-[160px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div className="font-medium">{s.label}</div>
              <div className="text-slate-600">x: {fmtX(p.x)}</div>
              <div className="text-slate-700" style={{ fontWeight: 600 }}>
                y: {fmtValue(p.y)}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-event-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hiddenSer.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-event-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-event-legend-button"
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
                    data-section="chart-line-event-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineEventDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-event-legend-label">
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {showKindLegend && presentKinds.length > 0 ? (
        <ul
          data-section="chart-line-event-kind-legend"
          className="mt-1 flex flex-wrap gap-x-3 gap-y-1"
        >
          {presentKinds.map((k) => {
            const isHidden = hiddenKindsResolved.has(k);
            const def = getLineEventKindDef(k);
            return (
              <li
                key={k}
                data-section="chart-line-event-kind-legend-item"
                data-event-kind={k}
                data-kind-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-event-kind-legend-button"
                  data-event-kind={k}
                  aria-pressed={!isHidden}
                  onClick={() => toggleKind(k)}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5',
                    isHidden ? 'opacity-50' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span
                    data-section="chart-line-event-kind-legend-swatch"
                    className="inline-block h-2 w-2 rounded"
                    style={{ backgroundColor: def.color }}
                  />
                  <span data-section="chart-line-event-kind-legend-label">
                    {def.label}
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

ChartLineEvent.displayName = 'ChartLineEvent';
