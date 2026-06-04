import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_PIVOT_POINTS_WIDTH = 560;
export const DEFAULT_CHART_LINE_PIVOT_POINTS_HEIGHT = 320;
export const DEFAULT_CHART_LINE_PIVOT_POINTS_PADDING = 40;
export const DEFAULT_CHART_LINE_PIVOT_POINTS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PIVOT_POINTS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PIVOT_POINTS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PIVOT_POINTS_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_PIVOT_POINTS_PIVOT_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_PIVOT_POINTS_RESISTANCE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PIVOT_POINTS_SUPPORT_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PIVOT_POINTS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PIVOT_POINTS_AXIS_COLOR = '#cbd5e1';

export type ChartLinePivotPointsLevelId =
  | 'r3'
  | 'r2'
  | 'r1'
  | 'pivot'
  | 's1'
  | 's2'
  | 's3';

export type ChartLinePivotPointsLevelKind =
  | 'resistance'
  | 'pivot'
  | 'support';

export type ChartLinePivotPointsPosition = 'above' | 'below' | 'on';

export interface ChartLinePivotPointsPoint {
  x: number;
  value: number;
}

export interface ChartLinePivotPointsInput {
  high: number;
  low: number;
  close: number;
}

export interface ChartLinePivotPointsLevels {
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface ChartLinePivotPointsLevel {
  id: ChartLinePivotPointsLevelId;
  label: string;
  value: number;
  kind: ChartLinePivotPointsLevelKind;
}

export interface ChartLinePivotPointsSample {
  index: number;
  x: number;
  value: number;
  position: ChartLinePivotPointsPosition;
}

export interface ChartLinePivotPointsRun {
  series: ChartLinePivotPointsPoint[];
  levels: ChartLinePivotPointsLevels | null;
  levelList: ChartLinePivotPointsLevel[];
  samples: ChartLinePivotPointsSample[];
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLinePivotPointsPriceDot {
  index: number;
  x: number;
  value: number;
  position: ChartLinePivotPointsPosition;
  px: number;
  py: number;
}

export interface ChartLinePivotPointsLevelLine {
  id: ChartLinePivotPointsLevelId;
  label: string;
  value: number;
  kind: ChartLinePivotPointsLevelKind;
  py: number;
}

export interface ChartLinePivotPointsPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLinePivotPointsLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLinePivotPointsPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  priceDots: ChartLinePivotPointsPriceDot[];
  levelLines: ChartLinePivotPointsLevelLine[];
  levels: ChartLinePivotPointsLevels | null;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLinePivotPointsLayoutOptions {
  data: readonly ChartLinePivotPointsPoint[];
  prior?: ChartLinePivotPointsInput;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLinePivotPointsProps {
  data: readonly ChartLinePivotPointsPoint[];
  prior?: ChartLinePivotPointsInput;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  pivotColor?: string;
  resistanceColor?: string;
  supportColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLevels?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLinePivotPointsPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function noNegativeZero(v: number): number {
  return v === 0 ? 0 : v;
}

export function getLinePivotPointsFinitePoints(
  points: readonly ChartLinePivotPointsPoint[] | null | undefined,
): ChartLinePivotPointsPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLinePivotPointsPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Classic ("floor trader" / standard) pivot points. From the prior
 * period's high, low and close the pivot `P = (H + L + C) / 3`
 * anchors three resistance levels above and three support levels
 * below:
 *
 *   R1 = 2P - L      S1 = 2P - H
 *   R2 = P + (H-L)   S2 = P - (H-L)
 *   R3 = H + 2(P-L)  S3 = L - 2(H-P)
 *
 * Returns `null` when any of high / low / close is not a finite
 * number.
 */
export function computeLinePivotPoints(
  input: ChartLinePivotPointsInput | null | undefined,
): ChartLinePivotPointsLevels | null {
  if (!input) return null;
  const { high, low, close } = input;
  if (
    !isFiniteNumber(high) ||
    !isFiniteNumber(low) ||
    !isFiniteNumber(close)
  ) {
    return null;
  }
  const pivot = (high + low + close) / 3;
  const range = high - low;
  return {
    pivot: noNegativeZero(pivot),
    r1: noNegativeZero(2 * pivot - low),
    r2: noNegativeZero(pivot + range),
    r3: noNegativeZero(high + 2 * (pivot - low)),
    s1: noNegativeZero(2 * pivot - high),
    s2: noNegativeZero(pivot - range),
    s3: noNegativeZero(low - 2 * (high - pivot)),
  };
}

/**
 * The seven pivot levels as an ordered list, top to bottom:
 * R3, R2, R1, pivot, S1, S2, S3. Each entry carries a stable id, a
 * short label, its value, and whether it is a resistance, the pivot,
 * or a support level.
 */
export function getLinePivotPointsLevelList(
  levels: ChartLinePivotPointsLevels,
): ChartLinePivotPointsLevel[] {
  return [
    { id: 'r3', label: 'R3', value: levels.r3, kind: 'resistance' },
    { id: 'r2', label: 'R2', value: levels.r2, kind: 'resistance' },
    { id: 'r1', label: 'R1', value: levels.r1, kind: 'resistance' },
    { id: 'pivot', label: 'P', value: levels.pivot, kind: 'pivot' },
    { id: 's1', label: 'S1', value: levels.s1, kind: 'support' },
    { id: 's2', label: 'S2', value: levels.s2, kind: 'support' },
    { id: 's3', label: 'S3', value: levels.s3, kind: 'support' },
  ];
}

function classifyPosition(
  value: number,
  pivot: number,
): ChartLinePivotPointsPosition {
  if (value > pivot) return 'above';
  if (value < pivot) return 'below';
  return 'on';
}

export function runLinePivotPoints(
  points: readonly ChartLinePivotPointsPoint[] | null | undefined,
  options?: { prior?: ChartLinePivotPointsInput },
): ChartLinePivotPointsRun {
  const finite = getLinePivotPointsFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const levels = computeLinePivotPoints(options?.prior ?? null);
  const n = series.length;

  if (n < 2 || levels === null) {
    return {
      series,
      levels,
      levelList: levels ? getLinePivotPointsLevelList(levels) : [],
      samples: [],
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const levelList = getLinePivotPointsLevelList(levels);
  const samples: ChartLinePivotPointsSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    position: classifyPosition(p.value, levels.pivot),
  }));

  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series,
    levels,
    levelList,
    samples,
    aboveCount,
    belowCount,
    ok: true,
  };
}

function buildPath(points: readonly { px: number; py: number }[]): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
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

export function computeLinePivotPointsLayout(
  options: ComputeLinePivotPointsLayoutOptions,
): ChartLinePivotPointsLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_PIVOT_POINTS_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLinePivotPointsPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLinePivotPoints(data, {
    ...(options.prior ? { prior: options.prior } : {}),
  });
  const empty: ChartLinePivotPointsLayout = {
    ok: false,
    width,
    height,
    panel: emptyPanel,
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    pricePath: '',
    priceDots: [],
    levelLines: [],
    levels: run.levels,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok || run.levels === null) return empty;

