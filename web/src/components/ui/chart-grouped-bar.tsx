import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';
import { getDefaultBarColor } from './chart-bar';

// (v1.11.485, TODO 11.467) ChartGroupedBar primitive.
//
// Pure-SVG grouped bar chart. Each category gets its own
// horizontal slot; within the slot, every visible series
// renders its bar side-by-side. Distinct from
// `<ChartBar>` (11.438) in that this primitive emphasises
// multi-series side-by-side grouping + a clickable legend
// that toggles per-series visibility (controlled or
// uncontrolled). Hover surfaces the bar's category +
// series label + formatted value.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartGroupedBarSeries {
  id: string;
  label: string;
  data: readonly number[];
  color?: string;
}

export interface ChartGroupedBarProps {
  categories: readonly string[];
  series: readonly ChartGroupedBarSeries[];
  width?: number;
  height?: number;
  padding?: number;
  groupGap?: number;
  barGap?: number;
  hiddenSeries?: readonly string[];
  defaultHiddenSeries?: readonly string[];
  onHiddenSeriesChange?: (hidden: string[]) => void;
  showLegend?: boolean;
  showAxisTicks?: boolean;
  showGrid?: boolean;
  showLabels?: boolean;
  showValues?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  tickCount?: number;
  legendPlacement?: 'right' | 'bottom';
  onBarClick?: (args: {
    series: ChartGroupedBarSeries;
    seriesIndex: number;
    category: string;
    categoryIndex: number;
    value: number;
  }) => void;
  onSeriesClick?: (args: {
    series: ChartGroupedBarSeries;
    index: number;
    hidden: boolean;
  }) => void;
}

export interface GroupedBarRect {
  series: ChartGroupedBarSeries;
  seriesIndex: number;
  category: string;
  categoryIndex: number;
  value: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_GROUPED_BAR_WIDTH = 560;
export const DEFAULT_CHART_GROUPED_BAR_HEIGHT = 280;
export const DEFAULT_CHART_GROUPED_BAR_PADDING = 36;
export const DEFAULT_CHART_GROUPED_BAR_GROUP_GAP = 16;
export const DEFAULT_CHART_GROUPED_BAR_BAR_GAP = 2;
export const DEFAULT_CHART_GROUPED_BAR_TICK_COUNT = 5;

// Compute the chart-wide max value for the y axis across
// every visible series. Falls back to 1 for empty / all-
// non-finite data so the chart still renders.
export function getGroupedBarMaxValue(
  series: readonly ChartGroupedBarSeries[],
  hidden: ReadonlySet<string>,
): number {
  let max = Number.NEGATIVE_INFINITY;
  for (const s of series) {
    if (hidden.has(s.id)) continue;
    for (const v of s.data) {
      if (Number.isFinite(v) && (v as number) > max) {
        max = v as number;
      }
    }
  }
  if (!Number.isFinite(max) || max <= 0) return 1;
  return max;
}

// Compute the per-bar rectangle layout in svg space.
// Hidden series are skipped entirely; the remaining
// series share each category's slot evenly.
export function computeGroupedBarLayout(
  categories: readonly string[],
  series: readonly ChartGroupedBarSeries[],
  hidden: ReadonlySet<string>,
  innerWidth: number,
  innerHeight: number,
  paddingX: number,
  paddingY: number,
  groupGap: number,
  barGap: number,
): GroupedBarRect[] {
  if (
    categories.length === 0 ||
    series.length === 0 ||
    innerWidth <= 0 ||
    innerHeight <= 0
  ) {
    return [];
  }
  const visibleSeries = series.filter((s) => !hidden.has(s.id));
  if (visibleSeries.length === 0) return [];
  const max = getGroupedBarMaxValue(series, hidden);
  const slotWidth =
    categories.length === 0
      ? 0
      : (innerWidth - groupGap * Math.max(0, categories.length - 1)) /
        categories.length;
  const barWidth =
    visibleSeries.length === 0
      ? 0
      : Math.max(
          1,
          (slotWidth - barGap * Math.max(0, visibleSeries.length - 1)) /
            visibleSeries.length,
        );
  const out: GroupedBarRect[] = [];
  for (let ci = 0; ci < categories.length; ci += 1) {
    const slotX = paddingX + ci * (slotWidth + groupGap);
    let visibleIdx = 0;
    for (let si = 0; si < series.length; si += 1) {
      const s = series[si]!;
      if (hidden.has(s.id)) continue;
      const raw = s.data[ci];
      const value =
        Number.isFinite(raw) && (raw as number) > 0
          ? (raw as number)
          : 0;
      const x = slotX + visibleIdx * (barWidth + barGap);
      const h = (value / max) * innerHeight;
      const y = paddingY + innerHeight - h;
      out.push({
        series: s,
        seriesIndex: si,
        category: categories[ci]!,
        categoryIndex: ci,
        value,
        x,
        y,
        w: barWidth,
        h,
      });
      visibleIdx += 1;
    }
  }
  return out;
}

// Evenly-spaced y-axis ticks.
export function getGroupedBarTicks(
  max: number,
  count: number = DEFAULT_CHART_GROUPED_BAR_TICK_COUNT,
): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const safeCount = Math.max(2, Math.floor(count));
  const step = max / (safeCount - 1);
  const out: number[] = [];
  for (let i = 0; i < safeCount; i += 1) out.push(i * step);
  return out;
}

