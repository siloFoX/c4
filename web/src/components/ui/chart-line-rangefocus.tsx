import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';

export const DEFAULT_CHART_LINE_RANGEFOCUS_WIDTH = 560;
export const DEFAULT_CHART_LINE_RANGEFOCUS_HEIGHT = 400;
export const DEFAULT_CHART_LINE_RANGEFOCUS_PADDING = 40;
export const DEFAULT_CHART_LINE_RANGEFOCUS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RANGEFOCUS_GAP = 24;
export const DEFAULT_CHART_LINE_RANGEFOCUS_OVERVIEW_RATIO = 0.28;
export const DEFAULT_CHART_LINE_RANGEFOCUS_BRUSH_HANDLE_WIDTH = 6;
export const DEFAULT_CHART_LINE_RANGEFOCUS_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_RANGEFOCUS_OVERVIEW_STROKE_WIDTH = 1;
export const DEFAULT_CHART_LINE_RANGEFOCUS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RANGEFOCUS_BRUSH_OPACITY = 0.18;
export const DEFAULT_CHART_LINE_RANGEFOCUS_OUTSIDE_OPACITY = 0.4;
export const DEFAULT_CHART_LINE_RANGEFOCUS_PALETTE = [
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
export const DEFAULT_CHART_LINE_RANGEFOCUS_BRUSH_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_RANGEFOCUS_OVERVIEW_LINE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RANGEFOCUS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RANGEFOCUS_AXIS_COLOR = '#cbd5e1';

export interface ChartLineRangeFocusPoint {
  x: number;
  y: number;
}

export interface ChartLineRangeFocusSeries {
  id: string;
  label: string;
  data: readonly ChartLineRangeFocusPoint[];
  color?: string;
}

export interface ChartLineRangeFocusRange {
  x0: number;
  x1: number;
}

export interface ChartLineRangeFocusLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  inRange: boolean;
}

export interface ChartLineRangeFocusLayoutSeries {
  id: string;
  label: string;
  color: string;
  detailPoints: ChartLineRangeFocusLayoutPoint[];
  detailPath: string;
  overviewPoints: { index: number; x: number; y: number; px: number; py: number }[];
  overviewPath: string;
  inRangeCount: number;
  finiteCount: number;
  totalCount: number;
}

export interface ChartLineRangeFocusLayout {
  series: ChartLineRangeFocusLayoutSeries[];
  detailPanel: { x: number; y: number; width: number; height: number };
  overviewPanel: { x: number; y: number; width: number; height: number };
  brushRect: { x: number; y: number; width: number; height: number };
  brushLeftHandle: { x: number; y: number; width: number; height: number };
  brushRightHandle: { x: number; y: number; width: number; height: number };
  detailXTicks: number[];
  detailYTicks: number[];
  overviewXTicks: number[];
  fullXMin: number;
  fullXMax: number;
  detailXMin: number;
  detailXMax: number;
  fullYMin: number;
  fullYMax: number;
  detailYMin: number;
  detailYMax: number;
  range: ChartLineRangeFocusRange;
  totalPoints: number;
  totalInRange: number;
  visibleSeriesCount: number;
  ok: boolean;
}

export interface ComputeLineRangeFocusLayoutOptions {
  series: readonly ChartLineRangeFocusSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  range: ChartLineRangeFocusRange;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  overviewRatio?: number;
  brushHandleWidth?: number;
  defaultColors?: readonly string[];
  fullXMin?: number;
  fullXMax?: number;
  fullYMin?: number;
  fullYMax?: number;
}

export interface ChartLineRangeFocusProps {
  series: readonly ChartLineRangeFocusSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  range?: ChartLineRangeFocusRange;
  defaultRange?: ChartLineRangeFocusRange;
  onRangeChange?: (range: ChartLineRangeFocusRange) => void;
  minRangeWidth?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  overviewRatio?: number;
  brushHandleWidth?: number;
  strokeWidth?: number;
  overviewStrokeWidth?: number;
  dotRadius?: number;
  brushOpacity?: number;
  outsideOpacity?: number;
  brushColor?: string;
  overviewLineColor?: string;
  gridColor?: string;
  axisColor?: string;
  fullXMin?: number;
  fullXMax?: number;
  fullYMin?: number;
  fullYMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showRangeBadge?: boolean;
  showOverview?: boolean;
  showOverviewBrush?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatRangeWidth?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineRangeFocusLayoutSeries;
    point: ChartLineRangeFocusLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineRangeFocusSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineRangeFocusDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_RANGEFOCUS_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineRangeFocusFinitePoints(
  points: readonly ChartLineRangeFocusPoint[] | null | undefined,
): ChartLineRangeFocusPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineRangeFocusPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

export function normaliseLineRangeFocusOverviewRatio(value: unknown): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_CHART_LINE_RANGEFOCUS_OVERVIEW_RATIO;
  }
  if (value <= 0) return 0.1;
  if (value >= 1) return 0.5;
  return value;
}