  const panel: ChartLinePivotPointsPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < yLo) yLo = s.value;
    if (s.value > yHi) yHi = s.value;
  }
  for (const l of run.levelList) {
    if (l.value < yLo) yLo = l.value;
    if (l.value > yHi) yHi = l.value;
  }
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
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const priceDots: ChartLinePivotPointsPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const levelLines: ChartLinePivotPointsLevelLine[] = run.levelList.map(
    (l) => ({
      id: l.id,
      label: l.label,
      value: l.value,
      kind: l.kind,
      py: projectY(l.value),
    }),
  );

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    yTicks: computeTicks(yLo, yHi, tickCount).map((v) => ({
      value: v,
      py: projectY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    levelLines,
    levels: run.levels,
    aboveCount: run.aboveCount,
    belowCount: run.belowCount,
    totalPoints: run.samples.length,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLinePivotPointsChart(
  data: readonly ChartLinePivotPointsPoint[] | null | undefined,
  options?: { prior?: ChartLinePivotPointsInput },
): string {
  const run = runLinePivotPoints(data, options);
  if (!run.ok || run.levels === null) return 'No data';
  const lv = run.levels;
  return `Line chart with classic (floor-trader) pivot point levels: from the prior period's high, low and close the pivot P = (H+L+C)/3 anchors three resistance levels (R1, R2, R3) above and three support levels (S1, S2, S3) below -- R1 = 2P-L, S1 = 2P-H, R2 = P+(H-L), S2 = P-(H-L), R3 = H+2(P-L), S3 = L-2(H-P). The pivot sits at ${defaultFormatValue(lv.pivot)} with resistance at ${defaultFormatValue(lv.r1)} / ${defaultFormatValue(lv.r2)} / ${defaultFormatValue(lv.r3)} and support at ${defaultFormatValue(lv.s1)} / ${defaultFormatValue(lv.s2)} / ${defaultFormatValue(lv.s3)}. The price runs above the pivot on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} bars.`;
}

const PIVOT_POINTS_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

function levelAriaLabel(
  line: ChartLinePivotPointsLevelLine,
  formatValue: (n: number) => string,
): string {
  const name =
    line.kind === 'pivot'
      ? 'Pivot'
      : line.kind === 'resistance'
        ? `Resistance ${line.label.slice(1)}`
        : `Support ${line.label.slice(1)}`;
  return `${name} level at ${formatValue(line.value)}`;
}

export const ChartLinePivotPoints = forwardRef<
  HTMLDivElement,
  ChartLinePivotPointsProps
>(function ChartLinePivotPoints(
  props: ChartLinePivotPointsProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    prior,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_PIVOT_POINTS_WIDTH,
    height = DEFAULT_CHART_LINE_PIVOT_POINTS_HEIGHT,
    padding = DEFAULT_CHART_LINE_PIVOT_POINTS_PADDING,
    tickCount = DEFAULT_CHART_LINE_PIVOT_POINTS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_PIVOT_POINTS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_PIVOT_POINTS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_PIVOT_POINTS_PRICE_COLOR,
    pivotColor = DEFAULT_CHART_LINE_PIVOT_POINTS_PIVOT_COLOR,
    resistanceColor = DEFAULT_CHART_LINE_PIVOT_POINTS_RESISTANCE_COLOR,
    supportColor = DEFAULT_CHART_LINE_PIVOT_POINTS_SUPPORT_COLOR,
    gridColor = DEFAULT_CHART_LINE_PIVOT_POINTS_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_PIVOT_POINTS_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showLevels = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with classic pivot point levels',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
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
      computeLinePivotPointsLayout({
        data,
        width,
        height,
        padding,
        tickCount,
        ...(prior ? { prior } : {}),
      }),
    [data, prior, width, height, padding, tickCount],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLinePivotPointsChart(data, {
        ...(prior ? { prior } : {}),
      }),
    [ariaDescription, data, prior],
  );

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHoverIndex(null);
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
        data-section="chart-line-pivot-points"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-pivot-points-aria-desc"
          style={PIVOT_POINTS_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const cp = layout.panel;
  const priceVisible = !hiddenSet.has('price');
  const pivotVisible = showLevels && !hiddenSet.has('pivot');
  const resistanceVisible = showLevels && !hiddenSet.has('resistance');
  const supportVisible = showLevels && !hiddenSet.has('support');

  const isKindVisible = (kind: ChartLinePivotPointsLevelKind): boolean => {
    if (kind === 'pivot') return pivotVisible;
    if (kind === 'resistance') return resistanceVisible;
    return supportVisible;
  };

  const visibleLevelLines = layout.levelLines.filter((l) =>
    isKindVisible(l.kind),
  );

  const levelColor = (kind: ChartLinePivotPointsLevelKind): string =>
    kind === 'pivot'
      ? pivotColor
      : kind === 'resistance'
        ? resistanceColor
        : supportColor;

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'pivot', label: 'Pivot', color: pivotColor },
    { id: 'resistance', label: 'Resistance', color: resistanceColor },
    { id: 'support', label: 'Support', color: supportColor },
  ];

  const pivotValue = layout.levels ? layout.levels.pivot : NaN;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={
        [className, animateClass].filter(Boolean).join(' ') || undefined
      }
      style={containerStyle}
      data-section="chart-line-pivot-points"
      data-empty="false"
      data-pivot={pivotValue}
      data-above-count={layout.aboveCount}
      data-below-count={layout.belowCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-pivot-points-aria-desc"
        style={PIVOT_POINTS_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-pivot-points-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-pivot-points-badge"
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
              data-section="chart-line-pivot-points-badge-icon"
              aria-hidden="true"
              style={{ color: pivotColor }}
            >
              PIVOT
            </span>
            <span data-section="chart-line-pivot-points-badge-pivot">
              P={formatValue(pivotValue)}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-pivot-points-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-pivot-points-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => (
                <line
                  key={`gy-${i}`}
                  data-section="chart-line-pivot-points-grid-line"
                  x1={cp.x}
                  x2={cp.x + cp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-pivot-points-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-pivot-points-axis"
                data-axis="x"
                x1={cp.x}
                y1={cp.y + cp.height}
                x2={cp.x + cp.width}
                y2={cp.y + cp.height}
              />
              <line
                data-section="chart-line-pivot-points-axis"
                data-axis="y"
                x1={cp.x}
                y1={cp.y}
                x2={cp.x}
                y2={cp.y + cp.height}
              />
              {layout.yTicks.map((t, i) => (
                <g
                  key={`yt-${i}`}
                  data-section="chart-line-pivot-points-tick"
                  data-axis="y"
                >
                  <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                  <text
                    data-section="chart-line-pivot-points-tick-label"
                    data-axis="y"
                    x={cp.x - 6}
                    y={t.py + 3}
                    textAnchor="end"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatValue(t.value)}
                  </text>
                </g>
              ))}
              {layout.xTicks.map((t, i) => (
                <g
                  key={`xt-${i}`}
                  data-section="chart-line-pivot-points-tick"
                  data-axis="x"
                >
                  <line
                    x1={t.px}
                    x2={t.px}
                    y1={cp.y + cp.height}
                    y2={cp.y + cp.height + 4}
                  />
                  <text
                    data-section="chart-line-pivot-points-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={cp.y + cp.height + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatX(t.value)}
                  </text>
                </g>
              ))}
            </g>
          ) : null}

          {showLevels ? (
            <g data-section="chart-line-pivot-points-levels">
              {visibleLevelLines.map((l) => {
                const color = levelColor(l.kind);
                return (
                  <g
                    key={`lv-${l.id}`}
                    data-section="chart-line-pivot-points-level"
                    data-level-id={l.id}
                    data-level-kind={l.kind}
                    data-level-value={l.value}
                  >
                    <line
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={levelAriaLabel(l, formatValue)}
                      data-section="chart-line-pivot-points-level-line"
                      x1={cp.x}
                      x2={cp.x + cp.width}
                      y1={l.py}
                      y2={l.py}
                      stroke={color}
                      strokeWidth={l.kind === 'pivot' ? 1.75 : 1.25}
                      strokeDasharray={l.kind === 'pivot' ? undefined : '5 3'}
                    />
                    <text
                      data-section="chart-line-pivot-points-level-label"
                      x={cp.x + cp.width - 4}
                      y={l.py - 3}
                      textAnchor="end"
                      fontSize={10}
                      fontWeight={600}
                      fill={color}
                      stroke="none"
                    >
                      {l.label} {formatValue(l.value)}
                    </text>
                  </g>
                );
              })}
            </g>
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-pivot-points-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-pivot-points-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-pivot-points-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-value={d.value}
                    cx={d.px}
                    cy={d.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={priceColor}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverIndex(d.index);
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(d.index);
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => onPointClick?.({ point: d })}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoverIndex !== null && tooltipPos
          ? (() => {
              const d = layout.priceDots.find((x) => x.index === hoverIndex);
              if (!d) return null;
              return (
                <div
                  data-section="chart-line-pivot-points-tooltip"
                  data-point-index={d.index}
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
                  <div data-section="chart-line-pivot-points-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-pivot-points-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-pivot-points-tooltip-position">
                    vs pivot: {d.position}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-pivot-points-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          {legendItems.map((item) => {
            const isHidden = hiddenSet.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-section="chart-line-pivot-points-legend-item"
                data-series-id={item.id}
                data-hidden={isHidden ? 'true' : 'false'}
                onClick={() => handleToggle(item.id)}
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
                  data-section="chart-line-pivot-points-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-pivot-points-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-pivot-points-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.aboveCount} above pivot, {layout.belowCount} below
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLinePivotPoints.displayName = 'ChartLinePivotPoints';
