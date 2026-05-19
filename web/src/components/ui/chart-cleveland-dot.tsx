import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_CLEVELAND_DOT_WIDTH = 560;
export const DEFAULT_CHART_CLEVELAND_DOT_HEIGHT = 360;
export const DEFAULT_CHART_CLEVELAND_DOT_PADDING = 48;
export const DEFAULT_CHART_CLEVELAND_DOT_TICK_COUNT = 5;
export const DEFAULT_CHART_CLEVELAND_DOT_DOT_RADIUS = 5;
export const DEFAULT_CHART_CLEVELAND_DOT_CONNECTOR_WIDTH = 1.5;
export const DEFAULT_CHART_CLEVELAND_DOT_OPACITY = 0.95;
export const DEFAULT_CHART_CLEVELAND_DOT_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_CLEVELAND_DOT_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_CLEVELAND_DOT_BEFORE_COLOR = '#0891b2';
export const DEFAULT_CHART_CLEVELAND_DOT_AFTER_COLOR = '#2563eb';
export const DEFAULT_CHART_CLEVELAND_DOT_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_CLEVELAND_DOT_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_CLEVELAND_DOT_NEUTRAL_COLOR = '#94a3b8';
export const DEFAULT_CHART_CLEVELAND_DOT_ORIENTATION = 'horizontal';

export type ChartClevelandDotOrientation = 'horizontal' | 'vertical';
export type ChartClevelandDotSortBy = 'before' | 'after' | 'delta' | 'absDelta';
export type ChartClevelandDotSortOrder = 'asc' | 'desc';
export type ChartClevelandDotDirection = 'up' | 'down' | 'flat';
export type ChartClevelandDotSeries = 'before' | 'after';

export interface ChartClevelandDotItem {
  id: string;
  label: string;
  before: number;
  after: number;
  beforeColor?: string;
  afterColor?: string;
}

export interface ChartClevelandDotLayoutItem {
  id: string;
  label: string;
  index: number;
  originalIndex: number;
  before: number;
  after: number;
  delta: number;
  direction: ChartClevelandDotDirection;
  beforeColor: string;
  afterColor: string;
  connectorColor: string;
  beforeX: number;
  beforeY: number;
  afterX: number;
  afterY: number;
  rowCenter: number;
}

export interface ComputeClevelandDotLayoutResult {
  items: ChartClevelandDotLayoutItem[];
  ticks: { value: number; position: number }[];
  valueMin: number;
  valueMax: number;
  orientation: ChartClevelandDotOrientation;
  innerWidth: number;
  innerHeight: number;
  bandWidth: number;
  upCount: number;
  downCount: number;
  flatCount: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getClevelandDotDirection(
  before: number,
  after: number,
  epsilon: number = 0,
): ChartClevelandDotDirection {
  if (!isFiniteNumber(before) || !isFiniteNumber(after)) return 'flat';
  const eps = isFiniteNumber(epsilon) && epsilon > 0 ? epsilon : 0;
  const delta = after - before;
  if (delta > eps) return 'up';
  if (delta < -eps) return 'down';
  return 'flat';
}

export function getClevelandDotFiniteItems(
  items: readonly ChartClevelandDotItem[],
): ChartClevelandDotItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (it) =>
      it &&
      typeof it.id === 'string' &&
      isFiniteNumber(it.before) &&
      isFiniteNumber(it.after),
  );
}

export function getClevelandDotBounds(
  items: readonly ChartClevelandDotItem[],
): { min: number; max: number } {
  const finite = getClevelandDotFiniteItems(items);
  if (finite.length === 0) return { min: 0, max: 1 };
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const it of finite) {
    if (it.before < min) min = it.before;
    if (it.after < min) min = it.after;
    if (it.before > max) max = it.before;
    if (it.after > max) max = it.after;
  }
  if (min === max) {
    return { min: min - 0.5, max: max + 0.5 };
  }
  return { min, max };
}

export function getClevelandDotTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(
    2,
    Math.floor(count ?? DEFAULT_CHART_CLEVELAND_DOT_TICK_COUNT),
  );
  if (min === max) return [{ value: min, position: 0 }];
  const step = (max - min) / (n - 1);
  const out: { value: number; position: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const value = min + step * i;
    const position = (value - min) / (max - min);
    out.push({ value, position });
  }
  return out;
}

export interface SortedClevelandDotItem {
  item: ChartClevelandDotItem;
  originalIndex: number;
}

