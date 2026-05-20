import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_BUMP_WIDTH = 560;
export const DEFAULT_CHART_LINE_BUMP_HEIGHT = 320;
export const DEFAULT_CHART_LINE_BUMP_PADDING = 40;
export const DEFAULT_CHART_LINE_BUMP_STROKE_WIDTH = 2.5;
export const DEFAULT_CHART_LINE_BUMP_NODE_RADIUS = 4;
export const DEFAULT_CHART_LINE_BUMP_PALETTE = [
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
export const DEFAULT_CHART_LINE_BUMP_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_BUMP_AXIS_COLOR = '#cbd5e1';

export type ChartLineBumpRankOrder = 'asc' | 'desc';

export interface ChartLineBumpPoint {
  x: number;
  value: number;
}

export interface ChartLineBumpSeries {
  id: string;
  label: string;
  data: readonly ChartLineBumpPoint[];
  color?: string;
}

export interface ChartLineBumpColumnEntry {
  seriesId: string;
  value: number;
  rank: number;
}

export interface ChartLineBumpColumn {
  x: number;
  entries: ChartLineBumpColumnEntry[];
}

export interface ChartLineBumpNode {
  x: number;
  value: number;
  rank: number;
}

export interface ChartLineBumpRunSeries {
  id: string;
  label: string;
  nodes: ChartLineBumpNode[];
  bestRank: number;
  worstRank: number;
  meanRank: number;
  nodeCount: number;
}

export interface ChartLineBumpRun {
  xValues: number[];
  columns: ChartLineBumpColumn[];
  series: ChartLineBumpRunSeries[];
  seriesCount: number;
  columnCount: number;
  maxRank: number;
}

export interface ChartLineBumpLayoutNode extends ChartLineBumpNode {
  index: number;
  px: number;
  py: number;
}

export interface ChartLineBumpLayoutSeries {
  id: string;
  label: string;
  color: string;
  visible: boolean;
  nodes: ChartLineBumpLayoutNode[];
  path: string;
  bestRank: number;
  worstRank: number;
  meanRank: number;
  nodeCount: number;
}

export interface ChartLineBumpLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: { x: number; y: number; width: number; height: number };
  xValues: number[];
  columns: ChartLineBumpColumn[];
  xTicks: { value: number; px: number }[];
  rankTicks: { rank: number; py: number }[];
  xMin: number;
  xMax: number;
  maxRank: number;
  innerWidth: number;
  innerHeight: number;
  series: ChartLineBumpLayoutSeries[];
  seriesCount: number;
  visibleSeriesCount: number;
  columnCount: number;
}

export interface ComputeLineBumpLayoutOptions {
  series: readonly ChartLineBumpSeries[];
  rankOrder?: ChartLineBumpRankOrder;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  curved?: boolean;
  width: number;
  height: number;
  padding: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
}