export function clampLineRangeFocusRange(
  range: ChartLineRangeFocusRange | null | undefined,
  fullXMin: number,
  fullXMax: number,
  minWidth = 0,
): ChartLineRangeFocusRange {
  if (!isFiniteNumber(fullXMin) || !isFiniteNumber(fullXMax)) {
    return { x0: 0, x1: 1 };
  }
  const lo = Math.min(fullXMin, fullXMax);
  const hi = Math.max(fullXMin, fullXMax);
  if (lo === hi) {
    return { x0: lo, x1: hi };
  }
  const fullWidth = hi - lo;
  const mw = Math.max(0, Math.min(minWidth, fullWidth));

  let x0: number;
  let x1: number;
  if (
    !range ||
    !isFiniteNumber(range.x0) ||
    !isFiniteNumber(range.x1)
  ) {
    x0 = lo;
    x1 = hi;
  } else {
    x0 = Math.min(range.x0, range.x1);
    x1 = Math.max(range.x0, range.x1);
  }

  if (x0 < lo) x0 = lo;
  if (x1 > hi) x1 = hi;
  if (x1 - x0 < mw) {
    const mid = (x0 + x1) / 2;
    x0 = Math.max(lo, mid - mw / 2);
    x1 = Math.min(hi, mid + mw / 2);
    if (x1 - x0 < mw) {
      // Pinned to either end
      if (x0 === lo) x1 = Math.min(hi, lo + mw);
      else if (x1 === hi) x0 = Math.max(lo, hi - mw);
    }
  }
  return { x0, x1 };
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

export function computeLineRangeFocusLayout(
  options: ComputeLineRangeFocusLayoutOptions,
): ChartLineRangeFocusLayout {
  const {
    series,
    hiddenSeries,
    range: requestedRange,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_RANGEFOCUS_GAP,
    tickCount = DEFAULT_CHART_LINE_RANGEFOCUS_TICK_COUNT,
    overviewRatio,
    brushHandleWidth = DEFAULT_CHART_LINE_RANGEFOCUS_BRUSH_HANDLE_WIDTH,
    defaultColors = DEFAULT_CHART_LINE_RANGEFOCUS_PALETTE,
    fullXMin: xMinOverride,
    fullXMax: xMaxOverride,
    fullYMin: yMinOverride,
    fullYMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = normaliseLineRangeFocusOverviewRatio(overviewRatio);
  const usableHeight = Math.max(0, innerHeight - gap);
  const overviewHeight = Math.max(0, usableHeight * ratio);
  const detailHeight = Math.max(0, usableHeight - overviewHeight);

  const empty: ChartLineRangeFocusLayout = {
    series: [],
    detailPanel: {
      x: padding,
      y: padding,
      width: innerWidth,
      height: detailHeight,
    },
    overviewPanel: {
      x: padding,
      y: padding + detailHeight + gap,
      width: innerWidth,
      height: overviewHeight,
    },
    brushRect: { x: padding, y: padding + detailHeight + gap, width: 0, height: overviewHeight },
    brushLeftHandle: { x: padding, y: padding + detailHeight + gap, width: brushHandleWidth, height: overviewHeight },
    brushRightHandle: { x: padding + innerWidth, y: padding + detailHeight + gap, width: brushHandleWidth, height: overviewHeight },
    detailXTicks: [],
    detailYTicks: [],
    overviewXTicks: [],
    fullXMin: 0,
    fullXMax: 0,
    detailXMin: 0,
    detailXMax: 0,
    fullYMin: 0,
    fullYMax: 0,
    detailYMin: 0,
    detailYMax: 0,
    range: { x0: 0, x1: 0 },
    totalPoints: 0,
    totalInRange: 0,
    visibleSeriesCount: 0,
    ok: false,
  };

  if (innerWidth <= 0 || detailHeight <= 0 || overviewHeight <= 0) return empty;
  if (!Array.isArray(series) || series.length === 0) return empty;

  const hidden = normaliseHidden(hiddenSeries);
  const visible = series.filter((s) => !hidden.has(s.id));
  if (visible.length === 0) return empty;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let totalPoints = 0;

  const finiteBySeries = new Map<string, ChartLineRangeFocusPoint[]>();
  for (const s of visible) {
    const finite = getLineRangeFocusFinitePoints(s.data).slice().sort((a, b) => a.x - b.x);
    finiteBySeries.set(s.id, finite);
    totalPoints += finite.length;
    for (const p of finite) {
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
      if (p.y < yLo) yLo = p.y;
      if (p.y > yHi) yHi = p.y;
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

  const range = clampLineRangeFocusRange(requestedRange, xLo, xHi);
  const fullXRange = xHi - xLo;
  const detailXRange = Math.max(1e-12, range.x1 - range.x0);
  const yRange = yHi - yLo;

  const detailPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: detailHeight,
  };
  const overviewPanel = {
    x: padding,
    y: padding + detailHeight + gap,
    width: innerWidth,
    height: overviewHeight,
  };

  const projectDetailX = (x: number): number =>
    detailPanel.x + ((x - range.x0) / detailXRange) * detailPanel.width;
  const projectDetailY = (y: number): number =>
    detailPanel.y + detailPanel.height - ((y - yLo) / yRange) * detailPanel.height;
  const projectOverviewX = (x: number): number =>
    overviewPanel.x + ((x - xLo) / fullXRange) * overviewPanel.width;
  const projectOverviewY = (y: number): number =>
    overviewPanel.y + overviewPanel.height - ((y - yLo) / yRange) * overviewPanel.height;

  let totalInRange = 0;
  const layoutSeries: ChartLineRangeFocusLayoutSeries[] = visible.map(
    (s, idx) => {
      const finite = finiteBySeries.get(s.id) ?? [];
      const color =
        s.color ?? defaultColors[idx % defaultColors.length] ?? DEFAULT_CHART_LINE_RANGEFOCUS_PALETTE[0]!;

      let inRangeCount = 0;
      const detailPoints: ChartLineRangeFocusLayoutPoint[] = finite.map(
        (p, i) => {
          const inRange = p.x >= range.x0 && p.x <= range.x1;
          if (inRange) inRangeCount += 1;
          return {
            index: i,
            x: p.x,
            y: p.y,
            px: projectDetailX(p.x),
            py: projectDetailY(p.y),
            inRange,
          };
        },
      );
      totalInRange += inRangeCount;

      const overviewPoints = finite.map((p, i) => ({
        index: i,
        x: p.x,
        y: p.y,
        px: projectOverviewX(p.x),
        py: projectOverviewY(p.y),
      }));

      const detailInRange = detailPoints.filter((p) => p.inRange);
      const detailPath = buildPath(detailInRange);
      const overviewPath = buildPath(overviewPoints);

      return {
        id: s.id,
        label: s.label,
        color,
        detailPoints,
        detailPath,
        overviewPoints,
        overviewPath,
        inRangeCount,
        finiteCount: finite.length,
        totalCount: s.data?.length ?? 0,
      };
    },
  );

  const brushX0 = projectOverviewX(range.x0);
  const brushX1 = projectOverviewX(range.x1);
  const brushRect = {
    x: brushX0,
    y: overviewPanel.y,
    width: Math.max(0, brushX1 - brushX0),
    height: overviewPanel.height,
  };
  const brushLeftHandle = {
    x: brushX0 - brushHandleWidth / 2,
    y: overviewPanel.y,
    width: brushHandleWidth,
    height: overviewPanel.height,
  };
  const brushRightHandle = {
    x: brushX1 - brushHandleWidth / 2,
    y: overviewPanel.y,
    width: brushHandleWidth,
    height: overviewPanel.height,
  };

  return {
    series: layoutSeries,
    detailPanel,
    overviewPanel,
    brushRect,
    brushLeftHandle,
    brushRightHandle,
    detailXTicks: computeTicks(range.x0, range.x1, tickCount),
    detailYTicks: computeTicks(yLo, yHi, tickCount),
    overviewXTicks: computeTicks(xLo, xHi, tickCount),
    fullXMin: xLo,
    fullXMax: xHi,
    detailXMin: range.x0,
    detailXMax: range.x1,
    fullYMin: yLo,
    fullYMax: yHi,
    detailYMin: yLo,
    detailYMax: yHi,
    range,
    totalPoints,
    totalInRange,
    visibleSeriesCount: visible.length,
    ok: true,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineRangeFocusChart(
  series: readonly ChartLineRangeFocusSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    range?: ChartLineRangeFocusRange;
    formatValue?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const fmt = options?.formatValue ?? defaultFormatValue;

  let totalPoints = 0;
  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  for (const s of visible) {
    const finite = getLineRangeFocusFinitePoints(s.data);
    totalPoints += finite.length;
    for (const p of finite) {
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
    }
  }
  if (totalPoints === 0 || !isFiniteNumber(xLo) || !isFiniteNumber(xHi)) {
    return 'No data';
  }
  const r = clampLineRangeFocusRange(options?.range, xLo, xHi);

  let inRange = 0;
  for (const s of visible) {
    const finite = getLineRangeFocusFinitePoints(s.data);
    for (const p of finite) {
      if (p.x >= r.x0 && p.x <= r.x1) inRange += 1;
    }
  }

  return `Focus+context line chart across ${visible.length} series (${totalPoints} total points). Detail panel shows ${inRange} points from ${fmt(r.x0)} to ${fmt(r.x1)}.`;
}

export const ChartLineRangeFocus = forwardRef<
  HTMLDivElement,
  ChartLineRangeFocusProps
>(function ChartLineRangeFocus(
  props: ChartLineRangeFocusProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    range: controlledRange,
    defaultRange,
    onRangeChange,
    minRangeWidth = 0,
    width = DEFAULT_CHART_LINE_RANGEFOCUS_WIDTH,
    height = DEFAULT_CHART_LINE_RANGEFOCUS_HEIGHT,
    padding = DEFAULT_CHART_LINE_RANGEFOCUS_PADDING,
    gap = DEFAULT_CHART_LINE_RANGEFOCUS_GAP,
    tickCount = DEFAULT_CHART_LINE_RANGEFOCUS_TICK_COUNT,
    overviewRatio = DEFAULT_CHART_LINE_RANGEFOCUS_OVERVIEW_RATIO,
    brushHandleWidth = DEFAULT_CHART_LINE_RANGEFOCUS_BRUSH_HANDLE_WIDTH,
    strokeWidth = DEFAULT_CHART_LINE_RANGEFOCUS_STROKE_WIDTH,
    overviewStrokeWidth = DEFAULT_CHART_LINE_RANGEFOCUS_OVERVIEW_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_RANGEFOCUS_DOT_RADIUS,
    brushOpacity = DEFAULT_CHART_LINE_RANGEFOCUS_BRUSH_OPACITY,
    outsideOpacity = DEFAULT_CHART_LINE_RANGEFOCUS_OUTSIDE_OPACITY,
    brushColor = DEFAULT_CHART_LINE_RANGEFOCUS_BRUSH_COLOR,
    overviewLineColor = DEFAULT_CHART_LINE_RANGEFOCUS_OVERVIEW_LINE_COLOR,
    gridColor = DEFAULT_CHART_LINE_RANGEFOCUS_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_RANGEFOCUS_AXIS_COLOR,
    fullXMin,
    fullXMax,
    fullYMin,
    fullYMax,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showRangeBadge = true,
    showOverview = true,
    showOverviewBrush = true,
    animate = true,
    className,
    ariaLabel = 'Focus+context line chart with overview brush',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    formatRangeWidth = defaultFormatValue,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const isControlledHidden = controlledHidden !== undefined;
  const [uncontrolledHidden, setUncontrolledHidden] = useState<Set<string>>(
    () => normaliseHidden(defaultHiddenSeries),
  );
  const hiddenSet = isControlledHidden
    ? normaliseHidden(controlledHidden)
    : uncontrolledHidden;

  const fullExtent = useMemo(() => {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const s of series) {
      if (hiddenSet.has(s.id)) continue;
      const finite = getLineRangeFocusFinitePoints(s.data);
      for (const p of finite) {
        if (p.x < lo) lo = p.x;
        if (p.x > hi) hi = p.x;
      }
    }
    if (isFiniteNumber(fullXMin)) lo = fullXMin;
    if (isFiniteNumber(fullXMax)) hi = fullXMax;
    if (!isFiniteNumber(lo) || !isFiniteNumber(hi)) {
      return { lo: 0, hi: 1 };
    }
    if (lo === hi) {
      return { lo: lo - 0.5, hi: hi + 0.5 };
    }
    return { lo, hi };
  }, [series, hiddenSet, fullXMin, fullXMax]);

  const isControlledRange = controlledRange !== undefined;
  const [uncontrolledRange, setUncontrolledRange] = useState<
    ChartLineRangeFocusRange
  >(() => {
    const initial = defaultRange ?? { x0: fullExtent.lo, x1: fullExtent.hi };
    return clampLineRangeFocusRange(
      initial,
      fullExtent.lo,
      fullExtent.hi,
      minRangeWidth,
    );
  });

  const effectiveRange = isControlledRange
    ? clampLineRangeFocusRange(
        controlledRange,
        fullExtent.lo,
        fullExtent.hi,
        minRangeWidth,
      )
    : uncontrolledRange;

  const layout = useMemo(
    () =>
      computeLineRangeFocusLayout({
        series,
        hiddenSeries: hiddenSet,
        range: effectiveRange,
        width,
        height,
        padding,
        gap,
        tickCount,
        overviewRatio,
        brushHandleWidth,
        ...(isFiniteNumber(fullXMin) ? { fullXMin } : {}),
        ...(isFiniteNumber(fullXMax) ? { fullXMax } : {}),
        ...(isFiniteNumber(fullYMin) ? { fullYMin } : {}),
        ...(isFiniteNumber(fullYMax) ? { fullYMax } : {}),
      }),
    [
      series,
      hiddenSet,
      effectiveRange,
      width,
      height,
      padding,
      gap,
      tickCount,
      overviewRatio,
      brushHandleWidth,
      fullXMin,
      fullXMax,
      fullYMin,
      fullYMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineRangeFocusChart(series, {
        hidden: hiddenSet,
        range: effectiveRange,
        formatValue,
      }),
    [ariaDescription, series, hiddenSet, effectiveRange, formatValue],
  );

  const handleToggle = useCallback(
    (s: ChartLineRangeFocusSeries) => {
      const next = new Set(hiddenSet);
      const willHide = !next.has(s.id);
      if (willHide) next.add(s.id);
      else next.delete(s.id);
      if (!isControlledHidden) setUncontrolledHidden(next);
      onHiddenSeriesChange?.(next);
      onSeriesToggle?.({ series: s, hidden: willHide });
    },
    [hiddenSet, isControlledHidden, onHiddenSeriesChange, onSeriesToggle],
  );

  const setRange = useCallback(
    (next: ChartLineRangeFocusRange) => {
      const clamped = clampLineRangeFocusRange(
        next,
        layout.fullXMin,
        layout.fullXMax,
        minRangeWidth,
      );
      if (!isControlledRange) setUncontrolledRange(clamped);
      onRangeChange?.(clamped);
    },
    [
      isControlledRange,
      layout.fullXMin,
      layout.fullXMax,
      minRangeWidth,
      onRangeChange,
    ],
  );

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<
    | null
    | {
        kind: 'move' | 'left' | 'right';
        startPx: number;
        startRange: ChartLineRangeFocusRange;
      }
  >(null);

  const pxToX = useCallback(
    (px: number): number => {
      const width = layout.overviewPanel.width;
      if (width <= 0) return layout.fullXMin;
      const ratio = (px - layout.overviewPanel.x) / width;
      return layout.fullXMin + ratio * (layout.fullXMax - layout.fullXMin);
    },
    [layout.fullXMin, layout.fullXMax, layout.overviewPanel.x, layout.overviewPanel.width],
  );

  const handlePointerDown = useCallback(
    (
      e: ReactPointerEvent<SVGRectElement>,
      kind: 'move' | 'left' | 'right',
    ) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        kind,
        startPx: e.clientX,
        startRange: { ...layout.range },
      };
    },
    [layout.range],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0) return;
      const scaleX = svg.viewBox.baseVal.width > 0
        ? svg.viewBox.baseVal.width / rect.width
        : 1;
      const deltaPx = (e.clientX - d.startPx) * scaleX;
      const fullRange = layout.fullXMax - layout.fullXMin;
      if (fullRange <= 0 || layout.overviewPanel.width <= 0) return;
      const deltaXData = (deltaPx / layout.overviewPanel.width) * fullRange;
      let next: ChartLineRangeFocusRange;
      if (d.kind === 'move') {
        next = {
          x0: d.startRange.x0 + deltaXData,
          x1: d.startRange.x1 + deltaXData,
        };
        if (next.x0 < layout.fullXMin) {
          const shift = layout.fullXMin - next.x0;
          next = { x0: next.x0 + shift, x1: next.x1 + shift };
        } else if (next.x1 > layout.fullXMax) {
          const shift = next.x1 - layout.fullXMax;
          next = { x0: next.x0 - shift, x1: next.x1 - shift };
        }
      } else if (d.kind === 'left') {
        next = { x0: d.startRange.x0 + deltaXData, x1: d.startRange.x1 };
      } else {
        next = { x0: d.startRange.x0, x1: d.startRange.x1 + deltaXData };
      }
      setRange(next);
    };
    const handleUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [
    layout.fullXMin,
    layout.fullXMax,
    layout.overviewPanel.width,
    setRange,
  ]);

  const handleOverviewClick = useCallback(
    (e: ReactPointerEvent<SVGRectElement>) => {
      // Single-click outside the brush rect: recenter on the click x.
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scaleX = svgRef.current!.viewBox.baseVal.width > 0
        ? svgRef.current!.viewBox.baseVal.width / rect.width
        : 1;
      const clickPx = (e.clientX - rect.left) * scaleX;
      const clickX = pxToX(clickPx);
      const width = layout.range.x1 - layout.range.x0;
      const next = { x0: clickX - width / 2, x1: clickX + width / 2 };
      setRange(next);
    },
    [layout.range.x0, layout.range.x1, pxToX, setRange],
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

  const allTotalPoints = useMemo(
    () =>
      series.reduce(
        (acc, s) => acc + getLineRangeFocusFinitePoints(s.data).length,
        0,
      ),
    [series],
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
        data-section="chart-line-rangefocus"
        data-empty="true"
        data-series-count={series.length}
        data-visible-series-count={0}
        data-total-points={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-rangefocus-aria-desc"
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
  const rangeWidth = layout.range.x1 - layout.range.x0;
  const fullWidth = layout.fullXMax - layout.fullXMin;
  const rangeRatio = fullWidth > 0 ? rangeWidth / fullWidth : 0;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-rangefocus"
      data-empty="false"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-total-in-range={layout.totalInRange}
      data-range-x0={layout.range.x0}
      data-range-x1={layout.range.x1}
      data-range-ratio={rangeRatio}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-rangefocus-aria-desc"
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
        data-section="chart-line-rangefocus-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showRangeBadge ? (
          <div
            data-section="chart-line-rangefocus-badge"
            data-range-x0={layout.range.x0}
            data-range-x1={layout.range.x1}
            data-range-ratio={rangeRatio}
            data-total-in-range={layout.totalInRange}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: brushColor,
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-rangefocus-badge-icon"
              aria-hidden="true"
            >
              ↔
            </span>
            <span data-section="chart-line-rangefocus-badge-range">
              [{formatX(layout.range.x0)}, {formatX(layout.range.x1)}]
            </span>
            <span data-section="chart-line-rangefocus-badge-width">
              ({formatRangeWidth(rangeWidth)})
            </span>
          </div>
        ) : null}

        <svg
          ref={svgRef}
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          data-section="chart-line-rangefocus-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-rangefocus-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.detailYTicks.map((t, i) => {
                const py =
                  layout.detailPanel.y +
                  layout.detailPanel.height -
                  ((t - layout.detailYMin) /
                    (layout.detailYMax - layout.detailYMin)) *
                    layout.detailPanel.height;
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-rangefocus-grid-line"
                    data-panel="detail"
                    data-axis="y"
                    x1={layout.detailPanel.x}
                    x2={layout.detailPanel.x + layout.detailPanel.width}
                    y1={py}
                    y2={py}
                  />
                );
              })}
              {layout.detailXTicks.map((t, i) => {
                const px =
                  layout.detailPanel.x +
                  ((t - layout.detailXMin) /
                    (layout.detailXMax - layout.detailXMin)) *
                    layout.detailPanel.width;
                return (
                  <line
                    key={`gx-${i}`}
                    data-section="chart-line-rangefocus-grid-line"
                    data-panel="detail"
                    data-axis="x"
                    x1={px}
                    x2={px}
                    y1={layout.detailPanel.y}
                    y2={layout.detailPanel.y + layout.detailPanel.height}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-rangefocus-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-rangefocus-axis"
                data-panel="detail"
                data-axis="x"
                x1={layout.detailPanel.x}
                y1={layout.detailPanel.y + layout.detailPanel.height}
                x2={layout.detailPanel.x + layout.detailPanel.width}
                y2={layout.detailPanel.y + layout.detailPanel.height}
              />
              <line
                data-section="chart-line-rangefocus-axis"
                data-panel="detail"
                data-axis="y"
                x1={layout.detailPanel.x}
                y1={layout.detailPanel.y}
                x2={layout.detailPanel.x}
                y2={layout.detailPanel.y + layout.detailPanel.height}
              />
              <line
                data-section="chart-line-rangefocus-axis"
                data-panel="overview"
                data-axis="x"
                x1={layout.overviewPanel.x}
                y1={layout.overviewPanel.y + layout.overviewPanel.height}
                x2={layout.overviewPanel.x + layout.overviewPanel.width}
                y2={layout.overviewPanel.y + layout.overviewPanel.height}
              />
              <g
                data-section="chart-line-rangefocus-ticks"
                data-panel="detail"
                data-axis="x"
              >
                {layout.detailXTicks.map((t, i) => {
                  const px =
                    layout.detailPanel.x +
                    ((t - layout.detailXMin) /
                      (layout.detailXMax - layout.detailXMin)) *
                      layout.detailPanel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-rangefocus-tick"
                      data-panel="detail"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.detailPanel.y + layout.detailPanel.height}
                        y2={layout.detailPanel.y + layout.detailPanel.height + 4}
                      />
                      <text
                        data-section="chart-line-rangefocus-tick-label"
                        data-panel="detail"
                        data-axis="x"
                        x={px}
                        y={layout.detailPanel.y + layout.detailPanel.height + 14}
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
              <g
                data-section="chart-line-rangefocus-ticks"
                data-panel="detail"
                data-axis="y"
              >
                {layout.detailYTicks.map((t, i) => {
                  const py =
                    layout.detailPanel.y +
                    layout.detailPanel.height -
                    ((t - layout.detailYMin) /
                      (layout.detailYMax - layout.detailYMin)) *
                      layout.detailPanel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-rangefocus-tick"
                      data-panel="detail"
                      data-axis="y"
                    >
                      <line
                        x1={layout.detailPanel.x - 4}
                        x2={layout.detailPanel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-rangefocus-tick-label"
                        data-panel="detail"
                        data-axis="y"
                        x={layout.detailPanel.x - 6}
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
                  data-section="chart-line-rangefocus-x-label"
                  data-panel="detail"
                  x={layout.detailPanel.x + layout.detailPanel.width / 2}
                  y={layout.overviewPanel.y + layout.overviewPanel.height + 16}
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
                  data-section="chart-line-rangefocus-y-label"
                  data-panel="detail"
                  transform={`rotate(-90 12 ${layout.detailPanel.y + layout.detailPanel.height / 2})`}
                  x={12}
                  y={layout.detailPanel.y + layout.detailPanel.height / 2}
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

          <g data-section="chart-line-rangefocus-detail-series">
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-rangefocus-detail-series-group"
                data-series-id={s.id}
                data-series-color={s.color}
                data-series-in-range-count={s.inRangeCount}
                data-series-finite-count={s.finiteCount}
              >
                {s.detailPath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} detail line in range`}
                    data-section="chart-line-rangefocus-detail-path"
                    data-series-id={s.id}
                    data-kind="detail"
                    d={s.detailPath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showDots
                  ? s.detailPoints
                      .filter((p) => p.inRange)
                      .map((p) => {
                        const isHover =
                          hoverPayload?.seriesId === s.id &&
                          hoverPayload?.pointIndex === p.index;
                        return (
                          <circle
                            key={`dd-${p.index}`}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={`${s.label} detail point ${p.index + 1} at x ${formatX(p.x)} y ${formatValue(p.y)}`}
                            data-section="chart-line-rangefocus-detail-dot"
                            data-series-id={s.id}
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

          {showOverview ? (
            <g data-section="chart-line-rangefocus-overview">
              {layout.series.map((s) => (
                <path
                  key={s.id}
                  role="graphics-symbol"
                  aria-label={`${s.label} overview line`}
                  data-section="chart-line-rangefocus-overview-path"
                  data-series-id={s.id}
                  data-kind="overview"
                  d={s.overviewPath}
                  fill="none"
                  stroke={overviewLineColor}
                  strokeWidth={overviewStrokeWidth}
                  strokeOpacity={outsideOpacity}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {showOverviewBrush ? (
                <g
                  data-section="chart-line-rangefocus-brush"
                  role="slider"
                  aria-label="Range brush"
                  aria-valuemin={layout.fullXMin}
                  aria-valuemax={layout.fullXMax}
                  aria-valuenow={layout.range.x0}
                  aria-valuetext={`${formatX(layout.range.x0)} to ${formatX(layout.range.x1)}`}
                >
                  <rect
                    data-section="chart-line-rangefocus-brush-bg"
                    x={layout.overviewPanel.x}
                    y={layout.overviewPanel.y}
                    width={layout.overviewPanel.width}
                    height={layout.overviewPanel.height}
                    fill="transparent"
                    stroke="none"
                    onPointerDown={handleOverviewClick}
                  />
                  <rect
                    data-section="chart-line-rangefocus-brush-rect"
                    data-kind="rect"
                    x={layout.brushRect.x}
                    y={layout.brushRect.y}
                    width={layout.brushRect.width}
                    height={layout.brushRect.height}
                    fill={brushColor}
                    fillOpacity={brushOpacity}
                    stroke={brushColor}
                    strokeWidth={1}
                    style={{ cursor: 'grab' }}
                    onPointerDown={(e) => handlePointerDown(e, 'move')}
                  />
                  <rect
                    data-section="chart-line-rangefocus-brush-handle"
                    data-kind="left"
                    x={layout.brushLeftHandle.x}
                    y={layout.brushLeftHandle.y}
                    width={layout.brushLeftHandle.width}
                    height={layout.brushLeftHandle.height}
                    fill={brushColor}
                    style={{ cursor: 'ew-resize' }}
                    onPointerDown={(e) => handlePointerDown(e, 'left')}
                  />
                  <rect
                    data-section="chart-line-rangefocus-brush-handle"
                    data-kind="right"
                    x={layout.brushRightHandle.x}
                    y={layout.brushRightHandle.y}
                    width={layout.brushRightHandle.width}
                    height={layout.brushRightHandle.height}
                    fill={brushColor}
                    style={{ cursor: 'ew-resize' }}
                    onPointerDown={(e) => handlePointerDown(e, 'right')}
                  />
                </g>
              ) : null}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoverPayload && tooltipPos
          ? (() => {
              const s = layout.series.find((x) => x.id === hoverPayload.seriesId);
              if (!s) return null;
              const p = s.detailPoints.find((x) => x.index === hoverPayload.pointIndex);
              if (!p) return null;
              return (
                <div
                  data-section="chart-line-rangefocus-tooltip"
                  data-series-id={s.id}
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
                    minWidth: 130,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-rangefocus-tooltip-label"
                    style={{ color: s.color, fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-rangefocus-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div
                    data-section="chart-line-rangefocus-tooltip-y"
                    style={{ fontWeight: 600 }}
                  >
                    y: {formatValue(p.y)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-rangefocus-legend"
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
              DEFAULT_CHART_LINE_RANGEFOCUS_PALETTE[0]!;
            return (
              <button
                key={s.id}
                type="button"
                data-section="chart-line-rangefocus-legend-item"
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
                  data-section="chart-line-rangefocus-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: swatchColor,
                  }}
                />
                <span data-section="chart-line-rangefocus-legend-label">
                  {s.label}
                </span>
                {layoutMatch ? (
                  <span
                    data-section="chart-line-rangefocus-legend-stats"
                    style={{ fontSize: 10, color: '#64748b' }}
                  >
                    ({layoutMatch.inRangeCount}/{layoutMatch.finiteCount})
                  </span>
                ) : null}
              </button>
            );
          })}
          <span
            data-section="chart-line-rangefocus-legend-total-points"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {allTotalPoints} total points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineRangeFocus.displayName = 'ChartLineRangeFocus';