export function sortClevelandDotItems(
  items: readonly ChartClevelandDotItem[],
  sortBy?: ChartClevelandDotSortBy,
  order?: ChartClevelandDotSortOrder,
): SortedClevelandDotItem[] {
  const indexed: SortedClevelandDotItem[] = items.map((item, originalIndex) => ({
    item,
    originalIndex,
  }));
  if (!sortBy) return indexed;
  const dir = order === 'desc' ? -1 : 1;
  const keyFor = (it: ChartClevelandDotItem): number => {
    switch (sortBy) {
      case 'before':
        return it.before;
      case 'after':
        return it.after;
      case 'delta':
        return it.after - it.before;
      case 'absDelta':
        return Math.abs(it.after - it.before);
    }
  };
  indexed.sort((a, b) => {
    const ka = keyFor(a.item);
    const kb = keyFor(b.item);
    if (ka === kb) return a.originalIndex - b.originalIndex;
    return (ka - kb) * dir;
  });
  return indexed;
}

export interface ComputeClevelandDotLayoutInput {
  items: readonly ChartClevelandDotItem[];
  orientation?: ChartClevelandDotOrientation;
  sortBy?: ChartClevelandDotSortBy;
  sortOrder?: ChartClevelandDotSortOrder;
  valueMin?: number;
  valueMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  beforeColor?: string;
  afterColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  neutralColor?: string;
  useDeltaColors?: boolean;
  epsilon?: number;
}

export function computeClevelandDotLayout(
  input: ComputeClevelandDotLayoutInput,
): ComputeClevelandDotLayoutResult {
  const orientation: ChartClevelandDotOrientation =
    input.orientation ?? DEFAULT_CHART_CLEVELAND_DOT_ORIENTATION;
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeClevelandDotLayoutResult = {
    items: [],
    ticks: [],
    valueMin: 0,
    valueMax: 1,
    orientation,
    innerWidth,
    innerHeight,
    bandWidth: 0,
    upCount: 0,
    downCount: 0,
    flatCount: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!input.items || input.items.length === 0) return empty;

  const finite = getClevelandDotFiniteItems(input.items);
  if (finite.length === 0) return empty;

  const bounds = getClevelandDotBounds(finite);
  let vMin = isFiniteNumber(input.valueMin) ? input.valueMin : bounds.min;
  let vMax = isFiniteNumber(input.valueMax) ? input.valueMax : bounds.max;
  if (vMax < vMin) [vMin, vMax] = [vMax, vMin];
  if (vMin === vMax) {
    vMin -= 0.5;
    vMax += 0.5;
  }
  const range = vMax - vMin;

  const sorted = sortClevelandDotItems(finite, input.sortBy, input.sortOrder);
  const N = sorted.length;
  const catAxisLength = orientation === 'horizontal' ? innerHeight : innerWidth;
  const bandWidth = catAxisLength / N;

  const beforeColor =
    input.beforeColor ?? DEFAULT_CHART_CLEVELAND_DOT_BEFORE_COLOR;
  const afterColor =
    input.afterColor ?? DEFAULT_CHART_CLEVELAND_DOT_AFTER_COLOR;
  const positiveColor =
    input.positiveColor ?? DEFAULT_CHART_CLEVELAND_DOT_POSITIVE_COLOR;
  const negativeColor =
    input.negativeColor ?? DEFAULT_CHART_CLEVELAND_DOT_NEGATIVE_COLOR;
  const neutralColor =
    input.neutralColor ?? DEFAULT_CHART_CLEVELAND_DOT_NEUTRAL_COLOR;
  const useDeltaColors = !!input.useDeltaColors;
  const epsilon = isFiniteNumber(input.epsilon) ? input.epsilon : 0;

  function valueToPos(value: number): number {
    const clamped = value < vMin ? vMin : value > vMax ? vMax : value;
    return (clamped - vMin) / range;
  }

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;

  const items: ChartClevelandDotLayoutItem[] = sorted.map((entry, i) => {
    const { item, originalIndex } = entry;
    const direction = getClevelandDotDirection(item.before, item.after, epsilon);
    if (direction === 'up') upCount += 1;
    else if (direction === 'down') downCount += 1;
    else flatCount += 1;
    const itemBeforeColor = item.beforeColor ?? beforeColor;
    const itemAfterColor = item.afterColor ?? afterColor;
    const connectorColor = useDeltaColors
      ? direction === 'up'
        ? positiveColor
        : direction === 'down'
          ? negativeColor
          : neutralColor
      : neutralColor;

    const beforePos = valueToPos(item.before);
    const afterPos = valueToPos(item.after);

    if (orientation === 'horizontal') {
      const rowCenter = padding + bandWidth * (i + 0.5);
      const beforeX = padding + beforePos * innerWidth;
      const afterX = padding + afterPos * innerWidth;
      return {
        id: item.id,
        label: item.label,
        index: i,
        originalIndex,
        before: item.before,
        after: item.after,
        delta: item.after - item.before,
        direction,
        beforeColor: itemBeforeColor,
        afterColor: itemAfterColor,
        connectorColor,
        beforeX,
        beforeY: rowCenter,
        afterX,
        afterY: rowCenter,
        rowCenter,
      };
    }
    const rowCenter = padding + bandWidth * (i + 0.5);
    const beforeY = padding + innerHeight - beforePos * innerHeight;
    const afterY = padding + innerHeight - afterPos * innerHeight;
    return {
      id: item.id,
      label: item.label,
      index: i,
      originalIndex,
      before: item.before,
      after: item.after,
      delta: item.after - item.before,
      direction,
      beforeColor: itemBeforeColor,
      afterColor: itemAfterColor,
      connectorColor,
      beforeX: rowCenter,
      beforeY,
      afterX: rowCenter,
      afterY,
      rowCenter,
    };
  });

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_CLEVELAND_DOT_TICK_COUNT;
  const ticks = getClevelandDotTicks(vMin, vMax, tickCount).map((t) => ({
    value: t.value,
    position:
      orientation === 'horizontal'
        ? padding + t.position * innerWidth
        : padding + innerHeight - t.position * innerHeight,
  }));

  return {
    items,
    ticks,
    valueMin: vMin,
    valueMax: vMax,
    orientation,
    innerWidth,
    innerHeight,
    bandWidth,
    upCount,
    downCount,
    flatCount,
  };
}