export interface ChartLineBumpProps {
  series: readonly ChartLineBumpSeries[];
  rankOrder?: ChartLineBumpRankOrder;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  strokeWidth?: number;
  nodeRadius?: number;
  curved?: boolean;
  gridColor?: string;
  axisColor?: string;
  xMin?: number;
  xMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showNodes?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showRankLabels?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onNodeClick?: (payload: {
    series: ChartLineBumpLayoutSeries;
    node: ChartLineBumpLayoutNode;
  }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineBumpDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_BUMP_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineBumpFinitePoints(
  points: readonly ChartLineBumpPoint[] | null | undefined,
): ChartLineBumpPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineBumpPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Rank every series at every x value. The union of x values across
 * all series defines the columns; within each column the series
 * present there are sorted by value (`desc` -> highest value gets
 * rank 1, `asc` -> lowest gets rank 1) and assigned ORDINAL ranks
 * 1..k -- every series gets a distinct rank, even on a tie. Ties
 * are broken deterministically by series declaration order, so the
 * bump chart always has a distinct y position per series.
 */
export function computeLineBumpColumns(
  series: readonly ChartLineBumpSeries[] | null | undefined,
  rankOrder: ChartLineBumpRankOrder = 'desc',
): { xValues: number[]; columns: ChartLineBumpColumn[] } {
  const list = Array.isArray(series) ? series : [];
  const cleaned = list.map((s, seriesIndex) => {
    const byX = new Map<number, number>();
    for (const p of getLineBumpFinitePoints(s?.data)) {
      byX.set(p.x, p.value);
    }
    return { id: s?.id ?? '', seriesIndex, byX };
  });

  const xSet = new Set<number>();
  for (const c of cleaned) {
    for (const x of c.byX.keys()) xSet.add(x);
  }
  const xValues = [...xSet].sort((a, b) => a - b);
  const asc = rankOrder === 'asc';

  const columns: ChartLineBumpColumn[] = xValues.map((x) => {
    const raw: { seriesId: string; value: number; seriesIndex: number }[] =
      [];
    for (const c of cleaned) {
      const v = c.byX.get(x);
      if (v !== undefined) {
        raw.push({ seriesId: c.id, value: v, seriesIndex: c.seriesIndex });
      }
    }
    raw.sort((a, b) => {
      if (a.value !== b.value) {
        return asc ? a.value - b.value : b.value - a.value;
      }
      return a.seriesIndex - b.seriesIndex;
    });
    return {
      x,
      entries: raw.map((e, i) => ({
        seriesId: e.seriesId,
        value: e.value,
        rank: i + 1,
      })),
    };
  });

  return { xValues, columns };
}

export function runLineBump(
  series: readonly ChartLineBumpSeries[] | null | undefined,
  rankOrder: ChartLineBumpRankOrder = 'desc',
): ChartLineBumpRun {
  const list = Array.isArray(series) ? series : [];
  const { xValues, columns } = computeLineBumpColumns(list, rankOrder);

  let maxRank = 0;
  for (const col of columns) {
    if (col.entries.length > maxRank) maxRank = col.entries.length;
  }

  const seriesOut: ChartLineBumpRunSeries[] = list.map((s) => {
    const nodes: ChartLineBumpNode[] = [];
    for (const col of columns) {
      const entry = col.entries.find((e) => e.seriesId === s.id);
      if (entry) {
        nodes.push({ x: col.x, value: entry.value, rank: entry.rank });
      }
    }
    let bestRank = NaN;
    let worstRank = NaN;
    let meanRank = NaN;
    if (nodes.length > 0) {
      bestRank = nodes[0]!.rank;
      worstRank = nodes[0]!.rank;
      let sum = 0;
      for (const n of nodes) {
        if (n.rank < bestRank) bestRank = n.rank;
        if (n.rank > worstRank) worstRank = n.rank;
        sum += n.rank;
      }
      meanRank = sum / nodes.length;
    }
    return {
      id: s.id,
      label: s.label,
      nodes,
      bestRank,
      worstRank,
      meanRank,
      nodeCount: nodes.length,
    };
  });

  return {
    xValues,
    columns,
    series: seriesOut,
    seriesCount: list.length,
    columnCount: columns.length,
    maxRank,
  };
}

function buildBumpPath(
  points: readonly { px: number; py: number }[],
  curved: boolean,
): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  let d = `M ${first.px.toFixed(3)} ${first.py.toFixed(3)}`;
  for (let i = 1; i < points.length; i += 1) {
    const p0 = points[i - 1]!;
    const p1 = points[i]!;
    if (curved) {
      const midX = (p0.px + p1.px) / 2;
      d += ` C ${midX.toFixed(3)} ${p0.py.toFixed(3)} ${midX.toFixed(3)} ${p1.py.toFixed(3)} ${p1.px.toFixed(3)} ${p1.py.toFixed(3)}`;
    } else {
      d += ` L ${p1.px.toFixed(3)} ${p1.py.toFixed(3)}`;
    }
  }
  return d;
}

function normaliseHidden(
  hidden: ReadonlySet<string> | readonly string[] | null | undefined,
): Set<string> {
  if (!hidden) return new Set();
  if (hidden instanceof Set) return new Set(hidden);
  if (Array.isArray(hidden)) return new Set(hidden);
  return new Set();
}

export function computeLineBumpLayout(
  options: ComputeLineBumpLayoutOptions,
): ChartLineBumpLayout {
  const {
    series,
    rankOrder = 'desc',
    hiddenSeries,
    curved = true,
    width,
    height,
    padding,
    defaultColors = DEFAULT_CHART_LINE_BUMP_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const panel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };
  const empty: ChartLineBumpLayout = {
    ok: false,
    width,
    height,
    panel,
    xValues: [],
    columns: [],
    xTicks: [],
    rankTicks: [],
    xMin: 0,
    xMax: 0,
    maxRank: 0,
    innerWidth,
    innerHeight,
    series: [],
    seriesCount: 0,
    visibleSeriesCount: 0,
    columnCount: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;

  const run = runLineBump(series, rankOrder);
  if (run.seriesCount === 0 || run.columnCount === 0) return empty;

  const hidden = normaliseHidden(hiddenSeries);

  let xLo = run.xValues[0]!;
  let xHi = run.xValues[run.xValues.length - 1]!;
  if (isFiniteNumber(xMinOverride)) xLo = xMinOverride;
  if (isFiniteNumber(xMaxOverride)) xHi = xMaxOverride;
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  const xRange = xHi - xLo;
  const maxRank = Math.max(1, run.maxRank);

  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectRank = (rank: number): number => {
    if (maxRank <= 1) return panel.y + panel.height / 2;
    return panel.y + ((rank - 1) / (maxRank - 1)) * panel.height;
  };

  const layoutSeries: ChartLineBumpLayoutSeries[] = run.series.map(
    (s, idx) => {
      const color =
        series[idx]?.color ??
        defaultColors[idx % defaultColors.length] ??
        DEFAULT_CHART_LINE_BUMP_PALETTE[0]!;
      const nodes: ChartLineBumpLayoutNode[] = s.nodes.map((n, i) => ({
        ...n,
        index: i,
        px: projectX(n.x),
        py: projectRank(n.rank),
      }));
      return {
        id: s.id,
        label: s.label,
        color,
        visible: !hidden.has(s.id),
        nodes,
        path: buildBumpPath(
          nodes.map((n) => ({ px: n.px, py: n.py })),
          curved,
        ),
        bestRank: s.bestRank,
        worstRank: s.worstRank,
        meanRank: s.meanRank,
        nodeCount: s.nodeCount,
      };
    },
  );

  const rankTicks: { rank: number; py: number }[] = [];
  for (let r = 1; r <= maxRank; r += 1) {
    rankTicks.push({ rank: r, py: projectRank(r) });
  }

  return {
    ok: true,
    width,
    height,
    panel,
    xValues: run.xValues,
    columns: run.columns,
    xTicks: run.xValues.map((x) => ({ value: x, px: projectX(x) })),
    rankTicks,
    xMin: xLo,
    xMax: xHi,
    maxRank,
    innerWidth,
    innerHeight,
    series: layoutSeries,
    seriesCount: run.seriesCount,
    visibleSeriesCount: layoutSeries.filter((s) => s.visible).length,
    columnCount: run.columnCount,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineBumpChart(
  series: readonly ChartLineBumpSeries[] | null | undefined,
  options?: {
    rankOrder?: ChartLineBumpRankOrder;
    hidden?: ReadonlySet<string> | readonly string[];
  },
): string {
  const rankOrder = options?.rankOrder ?? 'desc';
  const run = runLineBump(series, rankOrder);
  if (run.seriesCount === 0 || run.columnCount === 0) return 'No data';
  const hidden = normaliseHidden(options?.hidden);
  const visible = run.series.filter((s) => !hidden.has(s.id));
  if (visible.length === 0) return 'No data';
  const summaries = visible
    .filter((s) => s.nodeCount > 0)
    .map((s) => `${s.label} moves between rank ${s.bestRank} and ${s.worstRank}`);
  return `Bump chart tracking the rank of ${visible.length} series across ${run.columnCount} columns, ranked by ${rankOrder === 'asc' ? 'ascending' : 'descending'} value. ${summaries.join('; ')}.`;
}

export const ChartLineBump = forwardRef<HTMLDivElement, ChartLineBumpProps>(
  function ChartLineBump(
    props: ChartLineBumpProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      series,
      rankOrder = 'desc',
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_BUMP_WIDTH,
      height = DEFAULT_CHART_LINE_BUMP_HEIGHT,
      padding = DEFAULT_CHART_LINE_BUMP_PADDING,
      strokeWidth = DEFAULT_CHART_LINE_BUMP_STROKE_WIDTH,
      nodeRadius = DEFAULT_CHART_LINE_BUMP_NODE_RADIUS,
      curved = true,
      gridColor = DEFAULT_CHART_LINE_BUMP_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_BUMP_AXIS_COLOR,
      xMin,
      xMax,
      showAxis = true,
      showGrid = true,
      showNodes = true,
      showLegend = true,
      showTooltip = true,
      showConfigBadge = true,
      showRankLabels = false,
      animate = true,
      className,
      ariaLabel = 'Bump chart tracking the rank of each series over time',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      xLabel,
      yLabel,
      onNodeClick,
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
        computeLineBumpLayout({
          series,
          rankOrder,
          hiddenSeries: hiddenSet,
          curved,
          width,
          height,
          padding,
          ...(isFiniteNumber(xMin) ? { xMin } : {}),
          ...(isFiniteNumber(xMax) ? { xMax } : {}),
        }),
      [
        series,
        rankOrder,
        hiddenSet,
        curved,
        width,
        height,
        padding,
        xMin,
        xMax,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineBumpChart(series, { rankOrder, hidden: hiddenSet }),
      [ariaDescription, series, rankOrder, hiddenSet],
    );

    const [hoverPayload, setHoverPayload] = useState<{
      seriesId: string;
      nodeIndex: number;
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
          data-section="chart-line-bump"
          data-empty="true"
          data-series-count={0}
          data-visible-series-count={0}
          data-column-count={0}
          data-max-rank={0}
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-bump-aria-desc"
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
        className={
          [className, animateClass].filter(Boolean).join(' ') || undefined
        }
        style={containerStyle}
        data-section="chart-line-bump"
        data-empty="false"
        data-series-count={layout.seriesCount}
        data-visible-series-count={layout.visibleSeriesCount}
        data-column-count={layout.columnCount}
        data-max-rank={layout.maxRank}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-bump-aria-desc"
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
          data-section="chart-line-bump-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-bump-badge"
              data-series-count={layout.seriesCount}
              data-column-count={layout.columnCount}
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
                data-section="chart-line-bump-badge-icon"
                aria-hidden="true"
              >
                BUMP
              </span>
              <span data-section="chart-line-bump-badge-series">
                series={layout.seriesCount}
              </span>
              <span data-section="chart-line-bump-badge-columns">
                cols={layout.columnCount}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-bump-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-bump-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.rankTicks.map((t) => (
                  <line
                    key={`gr-${t.rank}`}
                    data-section="chart-line-bump-grid-line"
                    data-axis="rank"
                    x1={layout.panel.x}
                    x2={layout.panel.x + layout.panel.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.xTicks.map((t, i) => (
                  <line
                    key={`gx-${i}`}
                    data-section="chart-line-bump-grid-line"
                    data-axis="x"
                    x1={t.px}
                    x2={t.px}
                    y1={layout.panel.y}
                    y2={layout.panel.y + layout.panel.height}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-bump-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-bump-axis"
                  data-axis="x"
                  x1={layout.panel.x}
                  y1={layout.panel.y + layout.panel.height}
                  x2={layout.panel.x + layout.panel.width}
                  y2={layout.panel.y + layout.panel.height}
                />
                <line
                  data-section="chart-line-bump-axis"
                  data-axis="y"
                  x1={layout.panel.x}
                  y1={layout.panel.y}
                  x2={layout.panel.x}
                  y2={layout.panel.y + layout.panel.height}
                />
                <g data-section="chart-line-bump-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-bump-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={layout.panel.y + layout.panel.height}
                        y2={layout.panel.y + layout.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-bump-tick-label"
                        data-axis="x"
                        x={t.px}
                        y={layout.panel.y + layout.panel.height + 14}
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
                <g data-section="chart-line-bump-ticks" data-axis="rank">
                  {layout.rankTicks.map((t) => (
                    <g
                      key={`tr-${t.rank}`}
                      data-section="chart-line-bump-tick"
                      data-axis="rank"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={t.py}
                        y2={t.py}
                      />
                      <text
                        data-section="chart-line-bump-tick-label"
                        data-axis="rank"
                        x={layout.panel.x - 6}
                        y={t.py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {t.rank}
                      </text>
                    </g>
                  ))}
                </g>
                {xLabel ? (
                  <text
                    data-section="chart-line-bump-x-label"
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
                    data-section="chart-line-bump-y-label"
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

            <g data-section="chart-line-bump-series">
              {layout.series.map((s) =>
                s.visible ? (
                  <g
                    key={s.id}
                    data-section="chart-line-bump-series-group"
                    data-series-id={s.id}
                    data-series-color={s.color}
                    data-series-best-rank={s.bestRank}
                    data-series-worst-rank={s.worstRank}
                    data-series-node-count={s.nodeCount}
                  >
                    {s.path ? (
                      <path
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={`${s.label} rank trajectory`}
                        data-section="chart-line-bump-path"
                        data-series-id={s.id}
                        d={s.path}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : null}
                    {showNodes
                      ? s.nodes.map((n) => {
                          const isHover =
                            hoverPayload?.seriesId === s.id &&
                            hoverPayload?.nodeIndex === n.index;
                          return (
                            <g
                              key={`n-${n.index}`}
                              data-section="chart-line-bump-node"
                              data-series-id={s.id}
                              data-node-index={n.index}
                              data-rank={n.rank}
                              data-x={n.x}
                              data-value={n.value}
                            >
                              <circle
                                role="graphics-symbol"
                                tabIndex={0}
                                aria-label={`${s.label} at x ${formatX(n.x)}: rank ${n.rank} of ${layout.maxRank}, value ${formatValue(n.value)}`}
                                cx={n.px}
                                cy={n.py}
                                r={isHover ? nodeRadius + 1.5 : nodeRadius}
                                fill={s.color}
                                stroke="#ffffff"
                                strokeWidth={1.5}
                                onMouseEnter={() => {
                                  setHoverPayload({
                                    seriesId: s.id,
                                    nodeIndex: n.index,
                                  });
                                  setTooltipPos({ px: n.px, py: n.py });
                                }}
                                onMouseLeave={clearHover}
                                onFocus={() => {
                                  setHoverPayload({
                                    seriesId: s.id,
                                    nodeIndex: n.index,
                                  });
                                  setTooltipPos({ px: n.px, py: n.py });
                                }}
                                onBlur={clearHover}
                                onClick={() =>
                                  onNodeClick?.({ series: s, node: n })
                                }
                              />
                              {showRankLabels ? (
                                <text
                                  data-section="chart-line-bump-rank-label"
                                  data-series-id={s.id}
                                  data-rank={n.rank}
                                  x={n.px}
                                  y={n.py + 3}
                                  textAnchor="middle"
                                  fontSize={9}
                                  fontWeight={700}
                                  fill="#ffffff"
                                  stroke="none"
                                >
                                  {n.rank}
                                </text>
                              ) : null}
                            </g>
                          );
                        })
                      : null}
                  </g>
                ) : null,
              )}
            </g>
          </svg>

          {showTooltip && hoverPayload && tooltipPos
            ? (() => {
                const s = layout.series.find(
                  (x) => x.id === hoverPayload.seriesId,
                );
                if (!s) return null;
                const n = s.nodes.find(
                  (x) => x.index === hoverPayload.nodeIndex,
                );
                if (!n) return null;
                return (
                  <div
                    data-section="chart-line-bump-tooltip"
                    data-series-id={s.id}
                    data-node-index={n.index}
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
                      data-section="chart-line-bump-tooltip-label"
                      style={{ color: s.color, fontWeight: 600 }}
                    >
                      {s.label}
                    </div>
                    <div data-section="chart-line-bump-tooltip-x">
                      x: {formatX(n.x)}
                    </div>
                    <div
                      data-section="chart-line-bump-tooltip-rank"
                      style={{ fontWeight: 600 }}
                    >
                      rank: {n.rank} of {layout.maxRank}
                    </div>
                    <div data-section="chart-line-bump-tooltip-value">
                      value: {formatValue(n.value)}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-bump-legend"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 8,
              alignItems: 'center',
            }}
          >
            {layout.series.map((s) => {
              const isHidden = hiddenSet.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  data-section="chart-line-bump-legend-item"
                  data-series-id={s.id}
                  data-hidden={isHidden ? 'true' : 'false'}
                  onClick={() => handleToggle(s.id)}
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
                    data-section="chart-line-bump-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: s.color,
                    }}
                  />
                  <span data-section="chart-line-bump-legend-label">
                    {s.label}
                  </span>
                  {Number.isFinite(s.bestRank) ? (
                    <span
                      data-section="chart-line-bump-legend-stats"
                      style={{ fontSize: 10, color: '#64748b' }}
                    >
                      (best {s.bestRank})
                    </span>
                  ) : null}
                </button>
              );
            })}
            <span
              data-section="chart-line-bump-legend-columns"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.columnCount} columns
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineBump.displayName = 'ChartLineBump';
