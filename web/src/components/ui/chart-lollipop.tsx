import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LOLLIPOP_WIDTH = 560;
export const DEFAULT_CHART_LOLLIPOP_HEIGHT = 320;
export const DEFAULT_CHART_LOLLIPOP_PADDING = 40;
export const DEFAULT_CHART_LOLLIPOP_TICK_COUNT = 5;
export const DEFAULT_CHART_LOLLIPOP_HEAD_RADIUS = 5;
export const DEFAULT_CHART_LOLLIPOP_STICK_WIDTH = 1.5;
export const DEFAULT_CHART_LOLLIPOP_BASELINE = 0;
export const DEFAULT_CHART_LOLLIPOP_OPACITY = 0.95;
export const DEFAULT_CHART_LOLLIPOP_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LOLLIPOP_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LOLLIPOP_ORIENTATION = 'vertical';
export const DEFAULT_CHART_LOLLIPOP_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#dc2626',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#7c3aed',
  '#0d9488',
];

export type ChartLollipopOrientation = 'vertical' | 'horizontal';
export type ChartLollipopSortOrder = 'asc' | 'desc';

export interface ChartLollipopItem {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export interface ChartLollipopLayoutItem {
  id: string;
  label: string;
  value: number;
  color: string;
  index: number;
  originalIndex: number;
  centerX: number;
  centerY: number;
  headX: number;
  headY: number;
  baselineX: number;
  baselineY: number;
  stickX1: number;
  stickY1: number;
  stickX2: number;
  stickY2: number;
  isAboveBaseline: boolean;
}

export interface ComputeLollipopLayoutResult {
  items: ChartLollipopLayoutItem[];
  ticks: { value: number; position: number }[];
  valueMin: number;
  valueMax: number;
  baseline: number;
  orientation: ChartLollipopOrientation;
  innerWidth: number;
  innerHeight: number;
  bandWidth: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getLollipopDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LOLLIPOP_PALETTE[0]!;
  }
  return DEFAULT_CHART_LOLLIPOP_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LOLLIPOP_PALETTE.length
  ]!;
}

export function getLollipopFiniteItems(
  items: readonly ChartLollipopItem[],
): ChartLollipopItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (it) => it && typeof it.id === 'string' && isFiniteNumber(it.value),
  );
}

export function getLollipopBounds(
  items: readonly ChartLollipopItem[],
  baseline: number = DEFAULT_CHART_LOLLIPOP_BASELINE,
): { min: number; max: number } {
  const finite = getLollipopFiniteItems(items);
  if (finite.length === 0) {
    const b = isFiniteNumber(baseline) ? baseline : 0;
    return { min: b - 0.5, max: b + 0.5 };
  }
  let min = isFiniteNumber(baseline) ? baseline : 0;
  let max = min;
  for (const it of finite) {
    if (it.value < min) min = it.value;
    if (it.value > max) max = it.value;
  }
  if (min === max) {
    return { min: min - 0.5, max: max + 0.5 };
  }
  return { min, max };
}

export function getLollipopTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(2, Math.floor(count ?? DEFAULT_CHART_LOLLIPOP_TICK_COUNT));
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

export function sortLollipopItems(
  items: readonly ChartLollipopItem[],
  order?: ChartLollipopSortOrder,
): { item: ChartLollipopItem; originalIndex: number }[] {
  const indexed = items.map((item, originalIndex) => ({ item, originalIndex }));
  if (order === 'asc') {
    indexed.sort(
      (a, b) =>
        a.item.value - b.item.value || a.originalIndex - b.originalIndex,
    );
  } else if (order === 'desc') {
    indexed.sort(
      (a, b) =>
        b.item.value - a.item.value || a.originalIndex - b.originalIndex,
    );
  }
  return indexed;
}

