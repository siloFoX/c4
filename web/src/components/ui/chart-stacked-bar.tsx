import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';
import { getDefaultBarColor } from './chart-bar';

// (v1.11.486, TODO 11.468) ChartStackedBar primitive.
//
// Pure-SVG stacked bar chart. Each category has one bar
// divided into colored segments stacked per series. The
// chart orientation toggles between vertical and
// horizontal (controllable + uncontrolled). Optional
// value labels paint the formatted value inside each
// segment large enough to fit. Distinct from
// `<ChartGroupedBar>` (11.467) in that bars are *stacked*
// instead of placed side-by-side, and from
// `<ChartStackedArea>` (11.466) in that this primitive
// uses discrete bars per category rather than continuous
// areas across an x axis.
//
// Reference: /root/c4/arps-design-system-v1/.

export type ChartStackedBarOrientation = 'vertical' | 'horizontal';

export interface ChartStackedBarSeries {
  id: string;
  label: string;
  data: readonly number[];
  color?: string;
}

export interface ChartStackedBarProps {
  categories: readonly string[];
  series: readonly ChartStackedBarSeries[];
  width?: number;
  height?: number;
  padding?: number;
  barGap?: number;
  orientation?: ChartStackedBarOrientation;
  defaultOrientation?: ChartStackedBarOrientation;
  onOrientationChange?: (
    orientation: ChartStackedBarOrientation,
  ) => void;
  hiddenSeries?: readonly string[];
  defaultHiddenSeries?: readonly string[];
  onHiddenSeriesChange?: (hidden: string[]) => void;
  showOrientationToggle?: boolean;
  showLegend?: boolean;
  showValueLabels?: boolean;
  showAxisTicks?: boolean;
  showGrid?: boolean;
  showLabels?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  tickCount?: number;
  legendPlacement?: 'right' | 'bottom';
  onSegmentClick?: (args: {
    series: ChartStackedBarSeries;
    seriesIndex: number;
    category: string;
    categoryIndex: number;
    value: number;
  }) => void;
  onSeriesClick?: (args: {
    series: ChartStackedBarSeries;
    index: number;
    hidden: boolean;
  }) => void;
}