// One-line ARIA summary.
export function describeGroupedBarChart(
  categories: readonly string[],
  series: readonly ChartGroupedBarSeries[],
  hidden: ReadonlySet<string>,
  formatValue?: (v: number) => string,
): string {
  if (categories.length === 0 || series.length === 0) {
    return 'No data';
  }
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const visible = series.filter((s) => !hidden.has(s.id));
  const parts = visible.map((s) => {
    let sum = 0;
    let n = 0;
    for (const v of s.data) {
      if (Number.isFinite(v) && (v as number) > 0) {
        sum += v as number;
        n += 1;
      }
    }
    return `${s.label} sum ${fv(sum)} (n=${n})`;
  });
  return `Grouped bar chart with ${categories.length} categories, ${visible.length} visible series. ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartGroupedBar = forwardRef(function ChartGroupedBar(
  {
    categories,
    series,
    width = DEFAULT_CHART_GROUPED_BAR_WIDTH,
    height = DEFAULT_CHART_GROUPED_BAR_HEIGHT,
    padding = DEFAULT_CHART_GROUPED_BAR_PADDING,
    groupGap = DEFAULT_CHART_GROUPED_BAR_GROUP_GAP,
    barGap = DEFAULT_CHART_GROUPED_BAR_BAR_GAP,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showLegend = true,
    showAxisTicks = true,
    showGrid = true,
    showLabels = true,
    showValues = false,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Grouped bar chart',
    ariaDescription,
    formatValue,
    tickCount = DEFAULT_CHART_GROUPED_BAR_TICK_COUNT,
    legendPlacement = 'bottom',
    onBarClick,
    onSeriesClick,
  }: ChartGroupedBarProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const [internalHidden, setInternalHidden] = useState<
    string[]
  >(() =>
    defaultHiddenSeries ? [...defaultHiddenSeries] : [],
  );
  const activeHidden = useMemo(
    () => new Set(hiddenSeries ?? internalHidden),
    [hiddenSeries, internalHidden],
  );

  const max = useMemo(
    () => getGroupedBarMaxValue(series, activeHidden),
    [activeHidden, series],
  );
  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(
    0,
    height - padding - (showLabels ? 18 : 0) - 4,
  );

  const layout = useMemo(
    () =>
      computeGroupedBarLayout(
        categories,
        series,
        activeHidden,
        innerWidth,
        innerHeight,
        padding,
        padding,
        groupGap,
        barGap,
      ),
    [
      activeHidden,
      barGap,
      categories,
      groupGap,
      innerHeight,
      innerWidth,
      padding,
      series,
    ],
  );

  const ticks = useMemo(
    () => getGroupedBarTicks(max, tickCount),
    [max, tickCount],
  );

  const yFor = useCallback(
    (v: number) => {
      if (max <= 0) return padding + innerHeight;
      const ratio = Math.max(0, Math.min(1, v / max));
      return padding + innerHeight - innerHeight * ratio;
    },
    [innerHeight, max, padding],
  );

  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;

  const description = useMemo(
    () =>
      ariaDescription ??
      describeGroupedBarChart(
        categories,
        series,
        activeHidden,
        formatValue,
      ),
    [
      activeHidden,
      ariaDescription,
      categories,
      formatValue,
      series,
    ],
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const handleEnter = useCallback((idx: number) => {
    setHovered(idx);
  }, []);
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const commitHidden = useCallback(
    (next: string[]) => {
      if (hiddenSeries === undefined) setInternalHidden(next);
      onHiddenSeriesChange?.(next);
    },
    [hiddenSeries, onHiddenSeriesChange],
  );

  const handleLegendClick = useCallback(
    (s: ChartGroupedBarSeries, i: number) => {
      const wasHidden = activeHidden.has(s.id);
      const next = wasHidden
        ? Array.from(activeHidden).filter((id) => id !== s.id)
        : [...Array.from(activeHidden), s.id];
      commitHidden(next);
      onSeriesClick?.({
        series: s,
        index: i,
        hidden: !wasHidden,
      });
    },
    [activeHidden, commitHidden, onSeriesClick],
  );

  const hoveredRect =
    hovered !== null ? layout[hovered] : null;
  const visibleCount = series.filter(
    (s) => !activeHidden.has(s.id),
  ).length;

  // Slot width for x-axis category label positioning
  const slotWidth =
    categories.length === 0
      ? 0
      : (innerWidth - groupGap * Math.max(0, categories.length - 1)) /
        categories.length;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-grouped-bar"
      data-category-count={categories.length}
      data-series-count={series.length}
      data-visible-count={visibleCount}
      data-bar-count={layout.length}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'flex w-full items-start gap-4',
        legendPlacement === 'bottom' && 'flex-col items-stretch',
        className,
      )}
      style={{ width }}
    >
      <div
        data-section="chart-grouped-bar-canvas"
        className="relative shrink-0"
        style={{ width, height }}
      >
        <span
          data-section="chart-grouped-bar-aria-desc"
          className="sr-only"
        >
          {description}
        </span>
        <svg
          role="img"
          aria-label={ariaLabel}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          data-section="chart-grouped-bar-svg"
          className="h-auto w-full"
        >
          {/* Y axis */}
          <line
            aria-hidden="true"
            data-section="chart-grouped-bar-axis-y"
            x1={padding}
            y1={padding}
            x2={padding}
            y2={padding + innerHeight}
            stroke="currentColor"
            strokeOpacity={0.3}
          />
          {/* Grid + tick labels */}
          {(showAxisTicks || showGrid) &&
            ticks.map((t, idx) => {
              const y = yFor(t);
              return (
                <g
                  key={`tick-${idx}`}
                  data-section="chart-grouped-bar-tick"
                  data-tick-value={t}
                >
                  {showGrid ? (
                    <line
                      aria-hidden="true"
                      x1={padding}
                      y1={y}
                      x2={width - padding / 2}
                      y2={y}
                      stroke="currentColor"
                      strokeOpacity={0.08}
                      strokeDasharray="2 4"
                    />
                  ) : null}
                  {showAxisTicks ? (
                    <text
                      aria-hidden="true"
                      data-section="chart-grouped-bar-tick-label"
                      x={padding - 4}
                      y={y}
                      textAnchor="end"
                      alignmentBaseline="middle"
                      fontSize={10}
                      fill="currentColor"
                      fillOpacity={0.65}
                    >
                      {fv(t)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          {/* Bars */}
          {layout.map((rect, idx) => {
            const isHovered = hovered === idx;
            const color =
              rect.series.color ??
              getDefaultBarColor(rect.seriesIndex);
            return (
              <g
                key={`bar-${rect.series.id}-${rect.categoryIndex}`}
                data-section="chart-grouped-bar-bar"
                data-series-id={rect.series.id}
                data-series-index={rect.seriesIndex}
                data-category={rect.category}
                data-category-index={rect.categoryIndex}
                data-bar-value={rect.value}
                data-bar-color={color}
                data-hovered={isHovered ? 'true' : 'false'}
                className={cn(
                  animate && 'motion-safe:animate-fade-in',
                )}
              >
                <rect
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`${rect.category} / ${rect.series.label}: ${fv(rect.value)}`}
                  data-section="chart-grouped-bar-rect"
                  data-series-id={rect.series.id}
                  data-category={rect.category}
                  x={rect.x}
                  y={rect.y}
                  width={rect.w}
                  height={Math.max(1, rect.h)}
                  fill={color}
                  fillOpacity={isHovered ? 1 : 0.92}
                  stroke={isHovered ? color : 'none'}
                  strokeWidth={isHovered ? 1.5 : 0}
                  rx={2}
                  ry={2}
                  onMouseEnter={() => handleEnter(idx)}
                  onMouseLeave={handleLeave}
                  onFocus={() => handleEnter(idx)}
                  onBlur={handleLeave}
                  onClick={
                    onBarClick
                      ? () =>
                          onBarClick({
                            series: rect.series,
                            seriesIndex: rect.seriesIndex,
                            category: rect.category,
                            categoryIndex: rect.categoryIndex,
                            value: rect.value,
                          })
                      : undefined
                  }
                  style={{
                    cursor: onBarClick ? 'pointer' : 'default',
                  }}
                />
                {showValues && rect.value > 0 ? (
                  <text
                    aria-hidden="true"
                    data-section="chart-grouped-bar-value"
                    data-series-id={rect.series.id}
                    data-category={rect.category}
                    x={rect.x + rect.w / 2}
                    y={rect.y - 3}
                    textAnchor="middle"
                    fontSize={9}
                    fill="currentColor"
                    fillOpacity={0.8}
                  >
                    {fv(rect.value)}
                  </text>
                ) : null}
              </g>
            );
          })}
          {/* Category labels */}
          {showLabels &&
            categories.map((cat, ci) => {
              const slotX = padding + ci * (slotWidth + groupGap);
              const x = slotX + slotWidth / 2;
              return (
                <text
                  key={`cat-${ci}`}
                  aria-hidden="true"
                  data-section="chart-grouped-bar-label"
                  data-category-index={ci}
                  data-category={cat}
                  x={x}
                  y={padding + innerHeight + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.75}
                >
                  {cat}
                </text>
              );
            })}
        </svg>
        {showTooltip && hoveredRect ? (
          <div
            role="tooltip"
            data-section="chart-grouped-bar-tooltip"
            data-series-id={hoveredRect.series.id}
            data-category={hoveredRect.category}
            style={{
              left: hoveredRect.x + hoveredRect.w + 8,
              top: hoveredRect.y - 4,
            }}
            className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
          >
            <div
              data-section="chart-grouped-bar-tooltip-category"
              className="font-medium"
            >
              {hoveredRect.category}
            </div>
            <div
              data-section="chart-grouped-bar-tooltip-series"
              className="text-muted-foreground"
            >
              {hoveredRect.series.label}
            </div>
            <div
              data-section="chart-grouped-bar-tooltip-value"
              className="font-mono"
            >
              {fv(hoveredRect.value)}
            </div>
          </div>
        ) : null}
      </div>
      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-grouped-bar-legend"
          data-placement={legendPlacement}
          className={cn(
            'flex flex-col gap-1 text-xs',
            legendPlacement === 'bottom' &&
              'flex-row flex-wrap gap-3',
          )}
        >
          {series.map((s, i) => {
            const color = s.color ?? getDefaultBarColor(i);
            const isHidden = activeHidden.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-grouped-bar-legend-item"
                data-series-id={s.id}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-grouped-bar-legend-button"
                  data-series-id={s.id}
                  aria-pressed={!isHidden}
                  aria-label={`${isHidden ? 'Show' : 'Hide'} ${s.label}`}
                  onClick={() => handleLegendClick(s, i)}
                  className={cn(
                    'flex items-center gap-1.5 cursor-pointer',
                    isHidden && 'opacity-40',
                  )}
                >
                  <span
                    aria-hidden="true"
                    data-section="chart-grouped-bar-legend-swatch"
                    className="inline-block h-3 w-3 rounded"
                    style={{
                      background: isHidden ? '#cbd5e1' : color,
                    }}
                  />
                  <span
                    data-section="chart-grouped-bar-legend-label"
                    className="text-foreground"
                  >
                    {s.label}
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

ChartGroupedBar.displayName = 'ChartGroupedBar';