export interface ComputeLollipopLayoutInput {
  items: readonly ChartLollipopItem[];
  orientation?: ChartLollipopOrientation;
  baseline?: number;
  sortOrder?: ChartLollipopSortOrder;
  valueMin?: number;
  valueMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLollipopLayout(
  input: ComputeLollipopLayoutInput,
): ComputeLollipopLayoutResult {
  const orientation: ChartLollipopOrientation =
    input.orientation ?? DEFAULT_CHART_LOLLIPOP_ORIENTATION;
  const baseline = isFiniteNumber(input.baseline)
    ? input.baseline
    : DEFAULT_CHART_LOLLIPOP_BASELINE;
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeLollipopLayoutResult = {
    items: [],
    ticks: [],
    valueMin: 0,
    valueMax: 1,
    baseline,
    orientation,
    innerWidth,
    innerHeight,
    bandWidth: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!input.items || input.items.length === 0) return empty;

  const finite = getLollipopFiniteItems(input.items);
  if (finite.length === 0) return empty;

  const bounds = getLollipopBounds(finite, baseline);
  let vMin = isFiniteNumber(input.valueMin) ? input.valueMin : bounds.min;
  let vMax = isFiniteNumber(input.valueMax) ? input.valueMax : bounds.max;
  if (vMax < vMin) [vMin, vMax] = [vMax, vMin];
  if (vMin === vMax) {
    vMin -= 0.5;
    vMax += 0.5;
  }
  const range = vMax - vMin;

  const sorted = sortLollipopItems(finite, input.sortOrder);
  const N = sorted.length;
  const catAxisLength = orientation === 'vertical' ? innerWidth : innerHeight;
  const bandWidth = catAxisLength / N;

  function valueToPos(value: number): number {
    const clamped = value < vMin ? vMin : value > vMax ? vMax : value;
    return (clamped - vMin) / range;
  }

  const baselinePos = valueToPos(baseline);

  const items: ChartLollipopLayoutItem[] = sorted.map((entry, i) => {
    const { item, originalIndex } = entry;
    const color =
      item.color ?? getLollipopDefaultColor(originalIndex);
    const valuePos = valueToPos(item.value);
    const isAboveBaseline = item.value >= baseline;

    if (orientation === 'vertical') {
      const centerX = padding + bandWidth * (i + 0.5);
      const baselineY = padding + innerHeight - baselinePos * innerHeight;
      const headY = padding + innerHeight - valuePos * innerHeight;
      const centerY = (baselineY + headY) / 2;
      return {
        id: item.id,
        label: item.label,
        value: item.value,
        color,
        index: i,
        originalIndex,
        centerX,
        centerY,
        headX: centerX,
        headY,
        baselineX: centerX,
        baselineY,
        stickX1: centerX,
        stickY1: baselineY,
        stickX2: centerX,
        stickY2: headY,
        isAboveBaseline,
      };
    }
    const centerY = padding + bandWidth * (i + 0.5);
    const baselineX = padding + baselinePos * innerWidth;
    const headX = padding + valuePos * innerWidth;
    const centerX = (baselineX + headX) / 2;
    return {
      id: item.id,
      label: item.label,
      value: item.value,
      color,
      index: i,
      originalIndex,
      centerX,
      centerY,
      headX,
      headY: centerY,
      baselineX,
      baselineY: centerY,
      stickX1: baselineX,
      stickY1: centerY,
      stickX2: headX,
      stickY2: centerY,
      isAboveBaseline,
    };
  });

  const tickCount = input.tickCount ?? DEFAULT_CHART_LOLLIPOP_TICK_COUNT;
  const ticks = getLollipopTicks(vMin, vMax, tickCount).map((t) => ({
    value: t.value,
    position:
      orientation === 'vertical'
        ? padding + innerHeight - t.position * innerHeight
        : padding + t.position * innerWidth,
  }));

  return {
    items,
    ticks,
    valueMin: vMin,
    valueMax: vMax,
    baseline,
    orientation,
    innerWidth,
    innerHeight,
    bandWidth,
  };
}

export function describeLollipopChart(
  items: readonly ChartLollipopItem[],
  formatValue?: (n: number) => string,
): string {
  const finite = getLollipopFiniteItems(items);
  if (finite.length === 0) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  let min = finite[0]!.value;
  let max = min;
  let minLabel = finite[0]!.label;
  let maxLabel = finite[0]!.label;
  for (const it of finite) {
    if (it.value < min) {
      min = it.value;
      minLabel = it.label;
    }
    if (it.value > max) {
      max = it.value;
      maxLabel = it.label;
    }
  }
  return `Lollipop chart with ${finite.length} categories. Range ${fmt(min)} (${minLabel}) to ${fmt(max)} (${maxLabel}).`;
}

export interface ChartLollipopItemClick {
  item: ChartLollipopItem;
  layout: ChartLollipopLayoutItem;
}

export interface ChartLollipopProps {
  items: readonly ChartLollipopItem[];
  orientation?: ChartLollipopOrientation;
  baseline?: number;
  sortOrder?: ChartLollipopSortOrder;
  valueMin?: number;
  valueMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  headRadius?: number;
  stickWidth?: number;
  markOpacity?: number;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showCategoryLabels?: boolean;
  showValueLabels?: boolean;
  showBaseline?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatCategory?: (item: ChartLollipopItem) => string;
  valueLabel?: string;
  categoryLabel?: string;
  onItemClick?: (info: ChartLollipopItemClick) => void;
  style?: CSSProperties;
}

export const ChartLollipop = forwardRef(function ChartLollipop(
  {
    items,
    orientation = DEFAULT_CHART_LOLLIPOP_ORIENTATION,
    baseline = DEFAULT_CHART_LOLLIPOP_BASELINE,
    sortOrder,
    valueMin,
    valueMax,
    width = DEFAULT_CHART_LOLLIPOP_WIDTH,
    height = DEFAULT_CHART_LOLLIPOP_HEIGHT,
    padding = DEFAULT_CHART_LOLLIPOP_PADDING,
    tickCount = DEFAULT_CHART_LOLLIPOP_TICK_COUNT,
    headRadius = DEFAULT_CHART_LOLLIPOP_HEAD_RADIUS,
    stickWidth = DEFAULT_CHART_LOLLIPOP_STICK_WIDTH,
    markOpacity = DEFAULT_CHART_LOLLIPOP_OPACITY,
    gridColor = DEFAULT_CHART_LOLLIPOP_GRID_COLOR,
    axisColor = DEFAULT_CHART_LOLLIPOP_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showCategoryLabels = true,
    showValueLabels = false,
    showBaseline = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Lollipop chart',
    ariaDescription,
    formatValue,
    formatCategory,
    valueLabel,
    categoryLabel,
    onItemClick,
    style,
  }: ChartLollipopProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const reactId = useId();
  const ariaDescId = `${reactId}-desc`;
  const fmtValue = useCallback(
    (n: number) => (formatValue ? formatValue(n) : String(n)),
    [formatValue],
  );
  const fmtCategory = useCallback(
    (it: ChartLollipopItem) => (formatCategory ? formatCategory(it) : it.label),
    [formatCategory],
  );

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLollipopLayout({
        items,
        orientation,
        baseline,
        ...(sortOrder ? { sortOrder } : {}),
        ...(valueMin !== undefined ? { valueMin } : {}),
        ...(valueMax !== undefined ? { valueMax } : {}),
        width,
        height,
        padding,
        tickCount,
      }),
    [
      items,
      orientation,
      baseline,
      sortOrder,
      valueMin,
      valueMax,
      width,
      height,
      padding,
      tickCount,
    ],
  );

  const description =
    ariaDescription ?? describeLollipopChart(items, fmtValue);

  const baselinePixel = useMemo(() => {
    if (layout.items.length === 0) return null;
    return orientation === 'vertical'
      ? layout.items[0]!.baselineY
      : layout.items[0]!.baselineX;
  }, [layout, orientation]);

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
      data-section="chart-lollipop"
      data-orientation={orientation}
      data-baseline={baseline}
      data-category-count={items.length}
      data-finite-count={layout.items.length}
      data-sort-order={sortOrder ?? 'none'}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-lollipop-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-lollipop-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-lollipop-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid && layout.ticks.length > 0 ? (
            <g data-section="chart-lollipop-grid">
              {layout.ticks.map((t) => {
                const isV = orientation === 'vertical';
                return (
                  <line
                    key={`grid-${t.value}`}
                    data-section="chart-lollipop-grid-line"
                    x1={isV ? padding : t.position}
                    y1={isV ? t.position : padding}
                    x2={isV ? padding + layout.innerWidth : t.position}
                    y2={isV ? t.position : padding + layout.innerHeight}
                    stroke={gridColor}
                    strokeDasharray="2 4"
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showBaseline && baselinePixel !== null ? (
            <line
              data-section="chart-lollipop-baseline"
              data-baseline-value={baseline}
              x1={orientation === 'vertical' ? padding : baselinePixel}
              y1={orientation === 'vertical' ? baselinePixel : padding}
              x2={
                orientation === 'vertical'
                  ? padding + layout.innerWidth
                  : baselinePixel
              }
              y2={
                orientation === 'vertical'
                  ? baselinePixel
                  : padding + layout.innerHeight
              }
              stroke={axisColor}
              strokeWidth={1}
            />
          ) : null}

          {showAxis ? (
            <g data-section="chart-lollipop-axes">
              <line
                data-section="chart-lollipop-axis"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.ticks.length > 0 ? (
                <g data-section="chart-lollipop-ticks">
                  {layout.ticks.map((t) => {
                    const isV = orientation === 'vertical';
                    const tx = isV ? padding : t.position;
                    const ty = isV ? t.position : padding + layout.innerHeight;
                    return (
                      <g key={`tick-${t.value}`} data-section="chart-lollipop-tick">
                        <line
                          x1={tx}
                          y1={ty}
                          x2={isV ? tx - 4 : tx}
                          y2={isV ? ty : ty + 4}
                          stroke={axisColor}
                          strokeWidth={1}
                        />
                        <text
                          data-section="chart-lollipop-tick-label"
                          data-tick-value={t.value}
                          x={isV ? tx - 6 : tx}
                          y={isV ? ty + 3 : ty + 14}
                          textAnchor={isV ? 'end' : 'middle'}
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
                  data-section="chart-lollipop-value-label"
                  x={
                    orientation === 'vertical'
                      ? padding - 28
                      : padding + layout.innerWidth / 2
                  }
                  y={
                    orientation === 'vertical'
                      ? padding + layout.innerHeight / 2
                      : padding + layout.innerHeight + 30
                  }
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  transform={
                    orientation === 'vertical'
                      ? `rotate(-90 ${padding - 28} ${padding + layout.innerHeight / 2})`
                      : undefined
                  }
                >
                  {valueLabel}
                </text>
              ) : null}
              {categoryLabel ? (
                <text
                  data-section="chart-lollipop-category-label"
                  x={
                    orientation === 'vertical'
                      ? padding + layout.innerWidth / 2
                      : padding + layout.innerWidth + 24
                  }
                  y={
                    orientation === 'vertical'
                      ? padding + layout.innerHeight + 30
                      : padding + layout.innerHeight / 2
                  }
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                >
                  {categoryLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          <g data-section="chart-lollipop-items">
            {layout.items.map((it) => {
              const isHovered = hoveredId === it.id;
              const isDim = hoveredId !== null && !isHovered ? 0.35 : markOpacity;
              const aria = `${fmtCategory({ id: it.id, label: it.label, value: it.value })}: ${fmtValue(it.value)}`;
              return (
                <g
                  key={it.id}
                  data-section="chart-lollipop-item"
                  data-item-id={it.id}
                  data-item-index={it.index}
                  data-item-original-index={it.originalIndex}
                  data-item-color={it.color}
                  data-item-value={it.value}
                  data-above-baseline={it.isAboveBaseline ? 'true' : 'false'}
                  data-hovered={isHovered ? 'true' : 'false'}
                  style={{ color: it.color }}
                >
                  <line
                    data-section="chart-lollipop-stick"
                    data-item-id={it.id}
                    x1={it.stickX1}
                    y1={it.stickY1}
                    x2={it.stickX2}
                    y2={it.stickY2}
                    stroke={it.color}
                    strokeOpacity={isDim}
                    strokeWidth={isHovered ? stickWidth + 0.8 : stickWidth}
                    strokeLinecap="round"
                  />
                  <circle
                    data-section="chart-lollipop-head"
                    data-item-id={it.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={aria}
                    cx={it.headX}
                    cy={it.headY}
                    r={isHovered ? headRadius + 1 : headRadius}
                    fill={it.color}
                    fillOpacity={isDim}
                    stroke={it.color}
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
                            value: it.value,
                            color: it.color,
                          },
                          layout: it,
                        });
                      }
                    }}
                  />
                  {showValueLabels ? (
                    <text
                      data-section="chart-lollipop-value-text"
                      data-item-id={it.id}
                      x={
                        orientation === 'vertical'
                          ? it.headX
                          : it.headX + (it.isAboveBaseline ? 8 : -8)
                      }
                      y={
                        orientation === 'vertical'
                          ? it.headY + (it.isAboveBaseline ? -8 : 14)
                          : it.headY + 3
                      }
                      textAnchor={
                        orientation === 'vertical'
                          ? 'middle'
                          : it.isAboveBaseline
                            ? 'start'
                            : 'end'
                      }
                      fontSize={10}
                      fill="currentColor"
                    >
                      {fmtValue(it.value)}
                    </text>
                  ) : null}
                  {showCategoryLabels ? (
                    <text
                      data-section="chart-lollipop-category-text"
                      data-item-id={it.id}
                      x={
                        orientation === 'vertical'
                          ? it.centerX
                          : padding - 6
                      }
                      y={
                        orientation === 'vertical'
                          ? padding + layout.innerHeight + 14
                          : it.centerY + 3
                      }
                      textAnchor={orientation === 'vertical' ? 'middle' : 'end'}
                      fontSize={11}
                      fill="currentColor"
                    >
                      {it.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>

        {showTooltip && hoveredId ? (() => {
          const it = layout.items.find((x) => x.id === hoveredId);
          if (!it) return null;
          const tx = Math.min(Math.max(it.headX + 8, 0), width - 140);
          const ty = Math.min(Math.max(it.headY - 30, 0), height - 36);
          return (
            <div
              data-section="chart-lollipop-tooltip"
              data-item-id={it.id}
              className="pointer-events-none absolute z-10 rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div data-section="chart-lollipop-tooltip-label" className="font-medium">
                {fmtCategory({ id: it.id, label: it.label, value: it.value })}
              </div>
              <div data-section="chart-lollipop-tooltip-value" className="text-slate-600">
                {fmtValue(it.value)}
              </div>
            </div>
          );
        })() : null}
      </div>
    </div>
  );
});

ChartLollipop.displayName = 'ChartLollipop';