export function describeClevelandDotChart(
  items: readonly ChartClevelandDotItem[],
  beforeLabel: string,
  afterLabel: string,
  formatValue?: (n: number) => string,
): string {
  const finite = getClevelandDotFiniteItems(items);
  if (finite.length === 0) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  let up = 0;
  let down = 0;
  let flat = 0;
  for (const it of finite) {
    const dir = getClevelandDotDirection(it.before, it.after);
    if (dir === 'up') up += 1;
    else if (dir === 'down') down += 1;
    else flat += 1;
  }
  const bounds = getClevelandDotBounds(finite);
  return `Cleveland dot plot comparing ${beforeLabel} to ${afterLabel} across ${finite.length} categor${finite.length === 1 ? 'y' : 'ies'}: ${up} up, ${down} down, ${flat} flat. Value range ${fmt(bounds.min)} to ${fmt(bounds.max)}.`;
}

export interface ChartClevelandDotItemClick {
  item: ChartClevelandDotItem;
  layout: ChartClevelandDotLayoutItem;
  series?: ChartClevelandDotSeries;
}

export interface ChartClevelandDotProps {
  items: readonly ChartClevelandDotItem[];
  orientation?: ChartClevelandDotOrientation;
  beforeLabel?: string;
  afterLabel?: string;
  beforeColor?: string;
  afterColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  neutralColor?: string;
  useDeltaColors?: boolean;
  epsilon?: number;
  sortBy?: ChartClevelandDotSortBy;
  sortOrder?: ChartClevelandDotSortOrder;
  valueMin?: number;
  valueMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  dotRadius?: number;
  connectorWidth?: number;
  markOpacity?: number;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showCategoryLabels?: boolean;
  showValueLabels?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatCategory?: (item: ChartClevelandDotItem) => string;
  valueLabel?: string;
  onItemClick?: (info: ChartClevelandDotItemClick) => void;
  style?: CSSProperties;
}