export interface StackedBarSegment {
  series: ChartStackedBarSeries;
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

export const DEFAULT_CHART_STACKED_BAR_WIDTH = 560;
export const DEFAULT_CHART_STACKED_BAR_HEIGHT = 320;
export const DEFAULT_CHART_STACKED_BAR_PADDING = 36;
export const DEFAULT_CHART_STACKED_BAR_BAR_GAP = 8;
export const DEFAULT_CHART_STACKED_BAR_TICK_COUNT = 5;
export const DEFAULT_CHART_STACKED_BAR_ORIENTATION: ChartStackedBarOrientation =
  'vertical';

// Sum of visible series values at a single category
// index. Non-finite + non-positive values are clamped to
// 0; hidden series are skipped.
export function getStackedBarCategoryTotal(
  series: readonly ChartStackedBarSeries[],
  hidden: ReadonlySet<string>,
  categoryIndex: number,
): number {
  let total = 0;
  for (const s of series) {
    if (hidden.has(s.id)) continue;
    const v = s.data[categoryIndex];
    if (Number.isFinite(v) && (v as number) > 0) {
      total += v as number;
    }
  }
  return total;
}

// Largest category total across all categories among
// visible series. Falls back to 1 for empty / all-zero
// / all-non-finite data so the chart still renders.
export function getStackedBarMaxTotal(
  categories: readonly string[],
  series: readonly ChartStackedBarSeries[],
  hidden: ReadonlySet<string>,
): number {
  if (categories.length === 0 || series.length === 0) return 1;
  let max = 0;
  for (let i = 0; i < categories.length; i += 1) {
    const total = getStackedBarCategoryTotal(
      series,
      hidden,
      i,
    );
    if (total > max) max = total;
  }
  return max > 0 ? max : 1;
}

// Build segment rects for either orientation. Series 0
// paints first; later series stack outward.
// `vertical`: stack grows upward from the baseline
// (y = innerHeight). `horizontal`: stack grows rightward
// from the left axis (x = 0).
export function computeStackedBarLayout(
  categories: readonly string[],
  series: readonly ChartStackedBarSeries[],
  hidden: ReadonlySet<string>,
  orientation: ChartStackedBarOrientation,
  innerWidth: number,
  innerHeight: number,
  paddingX: number,
  paddingY: number,
  barGap: number,
): StackedBarSegment[] {
  if (
    categories.length === 0 ||
    series.length === 0 ||
    innerWidth <= 0 ||
    innerHeight <= 0
  ) {
    return [];
  }
  const max = getStackedBarMaxTotal(
    categories,
    series,
    hidden,
  );
  const out: StackedBarSegment[] = [];

  if (orientation === 'vertical') {
    const slotWidth =
      categories.length === 0
        ? 0
        : (innerWidth -
            barGap * Math.max(0, categories.length - 1)) /
          categories.length;
    const barWidth = Math.max(1, slotWidth);
    for (let ci = 0; ci < categories.length; ci += 1) {
      const slotX = paddingX + ci * (slotWidth + barGap);
      let cumulative = 0;
      for (let si = 0; si < series.length; si += 1) {
        const s = series[si]!;
        if (hidden.has(s.id)) continue;
        const raw = s.data[ci];
        const value =
          Number.isFinite(raw) && (raw as number) > 0
            ? (raw as number)
            : 0;
        if (value <= 0) continue;
        const h = (value / max) * innerHeight;
        const yBaseline = paddingY + innerHeight;
        const y = yBaseline - cumulative - h;
        out.push({
          series: s,
          seriesIndex: si,
          category: categories[ci]!,
          categoryIndex: ci,
          value,
          x: slotX,
          y,
          w: barWidth,
          h,
        });
        cumulative += h;
      }
    }
    return out;
  }

  // Horizontal orientation
  const slotHeight =
    categories.length === 0
      ? 0
      : (innerHeight -
          barGap * Math.max(0, categories.length - 1)) /
        categories.length;
  const barHeight = Math.max(1, slotHeight);
  for (let ci = 0; ci < categories.length; ci += 1) {
    const slotY = paddingY + ci * (slotHeight + barGap);
    let cumulative = 0;
    for (let si = 0; si < series.length; si += 1) {
      const s = series[si]!;
      if (hidden.has(s.id)) continue;
      const raw = s.data[ci];
      const value =
        Number.isFinite(raw) && (raw as number) > 0
          ? (raw as number)
          : 0;
      if (value <= 0) continue;
      const w = (value / max) * innerWidth;
      out.push({
        series: s,
        seriesIndex: si,
        category: categories[ci]!,
        categoryIndex: ci,
        value,
        x: paddingX + cumulative,
        y: slotY,
        w,
        h: barHeight,
      });
      cumulative += w;
    }
  }
  return out;
}

// Evenly-spaced numeric ticks across [0, max].
export function getStackedBarTicks(
  max: number,
  count: number = DEFAULT_CHART_STACKED_BAR_TICK_COUNT,
): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const safeCount = Math.max(2, Math.floor(count));
  const step = max / (safeCount - 1);
  const out: number[] = [];
  for (let i = 0; i < safeCount; i += 1) out.push(i * step);
  return out;
}