export const ChartClevelandDot = forwardRef(function ChartClevelandDot(
  {
    items,
    orientation = DEFAULT_CHART_CLEVELAND_DOT_ORIENTATION,
    beforeLabel = 'Before',
    afterLabel = 'After',
    beforeColor = DEFAULT_CHART_CLEVELAND_DOT_BEFORE_COLOR,
    afterColor = DEFAULT_CHART_CLEVELAND_DOT_AFTER_COLOR,
    positiveColor = DEFAULT_CHART_CLEVELAND_DOT_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_CLEVELAND_DOT_NEGATIVE_COLOR,
    neutralColor = DEFAULT_CHART_CLEVELAND_DOT_NEUTRAL_COLOR,
    useDeltaColors = false,
    epsilon = 0,
    sortBy,
    sortOrder,
    valueMin,
    valueMax,
    width = DEFAULT_CHART_CLEVELAND_DOT_WIDTH,
    height = DEFAULT_CHART_CLEVELAND_DOT_HEIGHT,
    padding = DEFAULT_CHART_CLEVELAND_DOT_PADDING,
    tickCount = DEFAULT_CHART_CLEVELAND_DOT_TICK_COUNT,
    dotRadius = DEFAULT_CHART_CLEVELAND_DOT_DOT_RADIUS,
    connectorWidth = DEFAULT_CHART_CLEVELAND_DOT_CONNECTOR_WIDTH,
    markOpacity = DEFAULT_CHART_CLEVELAND_DOT_OPACITY,
    gridColor = DEFAULT_CHART_CLEVELAND_DOT_GRID_COLOR,
    axisColor = DEFAULT_CHART_CLEVELAND_DOT_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showCategoryLabels = true,
    showValueLabels = false,
    showLegend = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Cleveland dot plot',
    ariaDescription,
    formatValue,
    formatCategory,
    valueLabel,
    onItemClick,
    style,
  }: ChartClevelandDotProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const reactId = useId();
  const ariaDescId = `${reactId}-desc`;
  const fmtValue = useCallback(
    (n: number) => (formatValue ? formatValue(n) : String(n)),
    [formatValue],
  );
  const fmtCategory = useCallback(
    (it: ChartClevelandDotItem) =>
      formatCategory ? formatCategory(it) : it.label,
    [formatCategory],
  );

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeClevelandDotLayout({
        items,
        orientation,
        ...(sortBy ? { sortBy } : {}),
        ...(sortOrder ? { sortOrder } : {}),
        ...(valueMin !== undefined ? { valueMin } : {}),
        ...(valueMax !== undefined ? { valueMax } : {}),
        width,
        height,
        padding,
        tickCount,
        beforeColor,
        afterColor,
        positiveColor,
        negativeColor,
        neutralColor,
        useDeltaColors,
        epsilon,
      }),
    [
      items,
      orientation,
      sortBy,
      sortOrder,
      valueMin,
      valueMax,
      width,
      height,
      padding,
      tickCount,
      beforeColor,
      afterColor,
      positiveColor,
      negativeColor,
      neutralColor,
      useDeltaColors,
      epsilon,
    ],
  );

  const description =
    ariaDescription ??
    describeClevelandDotChart(items, beforeLabel, afterLabel, fmtValue);

  const rootClass = [
    'relative inline-block w-full max-w-full text-xs text-slate-700',
    animate ? 'motion-safe:animate-fade-in' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={ariaDescId}
      data-section="chart-cleveland-dot"
      data-orientation={orientation}
      data-category-count={items.length}
      data-finite-count={layout.items.length}
      data-up-count={layout.upCount}
      data-down-count={layout.downCount}
      data-flat-count={layout.flatCount}
      data-use-delta-colors={useDeltaColors ? 'true' : 'false'}
      data-sort-by={sortBy ?? 'none'}
      data-sort-order={sortOrder ?? 'none'}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-cleveland-dot-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-cleveland-dot-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-cleveland-dot-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid && layout.ticks.length > 0 ? (
            <g data-section="chart-cleveland-dot-grid">
              {layout.ticks.map((t) => {
                const isH = orientation === 'horizontal';
                return (
                  <line
                    key={`grid-${t.value}`}
                    data-section="chart-cleveland-dot-grid-line"
                    x1={isH ? t.position : padding}
                    y1={isH ? padding : t.position}
                    x2={isH ? t.position : padding + layout.innerWidth}
                    y2={isH ? padding + layout.innerHeight : t.position}
                    stroke={gridColor}
                    strokeDasharray="2 4"
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-cleveland-dot-axes">
              <line
                data-section="chart-cleveland-dot-axis"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.ticks.length > 0 ? (
                <g data-section="chart-cleveland-dot-ticks">
                  {layout.ticks.map((t) => {
                    const isH = orientation === 'horizontal';
                    const tx = isH ? t.position : padding;
                    const ty = isH ? padding + layout.innerHeight : t.position;
                    return (
                      <g
                        key={`tick-${t.value}`}
                        data-section="chart-cleveland-dot-tick"
                      >
                        <line
                          x1={tx}
                          y1={ty}
                          x2={isH ? tx : tx - 4}
                          y2={isH ? ty + 4 : ty}
                          stroke={axisColor}
                          strokeWidth={1}
                        />
                        <text
                          data-section="chart-cleveland-dot-tick-label"
                          data-tick-value={t.value}
                          x={isH ? tx : tx - 6}
                          y={isH ? ty + 14 : ty + 3}
                          textAnchor={isH ? 'middle' : 'end'}
                          fontSize={10}
                          fill="currentColor"
                        >
                          {fmtValue(t.value)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              ) : null}
              {valueLabel ? (
                <text
                  data-section="chart-cleveland-dot-value-label"
                  x={
                    orientation === 'horizontal'
                      ? padding + layout.innerWidth / 2
                      : padding - 32
                  }
                  y={
                    orientation === 'horizontal'
                      ? padding + layout.innerHeight + 30
                      : padding + layout.innerHeight / 2
                  }
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  transform={
                    orientation === 'vertical'
                      ? `rotate(-90 ${padding - 32} ${padding + layout.innerHeight / 2})`
                      : undefined
                  }
                >
                  {valueLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          {showCategoryLabels ? (
            <g data-section="chart-cleveland-dot-category-labels">
              {layout.items.map((it) => {
                const isH = orientation === 'horizontal';
                return (
                  <text
                    key={`cat-${it.id}`}
                    data-section="chart-cleveland-dot-category-text"
                    data-item-id={it.id}
                    x={isH ? padding - 6 : it.rowCenter}
                    y={isH ? it.rowCenter + 3 : padding + layout.innerHeight + 14}
                    textAnchor={isH ? 'end' : 'middle'}
                    fontSize={11}
                    fill="currentColor"
                  >
                    {it.label}
                  </text>
                );
              })}
            </g>
          ) : null}

          <g data-section="chart-cleveland-dot-items">
            {layout.items.map((it) => {
              const isHovered = hoveredId === it.id;
              const isDim =
                hoveredId !== null && !isHovered ? 0.35 : markOpacity;
              const aria = `${fmtCategory({ id: it.id, label: it.label, before: it.before, after: it.after })}: ${beforeLabel} ${fmtValue(it.before)} -> ${afterLabel} ${fmtValue(it.after)} (${it.direction})`;
              return (
                <g
                  key={it.id}
                  data-section="chart-cleveland-dot-item"
                  data-item-id={it.id}
                  data-item-index={it.index}
                  data-item-original-index={it.originalIndex}
                  data-item-direction={it.direction}
                  data-item-before={it.before}
                  data-item-after={it.after}
                  data-item-delta={it.delta}
                  data-connector-color={it.connectorColor}
                  data-hovered={isHovered ? 'true' : 'false'}
                >
                  <line
                    data-section="chart-cleveland-dot-connector"
                    data-item-id={it.id}
                    x1={it.beforeX}
                    y1={it.beforeY}
                    x2={it.afterX}
                    y2={it.afterY}
                    stroke={it.connectorColor}
                    strokeOpacity={isDim}
                    strokeWidth={isHovered ? connectorWidth + 0.8 : connectorWidth}
                    strokeLinecap="round"
                  />
                  <circle
                    data-section="chart-cleveland-dot-dot"
                    data-item-id={it.id}
                    data-series="before"
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${aria} (${beforeLabel})`}
                    cx={it.beforeX}
                    cy={it.beforeY}
                    r={isHovered ? dotRadius + 1 : dotRadius}
                    fill={it.beforeColor}
                    fillOpacity={isDim}
                    stroke={it.beforeColor}
                    strokeWidth={1}
                    onMouseEnter={() => setHoveredId(it.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onFocus={() => setHoveredId(it.id)}
                    onBlur={() => setHoveredId(null)}
                    onClick={() => {
                      if (onItemClick) {
                        onItemClick({
                          item: {
                            id: it.id,
                            label: it.label,
                            before: it.before,
                            after: it.after,
                          },
                          layout: it,
                          series: 'before',
                        });
                      }
                    }}
                  />
                  <circle
                    data-section="chart-cleveland-dot-dot"
                    data-item-id={it.id}
                    data-series="after"
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${aria} (${afterLabel})`}
                    cx={it.afterX}
                    cy={it.afterY}
                    r={isHovered ? dotRadius + 1 : dotRadius}
                    fill={it.afterColor}
                    fillOpacity={isDim}
                    stroke={it.afterColor}
                    strokeWidth={1}
                    onMouseEnter={() => setHoveredId(it.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onFocus={() => setHoveredId(it.id)}
                    onBlur={() => setHoveredId(null)}
                    onClick={() => {
                      if (onItemClick) {
                        onItemClick({
                          item: {
                            id: it.id,
                            label: it.label,
                            before: it.before,
                            after: it.after,
                          },
                          layout: it,
                          series: 'after',
                        });
                      }
                    }}
                  />
                  {showValueLabels ? (
                    <g data-section="chart-cleveland-dot-value-texts">
                      <text
                        data-section="chart-cleveland-dot-value-text"
                        data-item-id={it.id}
                        data-series="before"
                        x={
                          orientation === 'horizontal'
                            ? it.beforeX
                            : it.beforeX + (it.beforeX <= it.afterX ? -8 : 8)
                        }
                        y={
                          orientation === 'horizontal'
                            ? it.beforeY - 8
                            : it.beforeY + 3
                        }
                        textAnchor={
                          orientation === 'horizontal'
                            ? 'middle'
                            : it.beforeX <= it.afterX
                              ? 'end'
                              : 'start'
                        }
                        fontSize={10}
                        fill={it.beforeColor}
                      >
                        {fmtValue(it.before)}
                      </text>
                      <text
                        data-section="chart-cleveland-dot-value-text"
                        data-item-id={it.id}
                        data-series="after"
                        x={
                          orientation === 'horizontal'
                            ? it.afterX
                            : it.afterX + (it.afterX >= it.beforeX ? 8 : -8)
                        }
                        y={
                          orientation === 'horizontal'
                            ? it.afterY + 14
                            : it.afterY + 3
                        }
                        textAnchor={
                          orientation === 'horizontal'
                            ? 'middle'
                            : it.afterX >= it.beforeX
                              ? 'start'
                              : 'end'
                        }
                        fontSize={10}
                        fill={it.afterColor}
                      >
                        {fmtValue(it.after)}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>

        {showTooltip && hoveredId ? (() => {
          const it = layout.items.find((x) => x.id === hoveredId);
          if (!it) return null;
          const ax = (it.beforeX + it.afterX) / 2;
          const ay = (it.beforeY + it.afterY) / 2;
          const tx = Math.min(Math.max(ax + 8, 0), width - 180);
          const ty = Math.min(Math.max(ay - 36, 0), height - 60);
          const arrow =
            it.direction === 'up' ? '+' : it.direction === 'down' ? '-' : '=';
          return (
            <div
              data-section="chart-cleveland-dot-tooltip"
              data-item-id={it.id}
              className="pointer-events-none absolute z-10 rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-cleveland-dot-tooltip-label"
                className="font-medium"
              >
                {fmtCategory({
                  id: it.id,
                  label: it.label,
                  before: it.before,
                  after: it.after,
                })}
              </div>
              <div
                data-section="chart-cleveland-dot-tooltip-before"
                className="text-slate-600"
              >
                {beforeLabel}: {fmtValue(it.before)}
              </div>
              <div
                data-section="chart-cleveland-dot-tooltip-after"
                className="text-slate-600"
              >
                {afterLabel}: {fmtValue(it.after)}
              </div>
              <div
                data-section="chart-cleveland-dot-tooltip-delta"
                className="text-slate-500"
              >
                {arrow} {fmtValue(it.delta)} ({it.direction})
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend ? (
        <ul
          data-section="chart-cleveland-dot-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          <li
            data-section="chart-cleveland-dot-legend-item"
            data-series="before"
          >
            <span className="flex items-center gap-1">
              <span
                data-section="chart-cleveland-dot-legend-swatch"
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: beforeColor }}
              />
              <span data-section="chart-cleveland-dot-legend-label">
                {beforeLabel}
              </span>
            </span>
          </li>
          <li data-section="chart-cleveland-dot-legend-item" data-series="after">
            <span className="flex items-center gap-1">
              <span
                data-section="chart-cleveland-dot-legend-swatch"
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: afterColor }}
              />
              <span data-section="chart-cleveland-dot-legend-label">
                {afterLabel}
              </span>
            </span>
          </li>
        </ul>
      ) : null}
    </div>
  );
});

ChartClevelandDot.displayName = 'ChartClevelandDot';