// One-line ARIA summary.
export function describeStackedBarChart(
  categories: readonly string[],
  series: readonly ChartStackedBarSeries[],
  hidden: ReadonlySet<string>,
  orientation: ChartStackedBarOrientation,
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
    for (const v of s.data) {
      if (Number.isFinite(v) && (v as number) > 0) {
        sum += v as number;
      }
    }
    return `${s.label} sum ${fv(sum)}`;
  });
  return `Stacked bar chart (${orientation}) with ${categories.length} categories, ${visible.length} visible series. ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartStackedBar = forwardRef(function ChartStackedBar(
  {
    categories,
    series,
    width = DEFAULT_CHART_STACKED_BAR_WIDTH,
    height = DEFAULT_CHART_STACKED_BAR_HEIGHT,
    padding = DEFAULT_CHART_STACKED_BAR_PADDING,
    barGap = DEFAULT_CHART_STACKED_BAR_BAR_GAP,
    orientation,
    defaultOrientation = DEFAULT_CHART_STACKED_BAR_ORIENTATION,
    onOrientationChange,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showOrientationToggle = true,
    showLegend = true,
    showValueLabels = false,
    showAxisTicks = true,
    showGrid = true,
    showLabels = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Stacked bar chart',
    ariaDescription,
    formatValue,
    tickCount = DEFAULT_CHART_STACKED_BAR_TICK_COUNT,
    legendPlacement = 'bottom',
    onSegmentClick,
    onSeriesClick,
  }: ChartStackedBarProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const [internalOrientation, setInternalOrientation] =
    useState<ChartStackedBarOrientation>(defaultOrientation);
  const activeOrientation = orientation ?? internalOrientation;

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
    () => getStackedBarMaxTotal(categories, series, activeHidden),
    [activeHidden, categories, series],
  );

  const labelMargin = showLabels ? 20 : 4;
  const xLabelMargin =
    activeOrientation === 'horizontal' && showLabels ? 50 : 0;
  const padLeft = padding + xLabelMargin;
  const padRight = padding;
  const padTop = padding;
  const padBottom =
    activeOrientation === 'vertical'
      ? padding + (showLabels ? 18 : 4)
      : padding + 4;

  const innerWidth = Math.max(0, width - padLeft - padRight);
  const innerHeight = Math.max(0, height - padTop - padBottom);

  const layout = useMemo(
    () =>
      computeStackedBarLayout(
        categories,
        series,
        activeHidden,
        activeOrientation,
        innerWidth,
        innerHeight,
        padLeft,
        padTop,
        barGap,
      ),
    [
      activeHidden,
      activeOrientation,
      barGap,
      categories,
      innerHeight,
      innerWidth,
      padLeft,
      padTop,
      series,
    ],
  );

  const ticks = useMemo(
    () => getStackedBarTicks(max, tickCount),
    [max, tickCount],
  );

  // Map value -> coordinate along the value axis
  const valueAxisFor = useCallback(
    (v: number) => {
      if (max <= 0) {
        return activeOrientation === 'vertical'
          ? padTop + innerHeight
          : padLeft;
      }
      const ratio = Math.max(0, Math.min(1, v / max));
      if (activeOrientation === 'vertical') {
        return padTop + innerHeight - innerHeight * ratio;
      }
      return padLeft + innerWidth * ratio;
    },
    [
      activeOrientation,
      innerHeight,
      innerWidth,
      max,
      padLeft,
      padTop,
    ],
  );

  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;

  const description = useMemo(
    () =>
      ariaDescription ??
      describeStackedBarChart(
        categories,
        series,
        activeHidden,
        activeOrientation,
        formatValue,
      ),
    [
      activeHidden,
      activeOrientation,
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

  const handleOrientationToggle = useCallback(() => {
    const next: ChartStackedBarOrientation =
      activeOrientation === 'vertical'
        ? 'horizontal'
        : 'vertical';
    if (orientation === undefined) setInternalOrientation(next);
    onOrientationChange?.(next);
  }, [activeOrientation, onOrientationChange, orientation]);

  const commitHidden = useCallback(
    (next: string[]) => {
      if (hiddenSeries === undefined) setInternalHidden(next);
      onHiddenSeriesChange?.(next);
    },
    [hiddenSeries, onHiddenSeriesChange],
  );

  const handleLegendClick = useCallback(
    (s: ChartStackedBarSeries, i: number) => {
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

  const hoveredSegment =
    hovered !== null ? layout[hovered] : null;
  const visibleCount = series.filter(
    (s) => !activeHidden.has(s.id),
  ).length;

  // Category-axis labels (x for vertical, y for horizontal)
  const slotWidth =
    categories.length === 0
      ? 0
      : (innerWidth -
          barGap * Math.max(0, categories.length - 1)) /
        categories.length;
  const slotHeight =
    categories.length === 0
      ? 0
      : (innerHeight -
          barGap * Math.max(0, categories.length - 1)) /
        categories.length;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-stacked-bar"
      data-orientation={activeOrientation}
      data-category-count={categories.length}
      data-series-count={series.length}
      data-visible-count={visibleCount}
      data-segment-count={layout.length}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'flex w-full items-start gap-4',
        legendPlacement === 'bottom' && 'flex-col items-stretch',
        className,
      )}
      style={{ width }}
    >
      <div
        data-section="chart-stacked-bar-canvas"
        className="relative shrink-0"
        style={{ width, height }}
      >
        <span
          data-section="chart-stacked-bar-aria-desc"
          className="sr-only"
        >
          {description}
        </span>
        {showOrientationToggle ? (
          <div
            data-section="chart-stacked-bar-orientation-toggle"
            className="absolute right-2 top-2 z-10"
          >
            <button
              type="button"
              data-section="chart-stacked-bar-orientation-button"
              data-orientation={activeOrientation}
              aria-label={`Switch to ${activeOrientation === 'vertical' ? 'horizontal' : 'vertical'} orientation`}
              onClick={handleOrientationToggle}
              className="rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground hover:bg-accent"
            >
              {activeOrientation === 'vertical' ? '⇄' : '⇅'}
            </button>
          </div>
        ) : null}
        <svg
          role="img"
          aria-label={ariaLabel}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          data-section="chart-stacked-bar-svg"
          className="h-auto w-full"
        >
          {/* Value axis */}
          {activeOrientation === 'vertical' ? (
            <line
              aria-hidden="true"
              data-section="chart-stacked-bar-axis-value"
              x1={padLeft}
              y1={padTop}
              x2={padLeft}
              y2={padTop + innerHeight}
              stroke="currentColor"
              strokeOpacity={0.3}
            />
          ) : (
            <line
              aria-hidden="true"
              data-section="chart-stacked-bar-axis-value"
              x1={padLeft}
              y1={padTop + innerHeight}
              x2={padLeft + innerWidth}
              y2={padTop + innerHeight}
              stroke="currentColor"
              strokeOpacity={0.3}
            />
          )}
          {/* Grid + tick labels */}
          {(showAxisTicks || showGrid) &&
            ticks.map((t, idx) => {
              const coord = valueAxisFor(t);
              return (
                <g
                  key={`tick-${idx}`}
                  data-section="chart-stacked-bar-tick"
                  data-tick-value={t}
                >
                  {showGrid &&
                  activeOrientation === 'vertical' ? (
                    <line
                      aria-hidden="true"
                      x1={padLeft}
                      y1={coord}
                      x2={width - padRight / 2}
                      y2={coord}
                      stroke="currentColor"
                      strokeOpacity={0.08}
                      strokeDasharray="2 4"
                    />
                  ) : null}
                  {showGrid &&
                  activeOrientation === 'horizontal' ? (
                    <line
                      aria-hidden="true"
                      x1={coord}
                      y1={padTop}
                      x2={coord}
                      y2={padTop + innerHeight + 4}
                      stroke="currentColor"
                      strokeOpacity={0.08}
                      strokeDasharray="2 4"
                    />
                  ) : null}
                  {showAxisTicks &&
                  activeOrientation === 'vertical' ? (
                    <text
                      aria-hidden="true"
                      data-section="chart-stacked-bar-tick-label"
                      x={padLeft - 4}
                      y={coord}
                      textAnchor="end"
                      alignmentBaseline="middle"
                      fontSize={10}
                      fill="currentColor"
                      fillOpacity={0.65}
                    >
                      {fv(t)}
                    </text>
                  ) : null}
                  {showAxisTicks &&
                  activeOrientation === 'horizontal' ? (
                    <text
                      aria-hidden="true"
                      data-section="chart-stacked-bar-tick-label"
                      x={coord}
                      y={padTop + innerHeight + 14}
                      textAnchor={
                        idx === 0
                          ? 'start'
                          : idx === ticks.length - 1
                            ? 'end'
                            : 'middle'
                      }
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
          {/* Segments */}
          {layout.map((seg, idx) => {
            const color =
              seg.series.color ??
              getDefaultBarColor(seg.seriesIndex);
            const isHovered = hovered === idx;
            const minDim = Math.min(seg.w, seg.h);
            const showInline =
              showValueLabels && minDim > 18;
            return (
              <g
                key={`seg-${seg.series.id}-${seg.categoryIndex}`}
                data-section="chart-stacked-bar-segment"
                data-series-id={seg.series.id}
                data-series-index={seg.seriesIndex}
                data-category={seg.category}
                data-category-index={seg.categoryIndex}
                data-segment-value={seg.value}
                data-segment-color={color}
                data-hovered={isHovered ? 'true' : 'false'}
                className={cn(
                  animate && 'motion-safe:animate-fade-in',
                )}
              >
                <rect
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`${seg.category} / ${seg.series.label}: ${fv(seg.value)}`}
                  data-section="chart-stacked-bar-rect"
                  data-series-id={seg.series.id}
                  data-category={seg.category}
                  x={seg.x}
                  y={seg.y}
                  width={Math.max(1, seg.w)}
                  height={Math.max(1, seg.h)}
                  fill={color}
                  fillOpacity={isHovered ? 1 : 0.92}
                  stroke={isHovered ? color : 'none'}
                  strokeWidth={isHovered ? 1.5 : 0}
                  onMouseEnter={() => handleEnter(idx)}
                  onMouseLeave={handleLeave}
                  onFocus={() => handleEnter(idx)}
                  onBlur={handleLeave}
                  onClick={
                    onSegmentClick
                      ? () =>
                          onSegmentClick({
                            series: seg.series,
                            seriesIndex: seg.seriesIndex,
                            category: seg.category,
                            categoryIndex:
                              seg.categoryIndex,
                            value: seg.value,
                          })
                      : undefined
                  }
                  style={{
                    cursor: onSegmentClick
                      ? 'pointer'
                      : 'default',
                  }}
                />
                {showInline ? (
                  <text
                    aria-hidden="true"
                    data-section="chart-stacked-bar-value"
                    data-series-id={seg.series.id}
                    data-category={seg.category}
                    x={seg.x + seg.w / 2}
                    y={seg.y + seg.h / 2 + 3}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill="#ffffff"
                    fillOpacity={0.92}
                    style={{ pointerEvents: 'none' }}
                  >
                    {fv(seg.value)}
                  </text>
                ) : null}
              </g>
            );
          })}
          {/* Category labels */}
          {showLabels &&
            activeOrientation === 'vertical' &&
            categories.map((cat, ci) => {
              const slotX = padLeft + ci * (slotWidth + barGap);
              const x = slotX + slotWidth / 2;
              return (
                <text
                  key={`cat-${ci}`}
                  aria-hidden="true"
                  data-section="chart-stacked-bar-category-label"
                  data-category-index={ci}
                  data-category={cat}
                  x={x}
                  y={padTop + innerHeight + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.75}
                >
                  {cat}
                </text>
              );
            })}
          {showLabels &&
            activeOrientation === 'horizontal' &&
            categories.map((cat, ci) => {
              const slotY = padTop + ci * (slotHeight + barGap);
              const y = slotY + slotHeight / 2;
              return (
                <text
                  key={`cat-${ci}`}
                  aria-hidden="true"
                  data-section="chart-stacked-bar-category-label"
                  data-category-index={ci}
                  data-category={cat}
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.75}
                >
                  {cat}
                </text>
              );
            })}
        </svg>
        {showTooltip && hoveredSegment ? (
          <div
            role="tooltip"
            data-section="chart-stacked-bar-tooltip"
            data-series-id={hoveredSegment.series.id}
            data-category={hoveredSegment.category}
            style={{
              left:
                hoveredSegment.x + hoveredSegment.w / 2 + 8,
              top: hoveredSegment.y - 4,
            }}
            className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
          >
            <div
              data-section="chart-stacked-bar-tooltip-category"
              className="font-medium"
            >
              {hoveredSegment.category}
            </div>
            <div
              data-section="chart-stacked-bar-tooltip-series"
              className="text-muted-foreground"
            >
              {hoveredSegment.series.label}
            </div>
            <div
              data-section="chart-stacked-bar-tooltip-value"
              className="font-mono"
            >
              {fv(hoveredSegment.value)}
            </div>
            <div
              data-section="chart-stacked-bar-tooltip-total"
              className="text-muted-foreground"
            >
              total:{' '}
              {fv(
                getStackedBarCategoryTotal(
                  series,
                  activeHidden,
                  hoveredSegment.categoryIndex,
                ),
              )}
            </div>
          </div>
        ) : null}
      </div>
      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-stacked-bar-legend"
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
                data-section="chart-stacked-bar-legend-item"
                data-series-id={s.id}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-stacked-bar-legend-button"
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
                    data-section="chart-stacked-bar-legend-swatch"
                    className="inline-block h-3 w-3 rounded"
                    style={{
                      background: isHidden ? '#cbd5e1' : color,
                    }}
                  />
                  <span
                    data-section="chart-stacked-bar-legend-label"
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

ChartStackedBar.displayName = 'ChartStackedBar';
